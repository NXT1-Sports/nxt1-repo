/**
 * @fileoverview Knowledge Base Admin Routes
 * @module @nxt1/backend/routes/knowledge
 *
 * Admin-only REST API for managing the global domain knowledge base.
 * All endpoints require `adminGuard` — these are internal tools for
 * populating and maintaining the knowledge Agent X retrieves at runtime.
 *
 * Routes:
 *   POST   /api/v1/knowledge/ingest      → Ingest a document (chunk + embed + store)
 *   GET    /api/v1/knowledge/documents    → List all ingested documents
 *   GET    /api/v1/knowledge/stats        → Get knowledge base statistics
 *   POST   /api/v1/knowledge/query        → Test retrieval (semantic search)
 *   DELETE /api/v1/knowledge/source       → Delete all chunks by sourceRef
 *   DELETE /api/v1/knowledge/category     → Delete all chunks by category
 */

import { Router, type Request, type Response } from 'express';
import { adminGuard } from '../middleware/auth.middleware.js';
import type { KnowledgeCategory, KnowledgeSourceType } from '@nxt1/core';
import { KnowledgeIngestionService } from '../modules/agent/memory/knowledge-ingestion.service.js';
import { KnowledgeRetrievalService } from '../modules/agent/memory/knowledge-retrieval.service.js';
import type { OpenRouterService } from '../modules/agent/llm/openrouter.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ─── Dependency Injection ─────────────────────────────────────────────────────

let ingestionService: KnowledgeIngestionService | null = null;
let retrievalService: KnowledgeRetrievalService | null = null;

/**
 * Called from bootstrap.ts to inject the LLM-dependent services.
 * If never called (e.g., Redis unavailable), all endpoints return 503.
 */
export function setKnowledgeDependencies(llm: OpenRouterService): void {
  ingestionService = new KnowledgeIngestionService(llm);
  retrievalService = new KnowledgeRetrievalService(llm);
  logger.info('[KnowledgeRoutes] Dependencies injected');
}

function requireServices(res: Response): boolean {
  if (!ingestionService || !retrievalService) {
    res.status(503).json({
      success: false,
      error: 'Knowledge base services not initialized. Agent queue may not be running.',
    });
    return false;
  }
  return true;
}

// ─── POST /ingest — Ingest a document ─────────────────────────────────────────

/**
 * Valid categories and sources — derived from the @nxt1/core type unions.
 * These arrays must stay in sync with KnowledgeCategory and KnowledgeSourceType.
 */
const VALID_CATEGORIES: readonly KnowledgeCategory[] = [
  'ncaa_rules',
  'naia_rules',
  'njcaa_rules',
  'eligibility',
  'recruiting_calendar',
  'compliance',
  'platform_guide',
  'help_center',
  'sport_rules',
  'training',
  'nutrition',
  'mental_performance',
  'nil',
  'transfer_portal',
  'general',
] satisfies readonly KnowledgeCategory[];

const VALID_SOURCES: readonly KnowledgeSourceType[] = [
  'pdf',
  'url',
  'manual',
  'help_center',
  'api',
] satisfies readonly KnowledgeSourceType[];

/** Maximum content size: 5 MB (prevents chunking/embedding DOS). */
const MAX_CONTENT_LENGTH = 5 * 1024 * 1024;

router.post('/ingest', adminGuard, async (req: Request, res: Response): Promise<void> => {
  if (!requireServices(res)) return;

  const { content, category, source, title, sourceRef, metadata, chunkSize, chunkOverlap } =
    req.body;

  // ── Validation ──────────────────────────────────────────────────────
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ success: false, error: 'content is required (non-empty string)' });
    return;
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    res.status(413).json({
      success: false,
      error: `content exceeds maximum size of ${MAX_CONTENT_LENGTH} bytes (received ${content.length})`,
    });
    return;
  }
  if (!title || typeof title !== 'string') {
    res.status(400).json({ success: false, error: 'title is required (string)' });
    return;
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({
      success: false,
      error: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
    });
    return;
  }
  if (!source || !VALID_SOURCES.includes(source)) {
    res.status(400).json({
      success: false,
      error: `source must be one of: ${VALID_SOURCES.join(', ')}`,
    });
    return;
  }

  try {
    const result = await ingestionService!.ingest({
      content,
      category,
      source,
      title,
      sourceRef,
      metadata,
      chunkSize,
      chunkOverlap,
    });

    logger.info('[KnowledgeRoutes] Document ingested', {
      title,
      category,
      chunksCreated: result.chunksCreated,
      version: result.version,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error('[KnowledgeRoutes] Ingestion failed', {
      title,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Ingestion failed',
    });
  }
});

// ─── GET /documents — List ingested documents ─────────────────────────────────

router.get('/documents', adminGuard, async (_req: Request, res: Response): Promise<void> => {
  if (!requireServices(res)) return;

  try {
    const documents = await ingestionService!.listDocuments();
    res.json({ success: true, data: documents });
  } catch (err) {
    logger.error('[KnowledgeRoutes] Failed to list documents', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to list documents' });
  }
});

// ─── GET /stats — Knowledge base statistics ───────────────────────────────────

router.get('/stats', adminGuard, async (_req: Request, res: Response): Promise<void> => {
  if (!requireServices(res)) return;

  try {
    const stats = await retrievalService!.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('[KnowledgeRoutes] Failed to get stats', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// ─── POST /query — Test retrieval (semantic search) ───────────────────────────

router.post('/query', adminGuard, async (req: Request, res: Response): Promise<void> => {
  if (!requireServices(res)) return;

  const { query, topK, categories, scoreThreshold } = req.body;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ success: false, error: 'query is required (string)' });
    return;
  }

  try {
    const results = await retrievalService!.retrieve(query, {
      topK,
      categories,
      scoreThreshold,
    });

    res.json({
      success: true,
      data: {
        query,
        results: results.map((r) => ({
          title: r.entry.title,
          content: r.entry.content.slice(0, 500),
          category: r.entry.category,
          score: r.score,
          sourceRef: r.entry.sourceRef,
        })),
        count: results.length,
      },
    });
  } catch (err) {
    logger.error('[KnowledgeRoutes] Query failed', {
      query,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Query failed' });
  }
});

// ─── DELETE /source — Delete by sourceRef ─────────────────────────────────────

router.delete('/source', adminGuard, async (req: Request, res: Response): Promise<void> => {
  if (!requireServices(res)) return;

  const { sourceRef } = req.body;

  if (!sourceRef || typeof sourceRef !== 'string') {
    res.status(400).json({ success: false, error: 'sourceRef is required (string)' });
    return;
  }

  try {
    const deletedCount = await ingestionService!.deleteBySourceRef(sourceRef);
    res.json({ success: true, data: { deletedCount, sourceRef } });
  } catch (err) {
    logger.error('[KnowledgeRoutes] Failed to delete by sourceRef', {
      sourceRef,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Delete failed' });
  }
});

// ─── DELETE /category — Delete by category ────────────────────────────────────

router.delete('/category', adminGuard, async (req: Request, res: Response): Promise<void> => {
  if (!requireServices(res)) return;

  const { category } = req.body;

  if (!category || !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({
      success: false,
      error: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
    });
    return;
  }

  try {
    const deletedCount = await ingestionService!.deleteByCategory(category);
    res.json({ success: true, data: { deletedCount, category } });
  } catch (err) {
    logger.error('[KnowledgeRoutes] Failed to delete by category', {
      category,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Delete failed' });
  }
});

export default router;
