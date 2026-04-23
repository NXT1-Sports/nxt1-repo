/**
 * @fileoverview Vector Memory Service — MongoDB Atlas Vector Search
 * @module @nxt1/backend/modules/agent/memory
 *
 * Long-term semantic memory for Agent X, backed by MongoDB Atlas Vector Search.
 * Stores embedded memories so Agent X can retrieve relevant past context
 * before every interaction using cosine similarity over dense embeddings.
 *
 * Architecture:
 * - Embeddings generated via OpenAI text-embedding-3-small (1536 dims).
 * - Stored in MongoDB `agentMemories` collection alongside other agent data.
 * - Retrieved via `$vectorSearch` aggregation (Atlas Search index required).
 *
 * Atlas Search Index (create in Atlas UI or via API on the `agentMemories` collection):
 * {
 *   "fields": [
 *     { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
 *     { "type": "filter", "path": "userId" },
 *     { "type": "filter", "path": "category" }
 *   ]
 * }
 *
 * @example
 * ```ts
 * const memory = new VectorMemoryService(llmService);
 * await memory.store(userId, 'I want to focus on SEC schools', 'preference');
 * const ctx = await memory.recall(userId, 'Which conferences should I target?', 5);
 * ```
 */

import { model, Schema } from 'mongoose';
import type {
  AgentMemoryCategory,
  AgentMemoryEntry,
  AgentMemoryRecallOptions,
  AgentMemoryTarget,
  AgentRetrievedMemories,
} from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { logger } from '../../../utils/logger.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** The MongoDB Atlas Search index name for the agentMemories collection. */
export const VECTOR_INDEX_NAME = 'agent_memory_vector_index';

/** Embedding dimension for text-embedding-3-small. */
export const EMBEDDING_DIMS = 1536;

/** Default number of candidates to scan in the vector index (higher = better recall, slower). */
const DEFAULT_NUM_CANDIDATES = 150;

/** Default top-K results to return. */
const DEFAULT_TOP_K = 5;

/** TTL for memories: 90 days. */
const MEMORY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// ─── Mongoose Schema ─────────────────────────────────────────────────────────

interface AgentMemoryDocument {
  _id: string;
  userId: string;
  target: AgentMemoryTarget;
  teamId?: string;
  organizationId?: string;
  content: string;
  embedding: number[];
  category: AgentMemoryCategory;
  metadata?: Record<string, unknown>;
  createdAt: string;
  expiresAt: Date;
}

interface StoreMemoryOptions {
  target?: AgentMemoryTarget;
  teamId?: string;
  organizationId?: string;
  expiresAt?: Date;
}

interface ScoredMemoryDocument extends AgentMemoryDocument {
  score: number;
}

const EMPTY_RETRIEVED_MEMORIES: AgentRetrievedMemories = {
  user: [],
  team: [],
  organization: [],
};

const AgentMemorySchema = new Schema<AgentMemoryDocument>(
  {
    userId: { type: String, required: true, index: true },
    target: {
      type: String,
      enum: ['user', 'team', 'organization'],
      required: true,
      default: 'user',
      index: true,
    },
    teamId: { type: String, index: true },
    organizationId: { type: String, index: true },
    content: { type: String, required: true },
    // select: false prevents loading large float arrays on every non-vector query
    embedding: { type: [Number], required: true, select: false },
    category: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: String, required: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + MEMORY_TTL_MS),
    },
  },
  { versionKey: false }
);

// TTL index — MongoDB auto-deletes documents once expiresAt is in the past
AgentMemorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Compound index for per-user + per-category listing
AgentMemorySchema.index({ userId: 1, category: 1 });
AgentMemorySchema.index({ userId: 1, target: 1, teamId: 1, organizationId: 1, category: 1 });

export const AgentMemoryModel = model<AgentMemoryDocument>('AgentMemory', AgentMemorySchema);

// ─── Service ──────────────────────────────────────────────────────────────────

export class VectorMemoryService {
  private readonly llm: OpenRouterService;

  constructor(llm: OpenRouterService) {
    this.llm = llm;
  }

  /**
   * Embed and store a piece of text as a long-term memory.
   * Generates a 1536-dim embedding via OpenAI and persists it to MongoDB.
   */
  async store(
    userId: string,
    content: string,
    category: AgentMemoryCategory,
    metadata?: Record<string, unknown>,
    options: StoreMemoryOptions = {}
  ): Promise<AgentMemoryEntry> {
    const target = options.target ?? 'user';

    if (target === 'team' && !options.teamId) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'teamId is required when storing a team-scoped memory'
      );
    }

    if (target === 'organization' && !options.organizationId) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        'organizationId is required when storing an organization-scoped memory'
      );
    }

    const embedding = await this.llm.embed(content);

    const doc = await AgentMemoryModel.create({
      userId,
      target,
      teamId: options.teamId,
      organizationId: options.organizationId,
      content,
      embedding: Array.from(embedding),
      category,
      metadata,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt ?? new Date(Date.now() + MEMORY_TTL_MS),
    });

    logger.debug('[VectorMemory] Stored memory', {
      userId,
      target,
      teamId: options.teamId,
      organizationId: options.organizationId,
      category,
      dims: embedding.length,
    });

    return this.docToEntry(doc);
  }

  /**
   * Semantic search: find the top-K most relevant memories for a query.
   *
   * Uses MongoDB Atlas `$vectorSearch` aggregation for cosine similarity.
   * Gracefully returns an empty array if the Atlas index is not yet configured,
   * so the rest of the agent pipeline is never blocked by missing infrastructure.
   */
  async recall(
    userId: string,
    query: string,
    topK: number = DEFAULT_TOP_K,
    options: AgentMemoryRecallOptions = {}
  ): Promise<readonly AgentMemoryEntry[]> {
    const memories = await this.recallByScope(userId, query, {
      ...options,
      targets: ['user'],
      perTargetLimit: topK,
    });

    return memories.user;
  }

  async recallByScope(
    userId: string,
    query: string,
    options: AgentMemoryRecallOptions = {}
  ): Promise<AgentRetrievedMemories> {
    let queryEmbedding: readonly number[];

    try {
      queryEmbedding = await this.llm.embed(query);
    } catch (err) {
      logger.warn('[VectorMemory] Embedding failed during recall — skipping memory lookup', {
        userId,
        error: String(err),
      });
      return EMPTY_RETRIEVED_MEMORIES;
    }

    const perTargetLimit = Math.min(Math.max(options.perTargetLimit ?? DEFAULT_TOP_K, 1), 10);
    const requestedTargets = new Set(options.targets ?? ['user', 'team', 'organization']);

    const [userMemories, teamMemories, organizationMemories] = await Promise.all([
      requestedTargets.has('user')
        ? this.recallForTarget(userId, queryEmbedding, 'user', perTargetLimit, options)
        : Promise.resolve([]),
      requestedTargets.has('team') && options.teamId
        ? this.recallForTarget(userId, queryEmbedding, 'team', perTargetLimit, options)
        : Promise.resolve([]),
      requestedTargets.has('organization') && options.organizationId
        ? this.recallForTarget(userId, queryEmbedding, 'organization', perTargetLimit, options)
        : Promise.resolve([]),
    ]);

    return {
      user: userMemories,
      team: teamMemories,
      organization: organizationMemories,
    };
  }

  private async recallForTarget(
    userId: string,
    queryEmbedding: readonly number[],
    target: AgentMemoryTarget,
    topK: number,
    options: AgentMemoryRecallOptions
  ): Promise<readonly AgentMemoryEntry[]> {
    const filter: Record<string, unknown> = { userId, target };

    if (options.category) {
      filter['category'] = options.category;
    }

    if (target === 'team') {
      filter['teamId'] = options.teamId;
    }

    if (target === 'organization') {
      filter['organizationId'] = options.organizationId;
    }

    try {
      const results = await AgentMemoryModel.aggregate<ScoredMemoryDocument>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: 'embedding',
            queryVector: Array.from(queryEmbedding),
            numCandidates: Math.min(Math.max(DEFAULT_NUM_CANDIDATES, topK * 10), 500),
            limit: topK,
            filter,
          },
        },
        {
          $project: {
            _id: 1,
            userId: 1,
            target: 1,
            teamId: 1,
            organizationId: 1,
            content: 1,
            category: 1,
            metadata: 1,
            createdAt: 1,
            expiresAt: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ]);

      logger.debug('[VectorMemory] Recalled memories', {
        userId,
        target,
        count: results.length,
        topScore: results[0]?.score,
      });

      return results.map((doc) => this.docToEntry(doc));
    } catch (err) {
      logger.warn(
        '[VectorMemory] $vectorSearch failed — Atlas index may not be configured. Returning empty.',
        { userId, target, error: String(err) }
      );
      return [];
    }
  }

  /**
   * Delete a specific memory by ID, scoped to a user for safety.
   * Returns true if a document was deleted, false if not found.
   */
  async deleteById(memoryId: string, userId: string): Promise<boolean> {
    const result = await AgentMemoryModel.deleteOne({ _id: memoryId, userId });
    const deleted = result.deletedCount > 0;
    logger.info('[VectorMemory] Delete memory by ID', { memoryId, userId, deleted });
    return deleted;
  }

  /**
   * Delete all memories for a user (GDPR erasure / account deletion).
   */
  async deleteAll(userId: string): Promise<void> {
    const result = await AgentMemoryModel.deleteMany({ userId });
    logger.info('[VectorMemory] Deleted all memories', { userId, count: result.deletedCount });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private docToEntry(
    doc: Pick<
      AgentMemoryDocument,
      | '_id'
      | 'userId'
      | 'target'
      | 'teamId'
      | 'organizationId'
      | 'content'
      | 'category'
      | 'metadata'
      | 'createdAt'
      | 'expiresAt'
    >
  ): AgentMemoryEntry {
    return {
      id: String(doc._id),
      userId: doc.userId,
      target: doc.target,
      teamId: doc.teamId,
      organizationId: doc.organizationId,
      content: doc.content,
      category: doc.category,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt?.toISOString(),
    };
  }
}
