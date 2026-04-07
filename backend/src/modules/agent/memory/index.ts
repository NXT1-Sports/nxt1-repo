/**
 * @fileoverview Memory System — Barrel Export
 * @module @nxt1/backend/modules/agent/memory
 */

export { ContextBuilder } from './context-builder.js';
export { VectorMemoryService } from './vector.service.js';
export { SessionMemoryService } from './session.service.js';
export { SemanticCacheService } from './semantic-cache.service.js';
export { GlobalKnowledgeModel, type GlobalKnowledgeDocument } from './global-knowledge.model.js';
export {
  KnowledgeRetrievalService,
  type KnowledgeRetrievalOptions,
} from './knowledge-retrieval.service.js';
export { KnowledgeIngestionService } from './knowledge-ingestion.service.js';
export {
  MemorySummarizationService,
  type SummarizationResult,
} from './memory-summarization.service.js';
