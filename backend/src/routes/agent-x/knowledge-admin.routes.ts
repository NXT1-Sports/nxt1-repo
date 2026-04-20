/**
 * @fileoverview Agent X — Knowledge Admin Routes
 *
 * Provides operational endpoints for managing the global knowledge base.
 * All routes require admin authentication via adminGuard.
 *
 * GET  /agent-x/knowledge/status          — Collection count by category, last ingested
 * POST /agent-x/knowledge/seed            — Trigger seed script programmatically
 * POST /agent-x/knowledge/ingest          — Ingest a single custom document
 * DELETE /agent-x/knowledge/source/:ref   — Remove a document by encoded sourceRef
 */

import { Router, type Request, type Response } from 'express';
import { adminGuard } from '../../middleware/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { GlobalKnowledgeModel } from '../../modules/agent/memory/global-knowledge.model.js';
import { KnowledgeIngestionService } from '../../modules/agent/memory/knowledge-ingestion.service.js';
import type { KnowledgeIngestionRequest } from '@nxt1/core';
import { llmService } from './shared.js';
import type { KnowledgeCategory } from '@nxt1/core';

const router = Router();

// ─── GET /agent-x/knowledge/status ───────────────────────────────────────────

router.get('/knowledge/status', adminGuard, async (_req: Request, res: Response) => {
  try {
    const [totalCount, byCategory, recentDocs] = await Promise.all([
      GlobalKnowledgeModel.countDocuments(),
      GlobalKnowledgeModel.aggregate<{ _id: KnowledgeCategory; chunks: number; docs: number }>([
        {
          $group: {
            _id: '$category',
            chunks: { $sum: 1 },
            docs: { $sum: { $cond: [{ $eq: ['$chunkIndex', 0] }, 1, 0] } },
          },
        },
        { $sort: { docs: -1 } },
      ]),
      GlobalKnowledgeModel.aggregate<{
        title: string;
        category: string;
        version: number;
        totalChunks: number;
        sourceRef: string;
        createdAt: string;
      }>([
        { $match: { chunkIndex: 0 } },
        { $sort: { createdAt: -1 } },
        { $limit: 20 },
        {
          $project: {
            _id: 0,
            title: 1,
            category: 1,
            version: 1,
            totalChunks: 1,
            sourceRef: 1,
            createdAt: 1,
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalChunks: totalCount,
        totalDocuments: recentDocs.length,
        byCategory,
        recentDocuments: recentDocs,
        atlasIndexName: 'agent_global_knowledge_vector_index',
        note:
          totalCount === 0
            ? 'Knowledge base is empty. Run POST /agent-x/knowledge/seed to populate it.'
            : `${totalCount} chunks indexed across ${byCategory.length} categories.`,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[KnowledgeAdmin] Status check failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve knowledge base status' });
  }
});

// ─── POST /agent-x/knowledge/seed ────────────────────────────────────────────

router.post('/knowledge/seed', adminGuard, async (_req: Request, res: Response) => {
  if (!llmService) {
    res.status(503).json({ success: false, error: 'LLM service not initialized' });
    return;
  }

  try {
    logger.info('[KnowledgeAdmin] Seed triggered via API');

    // Seed documents live in root scripts/ outside backend rootDir.
    // Use indirect dynamic import so tsc never resolves the out-of-rootDir paths.
    const load = (p: string) =>
      new Function('p', 'return import(p)')(p) as Promise<Record<string, unknown>>;
    const base = '../../../../scripts/seed-knowledge/documents';
    const [pg, ax, tm, ab, ts] = await Promise.all([
      load(`${base}/platform-guide.js`),
      load(`${base}/agent-x.js`),
      load(`${base}/teams.js`),
      load(`${base}/account-billing.js`),
      load(`${base}/troubleshooting.js`),
    ]);
    const PLATFORM_GUIDE_DOC = pg['PLATFORM_GUIDE_DOC'];
    const AGENT_X_DOC = ax['AGENT_X_DOC'];
    const TEAMS_DOC = tm['TEAMS_DOC'];
    const ACCOUNT_BILLING_DOC = ab['ACCOUNT_BILLING_DOC'];
    const TROUBLESHOOTING_DOC = ts['TROUBLESHOOTING_DOC'];

    const docs = [
      PLATFORM_GUIDE_DOC,
      AGENT_X_DOC,
      TEAMS_DOC,
      ACCOUNT_BILLING_DOC,
      TROUBLESHOOTING_DOC,
    ] as KnowledgeIngestionRequest[];
    const ingestion = new KnowledgeIngestionService(llmService);

    let totalChunksCreated = 0;
    const results: Array<{ title: string; chunksCreated: number; version: number }> = [];

    for (const doc of docs) {
      const result = await ingestion.ingest({ ...doc, chunkSize: 2048, chunkOverlap: 256 });
      totalChunksCreated += result.chunksCreated;
      results.push({
        title: result.title,
        chunksCreated: result.chunksCreated,
        version: result.version,
      });
    }

    logger.info('[KnowledgeAdmin] Seed complete', { totalChunksCreated, documents: docs.length });
    res.json({ success: true, data: { totalChunksCreated, documents: results } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[KnowledgeAdmin] Seed failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Seed operation failed' });
  }
});

// ─── POST /agent-x/knowledge/ingest ──────────────────────────────────────────

router.post('/knowledge/ingest', adminGuard, async (req: Request, res: Response) => {
  const { title, content, category, sourceRef } = req.body as {
    title?: string;
    content?: string;
    category?: KnowledgeCategory;
    sourceRef?: string;
  };

  if (!title || !content || !category) {
    res.status(400).json({ success: false, error: 'title, content, and category are required' });
    return;
  }

  const VALID_CATEGORIES: KnowledgeCategory[] = [
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
  ];

  if (!VALID_CATEGORIES.includes(category)) {
    res
      .status(400)
      .json({
        success: false,
        error: `Invalid category. Valid values: ${VALID_CATEGORIES.join(', ')}`,
      });
    return;
  }

  if (!llmService) {
    res.status(503).json({ success: false, error: 'LLM service not initialized' });
    return;
  }

  try {
    const ingestion = new KnowledgeIngestionService(llmService);
    const result = await ingestion.ingest({
      title,
      content,
      category,
      source: 'manual',
      sourceRef,
      chunkSize: 2048,
      chunkOverlap: 256,
    });

    logger.info('[KnowledgeAdmin] Document ingested', {
      title,
      category,
      chunksCreated: result.chunksCreated,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[KnowledgeAdmin] Ingest failed', { title, category, error: error.message });
    res.status(500).json({ success: false, error: 'Ingest failed' });
  }
});

// ─── DELETE /agent-x/knowledge/source/:ref ───────────────────────────────────

router.delete('/knowledge/source/:ref', adminGuard, async (req: Request, res: Response) => {
  const rawRef = req.params['ref'];
  const sourceRef = decodeURIComponent(typeof rawRef === 'string' ? rawRef : '');

  if (!sourceRef) {
    res.status(400).json({ success: false, error: 'sourceRef is required' });
    return;
  }

  if (!llmService) {
    res.status(503).json({ success: false, error: 'LLM service not initialized' });
    return;
  }

  try {
    const ingestion = new KnowledgeIngestionService(llmService);
    const deletedCount = await ingestion.deleteBySourceRef(sourceRef);
    logger.info('[KnowledgeAdmin] Document deleted by sourceRef', { sourceRef, deletedCount });
    res.json({ success: true, data: { deletedCount, sourceRef } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[KnowledgeAdmin] Delete failed', { sourceRef, error: error.message });
    res.status(500).json({ success: false, error: 'Delete failed' });
  }
});

export default router;
