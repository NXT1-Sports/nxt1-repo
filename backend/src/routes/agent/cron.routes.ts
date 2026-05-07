/**
 * @fileoverview Agent X — Cloud Scheduler cron trigger routes.
 *
 * POST /cron/daily-briefings
 * POST /cron/summarize-threads
 * POST /cron/cleanup-thread-media
 * POST /cron/reconcile-job-thread-links
 */

import { Router, type Request, type Response } from 'express';
import { cronGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { llmService } from './shared.js';
import { AgentLinkReconciliationService } from '../../modules/agent/services/agent-link-reconciliation.service.js';
import { AgentEphemeralStateService } from '../../modules/agent/services/agent-ephemeral-state.service.js';
import { getCloudflareAnalyticsSyncService } from '../../services/platform/cloudflare-analytics-sync.service.js';

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

// ─── POST /cron/weekly-playbooks ─────────────────────────────────────────
// Cloud Scheduler: every Monday at 8:00 AM  (cron: 0 8 * * 1)

router.post('/cron/weekly-playbooks', cronGuard, async (_req: Request, res: Response) => {
  try {
    const { runWeeklyPlaybooks } =
      await import('../../modules/agent/triggers/trigger.listeners.js');
    await runWeeklyPlaybooks();
    res.json({ success: true, message: 'Weekly playbooks completed' });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON weekly playbooks failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Weekly playbooks failed' });
  }
});

// ─── POST /cron/suggested-actions ────────────────────────────────────────
// Cloud Scheduler: every Sunday at 9:00 AM  (cron: 0 9 * * 0)

router.post('/cron/suggested-actions', cronGuard, async (_req: Request, res: Response) => {
  try {
    const { runWeeklySuggestedActions } =
      await import('../../modules/agent/triggers/trigger.listeners.js');
    await runWeeklySuggestedActions();
    res.json({ success: true, message: 'Weekly suggested actions completed' });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON suggested-actions failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Suggested actions failed' });
  }
});

// ─── POST /cron/playbook-nudge ────────────────────────────────────────────
// Cloud Scheduler: Wednesday + Saturday at 6:00 PM  (cron: 0 18 * * 3,6)
// Sends a personalized mid-week progress check-in push for active playbooks.

router.post('/cron/playbook-nudge', cronGuard, async (_req: Request, res: Response) => {
  try {
    const { runPlaybookNudge } = await import('../../modules/agent/triggers/trigger.listeners.js');
    await runPlaybookNudge();
    res.json({ success: true, message: 'Playbook nudge dispatched' });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON playbook-nudge failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Playbook nudge failed' });
  }
});

// ─── POST /cron/weekly-recaps ─────────────────────────────────────────────
// Cloud Scheduler: every Friday at 9:00 AM  (cron: 0 9 * * 5)

router.post('/cron/weekly-recaps', cronGuard, async (_req: Request, res: Response) => {
  // Respond immediately — enqueuing jobs across all eligible users can take
  // longer than the 30-second global server timeout. The actual recap
  // generation happens asynchronously via the BullMQ job worker.
  res.json({ success: true, message: 'Weekly recaps started', status: 'running' });

  // Fire-and-forget background job
  (async () => {
    try {
      const { runWeeklyRecaps } = await import('../../modules/agent/triggers/trigger.listeners.js');
      await runWeeklyRecaps();
      logger.info('CRON weekly-recaps completed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON weekly recaps failed', { error: error.message, stack: error.stack });
    }
  })();
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

// ─── POST /cron/scan-timeline-posts ──────────────────────────────────────

router.post('/cron/scan-timeline-posts', cronGuard, async (_req: Request, res: Response) => {
  try {
    if (!llmService) {
      res.status(503).json({ success: false, error: 'LLM service not initialized' });
      return;
    }

    const { getFirestore } = await import('firebase-admin/firestore');
    const { VectorMemoryService } = await import('../../modules/agent/memory/vector.service.js');
    const { TimelineScanService, TIMELINE_SCAN_LOOKBACK_HOURS, MAX_USERS_PER_CRON_RUN } =
      await import('../../modules/agent/memory/timeline-scan.service.js');

    const db = getFirestore();
    const vectorMemory = new VectorMemoryService(llmService);
    const timelineScanner = new TimelineScanService(db, llmService, vectorMemory);

    const result = await timelineScanner.scanActiveUsers(
      TIMELINE_SCAN_LOOKBACK_HOURS,
      MAX_USERS_PER_CRON_RUN
    );

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON scan-timeline-posts failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Timeline scan failed' });
  }
});

// ─── POST /cron/cleanup-thread-media ─────────────────────────────────────

router.post('/cron/cleanup-thread-media', cronGuard, async (_req: Request, res: Response) => {
  try {
    const { ScraperMediaService } =
      await import('../../modules/agent/tools/integrations/social/scraper-media.service.js');
    const { AgentThreadModel: AgentThread } =
      await import('../../models/agent/agent-thread.model.js');

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

// ─── POST /cron/cleanup-stale-jobs ────────────────────────────────────────
// Marks queued jobs that have been stuck for >100 minutes as failed.
// Called every 15 minutes by the cleanupStaleAgentJobs Cloud Function.

router.post('/cron/cleanup-stale-jobs', cronGuard, async (req: Request, res: Response) => {
  try {
    const db = (
      req as typeof req & { firebase?: { db: import('firebase-admin').firestore.Firestore } }
    ).firebase?.db;
    if (!db) {
      res.status(503).json({ success: false, error: 'Firestore not available' });
      return;
    }

    const STALE_THRESHOLD_MS = 100 * 60 * 1000; // 100 minutes
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    const snapshot = await db
      .collection('AgentJobs')
      .where('status', '==', 'queued')
      .where('createdAt', '<', cutoff)
      .limit(100)
      .get();

    let updated = 0;
    const batch = db.batch();

    for (const doc of snapshot.docs) {
      batch.update(doc.ref, {
        status: 'failed',
        error: 'Job timed out — no activity for over 100 minutes',
        updatedAt: new Date(),
      });
      updated++;
    }

    if (updated > 0) {
      await batch.commit();
    }

    logger.info('CRON cleanup-stale-jobs completed', {
      scanned: snapshot.size,
      markedFailed: updated,
      cutoff: cutoff.toISOString(),
    });

    res.json({ success: true, data: { scanned: snapshot.size, markedFailed: updated } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON cleanup-stale-jobs failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Stale job cleanup failed' });
  }
});

// ─── POST /cron/reconcile-job-thread-links ──────────────────────────────────
// Repairs missing Firestore AgentJobs.threadId links using MongoDB messages.
// Called every 6 hours by the reconcileAgentJobThreadLinks Cloud Function.

router.post('/cron/reconcile-job-thread-links', cronGuard, async (req: Request, res: Response) => {
  try {
    const db = (
      req as typeof req & { firebase?: { db: import('firebase-admin').firestore.Firestore } }
    ).firebase?.db;
    if (!db) {
      res.status(503).json({ success: false, error: 'Firestore not available' });
      return;
    }

    const parseNumber = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    };

    const body = req.body as Record<string, unknown> | undefined;
    const options = {
      lookbackDays: parseNumber(body?.['lookbackDays'] ?? req.query['lookbackDays']),
      messageScanLimit: parseNumber(body?.['messageScanLimit'] ?? req.query['messageScanLimit']),
      repairLimit: parseNumber(body?.['repairLimit'] ?? req.query['repairLimit']),
      batchSize: parseNumber(body?.['batchSize'] ?? req.query['batchSize']),
      repairMismatchedThreadId: body?.['repairMismatchedThreadId'] === true,
    };

    const reconciler = new AgentLinkReconciliationService();
    const result = await reconciler.reconcileJobThreadLinks(db, options);

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON reconcile-job-thread-links failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Job-thread link reconciliation failed' });
  }
});

// ─── POST /cron/refresh-help-center ──────────────────────────────────────
// Cloud Scheduler: every Sunday at 2:00 AM UTC  (cron: 0 2 * * 0)

router.post('/cron/refresh-help-center', cronGuard, async (_req: Request, res: Response) => {
  if (!llmService) {
    res.status(503).json({ success: false, error: 'LLM service not initialized' });
    return;
  }

  // Respond immediately — job runs in background (can take 2–10 min)
  res.json({ success: true, message: 'Help center refresh started', status: 'running' });

  // Fire-and-forget background job
  (async () => {
    try {
      const { HelpCenterRefreshWorker } =
        await import('../../workers/help-center-refresh.worker.js');
      const refreshWorker = new HelpCenterRefreshWorker(llmService!);
      const result = await refreshWorker.run();
      logger.info(
        'CRON refresh-help-center completed',
        result as unknown as Record<string, unknown>
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON refresh-help-center failed', { error: error.message, stack: error.stack });
    }
  })();
});

// ─── POST /cron/sync-cloudflare-video-analytics ───────────────────────────
// Cloud Scheduler: every day at 3:00 AM ET  (cron: 0 3 * * *)

router.post(
  '/cron/sync-cloudflare-video-analytics',
  cronGuard,
  async (_req: Request, res: Response) => {
    // Respond immediately — analytics backfill can run longer than HTTP timeout.
    res.json({
      success: true,
      message: 'Cloudflare video analytics sync started',
      status: 'running',
    });

    // Fire-and-forget background job
    (async () => {
      try {
        const syncService = getCloudflareAnalyticsSyncService();
        const result = await syncService.syncLast24Hours();
        logger.info('CRON sync-cloudflare-video-analytics completed', result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('CRON sync-cloudflare-video-analytics failed', {
          error: error.message,
          stack: error.stack,
        });
      }
    })();
  }
);

// ─── POST /cron/cleanup-tmp-media ────────────────────────────────────────────
// Deletes Firebase Storage files whose path contains a /tmp/ segment and that
// were created more than TMP_TTL_DAYS ago. Covers both thread-scoped tmp files
// (Users/{uid}/threads/{threadId}/tmp/) and unbound tmp files
// (Users/{uid}/uploads/tmp/). Runs daily — GCS lifecycle rules cannot target
// wildcard mid-path segments so a server-side sweep is the correct approach.
//
// Cloud Scheduler: every day at 4:30 AM ET  (cron: 30 4 * * *)

const TMP_TTL_DAYS = 7;

router.post('/cron/cleanup-tmp-media', cronGuard, async (req: Request, res: Response) => {
  try {
    const storage = req.firebase?.storage;
    if (!storage) {
      res.status(503).json({ success: false, error: 'Firebase Storage not available' });
      return;
    }

    const bucket = storage.bucket();
    const cutoffMs = Date.now() - TMP_TTL_DAYS * 24 * 60 * 60 * 1000;

    // GCS list with prefix="Users/" — iterates all user-owned objects.
    // We filter server-side for /tmp/ path segment and age.
    // pageToken loop handles buckets with >1000 objects.
    let totalScanned = 0;
    let totalDeleted = 0;
    let pageToken: string | undefined;

    do {
      const [files, , nextQuery] = await bucket.getFiles({
        prefix: 'Users/',
        maxResults: 1000,
        ...(pageToken ? { pageToken } : {}),
      });

      pageToken = (nextQuery as Record<string, string> | undefined)?.['pageToken'];
      totalScanned += files.length;

      const deletionQueue: Promise<void>[] = [];

      for (const file of files) {
        // Must contain /tmp/ segment to qualify
        if (!file.name.includes('/tmp/')) continue;

        const createdMs = file.metadata.timeCreated
          ? new Date(file.metadata.timeCreated as string).getTime()
          : 0;

        if (createdMs === 0 || createdMs > cutoffMs) continue;

        deletionQueue.push(
          file
            .delete()
            .then(() => {
              totalDeleted++;
            })
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn('Failed to delete tmp file', { path: file.name, error: msg });
            })
        );
      }

      // Batch deletes — up to 50 concurrent GCS deletes per page
      for (let i = 0; i < deletionQueue.length; i += 50) {
        await Promise.all(deletionQueue.slice(i, i + 50));
      }
    } while (pageToken);

    logger.info('CRON cleanup-tmp-media completed', {
      totalScanned,
      totalDeleted,
      ttlDays: TMP_TTL_DAYS,
      cutoff: new Date(cutoffMs).toISOString(),
    });

    res.json({ success: true, data: { totalScanned, totalDeleted, ttlDays: TMP_TTL_DAYS } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON cleanup-tmp-media failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Tmp media cleanup failed' });
  }
});

// ─── POST /cron/cleanup-media-proxy-tmp ──────────────────────────────────
// Sweeps the per-instance media-proxy /tmp directory for orphaned upload
// files that outlived their per-record cleanup timer (e.g. process restarts).
// Per-upload timers handle the common case; this cron is a belt-and-suspenders
// guarantee so disk usage cannot grow unbounded.
//
// Cloud Scheduler: every day at 4:45 AM ET  (cron: 45 4 * * *)

router.post('/cron/cleanup-media-proxy-tmp', cronGuard, async (_req: Request, res: Response) => {
  try {
    const result = await AgentEphemeralStateService.sweepOrphanedTempFiles();
    logger.info('CRON cleanup-media-proxy-tmp completed', result);
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON cleanup-media-proxy-tmp failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Media-proxy tmp sweep failed' });
  }
});

// ─── POST /cron/approval-expiry-notifications ─────────────────────────────
// Cloud Scheduler: every 1 minute  (cron: * * * * *)
// Scans pending approvals within 5 min of expiry and sends a push notification.
// Uses `expiryPushSent` flag to ensure at-most-once delivery per approval.

router.post(
  '/cron/approval-expiry-notifications',
  cronGuard,
  async (req: Request, res: Response) => {
    try {
      const db = (
        req as typeof req & { firebase?: { db: import('firebase-admin').firestore.Firestore } }
      ).firebase?.db;
      if (!db) {
        res.status(503).json({ success: false, error: 'Firestore not available' });
        return;
      }

      const { ApprovalGateService } =
        await import('../../modules/agent/services/approval-gate.service.js');
      const approvalGate = new ApprovalGateService(db);
      const result = await approvalGate.notifyExpiringSoon();

      logger.info('CRON approval-expiry-notifications completed', result);
      res.json({ success: true, data: result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON approval-expiry-notifications failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Approval expiry notifications failed' });
    }
  }
);

export default router;
