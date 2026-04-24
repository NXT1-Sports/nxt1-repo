/**
 * @fileoverview Agent X — Chat & conversation routes.
 *
 * POST /cancel/:id
 * POST /resume-job/:operationId
 * POST /approvals/:id/resolve
 * POST /enqueue
 * POST /chat
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { aiRateLimit } from '../../middleware/rate-limit/rate-limit.middleware.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { AgentChatRequestDto, AgentEnqueueRequestDto } from '../../dtos/agent-x.dto.js';
import type { AgentJobPayload, AgentJobOrigin, AgentYieldState } from '@nxt1/core';
import { STREAM_TERMINAL_EVENTS } from '../../modules/agent/queue/pubsub.service.js';
import { logger } from '../../utils/logger.js';
import { resolveBillingTarget, checkBudgetFromContext } from '../../modules/billing/index.js';
import crypto from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import {
  queueService,
  jobRepository,
  chatService,
  pubsubService,
  activeAbortControllers,
  getAuthUser,
  resolveThread,
  forceProxyFlush,
} from './shared.js';

const router = Router();

const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';
const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9:_-]{8,128}$/;
const OUTBOX_COLLECTION = 'AgentJobOutbox';

type AgentOutboxStatus = 'pending' | 'enqueued' | 'error';

interface AgentOutboxDocument {
  readonly operationId: string;
  readonly userId: string;
  readonly environment: 'staging' | 'production';
  readonly status: AgentOutboxStatus;
  readonly attempts: number;
  readonly payload: AgentJobPayload;
  readonly jobId?: string;
  readonly lastError?: string;
}

function parseIdempotencyKey(req: Request): string | null {
  const raw = req.get(IDEMPOTENCY_KEY_HEADER) ?? req.get('idempotency-key');
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  return IDEMPOTENCY_KEY_RE.test(value) ? value : null;
}

async function isAgentInfraHealthy(): Promise<boolean> {
  if (!queueService) return false;
  const queueHealthy =
    typeof queueService.isHealthy === 'function' ? await queueService.isHealthy() : true;
  if (!queueHealthy) return false;
  if (!pubsubService) return true;
  return typeof pubsubService.isHealthy === 'function' ? pubsubService.isHealthy() : true;
}

function writeSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.socket?.setNoDelay(true);
}

async function enqueueWithOutbox(
  db: Firestore,
  payload: AgentJobPayload,
  environment: 'staging' | 'production'
): Promise<{ jobId: string; deduplicated: boolean }> {
  if (!queueService) throw new Error('Agent queue is unavailable');

  const outboxRef = db.collection(OUTBOX_COLLECTION).doc(payload.operationId);
  const existing = await outboxRef.get();
  if (existing.exists) {
    const existingData = existing.data() as Partial<AgentOutboxDocument>;
    if (existingData.status === 'enqueued' && typeof existingData.jobId === 'string') {
      return { jobId: existingData.jobId, deduplicated: true };
    }
  }

  await outboxRef.set(
    {
      operationId: payload.operationId,
      userId: payload.userId,
      environment,
      status: 'pending' as AgentOutboxStatus,
      attempts: FieldValue.increment(1),
      payload,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  try {
    const jobId = await queueService.enqueue(payload, environment);
    await outboxRef.set(
      {
        status: 'enqueued' as AgentOutboxStatus,
        jobId,
        lastError: null,
        enqueuedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { jobId, deduplicated: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await outboxRef.set(
      {
        status: 'error' as AgentOutboxStatus,
        lastError: message,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw err;
  }
}

async function reconcileAgentOutbox(
  db: Firestore,
  environment: 'staging' | 'production',
  limit = 10
): Promise<void> {
  if (!queueService) return;

  const snapshot = await db
    .collection(OUTBOX_COLLECTION)
    .where('environment', '==', environment)
    .where('status', 'in', ['pending', 'error'])
    .limit(limit)
    .get();

  for (const doc of snapshot.docs) {
    const outbox = doc.data() as Partial<AgentOutboxDocument>;
    if (!outbox.payload || typeof outbox.payload !== 'object') {
      await doc.ref.set(
        {
          status: 'error' as AgentOutboxStatus,
          lastError: 'Missing payload in outbox document',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      continue;
    }

    try {
      const payload = outbox.payload as AgentJobPayload;
      const jobId = await queueService.enqueue(payload, environment);
      await doc.ref.set(
        {
          status: 'enqueued' as AgentOutboxStatus,
          jobId,
          lastError: null,
          enqueuedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      await doc.ref.set(
        {
          status: 'error' as AgentOutboxStatus,
          attempts: FieldValue.increment(1),
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
}

function emitReplayEvent(res: Response, rawEvt: unknown): void {
  const evt = (rawEvt ?? {}) as Record<string, unknown>;
  switch (evt['type']) {
    case 'delta':
      if (typeof evt['text'] === 'string') {
        res.write(`event: delta\ndata: ${JSON.stringify({ content: evt['text'] })}\n\n`);
      }
      break;
    case 'step_active':
    case 'step_done':
    case 'step_error': {
      const type = String(evt['type']);
      const status = type === 'step_active' ? 'active' : type === 'step_done' ? 'success' : 'error';
      res.write(
        `event: step\ndata: ${JSON.stringify({
          id: evt['toolName'] ?? evt['agentId'] ?? type,
          label: evt['message'] ?? type,
          status,
          agentId: evt['agentId'],
        })}\n\n`
      );
      break;
    }
    case 'card':
      if (evt['cardData'] && typeof evt['cardData'] === 'object') {
        res.write(`event: card\ndata: ${JSON.stringify(evt['cardData'])}\n\n`);
      }
      break;
    case 'done':
      res.write(`event: done\ndata: ${JSON.stringify(evt)}\n\n`);
      break;
    default:
      break;
  }
}

async function streamOperationToSse(params: {
  req: Request;
  res: Response;
  db: Firestore;
  operationId: string;
  userId: string;
  afterSeq?: number;
  initialThreadId?: string;
  initialOperationStatus?: 'in-progress' | 'awaiting_input' | 'awaiting_approval';
}): Promise<void> {
  const {
    req,
    res,
    db,
    operationId,
    userId,
    afterSeq = -1,
    initialThreadId,
    initialOperationStatus,
  } = params;

  if (!jobRepository) {
    res.status(503).json({ success: false, error: 'Agent job repository is unavailable' });
    return;
  }

  const repo = jobRepository.withDb(db);
  const job = await repo.getById(operationId);
  if (!job || job.userId !== userId) {
    res.status(404).json({
      success: false,
      error: 'Operation not found',
      code: 'AGENT_OPERATION_NOT_FOUND',
    });
    return;
  }

  writeSseHeaders(res);

  if (initialThreadId) {
    res.write(
      `event: thread\ndata: ${JSON.stringify({ threadId: initialThreadId, operationId })}\n\n`
    );
    forceProxyFlush(res);
  }

  if (initialOperationStatus && initialThreadId) {
    res.write(
      `event: operation\ndata: ${JSON.stringify({
        threadId: initialThreadId,
        operationId,
        status: initialOperationStatus,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
    forceProxyFlush(res);
  }

  const events = await repo.getJobEvents(operationId);
  let lastSeq = afterSeq;
  let replaySawTerminal = false;
  for (const evt of events) {
    const seq = typeof evt.seq === 'number' ? evt.seq : -1;
    if (seq <= afterSeq) continue;
    emitReplayEvent(res, evt);
    if (seq > lastSeq) lastSeq = seq;
    if (STREAM_TERMINAL_EVENTS.has(String(evt.type ?? ''))) {
      replaySawTerminal = true;
    }
  }

  if (replaySawTerminal) {
    res.end();
    return;
  }

  const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
  if (terminalStatuses.has(job.status)) {
    res.write(
      `event: done\ndata: ${JSON.stringify({
        operationId,
        threadId: job.threadId ?? undefined,
        status: job.status,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
    res.end();
    return;
  }

  let closed = false;
  const closeCallbacks: Array<() => void> = [];
  const closeStream = () => {
    if (closed) return;
    closed = true;
    for (const cb of closeCallbacks) cb();
  };

  req.on('close', () => {
    closeStream();
    repo.markDetached(operationId).catch(() => undefined);
  });

  const heartbeat = setInterval(() => {
    if (closed) return;
    try {
      res.write('event: ping\ndata: {}\n\n');
    } catch {
      closeStream();
    }
  }, 15_000);
  closeCallbacks.push(() => clearInterval(heartbeat));

  const pubsubHealthy =
    !!pubsubService &&
    (typeof pubsubService.isHealthy !== 'function' || (await pubsubService.isHealthy()));

  if (pubsubHealthy && pubsubService) {
    try {
      const unsubscribe = await pubsubService.subscribe(operationId, (msg) => {
        if (closed) return;
        try {
          res.write(`event: ${msg.event}\ndata: ${JSON.stringify(msg.data)}\n\n`);
          if (STREAM_TERMINAL_EVENTS.has(msg.event)) {
            closeStream();
            res.end();
          }
        } catch {
          closeStream();
        }
      });

      closeCallbacks.push(() => {
        void unsubscribe();
      });
      return;
    } catch (err) {
      logger.warn('PubSub subscribe failed; falling back to Firestore tailing', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback transport: Firestore tail polling when Redis PubSub is unavailable.
  let polling = false;
  const pollTimer = setInterval(async () => {
    if (closed || polling) return;
    polling = true;
    try {
      const latestEvents = await repo.getJobEvents(operationId);
      for (const evt of latestEvents) {
        const seq = typeof evt['seq'] === 'number' ? (evt['seq'] as number) : -1;
        if (seq <= lastSeq) continue;
        emitReplayEvent(res, evt);
        lastSeq = Math.max(lastSeq, seq);
      }

      const latestJob = await repo.getById(operationId);
      if (!latestJob || terminalStatuses.has(latestJob.status)) {
        res.write(
          `event: done\ndata: ${JSON.stringify({
            operationId,
            threadId: latestJob?.threadId ?? undefined,
            status: latestJob?.status ?? 'completed',
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
        closeStream();
        res.end();
      }
    } catch (err) {
      logger.warn('Firestore tail polling failed', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      polling = false;
    }
  }, 1200);

  closeCallbacks.push(() => clearInterval(pollTimer));
}

// ─── POST /cancel/:id — Explicit cancellation endpoint ───────────────────

router.post('/cancel/:id', appGuard, async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user?.uid) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const operationId = req.params['id'] as string;
  if (!operationId) {
    res.status(400).json({ success: false, error: 'Operation ID is required' });
    return;
  }

  const db = req.firebase?.db;
  if (!db || !jobRepository) {
    res.status(503).json({ success: false, error: 'Agent persistence unavailable' });
    return;
  }

  const persistedJob = await jobRepository.withDb(db).getById(operationId);
  if (!persistedJob || persistedJob.userId !== user.uid) {
    logger.warn('Forbidden cancel attempt: operation belongs to another user or missing', {
      operationId,
      requesterUserId: user.uid,
    });
    res.status(404).json({ success: false, error: 'Operation not found' });
    return;
  }

  const entry = activeAbortControllers.get(operationId);
  if (entry) {
    entry.controller.abort();
    activeAbortControllers.delete(operationId);
  }

  let queueCancelled = false;
  if (queueService) {
    try {
      queueCancelled = await queueService.cancel(operationId);
    } catch (err) {
      logger.warn('Queue cancellation call failed', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await jobRepository
    .withDb(db)
    .markCancelled(operationId)
    .catch((err: unknown) => {
      logger.warn('Failed to mark operation cancelled in repository', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  logger.info('Agent X operation cancelled via explicit endpoint', {
    operationId,
    userId: user.uid,
    queueCancelled,
  });

  res.json({ success: true, cancelled: true, queueCancelled });
});

// ─── POST /resume-job/:operationId — Resume a yielded agent job ───────────

router.post('/resume-job/:operationId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    if (!(await isAgentInfraHealthy())) {
      res.setHeader('Retry-After', '10');
      res.status(503).json({
        success: false,
        error: 'Agent infrastructure is temporarily unavailable. Please retry shortly.',
        code: 'AGENT_INFRA_UNAVAILABLE',
      });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { operationId } = req.params;
    if (!operationId || typeof operationId !== 'string') {
      res.status(400).json({ success: false, error: 'Operation ID is required' });
      return;
    }

    const { response: userResponse } = req.body as { response?: string };
    if (!userResponse || typeof userResponse !== 'string' || userResponse.trim().length === 0) {
      res.status(400).json({ success: false, error: 'A non-empty response is required' });
      return;
    }

    if (userResponse.length > 5000) {
      res.status(400).json({ success: false, error: 'Response must be 5000 characters or less' });
      return;
    }

    const { db } = req.firebase!;
    const jobDoc = await jobRepository.withDb(db).getById(operationId);
    if (!jobDoc) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    if (jobDoc.userId !== user.uid) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    const status = jobDoc.status;
    if (status !== 'awaiting_input' && status !== 'awaiting_approval') {
      res.status(409).json({
        success: false,
        error: `Job is in "${status}" state — only yielded jobs can be resumed`,
      });
      return;
    }

    const yieldState = jobDoc.yieldState as AgentYieldState | undefined;
    if (!yieldState) {
      res.status(409).json({ success: false, error: 'No yield state found on this job' });
      return;
    }

    if (new Date(yieldState.expiresAt).getTime() < Date.now()) {
      await jobRepository.withDb(db).markFailed(operationId, 'Yield expired before user responded');
      res.status(410).json({ success: false, error: 'This request has expired' });
      return;
    }

    const threadId = jobDoc.threadId;
    if (threadId && chatService) {
      try {
        await chatService.addMessage({
          threadId,
          userId: user.uid,
          role: 'user',
          content: userResponse.trim(),
          origin: 'user',
          operationId,
        });
      } catch (chatErr) {
        logger.warn('Failed to persist resume message to MongoDB', {
          error: chatErr instanceof Error ? chatErr.message : String(chatErr),
          userId: user.uid,
        });
      }
    }

    const resumedPayload: AgentJobPayload = {
      operationId: crypto.randomUUID(),
      userId: user.uid,
      intent: jobDoc.intent,
      sessionId: crypto.randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context: {
        threadId,
        resumedFrom: operationId,
        yieldState: {
          ...yieldState,
          messages: [
            ...yieldState.messages,
            {
              role: 'tool',
              content: JSON.stringify({
                success: true,
                data: { userResponse: userResponse.trim() },
              }),
              tool_call_id: yieldState.pendingToolCall?.toolCallId ?? 'ask_user_response',
            },
          ],
        } satisfies AgentYieldState,
      },
    };

    await jobRepository.withDb(db).create(resumedPayload);
    await jobRepository.withDb(db).markCompleted(operationId, {
      summary: `Resumed by user — continuing as ${resumedPayload.operationId}`,
      data: { resumedAs: resumedPayload.operationId },
    });
    const environment = req.isStaging ? 'staging' : 'production';
    const enqueueResult = await enqueueWithOutbox(db, resumedPayload, environment);

    logger.info('Agent job resumed', {
      originalOperationId: operationId,
      newOperationId: resumedPayload.operationId,
      userId: user.uid,
    });

    res.status(202).json({
      success: true,
      data: {
        jobId: enqueueResult.jobId,
        operationId: resumedPayload.operationId,
        threadId,
        resumedFrom: operationId,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to resume agent job', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to resume job' });
  }
});

// ─── POST /approvals/:id/resolve — Resolve an approval request ────────────

router.post('/approvals/:id/resolve', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const approvalId = req.params['id'];
    if (!approvalId || typeof approvalId !== 'string') {
      res.status(400).json({ success: false, error: 'Approval ID is required' });
      return;
    }

    const { decision, toolInput } = req.body as {
      decision?: string;
      toolInput?: Record<string, unknown>;
    };
    if (decision !== 'approved' && decision !== 'rejected') {
      res.status(400).json({
        success: false,
        error: 'Decision must be "approved" or "rejected"',
      });
      return;
    }
    if (
      toolInput !== undefined &&
      (typeof toolInput !== 'object' || toolInput === null || Array.isArray(toolInput))
    ) {
      res.status(400).json({
        success: false,
        error: 'toolInput must be an object when provided',
      });
      return;
    }

    const { db } = req.firebase!;
    const approvalRef = db.collection('AgentApprovalRequests').doc(approvalId);

    const transactionResult = await db.runTransaction(async (txn) => {
      const approvalSnap = await txn.get(approvalRef);
      if (!approvalSnap.exists) return { code: 404, error: 'Approval request not found' } as const;

      const approvalData = approvalSnap.data()!;

      if (approvalData['userId'] !== user.uid) {
        return { code: 404, error: 'Approval request not found' } as const;
      }

      if (approvalData['status'] !== 'pending') {
        return {
          code: 409,
          error: `Approval is already "${approvalData['status']}"`,
        } as const;
      }

      txn.update(approvalRef, {
        status: decision,
        resolvedAt: new Date().toISOString(),
        resolvedBy: user.uid,
        ...(toolInput ? { toolInput } : {}),
      });

      return {
        code: 200,
        operationId: approvalData['operationId'] as string | undefined,
        toolInput: (toolInput ?? approvalData['toolInput']) as Record<string, unknown> | undefined,
      } as const;
    });

    if ('error' in transactionResult) {
      res.status(transactionResult.code).json({ success: false, error: transactionResult.error });
      return;
    }

    const operationId = transactionResult.operationId;
    const resolvedToolInput = transactionResult.toolInput;
    if (!operationId) {
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    const jobDoc = await jobRepository.withDb(db).getById(operationId);
    if (!jobDoc) {
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    const yieldState = jobDoc.yieldState as AgentYieldState | undefined;

    if (decision === 'rejected') {
      await jobRepository.withDb(db).markCancelled(operationId);
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    if (!yieldState?.pendingToolCall) {
      await jobRepository.withDb(db).markCompleted(operationId, {
        summary: 'Approval granted but no pending action to resume.',
      });
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    const threadId = jobDoc.threadId;

    const resumedPayload: AgentJobPayload = {
      operationId: crypto.randomUUID(),
      userId: user.uid,
      intent: jobDoc.intent,
      sessionId: crypto.randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context: {
        threadId,
        resumedFrom: operationId,
        approvalId,
        yieldState: yieldState.pendingToolCall
          ? {
              ...yieldState,
              approvalId,
              pendingToolCall: {
                ...yieldState.pendingToolCall,
                toolInput: resolvedToolInput ?? yieldState.pendingToolCall.toolInput,
              },
            }
          : yieldState,
      },
    };

    await jobRepository.withDb(db).create(resumedPayload);
    await jobRepository.withDb(db).markCompleted(operationId, {
      summary: `Approved — continuing as ${resumedPayload.operationId}`,
      data: { resumedAs: resumedPayload.operationId, approvalId },
    });

    const environment = req.isStaging ? 'staging' : 'production';
    const enqueueResult = await enqueueWithOutbox(db, resumedPayload, environment);

    logger.info('Approval resolved and job resumed', {
      approvalId,
      decision,
      originalOperationId: operationId,
      newOperationId: resumedPayload.operationId,
      userId: user.uid,
    });

    res.status(202).json({
      success: true,
      data: {
        decision,
        resumed: true,
        jobId: enqueueResult.jobId,
        operationId: resumedPayload.operationId,
        threadId,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to resolve approval', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to resolve approval' });
  }
});

// ─── POST /enqueue — Background enqueue without SSE ──────────────────────

router.post(
  '/enqueue',
  appGuard,
  aiRateLimit,
  validateBody(AgentEnqueueRequestDto),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      if (!queueService || !jobRepository) {
        res.status(503).json({ success: false, error: 'Agent queue is unavailable' });
        return;
      }

      if (!(await isAgentInfraHealthy())) {
        res.setHeader('Retry-After', '10');
        res.status(503).json({
          success: false,
          error: 'Agent infrastructure is temporarily unavailable. Please retry shortly.',
          code: 'AGENT_INFRA_UNAVAILABLE',
        });
        return;
      }

      const { intent, userContext, threadId } = req.body as AgentEnqueueRequestDto;
      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }
      const environment = req.isStaging ? 'staging' : 'production';

      // Opportunistic healing for previously failed/pending outbox entries.
      void reconcileAgentOutbox(db, environment).catch((err: unknown) => {
        logger.warn('Outbox reconciliation failed during /enqueue admission', {
          error: err instanceof Error ? err.message : String(err),
          environment,
        });
      });

      const idempotencyKey = parseIdempotencyKey(req);
      if ((req.get(IDEMPOTENCY_KEY_HEADER) || req.get('idempotency-key')) && !idempotencyKey) {
        res.status(400).json({
          success: false,
          error:
            'Invalid idempotency key. Use 8-128 chars: letters, numbers, colon, underscore, hyphen.',
        });
        return;
      }

      if (idempotencyKey) {
        const existing = await jobRepository
          .withDb(db)
          .getByIdempotencyKey(user.uid, idempotencyKey);
        if (existing) {
          logger.info('Agent enqueue deduplicated by idempotency key', {
            userId: user.uid,
            operationId: existing.operationId,
          });
          res.status(202).json({
            success: true,
            deduplicated: true,
            data: {
              jobId: existing.operationId,
              operationId: existing.operationId,
              ...(existing.threadId ? { threadId: existing.threadId } : {}),
            },
          });
          return;
        }
      }

      let resolvedThreadId: string | undefined;
      if (chatService) {
        try {
          resolvedThreadId = await resolveThread(chatService, user.uid, threadId, intent);
          if (resolvedThreadId) {
            await chatService.addMessage({
              threadId: resolvedThreadId,
              userId: user.uid,
              role: 'user',
              content: intent.trim(),
              origin: 'user',
              agentId: 'strategy_coordinator',
            });
          }
        } catch (threadErr) {
          logger.warn('Failed to prepare thread for background enqueue', {
            userId: user.uid,
            error: threadErr instanceof Error ? threadErr.message : String(threadErr),
          });
        }
      }

      const operationId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const payload: AgentJobPayload = {
        operationId,
        userId: user.uid,
        intent: intent.trim(),
        sessionId,
        origin: 'user' as AgentJobOrigin,
        context: {
          ...(userContext ?? {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
        },
      };

      await jobRepository.withDb(db).create(payload);
      const enqueueResult = await enqueueWithOutbox(db, payload, environment);

      logger.info('Agent X background job enqueued', {
        operationId,
        jobId: enqueueResult.jobId,
        deduplicated: enqueueResult.deduplicated,
        userId: user.uid,
        hasThread: !!resolvedThreadId,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: enqueueResult.jobId,
          operationId,
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to enqueue Agent X background job', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to enqueue job' });
    }
  }
);

// ─── POST /chat — Real conversational Agent X chat (SSE Streaming) ────────

router.post(
  '/chat',
  appGuard,
  aiRateLimit,
  validateBody(AgentChatRequestDto),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      if (!queueService || !jobRepository) {
        res.status(503).json({ success: false, error: 'Agent queue is unavailable' });
        return;
      }

      if (!(await isAgentInfraHealthy())) {
        res.setHeader('Retry-After', '10');
        res.status(503).json({
          success: false,
          error: 'Agent infrastructure is temporarily unavailable. Please retry shortly.',
          code: 'AGENT_INFRA_UNAVAILABLE',
        });
        return;
      }

      const { db } = req.firebase!;
      const environment = req.isStaging ? 'staging' : 'production';

      void reconcileAgentOutbox(db, environment).catch((err: unknown) => {
        logger.warn('Outbox reconciliation failed during /chat admission', {
          error: err instanceof Error ? err.message : String(err),
          environment,
        });
      });

      const { message, mode, threadId, attachments, resumeOperationId, afterSeq } =
        req.body as AgentChatRequestDto;
      const idempotencyKey = parseIdempotencyKey(req);

      if ((req.get(IDEMPOTENCY_KEY_HEADER) || req.get('idempotency-key')) && !idempotencyKey) {
        res.status(400).json({
          success: false,
          error:
            'Invalid idempotency key. Use 8-128 chars: letters, numbers, colon, underscore, hyphen.',
        });
        return;
      }

      let effectiveOperationId: string | undefined = resumeOperationId;
      let effectiveThreadId: string | undefined;

      if (!effectiveOperationId && idempotencyKey) {
        const existing = await jobRepository
          .withDb(db)
          .getByIdempotencyKey(user.uid, idempotencyKey);
        if (existing) {
          effectiveOperationId = existing.operationId;
          effectiveThreadId = existing.threadId ?? undefined;
          logger.info('Agent chat deduplicated by idempotency key; resuming existing operation', {
            operationId: existing.operationId,
            userId: user.uid,
          });
        }
      }

      // Resume existing operation stream (drop recovery or idempotent retry)
      if (effectiveOperationId) {
        await streamOperationToSse({
          req,
          res,
          db,
          operationId: effectiveOperationId,
          userId: user.uid,
          afterSeq,
          initialThreadId: effectiveThreadId,
        });
        return;
      }

      // New request path: create thread/message, create+enqueue job, then stream from persistence + live pubsub.
      const allAttachments = attachments ?? [];
      const fileAttachments = allAttachments.filter(
        (a: { mimeType: string }) =>
          a.mimeType.startsWith('image/') ||
          a.mimeType === 'application/pdf' ||
          a.mimeType === 'text/csv' ||
          a.mimeType === 'text/plain' ||
          a.mimeType === 'application/vnd.ms-excel' ||
          a.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          a.mimeType === 'application/msword' ||
          a.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) as {
        id: string;
        url: string;
        name: string;
        mimeType: string;
        type: string;
        sizeBytes: number;
      }[];
      const videoAttachments = allAttachments.filter((a: { mimeType: string }) =>
        a.mimeType.startsWith('video/')
      ) as {
        id: string;
        url: string;
        name: string;
        mimeType: string;
        type: string;
        sizeBytes: number;
        cloudflareVideoId?: string;
      }[];

      let enrichedMessageText = message.trim();
      if (videoAttachments.length > 0) {
        const videoRefs = videoAttachments
          .map((v) => {
            const idPart = v.cloudflareVideoId
              ? ` | cloudflareVideoId: ${v.cloudflareVideoId}`
              : '';
            return `[Attached video: ${v.name} — ${v.url}${idPart}]`;
          })
          .join('\n');
        enrichedMessageText = `${enrichedMessageText}\n\n${videoRefs}`;
      }
      if (fileAttachments.length > 0) {
        const fileRefs = fileAttachments
          .map((f) => `[Attached file: ${f.name} (${f.mimeType}) — ${f.url}]`)
          .join('\n');
        enrichedMessageText = `${enrichedMessageText}\n\n${fileRefs}`;
      }

      if (chatService) {
        try {
          effectiveThreadId = await resolveThread(chatService, user.uid, threadId, message);
          if (effectiveThreadId) {
            await chatService.addMessage({
              threadId: effectiveThreadId,
              userId: user.uid,
              role: 'user',
              content: enrichedMessageText,
              origin: 'user',
            });
          }
        } catch (chatErr) {
          logger.warn('Failed to persist user message to MongoDB', {
            error: chatErr instanceof Error ? chatErr.message : String(chatErr),
            userId: user.uid,
          });
        }
      }

      const chatTarget = await resolveBillingTarget(db, user.uid);
      const chatCtx = chatTarget.context;
      const chatBudgetCheck = checkBudgetFromContext(chatCtx);
      if (!chatBudgetCheck.allowed) {
        const isWalletUser =
          chatCtx.billingEntity === 'individual' && chatCtx.paymentProvider === 'iap';
        res.status(402).json({
          success: false,
          error: chatBudgetCheck.reason,
          code: isWalletUser ? 'WALLET_EMPTY' : 'BUDGET_EXCEEDED',
        });
        return;
      }

      const operationId = `chat-${crypto.randomUUID()}`;
      const payload: AgentJobPayload = {
        operationId,
        userId: user.uid,
        intent: message.trim(),
        sessionId: crypto.randomUUID(),
        origin: 'user' as AgentJobOrigin,
        agent: 'strategy_coordinator' as import('@nxt1/core').AgentIdentifier,
        context: {
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(effectiveThreadId ? { threadId: effectiveThreadId } : {}),
          ...(mode ? { mode } : {}),
          ...(fileAttachments.length > 0 ? { attachments: fileAttachments } : {}),
          ...(videoAttachments.length > 0 ? { videoAttachments } : {}),
        },
      };

      await jobRepository.withDb(db).create(payload);
      await enqueueWithOutbox(db, payload, environment);

      logger.info('Agent X chat admitted to queue (enqueue-first)', {
        operationId,
        userId: user.uid,
        threadId: effectiveThreadId,
        environment,
      });

      await streamOperationToSse({
        req,
        res,
        db,
        operationId,
        userId: user.uid,
        afterSeq,
        initialThreadId: effectiveThreadId,
        initialOperationStatus: 'in-progress',
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X chat failed', { error: error.message, stack: error.stack });

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to process message',
          errorCode: 'AI_SERVICE_ERROR',
        });
      } else {
        try {
          res.write(
            `event: error\ndata: ${JSON.stringify({ error: 'Failed to process message', code: 'AI_SERVICE_ERROR' })}\n\n`
          );
          forceProxyFlush(res);
          res.end();
        } catch {
          // Client already disconnected
        }
      }
    }
  }
);

export default router;
