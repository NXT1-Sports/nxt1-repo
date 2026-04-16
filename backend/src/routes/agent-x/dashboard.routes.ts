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
import { appGuard } from '../../middleware/auth.middleware.js';
import { uploadRateLimit } from '../../middleware/rate-limit.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { SetGoalsDto } from '../../dtos/agent-x.dto.js';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  AgentDashboardGoal,
  ShellWeeklyPlaybookItem,
  ShellBriefingInsight,
  OperationLogEntry,
} from '@nxt1/core';
import { getShellContentForRole } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { getStorage } from 'firebase-admin/storage';
import {
  validateJobOrigin,
  mapJobStatus,
  inferCategory,
  iconForCategory,
  computeDuration,
} from './operations-log.helpers.js';
import {
  jobRepository,
  chatService,
  agentUpload,
  getAuthUser,
  isLegacyFallbackPlaybook,
} from './shared.js';

const router = Router();

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
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 50;

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

    const entries: OperationLogEntry[] = [];
    const representedThreadIds = new Set<string>();

    for (const job of jobs) {
      const intent = (job['intent'] as string) ?? '';
      if (!intent) continue;

      const status = mapJobStatus((job['status'] as string) ?? '', (raw: string) =>
        logger.warn('Unknown job status mapped to in-progress', { status: raw })
      );
      const category = inferCategory(intent);
      const createdAt = job['createdAt'] as Timestamp | undefined;
      const completedAt = job['completedAt'] as Timestamp | undefined | null;
      const result = job['result'] as { summary?: string } | null | undefined;
      const jobOrigin = validateJobOrigin(job['origin']);
      const isScheduled = jobOrigin !== 'user';
      const threadId = (job['threadId'] as string) ?? undefined;

      if (threadId) representedThreadIds.add(threadId);

      entries.push({
        id: (job['operationId'] as string) ?? '',
        title: intent.slice(0, 120),
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

    if (chatService) {
      try {
        const threadResult = await chatService.getUserThreads({
          userId: user.uid,
          archived: false,
          limit,
        });
        const threads = threadResult.items ?? [];
        const threadsHasMore = threadResult.hasMore ?? false;

        if (threadsHasMore) {
          logger.warn('Operations log thread augmentation truncated — consider increasing limit', {
            userId: user.uid,
            displayedCount: threads.length,
            limit,
          });
        }

        for (const thread of threads) {
          if (!thread.id || representedThreadIds.has(thread.id)) continue;

          const category = inferCategory(thread.title);
          entries.push({
            id: thread.id,
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

    const shellContent = getShellContentForRole(role);

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

    const latestRealPlaybook = playbookDoc.docs.find((doc) => {
      const items = (doc.data()['items'] ?? []) as ShellWeeklyPlaybookItem[];
      return !isLegacyFallbackPlaybook(items);
    });

    if (latestRealPlaybook) {
      const pData = latestRealPlaybook.data();
      playbookItems = (pData['items'] ?? []) as ShellWeeklyPlaybookItem[];
      playbookGeneratedAt = (pData['generatedAt'] as string) ?? null;
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
          items: playbookItems,
          goals: agentGoals,
          generatedAt: playbookGeneratedAt,
          canRegenerate: agentGoals.length > 0,
        },
        coordinators: shellContent.coordinators,
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

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to set agent goals', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to save goals' });
  }
});

// ─── POST /upload ─────────────────────────────────────────────────────────

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

      const bucket = getStorage().bucket();
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `AgentX/${user.uid}/${timestamp}_${sanitizedName}`;
      const storageFile = bucket.file(storagePath);

      await storageFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
          cacheControl: 'public, max-age=31536000',
        },
      });

      await storageFile.makePublic();
      const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      logger.info('Agent X file uploaded', {
        userId: user.uid,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
      });

      res.json({
        success: true,
        data: {
          url,
          name: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X file upload failed', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
  }
);

export default router;
