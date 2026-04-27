/**
 * @fileoverview Global Knowledge Model — MongoDB Atlas Vector Search
 * @module @nxt1/backend/modules/agent/memory
 *
 * Mongoose schema for the `agentGlobalKnowledge` collection, which stores
 * chunked, embedded domain knowledge (NCAA rules, compliance calendars,
 * platform guides, sport-specific training, etc.) for Agent X retrieval.
 *
 * Unlike `VectorMemoryService` (per-user, 90-day TTL) and
 * `SemanticCacheService` (global, 24h TTL), GlobalKnowledge is:
 * - **Permanent** — No TTL; documents persist until explicitly deleted or re-ingested.
 * - **Global** — Not user-scoped; all agents query the same knowledge base.
 * - **Versioned** — Re-ingesting the same source increments the version and
 *   replaces stale chunks.
 *
 * Atlas Search Index (create on the `agentGlobalKnowledge` collection):
 * ```json
 * {
 *   "fields": [
 *     { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
 *     { "type": "filter", "path": "category" },
 *     { "type": "filter", "path": "version" }
 *   ]
 * }
 * ```
 */

import { Schema, type Model, type Connection } from 'mongoose';
import type { KnowledgeCategory, KnowledgeSourceType } from '@nxt1/core';
import { getMongoGlobalConnection } from '../../../config/database.config.js';

// ─── Document Interface ──────────────────────────────────────────────────────

export interface GlobalKnowledgeDocument {
  _id: string;
  /** The text chunk content (plain text or Markdown). */
  content: string;
  /** 1536-dim embedding of `content` via text-embedding-3-small. */
  embedding: number[];
  /** Logical category for filtering during retrieval. */
  category: KnowledgeCategory;
  /** How this document was ingested. */
  source: KnowledgeSourceType;
  /** Human-readable title of the parent document. */
  title: string;
  /** Original URL, file path, or reference for traceability. */
  sourceRef?: string;
  /** Chunk index within the parent document (0-based). */
  chunkIndex: number;
  /** Total number of chunks from the parent document. */
  totalChunks: number;
  /** SHA-256 hash of the parent document content for dedup / version detection. */
  contentHash: string;
  /** Version number — incremented on re-ingestion of the same source. */
  version: number;
  /** Arbitrary metadata (e.g., division, sport, effective date). */
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Mongoose Schema ─────────────────────────────────────────────────────────

const GlobalKnowledgeSchema = new Schema<GlobalKnowledgeDocument>(
  {
    content: { type: String, required: true },
    // select: false prevents loading large float arrays on every non-vector query
    embedding: { type: [Number], required: true, select: false },
    category: { type: String, required: true, index: true },
    source: { type: String, required: true },
    title: { type: String, required: true },
    sourceRef: { type: String },
    chunkIndex: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    contentHash: { type: String, required: true, index: true },
    version: { type: Number, required: true, default: 1 },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

// Compound index for efficient re-ingestion (find all chunks of a given source hash)
GlobalKnowledgeSchema.index({ contentHash: 1, version: 1 });
// Compound index for category + version filtering during retrieval
GlobalKnowledgeSchema.index({ category: 1, version: 1 });
// Text index for fallback keyword search when vector search is unavailable
GlobalKnowledgeSchema.index({ content: 'text', title: 'text' });

const GLOBAL_KNOWLEDGE_MODEL_NAME = 'AgentGlobalKnowledge';

export function getGlobalKnowledgeModel(
  connection: Connection = getMongoGlobalConnection()
): Model<GlobalKnowledgeDocument> {
  const existingModel = connection.models[GLOBAL_KNOWLEDGE_MODEL_NAME] as
    | Model<GlobalKnowledgeDocument>
    | undefined;
  if (existingModel) return existingModel;

  return connection.model<GlobalKnowledgeDocument>(
    GLOBAL_KNOWLEDGE_MODEL_NAME,
    GlobalKnowledgeSchema
  );
}

export const GlobalKnowledgeModel = new Proxy({} as Model<GlobalKnowledgeDocument>, {
  get(_target, prop) {
    const model = getGlobalKnowledgeModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getGlobalKnowledgeModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getGlobalKnowledgeModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
