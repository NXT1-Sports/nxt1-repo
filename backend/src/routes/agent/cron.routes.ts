/**
 * @fileoverview Agent X — Cloud Scheduler cron trigger routes.
 *
 * POST /cron/daily-briefings
 * POST /cron/summarize-threads
 * POST /cron/cleanup-thread-media
 * POST /cron/reconcile-job-thread-links
 * POST /cron/compress-old-videos
 */

import { Router, type Request, type Response } from 'express';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { cronGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { chatService, llmService, queueService } from './shared.js';
import { AgentLinkReconciliationService } from '../../modules/agent/services/agent-link-reconciliation.service.js';
import { AgentEphemeralStateService } from '../../modules/agent/services/agent-ephemeral-state.service.js';
import { AgentJobAutoResolverService } from '../../modules/agent/services/agent-job-auto-resolver.service.js';
import { AgentJobRepository } from '../../modules/agent/queue/job.repository.js';
import { getCloudflareAnalyticsSyncService } from '../../services/platform/cloudflare-analytics-sync.service.js';
import { sendSlackAlert } from '../../services/platform/alert.service.js';

const router = Router();

const activeCronRuns = new Set<string>();
const STALE_QUEUED_THRESHOLD_MS = 100 * 60 * 1000;
const STALE_SYSTEM_CRON_YIELDED_THRESHOLD_MS = 72 * 60 * 60 * 1000;
const STALE_USER_YIELDED_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_YIELDED_STATUSES = ['paused', 'awaiting_input', 'awaiting_approval'] as const;
const TMP_TTL_DAYS = 7;
const TMP_MEDIA_STORAGE_MAX_ATTEMPTS = 4;
const TMP_MEDIA_STORAGE_RETRY_DELAYS_MS = [500, 1_500, 3_000] as const;

type CleanupStaleJobsRepository = Pick<AgentJobRepository, 'markFailed' | 'markCancelled'>;

interface CleanupStaleAgentJobsArgs {
  db: Firestore;
  now?: Date;
  limitPerStatus?: number;
  jobRepository?: CleanupStaleJobsRepository;
  clearThreadPausedYieldState?: (threadId: string) => Promise<unknown>;
}

interface CleanupStaleAgentJobsResult {
  scanned: number;
  queuedScanned: number;
  yieldedScanned: number;
  markedFailed: number;
  cancelled: number;
  cancelledSystemCronYielded: number;
  cancelledUserYielded: number;
  skippedYielded: number;
  failedToUpdate: number;
  threadStateClearFailures: number;
}

interface TmpMediaStorageFile {
  readonly name: string;
  readonly metadata: {
    readonly timeCreated?: unknown;
  };
  delete(): Promise<unknown>;
}

interface TmpMediaStorageBucket {
  getFiles(query: {
    prefix: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<[TmpMediaStorageFile[], unknown, unknown]>;
}

interface TmpMediaStorage {
  bucket(): TmpMediaStorageBucket;
}

export interface CleanupTmpMediaResult {
  totalScanned: number;
  totalDeleted: number;
  ttlDays: number;
  cutoff: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  const code = record.code ?? record.status ?? record.statusCode;
  return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

function isRetryableFirebaseStorageError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (typeof code === 'number' && [408, 429, 500, 502, 503, 504].includes(code)) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('premature close') ||
    message.includes('invalid response body') ||
    message.includes('oauth2.googleapis.com/token') ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed') ||
    message.includes('aborted') ||
    message.includes('tls')
  );
}

function getNextPageToken(nextQuery: unknown): string | undefined {
  if (!nextQuery || typeof nextQuery !== 'object') return undefined;
  const pageToken = (nextQuery as { pageToken?: unknown }).pageToken;
  return typeof pageToken === 'string' && pageToken.length > 0 ? pageToken : undefined;
}

async function runTmpMediaStorageStepWithRetry<T>(
  operation: 'list_tmp_media' | 'delete_tmp_media',
  action: () => Promise<T>,
  context: Record<string, unknown>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TMP_MEDIA_STORAGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const retryable = isRetryableFirebaseStorageError(error);
      const finalAttempt = attempt >= TMP_MEDIA_STORAGE_MAX_ATTEMPTS;

      if (finalAttempt || !retryable) {
        throw error;
      }

      const delayMs = TMP_MEDIA_STORAGE_RETRY_DELAYS_MS[attempt - 1] ?? 3_000;
      logger.warn('[TmpMediaCleanup] Retrying transient Firebase Storage operation', {
        operation,
        attempt,
        maxAttempts: TMP_MEDIA_STORAGE_MAX_ATTEMPTS,
        delayMs,
        error: getErrorMessage(error),
        ...context,
      });
      await delay(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function toTimestampMs(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const parsed = (value as { toDate: () => Date }).toDate().getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function queryStaleJobsByStatus(
  db: Firestore,
  status: (typeof STALE_YIELDED_STATUSES)[number] | 'queued',
  cutoff: Date,
  limitPerStatus: number
): Promise<QueryDocumentSnapshot[]> {
  const snapshot = await db
    .collection('AgentJobs')
    .where('status', '==', status)
    .where('createdAt', '<', cutoff)
    .limit(limitPerStatus)
    .get();

  return snapshot.docs;
}

export async function cleanupStaleAgentJobs({
  db,
  now = new Date(),
  limitPerStatus = 100,
  jobRepository = new AgentJobRepository(db),
  clearThreadPausedYieldState = async (threadId: string) => {
    if (!chatService) return;
    await chatService.clearThreadPausedYieldState(threadId);
  },
}: CleanupStaleAgentJobsArgs): Promise<CleanupStaleAgentJobsResult> {
  const queuedCutoff = new Date(now.getTime() - STALE_QUEUED_THRESHOLD_MS);
  const yieldedQueryCutoff = new Date(now.getTime() - STALE_SYSTEM_CRON_YIELDED_THRESHOLD_MS);
  const userYieldedCutoffMs = now.getTime() - STALE_USER_YIELDED_THRESHOLD_MS;

  const queuedDocs = await queryStaleJobsByStatus(db, 'queued', queuedCutoff, limitPerStatus);
  const yieldedDocs = (
    await Promise.all(
      STALE_YIELDED_STATUSES.map((status) =>
        queryStaleJobsByStatus(db, status, yieldedQueryCutoff, limitPerStatus)
      )
    )
  ).flat();

  let markedFailed = 0;
  let cancelled = 0;
  let cancelledSystemCronYielded = 0;
  let cancelledUserYielded = 0;
  let skippedYielded = 0;
  let failedToUpdate = 0;
  let threadStateClearFailures = 0;

  for (const doc of queuedDocs) {
    try {
      await jobRepository.markFailed(doc.id, 'Job timed out - no activity for over 100 minutes');
      markedFailed += 1;
    } catch (markErr) {
      logger.error('Failed to mark stale queued job as failed', {
        operationId: doc.id,
        error: markErr instanceof Error ? markErr.message : String(markErr),
      });
      failedToUpdate += 1;
    }
  }

  for (const doc of yieldedDocs) {
    const job = doc.data() as {
      createdAt?: unknown;
      origin?: string | null;
      threadId?: string | null;
    };
    const createdAtMs = toTimestampMs(job.createdAt);
    const isSystemCron = job.origin === 'system_cron';
    const isUserExpired =
      job.origin === 'user' && createdAtMs !== null && createdAtMs <= userYieldedCutoffMs;

    if (!isSystemCron && !isUserExpired) {
      skippedYielded += 1;
      continue;
    }

    const cancellationMessage = isSystemCron
      ? 'Operation auto-cancelled after waiting more than 72 hours for scheduled follow-up.'
      : 'Operation auto-cancelled after waiting more than 7 days for user follow-up.';

    try {
      await jobRepository.markCancelled(doc.id, { message: cancellationMessage });
      cancelled += 1;
      if (isSystemCron) {
        cancelledSystemCronYielded += 1;
      } else {
        cancelledUserYielded += 1;
      }
    } catch (markErr) {
      logger.error('Failed to cancel stale yielded job', {
        operationId: doc.id,
        error: markErr instanceof Error ? markErr.message : String(markErr),
      });
      failedToUpdate += 1;
      continue;
    }

    if (typeof job.threadId !== 'string' || job.threadId.length === 0) continue;

    try {
      await clearThreadPausedYieldState(job.threadId);
    } catch (clearErr) {
      logger.warn('Failed to clear paused yield state for stale yielded job', {
        operationId: doc.id,
        threadId: job.threadId,
        error: clearErr instanceof Error ? clearErr.message : String(clearErr),
      });
      threadStateClearFailures += 1;
    }
  }

  return {
    scanned: queuedDocs.length + yieldedDocs.length,
    queuedScanned: queuedDocs.length,
    yieldedScanned: yieldedDocs.length,
    markedFailed,
    cancelled,
    cancelledSystemCronYielded,
    cancelledUserYielded,
    skippedYielded,
    failedToUpdate,
    threadStateClearFailures,
  };
}

function runCronTaskInBackground(taskKey: string, task: () => Promise<void>): boolean {
  if (activeCronRuns.has(taskKey)) {
    logger.warn('CRON task already running, skipping duplicate kickoff', { taskKey });
    return false;
  }

  activeCronRuns.add(taskKey);
  void (async () => {
    try {
      await task();
    } finally {
      activeCronRuns.delete(taskKey);
    }
  })();

  return true;
}

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
  const started = runCronTaskInBackground('weekly-playbooks', async () => {
    try {
      const { runWeeklyPlaybooks } =
        await import('../../modules/agent/triggers/trigger.listeners.js');
      await runWeeklyPlaybooks();
      logger.info('CRON weekly playbooks completed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON weekly playbooks failed', { error: error.message, stack: error.stack });
    }
  });

  res.json({
    success: true,
    message: started ? 'Weekly playbooks started' : 'Weekly playbooks already running',
    status: started ? 'running' : 'already_running',
  });
});

// ─── POST /cron/suggested-actions ────────────────────────────────────────
// Cloud Scheduler: every Sunday at 9:00 AM  (cron: 0 9 * * 0)

router.post('/cron/suggested-actions', cronGuard, async (_req: Request, res: Response) => {
  const started = runCronTaskInBackground('suggested-actions', async () => {
    try {
      const { runWeeklySuggestedActions } =
        await import('../../modules/agent/triggers/trigger.listeners.js');
      await runWeeklySuggestedActions();
      logger.info('CRON suggested-actions completed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON suggested-actions failed', { error: error.message, stack: error.stack });
    }
  });

  res.json({
    success: true,
    message: started
      ? 'Weekly suggested actions started'
      : 'Weekly suggested actions already running',
    status: started ? 'running' : 'already_running',
  });
});

// ─── POST /cron/playbook-nudge ────────────────────────────────────────────
// Cloud Scheduler: Wednesday + Saturday at 6:00 PM  (cron: 0 18 * * 3,6)
// Sends a personalized mid-week progress check-in push for active playbooks.

router.post('/cron/playbook-nudge', cronGuard, async (_req: Request, res: Response) => {
  const started = runCronTaskInBackground('playbook-nudge', async () => {
    try {
      const { runPlaybookNudge } =
        await import('../../modules/agent/triggers/trigger.listeners.js');
      await runPlaybookNudge();
      logger.info('CRON playbook-nudge completed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON playbook-nudge failed', { error: error.message, stack: error.stack });
    }
  });

  res.json({
    success: true,
    message: started ? 'Playbook nudge started' : 'Playbook nudge already running',
    status: started ? 'running' : 'already_running',
  });
});

// ─── POST /cron/weekly-recaps ─────────────────────────────────────────────
// Cloud Scheduler: every Friday at 9:00 AM  (cron: 0 9 * * 5)

router.post('/cron/weekly-recaps', cronGuard, async (_req: Request, res: Response) => {
  const started = runCronTaskInBackground('weekly-recaps', async () => {
    try {
      const { runWeeklyRecaps } = await import('../../modules/agent/triggers/trigger.listeners.js');
      const result = await runWeeklyRecaps();
      logger.info('CRON weekly-recaps completed', { ...result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON weekly recaps failed', { error: error.message, stack: error.stack });
    }
  });

  res.json({
    success: true,
    message: started ? 'Weekly recaps started' : 'Weekly recaps already running',
    status: started ? 'running' : 'already_running',
  });
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
    const { getRuntimeEnvironment } = await import('../../config/runtime-environment.js');
    const { db: appDb } = await import('../../utils/firebase.js');
    const { stagingDb } = await import('../../utils/firebase-staging.js');

    const runtimeFirestore = getRuntimeEnvironment() === 'production' ? appDb : stagingDb;
    const vectorMemory = new VectorMemoryService(llmService);
    const summarizer = new MemorySummarizationService(
      llmService,
      vectorMemory,
      undefined,
      runtimeFirestore
    );
    const result = await summarizer.summarizeInactiveThreads();

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON summarize-threads failed', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Thread summarization failed',
      detail: error.message,
      stack: error.stack,
    });
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
    res.status(500).json({
      success: false,
      error: 'Timeline scan failed',
      detail: error.message,
      stack: error.stack,
    });
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
    res.status(500).json({
      success: false,
      error: 'Thread media cleanup failed',
      detail: error.message,
      stack: error.stack,
    });
  }
});

// ─── POST /cron/cleanup-stale-jobs ────────────────────────────────────────
// Marks stale queued jobs as failed and retires stale yielded jobs.
// Called every 15 minutes by the cleanupStaleAgentJobs Cloud Function.

router.post('/cron/cleanup-stale-jobs', cronGuard, async (req: Request, res: Response) => {
  try {
    const db = (req as typeof req & { firebase?: { db: Firestore } }).firebase?.db;
    if (!db) {
      logger.warn('Firestore context not attached to request');
      res.status(503).json({ success: false, error: 'Firestore not available' });
      return;
    }

    logger.info('CRON cleanup-stale-jobs starting', {
      queuedThresholdMinutes: STALE_QUEUED_THRESHOLD_MS / 60_000,
      systemCronYieldedThresholdHours: STALE_SYSTEM_CRON_YIELDED_THRESHOLD_MS / 3_600_000,
      userYieldedThresholdHours: STALE_USER_YIELDED_THRESHOLD_MS / 3_600_000,
    });

    const result = await cleanupStaleAgentJobs({ db });

    logger.info('CRON cleanup-stale-jobs completed', {
      ...result,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON cleanup-stale-jobs failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Stale job cleanup failed' });
  }
});

// ─── POST /cron/resolve-failed-jobs ───────────────────────────────────────
// Replays retryable failed Agent X jobs as no-charge recovery jobs.

router.post('/cron/resolve-failed-jobs', cronGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Queue service not initialized' });
      return;
    }

    const db = (req as typeof req & { firebase?: { db: Firestore } }).firebase?.db;
    if (!db) {
      logger.warn('Firestore context not attached to request');
      res.status(503).json({ success: false, error: 'Firestore not available' });
      return;
    }

    const { getRuntimeEnvironment } = await import('../../config/runtime-environment.js');
    const environment = getRuntimeEnvironment() === 'production' ? 'production' : 'staging';
    const jobRepository = new AgentJobRepository(db);
    const resolver = new AgentJobAutoResolverService(db, queueService, jobRepository);
    const result = await resolver.resolveFailedJobs({ environment });

    logger.info('CRON resolve-failed-jobs completed', { result });
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON resolve-failed-jobs failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed job resolver failed' });
  }
});

// ─── POST /cron/reconcile-job-thread-links ──────────────────────────────────
// Repairs missing Firestore AgentJobs.threadId links using MongoDB messages.
// Called every 6 hours by the reconcileAgentJobThreadLinks Cloud Function.

router.post('/cron/reconcile-job-thread-links', cronGuard, async (req: Request, res: Response) => {
  try {
    const db = (req as typeof req & { firebase?: { db: Firestore } }).firebase?.db;
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

export async function cleanupTmpMedia(
  storage: TmpMediaStorage,
  now: Date = new Date()
): Promise<CleanupTmpMediaResult> {
  const bucket = storage.bucket();
  const cutoffMs = now.getTime() - TMP_TTL_DAYS * 24 * 60 * 60 * 1000;

  // GCS list with prefix="Users/" — iterates all user-owned objects.
  // We filter server-side for /tmp/ path segment and age.
  // pageToken loop handles buckets with >1000 objects.
  let totalScanned = 0;
  let totalDeleted = 0;
  let pageToken: string | undefined;

  do {
    const [files, , nextQuery] = await runTmpMediaStorageStepWithRetry(
      'list_tmp_media',
      () =>
        bucket.getFiles({
          prefix: 'Users/',
          maxResults: 1000,
          ...(pageToken ? { pageToken } : {}),
        }),
      { pageToken: pageToken ?? null }
    );

    pageToken = getNextPageToken(nextQuery);
    totalScanned += files.length;

    const deletionQueue: Array<() => Promise<void>> = [];

    for (const file of files) {
      // Must contain /tmp/ segment to qualify
      if (!file.name.includes('/tmp/')) continue;

      const createdMs =
        typeof file.metadata.timeCreated === 'string'
          ? new Date(file.metadata.timeCreated).getTime()
          : 0;

      if (createdMs === 0 || createdMs > cutoffMs) continue;

      deletionQueue.push(async () => {
        try {
          await runTmpMediaStorageStepWithRetry('delete_tmp_media', () => file.delete(), {
            path: file.name,
          });
          totalDeleted++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('Failed to delete tmp file', { path: file.name, error: msg });
        }
      });
    }

    // Batch deletes — up to 50 concurrent GCS deletes per page
    for (let i = 0; i < deletionQueue.length; i += 50) {
      await Promise.all(deletionQueue.slice(i, i + 50).map((deleteFile) => deleteFile()));
    }
  } while (pageToken);

  return {
    totalScanned,
    totalDeleted,
    ttlDays: TMP_TTL_DAYS,
    cutoff: new Date(cutoffMs).toISOString(),
  };
}

router.post('/cron/cleanup-tmp-media', cronGuard, async (req: Request, res: Response) => {
  try {
    const storage = req.firebase?.storage;
    if (!storage) {
      res.status(503).json({ success: false, error: 'Firebase Storage not available' });
      return;
    }

    const result = await cleanupTmpMedia(storage);

    logger.info('CRON cleanup-tmp-media completed', {
      totalScanned: result.totalScanned,
      totalDeleted: result.totalDeleted,
      ttlDays: result.ttlDays,
      cutoff: result.cutoff,
    });

    res.json({
      success: true,
      data: {
        totalScanned: result.totalScanned,
        totalDeleted: result.totalDeleted,
        ttlDays: result.ttlDays,
      },
    });
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
      const db = (req as typeof req & { firebase?: { db: Firestore } }).firebase?.db;
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

// ─── POST /cron/queue-depth-check ────────────────────────────────────────────
// Cloud Scheduler: every 5 minutes  (cron: */5 * * * *)
// Checks BullMQ queue depth and dead-letter backlog; posts to Slack when
// thresholds are exceeded so the team can react before jobs pile up.
//
// Thresholds:
//   waiting > QUEUE_WAITING_ALERT_THRESHOLD  → possible worker crash / traffic spike
//   failed  > QUEUE_FAILED_ALERT_THRESHOLD   → dead-letter backlog growing

const QUEUE_WAITING_ALERT_THRESHOLD = 20;
const QUEUE_FAILED_ALERT_THRESHOLD = 50;

router.post('/cron/queue-depth-check', cronGuard, async (_req: Request, res: Response) => {
  if (!queueService) {
    res.status(503).json({ success: false, error: 'Queue service not initialized' });
    return;
  }

  try {
    const counts = await queueService.getCounts();
    const waiting = counts['waiting'] ?? 0;
    const active = counts['active'] ?? 0;
    const failed = counts['failed'] ?? 0;
    const delayed = counts['delayed'] ?? 0;

    logger.info('CRON queue-depth-check', { waiting, active, failed, delayed });

    const alerts: Promise<boolean>[] = [];

    if (waiting > QUEUE_WAITING_ALERT_THRESHOLD) {
      logger.warn('Queue depth exceeded threshold — sending Slack alert', {
        waiting,
        threshold: QUEUE_WAITING_ALERT_THRESHOLD,
      });
      alerts.push(
        sendSlackAlert({
          target: 'agent',
          severity: 'critical',
          title: 'Agent Queue Backlog Alert',
          summary: `BullMQ waiting queue depth has exceeded the alert threshold. The worker may be down or traffic has spiked.`,
          fields: [
            { label: 'Waiting', value: String(waiting) },
            { label: 'Active', value: String(active) },
            { label: 'Delayed', value: String(delayed) },
            { label: 'Threshold', value: String(QUEUE_WAITING_ALERT_THRESHOLD) },
          ],
          linkText: 'Queue Stats',
          linkUrl: `${process.env['BACKEND_URL'] ?? ''}/api/v1/agent/queue-stats`,
        })
      );
    }

    if (failed > QUEUE_FAILED_ALERT_THRESHOLD) {
      logger.warn('Dead-letter backlog exceeded threshold — sending Slack alert', {
        failed,
        threshold: QUEUE_FAILED_ALERT_THRESHOLD,
      });
      alerts.push(
        sendSlackAlert({
          target: 'agent',
          severity: 'warning',
          title: 'Agent Queue Dead-Letter Backlog Alert',
          summary: `The failed job count has exceeded the alert threshold. Review and clear stale entries to keep Redis memory healthy.`,
          fields: [
            { label: 'Failed Jobs', value: String(failed) },
            { label: 'Threshold', value: String(QUEUE_FAILED_ALERT_THRESHOLD) },
          ],
          linkText: 'Queue Stats',
          linkUrl: `${process.env['BACKEND_URL'] ?? ''}/api/v1/agent/queue-stats`,
        })
      );
    }

    await Promise.allSettled(alerts);

    res.json({
      success: true,
      data: {
        counts: { waiting, active, failed, delayed },
        alertsFired: alerts.length,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON queue-depth-check failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Queue depth check failed' });
  }
});

// ─── POST /cron/compress-old-videos ──────────────────────────────────────
// Cloud Scheduler: every day at 2:00 AM ET  (cron: 0 2 * * *)
//
// Compresses video files in Firebase Storage that are ≥ 3 days old and
// have not yet been compressed (nxt1-compressed custom metadata not set).
// Overwrites the original GCS path so all existing Storage URLs remain valid.
//
// Optional body params:
//   { "dryRun": true } — list candidates, skip compression

router.post('/cron/compress-old-videos', cronGuard, async (req: Request, res: Response) => {
  const dryRun = req.body?.dryRun === true;

  logger.info('CRON compress-old-videos starting', { dryRun });

  if (dryRun) {
    // dryRun is fast (no ffmpeg) — run synchronously and return full candidate list.
    try {
      const { VideoCompressionWorker } = await import('../../workers/video-compression.worker.js');
      const result = await VideoCompressionWorker.run({ dryRun: true });
      logger.info('CRON compress-old-videos dryRun completed', {
        candidates: result.candidates?.length ?? 0,
        skipped: result.skipped,
      });
      res.json({
        success: true,
        data: {
          processed: 0,
          skipped: result.skipped,
          errors: 0,
          bytesReducedMb: 0,
          dryRun: true,
          candidates: result.candidates ?? [],
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON compress-old-videos dryRun failed', { error: error.message });
      res.status(500).json({ success: false, error: 'Video compression dry-run failed' });
    }
    return;
  }

  // Real compression: respond 202 immediately, run worker in background.
  // ffmpeg-mcp can take several minutes for a full batch — never block the HTTP response.
  res.status(202).json({ success: true, message: 'Video compression started in background' });

  // Fire-and-forget — errors are caught and logged; they must not crash the process.
  (async () => {
    try {
      const { VideoCompressionWorker } = await import('../../workers/video-compression.worker.js');
      const result = await VideoCompressionWorker.run({ dryRun: false });
      logger.info('CRON compress-old-videos completed', {
        processed: result.processed,
        skipped: result.skipped,
        errors: result.errors,
        bytesReducedMb: (result.bytesReduced / 1024 / 1024).toFixed(1),
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('CRON compress-old-videos failed', { error: error.message, stack: error.stack });
    }
  })();
});

export default router;
