/**
 * @fileoverview Vector Memory Service
 * @module @nxt1/backend/modules/agent/memory
 *
 * Adapter for the long-term vector database (Pinecone, pgvector, or Milvus).
 * Stores embedded memories so Agent X can retrieve relevant past context
 * before every interaction.
 *
 * Responsibilities:
 * - Embed text into vectors (via OpenRouter embedding models).
 * - Upsert embeddings into the vector store.
 * - Semantic search: given a query, retrieve the top-K most relevant memories.
 * - TTL management: expire stale memories.
 *
 * @example
 * ```ts
 * const memory = new VectorMemoryService(vectorClient, embeddingService);
 *
 * // Store a new memory
 * await memory.store(userId, 'I want to focus on SEC schools', 'preference');
 *
 * // Retrieve relevant context before an agent run
 * const context = await memory.recall(userId, 'Which conferences should I target?', 5);
 * ```
 */

import type { AgentMemoryEntry, AgentMemoryCategory } from '@nxt1/core';

export class VectorMemoryService {
  /**
   * Embed and store a piece of text as a long-term memory.
   */
  async store(
    _userId: string,
    _content: string,
    _category: AgentMemoryCategory,
    _metadata?: Record<string, unknown>
  ): Promise<AgentMemoryEntry> {
    throw new Error('VectorMemoryService.store() not implemented');
  }

  /**
   * Semantic search: find the top-K most relevant memories for a query.
   */
  async recall(
    _userId: string,
    _query: string,
    _topK?: number
  ): Promise<readonly AgentMemoryEntry[]> {
    throw new Error('VectorMemoryService.recall() not implemented');
  }

  /**
   * Delete all memories for a user (e.g., account deletion).
   */
  async deleteAll(_userId: string): Promise<void> {
    throw new Error('VectorMemoryService.deleteAll() not implemented');
  }
}
