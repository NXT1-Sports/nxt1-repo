/**
 * @fileoverview Agent X — Dashboard, history, operations-log, goals, upload routes.
 *
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
          logger.warn('Operations log thread augmentation truncated — consider increasing limit', {
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

    // ── Deduplicate by threadId: keep the most recent job per thread ────
    // jobs[] is already ordered by createdAt DESC from Firestore, so the
    // first job seen for a threadId is the most recent one.
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

      // Option 2 UX: hide background playbook-generation jobs from session history.
      // These jobs do not create a chat thread and open as empty chats when tapped.
      if (operationId.startsWith('playbook-') || jobMode === 'playbook') {
        continue;
      }

      const intent = (job['intent'] as string) ?? '';
      if (!intent) continue;

      const threadId = (job['threadId'] as string) ?? undefined;
      const resolvedTitle = threadId ? (threadTitleById.get(threadId)?.trim() ?? '') : '';

      // If this job belongs to a thread we've already represented, skip it.
      // This collapses multiple messages in the same conversation into one row.
      if (threadId) {
        // Guardrail: ignore stale jobs referencing deleted/archived threads.
        // Only apply when threadQuerySucceeded — distinguishes "query returned 0
        // active threads" (user archived everything) from "query failed" (be lenient).
        if (threadQuerySucceeded && !activeThreadIds.has(threadId)) continue;

        if (seenThreadIds.has(threadId)) continue;
        seenThreadIds.add(threadId);
        representedThreadIds.add(threadId);
      }

      const status = mapJobStatus(
        (job['status'] as string) ?? '',
        (raw: string) => logger.warn('Unknown job status mapped to in-progress', { status: raw }),
        job['yieldState']
      );
      const category = inferCategory(intent);
      const createdAt = job['createdAt'] as TimestampLike | undefined;
      const completedAt = job['completedAt'] as TimestampLike | undefined | null;
      const result = job['result'] as { summary?: string } | null | undefined;
      const jobOrigin = validateJobOrigin(job['origin']);
      const isScheduled = isScheduledOrigin(jobOrigin);

      entries.push({
        id: threadId ?? (job['operationId'] as string) ?? '',
        operationId: (job['operationId'] as string) ?? undefined,
        title: (resolvedTitle || intent).slice(0, 120),
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
              ? `Next run ${new Date(nextRunIso).toLocaleString()} (${timezone})`
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

    let suggestedActionsPayload: Record<string, unknown> | null = suggestedActionsDoc.empty
      ? null
      : (suggestedActionsDoc.docs[0].data() as Record<string, unknown>);

    if (!suggestedActionsPayload) {
      try {
        logger.info('Generating first-load suggested actions during dashboard request', {
          userId: user.uid,
          role,
        });

        const generatedSuggestedActions =
          await getGenerationService().generateWeeklySuggestedActions(user.uid, true, db);

        if (generatedSuggestedActions) {
          suggestedActionsPayload = {
            coordinators: generatedSuggestedActions.coordinators,
            generatedAt: generatedSuggestedActions.generatedAt,
          };
        }
      } catch (suggestedActionsErr) {
        logger.warn('Failed to generate first-load suggested actions during dashboard request', {
          userId: user.uid,
          error:
            suggestedActionsErr instanceof Error
              ? suggestedActionsErr.message
              : String(suggestedActionsErr),
        });
      }
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
        error: `File exceeds maximum video size limit (500 MB)`,
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

    const uploadExpiresAtMs = Date.now() + 30 * 60 * 1000;
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

export default router;
