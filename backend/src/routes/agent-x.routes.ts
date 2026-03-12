/**
 * @fileoverview Agent X Routes
 * @module @nxt1/backend/routes/agent-x
 *
 * REST API for the Agent X background job engine.
 * All heavy work runs via BullMQ workers — these endpoints
 * enqueue jobs and return status. The frontend polls status
 * or listens to Firestore for real-time updates.
 *
 * Routes:
 *   POST /api/v1/agent-x/ask         → Enqueue a new agent job
 *   GET  /api/v1/agent-x/status/:id  → Poll job progress/result
 *   POST /api/v1/agent-x/cancel/:id  → Cancel an active job
 *   GET  /api/v1/agent-x/history     → Get user's job history
 *   POST /api/v1/agent-x/pause       → Pause the entire queue (admin)
 *   POST /api/v1/agent-x/resume      → Resume the entire queue (admin)
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { appGuard, adminGuard } from '../middleware/auth.middleware.js';
import type { AgentJobPayload, AgentJobOrigin } from '@nxt1/core';
import { logger } from '../utils/logger.js';

/** Maximum allowed intent length (characters) to prevent prompt injection / DoS. */
const MAX_INTENT_LENGTH = 5_000;

/** Extract the authenticated user from the request (set by appGuard). */
function getAuthUser(req: Request): { uid: string } | undefined {
  return (req as Request & { user?: { uid: string } }).user;
}

// Lazy-loaded singletons (initialized by bootstrapAgentQueue in app startup)
let queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService | null = null;
let jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository | null =
  null;

/**
 * Called once at server startup to inject the queue + repo singletons.
 * This avoids circular imports and ensures Redis is connected first.
 */
export function setAgentDependencies(deps: {
  queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService;
  jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
}

const router: ExpressRouter = Router();

// ─── POST /ask — Enqueue a new agent job ──────────────────────────────────

router.post('/ask', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const { intent, sessionId, context } = req.body as {
      intent?: string;
      sessionId?: string;
      context?: Record<string, unknown>;
    };

    if (!intent || typeof intent !== 'string' || intent.trim().length === 0) {
      res.status(400).json({ success: false, error: 'intent is required' });
      return;
    }

    if (intent.trim().length > MAX_INTENT_LENGTH) {
      res.status(400).json({
        success: false,
        error: `intent exceeds maximum length of ${MAX_INTENT_LENGTH} characters`,
      });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const operationId = crypto.randomUUID();
    const payload: AgentJobPayload = {
      operationId,
      userId: user.uid,
      intent: intent.trim(),
      sessionId: sessionId ?? crypto.randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context,
    };

    // Write to Firestore first so the frontend can listen immediately.
    // Use req.firebase.db to target the correct environment (staging vs production).
    const { db } = req.firebase!;
    await jobRepository.withDb(db).create(payload);

    // Enqueue the job in Redis/BullMQ
    const jobId = await queueService.enqueue(payload, req.isStaging ? 'staging' : 'production');

    logger.info('Agent job enqueued', { operationId, userId: user.uid });

    res.status(202).json({
      success: true,
      data: { jobId, operationId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to enqueue agent job', { error: message });
    res.status(500).json({
      success: false,
      error: 'Failed to process request',
    });
  }
});

// ─── GET /status/:id — Poll job progress ──────────────────────────────────

router.get('/status/:id', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      res.status(400).json({ success: false, error: 'Job ID is required' });
      return;
    }

    // Verify ownership: only the job's creator can poll status
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const status = await queueService.getJobStatus(id);

    if (!status) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    // Ownership check: job must belong to the requesting user
    if (status.userId && status.userId !== user.uid) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    res.json({ success: true, data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to get job status', { error: message });
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

// ─── POST /cancel/:id — Cancel an active job ─────────────────────────────

router.post('/cancel/:id', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      res.status(400).json({ success: false, error: 'Job ID is required' });
      return;
    }

    // Verify ownership: only the job's creator can cancel
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Check ownership before allowing cancel
    const status = await queueService.getJobStatus(id);
    if (!status) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }
    if (status.userId && status.userId !== user.uid) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    const cancelled = await queueService.cancel(id);

    if (cancelled) {
      const { db } = req.firebase!;
      await jobRepository.withDb(db).markCancelled(id);
      logger.info('Agent job cancelled', { operationId: id, userId: user.uid });
    }

    res.json({ success: true, data: { cancelled } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to cancel job', { error: message });
    res.status(500).json({ success: false, error: 'Failed to cancel job' });
  }
});

// ─── GET /history — Get user's job history ────────────────────────────────

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
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to get job history', { error: message });
    res.status(500).json({ success: false, error: 'Failed to get history' });
  }
});

// ─── POST /pause — Pause the entire queue (admin only) ────────────────────

router.post('/pause', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    await queueService.pauseAll();
    logger.info('Agent queue paused by admin');
    res.json({ success: true, data: { paused: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to pause queue', { error: message });
    res.status(500).json({ success: false, error: 'Failed to pause queue' });
  }
});

// ─── POST /resume — Resume the queue (admin only) ─────────────────────────

router.post('/resume', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    await queueService.resumeAll();
    logger.info('Agent queue resumed by admin');
    res.json({ success: true, data: { paused: false } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to resume queue', { error: message });
    res.status(500).json({ success: false, error: 'Failed to resume queue' });
  }
});

// ─── GET /queue-stats — Queue health (admin only) ─────────────────────────

router.get('/queue-stats', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const counts = await queueService.getCounts();
    const paused = await queueService.isPaused();
    res.json({ success: true, data: { counts, paused } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to get queue stats', { error: message });
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

export default router;
