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
import {
  AgentChatRequestDto,
  AgentEnqueueRequestDto,
  ResolvePendingAttachmentsDto,
  ChatAttachmentDto,
} from '../../dtos/agent-x.dto.js';
import type {
  AgentJobPayload,
  AgentJobOrigin,
  AgentOperationStatus,
  AgentYieldState,
  AgentXAttachment,
  AgentXOperationLifecycleStatus,
  AgentXSelectedAction,
} from '@nxt1/core';
import { AGENT_X_REQUEST_HEADERS, AGENT_X_RUNTIME_CONFIG } from '@nxt1/core/ai';
import {
  STREAM_TERMINAL_EVENTS,
  type PubSubUnsubscribe,
} from '../../modules/agent/queue/pubsub.service.js';
import { AgentEphemeralStateService } from '../../modules/agent/services/agent-ephemeral-state.service.js';
import { logger } from '../../utils/logger.js';
import {
  resolveBillingTarget,
  checkBudgetFromContext,
  expireStaleHolds,
} from '../../modules/billing/index.js';
import { estimateChargeAmountSync } from '../../modules/billing/pricing.service.js';
import crypto from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

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
import { resolveAppBaseUrl } from '../../utils/app-url.js';
import { AgentMessageModel } from '../../models/agent/agent-message.model.js';

const router = Router();

const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';
const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9:_-]{8,128}$/;
import {
  enqueueWithOutbox,
  OUTBOX_COLLECTION,
  OUTBOX_TTL_ENQUEUED_DAYS,
  OUTBOX_TTL_ERROR_DAYS,
  outboxTtlFromNow,
} from '../../modules/agent/queue/outbox.service.js';
const MAX_CONCURRENT_STREAMS_PER_USER = 5;
const POLL_BACKOFF_INITIAL_MS: number = AGENT_X_RUNTIME_CONFIG.operationStream.pollBackoffInitialMs;
const POLL_BACKOFF_MAX_MS: number = AGENT_X_RUNTIME_CONFIG.operationStream.pollBackoffMaxMs;
const FALLBACK_ALERT_THRESHOLD_MS: number =
  AGENT_X_RUNTIME_CONFIG.operationStream.fallbackAlertThresholdMs;
const STREAM_IDLE_TIMEOUT_MS: number = AGENT_X_RUNTIME_CONFIG.operationStream.idleTimeoutMs;
const STREAM_LEASE_STALE_AFTER_MS: number = STREAM_IDLE_TIMEOUT_MS + 30_000;
const ATTACHMENT_WAIT_TIMEOUT_MS: number =
  AGENT_X_RUNTIME_CONFIG.operationStream.attachmentWaitTimeoutMs;
const ATTACHMENT_WAIT_PROGRESS_INTERVAL_MS = 4_000;
const LIVE_BUFFER_MAX_EVENTS: number = AGENT_X_RUNTIME_CONFIG.operationStream.liveBufferMaxEvents;
const PAUSE_YIELD_TTL_MS = 24 * 60 * 60 * 1000;
const CHAT_BILLING_GATE_ESTIMATED_COST_USD = 0.1;
const PAUSE_RESUME_TOOL_NAME = 'resume_paused_operation';
const AGENT_STREAM_EVENT_SCHEMA_VERSION = 2;

interface ActiveUserStreamLease {
  readonly streamId: string;
  readonly operationId: string;
  readonly attachedAt: number;
  lastActivityAt: number;
}

const activeUserStreams = new Map<string, Map<string, ActiveUserStreamLease>>();

interface ActiveOperationStreamLease {
  readonly userId: string;
  readonly streamId: string;
  readonly operationId: string;
  readonly attachedAt: number;
  lastActivityAt: number;
  touch(): void;
  terminate(reason: 'replaced', replacedByStreamId: string): void;
}

const activeOperationStreams = new Map<string, ActiveOperationStreamLease>();

function ensureActiveUserStreamLeases(userId: string): Map<string, ActiveUserStreamLease> {
  const existing = activeUserStreams.get(userId);
  if (existing) return existing;
  const created = new Map<string, ActiveUserStreamLease>();
  activeUserStreams.set(userId, created);
  return created;
}

function setActiveUserStreamLease(
  userId: string,
  streamId: string,
  operationId: string,
  timestamp = Date.now()
): void {
  ensureActiveUserStreamLeases(userId).set(streamId, {
    streamId,
    operationId,
    attachedAt: timestamp,
    lastActivityAt: timestamp,
  });
}

function touchActiveStreamLease(userId: string, operationId: string, streamId: string): void {
  const timestamp = Date.now();
  const userStreams = activeUserStreams.get(userId);
  const userLease = userStreams?.get(streamId);
  if (userLease) {
    userLease.lastActivityAt = timestamp;
  }

  const operationLease = activeOperationStreams.get(operationId);
  if (operationLease && operationLease.streamId === streamId && operationLease.userId === userId) {
    operationLease.touch();
  }
}

function removeActiveUserStreamLease(userId: string, streamId: string): void {
  const userStreams = activeUserStreams.get(userId);
  if (!userStreams) return;
  userStreams.delete(streamId);
  if (userStreams.size === 0) {
    activeUserStreams.delete(userId);
  }
}

function resolveRequestAppBaseUrl(req: Request): string {
  const explicitAppBaseUrlHeader = req.header(AGENT_X_REQUEST_HEADERS.APP_BASE_URL) ?? undefined;

  return resolveAppBaseUrl({
    environment: req.isStaging ? 'staging' : 'production',
    appBaseUrl: explicitAppBaseUrlHeader,
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
    referer: typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
    host: typeof req.headers.host === 'string' ? req.headers.host : undefined,
    protocol: req.protocol,
    forwardedHost:
      typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host']
        : undefined,
    forwardedProto:
      typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto']
        : undefined,
  });
}

function pruneInactiveUserStreams(userId: string, now = Date.now()): number {
  const userStreams = activeUserStreams.get(userId);
  if (!userStreams?.size) return 0;

  let prunedCount = 0;
  for (const [streamId, lease] of userStreams) {
    const operationLease = activeOperationStreams.get(lease.operationId);
    const isOwnedOperationLease =
      operationLease?.userId === userId && operationLease.streamId === streamId;
    const lastActivityAt = Math.max(
      lease.lastActivityAt,
      isOwnedOperationLease ? (operationLease?.lastActivityAt ?? lease.lastActivityAt) : 0
    );
    const isStale = now - lastActivityAt > STREAM_LEASE_STALE_AFTER_MS;

    if (isOwnedOperationLease && !isStale) {
      continue;
    }

    userStreams.delete(streamId);
    prunedCount += 1;

    if (isOwnedOperationLease) {
      activeOperationStreams.delete(lease.operationId);
    }
  }

  if (userStreams.size === 0) {
    activeUserStreams.delete(userId);
  }

  return prunedCount;
}

/** In-memory waiter for a pending-attachment stub resolution. */
interface PendingAttachmentWaiter {
  readonly userId: string;
  resolve(attachments: readonly ChatAttachmentDto[]): void;
  reject(reason?: Error): void;
  readonly timeoutHandle: ReturnType<typeof setTimeout>;
}

/**
 * Map from operationId → waiter for requests that sent `attachmentStubs`.
 * Entry is created inside the `/chat` handler and deleted either on resolution
 * (POST `/pending-attachments/:operationId`) or on timeout.
 */
const pendingAttachmentWaiters = new Map<string, PendingAttachmentWaiter>();

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

// ─── Shared attachment utilities ──────────────────────────────────────────
// Used by both /chat and /enqueue so attachment processing is identical.

const ATTACHMENT_VIDEO_URL_HINT_PATTERN =
  /(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com|\.(?:mp4|mov|m4v|webm|avi|mkv))(?:$|[?#/])/i;

function isVideoAttachmentDto(a: {
  mimeType?: string;
  type?: string;
  url?: string;
  cloudflareVideoId?: string;
}): boolean {
  if (typeof a.mimeType === 'string' && a.mimeType.startsWith('video/')) return true;
  if (a.type === 'video') return true;
  if (typeof a.url === 'string' && ATTACHMENT_VIDEO_URL_HINT_PATTERN.test(a.url)) return true;
  return false;
}

/**
 * Build typed attachment arrays and an enriched text string from raw DTO
 * inputs. Mirrors the processing in the /chat handler so /enqueue produces
 * the same enriched message content and worker payload.
 */
function buildAttachmentArrays(
  rawAttachments: ReadonlyArray<{
    id?: string;
    url?: string;
    storagePath?: string;
    name?: string;
    mimeType?: string;
    type?: string;
    sizeBytes?: number;
    cloudflareVideoId?: string;
    platform?: string;
    profileUrl?: string;
    faviconUrl?: string;
  }>,
  rawConnectedSources: ReadonlyArray<{
    platform: string;
    profileUrl: string;
    faviconUrl?: string;
  }>,
  baseText: string
): {
  fileAttachments: AgentXAttachment[];
  videoAttachments: AgentXAttachment[];
  connectedSourceAttachments: AgentXAttachment[];
  enrichedText: string;
} {
  const fileAttachments: AgentXAttachment[] = rawAttachments
    .filter(
      (a) =>
        !isVideoAttachmentDto(a) &&
        typeof a.url === 'string' &&
        typeof a.mimeType === 'string' &&
        typeof a.sizeBytes === 'number' &&
        (a.mimeType.startsWith('image/') ||
          a.mimeType === 'application/pdf' ||
          a.mimeType === 'text/csv' ||
          a.mimeType === 'text/plain' ||
          a.mimeType === 'application/vnd.ms-excel' ||
          a.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          a.mimeType === 'application/msword' ||
          a.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    )
    .map((a) => ({
      id: a.id as string,
      url: a.url as string,
      ...(a.storagePath ? { storagePath: a.storagePath } : {}),
      name: a.name ?? '',
      mimeType: a.mimeType as string,
      type: a.type as AgentXAttachment['type'],
      sizeBytes: a.sizeBytes as number,
    }));

  const videoAttachments: AgentXAttachment[] = rawAttachments
    .filter(
      (a) =>
        isVideoAttachmentDto(a) &&
        typeof a.url === 'string' &&
        typeof a.mimeType === 'string' &&
        typeof a.sizeBytes === 'number'
    )
    .map((a) => ({
      id: a.id as string,
      url: a.url as string,
      ...(a.storagePath ? { storagePath: a.storagePath } : {}),
      name: a.name ?? '',
      mimeType: a.mimeType as string,
      type: a.type as AgentXAttachment['type'],
      sizeBytes: a.sizeBytes as number,
      ...(a.cloudflareVideoId ? { cloudflareVideoId: a.cloudflareVideoId } : {}),
    }));

  const connectedSourceAttachments: AgentXAttachment[] = rawConnectedSources.map((source) => ({
    id: crypto.randomUUID(),
    url: source.profileUrl,
    name: source.platform,
    mimeType: 'application/x-connected-source',
    type: 'app' as AgentXAttachment['type'],
    sizeBytes: 1,
    ...(source.platform ? { platform: source.platform } : {}),
    ...(source.profileUrl ? { profileUrl: source.profileUrl } : {}),
    ...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {}),
  }));

  let enrichedText = baseText;

  if (rawConnectedSources.length > 0) {
    const sourceRefs = rawConnectedSources.map((s) => `${s.platform}: ${s.profileUrl}`).join(', ');
    enrichedText = `${enrichedText}\n\n[Connected sources available (confirmed by user for this turn): ${sourceRefs}]\n[Instruction: treat these as user-connected sources for this request; do not state they are missing.]`;
  }
  if (videoAttachments.length > 0) {
    const videoRefs = videoAttachments
      .map((v) => `[Attached video: ${v.name} — ${v.url}]`)
      .join('\n');
    enrichedText = `${enrichedText}\n\n${videoRefs}`;
  }
  if (fileAttachments.length > 0) {
    const fileRefs = fileAttachments
      .map((f) => `[Attached file: ${f.name} (${f.mimeType}) — ${f.url}]`)
      .join('\n');
    enrichedText = `${enrichedText}\n\n${fileRefs}`;
  }

  return { fileAttachments, videoAttachments, connectedSourceAttachments, enrichedText };
}

function writeSseHeaders(res: Response): void {
  if (res.headersSent) return; // Idempotent — already committed (e.g. stub-wait block)
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

async function enqueueWithOutboxLocal(
  db: Firestore,
  payload: AgentJobPayload,
  environment: 'staging' | 'production'
): Promise<{ jobId: string; deduplicated: boolean }> {
  if (!queueService) throw new Error('Agent queue is unavailable');
  return enqueueWithOutbox(db, payload, environment, queueService);
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

  const prunedStreamCount = pruneInactiveUserStreams(userId);
  if (prunedStreamCount > 0) {
    logger.warn('Pruned inactive Agent X stream leases before enforcing user limit', {
      userId,
      operationId,
      prunedStreamCount,
    });
  }

  const userStreams = ensureActiveUserStreamLeases(userId);
  if (userStreams.size >= MAX_CONCURRENT_STREAMS_PER_USER) {
    res.status(429).json({
      success: false,
      error: `Too many active streams. Limit is ${MAX_CONCURRENT_STREAMS_PER_USER} per user.`,
      code: 'AGENT_STREAM_LIMIT_REACHED',
    });
    return;
  }
  setActiveUserStreamLease(userId, streamId, operationId);
  streamObservability.streamAttachedTotal += 1;

  const releaseStreamSlot = () => {
    removeActiveUserStreamLease(userId, streamId);
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
    operationId,
    attachedAt: Date.now(),
    lastActivityAt: Date.now(),
    touch: () => {
      const activeLease = activeOperationStreams.get(operationId);
      if (!activeLease || activeLease.streamId !== streamId || activeLease.userId !== userId) {
        return;
      }
      activeLease.lastActivityAt = Date.now();
    },
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
      touchActiveStreamLease(userId, operationId, streamId);
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
  // Tracks total delta characters emitted via the Firestore replay so the
  // live-buffer drain can skip live deltas that were already sent. Live
  // deltas carry no seq number and therefore bypass the seq-based dedup;
  // the char watermark is the only reliable guard against double-printing.
  let replayDeltaCharsEmitted = 0;
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

    // Drop live delta events that were already covered by the Firestore
    // replay. Live deltas have no seq so the seq-based guard above cannot
    // filter them. We consume the replayDeltaCharsEmitted watermark so the
    // same text is never written to the SSE stream twice.
    if (msg.event === 'delta' && seq === null && replayDeltaCharsEmitted > 0) {
      const deltaText = (msg.data as Record<string, unknown>)?.['text'];
      if (typeof deltaText === 'string' && deltaText.length > 0) {
        if (replayDeltaCharsEmitted >= deltaText.length) {
          replayDeltaCharsEmitted -= deltaText.length;
          streamObservability.liveDroppedBySeqTotal += 1;
          return;
        }
        // Partial overlap (edge case) — zero the watermark and let through.
        replayDeltaCharsEmitted = 0;
      }
    }

    try {
      touchActiveStreamLease(userId, operationId, streamId);
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
    // Accumulate delta chars so the live-buffer drain can skip events
    // whose text was already delivered via the Firestore replay path.
    // evt.text is typed as string | undefined on JobEvent — no cast needed.
    if (String(evt.type ?? '') === 'delta') {
      if (typeof evt.text === 'string') replayDeltaCharsEmitted += evt.text.length;
    }
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
  let pollDelayMs: number = POLL_BACKOFF_INITIAL_MS;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackAlerted = false;
  let fallbackPollCount = 0;
  let fallbackReadSuccessCount = 0;
  let fallbackReadErrorCount = 0;
  let fallbackMaxDelayMs: number = pollDelayMs;

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
        appBaseUrl: resolveRequestAppBaseUrl(req),
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
    const enqueueResult = await enqueueWithOutboxLocal(db, resumedPayload, environment);

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

// ─── POST /threads/:threadId/actions — Thread-truth semantic actions ──────

type ThreadActionType = 'ask_user_reply' | 'approval_decision';

interface ThreadActionRequestBody {
  readonly actionType?: ThreadActionType;
  readonly messageId?: string;
  readonly operationIdHint?: string;
  readonly response?: string;
  readonly decision?: 'approved' | 'rejected';
  readonly toolInput?: Record<string, unknown>;
  readonly trustForSession?: boolean;
}

const THREAD_ACTION_PENDING_STATUSES: readonly AgentOperationStatus[] = [
  'awaiting_input',
  'awaiting_approval',
  'paused',
] as const;

function toMillis(value: unknown): number {
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date.getTime();
    } catch {
      return 0;
    }
  }
  return 0;
}

async function resolveOperationForThreadAction(params: {
  db: Firestore;
  userId: string;
  threadId: string;
  operationIdHint?: string;
  messageId?: string;
}): Promise<string | null> {
  const { db, userId, threadId } = params;

  const resolveFromHint = async (operationId: string): Promise<string | null> => {
    const trimmed = operationId.trim();
    if (!trimmed) return null;
    const job = await jobRepository?.withDb(db).getById(trimmed);
    if (!job) return null;
    if (job.userId !== userId || job.threadId !== threadId) return null;
    if (!THREAD_ACTION_PENDING_STATUSES.includes(job.status)) return null;
    return trimmed;
  };

  if (params.operationIdHint) {
    const fromHint = await resolveFromHint(params.operationIdHint);
    if (fromHint) return fromHint;
  }

  if (params.messageId && params.messageId.trim().length > 0) {
    const message = await AgentMessageModel.findOne({
      _id: params.messageId.trim(),
      threadId,
      userId,
    })
      .select({ operationId: 1 })
      .lean()
      .exec();

    const messageOperationId =
      message && typeof message['operationId'] === 'string' ? message['operationId'] : null;
    if (messageOperationId) {
      const fromMessage = await resolveFromHint(messageOperationId);
      if (fromMessage) return fromMessage;
    }
  }

  const pendingSnap = await db
    .collection('AgentJobs')
    .where('userId', '==', userId)
    .where('threadId', '==', threadId)
    .where('status', 'in', [...THREAD_ACTION_PENDING_STATUSES])
    .get();

  if (pendingSnap.empty) return null;

  const sorted = [...pendingSnap.docs].sort((a, b) => {
    const aData = a.data() as Record<string, unknown>;
    const bData = b.data() as Record<string, unknown>;
    const aMs = Math.max(toMillis(aData['updatedAt']), toMillis(aData['createdAt']));
    const bMs = Math.max(toMillis(bData['updatedAt']), toMillis(bData['createdAt']));
    return bMs - aMs;
  });

  return sorted[0]?.id ?? null;
}

router.post('/threads/:threadId/actions', appGuard, async (req: Request, res: Response) => {
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

    const threadIdParam = req.params['threadId'];
    if (!threadIdParam || typeof threadIdParam !== 'string' || threadIdParam.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Thread ID is required' });
      return;
    }

    const body = (req.body ?? {}) as ThreadActionRequestBody;
    if (body.actionType !== 'ask_user_reply' && body.actionType !== 'approval_decision') {
      res.status(400).json({ success: false, error: 'Invalid actionType' });
      return;
    }

    const { db } = req.firebase!;
    const resolvedOperationId = await resolveOperationForThreadAction({
      db,
      userId: user.uid,
      threadId: threadIdParam.trim(),
      operationIdHint: body.operationIdHint,
      messageId: body.messageId,
    });

    if (!resolvedOperationId) {
      res.status(409).json({ success: false, error: 'No pending action found for this thread' });
      return;
    }

    if (body.actionType === 'ask_user_reply') {
      const userResponse = typeof body.response === 'string' ? body.response : '';
      if (userResponse.trim().length === 0) {
        res.status(400).json({ success: false, error: 'A non-empty response is required' });
        return;
      }
      if (userResponse.length > 5000) {
        res.status(400).json({ success: false, error: 'Response must be 5000 characters or less' });
        return;
      }

      const jobDoc = await jobRepository.withDb(db).getById(resolvedOperationId);
      if (!jobDoc || jobDoc.userId !== user.uid || jobDoc.threadId !== threadIdParam.trim()) {
        res.status(404).json({ success: false, error: 'Job not found' });
        return;
      }

      const status = jobDoc.status;
      if (status !== 'awaiting_input' && status !== 'awaiting_approval' && status !== 'paused') {
        res.status(409).json({ success: false, error: `Job is in "${status}" state` });
        return;
      }

      const yieldState = jobDoc.yieldState as AgentYieldState | undefined;
      if (!yieldState) {
        res.status(409).json({ success: false, error: 'No yield state found on this job' });
        return;
      }

      const trimmedUserResponse = userResponse.trim();
      const resumeFromPausedState = isPauseYieldState(yieldState);
      if (!resumeFromPausedState && trimmedUserResponse.length === 0) {
        res.status(400).json({ success: false, error: 'A non-empty response is required' });
        return;
      }

      if (new Date(yieldState.expiresAt).getTime() < Date.now()) {
        await jobRepository
          .withDb(db)
          .markFailed(resolvedOperationId, 'Yield expired before user responded');
        res.status(410).json({ success: false, error: 'This request has expired' });
        return;
      }

      if (jobDoc.threadId && chatService && trimmedUserResponse.length > 0) {
        try {
          await chatService.addMessage({
            threadId: jobDoc.threadId,
            userId: user.uid,
            role: 'user',
            content: trimmedUserResponse,
            origin: 'user',
            operationId: resolvedOperationId,
          });
        } catch (chatErr) {
          logger.warn('Failed to persist thread action reply to MongoDB', {
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
          appBaseUrl: resolveRequestAppBaseUrl(req),
          threadId: jobDoc.threadId,
          resumedFrom: resolvedOperationId,
          yieldState: {
            ...yieldState,
            messages: resumedMessages,
          } satisfies AgentYieldState,
        },
      };

      await jobRepository.withDb(db).create(resumedPayload);
      await jobRepository.withDb(db).markCompleted(resolvedOperationId, {
        summary: resumeFromPausedState
          ? `Resumed after pause — continuing as ${resumedPayload.operationId}`
          : `Resumed by user — continuing as ${resumedPayload.operationId}`,
        data: {
          resumedAs: resumedPayload.operationId,
          ...(resumeFromPausedState ? { resumedFromPause: true } : {}),
        },
      });

      if (jobDoc.threadId && chatService) {
        try {
          await chatService.clearThreadPausedYieldState(jobDoc.threadId);
        } catch (err) {
          logger.warn('Failed to clear thread paused yield state on thread action resume', {
            threadId: jobDoc.threadId,
            operationId: resolvedOperationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const environment = req.isStaging ? 'staging' : 'production';
      const enqueueResult = await enqueueWithOutboxLocal(db, resumedPayload, environment);

      res.status(202).json({
        success: true,
        data: {
          actionType: body.actionType,
          resumed: true,
          jobId: enqueueResult.jobId,
          operationId: resumedPayload.operationId,
          threadId: jobDoc.threadId,
          resolvedOperationId,
        },
      });
      return;
    }

    if (body.decision !== 'approved' && body.decision !== 'rejected') {
      res.status(400).json({
        success: false,
        error: 'Decision must be "approved" or "rejected"',
      });
      return;
    }
    if (
      body.toolInput !== undefined &&
      (typeof body.toolInput !== 'object' ||
        body.toolInput === null ||
        Array.isArray(body.toolInput))
    ) {
      res.status(400).json({
        success: false,
        error: 'toolInput must be an object when provided',
      });
      return;
    }

    const approvalsSnap = await db
      .collection('AgentApprovalRequests')
      .where('userId', '==', user.uid)
      .where('operationId', '==', resolvedOperationId)
      .where('status', '==', 'pending')
      .get();

    if (approvalsSnap.empty) {
      res.status(409).json({ success: false, error: 'No pending approval found for this thread' });
      return;
    }

    let approvalDoc = approvalsSnap.docs[0];
    if (approvalsSnap.docs.length > 1) {
      approvalDoc = [...approvalsSnap.docs].sort((a, b) => {
        const aData = a.data() as Record<string, unknown>;
        const bData = b.data() as Record<string, unknown>;
        return toMillis(bData['createdAt']) - toMillis(aData['createdAt']);
      })[0];
    }

    const approvalRef = db.collection('AgentApprovalRequests').doc(approvalDoc.id);
    const transactionResult = await db.runTransaction(async (txn) => {
      const approvalSnap = await txn.get(approvalRef);
      if (!approvalSnap.exists) return { code: 404, error: 'Approval request not found' } as const;

      const approvalData = approvalSnap.data()!;
      if (approvalData['userId'] !== user.uid) {
        return { code: 404, error: 'Approval request not found' } as const;
      }
      if (approvalData['status'] !== 'pending') {
        return { code: 409, error: `Approval is already "${approvalData['status']}"` } as const;
      }

      txn.update(approvalRef, {
        status: body.decision,
        resolvedAt: new Date().toISOString(),
        resolvedBy: user.uid,
        ...(body.toolInput ? { toolInput: body.toolInput } : {}),
      });

      return {
        code: 200,
        operationId: approvalData['operationId'] as string | undefined,
        toolInput: (body.toolInput ?? approvalData['toolInput']) as
          | Record<string, unknown>
          | undefined,
      } as const;
    });

    if ('error' in transactionResult) {
      res.status(transactionResult.code).json({ success: false, error: transactionResult.error });
      return;
    }

    const operationId = transactionResult.operationId;
    const resolvedToolInput = transactionResult.toolInput;
    if (!operationId) {
      res.json({
        success: true,
        data: {
          actionType: body.actionType,
          decision: body.decision,
          resumed: false,
          resolvedOperationId,
        },
      });
      return;
    }

    const jobDoc = await jobRepository.withDb(db).getById(operationId);
    if (!jobDoc) {
      res.json({
        success: true,
        data: {
          actionType: body.actionType,
          decision: body.decision,
          resumed: false,
          resolvedOperationId,
        },
      });
      return;
    }

    if (
      jobDoc.status === 'cancelled' ||
      jobDoc.status === 'failed' ||
      jobDoc.status === 'completed'
    ) {
      res.json({
        success: true,
        data: {
          actionType: body.actionType,
          decision: body.decision,
          resumed: false,
          reason: 'operation_already_terminal',
          resolvedOperationId,
        },
      });
      return;
    }

    const yieldState = jobDoc.yieldState as AgentYieldState | undefined;
    const threadId = jobDoc.threadId;

    if (body.decision === 'rejected') {
      await jobRepository.withDb(db).markCancelled(operationId);
      if (threadId && chatService) {
        try {
          await chatService.clearThreadPausedYieldState(threadId);
        } catch (err) {
          logger.warn('Failed to clear thread paused yield state on thread action rejection', {
            threadId,
            operationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      res.json({
        success: true,
        data: {
          actionType: body.actionType,
          decision: body.decision,
          resumed: false,
          resolvedOperationId,
        },
      });
      return;
    }

    if (!yieldState?.pendingToolCall) {
      await jobRepository.withDb(db).markCompleted(operationId, {
        summary: 'Approval granted but no pending action to resume.',
      });
      res.json({
        success: true,
        data: {
          actionType: body.actionType,
          decision: body.decision,
          resumed: false,
          resolvedOperationId,
        },
      });
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
        appBaseUrl: resolveRequestAppBaseUrl(req),
        threadId,
        resumedFrom: operationId,
        approvalId: approvalDoc.id,
        yieldState: {
          ...yieldState,
          messages: normalizedApprovalMessages,
          approvalId: approvalDoc.id,
          pendingToolCall: {
            ...yieldState.pendingToolCall,
            toolInput: resolvedToolInput ?? yieldState.pendingToolCall.toolInput,
          },
        },
      },
    };

    await jobRepository.withDb(db).create(resumedPayload);
    await jobRepository.withDb(db).markCompleted(operationId, {
      summary: `Approved — continuing as ${resumedPayload.operationId}`,
      data: { resumedAs: resumedPayload.operationId, approvalId: approvalDoc.id },
    });

    if (body.trustForSession === true && yieldState.pendingToolCall.toolName) {
      const toolNameForTrust = yieldState.pendingToolCall.toolName;
      try {
        const { ApprovalGateService } =
          await import('../../modules/agent/services/approval-gate.service.js');
        const approvalGateSvc = new ApprovalGateService(db);
        await approvalGateSvc.grantSessionTrust(
          user.uid,
          resumedPayload.sessionId,
          toolNameForTrust
        );
      } catch (trustErr) {
        logger.warn('Failed to write session trust grant (non-fatal)', {
          error: trustErr instanceof Error ? trustErr.message : String(trustErr),
          toolName: toolNameForTrust,
        });
      }
    }

    if (threadId && chatService) {
      try {
        await chatService.clearThreadPausedYieldState(threadId);
      } catch (err) {
        logger.warn('Failed to clear thread paused yield state on thread action approval', {
          threadId,
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const environment = req.isStaging ? 'staging' : 'production';
    const enqueueResult = await enqueueWithOutboxLocal(db, resumedPayload, environment);

    res.json({
      success: true,
      data: {
        actionType: body.actionType,
        decision: body.decision,
        resumed: true,
        jobId: enqueueResult.jobId,
        operationId: resumedPayload.operationId,
        threadId,
        resolvedOperationId,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to execute thread action', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to execute thread action' });
  }
});

// ─── GET /approvals/pending/by-operation/:operationId — Recover approvalId ───

router.get(
  '/approvals/pending/by-operation/:operationId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const operationId = req.params['operationId'];
      if (!operationId || typeof operationId !== 'string' || operationId.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Operation ID is required' });
        return;
      }

      const { db } = req.firebase!;
      const approvalsSnap = await db
        .collection('AgentApprovalRequests')
        .where('userId', '==', user.uid)
        .where('operationId', '==', operationId.trim())
        .where('status', '==', 'pending')
        .get();

      if (approvalsSnap.empty) {
        res.json({ success: true, data: null });
        return;
      }

      const nowMs = Date.now();
      let best: {
        approvalId: string;
        createdAt: string;
        expiresAt: string;
      } | null = null;

      for (const doc of approvalsSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const createdAtRaw = typeof data['createdAt'] === 'string' ? data['createdAt'] : null;
        const expiresInMsRaw = data['expiresInMs'];
        const expiresInMs =
          typeof expiresInMsRaw === 'number' && Number.isFinite(expiresInMsRaw)
            ? expiresInMsRaw
            : 86_400_000;
        const createdAtMs = createdAtRaw ? Date.parse(createdAtRaw) : NaN;
        if (!Number.isFinite(createdAtMs)) continue;

        const expiresAtMs = createdAtMs + expiresInMs;
        if (expiresAtMs <= nowMs) continue;

        const candidate = {
          approvalId: doc.id,
          createdAt: new Date(createdAtMs).toISOString(),
          expiresAt: new Date(expiresAtMs).toISOString(),
        };

        if (!best || createdAtMs > Date.parse(best.createdAt)) {
          best = candidate;
        }
      }

      res.json({ success: true, data: best });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to find pending approval by operation', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to find pending approval' });
    }
  }
);

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

    const { decision, toolInput, trustForSession } = req.body as {
      decision?: string;
      toolInput?: Record<string, unknown>;
      trustForSession?: boolean;
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
        appBaseUrl: resolveRequestAppBaseUrl(req),
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

    // ── Session trust grant (best-effort) ───────────────────────────────────
    // When the user checked "Trust for this session", write a Firestore grant
    // so subsequent approvals in the same trust group are skipped for 2 hours.
    if (trustForSession === true && yieldState?.pendingToolCall?.toolName) {
      const toolNameForTrust = yieldState.pendingToolCall.toolName;
      const sessionIdForTrust = resumedPayload.sessionId;
      try {
        const { ApprovalGateService } =
          await import('../../modules/agent/services/approval-gate.service.js');
        const approvalGateSvc = new ApprovalGateService(db);
        await approvalGateSvc.grantSessionTrust(user.uid, sessionIdForTrust, toolNameForTrust);
        logger.info('Session trust grant written', {
          userId: user.uid,
          sessionId: sessionIdForTrust,
          toolName: toolNameForTrust,
        });
      } catch (trustErr) {
        logger.warn('Failed to write session trust grant (non-fatal)', {
          error: trustErr instanceof Error ? trustErr.message : String(trustErr),
          toolName: toolNameForTrust,
        });
      }
    }

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
    const enqueueResult = await enqueueWithOutboxLocal(db, resumedPayload, environment);

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

// ─── POST /pending-attachments/:operationId — Resolve attachment stubs ────
// Called by the frontend after background uploads complete. The /chat handler
// that opened the operation may be parked on this instance (in the in-memory
// `pendingAttachmentWaiters` map) OR on another instance (subscribed via
// Redis pubsub). We try the local waiter first; otherwise we publish the
// resolved payload to the attachments-resolved channel so the parked handler
// on the owning instance can pick it up.

const resolvePendingAttachmentsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { operationId } = req.params as { operationId: string };
    const body = req.body as ResolvePendingAttachmentsDto;
    const localWaiter = pendingAttachmentWaiters.get(operationId);

    if (localWaiter) {
      if (localWaiter.userId !== user.uid) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      clearTimeout(localWaiter.timeoutHandle);
      pendingAttachmentWaiters.delete(operationId);
      localWaiter.resolve(body.attachments);

      logger.info('Agent chat: pending attachments resolved (local)', {
        operationId,
        userId: user.uid,
        attachmentCount: body.attachments.length,
      });

      res.status(200).json({ success: true });
      return;
    }

    // No local waiter — check Redis for a cross-instance owner before
    // publishing so we don't blast resolved payloads at unowned channels.
    const ownerUid = await AgentEphemeralStateService.getAttachmentWaitOwner(operationId).catch(
      () => null
    );

    if (!ownerUid) {
      res.status(404).json({
        success: false,
        error: 'No pending attachment waiter found for this operationId. It may have timed out.',
        code: 'WAITER_NOT_FOUND',
      });
      return;
    }

    if (ownerUid !== user.uid) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    if (!pubsubService) {
      res.status(503).json({
        success: false,
        error: 'Cross-instance pubsub is unavailable',
        code: 'PUBSUB_UNAVAILABLE',
      });
      return;
    }

    await pubsubService.publishAttachmentsResolved({
      operationId,
      userId: user.uid,
      attachments: body.attachments as unknown as ReadonlyArray<Record<string, unknown>>,
      resolvedAt: new Date().toISOString(),
    });

    logger.info('Agent chat: pending attachments resolved (pubsub)', {
      operationId,
      userId: user.uid,
      attachmentCount: body.attachments.length,
    });

    res.status(200).json({ success: true });
    return;
  } catch (err) {
    logger.error('POST /pending-attachments error', {
      route: 'pending-attachments',
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

router.post(
  '/pending-attachments/:operationId',
  appGuard,
  validateBody(ResolvePendingAttachmentsDto),
  resolvePendingAttachmentsHandler
);

// Backward-compatible alias for clients that post to /chat/pending-attachments/:operationId.
router.post(
  '/chat/pending-attachments/:operationId',
  appGuard,
  validateBody(ResolvePendingAttachmentsDto),
  resolvePendingAttachmentsHandler
);

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

      const { intent, userContext, threadId, selectedAction, attachments, connectedSources } =
        req.body as AgentEnqueueRequestDto;
      const normalizedSelectedAction = normalizeSelectedActionForPayload(selectedAction);
      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }
      const environment = req.isStaging ? 'staging' : 'production';
      const trimmedIntent = intent.trim();

      // ── Attachment processing (mirrors /chat) ─────────────────────────────
      const { fileAttachments, videoAttachments, connectedSourceAttachments, enrichedText } =
        buildAttachmentArrays(attachments ?? [], connectedSources ?? [], trimmedIntent);
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
              content: enrichedText,
              origin: 'user',
              ...(idempotencyKey ? { idempotencyKey } : {}),
              ...(fileAttachments.length > 0 ||
              videoAttachments.length > 0 ||
              connectedSourceAttachments.length > 0
                ? {
                    attachments: [
                      ...fileAttachments,
                      ...videoAttachments,
                      ...connectedSourceAttachments,
                    ],
                  }
                : {}),
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
          appBaseUrl: resolveRequestAppBaseUrl(req),
          ...(userContext ?? {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
          ...(concurrencyDecision.parentOperationId
            ? { parentOperationId: concurrencyDecision.parentOperationId }
            : {}),
          ...(normalizedSelectedAction ? { selectedAction: normalizedSelectedAction } : {}),
          ...(fileAttachments.length > 0 ? { attachments: fileAttachments } : {}),
          ...(videoAttachments.length > 0 ? { videoAttachments } : {}),
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

      const enqueueResult = await enqueueWithOutboxLocal(db, payload, environment);

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

      const {
        message,
        mode,
        threadId,
        attachments,
        connectedSources,
        resumeOperationId,
        afterSeq,
        selectedAction,
      } = req.body as AgentChatRequestDto;
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
      logger.info('Agent chat request attachment summary', {
        userId: user.uid,
        threadId: threadId ?? null,
        attachmentCount: allAttachments.length,
        attachmentTypes: allAttachments.map((attachment) => attachment.type ?? 'unknown'),
        videoCount: allAttachments.filter((attachment) => attachment.type === 'video').length,
      });
      const VIDEO_URL_HINT_PATTERN =
        /(?:storage\.googleapis\.com|firebasestorage\.googleapis\.com|\.(?:mp4|mov|m4v|webm|avi|mkv))(?:$|[?#/])/i;
      const isVideoAttachment = (attachment: {
        mimeType?: string;
        type?: string;
        url?: string;
        cloudflareVideoId?: string;
      }): boolean => {
        if (typeof attachment.mimeType === 'string' && attachment.mimeType.startsWith('video/')) {
          return true;
        }
        if (attachment.type === 'video') return true;
        if (typeof attachment.url === 'string' && VIDEO_URL_HINT_PATTERN.test(attachment.url)) {
          return true;
        }
        return false;
      };
      const fileAttachments: AgentXAttachment[] = allAttachments
        .filter(
          (a: {
            mimeType?: string;
            type?: string;
            url?: string;
            sizeBytes?: number;
            cloudflareVideoId?: string;
          }) =>
            !isVideoAttachment(a) &&
            typeof a.url === 'string' &&
            typeof a.mimeType === 'string' &&
            typeof a.sizeBytes === 'number' &&
            (a.mimeType.startsWith('image/') ||
              a.mimeType === 'application/pdf' ||
              a.mimeType === 'text/csv' ||
              a.mimeType === 'text/plain' ||
              a.mimeType === 'application/vnd.ms-excel' ||
              a.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
              a.mimeType === 'application/msword' ||
              a.mimeType ===
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        )
        .map(
          (a) =>
            ({
              id: a.id,
              url: a.url as string,
              ...(a.storagePath ? { storagePath: a.storagePath } : {}),
              name: a.name,
              mimeType: a.mimeType as string,
              type: a.type as AgentXAttachment['type'],
              sizeBytes: a.sizeBytes as number,
            }) as AgentXAttachment
        );
      const videoAttachments: AgentXAttachment[] = allAttachments
        .filter(
          (a: {
            mimeType?: string;
            type?: string;
            url?: string;
            sizeBytes?: number;
            cloudflareVideoId?: string;
          }) =>
            isVideoAttachment(a) &&
            typeof a.url === 'string' &&
            typeof a.mimeType === 'string' &&
            typeof a.sizeBytes === 'number'
        )
        .map(
          (a) =>
            ({
              id: a.id,
              url: a.url as string,
              ...(a.storagePath ? { storagePath: a.storagePath } : {}),
              name: a.name,
              mimeType: a.mimeType as string,
              type: a.type as AgentXAttachment['type'],
              sizeBytes: a.sizeBytes as number,
              ...(a.cloudflareVideoId ? { cloudflareVideoId: a.cloudflareVideoId } : {}),
            }) as AgentXAttachment
        );

      const connectedSourceAttachments: AgentXAttachment[] = (connectedSources ?? []).map(
        (source) => ({
          id: crypto.randomUUID(),
          url: source.profileUrl,
          name: source.platform,
          mimeType: 'application/x-connected-source',
          type: 'app',
          sizeBytes: 1,
          ...(source.platform ? { platform: source.platform } : {}),
          ...(source.profileUrl ? { profileUrl: source.profileUrl } : {}),
          ...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {}),
        })
      );

      let enrichedMessageText = message.trim();
      // Inject connected app sources as context so Agent X knows which platforms the user
      // has made available for retrieval or virtual browser navigation.
      if (connectedSources && connectedSources.length > 0) {
        const sourceRefs = connectedSources.map((s) => `${s.platform}: ${s.profileUrl}`).join(', ');
        enrichedMessageText = `${enrichedMessageText}\n\n[Connected sources available (confirmed by user for this turn): ${sourceRefs}]\n[Instruction: treat these as user-connected sources for this request; do not state they are missing.]`;
      }
      if (videoAttachments.length > 0) {
        const videoRefs = videoAttachments
          .map((v) => `[Attached video: ${v.name} — ${v.url}]`)
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

      let persistedUserMessageId: string | null = null;

      if (chatService) {
        try {
          effectiveThreadId = await resolveThread(chatService, user.uid, threadId, message);
          if (effectiveThreadId) {
            const persistedUserMessage = await chatService.addMessage({
              threadId: effectiveThreadId,
              userId: user.uid,
              role: 'user',
              content: enrichedMessageText,
              origin: 'user',
              ...(idempotencyKey ? { idempotencyKey } : {}),
              ...(fileAttachments.length > 0 ||
              videoAttachments.length > 0 ||
              connectedSourceAttachments.length > 0
                ? {
                    attachments: [
                      ...fileAttachments,
                      ...videoAttachments,
                      ...connectedSourceAttachments,
                    ],
                  }
                : {}),
            });
            persistedUserMessageId =
              typeof persistedUserMessage?.id === 'string' ? persistedUserMessage.id : null;
          }
        } catch (chatErr) {
          logger.warn('Failed to persist user message to MongoDB', {
            error: chatErr instanceof Error ? chatErr.message : String(chatErr),
            userId: user.uid,
          });
        }
      }

      const { chargeAmountCents: estimatedGateCostCents } = estimateChargeAmountSync(
        CHAT_BILLING_GATE_ESTIMATED_COST_USD
      );

      let chatTarget = await resolveBillingTarget(db, user.uid);
      let chatCtx = chatTarget.context;
      let chatBudgetCheck = checkBudgetFromContext(chatCtx, estimatedGateCostCents);

      const isWalletContext =
        chatCtx.billingEntity === 'individual' || chatCtx.billingEntity === 'organization';

      if (!chatBudgetCheck.allowed && isWalletContext && (chatCtx.pendingHoldsCents ?? 0) > 0) {
        try {
          const expiredCount = await expireStaleHolds(db);
          if (expiredCount > 0) {
            chatTarget = await resolveBillingTarget(db, user.uid);
            chatCtx = chatTarget.context;
            chatBudgetCheck = checkBudgetFromContext(chatCtx, estimatedGateCostCents);
          }
        } catch (err) {
          logger.warn('Failed to expire stale wallet holds before chat budget gate check', {
            userId: user.uid,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const walletBalanceCents = chatCtx.walletBalanceCents ?? 0;
      const pendingHoldsCents = chatCtx.pendingHoldsCents ?? 0;
      const bypassHoldGateWithPositiveWallet =
        !chatBudgetCheck.allowed &&
        isWalletContext &&
        pendingHoldsCents > 0 &&
        walletBalanceCents >= estimatedGateCostCents;

      if (bypassHoldGateWithPositiveWallet) {
        logger.info(
          'Bypassing hold-gated chat billing deny while wallet balance is still positive',
          {
            userId: user.uid,
            billingEntity: chatCtx.billingEntity,
            walletBalanceCents,
            pendingHoldsCents,
            estimatedGateCostCents,
          }
        );
      }

      if (!chatBudgetCheck.allowed && !bypassHoldGateWithPositiveWallet) {
        const billingCode = isWalletContext ? 'WALLET_EMPTY' : 'BUDGET_EXCEEDED';
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

      // ── Attachment Stub Resolution ────────────────────────────────────────
      // When the user hits Send while a video is still uploading, the client
      // sends `attachmentStubs` (id/name/mimeType/sizeBytes — no URL yet).
      // We open the SSE stream immediately, emit `waiting_for_attachments`, and
      // wait up to ATTACHMENT_WAIT_TIMEOUT_MS for a resolution POST from the
      // frontend. Once resolved the URLs are injected into fileAttachments /
      // videoAttachments before enqueueing, keeping the outbox payload complete.
      const rawAttachmentStubs = (req.body as AgentChatRequestDto).attachmentStubs ?? [];
      if (rawAttachmentStubs.length > 0) {
        writeSseHeaders(res); // idempotent — no-op if headers already sent

        let preSeq = 0;
        const buildPreEnvelope = (): {
          schemaVersion: number;
          eventId: string;
          seq: number;
          emittedAt: string;
        } => ({
          schemaVersion: AGENT_STREAM_EVENT_SCHEMA_VERSION,
          eventId: crypto.randomUUID(),
          seq: ++preSeq,
          emittedAt: new Date().toISOString(),
        });

        if (effectiveThreadId) {
          res.write(
            `event: thread\ndata: ${JSON.stringify({
              ...buildPreEnvelope(),
              threadId: effectiveThreadId,
              operationId,
            })}\n\n`
          );
          forceProxyFlush(res);
        }

        res.write(
          `event: waiting_for_attachments\ndata: ${JSON.stringify({
            ...buildPreEnvelope(),
            operationId,
            attachmentIds: rawAttachmentStubs.map((s) => s.id),
            timeoutMs: ATTACHMENT_WAIT_TIMEOUT_MS,
            ...(effectiveThreadId ? { threadId: effectiveThreadId } : {}),
          })}\n\n`
        );
        forceProxyFlush(res);

        const attachmentWaitStartedAt = Date.now();
        const attachmentWaitProgressHandle = setInterval(() => {
          if (res.destroyed || res.writableEnded) {
            clearInterval(attachmentWaitProgressHandle);
            return;
          }

          res.write(
            `event: progress\ndata: ${JSON.stringify({
              ...buildPreEnvelope(),
              operationId,
              ...(effectiveThreadId ? { threadId: effectiveThreadId } : {}),
              type: 'progress_stage',
              metadata: {
                phase: 'attachment_upload',
                stubCount: rawAttachmentStubs.length,
                elapsedMs: Date.now() - attachmentWaitStartedAt,
              },
              message:
                rawAttachmentStubs.length === 1
                  ? 'Uploading attachment...'
                  : `Uploading ${rawAttachmentStubs.length} attachments...`,
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
          forceProxyFlush(res);
        }, ATTACHMENT_WAIT_PROGRESS_INTERVAL_MS);

        logger.info('Agent chat: waiting for attachment stubs to resolve', {
          operationId,
          userId: user.uid,
          stubCount: rawAttachmentStubs.length,
          stubIds: rawAttachmentStubs.map((s) => s.id),
          threadId: effectiveThreadId ?? null,
        });

        // Set up the cross-instance pubsub subscription BEFORE registering the
        // local waiter so a resolution POST that lands on another instance is
        // never lost to a race. The local waiter remains the primary path on
        // single-instance setups; pubsub is only used when the resolver POST
        // hits a different instance than the one parked on /chat.
        let pubsubUnsubscribe: PubSubUnsubscribe | null = null;
        let resolveStubsExternal: ((value: readonly ChatAttachmentDto[] | null) => void) | null =
          null;
        const stubsResolutionPromise = new Promise<readonly ChatAttachmentDto[] | null>(
          (resolve) => {
            resolveStubsExternal = resolve;
          }
        );

        if (pubsubService) {
          try {
            pubsubUnsubscribe = await pubsubService.subscribeAttachmentsResolved(
              operationId,
              (msg) => {
                if (msg.userId !== user.uid) return;
                const attachments = msg.attachments as unknown as readonly ChatAttachmentDto[];
                resolveStubsExternal?.(attachments);
              }
            );
            await AgentEphemeralStateService.setAttachmentWaitOwner(operationId, user.uid).catch(
              (err) => {
                logger.warn('Failed to register attachment wait owner in Redis', {
                  operationId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            );
          } catch (err) {
            logger.warn('Failed to subscribe to attachments-resolved channel', {
              operationId,
              error: err instanceof Error ? err.message : String(err),
            });
            pubsubUnsubscribe = null;
          }
        }

        const timeoutHandle = setTimeout(() => {
          clearInterval(attachmentWaitProgressHandle);
          pendingAttachmentWaiters.delete(operationId);
          logger.warn('Agent chat: attachment stub wait timed out', {
            operationId,
            userId: user.uid,
            stubCount: rawAttachmentStubs.length,
          });
          resolveStubsExternal?.(null);
        }, ATTACHMENT_WAIT_TIMEOUT_MS);

        pendingAttachmentWaiters.set(operationId, {
          userId: user.uid,
          resolve: (attachments) => resolveStubsExternal?.(attachments),
          reject: () => resolveStubsExternal?.(null),
          timeoutHandle,
        });

        const resolvedStubs = await stubsResolutionPromise;
        clearInterval(attachmentWaitProgressHandle);
        clearTimeout(timeoutHandle);
        pendingAttachmentWaiters.delete(operationId);
        if (pubsubUnsubscribe) {
          await pubsubUnsubscribe().catch(() => undefined);
        }
        await AgentEphemeralStateService.clearAttachmentWaitOwner(operationId).catch(
          () => undefined
        );

        if (resolvedStubs === null) {
          const endSeq = preSeq;
          res.write(
            `event: delta\ndata: ${JSON.stringify({
              schemaVersion: AGENT_STREAM_EVENT_SCHEMA_VERSION,
              eventId: crypto.randomUUID(),
              seq: endSeq + 1,
              emittedAt: new Date().toISOString(),
              content:
                'Your video upload is taking too long. Please try sending your message again.',
            })}\n\n`
          );
          forceProxyFlush(res);
          res.write(
            `event: done\ndata: ${JSON.stringify({
              schemaVersion: AGENT_STREAM_EVENT_SCHEMA_VERSION,
              eventId: crypto.randomUUID(),
              seq: endSeq + 2,
              emittedAt: new Date().toISOString(),
              operationId,
              ...(effectiveThreadId ? { threadId: effectiveThreadId } : {}),
              status: 'failed',
              success: false,
            })}\n\n`
          );
          forceProxyFlush(res);
          res.end();
          return;
        }

        logger.info('Agent chat: attachment stubs resolved; injecting into payload', {
          operationId,
          userId: user.uid,
          resolvedCount: resolvedStubs.length,
        });

        // Inject resolved URLs into the mutable attachment arrays so they are
        // picked up by the job payload below (context.videoAttachments, etc.).
        for (const stub of resolvedStubs) {
          if (!stub.url || !stub.mimeType || !stub.sizeBytes) continue;
          const agentAttachment: AgentXAttachment = {
            id: stub.id,
            url: stub.url,
            ...(stub.storagePath ? { storagePath: stub.storagePath } : {}),
            ...(stub.cloudflareVideoId ? { cloudflareVideoId: stub.cloudflareVideoId } : {}),
            ...(stub.platform ? { platform: stub.platform } : {}),
            ...(stub.profileUrl ? { profileUrl: stub.profileUrl } : {}),
            ...(stub.faviconUrl ? { faviconUrl: stub.faviconUrl } : {}),
            name: stub.name,
            mimeType: stub.mimeType,
            type: stub.type as AgentXAttachment['type'],
            sizeBytes: stub.sizeBytes,
          };
          if (isVideoAttachment(stub)) {
            videoAttachments.push(agentAttachment);
            enrichedMessageText += `\n\n[Attached video: ${agentAttachment.name} — ${agentAttachment.url}]`;
          } else {
            fileAttachments.push(agentAttachment);
            enrichedMessageText += `\n\n[Attached file: ${agentAttachment.name} (${agentAttachment.mimeType}) — ${agentAttachment.url}]`;
          }
        }

        if (chatService && persistedUserMessageId) {
          const resolvedAttachments = [
            ...fileAttachments,
            ...videoAttachments,
            ...connectedSourceAttachments,
          ];

          if (resolvedAttachments.length > 0) {
            try {
              await chatService.updateMessageResolvedAttachments({
                userId: user.uid,
                messageId: persistedUserMessageId,
                content: enrichedMessageText,
                attachments: resolvedAttachments,
              });
            } catch (chatErr) {
              logger.warn('Failed to persist resolved attachment stubs to MongoDB', {
                error: chatErr instanceof Error ? chatErr.message : String(chatErr),
                userId: user.uid,
                threadId: effectiveThreadId ?? null,
                messageId: persistedUserMessageId,
                operationId,
                attachmentCount: resolvedAttachments.length,
              });
            }
          }
        }
      }

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
          appBaseUrl: resolveRequestAppBaseUrl(req),
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
      await enqueueWithOutboxLocal(db, payload, environment);

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
    const slots = new Map<string, ActiveUserStreamLease>();
    const now = Date.now();
    for (let index = 0; index < Math.max(0, count); index += 1) {
      const streamId = `test-stream-${index}`;
      const operationId = `test-operation-${index}`;
      slots.set(streamId, {
        streamId,
        operationId,
        attachedAt: now,
        lastActivityAt: now,
      });
      activeOperationStreams.set(operationId, {
        userId,
        streamId,
        operationId,
        attachedAt: now,
        lastActivityAt: now,
        touch: () => {
          const lease = activeOperationStreams.get(operationId);
          if (!lease) return;
          lease.lastActivityAt = Date.now();
        },
        terminate: () => {
          removeActiveUserStreamLease(userId, streamId);
          activeOperationStreams.delete(operationId);
        },
      });
    }
    activeUserStreams.set(userId, slots);
  },
  setStaleActiveUserStreams(
    userId: string,
    count: number,
    ageMs = STREAM_LEASE_STALE_AFTER_MS + 1
  ): void {
    const slots = new Map<string, ActiveUserStreamLease>();
    const timestamp = Date.now() - Math.max(0, ageMs);
    for (let index = 0; index < Math.max(0, count); index += 1) {
      const streamId = `stale-stream-${index}`;
      const operationId = `stale-operation-${index}`;
      slots.set(streamId, {
        streamId,
        operationId,
        attachedAt: timestamp,
        lastActivityAt: timestamp,
      });
      activeOperationStreams.set(operationId, {
        userId,
        streamId,
        operationId,
        attachedAt: timestamp,
        lastActivityAt: timestamp,
        touch: () => {
          const lease = activeOperationStreams.get(operationId);
          if (!lease) return;
          lease.lastActivityAt = timestamp;
        },
        terminate: () => {
          removeActiveUserStreamLease(userId, streamId);
          activeOperationStreams.delete(operationId);
        },
      });
    }
    activeUserStreams.set(userId, slots);
  },
  setActiveOperationStream(userId: string, operationId: string, streamId = 'test-stream-0'): void {
    setActiveUserStreamLease(userId, streamId, operationId);
    const activeLease = activeUserStreams.get(userId)?.get(streamId);
    const now = Date.now();

    activeOperationStreams.set(operationId, {
      userId,
      streamId,
      operationId,
      attachedAt: activeLease?.attachedAt ?? now,
      lastActivityAt: activeLease?.lastActivityAt ?? now,
      touch: () => {
        const lease = activeOperationStreams.get(operationId);
        if (!lease) return;
        lease.lastActivityAt = Date.now();
      },
      terminate: () => {
        removeActiveUserStreamLease(userId, streamId);
        activeOperationStreams.delete(operationId);
      },
    });
  },
  getActiveUserStreamCount(userId: string): number {
    return activeUserStreams.get(userId)?.size ?? 0;
  },
};
