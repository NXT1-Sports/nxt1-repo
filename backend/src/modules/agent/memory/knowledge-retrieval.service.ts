/**
 * @fileoverview Knowledge Retrieval Service — MongoDB Atlas Vector Search
 * @module @nxt1/backend/modules/agent/memory
 *
 * Retrieval layer for the global domain knowledge base. Uses MongoDB Atlas
 * `$vectorSearch` to find the top-K most relevant knowledge chunks for a
 * given user intent, so Agent X can ground its responses in verified
 * domain data (NCAA rules, compliance calendars, recruiting strategy, etc.).
 *
 * Architecture:
 * ```
 * User Intent (plain text)
 *        │
 *        ▼
 * OpenRouterService.embed()             ← 1536-dim intent vector
 *        │
 *        ▼
 * KnowledgeRetrievalService.retrieve()
 *   ├── $vectorSearch on agentGlobalKnowledge
 *   ├── Optional category filter
 *   ├── Score threshold (0.70 default)
 *   └── Returns top-K ranked chunks
 *        │
 *        ▼
 * Injected into LLM system prompt      ← "Retrieved Knowledge" block
 * ```
 *
 * This service is stateless and safe for concurrent use. It does NOT modify
 * the knowledge base — ingestion is handled by `KnowledgeIngestionService`.
 *
 * @example
 * ```ts
 * const retrieval = new KnowledgeRetrievalService(llm);
 * const results = await retrieval.retrieve('What is the NCAA D1 GPA requirement?', {
 *   topK: 5,
 *   categories: ['ncaa_rules', 'eligibility'],
 * });
 * const promptBlock = retrieval.buildPromptBlock(results);
 * // → "## Retrieved Knowledge\n### NCAA Division I Eligibility ...\n..."
 * ```
 */

import type { KnowledgeCategory, KnowledgeEntry, KnowledgeRetrievalResult } from '@nxt1/core';
import { getGlobalKnowledgeModel, type GlobalKnowledgeDocument } from './global-knowledge.model.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { logger } from '../../../utils/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** The MongoDB Atlas Search index name for the agentGlobalKnowledge collection. */
export const KNOWLEDGE_VECTOR_INDEX_NAME = 'agent_global_knowledge_vector_index';

/** Default minimum cosine similarity score for a chunk to be considered relevant. */
const DEFAULT_SCORE_THRESHOLD = 0.7;

/** Default number of candidates to scan (higher = better recall, slower). */
const DEFAULT_NUM_CANDIDATES = 200;

/** Default top-K results to return. */
const DEFAULT_TOP_K = 5;

/** Maximum top-K to prevent excessive prompt injection. */
const MAX_TOP_K = 15;

// ─── Retrieval Options ───────────────────────────────────────────────────────

export interface KnowledgeRetrievalOptions {
  /** Number of chunks to retrieve (1–15). Default: 5. */
  readonly topK?: number;
  /** Optional category filter — only retrieve from these categories. */
  readonly categories?: readonly KnowledgeCategory[];
  /** Minimum cosine similarity score (0–1). Default: 0.70. */
  readonly scoreThreshold?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class KnowledgeRetrievalService {
  private readonly llm: OpenRouterService;

  constructor(llm: OpenRouterService) {
    this.llm = llm;
  }

  /**
   * Semantic retrieval: find the top-K most relevant knowledge chunks for a query.
   *
   * Uses MongoDB Atlas `$vectorSearch` aggregation for cosine similarity.
   * Gracefully returns an empty array if the Atlas index is not yet configured,
   * so the rest of the agent pipeline is never blocked by missing infrastructure.
   *
   * @param precomputedEmbedding - Optional pre-computed query embedding. When
   * provided (e.g. from BaseAgent which already embedded for skill matching),
   * the embed call is skipped entirely — saving one API round-trip per request.
   */
  async retrieve(
    query: string,
    options: KnowledgeRetrievalOptions = {},
    precomputedEmbedding?: readonly number[]
  ): Promise<readonly KnowledgeRetrievalResult[]> {
    const GlobalKnowledgeModel = getGlobalKnowledgeModel();
    const topK = Math.min(Math.max(1, Math.round(options.topK ?? DEFAULT_TOP_K)), MAX_TOP_K);
    const scoreThreshold = options.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;

    // ── Step 1: Embed the query (skip if caller already computed) ───────
    let queryEmbedding: readonly number[];
    if (precomputedEmbedding && precomputedEmbedding.length > 0) {
      queryEmbedding = precomputedEmbedding;
    } else {
      try {
        queryEmbedding = await this.llm.embed(query);
      } catch (err) {
        logger.warn('[KnowledgeRetrieval] Embedding failed — skipping retrieval', {
          error: String(err),
        });
        return [];
      }
    }

    // ── Step 2: Build optional category filter ──────────────────────────
    const filter: Record<string, unknown> = {};
    if (options.categories && options.categories.length > 0) {
      filter['category'] = { $in: options.categories };
    }

    // ── Step 3: Run $vectorSearch ───────────────────────────────────────
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipeline: any[] = [
        {
          $vectorSearch: {
            index: KNOWLEDGE_VECTOR_INDEX_NAME,
            path: 'embedding',
            queryVector: Array.from(queryEmbedding),
            numCandidates: Math.min(Math.max(DEFAULT_NUM_CANDIDATES, topK * 20), 1000),
            limit: topK,
            ...(Object.keys(filter).length > 0 ? { filter } : {}),
          },
        },
        {
          $project: {
            _id: 1,
            content: 1,
            category: 1,
            source: 1,
            title: 1,
            sourceRef: 1,
            chunkIndex: 1,
            totalChunks: 1,
            version: 1,
            metadata: 1,
            createdAt: 1,
            updatedAt: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ];

      const results = await GlobalKnowledgeModel.aggregate<
        GlobalKnowledgeDocument & { score: number }
      >(pipeline);

      // Filter by score threshold client-side (Atlas $vectorSearch doesn't
      // natively support a minimum score filter)
      const filtered = results.filter((doc) => doc.score >= scoreThreshold);

      logger.info('[KnowledgeRetrieval] Retrieved knowledge chunks', {
        query: query.slice(0, 100),
        rawCount: results.length,
        filteredCount: filtered.length,
        topScore: results[0]?.score?.toFixed(4),
        categories: options.categories,
      });

      return filtered.map((doc) => ({
        entry: this.docToEntry(doc),
        score: doc.score,
      }));
    } catch (err) {
      // Gracefully degrade if Atlas Vector Search is not configured
      logger.warn(
        '[KnowledgeRetrieval] $vectorSearch failed — Atlas index may not be configured. Returning empty.',
        { error: String(err) }
      );
      return [];
    }
  }

  /**
   * Build a Markdown prompt block from retrieval results.
   *
   * Format designed for minimal token usage while preserving source attribution:
   * ```
   * ## Retrieved Knowledge
   *
   * ### [Title] (score: 0.92)
   * [content chunk]
   * _Source: [sourceRef] | Category: [category]_
   * ```
   *
   * Returns an empty string if no results — safe to concatenate unconditionally.
   */
  buildPromptBlock(results: readonly KnowledgeRetrievalResult[]): string {
    if (results.length === 0) return '';

    const blocks = results.map((r) => {
      const source = r.entry.sourceRef ? ` | Source: ${r.entry.sourceRef}` : '';
      const chunk =
        r.entry.totalChunks > 1 ? ` (part ${r.entry.chunkIndex + 1}/${r.entry.totalChunks})` : '';
      return [
        `### ${r.entry.title}${chunk} (relevance: ${r.score.toFixed(2)})`,
        r.entry.content,
        `_Category: ${r.entry.category}${source}_`,
      ].join('\n');
    });

    return ['', '## Retrieved Knowledge (from verified domain database)', '', ...blocks].join(
      '\n\n'
    );
  }

  /**
   * Get statistics about the knowledge base (for admin dashboards).
   */
  async getStats(): Promise<{
    totalChunks: number;
    byCategory: Record<string, number>;
    uniqueDocuments: number;
  }> {
    const GlobalKnowledgeModel = getGlobalKnowledgeModel();
    const [totalChunks, categoryAgg, uniqueDocs] = await Promise.all([
      GlobalKnowledgeModel.countDocuments(),
      GlobalKnowledgeModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      GlobalKnowledgeModel.aggregate<{ count: number }>([
        { $group: { _id: '$contentHash' } },
        { $count: 'count' },
      ]),
    ]);

    const byCategory: Record<string, number> = {};
    for (const agg of categoryAgg) {
      byCategory[agg._id] = agg.count;
    }

    return {
      totalChunks,
      byCategory,
      uniqueDocuments: uniqueDocs[0]?.count ?? 0,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private docToEntry(
    doc: Pick<
      GlobalKnowledgeDocument,
      | '_id'
      | 'content'
      | 'category'
      | 'source'
      | 'title'
      | 'sourceRef'
      | 'chunkIndex'
      | 'totalChunks'
      | 'version'
      | 'metadata'
      | 'createdAt'
      | 'updatedAt'
    >
  ): KnowledgeEntry {
    return {
      id: String(doc._id),
      content: doc.content,
      category: doc.category,
      source: doc.source,
      title: doc.title,
      sourceRef: doc.sourceRef,
      chunkIndex: doc.chunkIndex,
      totalChunks: doc.totalChunks,
      version: doc.version,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
