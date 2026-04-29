/**
 * @fileoverview Agent X — Chat & conversation routes.
 *
 * POST /pause/:id
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
import type {
  AgentJobPayload,
  AgentJobOrigin,
  AgentYieldState,
  AgentXAttachment,
  AgentXOperationLifecycleStatus,
  AgentXSelectedAction,
} from '@nxt1/core';
import { STREAM_TERMINAL_EVENTS } from '../../modules/agent/queue/pubsub.service.js';
import { logger } from '../../utils/logger.js';
import { resolveBillingTarget, checkBudgetFromContext } from '../../modules/billing/index.js';
import crypto from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import {
  getAgentAppConfig,
  getCachedAgentAppConfig,
  resolveConfiguredCoordinatorActionForRole,
} from '../../modules/agent/config/agent-app-config.js';

import {
  queueService,
  jobRepository,
  chatService,
  llmService,
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
// Outbox TTL durations — Firestore auto-deletes docs once expiresAt passes.
const OUTBOX_TTL_PENDING_DAYS = 1; // stuck-pending safety floor; fast cleanup
const OUTBOX_TTL_ENQUEUED_DAYS = 7; // successfully delivered; keep for debug audit
const OUTBOX_TTL_ERROR_DAYS = 7; // failed delivery; keep for ops triage
const MAX_CONCURRENT_STREAMS_PER_USER = 5;
const POLL_BACKOFF_INITIAL_MS = 1200;
const POLL_BACKOFF_MAX_MS = 30_000;
const FALLBACK_ALERT_THRESHOLD_MS = 30_000;
const STREAM_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — auto-cleanup zombie streams
const LIVE_BUFFER_MAX_EVENTS = 500;
const PAUSE_YIELD_TTL_MS = 24 * 60 * 60 * 1000;
const PAUSE_RESUME_TOOL_NAME = 'resume_paused_operation';
const AGENT_STREAM_EVENT_SCHEMA_VERSION = 2;
const activeUserStreams = new Map<string, Set<string>>();

interface ActiveOperationStreamLease {
  readonly userId: string;
  readonly streamId: string;
  terminate(reason: 'replaced', replacedByStreamId: string): void;
}

const activeOperationStreams = new Map<string, ActiveOperationStreamLease>();

const streamObservability = {
  streamAttachedTotal: 0,
  streamCompletedTotal: 0,
  streamFallbackActivatedTotal: 0,
  streamFallbackAlertedTotal: 0,
  streamFallbackPollTotal: 0,
  streamFallbackPollErrorTotal: 0,
  streamFallbackCompletedTotal: 0,
  replayCountTotal: 0,
  liveBufferedCountTotal: 0,
  liveDroppedBySeqTotal: 0,
  terminalDuplicateDroppedTotal: 0,
  seqRegressionDetectedTotal: 0,
  doneSuccessMissingMessageIdTotal: 0,
  streamTakeoverTotal: 0,
};

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
  /** Firestore TTL field — document is auto-deleted once this timestamp passes. */
  readonly expiresAt?: FirebaseFirestore.Timestamp;
}

interface ResumeMessageShape extends Record<string, unknown> {
  readonly role: string;
  readonly content: unknown;
  readonly tool_call_id?: string;
  readonly tool_calls?: readonly unknown[];
}

function normalizeSelectedActionForPayload(
  selectedAction: AgentXSelectedAction | undefined
): AgentXSelectedAction | undefined {
  if (!selectedAction) {
    return undefined;
  }

  const coordinatorId = String(selectedAction.coordinatorId ?? '').trim();
  const actionId = String(selectedAction.actionId ?? '').trim();
  const surface =
    selectedAction.surface === 'scheduled'
      ? 'scheduled'
      : selectedAction.surface === 'suggested'
        ? 'suggested'
        : 'command';
  const label = typeof selectedAction.label === 'string' ? selectedAction.label.trim() : '';

  return {
    coordinatorId,
    actionId,
    surface,
    ...(label.length > 0 ? { label } : {}),
  };
}

function normalizeYieldMessages(
  messages: readonly Record<string, unknown>[]
): ResumeMessageShape[] {
  const results: ResumeMessageShape[] = [];
  for (const message of messages) {
    const role = typeof message['role'] === 'string' ? message['role'].trim() : '';
    const hasContentKey = Object.prototype.hasOwnProperty.call(message, 'content');
    const content = hasContentKey ? (message['content'] ?? '') : '';
    const toolCalls =
      Array.isArray(message['tool_calls']) && message['tool_calls'].length > 0
        ? (message['tool_calls'] as readonly unknown[])
        : undefined;
    const toolCallId =
      typeof message['tool_call_id'] === 'string' && message['tool_call_id'].trim().length > 0
        ? message['tool_call_id'].trim()
        : undefined;

    if (!role || (!hasContentKey && !toolCalls)) continue;
    results.push({
      ...message,
      role,
      content,
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    });
  }
  return results;
}

async function resolveSelectedActionIntent(params: {
  readonly db: Firestore;
  readonly userId: string;
  readonly fallbackIntent: string;
  readonly selectedAction?: AgentXSelectedAction;
}): Promise<string> {
  if (!params.selectedAction) {
    return params.fallbackIntent;
  }

  if (params.selectedAction.surface === 'suggested') {
    return params.fallbackIntent;
  }

  try {
    const userDoc = await params.db.collection('Users').doc(params.userId).get();
    const userRole = String(userDoc.data()?.['role'] ?? 'athlete');
    const appConfig = await getAgentAppConfig(params.db);
    const configuredAction = resolveConfiguredCoordinatorActionForRole(
      userRole,
      params.selectedAction.coordinatorId,
      params.selectedAction.actionId,
      params.selectedAction.surface,
      params.selectedAction.label,
      appConfig
    );

    return configuredAction?.executionPrompt ?? params.fallbackIntent;
  } catch (error) {
    logger.warn('Failed to resolve selected quick action intent; falling back to visible prompt', {
      userId: params.userId,
      coordinatorId: params.selectedAction.coordinatorId,
      actionId: params.selectedAction.actionId,
      surface: params.selectedAction.surface,
      error: error instanceof Error ? error.message : String(error),
    });
    return params.fallbackIntent;
  }
}

function stampAgentXLastActiveAt(db: Firestore, userId: string): void {
  void db
    .collection('Users')
    .doc(userId)
    .set(
      {
        agentXLastActiveAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    .catch((error: unknown) => {
      logger.warn('Failed to stamp agentXLastActiveAt', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

function stripToolResultForCallId(
  messages: readonly ResumeMessageShape[],
  toolCallId: string
): ResumeMessageShape[] {
  const targetId = toolCallId.trim();
  if (!targetId) return [...messages];

  const sanitized: ResumeMessageShape[] = [];

  for (const message of messages) {
    const role = typeof message.role === 'string' ? message.role : '';
    const msgToolCallId =
      typeof message.tool_call_id === 'string' ? message.tool_call_id.trim() : undefined;

    // Drop role=tool result messages that already match this tool call.
    if (role === 'tool' && msgToolCallId === targetId) {
      continue;
    }

    if (Array.isArray(message.content)) {
      const filteredContent = message.content.filter((block) => {
        if (!block || typeof block !== 'object') return true;
        const record = block as Record<string, unknown>;
        const type = typeof record['type'] === 'string' ? record['type'] : '';
        if (type !== 'tool_result') return true;

        const useId =
          typeof record['tool_use_id'] === 'string'
            ? record['tool_use_id'].trim()
            : typeof record['tool_call_id'] === 'string'
              ? record['tool_call_id'].trim()
              : '';

        return useId !== targetId;
      });

      sanitized.push({
        ...message,
        content: filteredContent,
      });
      continue;
    }

    sanitized.push(message);
  }

  return sanitized;
}

function resolveResumeToolCallId(
  messages: readonly ResumeMessageShape[],
  fallbackToolCallId: string | undefined
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const directToolCallId =
      typeof message.tool_call_id === 'string' ? message.tool_call_id.trim() : '';

    if (directToolCallId) {
      return directToolCallId;
    }

    if (!Array.isArray(message.tool_calls)) {
      continue;
    }

    for (let toolIndex = message.tool_calls.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolCall = message.tool_calls[toolIndex];
      if (!toolCall || typeof toolCall !== 'object') {
        continue;
      }

      const resolvedToolCallId =
        typeof (toolCall as Record<string, unknown>)['id'] === 'string'
          ? String((toolCall as Record<string, unknown>)['id']).trim()
          : '';

      if (resolvedToolCallId) {
        return resolvedToolCallId;
      }
    }
  }

  const trimmedFallback = typeof fallbackToolCallId === 'string' ? fallbackToolCallId.trim() : '';
  return trimmedFallback || 'ask_user_response';
}

function isPauseResumeToolCallId(toolCallId: string | undefined): boolean {
  return typeof toolCallId === 'string' && toolCallId.trim().startsWith('pause_resume_');
}

function stripPauseResumeToolResults(
  messages: readonly ResumeMessageShape[]
): ResumeMessageShape[] {
  const sanitized: ResumeMessageShape[] = [];

  for (const message of messages) {
    const role = typeof message.role === 'string' ? message.role : '';
    const msgToolCallId =
      typeof message.tool_call_id === 'string' ? message.tool_call_id.trim() : undefined;

    // Pause yield uses a synthetic resume tool call marker with no preceding model tool_use.
    // Remove these before replaying history to LLM providers that strictly validate tool_result pairing.
    if (role === 'tool' && isPauseResumeToolCallId(msgToolCallId)) {
      continue;
    }

    if (Array.isArray(message.content)) {
      const filteredContent = message.content.filter((block) => {
        if (!block || typeof block !== 'object') return true;
        const record = block as Record<string, unknown>;
        const type = typeof record['type'] === 'string' ? record['type'] : '';
        if (type !== 'tool_result') return true;

        const useId =
          typeof record['tool_use_id'] === 'string'
            ? record['tool_use_id'].trim()
            : typeof record['tool_call_id'] === 'string'
              ? record['tool_call_id'].trim()
              : '';

        return !isPauseResumeToolCallId(useId);
      });

      sanitized.push({
        ...message,
        content: filteredContent,
      });
      continue;
    }

    sanitized.push(message);
  }

  return sanitized;
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

/** Build a Firestore Timestamp N days from now for outbox TTL writes. */
function outboxTtlFromNow(days: number): FirebaseFirestore.Timestamp {
  return Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
}

function writeSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.socket?.setNoDelay(true);
}

function buildBillingGateState(
  code: 'WALLET_EMPTY' | 'NO_PAYMENT_METHOD' | 'BUDGET_EXCEEDED',
  description: string
): {
  title: string;
  content: string;
  payload: {
    reason: 'payment_method_required' | 'limit_reached' | 'insufficient_funds';
    description: string;
  };
} {
  if (code === 'NO_PAYMENT_METHOD') {
    return {
      title: 'Add a Payment Method',
      content: `${description} Add a payment method to continue this request.`,
      payload: {
        reason: 'payment_method_required',
        description,
      },
    };
  }

  if (code === 'BUDGET_EXCEEDED') {
    return {
      title: 'Budget Limit Reached',
      content: `${description} Update your billing limits to continue this request.`,
      payload: {
        reason: 'limit_reached',
        description,
      },
    };
  }

  return {
    title: 'Add Funds to Continue',
    content: `${description} Add funds to continue this request.`,
    payload: {
      reason: 'insufficient_funds',
      description,
    },
  };
}

function streamBillingGateToSse(params: {
  res: Response;
  threadId?: string;
  billingState: {
    title: string;
    content: string;
    payload: {
      reason: 'payment_method_required' | 'limit_reached' | 'insufficient_funds';
      description: string;
    };
  };
  messageId?: string;
}): void {
  const { res, threadId, billingState, messageId } = params;
  writeSseHeaders(res);

  let seq = 0;
  const buildEnvelope = (): {
    schemaVersion: number;
    eventId: string;
    seq: number;
    emittedAt: string;
  } => ({
    schemaVersion: AGENT_STREAM_EVENT_SCHEMA_VERSION,
    eventId: crypto.randomUUID(),
    seq: ++seq,
    emittedAt: new Date().toISOString(),
  });

  if (threadId) {
    res.write(
      `event: thread\ndata: ${JSON.stringify({
        ...buildEnvelope(),
        threadId,
      })}\n\n`
    );
    forceProxyFlush(res);
  }

  res.write(
    `event: delta\ndata: ${JSON.stringify({
      ...buildEnvelope(),
      content: billingState.content,
    })}\n\n`
  );
  forceProxyFlush(res);

  res.write(
    `event: card\ndata: ${JSON.stringify({
      ...buildEnvelope(),
      agentId: 'router',
      type: 'billing-action',
      title: billingState.title,
      payload: billingState.payload,
    })}\n\n`
  );
  forceProxyFlush(res);

  res.write(
    `event: done\ndata: ${JSON.stringify({
      ...buildEnvelope(),
      ...(threadId ? { threadId } : {}),
      ...(messageId ? { messageId } : {}),
      status: 'complete',
    })}\n\n`
  );
  forceProxyFlush(res);
  res.end();
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
      expiresAt: outboxTtlFromNow(OUTBOX_TTL_PENDING_DAYS),
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
        expiresAt: outboxTtlFromNow(OUTBOX_TTL_ENQUEUED_DAYS),
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
        expiresAt: outboxTtlFromNow(OUTBOX_TTL_ERROR_DAYS),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw err;
  }
}

/**
 * Phase 0.6 — Per-thread concurrency policy.
 *
 * When a user sends a new message on a thread that still has an in-flight
 * operation (running, awaiting approval, awaiting input, paused, queued),
 * we must decide whether to supersede the prior op or attach the new one
 * as a child. Without this guard, two parallel agents can race on the same
 * thread, double-charge tokens, and emit interleaved SSE streams.
 *
 * Policy:
 *   • If a prior op is in a *yielded* state (awaiting_approval / awaiting_input /
 *     paused) and `concurrency.threadSupersedeOnYield=true` → cancel it.
 *   • If a prior op is *actively running* (queued / thinking / acting /
 *     streaming_result) → do not cancel it. Queue the new op behind the
 *     latest active op by returning its operationId as `parentOperationId`.
 *
 * This matches the Primary Agent rollout plan: new user input supersedes stale
 * yielded work, but preserves in-flight execution order for running work.
 */
async function enforceThreadConcurrencyPolicy(
  db: Firestore,
  threadId: string,
  newOperationId: string
): Promise<{
  cancelledOperationIds: string[];
  parentOperationId?: string;
}> {
  if (!threadId || !jobRepository || !queueService) {
    return { cancelledOperationIds: [] };
  }

  const cfg = getCachedAgentAppConfig();
  const supersedeOnYield = cfg.concurrency.threadSupersedeOnYield;

  let active: Awaited<ReturnType<typeof jobRepository.findActiveByThread>>;
  try {
    active = await jobRepository.withDb(db).findActiveByThread(threadId);
  } catch (err) {
    logger.warn('Concurrency-policy: failed to query active ops for thread', {
      threadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { cancelledOperationIds: [] };
  }

  if (active.length === 0) return { cancelledOperationIds: [] };

  const cancelled: string[] = [];
  const yieldedStatuses = new Set(['paused', 'awaiting_input', 'awaiting_approval']);
  const runningStatuses = new Set(['queued', 'thinking', 'acting', 'streaming_result']);

  for (const op of active) {
    if (!op.operationId || op.operationId === newOperationId) continue;
    if (!yieldedStatuses.has(op.status)) continue;
    if (!supersedeOnYield) continue;

    try {
      // Cancel BullMQ side first so the worker aborts mid-flight or the queued
      // yielded continuation is removed before we mark Firestore terminal.
      await queueService.cancel(op.operationId).catch((err) => {
        logger.warn('Concurrency-policy: queue cancel failed (non-fatal)', {
          operationId: op.operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      // Then mark Firestore as cancelled so resume guards see the new state.
      await jobRepository.withDb(db).markCancelled(op.operationId);
      cancelled.push(op.operationId);

      if (op.threadId && chatService) {
        try {
          await chatService.clearThreadPausedYieldState(op.threadId);
        } catch (err) {
          logger.warn('Concurrency-policy: failed to clear paused yield state', {
            threadId: op.threadId,
            operationId: op.operationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Notify any active SSE client subscribed to the cancelled op.
      void pubsubService
        ?.publish(op.operationId, 'cancelled', {
          operationId: op.operationId,
          threadId,
          reason: 'superseded',
          supersededBy: newOperationId,
          timestamp: new Date().toISOString(),
        })
        .catch(() => undefined);

      logger.info('Concurrency-policy: superseded prior thread operation', {
        threadId,
        cancelledOperationId: op.operationId,
        priorStatus: op.status,
        newOperationId,
      });
    } catch (err) {
      logger.error('Concurrency-policy: failed to supersede prior op', {
        threadId,
        operationId: op.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const blockingOperation = active
    .filter(
      (op) =>
        op.operationId &&
        op.operationId !== newOperationId &&
        ((runningStatuses.has(op.status) && !cancelled.includes(op.operationId)) ||
          (!supersedeOnYield && yieldedStatuses.has(op.status)))
    )
    .at(-1);

  return {
    cancelledOperationIds: cancelled,
    ...(blockingOperation?.operationId ? { parentOperationId: blockingOperation.operationId } : {}),
  };
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
          expiresAt: outboxTtlFromNow(OUTBOX_TTL_ERROR_DAYS),
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
          expiresAt: outboxTtlFromNow(OUTBOX_TTL_ENQUEUED_DAYS),
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
          expiresAt: outboxTtlFromNow(OUTBOX_TTL_ERROR_DAYS),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
}

function emitReplayEvent(res: Response, rawEvt: unknown): void {
  const evt = (rawEvt ?? {}) as Record<string, unknown>;
  const withEnvelope = (payload: Record<string, unknown>): Record<string, unknown> => ({
    schemaVersion: AGENT_STREAM_EVENT_SCHEMA_VERSION,
    eventId:
      typeof evt['eventId'] === 'string' && evt['eventId'].length > 0
        ? evt['eventId']
        : crypto.randomUUID(),
    emittedAt:
      typeof evt['emittedAt'] === 'string' && evt['emittedAt'].length > 0
        ? evt['emittedAt']
        : new Date().toISOString(),
    ...(typeof evt['seq'] === 'number' ? { seq: evt['seq'] } : {}),
    ...payload,
  });
  const emitToolResultSupplementalFrames = (): void => {
    const toolResult = evt['toolResult'];
    if (!toolResult || typeof toolResult !== 'object') return;

    const record = toolResult as Record<string, unknown>;
    if (record['autoOpenPanel'] && typeof record['autoOpenPanel'] === 'object') {
      res.write(
        `event: panel\ndata: ${JSON.stringify(
          withEnvelope(record['autoOpenPanel'] as Record<string, unknown>)
        )}\n\n`
      );
    }
  };

  const buildStepEnvelope = (
    status: 'active' | 'success' | 'error'
  ): Record<string, unknown> | null => {
    const stepId = typeof evt['stepId'] === 'string' ? evt['stepId'].trim() : '';
    const label = typeof evt['message'] === 'string' ? evt['message'].trim() : '';
    if (!stepId || !label) return null;

    return {
      ...withEnvelope({}),
      ...(typeof evt['messageKey'] === 'string' ? { messageKey: evt['messageKey'] } : {}),
      id: stepId,
      label,
      ...(typeof evt['agentId'] === 'string' ? { agentId: evt['agentId'] } : {}),
      ...(typeof evt['stageType'] === 'string' ? { stageType: evt['stageType'] } : {}),
      ...(typeof evt['stage'] === 'string' ? { stage: evt['stage'] } : {}),
      ...(typeof evt['outcomeCode'] === 'string' ? { outcomeCode: evt['outcomeCode'] } : {}),
      ...(evt['metadata'] && typeof evt['metadata'] === 'object'
        ? { metadata: evt['metadata'] }
        : {}),
      ...(typeof evt['icon'] === 'string' ? { icon: evt['icon'] } : {}),
      status,
    };
  };

  switch (evt['type']) {
    case 'delta':
      if (typeof evt['text'] === 'string') {
        res.write(
          `event: delta\ndata: ${JSON.stringify(withEnvelope({ content: evt['text'] }))}\n\n`
        );
      }
      break;
    case 'step_active':
    case 'step_done':
    case 'step_error': {
      const type = String(evt['type']);
      const status = type === 'step_active' ? 'active' : type === 'step_done' ? 'success' : 'error';
      const payload = buildStepEnvelope(status);
      if (!payload) break;
      res.write(`event: step\ndata: ${JSON.stringify(payload)}\n\n`);
      break;
    }
    case 'tool_result': {
      const payload = buildStepEnvelope(evt['toolSuccess'] === false ? 'error' : 'success');
      if (!payload) break;
      res.write(`event: step\ndata: ${JSON.stringify(payload)}\n\n`);
      emitToolResultSupplementalFrames();
      break;
    }
    case 'tool_call':
      break;
    case 'card':
      if (evt['cardData'] && typeof evt['cardData'] === 'object') {
        res.write(
          `event: card\ndata: ${JSON.stringify(
            withEnvelope(evt['cardData'] as Record<string, unknown>)
          )}\n\n`
        );
      }
      break;
    case 'title_updated':
      res.write(
        `event: title_updated\ndata: ${JSON.stringify({
          ...withEnvelope({}),
          operationId: evt['operationId'],
          threadId: evt['threadId'],
          title: evt['title'],
          timestamp:
            typeof evt['timestamp'] === 'string' ? evt['timestamp'] : new Date().toISOString(),
        })}\n\n`
      );
      break;
    case 'operation':
      res.write(
        `event: operation\ndata: ${JSON.stringify({
          ...withEnvelope({}),
          operationId: evt['operationId'],
          threadId: evt['threadId'],
          status: evt['status'],
          agentId: evt['agentId'],
          stageType: evt['stageType'],
          stage: evt['stage'],
          outcomeCode: evt['outcomeCode'],
          metadata: evt['metadata'],
          message: evt['message'],
          yieldState: evt['yieldState'],
          timestamp:
            typeof evt['timestamp'] === 'string' ? evt['timestamp'] : new Date().toISOString(),
        })}\n\n`
      );
      break;
    case 'progress_stage':
    case 'progress_subphase':
    case 'metric':
      res.write(
        `event: progress\ndata: ${JSON.stringify({
          ...withEnvelope({}),
          operationId: evt['operationId'],
          threadId: evt['threadId'],
          type: evt['type'],
          agentId: evt['agentId'],
          stageType: evt['stageType'],
          stage: evt['stage'],
          outcomeCode: evt['outcomeCode'],
          metadata: evt['metadata'],
          message: evt['message'],
          timestamp:
            typeof evt['timestamp'] === 'string' ? evt['timestamp'] : new Date().toISOString(),
        })}\n\n`
      );
      break;
    case 'done':
      res.write(`event: done\ndata: ${JSON.stringify(withEnvelope(evt))}\n\n`);
      break;
    default:
      break;
  }
}

function extractEventSeq(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  return typeof record['seq'] === 'number' ? record['seq'] : null;
}

function mapJobStatusToLifecycleStatus(
  status: unknown,
  yieldState?: AgentYieldState
): AgentXOperationLifecycleStatus | null {
  if (typeof status !== 'string') return null;
  switch (status) {
    case 'pending':
    case 'queued':
      return 'queued';
    case 'processing':
    case 'thinking':
    case 'acting':
      return 'running';
    case 'paused':
      return 'paused';
    case 'awaiting_input':
      return isPauseYieldState(yieldState) ? 'paused' : 'awaiting_input';
    case 'awaiting_approval':
      return 'awaiting_approval';
    case 'completed':
      return 'complete';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

function isPauseYieldState(yieldState: AgentYieldState | undefined): boolean {
  return yieldState?.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME;
}

async function resolveCompletedOperationMessageId(
  operationId: string,
  threadId?: string
): Promise<string | undefined> {
  const resolver = chatService as {
    getLatestAssistantMessageForOperation?: (
      operationId: string
    ) => Promise<{ id?: string | null } | null>;
  } | null;

  if (!resolver || typeof resolver.getLatestAssistantMessageForOperation !== 'function') {
    return undefined;
  }

  try {
    const message = await resolver.getLatestAssistantMessageForOperation(operationId);
    return typeof message?.id === 'string' && message.id.length > 0 ? message.id : undefined;
  } catch (err) {
    logger.warn('Failed to resolve completed operation message ID for synthetic done event', {
      operationId,
      threadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function buildPauseYieldState(params: {
  existingYieldState?: AgentYieldState;
  operationId: string;
  fallbackAgentId: string;
}): AgentYieldState {
  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + PAUSE_YIELD_TTL_MS).toISOString();
  const existing = params.existingYieldState;

  return {
    reason: 'needs_input',
    promptToUser: 'Operation paused. Resume whenever you are ready.',
    agentId: (existing?.agentId ?? params.fallbackAgentId) as AgentYieldState['agentId'],
    messages: existing?.messages ?? [],
    ...(existing?.planContext ? { planContext: existing.planContext } : {}),
    pendingToolCall: {
      toolName: PAUSE_RESUME_TOOL_NAME,
      toolInput: {
        operationId: params.operationId,
        pauseRequestedAt: nowIso,
      },
      toolCallId: existing?.pendingToolCall?.toolCallId ?? `pause_resume_${params.operationId}`,
    },
    yieldedAt: nowIso,
    expiresAt: expiresAtIso,
  };
}

async function streamOperationToSse(params: {
  req: Request;
  res: Response;
  db: Firestore;
  operationId: string;
  userId: string;
  afterSeq?: number;
  initialThreadId?: string;
  initialOperationStatus?: AgentXOperationLifecycleStatus;
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

  const streamId = `${operationId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const existingOperationStream = activeOperationStreams.get(operationId);
  if (existingOperationStream && existingOperationStream.userId === userId) {
    existingOperationStream.terminate('replaced', streamId);
    streamObservability.streamTakeoverTotal += 1;
  }

  const userStreams = activeUserStreams.get(userId) ?? new Set<string>();
  if (userStreams.size >= MAX_CONCURRENT_STREAMS_PER_USER) {
    res.status(429).json({
      success: false,
      error: `Too many active streams. Limit is ${MAX_CONCURRENT_STREAMS_PER_USER} per user.`,
      code: 'AGENT_STREAM_LIMIT_REACHED',
    });
    return;
  }
  userStreams.add(streamId);
  activeUserStreams.set(userId, userStreams);
  streamObservability.streamAttachedTotal += 1;

  const releaseStreamSlot = () => {
    const streams = activeUserStreams.get(userId);
    if (!streams) return;
    streams.delete(streamId);
    if (streams.size === 0) activeUserStreams.delete(userId);
  };

  writeSseHeaders(res);

  repo
    .patchContext(operationId, {
      viewerAttachedAt: new Date().toISOString(),
      viewerLastSeenAt: new Date().toISOString(),
    })
    .catch(() => undefined);

  let sseSeq = afterSeq;
  const buildStreamEnvelope = (preferredSeq?: number) => {
    if (typeof preferredSeq === 'number' && preferredSeq > sseSeq) {
      sseSeq = preferredSeq;
    } else {
      sseSeq += 1;
    }

    return {
      schemaVersion: AGENT_STREAM_EVENT_SCHEMA_VERSION,
      eventId: crypto.randomUUID(),
      seq: sseSeq,
      emittedAt: new Date().toISOString(),
    };
  };

  if (initialThreadId) {
    res.write(
      `event: thread\ndata: ${JSON.stringify({
        ...buildStreamEnvelope(),
        threadId: initialThreadId,
        operationId,
      })}\n\n`
    );
    forceProxyFlush(res);
  }

  const replayInitialLifecycleStatus =
    initialOperationStatus ??
    mapJobStatusToLifecycleStatus(job.status, job.yieldState as AgentYieldState | undefined) ??
    undefined;

  if (replayInitialLifecycleStatus && initialThreadId) {
    res.write(
      `event: operation\ndata: ${JSON.stringify({
        ...buildStreamEnvelope(),
        threadId: initialThreadId,
        operationId,
        status: replayInitialLifecycleStatus,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
    forceProxyFlush(res);
  }

  let closed = false;
  const closeCallbacks: Array<() => void> = [];
  const closeStream = () => {
    if (closed) return;
    closed = true;
    clearTimeout(idleTimeoutHandle);
    for (const cb of closeCallbacks) cb();
    const activeLease = activeOperationStreams.get(operationId);
    if (activeLease && activeLease.streamId === streamId) {
      activeOperationStreams.delete(operationId);
    }
    releaseStreamSlot();
  };

  const terminateStream = (reason: 'replaced', replacedByStreamId: string) => {
    if (closed) return;
    try {
      res.write(
        `event: stream_replaced\ndata: ${JSON.stringify({
          ...buildStreamEnvelope(),
          operationId,
          replacedByStreamId,
          reason,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
      forceProxyFlush(res);
    } catch {
      // Ignore write failures while terminating stale streams.
    }
    closeStream();
    try {
      res.end();
    } catch {
      // Client may already be disconnected.
    }
  };

  activeOperationStreams.set(operationId, {
    userId,
    streamId,
    terminate: terminateStream,
  });

  // Safety timeout: if stream hasn't sent data in 10 minutes, auto-cleanup (zombie prevention)
  const idleTimeoutHandle = setTimeout(() => {
    if (!closed) {
      logger.warn('Stream idle timeout — auto-closing zombie stream', {
        operationId,
        userId,
      });
      closeStream();
      res.end();
    }
  }, STREAM_IDLE_TIMEOUT_MS);

  req.on('close', () => {
    closeStream();
    repo.markDetached(operationId).catch(() => undefined);
  });

  const heartbeat = setInterval(() => {
    if (closed) return;
    try {
      res.write('event: ping\ndata: {}\n\n');
      repo
        .patchContext(operationId, {
          viewerLastSeenAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    } catch {
      closeStream();
    }
  }, 15_000);
  closeCallbacks.push(() => clearInterval(heartbeat));

  const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
  let lastSeq = afterSeq;
  let streamTerminalSeen = false;
  let replayComplete = false;
  const liveBuffer: Array<{ event: string; data: unknown }> = [];

  const processLiveEvent = (msg: { event: string; data: unknown }): void => {
    if (closed) return;

    const seq = extractEventSeq(msg.data);
    if (seq !== null && seq <= lastSeq) {
      streamObservability.liveDroppedBySeqTotal += 1;
      if (seq < lastSeq) {
        streamObservability.seqRegressionDetectedTotal += 1;
      }
      return;
    }
    if (seq !== null) {
      lastSeq = seq;
    }

    const isTerminal = STREAM_TERMINAL_EVENTS.has(msg.event);
    if (isTerminal && streamTerminalSeen) {
      streamObservability.terminalDuplicateDroppedTotal += 1;
      return;
    }

    try {
      const payload =
        msg.data && typeof msg.data === 'object'
          ? ({ ...(msg.data as Record<string, unknown>) } as Record<string, unknown>)
          : { value: msg.data };
      const normalizedPayload = {
        ...buildStreamEnvelope(seq ?? undefined),
        ...payload,
      };

      res.write(`event: ${msg.event}\ndata: ${JSON.stringify(normalizedPayload)}\n\n`);
      if (isTerminal) {
        streamTerminalSeen = true;
        streamObservability.streamCompletedTotal += 1;
        closeStream();
        res.end();
      }
    } catch {
      closeStream();
    }
  };

  const pubsubHealthy =
    !!pubsubService &&
    (typeof pubsubService.isHealthy !== 'function' || (await pubsubService.isHealthy()));

  let hasLivePubsub = false;
  if (pubsubHealthy && pubsubService) {
    try {
      const unsubscribe = await pubsubService.subscribe(operationId, (msg) => {
        if (closed) return;
        if (!replayComplete) {
          if (liveBuffer.length >= LIVE_BUFFER_MAX_EVENTS) {
            liveBuffer.shift();
          }
          liveBuffer.push({ event: msg.event, data: msg.data });
          streamObservability.liveBufferedCountTotal += 1;
          return;
        }
        processLiveEvent({ event: msg.event, data: msg.data });
      });

      closeCallbacks.push(() => {
        void unsubscribe();
      });
      hasLivePubsub = true;
    } catch (err) {
      logger.warn('PubSub subscribe failed; falling back to Firestore tailing', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const events = await repo.getJobEvents(operationId);
  for (const evt of events) {
    const seq = typeof evt.seq === 'number' ? evt.seq : -1;
    if (seq <= afterSeq) continue;
    emitReplayEvent(res, evt);
    streamObservability.replayCountTotal += 1;
    if (seq > lastSeq) lastSeq = seq;
    if (STREAM_TERMINAL_EVENTS.has(String(evt.type ?? ''))) {
      streamTerminalSeen = true;
      streamObservability.streamCompletedTotal += 1;
      break;
    }
  }
  replayComplete = true;

  if (!streamTerminalSeen && liveBuffer.length > 0) {
    const buffered = [...liveBuffer];
    liveBuffer.length = 0;
    buffered.sort((a, b) => {
      const aSeq = extractEventSeq(a.data);
      const bSeq = extractEventSeq(b.data);
      if (aSeq === null || bSeq === null) return 0;
      return aSeq - bSeq;
    });
    for (const msg of buffered) {
      processLiveEvent(msg);
      if (streamTerminalSeen || closed) break;
    }
  }

  if (streamTerminalSeen) {
    closeStream();
    res.end();
    return;
  }

  if (terminalStatuses.has(job.status)) {
    const terminalLifecycleStatus = mapJobStatusToLifecycleStatus(job.status);
    const terminalSuccess = job.status === 'completed';
    const terminalMessageId = terminalSuccess
      ? await resolveCompletedOperationMessageId(operationId, job.threadId ?? undefined)
      : undefined;
    if (terminalSuccess && !terminalMessageId) {
      streamObservability.doneSuccessMissingMessageIdTotal += 1;
      logger.warn('Synthetic terminal completed event missing canonical DB message ID', {
        operationId,
        threadId: job.threadId ?? undefined,
      });
    }
    res.write(
      `event: done\ndata: ${JSON.stringify({
        ...buildStreamEnvelope(),
        operationId,
        threadId: job.threadId ?? undefined,
        status: terminalLifecycleStatus ?? job.status,
        success: terminalSuccess,
        ...(terminalMessageId ? { messageId: terminalMessageId } : {}),
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
    closeStream();
    res.end();
    return;
  }

  if (hasLivePubsub) return;

  // Fallback transport: Firestore tail polling when Redis PubSub is unavailable.
  const fallbackStartedAt = Date.now();
  let pollDelayMs = POLL_BACKOFF_INITIAL_MS;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackAlerted = false;
  let fallbackPollCount = 0;
  let fallbackReadSuccessCount = 0;
  let fallbackReadErrorCount = 0;
  let fallbackMaxDelayMs = pollDelayMs;

  logger.warn('SSE entered Firestore fallback polling mode', {
    operationId,
    userId,
    initialDelayMs: pollDelayMs,
  });
  streamObservability.streamFallbackActivatedTotal += 1;

  const scheduleNextPoll = (delayMs: number) => {
    if (closed) return;
    pollTimer = setTimeout(() => {
      void runFallbackPoll();
    }, delayMs);
  };

  const runFallbackPoll = async (): Promise<void> => {
    if (closed) return;
    fallbackPollCount += 1;
    streamObservability.streamFallbackPollTotal += 1;
    try {
      const latestEvents = await repo.getJobEvents(operationId);
      fallbackReadSuccessCount += 1;
      let tailSawTerminal = false;

      for (const evt of latestEvents) {
        const seq = typeof evt['seq'] === 'number' ? (evt['seq'] as number) : -1;
        if (seq <= lastSeq) {
          if (seq >= 0 && seq < lastSeq) {
            streamObservability.seqRegressionDetectedTotal += 1;
          }
          continue;
        }
        emitReplayEvent(res, evt);
        lastSeq = Math.max(lastSeq, seq);

        if (STREAM_TERMINAL_EVENTS.has(String(evt['type'] ?? ''))) {
          tailSawTerminal = true;
          break;
        }
      }

      if (tailSawTerminal) {
        logger.info('SSE fallback stream completed from persisted terminal event', {
          operationId,
          userId,
          fallbackDurationMs: Date.now() - fallbackStartedAt,
          fallbackPollCount,
          fallbackReadSuccessCount,
          fallbackReadErrorCount,
          fallbackMaxDelayMs,
        });
        closeStream();
        res.end();
        streamObservability.streamCompletedTotal += 1;
        streamObservability.streamFallbackCompletedTotal += 1;
        return;
      }

      const latestJob = await repo.getById(operationId);
      if (!latestJob || terminalStatuses.has(latestJob.status)) {
        const terminalSuccess = latestJob?.status === 'completed' || !latestJob;
        const terminalMessageId =
          latestJob?.status === 'completed'
            ? await resolveCompletedOperationMessageId(operationId, latestJob.threadId ?? undefined)
            : undefined;
        if (latestJob?.status === 'completed' && !terminalMessageId) {
          streamObservability.doneSuccessMissingMessageIdTotal += 1;
          logger.warn('Fallback terminal completed event missing canonical DB message ID', {
            operationId,
            threadId: latestJob.threadId ?? undefined,
          });
        }
        res.write(
          `event: done\ndata: ${JSON.stringify({
            ...buildStreamEnvelope(),
            operationId,
            threadId: latestJob?.threadId ?? undefined,
            status: latestJob?.status ?? 'completed',
            success: terminalSuccess,
            ...(terminalMessageId ? { messageId: terminalMessageId } : {}),
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
        closeStream();
        res.end();
        streamObservability.streamCompletedTotal += 1;
        streamObservability.streamFallbackCompletedTotal += 1;
        logger.info('SSE fallback stream completed from terminal job status', {
          operationId,
          userId,
          fallbackDurationMs: Date.now() - fallbackStartedAt,
          fallbackPollCount,
          fallbackReadSuccessCount,
          fallbackReadErrorCount,
          fallbackMaxDelayMs,
        });
        return;
      }

      // Successful polling read resets backoff to keep fallback responsive.
      pollDelayMs = POLL_BACKOFF_INITIAL_MS;
    } catch (err) {
      fallbackReadErrorCount += 1;
      streamObservability.streamFallbackPollErrorTotal += 1;
      logger.warn('Firestore tail polling failed', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
        nextDelayMs: Math.min(POLL_BACKOFF_MAX_MS, pollDelayMs * 2),
      });

      pollDelayMs = Math.min(
        POLL_BACKOFF_MAX_MS,
        Math.max(POLL_BACKOFF_INITIAL_MS, pollDelayMs * 2)
      );
      fallbackMaxDelayMs = Math.max(fallbackMaxDelayMs, pollDelayMs);
    }

    if (!fallbackAlerted && Date.now() - fallbackStartedAt >= FALLBACK_ALERT_THRESHOLD_MS) {
      fallbackAlerted = true;
      streamObservability.streamFallbackAlertedTotal += 1;
      logger.warn('SSE fallback polling exceeded alert threshold', {
        operationId,
        userId,
        fallbackDurationMs: Date.now() - fallbackStartedAt,
      });
    }

    scheduleNextPoll(pollDelayMs);
  };

  closeCallbacks.push(() => {
    if (pollTimer) clearTimeout(pollTimer);
  });

  scheduleNextPoll(pollDelayMs);
}

router.get('/stream-observability', appGuard, async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user?.uid) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const activeForUser = activeUserStreams.get(user.uid)?.size ?? 0;
  const activeGlobal = [...activeUserStreams.values()].reduce((count, set) => count + set.size, 0);

  res.json({
    success: true,
    data: {
      timestamp: new Date().toISOString(),
      activeStreams: {
        user: activeForUser,
        global: activeGlobal,
        usersWithActiveStreams: activeUserStreams.size,
      },
      counters: { ...streamObservability },
      rates: {
        fallbackErrorRate:
          streamObservability.streamFallbackPollTotal > 0
            ? Number(
                (
                  streamObservability.streamFallbackPollErrorTotal /
                  streamObservability.streamFallbackPollTotal
                ).toFixed(4)
              )
            : 0,
      },
    },
  });
});

// ─── POST /cancel/:id — Explicit cancellation endpoint ───────────────────

router.post('/pause/:id', appGuard, async (req: Request, res: Response) => {
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

  const repo = jobRepository.withDb(db);
  const persistedJob = await repo.getById(operationId);
  if (!persistedJob || persistedJob.userId !== user.uid) {
    logger.warn('Forbidden pause attempt: operation belongs to another user or missing', {
      operationId,
      requesterUserId: user.uid,
    });
    res.status(404).json({ success: false, error: 'Operation not found' });
    return;
  }

  if (
    persistedJob.status === 'completed' ||
    persistedJob.status === 'failed' ||
    persistedJob.status === 'cancelled'
  ) {
    res.status(409).json({
      success: false,
      error: `Operation is already terminal (${persistedJob.status}) and cannot be paused`,
    });
    return;
  }

  const existingYieldState = persistedJob.yieldState as AgentYieldState | undefined;
  if (isPauseYieldState(existingYieldState)) {
    res.json({
      success: true,
      paused: true,
      queueCancelled: false,
      status: 'paused',
      operationId,
      threadId: persistedJob.threadId ?? null,
    });
    return;
  }

  const fallbackAgentId =
    typeof persistedJob.progress?.agentId === 'string' && persistedJob.progress.agentId.length > 0
      ? persistedJob.progress.agentId
      : 'router';
  const pauseYieldState = buildPauseYieldState({
    existingYieldState,
    operationId,
    fallbackAgentId,
  });

  // CRITICAL: Write 'paused' status to Firestore BEFORE calling abort().
  // The BullMQ worker catches AbortError and immediately reads Firestore to
  // determine whether the abort was a pause or an uncontrolled failure. If we
  // abort first, the worker may read the old 'running' status and treat it as
  // a failure instead of a controlled pause.
  await repo.markPaused(operationId, pauseYieldState);

  const entry = activeAbortControllers.get(operationId);
  if (entry) {
    entry.controller.abort();
    activeAbortControllers.delete(operationId);
  }

  // Cross-instance pause propagation: the worker may be running on a
  // different backend instance than the one handling this HTTP request, so
  // the in-process activeAbortControllers map above will be empty for that
  // operation. Broadcast a control message via Redis pub/sub so the owning
  // worker (wherever it lives) can abort its local AbortController.
  let controlBroadcast = false;
  if (pubsubService) {
    try {
      await pubsubService.publishControl({
        action: 'pause',
        operationId,
        issuedAt: new Date().toISOString(),
        issuedBy: user.uid,
      });
      controlBroadcast = true;
    } catch (err) {
      logger.warn('Failed to broadcast pause control message', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let queueCancelled = false;
  if (queueService) {
    try {
      queueCancelled = await queueService.cancel(operationId);
    } catch (err) {
      // Expected when the worker holds the BullMQ lock on a different
      // instance — the control broadcast above handles the actual abort.
      logger.warn('Queue pause call failed', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
        controlBroadcast,
      });
    }
  }

  const nowIso = new Date().toISOString();
  const threadId = persistedJob.threadId ?? undefined;

  // Persist pausedYieldState on thread so Resume card survives session re-entry
  if (threadId && chatService) {
    try {
      await chatService.updateThreadPausedYieldState(threadId, pauseYieldState);
    } catch (err) {
      logger.warn('Failed to update thread with paused yield state', {
        threadId,
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const operationEvent = {
    userId: user.uid,
    type: 'operation' as const,
    operationId,
    ...(threadId ? { threadId } : {}),
    status: 'paused' as const,
    yieldState: pauseYieldState,
    timestamp: nowIso,
  };

  let operationSeq = -1;
  try {
    const startSeq = await repo.allocateEventSeqRange(operationId, 1);
    operationSeq = startSeq;
    await repo.writeJobEvent(operationId, {
      seq: operationSeq,
      ...operationEvent,
    });
  } catch (err) {
    logger.warn('Failed to persist pause lifecycle event', {
      operationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (pubsubService) {
    void pubsubService
      .publish(operationId, 'operation', {
        ...operationEvent,
        ...(operationSeq >= 0 ? { seq: operationSeq } : {}),
      })
      .catch(() => undefined);
  }

  logger.info('Agent X operation paused via explicit endpoint', {
    operationId,
    userId: user.uid,
    queueCancelled,
    controlBroadcast,
  });

  res.json({
    success: true,
    paused: true,
    queueCancelled,
    controlBroadcast,
    status: 'paused',
    operationId,
    threadId: persistedJob.threadId ?? null,
  });
});

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

  // Cross-instance cancel propagation (mirrors pause). Required when the
  // worker runs on a different backend instance than the one handling the
  // HTTP request — see comment in pause endpoint above.
  let controlBroadcast = false;
  if (pubsubService) {
    try {
      await pubsubService.publishControl({
        action: 'cancel',
        operationId,
        issuedAt: new Date().toISOString(),
        issuedBy: user.uid,
      });
      controlBroadcast = true;
    } catch (err) {
      logger.warn('Failed to broadcast cancel control message', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let queueCancelled = false;
  if (queueService) {
    try {
      queueCancelled = await queueService.cancel(operationId);
    } catch (err) {
      // Expected when worker holds BullMQ lock on a different instance —
      // the control broadcast above handles the actual abort.
      logger.warn('Queue cancellation call failed', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
        controlBroadcast,
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

  const threadId = persistedJob.threadId ?? undefined;

  // Clear paused yield state from thread so stale Resume card doesn't appear
  if (threadId && chatService) {
    try {
      await chatService.clearThreadPausedYieldState(threadId);
    } catch (err) {
      logger.warn('Failed to clear thread paused yield state on cancel', {
        threadId,
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const repo = jobRepository.withDb(db);
  const nowIso = new Date().toISOString();

  const cancellationOperationEvent = {
    userId: user.uid,
    type: 'operation' as const,
    operationId,
    ...(threadId ? { threadId } : {}),
    status: 'cancelled' as const,
    timestamp: nowIso,
  };

  const cancellationDoneEvent = {
    userId: user.uid,
    type: 'done' as const,
    operationId,
    ...(threadId ? { threadId } : {}),
    status: 'cancelled' as const,
    success: false,
    message: 'Operation cancelled by user',
    timestamp: nowIso,
  };
  let cancellationOperationSeq = -1;
  let cancellationDoneSeq = -1;

  try {
    const startSeq = await repo.allocateEventSeqRange(operationId, 2);
    cancellationOperationSeq = startSeq;
    cancellationDoneSeq = startSeq + 1;

    await repo.writeJobEvent(operationId, {
      seq: cancellationOperationSeq,
      ...cancellationOperationEvent,
    });
    await repo.writeJobEvent(operationId, {
      seq: cancellationDoneSeq,
      ...cancellationDoneEvent,
    });
  } catch (err) {
    logger.warn('Failed to persist cancellation stream events', {
      operationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (pubsubService) {
    void pubsubService
      .publish(operationId, 'operation', {
        ...cancellationOperationEvent,
        ...(cancellationOperationSeq >= 0 ? { seq: cancellationOperationSeq } : {}),
      })
      .catch(() => undefined);
    void pubsubService
      .publish(operationId, 'done', {
        ...cancellationDoneEvent,
        ...(cancellationDoneSeq >= 0 ? { seq: cancellationDoneSeq } : {}),
      })
      .catch(() => undefined);
  }

  logger.info('Agent X operation cancelled via explicit endpoint', {
    operationId,
    userId: user.uid,
    queueCancelled,
    controlBroadcast,
  });

  res.json({ success: true, cancelled: true, queueCancelled, controlBroadcast });
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
    if (userResponse !== undefined && typeof userResponse !== 'string') {
      res.status(400).json({ success: false, error: 'Response must be a string when provided' });
      return;
    }

    if (typeof userResponse === 'string' && userResponse.length > 5000) {
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
    if (status !== 'awaiting_input' && status !== 'awaiting_approval' && status !== 'paused') {
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

    const trimmedUserResponse = typeof userResponse === 'string' ? userResponse.trim() : '';
    const resumeFromPausedState = isPauseYieldState(yieldState);
    if (!resumeFromPausedState && trimmedUserResponse.length === 0) {
      res.status(400).json({ success: false, error: 'A non-empty response is required' });
      return;
    }

    if (new Date(yieldState.expiresAt).getTime() < Date.now()) {
      await jobRepository.withDb(db).markFailed(operationId, 'Yield expired before user responded');
      res.status(410).json({ success: false, error: 'This request has expired' });
      return;
    }

    const threadId = jobDoc.threadId;
    if (resumeFromPausedState && threadId && chatService && trimmedUserResponse.length > 0) {
      try {
        await chatService.addMessage({
          threadId,
          userId: user.uid,
          role: 'user',
          content: trimmedUserResponse,
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

    const resumeSourceMessages = normalizeYieldMessages(yieldState.messages);
    const pendingToolCallId = resumeFromPausedState
      ? (yieldState.pendingToolCall?.toolCallId ?? 'ask_user_response')
      : resolveResumeToolCallId(resumeSourceMessages, yieldState.pendingToolCall?.toolCallId);
    const normalizedMessages = stripToolResultForCallId(resumeSourceMessages, pendingToolCallId);

    const sanitizedMessages = resumeFromPausedState
      ? stripPauseResumeToolResults(normalizedMessages)
      : normalizedMessages;

    // When a user pauses before the first LLM turn completes, the stored
    // message history can be empty. Fall back to the original job intent so
    // OpenRouter receives at least one valid message and the resumed agent
    // has enough context to continue rather than asking "what do you want?"
    const effectiveSanitizedMessages: ResumeMessageShape[] =
      sanitizedMessages.length === 0 && jobDoc.intent?.trim()
        ? [{ role: 'user', content: jobDoc.intent.trim() }]
        : sanitizedMessages;

    const resumedMessages = resumeFromPausedState
      ? trimmedUserResponse.length > 0
        ? [
            ...effectiveSanitizedMessages,
            {
              role: 'user',
              content: trimmedUserResponse,
            },
          ]
        : effectiveSanitizedMessages
      : [
          ...effectiveSanitizedMessages,
          {
            role: 'tool',
            content: JSON.stringify({
              success: true,
              data: { userResponse: trimmedUserResponse },
            }),
            tool_call_id: pendingToolCallId,
          },
        ];

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
          messages: resumedMessages,
        } satisfies AgentYieldState,
      },
    };

    await jobRepository.withDb(db).create(resumedPayload);
    await jobRepository.withDb(db).markCompleted(operationId, {
      summary: resumeFromPausedState
        ? `Resumed after pause — continuing as ${resumedPayload.operationId}`
        : `Resumed by user — continuing as ${resumedPayload.operationId}`,
      data: {
        resumedAs: resumedPayload.operationId,
        ...(resumeFromPausedState ? { resumedFromPause: true } : {}),
      },
    });

    // Clear paused yield state from thread so stale Resume card doesn't appear later
    if (threadId && chatService) {
      try {
        await chatService.clearThreadPausedYieldState(threadId);
      } catch (err) {
        logger.warn('Failed to clear thread paused yield state on resume', {
          threadId,
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
        resumed: true,
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

    // Phase 0.6 — If the underlying op was superseded/cancelled (user sent
    // a newer message on the same thread), don't resume a stale approval.
    if (
      jobDoc.status === 'cancelled' ||
      jobDoc.status === 'failed' ||
      jobDoc.status === 'completed'
    ) {
      logger.info('Approval resolved for terminal op — skipping resume', {
        approvalId,
        operationId,
        priorStatus: jobDoc.status,
        decision,
      });
      res.json({
        success: true,
        data: { decision, resumed: false, reason: 'operation_already_terminal' },
      });
      return;
    }

    const threadId = jobDoc.threadId;
    const yieldState = jobDoc.yieldState as AgentYieldState | undefined;

    if (decision === 'rejected') {
      await jobRepository.withDb(db).markCancelled(operationId);
      if (threadId && chatService) {
        try {
          await chatService.clearThreadPausedYieldState(threadId);
        } catch (err) {
          logger.warn('Failed to clear thread paused yield state on approval rejection', {
            threadId,
            operationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
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
    const normalizedApprovalMessages = stripToolResultForCallId(
      normalizeYieldMessages(yieldState.messages),
      yieldState.pendingToolCall.toolCallId
    );

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
              messages: normalizedApprovalMessages,
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

    if (threadId && chatService) {
      try {
        await chatService.clearThreadPausedYieldState(threadId);
      } catch (err) {
        logger.warn('Failed to clear thread paused yield state on approval resolution', {
          threadId,
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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

      const { intent, userContext, threadId, selectedAction } = req.body as AgentEnqueueRequestDto;
      const normalizedSelectedAction = normalizeSelectedActionForPayload(selectedAction);
      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }
      const environment = req.isStaging ? 'staging' : 'production';
      const trimmedIntent = intent.trim();
      const resolvedIntent = await resolveSelectedActionIntent({
        db,
        userId: user.uid,
        fallbackIntent: trimmedIntent,
        selectedAction: normalizedSelectedAction,
      });
      stampAgentXLastActiveAt(db, user.uid);

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
      const concurrencyDecision = resolvedThreadId
        ? await enforceThreadConcurrencyPolicy(db, resolvedThreadId, operationId)
        : { cancelledOperationIds: [] as string[], parentOperationId: undefined };

      const payload: AgentJobPayload = {
        operationId,
        userId: user.uid,
        intent: resolvedIntent,
        displayIntent: trimmedIntent,
        sessionId,
        origin: 'user' as AgentJobOrigin,
        context: {
          ...(userContext ?? {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
          ...(concurrencyDecision.parentOperationId
            ? { parentOperationId: concurrencyDecision.parentOperationId }
            : {}),
          ...(normalizedSelectedAction ? { selectedAction: normalizedSelectedAction } : {}),
        },
      };

      await jobRepository.withDb(db).create(payload);

      // ── Prompt-only title generation (fire-and-forget) ───────────────────
      // New threads only: generate an AI title from the user's message before
      // the worker even starts. Replaces the old approach of blocking title
      // generation at the end of the full agent run (which took seconds).
      if (chatService && llmService && resolvedThreadId && !threadId) {
        const _titleThreadId = resolvedThreadId;
        const _titleOpId = operationId;
        const _titleDb = db;
        void (async () => {
          try {
            const title = await chatService.generateTitleFromPromptOnly(intent.trim(), llmService);
            if (!title) return;
            const applied = await chatService.applyGeneratedThreadTitle(
              _titleThreadId,
              user.uid,
              intent.trim(),
              title
            );
            if (!applied) return;
            logger.info('Prompt-only thread title generated (enqueue)', {
              operationId: _titleOpId,
              threadId: _titleThreadId,
              title,
            });
            void pubsubService?.publish(_titleOpId, 'title_updated', {
              operationId: _titleOpId,
              threadId: _titleThreadId,
              title,
              timestamp: new Date().toISOString(),
            });
            await jobRepository.withDb(_titleDb).writeJobEventWithAutoSeq(_titleOpId, {
              type: 'title_updated' as const,
              userId: user.uid,
              threadId: _titleThreadId,
              title,
              operationId: _titleOpId,
              timestamp: new Date().toISOString(),
            });
          } catch (err) {
            logger.warn('Prompt-only title generation failed (enqueue)', {
              error: err instanceof Error ? err.message : String(err),
              threadId: _titleThreadId,
            });
          }
        })();
      }

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

      const { message, mode, threadId, attachments, resumeOperationId, afterSeq, selectedAction } =
        req.body as AgentChatRequestDto;
      const normalizedSelectedAction = normalizeSelectedActionForPayload(selectedAction);
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
      const fileAttachments: AgentXAttachment[] = allAttachments
        .filter(
          (a: { mimeType: string }) =>
            a.mimeType.startsWith('image/') ||
            a.mimeType === 'application/pdf' ||
            a.mimeType === 'text/csv' ||
            a.mimeType === 'text/plain' ||
            a.mimeType === 'application/vnd.ms-excel' ||
            a.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            a.mimeType === 'application/msword' ||
            a.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        .map((a) => ({
          id: a.id,
          url: a.url,
          ...(a.storagePath ? { storagePath: a.storagePath } : {}),
          name: a.name,
          mimeType: a.mimeType,
          type: a.type as AgentXAttachment['type'],
          sizeBytes: a.sizeBytes,
        }));
      const videoAttachments: AgentXAttachment[] = allAttachments
        .filter((a: { mimeType: string }) => a.mimeType.startsWith('video/'))
        .map((a) => ({
          id: a.id,
          url: a.url,
          name: a.name,
          mimeType: a.mimeType,
          type: a.type as AgentXAttachment['type'],
          sizeBytes: a.sizeBytes,
          ...(a.cloudflareVideoId ? { cloudflareVideoId: a.cloudflareVideoId } : {}),
        }));

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

      if (!effectiveOperationId && threadId && chatService) {
        try {
          effectiveThreadId = await resolveThread(chatService, user.uid, threadId, message);
        } catch (chatErr) {
          logger.warn('Failed to resolve existing chat thread before resume check', {
            error: chatErr instanceof Error ? chatErr.message : String(chatErr),
            userId: user.uid,
            threadId,
          });
        }
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
              ...(fileAttachments.length > 0 || videoAttachments.length > 0
                ? { attachments: [...fileAttachments, ...videoAttachments] }
                : {}),
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
        const billingCode = isWalletUser ? 'WALLET_EMPTY' : 'BUDGET_EXCEEDED';
        const billingReason =
          chatBudgetCheck.reason ?? 'Billing is required to continue this request.';
        const billingState = buildBillingGateState(billingCode, billingReason);
        const acceptsEventStream =
          req.accepts(['text/event-stream', 'json']) === 'text/event-stream';

        if (acceptsEventStream) {
          let persistedBillingMessageId: string | null = null;
          if (chatService && effectiveThreadId) {
            try {
              const persistedBillingMessage = await chatService.addMessage({
                threadId: effectiveThreadId,
                userId: user.uid,
                role: 'assistant',
                content: billingState.content,
                origin: 'agent_chain' as const,
                agentId: 'router',
                parts: [
                  {
                    type: 'card',
                    card: {
                      type: 'billing-action',
                      agentId: 'router',
                      title: billingState.title,
                      payload: billingState.payload,
                    },
                  },
                ],
              });

              persistedBillingMessageId =
                typeof persistedBillingMessage.id === 'string' ? persistedBillingMessage.id : null;
            } catch (chatErr) {
              logger.warn('Failed to persist billing gate assistant message to MongoDB', {
                error: chatErr instanceof Error ? chatErr.message : String(chatErr),
                userId: user.uid,
                threadId: effectiveThreadId,
              });
            }
          }

          streamBillingGateToSse({
            res,
            threadId: effectiveThreadId ?? undefined,
            billingState,
            ...(persistedBillingMessageId ? { messageId: persistedBillingMessageId } : {}),
          });
          return;
        }

        res.status(402).json({
          success: false,
          error: billingReason,
          code: billingCode,
        });
        return;
      }

      const operationId = `chat-${crypto.randomUUID()}`;
      const trimmedMessage = message.trim();
      const resolvedIntent = await resolveSelectedActionIntent({
        db,
        userId: user.uid,
        fallbackIntent: trimmedMessage,
        selectedAction: normalizedSelectedAction,
      });
      stampAgentXLastActiveAt(db, user.uid);
      const concurrencyDecision = effectiveThreadId
        ? await enforceThreadConcurrencyPolicy(db, effectiveThreadId, operationId)
        : { cancelledOperationIds: [] as string[], parentOperationId: undefined };

      const payload: AgentJobPayload = {
        operationId,
        userId: user.uid,
        intent: resolvedIntent,
        displayIntent: trimmedMessage,
        sessionId: crypto.randomUUID(),
        origin: 'user' as AgentJobOrigin,
        context: {
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(effectiveThreadId ? { threadId: effectiveThreadId } : {}),
          ...(mode ? { mode } : {}),
          ...(concurrencyDecision.parentOperationId
            ? { parentOperationId: concurrencyDecision.parentOperationId }
            : {}),
          ...(fileAttachments.length > 0 ? { attachments: fileAttachments } : {}),
          ...(videoAttachments.length > 0 ? { videoAttachments } : {}),
          ...(normalizedSelectedAction ? { selectedAction: normalizedSelectedAction } : {}),
        },
      };

      await jobRepository.withDb(db).create(payload);
      await enqueueWithOutbox(db, payload, environment);

      // ── Prompt-only title generation (fire-and-forget) ───────────────────
      // New threads only: generate an AI title from the raw user message.
      // Publishes title_updated via pubsub so the open SSE stream receives it
      // within ~300-600ms of stream open — before the first agent delta arrives.
      if (chatService && llmService && effectiveThreadId && !threadId) {
        const _titleThreadId = effectiveThreadId;
        const _titleOpId = operationId;
        const _rawPrompt = message.trim();
        const _titleDb = db;
        void (async () => {
          try {
            const title = await chatService.generateTitleFromPromptOnly(_rawPrompt, llmService);
            if (!title) return;
            const applied = await chatService.applyGeneratedThreadTitle(
              _titleThreadId,
              user.uid,
              _rawPrompt,
              title
            );
            if (!applied) return;
            logger.info('Prompt-only thread title generated (chat)', {
              operationId: _titleOpId,
              threadId: _titleThreadId,
              title,
            });
            void pubsubService?.publish(_titleOpId, 'title_updated', {
              operationId: _titleOpId,
              threadId: _titleThreadId,
              title,
              timestamp: new Date().toISOString(),
            });
            await jobRepository.withDb(_titleDb).writeJobEventWithAutoSeq(_titleOpId, {
              type: 'title_updated' as const,
              userId: user.uid,
              threadId: _titleThreadId,
              title,
              operationId: _titleOpId,
              timestamp: new Date().toISOString(),
            });
          } catch (err) {
            logger.warn('Prompt-only title generation failed (chat)', {
              error: err instanceof Error ? err.message : String(err),
              threadId: _titleThreadId,
            });
          }
        })();
      }

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
        initialOperationStatus: 'queued',
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
            `event: error\ndata: ${JSON.stringify({
              schemaVersion: AGENT_STREAM_EVENT_SCHEMA_VERSION,
              eventId: crypto.randomUUID(),
              emittedAt: new Date().toISOString(),
              error: 'Failed to process message',
              code: 'AI_SERVICE_ERROR',
            })}\n\n`
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

export const __agentChatRouteTestUtils = {
  clearActiveUserStreams(): void {
    activeUserStreams.clear();
    activeOperationStreams.clear();
  },
  setActiveUserStreams(userId: string, count: number): void {
    const slots = new Set<string>();
    for (let index = 0; index < Math.max(0, count); index += 1) {
      slots.add(`test-stream-${index}`);
    }
    activeUserStreams.set(userId, slots);
  },
  setActiveOperationStream(userId: string, operationId: string, streamId = 'test-stream-0'): void {
    const slots = activeUserStreams.get(userId) ?? new Set<string>();
    slots.add(streamId);
    activeUserStreams.set(userId, slots);

    activeOperationStreams.set(operationId, {
      userId,
      streamId,
      terminate: () => {
        const userSlots = activeUserStreams.get(userId);
        if (!userSlots) return;
        userSlots.delete(streamId);
        if (userSlots.size === 0) activeUserStreams.delete(userId);
      },
    });
  },
  getActiveUserStreamCount(userId: string): number {
    return activeUserStreams.get(userId)?.size ?? 0;
  },
};
