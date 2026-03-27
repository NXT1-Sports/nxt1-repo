/**
 * @fileoverview Semantic Cache Service — MongoDB Atlas Vector Search
 * @module @nxt1/backend/modules/agent/memory
 *
 * Global semantic cache for Agent X operations. Uses MongoDB Atlas Vector
 * Search to detect when a new user intent is semantically identical to a
 * recently answered question, bypassing the full Planner → Coordinator DAG.
 *
 * **Why a separate collection?**
 * The existing `VectorMemoryService` stores per-user private memories with
 * 90-day TTL. The semantic cache is a global, shared, short-lived store
 * (24h TTL) — mixing them would pollute user memory and break isolation.
 *
 * Atlas Search Index (create on the `agentSemanticCache` collection):
 * {
 *   "fields": [
 *     { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" }
 *   ]
 * }
 *
 * @example
 * ```ts
 * const cache = new SemanticCacheService(llm);
 * const hit = await cache.check('What is the D1 GPA requirement?');
 * if (hit) return hit.cachedResult; // Skip the entire DAG
 *
 * // After DAG execution:
 * await cache.store('What is the D1 GPA requirement?', result);
 * ```
 */

import { model, Schema } from 'mongoose';
import type { AgentOperationResult, AgentUserContext } from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { LLMMessage } from '../llm/llm.types.js';
import { logger } from '../../../utils/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** The MongoDB Atlas Search index name for the semantic cache collection. */
export const CACHE_VECTOR_INDEX_NAME = 'agent_semantic_cache_vector_index';

/**
 * Minimum cosine similarity score to consider a cache hit.
 * 0.98 is extremely strict — only near-identical prompts match.
 * This avoids returning stale or misleading cached responses.
 */
const SIMILARITY_THRESHOLD = 0.98;

/** Number of vector index candidates to scan (higher = better recall). */
const NUM_CANDIDATES = 100;

/** TTL for cached entries: 24 hours. Keeps recruiting rules / compliance data fresh. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Mongoose Schema ─────────────────────────────────────────────────────────

interface SemanticCacheDocument {
  _id: string;
  /** The original user intent (for debugging / logging). */
  intent: string;
  /** 1536-dim embedding of the intent. */
  embedding: number[];
  /** The full cached AgentOperationResult as a JSON string. */
  cachedResult: string;
  /** ISO timestamp of when this entry was created. */
  createdAt: string;
  /** MongoDB TTL expiry — auto-deleted after 24h. */
  expiresAt: Date;
}

const SemanticCacheSchema = new Schema<SemanticCacheDocument>(
  {
    intent: { type: String, required: true },
    embedding: { type: [Number], required: true, select: false },
    cachedResult: { type: String, required: true },
    createdAt: { type: String, required: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + CACHE_TTL_MS),
    },
  },
  { versionKey: false }
);

// TTL index — MongoDB auto-deletes documents once expiresAt is in the past
SemanticCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SemanticCacheModel = model<SemanticCacheDocument>(
  'AgentSemanticCache',
  SemanticCacheSchema
);

// ─── Service ──────────────────────────────────────────────────────────────────

export interface SemanticCacheHit {
  /** The cached operation result. */
  readonly result: AgentOperationResult;
  /** Cosine similarity score (0–1). */
  readonly score: number;
  /** The original cached intent (for logging). */
  readonly cachedIntent: string;
}

export class SemanticCacheService {
  private readonly llm: OpenRouterService;

  constructor(llm: OpenRouterService) {
    this.llm = llm;
  }

  /**
   * Check if a semantically equivalent intent has been recently answered.
   *
   * Generates an embedding for the incoming intent, runs a $vectorSearch
   * against the cache collection, and returns the cached result if the
   * similarity score exceeds the strict threshold.
   *
   * @returns The cached result if a high-confidence match exists, or null.
   */
  async check(intent: string): Promise<SemanticCacheHit | null> {
    let queryEmbedding: readonly number[];

    try {
      queryEmbedding = await this.llm.embed(intent);
    } catch (err) {
      logger.warn('[SemanticCache] Embedding failed during cache check — skipping', {
        error: String(err),
      });
      return null;
    }

    try {
      const results = await SemanticCacheModel.aggregate<SemanticCacheDocument & { score: number }>(
        [
          {
            $vectorSearch: {
              index: CACHE_VECTOR_INDEX_NAME,
              path: 'embedding',
              queryVector: Array.from(queryEmbedding),
              numCandidates: NUM_CANDIDATES,
              limit: 1,
            },
          },
          {
            $project: {
              _id: 1,
              intent: 1,
              cachedResult: 1,
              createdAt: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ]
      );

      const top = results[0];
      if (!top || top.score < SIMILARITY_THRESHOLD) {
        logger.debug('[SemanticCache] Cache miss', {
          topScore: top?.score ?? 0,
          threshold: SIMILARITY_THRESHOLD,
        });
        return null;
      }

      // Parse the stored result — isolated catch so a corrupt entry
      // doesn't masquerade as a $vectorSearch failure.
      let parsed: AgentOperationResult;
      try {
        parsed = JSON.parse(top.cachedResult) as AgentOperationResult;
      } catch {
        logger.warn('[SemanticCache] Corrupt cache entry — ignoring', {
          cachedIntent: top.intent.slice(0, 80),
        });
        return null;
      }

      logger.info('[SemanticCache] Cache HIT — bypassing DAG', {
        score: top.score,
        cachedIntent: top.intent.slice(0, 80),
      });

      return {
        result: parsed,
        score: top.score,
        cachedIntent: top.intent,
      };
    } catch (err) {
      // Gracefully degrade if Atlas Vector Search is not configured
      logger.warn(
        '[SemanticCache] $vectorSearch failed — Atlas index may not be configured. Skipping cache.',
        { error: String(err) }
      );
      return null;
    }
  }

  /**
   * Store a completed operation result in the semantic cache.
   *
   * Only call this for operations that produced a valid, non-error result.
   * The entry auto-expires after 24 hours via MongoDB TTL.
   */
  async store(intent: string, result: AgentOperationResult): Promise<void> {
    try {
      const embedding = await this.llm.embed(intent);

      await SemanticCacheModel.create({
        intent,
        embedding: Array.from(embedding),
        cachedResult: JSON.stringify(result),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      });

      logger.debug('[SemanticCache] Stored cache entry', {
        intent: intent.slice(0, 80),
      });
    } catch (err) {
      // Cache storage is best-effort — never block the main pipeline
      logger.warn('[SemanticCache] Failed to store cache entry', {
        error: String(err),
      });
    }
  }

  /**
   * Personalize a cached response for the current user.
   *
   * Uses a cheap, fast model (`fast` tier = claude-3.5-haiku / gpt-4o-mini)
   * to rewrite the cached summary so it addresses the user by name, references
   * their sport/position/school, and matches their role. The factual content
   * stays identical — only the delivery is personalized.
   *
   * This is the "Synthesizer Pattern": shared global cache + per-user wrapping.
   * Typical latency: ~300-500ms vs. 8-15s for a full DAG execution.
   *
   * @param cachedResult - The original cached AgentOperationResult.
   * @param userContext  - The current user's profile context.
   * @param intent       - The current user's original intent (for tone matching).
   * @returns A personalized copy of the cached result, or the original on failure.
   */
  async personalize(
    cachedResult: AgentOperationResult,
    userContext: AgentUserContext,
    intent: string
  ): Promise<AgentOperationResult> {
    // Build a compact user profile string for the system prompt
    const profileParts: string[] = [
      `Name: ${userContext.displayName}`,
      `Role: ${userContext.role}`,
    ];
    if (userContext.sport) profileParts.push(`Sport: ${userContext.sport}`);
    if (userContext.position) profileParts.push(`Position: ${userContext.position}`);
    if (userContext.school) profileParts.push(`School: ${userContext.school}`);
    if (userContext.graduationYear) profileParts.push(`Class of ${userContext.graduationYear}`);
    if (userContext.state) profileParts.push(`State: ${userContext.state}`);
    if (userContext.coachProgram) profileParts.push(`Program: ${userContext.coachProgram}`);
    if (userContext.coachDivision) profileParts.push(`Division: ${userContext.coachDivision}`);

    const userProfile = profileParts.join(' | ');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          `You are Agent X — The First AI Born in the Locker Room. ` +
          `You have already retrieved the correct factual answer from our sports database. ` +
          `Your ONLY job is to deliver this EXACT factual information to the user in a personalized, ` +
          `conversational way.\n\n` +
          `Rules:\n` +
          `- Do NOT invent new facts, statistics, or advice beyond what is provided.\n` +
          `- Do NOT remove or skip any important information from the original answer.\n` +
          `- Address the user by their first name naturally (not every sentence).\n` +
          `- Reference their sport, position, or school where it makes the response feel tailored.\n` +
          `- Adjust tone for their role: athletes get hype/motivation, coaches get professional/strategic, ` +
          `scouts get analytical, parents get supportive.\n` +
          `- Keep the same approximate length as the original.\n` +
          `- If the original answer contains structured data (lists, tables, stats), preserve the structure.\n\n` +
          `Current User Profile:\n${userProfile}`,
      },
      {
        role: 'user',
        content:
          `The user asked: "${intent}"\n\n` +
          `Here is the factual answer to deliver:\n---\n${cachedResult.summary}\n---\n\n` +
          `Rewrite this answer personalized for the user above. ` +
          `Same facts, same depth, tailored delivery.`,
      },
    ];

    try {
      const startMs = Date.now();

      const completion = await this.llm.complete(messages, {
        tier: 'fast',
        temperature: 0.4,
        maxTokens: 2048,
        telemetryContext: {
          operationId: 'cache-personalizer',
          userId: userContext.userId,
          agentId: 'router',
        },
      });

      const personalizedSummary = completion.content?.trim();
      const latencyMs = Date.now() - startMs;

      if (!personalizedSummary) {
        logger.warn('[SemanticCache] Personalizer returned empty content — using original');
        return cachedResult;
      }

      logger.info('[SemanticCache] Personalized cached response', {
        userId: userContext.userId,
        latencyMs,
        originalLength: cachedResult.summary.length,
        personalizedLength: personalizedSummary.length,
      });

      return {
        ...cachedResult,
        summary: personalizedSummary,
      };
    } catch (err) {
      // Personalizer is best-effort — return the raw cached result on failure
      logger.warn('[SemanticCache] Personalizer failed — returning raw cached response', {
        error: String(err),
        userId: userContext.userId,
      });
      return cachedResult;
    }
  }

  /**
   * Manually invalidate all cached entries (e.g. after a compliance rule update).
   */
  async flush(): Promise<void> {
    const result = await SemanticCacheModel.deleteMany({});
    logger.info('[SemanticCache] Flushed all entries', { count: result.deletedCount });
  }
}
