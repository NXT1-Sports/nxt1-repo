/**
 * @fileoverview Agent X — Cloud Scheduler cron trigger routes.
 *
 * POST /cron/daily-briefings
 * POST /cron/summarize-threads
 * POST /cron/cleanup-thread-media
 */

import { Router, type Request, type Response } from 'express';
import { cronGuard } from '../../middleware/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { llmService } from './shared.js';

const router = Router();

// ─── POST /cron/daily-briefings ───────────────────────────────────────────

router.post('/cron/daily-briefings', cronGuard, async (_req: Request, res: Response) => {
  try {
    const { runDailyBriefings } = await import('../../modules/agent/triggers/trigger.listeners.js');
    await runDailyBriefings();
    res.json({ success: true, message: 'Daily briefings completed' });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON daily briefings failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Daily briefings failed' });
  }
});

// ─── POST /cron/summarize-threads ─────────────────────────────────────────

router.post('/cron/summarize-threads', cronGuard, async (_req: Request, res: Response) => {
  try {
    if (!llmService) {
      res.status(503).json({ success: false, error: 'LLM service not initialized' });
      return;
    }

    const { MemorySummarizationService } =
      await import('../../modules/agent/memory/memory-summarization.service.js');
    const { VectorMemoryService } = await import('../../modules/agent/memory/vector.service.js');

    const vectorMemory = new VectorMemoryService(llmService);
    const summarizer = new MemorySummarizationService(llmService, vectorMemory);
    const result = await summarizer.summarizeInactiveThreads();

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON summarize-threads failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Thread summarization failed' });
  }
});

// ─── POST /cron/cleanup-thread-media ─────────────────────────────────────

router.post('/cron/cleanup-thread-media', cronGuard, async (_req: Request, res: Response) => {
  try {
    const { ScraperMediaService } =
      await import('../../modules/agent/tools/integrations/social/scraper-media.service.js');
    const { AgentThreadModel: AgentThread } = await import('../../models/agent-thread.model.js');

    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const threads = await AgentThread.find({
      expiresAt: { $lte: cutoff },
      mediaCleaned: { $ne: true },
    })
      .select('_id userId')
      .limit(100)
      .lean();

    let cleaned = 0;
    let filesDeleted = 0;

    for (const thread of threads) {
      try {
        const count = await ScraperMediaService.deleteThreadMedia(
          thread.userId,
          String(thread._id)
        );
        filesDeleted += count;

        await AgentThread.updateOne({ _id: thread._id }, { $set: { mediaCleaned: true } });
        cleaned++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('Failed to clean thread media', {
          threadId: String(thread._id),
          userId: thread.userId,
          error: msg,
        });
      }
    }

    logger.info('CRON cleanup-thread-media completed', {
      threadsScanned: threads.length,
      threadsCleaned: cleaned,
      filesDeleted,
    });

    res.json({
      success: true,
      data: { threadsScanned: threads.length, threadsCleaned: cleaned, filesDeleted },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON cleanup-thread-media failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Thread media cleanup failed' });
  }
});

export default router;
