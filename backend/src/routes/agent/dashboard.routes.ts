/**
 * @fileoverview Agent X — Dashboard, history, operations-log, goals, upload routes.
 *
 * GET  /jobs/:operationId
 * GET  /history
 * GET  /operations-log
 * GET  /dashboard
 * POST /goals
 * POST /upload
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { uploadRateLimit } from '../../middleware/rate-limit/rate-limit.middleware.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { SetGoalsDto, CompleteGoalDto } from '../../dtos/agent-x.dto.js';
import type {
  AgentDashboardGoal,
  ShellActionChip,
  ShellWeeklyPlaybookItem,
  ShellBriefingInsight,
  OperationLogEntry,
  CompletedGoalRecord,
  TeamGamePlanDoc,
} from '@nxt1/core';
import { AGENT_X_MAX_VIDEO_FILE_SIZE } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import firebaseAdmin from '../../utils/firebase.js';
import {
  getAgentAppConfig,
  resolveConfiguredCoordinatorsForRole,
} from '../../modules/agent/config/agent-app-config.js';
import {
  validateJobOrigin,
  isScheduledOrigin,
  mapJobStatus,
  inferCategory,
  iconForCategory,
  computeDuration,
} from './operations-log.helpers.js';
import {
  jobRepository,
  chatService,
  queueService,
  agentUpload,
  getAuthUser,
  getGenerationService,
  isLegacyFallbackPlaybook,
  contextBuilder,
} from './shared.js';
import { AgentMediaLifecycleService } from '../../modules/agent/tools/media/agent-media-lifecycle.service.js';
import { canManageTeamMutationForUser } from '../../services/team/team-intel-permissions.js';
import { getCacheService } from '../../services/core/cache.service.js';

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
  };
};

type ErrorWithCode = Error & {
  code?: string;
};

type TimestampLike = {
  toMillis(): number;
};

type RepeatableJobDescriptor = {
  key: string;
  next?: number | null;
  tz?: string;
};

type FirestoreDocLike = {
  id: string;
  data(): Record<string, unknown>;
};

const router = Router();
const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;
const TEAM_GAMEPLANS_COLLECTION = 'TeamGamePlans' as const;
const TEAMS_COLLECTION = 'Teams' as const;
const MB = 1024 * 1024;
const GB = 1024 * MB;
const VIDEO_UPLOAD_URL_TTL_MS_SMALL = 30 * 60 * 1000;
const VIDEO_UPLOAD_URL_TTL_MS_MEDIUM = 60 * 60 * 1000;
const VIDEO_UPLOAD_URL_TTL_MS_LARGE = 120 * 60 * 1000;

function formatSizeLabel(bytes: number): string {
  if (bytes >= GB) {
    const value = bytes / GB;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} GB`;
  }
  return `${Math.round(bytes / MB)} MB`;
}

function parsePositiveIntEnv(input: string | undefined): number | null {
  if (!input) return null;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function resolveVideoUploadUrlTtlMs(fileSize: number): number {
  const configuredTtlMs = parsePositiveIntEnv(process.env['AGENT_X_VIDEO_UPLOAD_URL_TTL_MS']);
  if (configuredTtlMs) return configuredTtlMs;

  if (fileSize <= 250 * MB) return VIDEO_UPLOAD_URL_TTL_MS_SMALL;
  if (fileSize <= GB) return VIDEO_UPLOAD_URL_TTL_MS_MEDIUM;
  return VIDEO_UPLOAD_URL_TTL_MS_LARGE;
}

function parsePositiveInt(input: unknown, fallback: number, max: number): number {
  const value = typeof input === 'string' ? Number(input) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function normalizeString(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const value = input.trim();
  return value.length > 0 ? value : undefined;
}

function toGameplanSummary(item: TeamGamePlanDoc): Record<string, unknown> {
  return {
    id: item.id,
    teamId: item.teamId,
    sport: item.sport,
    title: item.title,
    phase: item.phase,
    status: item.status,
    season: item.season,
    division: item.division,
    gameDate: item.gameDate,
    opponentId: item.opponentId,
    opponentName: item.opponentName,
    identityFocus: item.identityFocus,
    primaryAttackPlan: item.primaryAttackPlan,
    defensivePriorities: item.defensivePriorities,
    specialSituations: item.specialSituations,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
    adjustmentTriggerCount: item.adjustmentTriggers?.length ?? 0,
    halftimePriorityCount: item.halftimePriorities?.length ?? 0,
    customSectionCount: item.customSections?.length ?? 0,
    linkedPlayCount: item.linkedPlays?.length ?? 0,
  };
}

function readRecurringTaskString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveRecurringTaskSourceId(data: Record<string, unknown>): string | undefined {
  return (
    readRecurringTaskString(data, 'sourceId') ??
    readRecurringTaskString(data, 'threadId') ??
    readRecurringTaskString(data, 'sourceThreadId')
  );
}

function buildRecurringTaskPayload(userId: string, actionSummary: string, sourceId?: string) {
  const timestamp = Date.now();
  return {
    operationId: `recurring-${userId}-${timestamp}`,
    userId,
    intent: actionSummary,
    sessionId: `scheduled-${userId}`,
    origin: 'system_cron' as const,
    ...(sourceId
      ? {
          context: {
            sourceId,
            threadId: sourceId,
          },
        }
      : {}),
  };
}

// ─── GET /jobs/:operationId ─────────────────────────────────────────────────

router.get('/jobs/:operationId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const operationId = req.params['operationId'] as string;
    const { db } = req.firebase!;
    const job = await jobRepository.withDb(db).getById(operationId);

    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    // Enforce ownership — only the job owner can poll their own job.
    if (job.userId !== user.uid) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const progress = job.progress;

    res.json({
      success: true,
      data: {
        jobId: job.operationId,
        operationId,
        status: job.status,
        progress: progress
          ? { percent: progress.percent ?? 0, message: progress.message ?? '' }
          : undefined,
        result: job.result,
        error: job.error,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get job status', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get job status' });
  }
});

// ─── GET /history ─────────────────────────────────────────────────────────

router.get('/history', appGuard, async (req: Request, res: Response) => {
  try {
    if (!jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitParam = req.query['limit'];
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '20') || 20, 50);
    const { db } = req.firebase!;
    const jobs = await jobRepository.withDb(db).getByUser(user.uid, limit);

    res.json({ success: true, data: jobs });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get job history', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get history' });
  }
});

// ─── GET /operations-log ──────────────────────────────────────────────────

router.get('/operations-log', appGuard, async (req: Request, res: Response) => {
  try {
    if (!jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitParam = req.query['limit'];
    const rawLimit = typeof limitParam === 'string' ? Number(limitParam) : NaN;
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 150) : 150;

    const { db } = req.firebase!;

    let jobs: import('../../modules/agent/queue/job.repository.js').AgentJobDocument[];
    try {
      jobs = await jobRepository.withDb(db).getByUser(user.uid, limit);
    } catch (queryErr) {
      const msg = queryErr instanceof Error ? queryErr.message : String(queryErr);
      logger.warn('agentJobs query failed — composite index may not be deployed', {
        userId: user.uid,
        error: msg,
      });
      jobs = [];
    }

    let activeThreads: Awaited<
      ReturnType<NonNullable<typeof chatService>['getUserThreads']>
    >['items'] = [];
    const activeThreadIds = new Set<string>();
    const threadTitleById = new Map<string, string>();
    // Track whether the thread query ran successfully. When true, activeThreadIds
    // is authoritative — even if empty (user archived everything). When false
    // (query threw), we fall back to lenient filtering to avoid hiding valid jobs.
    let threadQuerySucceeded = false;

    if (chatService) {
      try {
        const threadResult = await chatService.getUserThreads({
          userId: user.uid,
          archived: false,
          limit,
        });
        activeThreads = threadResult.items ?? [];
        threadQuerySucceeded = true;

        for (const thread of activeThreads) {
          if (!thread.id) continue;
          activeThreadIds.add(thread.id);
          threadTitleById.set(thread.id, thread.title);
        }

        if (threadResult.hasMore) {
          logger.info('Operations log thread augmentation truncated — consider increasing limit', {
            userId: user.uid,
            displayedCount: activeThreads.length,
            limit,
          });
        }
      } catch (threadErr) {
        logger.warn('Failed to fetch active threads for operations log filtering', {
          userId: user.uid,
          error: threadErr instanceof Error ? threadErr.message : String(threadErr),
        });
      }
    }

    // ── Deduplicate by threadId (professional-app pattern) ────────────────
    // jobs[] is ordered by createdAt DESC from Firestore, so the first job
    // seen for a threadId is the most recent and represents the conversation's
    // current state. All later jobs for the same thread (retries, fan-out
    // chunks, follow-up turns, child operations from tools) collapse into
    // that single sidebar row. This mirrors how ChatGPT, Claude, Linear, and
    // Cursor present agent sessions: one row per conversation.
    //
    // Jobs without a threadId (rare — typically orphaned enqueue jobs) keep
    // their own row keyed by operationId.
    //
    // Child operations (context.parentOperationId set) are never rendered as
    // their own row regardless of thread state — they are sub-steps of the
    // parent and surface only inside the parent's operations log panel.

    const seenThreadIds = new Set<string>();
    const entries: OperationLogEntry[] = [];
    const representedThreadIds = new Set<string>();

    for (const job of jobs) {
      const operationId = (job['operationId'] as string) ?? '';
      const jobContext = (job as typeof job & { context?: unknown }).context;
      const jobMode =
        jobContext && typeof jobContext === 'object' && 'mode' in jobContext
          ? typeof (jobContext as { mode?: unknown }).mode === 'string'
            ? (jobContext as { mode: string }).mode
            : undefined
          : undefined;
      const parentOperationId =
        jobContext && typeof jobContext === 'object' && 'parentOperationId' in jobContext
          ? typeof (jobContext as { parentOperationId?: unknown }).parentOperationId === 'string'
            ? (jobContext as { parentOperationId: string }).parentOperationId
            : undefined
          : undefined;

      // Option 2 UX: hide background playbook-generation jobs from session history.
      // These jobs do not create a chat thread and open as empty chats when tapped.
      if (operationId.startsWith('playbook-') || jobMode === 'playbook') {
        continue;
      }

      // Child operations never surface in the sidebar. They live inside the
      // parent operation's expanded operations log.
      if (parentOperationId) {
        continue;
      }

      const intent = (job['intent'] as string) ?? '';
      if (!intent) continue;

      const status = mapJobStatus(
        (job['status'] as string) ?? '',
        (raw: string) => logger.warn('Unknown job status mapped to in-progress', { status: raw }),
        job['yieldState']
      );
      const threadId = (job['threadId'] as string) ?? undefined;
      const resolvedTitle = threadId ? (threadTitleById.get(threadId)?.trim() ?? '') : '';

      // Single-thread dedupe: one sidebar row per thread, regardless of status.
      // The newest job (already first thanks to DESC ordering) wins — its
      // status drives the row's "Processing…", "Awaiting input", etc. badge.
      if (threadId) {
        // Guardrail: ignore stale jobs referencing deleted/archived threads.
        // Only apply when threadQuerySucceeded — distinguishes "query returned 0
        // active threads" (user archived everything) from "query failed" (be lenient).
        if (threadQuerySucceeded && !activeThreadIds.has(threadId)) continue;

        if (seenThreadIds.has(threadId)) continue;
        seenThreadIds.add(threadId);
        representedThreadIds.add(threadId);
      }

      const category = inferCategory(intent);
      const createdAt = job['createdAt'] as TimestampLike | undefined;
      const completedAt = job['completedAt'] as TimestampLike | undefined | null;
      const result = job['result'] as { summary?: string } | null | undefined;
      const jobOrigin = validateJobOrigin(job['origin']);
      const isScheduled = isScheduledOrigin(jobOrigin);

      // Prefer the thread's title (user-meaningful conversation label) over
      // the per-operation intent. Fall back to the first line of intent when
      // a title hasn't been generated yet.
      const intentFirstLine = intent.split('\n')[0] ?? intent;
      const displayTitle = resolvedTitle || intentFirstLine;

      entries.push({
        id: (job['operationId'] as string) ?? threadId ?? '',
        operationId: (job['operationId'] as string) ?? undefined,
        title: displayTitle.slice(0, 120),
        summary:
          result?.summary ??
          (status === 'error' ? ((job['error'] as string) ?? 'Operation failed') : 'Processing...'),
        icon: iconForCategory(category),
        status,
        category,
        timestamp: createdAt
          ? new Date(createdAt.toMillis()).toISOString()
          : new Date().toISOString(),
        duration: computeDuration(createdAt, completedAt),
        threadId,
        origin: jobOrigin,
        isScheduled,
        metadata: {
          agent: (result as Record<string, unknown> | null)?.['agent'] ?? null,
        },
      });
    }

    try {
      const recurringTasksSnapshot = await db
        .collection(RECURRING_TASKS_COLLECTION)
        .where('userId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      if (!recurringTasksSnapshot.empty) {
        const repeatables: RepeatableJobDescriptor[] = queueService
          ? ((await queueService.getAllRepeatableJobs()) as RepeatableJobDescriptor[])
          : [];
        const repeatableMap = new Map(
          repeatables.map((job: RepeatableJobDescriptor) => [
            job.key,
            {
              nextRun: job.next,
              timezone: job.tz,
            },
          ])
        );

        for (const doc of recurringTasksSnapshot.docs as FirestoreDocLike[]) {
          const data = doc.data();
          const repeatable = repeatableMap.get(doc.id);
          const explicitTitle = readRecurringTaskString(data, 'title');
          const actionSummary =
            typeof data['actionSummary'] === 'string' && data['actionSummary'].trim().length > 0
              ? data['actionSummary'].trim()
              : 'Scheduled task';
          const cronExpression =
            typeof data['cronExpression'] === 'string' ? data['cronExpression'] : '';
          const timezone =
            typeof data['timezone'] === 'string' && data['timezone'].trim().length > 0
              ? data['timezone'].trim()
              : (repeatable?.timezone ?? 'UTC');
          const sourceId = resolveRecurringTaskSourceId(data);
          const resolvedTitle = sourceId ? (threadTitleById.get(sourceId)?.trim() ?? '') : '';
          const createdAt = data['createdAt'] as TimestampLike | undefined;
          const nextRunIso =
            typeof repeatable?.nextRun === 'number'
              ? new Date(repeatable.nextRun).toISOString()
              : null;

          entries.push({
            id: `schedule:${doc.id}`,
            title: (explicitTitle || resolvedTitle || actionSummary).slice(0, 120),
            summary: nextRunIso
              ? cronExpression
                ? `Next run ${cronExpression} (${timezone})`
                : `Next run (${timezone})`
              : cronExpression
                ? `Schedule ${cronExpression} (${timezone})`
                : `Scheduled task (${timezone})`,
            icon: 'calendar',
            status: 'complete',
            category: 'system',
            timestamp: createdAt
              ? new Date(createdAt.toMillis()).toISOString()
              : new Date().toISOString(),
            threadId: sourceId,
            origin: 'system_cron',
            isScheduled: true,
            metadata: {
              source: 'recurring_task',
              recurringTaskKey: doc.id,
              cronExpression,
              timezone,
              nextRun: nextRunIso,
              ...(sourceId ? { sourceId, threadId: sourceId } : {}),
            },
          });
        }
      }
    } catch (recurringErr) {
      logger.warn('Failed to augment operations log with recurring tasks', {
        userId: user.uid,
        error: recurringErr instanceof Error ? recurringErr.message : String(recurringErr),
      });
    }

    if (chatService) {
      try {
        // Build reverse map: MongoDB threadId → Firestore operationId.
        // This is necessary because AgentJobs docs have threadId patched in
        // asynchronously after creation. At the time getByUser runs, some jobs
        // may not yet have threadId and therefore fall through to thread-only
        // entries below without an operationId.
        // without an operationId. This map ensures those entries still carry
        // the correct UUID for the Firestore events subscription.
        const threadIdToOperationId = new Map<string, string>();
        for (const job of jobs) {
          const tid = job['threadId'] as string | null | undefined;
          const oid = job['operationId'] as string | undefined;
          if (tid && oid) threadIdToOperationId.set(tid, oid);
        }

        for (const thread of activeThreads) {
          if (!thread.id || representedThreadIds.has(thread.id)) continue;

          const category = inferCategory(thread.title);
          const resolvedOperationId = threadIdToOperationId.get(thread.id);
          entries.push({
            id: resolvedOperationId ?? thread.id,
            operationId: resolvedOperationId,
            title: thread.title.slice(0, 120),
            summary: `${thread.messageCount} message${thread.messageCount !== 1 ? 's' : ''} · ${thread.category ?? 'general'}`,
            icon: iconForCategory(category),
            status: 'complete',
            category,
            timestamp: thread.lastMessageAt,
            threadId: thread.id,
            origin: 'user',
            isScheduled: false,
            metadata: {
              source: 'thread',
              messageCount: thread.messageCount,
              threadCategory: thread.category ?? null,
            },
          });
        }
      } catch (threadErr) {
        logger.warn('Failed to augment operations log with MongoDB threads', {
          userId: user.uid,
          error: threadErr instanceof Error ? threadErr.message : String(threadErr),
        });
      }
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    logger.info('Operations log fetched', { userId: user.uid, count: entries.length });
    res.json({ success: true, data: entries });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get operations log', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get operations log' });
  }
});

// ─── GET /gameplans ─────────────────────────────────────────────────────

router.get('/gameplans', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const teamId = normalizeString(req.query['teamId']);
    const sport = normalizeString(req.query['sport'])?.toLowerCase();
    const status = normalizeString(req.query['status']);
    const phase = normalizeString(req.query['phase']);
    const opponentName = normalizeString(req.query['opponentName'])?.toLowerCase();
    const includeArchived = String(req.query['includeArchived'] ?? '').toLowerCase() === 'true';
    const limit = parsePositiveInt(req.query['limit'], 25, 100);

    let candidates: TeamGamePlanDoc[] = [];

    if (teamId) {
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        res.status(404).json({ success: false, error: `Team ${teamId} not found` });
        return;
      }

      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        teamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const snap = await db
        .collection(TEAM_GAMEPLANS_COLLECTION)
        .where('teamId', '==', teamId)
        .limit(Math.max(limit * 4, 80))
        .get();
      candidates = snap.docs.map((doc) => doc.data() as TeamGamePlanDoc);
    } else {
      const [updatedBySnap, createdBySnap] = await Promise.all([
        db
          .collection(TEAM_GAMEPLANS_COLLECTION)
          .where('updatedBy', '==', user.uid)
          .limit(Math.max(limit * 3, 60))
          .get(),
        db
          .collection(TEAM_GAMEPLANS_COLLECTION)
          .where('createdBy', '==', user.uid)
          .limit(Math.max(limit * 3, 60))
          .get(),
      ]);

      const byId = new Map<string, TeamGamePlanDoc>();
      for (const doc of [...updatedBySnap.docs, ...createdBySnap.docs]) {
        const item = doc.data() as TeamGamePlanDoc;
        byId.set(item.id, item);
      }
      candidates = [...byId.values()];
    }

    const filtered = candidates
      .filter((item) => (includeArchived ? true : item.status !== 'archived'))
      .filter((item) => (status ? item.status === status : true))
      .filter((item) => (phase ? item.phase === phase : true))
      .filter((item) => (sport ? item.sport.toLowerCase() === sport : true))
      .filter((item) => {
        if (!opponentName) return true;
        return (item.opponentName ?? '').toLowerCase().includes(opponentName);
      })
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
      .slice(0, limit)
      .map(toGameplanSummary);

    res.json({
      success: true,
      data: {
        gamePlans: filtered,
        count: filtered.length,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to list gameplans', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to list gameplans' });
  }
});

// ─── GET /gameplans/:gamePlanId ────────────────────────────────────────

router.get('/gameplans/:gamePlanId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const gamePlanIdParam = req.params['gamePlanId'];
    const gamePlanId = Array.isArray(gamePlanIdParam) ? gamePlanIdParam[0] : gamePlanIdParam;
    if (!gamePlanId) {
      res.status(400).json({ success: false, error: 'gamePlanId is required' });
      return;
    }

    const doc = await db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId).get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Game plan not found' });
      return;
    }

    const gamePlan = doc.data() as TeamGamePlanDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(gamePlan.teamId).get();
    const canManageTeam = teamDoc.exists
      ? await canManageTeamMutationForUser(db, user.uid, gamePlan.teamId, teamDoc.data() ?? {})
      : false;
    const isOwner = gamePlan.createdBy === user.uid || gamePlan.updatedBy === user.uid;

    if (!canManageTeam && !isOwner) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    res.json({
      success: true,
      data: {
        gamePlan,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to load gameplan', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load gameplan' });
  }
});

// ─── POST /gameplans ───────────────────────────────────────────────────

router.post('/gameplans', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const payload = req.body as Record<string, unknown>;

    // Validate required fields
    if (!payload['teamId'] || !payload['sport'] || !payload['title']) {
      res.status(400).json({
        success: false,
        error: 'teamId, sport, and title are required',
      });
      return;
    }

    const teamId = String(payload['teamId']).trim();
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();

    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: `Team ${teamId} not found` });
      return;
    }

    const isAuthorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );

    if (!isAuthorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to create game plans for this team' });
      return;
    }

    const now = new Date().toISOString();
    const normalizedSport = String(payload['sport']).trim().toLowerCase();
    const phase = (payload['phase'] ?? 'pregame') as string;
    const status = (payload['status'] ?? 'draft') as string;
    const docId = `${teamId}_${normalizedSport}_${phase}_${payload['gameDate'] ? String(payload['gameDate']).substring(0, 10) : 'open'}_${String(
      payload['opponentName'] ?? payload['title']
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}`;

    const gamePlanData: TeamGamePlanDoc = {
      id: docId,
      teamId,
      sport: normalizedSport,
      title: String(payload['title']).trim(),
      phase: phase as unknown as typeof gamePlanData.phase,
      status: status as unknown as typeof gamePlanData.status,
      ...(payload['season'] ? { season: String(payload['season']).trim() } : {}),
      ...(payload['opponentName'] ? { opponentName: String(payload['opponentName']).trim() } : {}),
      ...(payload['gameDate'] ? { gameDate: String(payload['gameDate']).trim() } : {}),
      ...(payload['identityFocus']
        ? { identityFocus: String(payload['identityFocus']).trim() }
        : {}),
      ...(payload['primaryAttackPlan']
        ? { primaryAttackPlan: String(payload['primaryAttackPlan']).trim() }
        : {}),
      ...(payload['defensivePriorities']
        ? { defensivePriorities: String(payload['defensivePriorities']).trim() }
        : {}),
      ...(payload['specialSituations']
        ? { specialSituations: String(payload['specialSituations']).trim() }
        : {}),
      ...(Array.isArray(payload['openingScript'])
        ? {
            openingScript: payload['openingScript']
              .map((v) => String(v).trim())
              .filter((v) => v.length > 0),
          }
        : {}),
      ...(Array.isArray(payload['strengthsWeaknesses'])
        ? { strengthsWeaknesses: payload['strengthsWeaknesses'] as unknown[] }
        : {}),
      ...(Array.isArray(payload['priorities'])
        ? { priorities: payload['priorities'] as unknown[] }
        : {}),
      ...(Array.isArray(payload['planBlocks'])
        ? { planBlocks: payload['planBlocks'] as unknown[] }
        : {}),
      ...(Array.isArray(payload['adjustmentTriggers'])
        ? { adjustmentTriggers: payload['adjustmentTriggers'] as unknown[] }
        : {}),
      ...(Array.isArray(payload['halftimePriorities'])
        ? { halftimePriorities: payload['halftimePriorities'] as unknown[] }
        : {}),
      ...(Array.isArray(payload['customSections'])
        ? { customSections: payload['customSections'] as unknown[] }
        : {}),
      ...(Array.isArray(payload['linkedPlays'])
        ? { linkedPlays: payload['linkedPlays'] as unknown[] }
        : {}),
      ...(Array.isArray(payload['tags'])
        ? {
            tags: (payload['tags'] as unknown[])
              .map((v) => String(v).trim())
              .filter((v) => v.length > 0),
          }
        : {}),
      source: 'api_direct',
      schemaVersion: 2,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = db.collection(TEAM_GAMEPLANS_COLLECTION).doc(docId);
    await docRef.set(gamePlanData);

    // Invalidate cache
    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${teamId}`),
        cache.del(`team:gameplans:${teamId}:${normalizedSport}`),
        cache.del(`team:profile:${teamId}`),
      ]);
    } catch {
      // Best effort
    }

    logger.info('Game plan created via API', {
      gamePlanId: docId,
      teamId,
      sport: normalizedSport,
      title: gamePlanData['title'],
    });

    res.status(201).json({
      success: true,
      data: { gamePlan: gamePlanData },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create gameplan', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to create gameplan' });
  }
});

// ─── PUT /gameplans/:gamePlanId ────────────────────────────────────────

router.put('/gameplans/:gamePlanId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const gamePlanIdParam = req.params['gamePlanId'];
    const gamePlanId = Array.isArray(gamePlanIdParam) ? gamePlanIdParam[0] : gamePlanIdParam;

    if (!gamePlanId) {
      res.status(400).json({ success: false, error: 'gamePlanId is required' });
      return;
    }

    const doc = await db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Game plan not found' });
      return;
    }

    const existing = doc.data() as TeamGamePlanDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();

    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: `Team ${existing.teamId} not found` });
      return;
    }

    const isAuthorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      existing.teamId,
      teamDoc.data() ?? {}
    );

    if (!isAuthorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to update game plans for this team' });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updatedBy: user.uid, updatedAt: now };

    // Merge only provided fields
    if (typeof payload['title'] === 'string') updateData['title'] = payload['title'].trim();
    if (typeof payload['status'] === 'string') updateData['status'] = payload['status'];
    if (typeof payload['phase'] === 'string') updateData['phase'] = payload['phase'];
    if (typeof payload['gameDate'] === 'string')
      updateData['gameDate'] = payload['gameDate'].trim();
    if (typeof payload['opponentName'] === 'string')
      updateData['opponentName'] = payload['opponentName'].trim();
    if (typeof payload['identityFocus'] === 'string')
      updateData['identityFocus'] = payload['identityFocus'].trim();
    if (typeof payload['primaryAttackPlan'] === 'string')
      updateData['primaryAttackPlan'] = payload['primaryAttackPlan'].trim();
    if (typeof payload['defensivePriorities'] === 'string')
      updateData['defensivePriorities'] = payload['defensivePriorities'].trim();
    if (typeof payload['specialSituations'] === 'string')
      updateData['specialSituations'] = payload['specialSituations'].trim();
    if (Array.isArray(payload['openingScript']))
      updateData['openingScript'] = (payload['openingScript'] as unknown[])
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);
    if (Array.isArray(payload['strengthsWeaknesses']))
      updateData['strengthsWeaknesses'] = payload['strengthsWeaknesses'];
    if (Array.isArray(payload['priorities'])) updateData['priorities'] = payload['priorities'];
    if (Array.isArray(payload['planBlocks'])) updateData['planBlocks'] = payload['planBlocks'];
    if (Array.isArray(payload['adjustmentTriggers']))
      updateData['adjustmentTriggers'] = payload['adjustmentTriggers'];
    if (Array.isArray(payload['halftimePriorities']))
      updateData['halftimePriorities'] = payload['halftimePriorities'];
    if (Array.isArray(payload['customSections']))
      updateData['customSections'] = payload['customSections'];
    if (Array.isArray(payload['linkedPlays'])) updateData['linkedPlays'] = payload['linkedPlays'];
    if (Array.isArray(payload['tags']))
      updateData['tags'] = (payload['tags'] as unknown[])
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);

    const docRef = db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId);
    await docRef.update(updateData);

    // Invalidate cache
    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${existing.teamId}`),
        cache.del(`team:gameplans:${existing.teamId}:${existing.sport}`),
        cache.del(`team:profile:${existing.teamId}`),
      ]);
    } catch {
      // Best effort
    }

    logger.info('Game plan updated via API', {
      gamePlanId,
      teamId: existing.teamId,
      updatedFields: Object.keys(payload),
    });

    // Fetch updated document
    const updatedDoc = await docRef.get();
    const updatedData = updatedDoc.data() as TeamGamePlanDoc;

    res.json({
      success: true,
      data: { gamePlan: updatedData },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update gameplan', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to update gameplan' });
  }
});

// ─── DELETE /gameplans/:gamePlanId ─────────────────────────────────────

router.delete('/gameplans/:gamePlanId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const gamePlanIdParam = req.params['gamePlanId'];
    const gamePlanId = Array.isArray(gamePlanIdParam) ? gamePlanIdParam[0] : gamePlanIdParam;

    if (!gamePlanId) {
      res.status(400).json({ success: false, error: 'gamePlanId is required' });
      return;
    }

    const doc = await db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Game plan not found' });
      return;
    }

    const gamePlan = doc.data() as TeamGamePlanDoc;
    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(gamePlan.teamId).get();

    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: `Team ${gamePlan.teamId} not found` });
      return;
    }

    const isAuthorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      gamePlan.teamId,
      teamDoc.data() ?? {}
    );

    if (!isAuthorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to delete game plans for this team' });
      return;
    }

    const now = new Date().toISOString();
    const docRef = db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId);

    // Soft-delete: archive instead of removing
    await docRef.update({
      status: 'archived',
      updatedBy: user.uid,
      updatedAt: now,
      archivedAt: now,
      archivedBy: user.uid,
    });

    // Invalidate cache
    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${gamePlan.teamId}`),
        cache.del(`team:gameplans:${gamePlan.teamId}:${gamePlan.sport}`),
        cache.del(`team:profile:${gamePlan.teamId}`),
      ]);
    } catch {
      // Best effort
    }

    logger.info('Game plan archived via API', {
      gamePlanId,
      teamId: gamePlan.teamId,
      title: gamePlan.title,
    });

    res.json({
      success: true,
      data: { message: `Game plan archived: ${gamePlan.title}` },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to delete gameplan', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to delete gameplan' });
  }
});

router.patch(
  '/operations-log/scheduled/:taskKey',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      if (!queueService) {
        res.status(503).json({ success: false, error: 'Agent queue not initialized' });
        return;
      }

      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const taskKey = (req.params['taskKey'] as string | undefined)?.trim();
      if (!taskKey) {
        res.status(400).json({ success: false, error: 'Recurring task key is required' });
        return;
      }

      const { title } = req.body as { title?: string };
      const nextTitle = typeof title === 'string' ? title.trim() : '';
      if (!nextTitle) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
      }

      if (nextTitle.length > 200) {
        res.status(400).json({ success: false, error: 'Title must be 200 characters or less' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(RECURRING_TASKS_COLLECTION).doc(taskKey);
      const snapshot = await docRef.get();
      const data = snapshot.data() as Record<string, unknown> | undefined;

      if (!snapshot.exists || data?.['userId'] !== user.uid) {
        res.status(404).json({ success: false, error: 'Recurring task not found' });
        return;
      }

      const cronExpression = readRecurringTaskString(data, 'cronExpression');
      if (!cronExpression) {
        res.status(409).json({ success: false, error: 'Recurring task schedule is missing' });
        return;
      }

      const timezone = readRecurringTaskString(data, 'timezone') ?? 'UTC';
      const jobName = readRecurringTaskString(data, 'jobName') ?? `recv:${user.uid}:${Date.now()}`;
      const sourceId = resolveRecurringTaskSourceId(data);
      const previousTitle = readRecurringTaskString(data, 'actionSummary') ?? 'Scheduled task';

      const previousPayload = buildRecurringTaskPayload(user.uid, previousTitle, sourceId);
      const nextPayload = buildRecurringTaskPayload(user.uid, nextTitle, sourceId);

      const removed = await queueService.removeRecurringJob(taskKey);
      if (!removed) {
        logger.warn('Recurring task rename could not find BullMQ repeatable before re-register', {
          userId: user.uid,
          taskKey,
        });
      }

      let nextKey = taskKey;
      try {
        nextKey = await queueService.enqueueRecurring(
          jobName,
          cronExpression,
          timezone,
          nextPayload,
          'production'
        );
      } catch (enqueueErr) {
        try {
          await queueService.enqueueRecurring(
            jobName,
            cronExpression,
            timezone,
            previousPayload,
            'production'
          );
        } catch (rollbackErr) {
          logger.error('Failed to roll back recurring task rename after enqueue failure', {
            userId: user.uid,
            taskKey,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          });
        }

        throw enqueueErr;
      }

      const nextDocData = {
        ...data,
        userId: user.uid,
        actionSummary: nextTitle,
        title: nextTitle,
        cronExpression,
        timezone,
        jobName,
        ...(sourceId ? { sourceId } : {}),
        updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      };

      if (nextKey === taskKey) {
        await docRef.set(nextDocData, { merge: true });
      } else {
        const batch = db.batch();
        batch.set(db.collection(RECURRING_TASKS_COLLECTION).doc(nextKey), nextDocData, {
          merge: true,
        });
        batch.delete(docRef);
        await batch.commit();
      }

      logger.info('Recurring task renamed', {
        userId: user.uid,
        taskKey,
        nextKey,
        title: nextTitle,
      });

      res.json({
        success: true,
        data: {
          key: nextKey,
          title: nextTitle,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to rename recurring task', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to rename recurring task' });
    }
  }
);

router.post(
  '/operations-log/scheduled/:taskKey/archive',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      if (!queueService) {
        res.status(503).json({ success: false, error: 'Agent queue not initialized' });
        return;
      }

      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const taskKey = (req.params['taskKey'] as string | undefined)?.trim();
      if (!taskKey) {
        res.status(400).json({ success: false, error: 'Recurring task key is required' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(RECURRING_TASKS_COLLECTION).doc(taskKey);
      const snapshot = await docRef.get();
      const data = snapshot.data() as Record<string, unknown> | undefined;

      if (!snapshot.exists || data?.['userId'] !== user.uid) {
        res.status(404).json({ success: false, error: 'Recurring task not found' });
        return;
      }

      const removed = await queueService.removeRecurringJob(taskKey);
      if (!removed) {
        logger.warn('Recurring task archive aborted because BullMQ repeatable key was not found', {
          userId: user.uid,
          taskKey,
        });

        res.status(409).json({
          success: false,
          error:
            'Recurring task scheduler entry not found. Archive aborted to avoid metadata drift.',
        });
        return;
      }

      await docRef.delete();

      logger.info('Recurring task archived', { userId: user.uid, taskKey });
      res.json({ success: true });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to archive recurring task', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to archive recurring task' });
    }
  }
);

// ─── GET /dashboard ───────────────────────────────────────────────────────

router.get('/dashboard', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const userDoc = await db.collection('Users').doc(user.uid).get();
    const userData = userDoc.data() ?? {};
    const role: string = userData['role'] ?? 'athlete';
    const agentGoals: AgentDashboardGoal[] = userData['agentGoals'] ?? [];

    const appConfig = await getAgentAppConfig(db);
    const dynamicCoordinators = resolveConfiguredCoordinatorsForRole(role, appConfig);
    const suggestedActionsDoc = await db
      .collection('Users')
      .doc(user.uid)
      .collection('agent_suggested_actions')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    const suggestedActionsPayload: Record<string, unknown> | null = suggestedActionsDoc.empty
      ? null
      : (suggestedActionsDoc.docs[0].data() as Record<string, unknown>);

    if (!suggestedActionsPayload) {
      // Fire-and-forget — do NOT block the dashboard response waiting for an LLM call.
      // The client will get an empty suggested actions list on first load and will
      // receive the generated actions on the next dashboard request.
      logger.info('Triggering first-load suggested actions generation in background', {
        userId: user.uid,
        role,
      });
      getGenerationService()
        .generateWeeklySuggestedActions(user.uid, true, db)
        .catch((err) =>
          logger.warn('Failed to generate first-load suggested actions during dashboard request', {
            userId: user.uid,
            error: err instanceof Error ? err.message : String(err),
          })
        );
    }

    const suggestedActionsByCoordinator = new Map<string, readonly ShellActionChip[]>();
    if (suggestedActionsPayload) {
      const generatedCoordinators = Array.isArray(suggestedActionsPayload['coordinators'])
        ? (suggestedActionsPayload['coordinators'] as Array<Record<string, unknown>>)
        : [];

      for (const item of generatedCoordinators) {
        const coordinatorId = String(item['coordinatorId'] ?? '').trim();
        const actions = Array.isArray(item['actions'])
          ? (item['actions'] as ShellActionChip[])
          : [];

        if (coordinatorId && actions.length > 0) {
          suggestedActionsByCoordinator.set(coordinatorId, actions);
        }
      }
    }

    const coordinators = dynamicCoordinators.map((coordinator) => ({
      ...coordinator,
      suggestedActions: suggestedActionsByCoordinator.get(coordinator.id) ?? [],
    }));

    const briefingDoc = await db
      .collection('Users')
      .doc(user.uid)
      .collection('agent_briefings')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    let briefingInsights: ShellBriefingInsight[] = [];
    let briefingPreviewText = '';
    let briefingGeneratedAt: string | null = null;

    if (!briefingDoc.empty) {
      const bData = briefingDoc.docs[0].data();
      if ((bData['insights'] as unknown[])?.length) {
        briefingInsights = bData['insights'] as ShellBriefingInsight[];
      }
      if (bData['previewText']) {
        briefingPreviewText = bData['previewText'] as string;
      }
      briefingGeneratedAt = (bData['generatedAt'] as string) ?? briefingGeneratedAt;
    }

    const playbookDoc = await db
      .collection('Users')
      .doc(user.uid)
      .collection('agent_playbooks')
      .orderBy('generatedAt', 'desc')
      .limit(10)
      .get();

    let playbookItems: ShellWeeklyPlaybookItem[] = [];
    let playbookGeneratedAt: string | null = null;

    const latestRealPlaybook = playbookDoc.docs.find((doc: FirestoreDocLike) => {
      const items = (doc.data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
      return !isLegacyFallbackPlaybook(items);
    });

    if (latestRealPlaybook) {
      const pData = latestRealPlaybook.data();
      playbookItems = (pData['items'] ?? []) as ShellWeeklyPlaybookItem[];
      playbookGeneratedAt = (pData['generatedAt'] as string) ?? null;
    }

    // Safety net for new users who land on /agent with no briefing.
    // This covers the case where onboarding completed without goals set AND
    // the front-end fire-and-forget somehow failed (e.g. nav happened before
    // the HTTP request resolved). force=false means it's a no-op if a briefing
    // was already generated today.
    if (briefingInsights.length === 0) {
      getGenerationService()
        .generateBriefing(user.uid, false, db)
        .catch((err) =>
          logger.warn('Background initial briefing generation failed', {
            userId: user.uid,
            error: err instanceof Error ? err.message : String(err),
          })
        );
    }

    res.json({
      success: true,
      data: {
        briefing: {
          previewText: briefingPreviewText,
          insights: briefingInsights,
          generatedAt: briefingGeneratedAt,
        },
        playbook: {
          ...(latestRealPlaybook ? { id: latestRealPlaybook.id } : {}),
          items: playbookItems,
          goals: agentGoals,
          generatedAt: playbookGeneratedAt,
          canRegenerate: agentGoals.length > 0,
        },
        coordinators,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get agent dashboard', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

// ─── POST /goals ──────────────────────────────────────────────────────────

router.post('/goals', appGuard, validateBody(SetGoalsDto), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { goals } = req.body as SetGoalsDto;
    const { db } = req.firebase!;

    const plainGoals = goals.map((g) => ({
      id: g.id,
      text: g.text,
      category: g.category,
      ...(g.createdAt ? { createdAt: g.createdAt } : {}),
    }));

    await db
      .collection('Users')
      .doc(user.uid)
      .set(
        { agentGoals: plainGoals, agentGoalsUpdatedAt: new Date().toISOString() },
        { merge: true }
      );

    logger.info('Agent goals updated', { userId: user.uid, goalCount: goals.length });

    // Invalidate the agent context cache so the next AI request sees the new goals.
    contextBuilder?.invalidateContext(user.uid).catch(() => {
      /* non-critical */
    });

    // Goals changed — regenerate the action plan immediately so the user
    // sees a fresh playbook that reflects their new goals. fire-and-forget
    // (non-blocking — the HTTP response returns instantly).
    if (goals.length > 0) {
      getGenerationService()
        .generateWeeklyPlaybook(user.uid, true)
        .catch((err) =>
          logger.warn('Playbook regeneration after goal update failed', {
            userId: user.uid,
            error: err instanceof Error ? err.message : String(err),
          })
        );
    }

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to set agent goals', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to save goals' });
  }
});

// ─── POST /goals/:goalId/complete ─────────────────────────────────────────

router.post(
  '/goals/:goalId/complete',
  appGuard,
  validateBody(CompleteGoalDto),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { goalId } = req.params as { goalId: string };
      const { notes } = req.body as CompleteGoalDto;
      const { db } = req.firebase!;

      logger.info('Complete goal request received', { userId: user.uid, goalId });

      const userRef = db.collection('Users').doc(user.uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() ?? {};
      const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ??
        []) as AgentDashboardGoal[];
      const role = (userData['role'] ?? 'athlete') as string;

      const goal = agentGoals.find((g) => g.id === goalId);
      // Allow completion even if the goal was already removed from agentGoals
      // (e.g. optimistic UI removed it before the request landed).
      // Fall back to the goal_history record if it exists.
      let resolvedGoal = goal;
      if (!resolvedGoal) {
        const histDoc = await userRef.collection('goal_history').doc(goalId).get();
        if (histDoc.exists) {
          resolvedGoal = histDoc.data() as AgentDashboardGoal;
        }
      }
      if (!resolvedGoal) {
        res.status(404).json({ success: false, error: 'Goal not found' });
        return;
      }

      const now = new Date().toISOString();
      const createdAtMs = resolvedGoal.createdAt
        ? new Date(resolvedGoal.createdAt).getTime()
        : Date.now();
      const daysToComplete = Math.max(0, Math.round((Date.now() - createdAtMs) / 86_400_000));

      const completedGoal: CompletedGoalRecord = {
        id: `${goalId}_${Date.now()}`,
        goalId,
        text: resolvedGoal.text,
        category: resolvedGoal.category,
        ...(resolvedGoal.icon ? { icon: resolvedGoal.icon } : {}),
        createdAt: resolvedGoal.createdAt,
        completedAt: now,
        role,
        daysToComplete,
        ...(notes ? { notes } : {}),
      };

      // Mark existing goal_history record as completed (or create one if missing),
      // and remove from active goals atomically.
      const batch = db.batch();
      const histRef = userRef.collection('goal_history').doc(goalId);
      const existingHist = await histRef.get();
      if (existingHist.exists) {
        batch.update(histRef, {
          isCompleted: true,
          completedAt: now,
          daysToComplete,
          ...(notes ? { notes } : {}),
        });
      } else {
        batch.set(histRef, {
          ...completedGoal,
          isCompleted: true,
          firstSeenAt: resolvedGoal.createdAt ?? now,
          lastSeenAt: now,
          playbookCount: 0,
        });
      }
      if (goal) {
        // Only update agentGoals if the goal was still in the active list
        batch.update(userRef, {
          agentGoals: agentGoals.filter((g) => g.id !== goalId),
          agentGoalsUpdatedAt: now,
        });
      }
      await batch.commit();

      // ── Sync isCompleted flag to the active cycle doc ──────────────────
      // Find the latest cycle doc and mark it complete so the audit trail
      // reflects the manual completion.
      try {
        const latestPlaybook = await db
          .collection('Users')
          .doc(user.uid)
          .collection('agent_playbooks')
          .orderBy('generatedAt', 'desc')
          .limit(1)
          .get();
        if (!latestPlaybook.empty) {
          const cycleRef = histRef.collection('cycles').doc(latestPlaybook.docs[0].id);
          const cycleDoc = await cycleRef.get();
          if (cycleDoc.exists) {
            await cycleRef.update({ isCompleted: true, completedAt: now });
          }
        }
      } catch {
        // Non-critical — main goal_history already updated
      }

      logger.info('Agent goal completed', {
        userId: user.uid,
        goalId,
        category: goal?.category,
        role,
        daysToComplete,
      });

      // Invalidate agent context cache — goal is removed from agentGoals.
      contextBuilder?.invalidateContext(user.uid).catch(() => {
        /* non-critical */
      });

      res.json({ success: true, data: { completedGoal } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to complete agent goal', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to complete goal' });
    }
  }
);

// ─── GET /goal-history ────────────────────────────────────────────────────

router.get('/goal-history', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const snapshot = await db
      .collection('Users')
      .doc(user.uid)
      .collection('goal_history')
      .orderBy('lastSeenAt', 'desc')
      .limit(50)
      .get();

    const history = snapshot.docs.map((doc: FirestoreDocLike) => {
      const data = doc.data();
      return {
        ...data,
        // Normalise: records created before auto-archive used 'generatedAt' as lastSeenAt
        lastSeenAt: data['lastSeenAt'] ?? data['completedAt'] ?? data['createdAt'],
      };
    });

    logger.info('Goal history fetched', { userId: user.uid, count: history.length });

    res.json({ success: true, data: { history, totalCompleted: history.length } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch goal history', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch goal history' });
  }
});

// ─── POST /upload ─────────────────────────────────────────────────────────
// Upload non-video attachments (images, PDFs, docs) to Firebase Storage.
// Videos use Cloudflare Stream TUS and bypass this endpoint.
// ThreadId may be null on first message (SSE thread event fires after upload starts).
// Falls back to unbound storage path if threadId unavailable.

router.post(
  '/upload',
  appGuard,
  uploadRateLimit,
  agentUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const threadId = (req.body?.threadId as string | undefined) ?? null;
      const bucket = req.firebase.storage.bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        threadId,
        mimeType: file.mimetype,
        fileName: file.originalname,
        zone: 'media',
      });

      const { url: signedUrl, expiresAt } = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });

      logger.info('Agent X file uploaded', {
        userId: user.uid,
        threadId: threadId || 'unbound',
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        signedUrlExpires: new Date(expiresAt).toISOString(),
      });

      res.json({
        success: true,
        data: {
          url: signedUrl,
          storagePath,
          name: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorCode = (error as ErrorWithCode).code;
      const requestUser = (req as AuthenticatedRequest).user;

      // Normalize multer errors to structured 400s
      if (errorCode === 'LIMIT_FILE_SIZE') {
        logger.warn('File upload size limit exceeded', {
          error: error.message,
          userId: requestUser?.uid,
        });
        res.status(400).json({
          success: false,
          error: 'File exceeds maximum size limit (20 MB)',
          code: 'FILE_TOO_LARGE',
        });
        return;
      }

      if (errorCode === 'LIMIT_UNEXPECTED_FILE') {
        logger.warn('Unexpected file in upload', {
          error: error.message,
          userId: requestUser?.uid,
        });
        res.status(400).json({
          success: false,
          error: 'Unexpected file field',
          code: 'INVALID_FILE_FIELD',
        });
        return;
      }

      logger.error('Agent X file upload failed', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
  }
);

// ─── POST /upload/tmp ────────────────────────────────────────────────────────
// Upload a file to the per-type tmp scratch folder. Tmp files are meant to be
// short-lived: a scheduled backend cleanup removes expired tmp objects.
// Workers write here for scraped / generated assets; the frontend may also
// stage files here before committing them to a thread. Identical auth +
// validation as /upload — only the storage path prefix changes.
router.post(
  '/upload/tmp',
  appGuard,
  uploadRateLimit,
  agentUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const threadId = (req.body?.threadId as string | undefined) ?? null;
      const bucket = req.firebase.storage.bucket();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        threadId,
        mimeType: file.mimetype,
        fileName: file.originalname,
        zone: 'tmp',
      });

      const { url: signedUrl } = await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });

      logger.info('Agent X tmp file uploaded', {
        userId: user.uid,
        threadId: threadId || 'unbound',
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
      });

      res.json({
        success: true,
        data: {
          url: signedUrl,
          storagePath,
          name: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorCode = (error as ErrorWithCode).code;
      const requestUser = (req as AuthenticatedRequest).user;

      if (errorCode === 'LIMIT_FILE_SIZE') {
        logger.warn('Tmp upload size limit exceeded', { userId: requestUser?.uid });
        res.status(400).json({
          success: false,
          error: 'File exceeds maximum size limit (20 MB)',
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      if (errorCode === 'LIMIT_UNEXPECTED_FILE') {
        res
          .status(400)
          .json({ success: false, error: 'Unexpected file field', code: 'INVALID_FILE_FIELD' });
        return;
      }

      logger.error('Agent X tmp upload failed', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to upload tmp file' });
    }
  }
);

// ─── POST /upload/promote ─────────────────────────────────────────────────────
// Promote a file from tmp/ to media/ via a server-side GCS copy + delete.
// The calling user must own the file (uid in path must match auth uid) and
// the path must contain /tmp/ — prevents misuse on already-permanent files.
//
// Body: { storagePath: string }
// Returns: { url, storagePath, mimeType, sizeBytes }
router.post('/upload/promote', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { storagePath } = req.body as { storagePath?: unknown };
    if (typeof storagePath !== 'string' || !storagePath.trim()) {
      res.status(400).json({ success: false, error: 'storagePath is required' });
      return;
    }

    const bucket = req.firebase.storage.bucket();
    const promoted = await AgentMediaLifecycleService.promoteTmpObject({
      bucket,
      storagePath,
      userId: user.uid,
    });

    logger.info('Agent X tmp file promoted to media', {
      userId: user.uid,
      from: storagePath,
      to: promoted.storagePath,
    });

    res.json({
      success: true,
      data: {
        url: promoted.url,
        storagePath: promoted.storagePath,
        mimeType: promoted.mimeType,
        sizeBytes: promoted.sizeBytes,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.message === 'Forbidden: file does not belong to this user') {
      res.status(403).json({ success: false, error: error.message });
      return;
    }
    if (error.message === 'storagePath must reference a tmp/ folder') {
      res.status(400).json({ success: false, error: error.message, code: 'NOT_TMP_PATH' });
      return;
    }
    if (error.message === 'Invalid storagePath') {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    if (error.message === 'Source file not found') {
      res.status(404).json({ success: false, error: error.message, code: 'FILE_NOT_FOUND' });
      return;
    }
    logger.error('Agent X promote failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to promote file' });
  }
});

// ─── POST /upload/video ────────────────────────────────────────────────────
// Provision a Firebase Storage v4 signed upload URL for Agent X chat video
// attachments. The browser PUTs directly to GCS (no backend buffering), then
// uses the returned read URL as the attachment URL — which MediaTransportResolver
// already treats as isDirectlyPortable (no Cloudflare re-encoding wait).
//
// Body: { fileName: string, mimeType: string, fileSize: number, threadId?: string }
// Returns: { uploadUrl, readUrl, storagePath, expiresAt }
router.post('/upload/video', appGuard, uploadRateLimit, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { fileName, mimeType, fileSize, threadId } = req.body as {
      fileName?: unknown;
      mimeType?: unknown;
      fileSize?: unknown;
      threadId?: unknown;
    };

    // ── Validate inputs ───────────────────────────────────────────────────
    if (typeof fileName !== 'string' || !fileName.trim()) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }
    if (typeof mimeType !== 'string' || !mimeType.startsWith('video/')) {
      res.status(400).json({
        success: false,
        error: 'mimeType must be a video/* MIME type',
        code: 'INVALID_MIME_TYPE',
      });
      return;
    }
    if (typeof fileSize !== 'number' || fileSize <= 0) {
      res.status(400).json({ success: false, error: 'fileSize must be a positive number' });
      return;
    }
    if (fileSize > AGENT_X_MAX_VIDEO_FILE_SIZE) {
      res.status(400).json({
        success: false,
        error: `File exceeds maximum video size limit (${formatSizeLabel(AGENT_X_MAX_VIDEO_FILE_SIZE)})`,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }

    const resolvedThreadId =
      typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null;

    const bucket = req.firebase.storage.bucket();
    const storagePath = AgentMediaLifecycleService.buildStoragePath({
      userId: user.uid,
      threadId: resolvedThreadId,
      mimeType,
      fileName,
      zone: 'media',
    });
    const storageFile = bucket.file(storagePath) as {
      getSignedUrl: (options: {
        version: 'v4';
        action: 'write' | 'read';
        expires: number;
        contentType?: string;
        extensionHeaders?: Record<string, string>;
      }) => Promise<[string]>;
    };

    const uploadExpiresAtMs = Date.now() + resolveVideoUploadUrlTtlMs(fileSize);
    const readExpiresAtMs = Date.now() + AgentMediaLifecycleService.DEFAULT_SIGNED_URL_TTL_MS;

    const [uploadUrl, readUrl] = await Promise.all([
      storageFile.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: uploadExpiresAtMs,
        contentType: mimeType,
      }),
      storageFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: readExpiresAtMs,
      }),
    ]).then((entries) => entries.map(([url]) => url) as [string, string]);

    logger.info('Agent X video upload URL provisioned (firebase)', {
      userId: user.uid,
      threadId: resolvedThreadId ?? 'unbound',
      mimeType,
      fileSize,
      storagePath,
      uploadExpiresAt: new Date(uploadExpiresAtMs).toISOString(),
      readExpiresAt: new Date(readExpiresAtMs).toISOString(),
      bucketName: bucket.name,
    });

    res.json({
      success: true,
      data: {
        uploadUrl,
        readUrl,
        storagePath,
        expiresAt: new Date(readExpiresAtMs).toISOString(),
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Agent X video upload provisioning failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to provision video upload URL' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TeamPlaybooks REST CRUD
// GET    /playbooks              — list playbooks for a team
// GET    /playbooks/:id          — get full playbook detail
// POST   /playbooks              — create a new playbook
// PATCH  /playbooks/:id          — update playbook metadata
// DELETE /playbooks/:id          — hard-delete a playbook
// POST   /playbooks/:id/plays    — append a play
// PATCH  /playbooks/:id/plays/:i — update play by index
// DELETE /playbooks/:id/plays/:i — remove play by index
// ═══════════════════════════════════════════════════════════════════════════

const TEAM_PLAYBOOKS_COLLECTION = 'TeamPlaybooks';

/** Title-case every word in a string. */
function titleCaseStr(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Title-case every element in a string array (or return []). */
function titleCaseArr(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => titleCaseStr(v));
}

/** Rebuild concept / formation / personnel / category indexes from plays array. */
function buildPlayIndexes(plays: Record<string, unknown>[]): Record<string, string[]> {
  const concepts = new Set<string>();
  const formations = new Set<string>();
  const personnel = new Set<string>();
  const categories = new Set<string>();

  for (const play of plays) {
    const formation = play['formation'];
    const pers = play['personnel'];
    const cat = play['category'];
    const tags = play['conceptTags'];
    if (typeof formation === 'string' && formation.trim()) formations.add(formation.trim());
    if (typeof pers === 'string' && pers.trim()) personnel.add(pers.trim());
    if (typeof cat === 'string' && cat.trim()) categories.add(cat.trim());
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (typeof t === 'string' && t.trim()) concepts.add(titleCaseStr(t));
      }
    }
  }

  return {
    conceptTagIndex: [...concepts].sort(),
    formationIndex: [...formations].sort(),
    personnelIndex: [...personnel].sort(),
    categoryIndex: [...categories].sort(),
  };
}

/** Summarize a TeamPlaybooks doc for the list response. */
function toPlaybookSummary(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const plays = Array.isArray(data['plays']) ? (data['plays'] as unknown[]) : [];
  return {
    id,
    teamId: data['teamId'],
    sport: data['sport'],
    name: data['name'],
    title: data['title'],
    season: data['season'],
    source: data['source'],
    sourceUrl: data['sourceUrl'],
    playCount: typeof data['playCount'] === 'number' ? data['playCount'] : plays.length,
    conceptTagCount: Array.isArray(data['conceptTagIndex']) ? data['conceptTagIndex'].length : 0,
    formationCount: Array.isArray(data['formationIndex']) ? data['formationIndex'].length : 0,
    personnelCount: Array.isArray(data['personnelIndex']) ? data['personnelIndex'].length : 0,
    categoryCount: Array.isArray(data['categoryIndex']) ? data['categoryIndex'].length : 0,
    archived: data['archived'] === true,
    updatedAt: data['updatedAt'],
    createdAt: data['createdAt'],
  };
}

// ─── GET /playbooks ──────────────────────────────────────────────────────────
router.get('/playbooks', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : null;
    if (!teamId) {
      res.status(400).json({ success: false, error: 'teamId is required' });
      return;
    }

    const limit = Math.min(parseInt(String(req.query['limit'] ?? '25'), 10) || 25, 100);
    const includeArchived = req.query['includeArchived'] === 'true';

    const { db } = req.firebase!;
    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to view playbooks for this team' });
      return;
    }

    const snap = await db
      .collection(TEAM_PLAYBOOKS_COLLECTION)
      .where('teamId', '==', teamId)
      .limit(limit * 4)
      .get();

    const playbooks = snap.docs
      .map((doc: FirestoreDocLike) => ({ id: doc.id, ...doc.data() }))
      .filter((p: Record<string, unknown>) => includeArchived || p['archived'] !== true)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const left = String(a['updatedAt'] ?? a['createdAt'] ?? '');
        const right = String(b['updatedAt'] ?? b['createdAt'] ?? '');
        return left > right ? -1 : 1;
      })
      .slice(0, limit)
      .map((p: Record<string, unknown>) => toPlaybookSummary(String(p['id']), p));

    logger.info('GET /playbooks', { userId: user.uid, teamId, count: playbooks.length });
    res.json({ success: true, data: { playbooks, count: playbooks.length } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('GET /playbooks failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load playbooks' });
  }
});

// ─── GET /playbooks/:playbookId ──────────────────────────────────────────────
router.get('/playbooks/:playbookId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : null;

    const { db } = req.firebase!;
    const doc = await db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId).get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const data = doc.data() as Record<string, unknown>;
    const playbookTeamId = String(data['teamId'] ?? '');

    if (teamId && playbookTeamId !== teamId) {
      res.status(403).json({ success: false, error: 'Playbook does not belong to this team' });
      return;
    }

    const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    res.json({ success: true, data: { playbook: { id: doc.id, ...data } } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('GET /playbooks/:id failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load playbook' });
  }
});

// ─── POST /playbooks ─────────────────────────────────────────────────────────
router.post('/playbooks', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const teamId = typeof body['teamId'] === 'string' ? body['teamId'].trim() : '';
    const sport = typeof body['sport'] === 'string' ? body['sport'].trim() : '';
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';

    if (!teamId) {
      res.status(400).json({ success: false, error: 'teamId is required' });
      return;
    }
    if (!sport) {
      res.status(400).json({ success: false, error: 'sport is required' });
      return;
    }
    if (!name) {
      res.status(400).json({ success: false, error: 'name is required' });
      return;
    }

    const { db } = req.firebase!;
    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }

    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res
        .status(403)
        .json({ success: false, error: 'Not authorized to create playbooks for this team' });
      return;
    }

    const now = new Date().toISOString();
    const normalizedSport = sport.toLowerCase();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40);
    const docId = `${teamId}_${normalizedSport}_${slug}_${Date.now()}`;

    const payload: Record<string, unknown> = {
      id: docId,
      teamId,
      sport: normalizedSport,
      name: titleCaseStr(name),
      plays: [],
      playCount: 0,
      conceptTagIndex: [],
      formationIndex: [],
      personnelIndex: [],
      categoryIndex: [],
      archived: false,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
    };

    const season = body['season'];
    const source = body['source'];
    const sourceUrl = body['sourceUrl'];
    if (typeof season === 'string' && season.trim()) payload['season'] = season.trim();
    if (typeof source === 'string' && source.trim()) payload['source'] = source.trim();
    if (typeof sourceUrl === 'string' && sourceUrl.trim()) payload['sourceUrl'] = sourceUrl.trim();

    await db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(docId).set(payload);

    logger.info('POST /playbooks — created', {
      teamId,
      sport: normalizedSport,
      name,
      docId,
      createdBy: user.uid,
    });
    res.status(201).json({ success: true, data: { playbook: payload } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('POST /playbooks failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to create playbook' });
  }
});

// ─── PATCH /playbooks/:playbookId ────────────────────────────────────────────
router.patch('/playbooks/:playbookId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const { db } = req.firebase!;

    const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const existing = doc.data() as Record<string, unknown>;
    const playbookTeamId = String(existing['teamId'] ?? '');

    const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now, updatedBy: user.uid };

    const body = req.body as Record<string, unknown>;
    if (typeof body['name'] === 'string' && body['name'].trim()) {
      updates['name'] = titleCaseStr(body['name']);
    }
    if (typeof body['season'] === 'string') updates['season'] = body['season'].trim();
    if (typeof body['source'] === 'string') updates['source'] = body['source'].trim();
    if (typeof body['sourceUrl'] === 'string') updates['sourceUrl'] = body['sourceUrl'].trim();
    if (typeof body['archived'] === 'boolean') updates['archived'] = body['archived'];

    await docRef.update(updates);

    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${playbookTeamId}`),
        cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`),
      ]);
    } catch {
      /* best effort */
    }

    logger.info('PATCH /playbooks/:id', {
      playbookId,
      teamId: playbookTeamId,
      updatedBy: user.uid,
    });
    res.json({ success: true, data: { id: playbookId, ...updates } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('PATCH /playbooks/:id failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to update playbook' });
  }
});

// ─── DELETE /playbooks/:playbookId ───────────────────────────────────────────
router.delete('/playbooks/:playbookId', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const { db } = req.firebase!;

    const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const existing = doc.data() as Record<string, unknown>;
    const playbookTeamId = String(existing['teamId'] ?? '');

    const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    await docRef.delete();

    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${playbookTeamId}`),
        cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`),
      ]);
    } catch {
      /* best effort */
    }

    logger.info('DELETE /playbooks/:id', {
      playbookId,
      teamId: playbookTeamId,
      deletedBy: user.uid,
    });
    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('DELETE /playbooks/:id failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to delete playbook' });
  }
});

// ─── POST /playbooks/:playbookId/plays ───────────────────────────────────────
router.post('/playbooks/:playbookId/plays', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { playbookId } = req.params as { playbookId: string };
    const { db } = req.firebase!;

    const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Playbook not found' });
      return;
    }

    const existing = doc.data() as Record<string, unknown>;
    const playbookTeamId = String(existing['teamId'] ?? '');

    const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
    const authorized = await canManageTeamMutationForUser(
      db,
      user.uid,
      playbookTeamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      res.status(403).json({ success: false, error: 'Not authorized' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const playName = typeof body['name'] === 'string' ? body['name'].trim() : '';
    if (!playName) {
      res.status(400).json({ success: false, error: 'play name is required' });
      return;
    }

    const newPlay: Record<string, unknown> = { name: titleCaseStr(playName) };
    const strFields = [
      'series',
      'category',
      'formation',
      'personnel',
      'downDistance',
      'objective',
      'installNotes',
      'diagramUrl',
      'videoUrl',
    ] as const;
    for (const field of strFields) {
      if (typeof body[field] === 'string' && (body[field] as string).trim()) {
        newPlay[field] = (body[field] as string).trim();
      }
    }
    const concepts = titleCaseArr(body['conceptTags']);
    if (concepts.length) newPlay['conceptTags'] = concepts;
    const tags = titleCaseArr(body['tags']);
    if (tags.length) newPlay['tags'] = tags;

    const plays: Record<string, unknown>[] = [
      ...((existing['plays'] as Record<string, unknown>[]) ?? []),
      newPlay,
    ];
    const now = new Date().toISOString();
    const indexes = buildPlayIndexes(plays);

    await docRef.update({
      plays,
      playCount: plays.length,
      ...indexes,
      updatedAt: now,
      updatedBy: user.uid,
    });

    try {
      const cache = getCacheService();
      await cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`);
    } catch {
      /* best effort */
    }

    logger.info('POST /playbooks/:id/plays', { playbookId, teamId: playbookTeamId, playName });
    res.status(201).json({ success: true, data: { play: newPlay, playCount: plays.length } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('POST /playbooks/:id/plays failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to add play' });
  }
});

// ─── PATCH /playbooks/:playbookId/plays/:playIndex ───────────────────────────
router.patch(
  '/playbooks/:playbookId/plays/:playIndex',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, playIndex } = req.params as { playbookId: string; playIndex: string };
      const idx = parseInt(playIndex, 10);
      if (Number.isNaN(idx) || idx < 0) {
        res.status(400).json({ success: false, error: 'Invalid play index' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const existing = doc.data() as Record<string, unknown>;
      const plays: Record<string, unknown>[] = [
        ...((existing['plays'] as Record<string, unknown>[]) ?? []),
      ];

      if (idx >= plays.length) {
        res.status(404).json({ success: false, error: 'Play index out of range' });
        return;
      }

      const playbookTeamId = String(existing['teamId'] ?? '');
      const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        playbookTeamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const updated: Record<string, unknown> = { ...plays[idx] };

      if (typeof body['name'] === 'string' && body['name'].trim())
        updated['name'] = titleCaseStr(body['name']);
      const strFields = [
        'series',
        'category',
        'formation',
        'personnel',
        'downDistance',
        'objective',
        'installNotes',
        'diagramUrl',
        'videoUrl',
      ] as const;
      for (const field of strFields) {
        if (typeof body[field] === 'string') updated[field] = (body[field] as string).trim();
      }
      if (Array.isArray(body['conceptTags']))
        updated['conceptTags'] = titleCaseArr(body['conceptTags']);
      if (Array.isArray(body['tags'])) updated['tags'] = titleCaseArr(body['tags']);

      plays[idx] = updated;
      const now = new Date().toISOString();
      const indexes = buildPlayIndexes(plays);

      await docRef.update({
        plays,
        playCount: plays.length,
        ...indexes,
        updatedAt: now,
        updatedBy: user.uid,
      });

      try {
        const cache = getCacheService();
        await cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`);
      } catch {
        /* best effort */
      }

      logger.info('PATCH /playbooks/:id/plays/:i', { playbookId, idx, teamId: playbookTeamId });
      res.json({ success: true, data: { play: updated } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('PATCH /playbooks/:id/plays/:i failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to update play' });
    }
  }
);

// ─── DELETE /playbooks/:playbookId/plays/:playIndex ──────────────────────────
router.delete(
  '/playbooks/:playbookId/plays/:playIndex',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { playbookId, playIndex } = req.params as { playbookId: string; playIndex: string };
      const idx = parseInt(playIndex, 10);
      if (Number.isNaN(idx) || idx < 0) {
        res.status(400).json({ success: false, error: 'Invalid play index' });
        return;
      }

      const { db } = req.firebase!;
      const docRef = db.collection(TEAM_PLAYBOOKS_COLLECTION).doc(playbookId);
      const doc = await docRef.get();
      if (!doc.exists) {
        res.status(404).json({ success: false, error: 'Playbook not found' });
        return;
      }

      const existing = doc.data() as Record<string, unknown>;
      const plays: Record<string, unknown>[] = [
        ...((existing['plays'] as Record<string, unknown>[]) ?? []),
      ];

      if (idx >= plays.length) {
        res.status(404).json({ success: false, error: 'Play index out of range' });
        return;
      }

      const playbookTeamId = String(existing['teamId'] ?? '');
      const teamDoc = await db.collection('Teams').doc(playbookTeamId).get();
      const authorized = await canManageTeamMutationForUser(
        db,
        user.uid,
        playbookTeamId,
        teamDoc.data() ?? {}
      );
      if (!authorized) {
        res.status(403).json({ success: false, error: 'Not authorized' });
        return;
      }

      plays.splice(idx, 1);
      const now = new Date().toISOString();
      const indexes = buildPlayIndexes(plays);

      await docRef.update({
        plays,
        playCount: plays.length,
        ...indexes,
        updatedAt: now,
        updatedBy: user.uid,
      });

      try {
        const cache = getCacheService();
        await cache.del(`team:playbooks:${playbookTeamId}:${String(existing['sport'] ?? '')}`);
      } catch {
        /* best effort */
      }

      logger.info('DELETE /playbooks/:id/plays/:i', { playbookId, idx, teamId: playbookTeamId });
      res.json({ success: true, data: { playCount: plays.length } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('DELETE /playbooks/:id/plays/:i failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to delete play' });
    }
  }
);

export default router;
