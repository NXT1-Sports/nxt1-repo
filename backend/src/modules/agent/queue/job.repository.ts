/**
 * @fileoverview Agent Job Repository — Persistent State Store
 * @module @nxt1/backend/modules/agent/queue
 *
 * Maintains a Firestore document for every agent job so the Angular
 * frontend can subscribe to real-time updates via `onSnapshot`.
 *
 * Why Firestore (not just Redis)?
 * - Redis (BullMQ) is the engine — it manages the queue mechanics,
 *   retries, and worker coordination. It is ephemeral by nature.
 * - Firestore is the user-facing state — it gives the frontend a
 *   persistent, real-time document to bind to. Even if Redis is
 *   flushed or the server restarts, the job history stays.
 *
 * Collection: `AgentJobs/{operationId}`
 *
 * @example
 * ```ts
 * const repo = new AgentJobRepository();
 * await repo.create(payload);
 * await repo.updateProgress(operationId, progress);
 * await repo.markCompleted(operationId, result);
 * ```
 */

import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type {
  AgentJobPayload,
  AgentProgressMetadata,
  AgentProgressStage,
  AgentProgressStageType,
  AgentXToolStepIcon,
  AgentOperationStatus,
  AgentOperationResult,
  OperationOutcomeCode,
  AgentYieldState,
} from '@nxt1/core';
import { logger } from '../../../utils/logger.js';
import type { AgentJobProgress } from './queue.types.js';
import { trackAgentJobTerminalEvent } from '../services/ga4-agent-job.service.js';

// ─── Constants ──────────────────────────────────────────────────────────────

export const AGENT_JOBS_COLLECTION = 'AgentJobs' as const;
export const AGENT_WEEKLY_RECAP_JOBS_COLLECTION = 'AgentWeeklyRecapJobs' as const;
const EVENTS_SUBCOLLECTION = 'events' as const;
const JOB_EVENT_SCHEMA_VERSION = 2;
const ACTIVE_JOB_RETENTION_DAYS = 14;
const TERMINAL_JOB_RETENTION_DAYS = 30;
const FAILURE_ALERT_TERMINAL_STATUSES = new Set(['pending', 'sent']);
const LOCKED_FAILURE_STATUSES = new Set<AgentOperationStatus>(['completed', 'failed', 'cancelled']);
const LOCKED_PROGRESS_STATUSES = new Set<AgentOperationStatus>([
  'paused',
  'awaiting_input',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

function truncateForAlert(value: string, maxLength = 800): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function buildTerminalProgress(params: {
  status: AgentJobProgress['status'];
  message: string;
  outcomeCode?: OperationOutcomeCode;
}): AgentJobProgress {
  return {
    status: params.status,
    message: params.message,
    ...(params.outcomeCode ? { outcomeCode: params.outcomeCode } : {}),
    percent: 100,
    currentStep: 1,
    totalSteps: 1,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Job Event Types (Subcollection: AgentJobs/{operationId}/events) ────────

/**
 * Event types written to the `events` subcollection.
 * The frontend subscribes via `onSnapshot` to render live UI.
 *
 * - `step_active`  — A new step/tool has started executing
 * - `step_done`    — A step/tool completed successfully
 * - `step_error`   — A step/tool failed
 * - `delta`        — Debounced text chunk from the LLM stream
 * - `tool_call`    — LLM requested a tool invocation
 * - `tool_result`  — Tool execution produced a result
 * - `progress_stage` — High-level phase transition (context/planning/execution)
 * - `progress_subphase` — Granular status update inside a phase
 * - `metric`       — Structured numeric telemetry (latency/sample counters)
 * - `done`         — The entire job finished (success or failure)
 */
export type JobEventType =
  | 'step_active'
  | 'step_done'
  | 'step_error'
  | 'delta'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'progress_stage'
  | 'progress_subphase'
  | 'metric'
  | 'card'
  | 'title_updated'
  | 'operation'
  | 'done';

/**
 * A single event document stored in `AgentJobs/{operationId}/events/{autoId}`.
 * The frontend reads these via `onSnapshot`, ordered by `seq`, to reconstruct
 * the live agent execution as a chat-like experience.
 */
export interface JobEvent {
  /** Event contract schema version for backward-compatible parsing. */
  readonly schemaVersion?: number;
  /** Stable unique event identifier (matches Firestore event doc id). */
  readonly eventId?: string;
  /** Monotonically increasing sequence number (0-based). */
  readonly seq: number;
  /** ISO timestamp when backend emitted this event. */
  readonly emittedAt?: string;
  /** Owner's Firebase UID — stamped on write so Firestore rules can check without a parent doc get(). */
  readonly userId: string;
  /** What kind of event this is. */
  readonly type: JobEventType;
  /** Agent identifier if known (e.g. 'recruiting', 'performance'). */
  readonly agentId?: string;
  /** Stable logical step identity shared by live and replay rendering. */
  readonly stepId?: string;
  /** Stable backend-authored localization key paired with message text when available. */
  readonly messageKey?: string;
  /** Which execution layer emitted the event, when structured stages are available. */
  readonly stageType?: AgentProgressStageType;
  /** Typed machine-readable stage key for frontend dictionaries. */
  readonly stage?: AgentProgressStage;
  /** Structured outcome for notable or terminal states. */
  readonly outcomeCode?: OperationOutcomeCode;
  /** Additional typed hydration data for UI rendering. */
  readonly metadata?: AgentProgressMetadata;
  /** Human-readable message for the UI. */
  readonly message?: string;
  /** Accumulated LLM text for `delta` events. */
  readonly text?: string;
  /** Extended thinking text fragment for `thinking` events (Claude 3.7+ / Gemini 2.5). */
  readonly thinkingText?: string;
  /** Tool name for `tool_call` / `tool_result` events. */
  readonly toolName?: string;
  /** Tool arguments (JSON string) for `tool_call` events. */
  readonly toolArgs?: string;
  /** Tool result summary for `tool_result` events. */
  readonly toolResult?: Record<string, unknown>;
  /** Whether the tool_result was a success. */
  readonly toolSuccess?: boolean;
  /** Whether the job finished successfully (for `done` events). */
  readonly success?: boolean;
  /** Error message for `step_error` / `done` events. */
  readonly error?: string;
  /** Machine-readable backend error code for `step_error` / `done` events. */
  readonly errorCode?: string;
  /** Optional semantic icon key for custom step rendering. */
  readonly icon?: AgentXToolStepIcon;
  /** Rich card payload for `card` events (planner, data-table, etc.). */
  readonly cardData?: Record<string, unknown>;
  /** Updated thread title emitted by worker after auto-title generation. */
  readonly title?: string;
  /** Thread ID associated with operation/title events. */
  readonly threadId?: string;
  /** Canonical persisted assistant message ID for terminal done events. */
  readonly messageId?: string;
  /** Canonical operation status transitions for sidebar/session state. */
  readonly status?:
    | 'queued'
    | 'running'
    | 'paused'
    | 'awaiting_input'
    | 'awaiting_approval'
    | 'complete'
    | 'failed'
    | 'cancelled';
  /** Serialized yield context for awaiting_input / awaiting_approval transitions. */
  readonly yieldState?: AgentYieldState;
  /** Operation id for operation lifecycle events. */
  readonly operationId?: string;
  /** ISO timestamp for operation/title transitions. */
  readonly timestamp?: string;
  /** Server timestamp set by Firestore. */
  readonly createdAt: FirebaseFirestore.Timestamp;
  /** TTL field for Firestore automatic expiration. */
  readonly expiresAt?: FirebaseFirestore.Timestamp;
}

function ttlFromNow(days: number): FirebaseFirestore.Timestamp {
  const expiresAtMs = Date.now() + days * 24 * 60 * 60 * 1000;
  return Timestamp.fromMillis(expiresAtMs);
}

function isTerminalEventStatus(status: JobEvent['status'] | undefined): boolean {
  return status === 'complete' || status === 'failed' || status === 'cancelled';
}

function resolveEventRetentionDays(event: Pick<JobEvent, 'type' | 'status'>): number {
  if (event.type === 'done') {
    return TERMINAL_JOB_RETENTION_DAYS;
  }

  if (event.type === 'operation' && isTerminalEventStatus(event.status)) {
    return TERMINAL_JOB_RETENTION_DAYS;
  }

  return ACTIVE_JOB_RETENTION_DAYS;
}

/**
 * Recursively strip `undefined` values and convert non-plain-object types
 * to Firestore-safe primitives. Firestore rejects documents containing
 * `undefined` values or non-serializable nested entities (class instances,
 * Maps, Sets, etc.) with INVALID_ARGUMENT errors.
 *
 * Critical Firestore constraint handled here: **nested arrays are not
 * supported**. An array containing another array (e.g. `[[1,2],[3,4]]`)
 * is rejected with "invalid nested entity". MCP tool outputs (firecrawl,
 * scrapers) routinely produce such shapes, so we wrap inner arrays in a
 * `{ values: [...] }` object before writing.
 */
/**
 * Recursively walk a value and produce a Firestore-safe deep clone.
 *
 * Firestore-safe values: string, number (finite), boolean, null, plain object,
 * array of non-array primitives/objects.
 *
 * Strips: undefined, function, symbol, NaN/Infinity (→ null), class instances
 * (→ plain object of own enumerable props), Maps, Sets, BigInt (→ string).
 *
 * Wraps: nested arrays as `{ values: [...] }` (Firestore disallows array of arrays).
 */
function deepSanitize(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  // Hard depth cap — Firestore allows max 20 levels of nesting.
  if (depth > 18) return null;

  if (value === null || value === undefined) return null;

  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') return Number.isFinite(value as number) ? value : null;
  if (t === 'bigint') return (value as bigint).toString();
  if (t === 'function' || t === 'symbol') return null;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (seen.has(value)) return [];
    seen.add(value);
    return value.map((entry) => {
      const sanitized = deepSanitize(entry, seen, depth + 1);
      // Firestore disallows nested arrays — wrap any inner array in an object.
      return Array.isArray(sanitized) ? { values: sanitized } : sanitized;
    });
  }

  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) {
      const sk = String(k);
      const sv = deepSanitize(v, seen, depth + 1);
      if (sv !== undefined) out[sk] = sv;
    }
    return out;
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((v) => {
      const sanitized = deepSanitize(v, seen, depth + 1);
      return Array.isArray(sanitized) ? { values: sanitized } : sanitized;
    });
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return {};
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      // Firestore field names cannot be empty strings.
      const safeKey = k.length === 0 ? '_' : k;
      out[safeKey] = deepSanitize(v, seen, depth + 1);
    }
    return out;
  }

  return null;
}

export function sanitizeForFirestore<T>(value: T): T {
  if (value === null || value === undefined) return value;
  // Always run the recursive walker — JSON round-trip alone does NOT handle
  // nested arrays, which Firestore rejects with INVALID_ARGUMENT.
  return deepSanitize(value, new WeakSet()) as T;
}

/**
 * Diagnostic helper: produce a compact type/shape description of a value
 * so we can identify which path is causing a Firestore INVALID_ARGUMENT
 * without leaking PII or producing massive logs.
 */
function describeStructure(value: unknown, depth: number, maxDepth: number): unknown {
  if (depth > maxDepth) return '<truncated-depth>';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const t = typeof value;
  if (t !== 'object') return t;
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array[0]';
    const sampleTypes = new Set<string>();
    for (const entry of value.slice(0, 3)) {
      sampleTypes.add(
        Array.isArray(entry) ? 'NESTED_ARRAY' : entry === null ? 'null' : typeof entry
      );
    }
    return {
      __kind: 'array',
      length: value.length,
      sample: Array.from(sampleTypes),
      first: describeStructure(value[0], depth + 1, maxDepth),
    };
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).slice(0, 20)) {
    out[k] = describeStructure(obj[k], depth + 1, maxDepth);
  }
  return out;
}

// ─── Document Shape ─────────────────────────────────────────────────────────

export interface AgentJobDocument {
  readonly operationId: string;
  readonly userId: string;
  readonly replayPayload?: AgentJobPayload | null;
  readonly idempotencyKey?: string | null;
  readonly intent: string;
  readonly origin: string;
  /** BullMQ repeatable key (RecurringTasks doc id) for scheduled runs. */
  readonly recurringTaskKey?: string | null;
  readonly planId?: string | null;
  readonly planStatus?: string | null;
  readonly executionSource?: string | null;
  readonly resumedFromPlanId?: string | null;
  readonly status: AgentOperationStatus;
  readonly progress: AgentJobProgress | null;
  readonly result: AgentOperationResult | null;
  readonly error: string | null;
  readonly failureAlertStatus?: 'pending' | 'sent' | 'failed' | null;
  readonly failureAlertQueuedAt?: FirebaseFirestore.Timestamp | null;
  readonly failureAlertSentAt?: FirebaseFirestore.Timestamp | null;
  readonly failureAlertFailedAt?: FirebaseFirestore.Timestamp | null;
  readonly failureAlertError?: string | null;
  readonly failureSlackAlertStatus?: 'pending' | 'sent' | 'failed' | null;
  readonly failureSlackAlertQueuedAt?: FirebaseFirestore.Timestamp | null;
  readonly failureSlackAlertSentAt?: FirebaseFirestore.Timestamp | null;
  readonly failureSlackAlertFailedAt?: FirebaseFirestore.Timestamp | null;
  readonly failureSlackAlertError?: string | null;
  readonly autoResolveStatus?:
    | 'retry_claimed'
    | 'retry_enqueued'
    | 'resolved'
    | 'retry_failed'
    | 'skipped'
    | null;
  readonly autoResolveType?: string | null;
  readonly autoResolveAttempts?: number | null;
  readonly autoResolveLastAttemptAt?: FirebaseFirestore.Timestamp | null;
  readonly autoResolvedAt?: FirebaseFirestore.Timestamp | null;
  readonly autoResolveRerunOperationId?: string | null;
  readonly autoResolveError?: string | null;
  readonly autoResolutionEmailStatus?: 'sending' | 'sent' | 'failed' | 'skipped' | null;
  readonly autoResolutionEmailSentAt?: FirebaseFirestore.Timestamp | null;
  readonly autoResolutionEmailFailedAt?: FirebaseFirestore.Timestamp | null;
  readonly autoResolutionEmailError?: string | null;
  readonly autoRecoveryStartedEmailStatus?: 'sending' | 'sent' | 'failed' | 'skipped' | null;
  readonly autoRecoveryStartedEmailSentAt?: FirebaseFirestore.Timestamp | null;
  readonly autoRecoveryStartedEmailFailedAt?: FirebaseFirestore.Timestamp | null;
  readonly autoRecoveryStartedEmailError?: string | null;
  /** MongoDB thread ID linking this job to its Agent X conversation thread. */
  readonly threadId: string | null;
  /** Serialized yield state when the job is awaiting user input/approval. */
  readonly yieldState?: AgentYieldState | null;
  readonly createdAt: FirebaseFirestore.Timestamp;
  readonly updatedAt: FirebaseFirestore.Timestamp;
  readonly completedAt: FirebaseFirestore.Timestamp | null;
  /** Next event sequence to allocate (atomic counter for events subcollection). */
  readonly nextEventSeq?: number;
  /** TTL field for Firestore automatic expiration. */
  readonly expiresAt: FirebaseFirestore.Timestamp;
}

export interface AgentJobPage {
  readonly jobs: readonly AgentJobDocument[];
  readonly nextCreatedAt?: string;
  readonly hasMore: boolean;
}

type TerminalAnalyticsMetadata = {
  userId?: string | null;
  origin?: string | null;
  threadId?: string | null;
  intent?: string | null;
  autoResolveType?: string | null;
  autoResolveStatus?: string | null;
};

// ─── Repository ─────────────────────────────────────────────────────────────

export class AgentJobRepository {
  private readonly db: Firestore;
  private readonly collectionName: string;

  constructor(db?: Firestore, collectionName: string = AGENT_JOBS_COLLECTION) {
    this.db = db ?? getFirestore();
    this.collectionName = collectionName;
  }

  /**
   * Create a request-scoped repository that writes to a specific Firestore.
   * Used by route handlers to target staging vs production Firestore.
   */
  withDb(db: Firestore): AgentJobRepository {
    return new AgentJobRepository(db, this.collectionName);
  }

  withCollection(collectionName: string): AgentJobRepository {
    return new AgentJobRepository(this.db, collectionName);
  }

  private collectionRef(): FirebaseFirestore.CollectionReference {
    return this.db.collection(this.collectionName);
  }

  private jobRef(operationId: string): FirebaseFirestore.DocumentReference {
    return this.collectionRef().doc(operationId);
  }

  private buildEventWritePayload(
    operationId: string,
    eventId: string,
    event: Omit<JobEvent, 'createdAt'>
  ): Record<string, unknown> {
    return {
      schemaVersion: JOB_EVENT_SCHEMA_VERSION,
      eventId,
      emittedAt: new Date().toISOString(),
      operationId: event.operationId ?? operationId,
      ...event,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: ttlFromNow(resolveEventRetentionDays(event)),
    };
  }

  private async syncEventExpiryForRetentionDays(
    operationId: string,
    retentionDays: number
  ): Promise<void> {
    const parentRef = this.jobRef(operationId);
    const snapshot = await parentRef.collection(EVENTS_SUBCOLLECTION).orderBy('seq', 'asc').get();

    if (snapshot.docs.length === 0) {
      return;
    }

    const expiresAt = ttlFromNow(retentionDays);
    const chunkSize = 100;

    for (let index = 0; index < snapshot.docs.length; index += chunkSize) {
      const chunk = snapshot.docs.slice(index, index + chunkSize);
      await Promise.all(
        chunk.map(async (doc) => {
          const eventId = doc.get('eventId');
          if (typeof eventId !== 'string' || eventId.trim().length === 0) {
            return;
          }

          await parentRef
            .collection(EVENTS_SUBCOLLECTION)
            .doc(eventId)
            .set({ expiresAt }, { merge: true });
        })
      );
    }
  }

  private buildInitialJobData(payload: AgentJobPayload): Record<string, unknown> {
    const replayPayload = sanitizeForFirestore(payload);

    return {
      operationId: payload.operationId,
      userId: payload.userId,
      replayPayload,
      idempotencyKey: (payload.context?.['idempotencyKey'] as string) ?? null,
      intent: payload.displayIntent ?? payload.intent,
      origin: payload.origin,
      recurringTaskKey: (payload.context?.['recurringTaskKey'] as string) ?? null,
      planId: (payload.context?.['planId'] as string) ?? null,
      planStatus: (payload.context?.['planStatus'] as string) ?? null,
      executionSource: (payload.context?.['executionSource'] as string) ?? null,
      resumedFromPlanId: (payload.context?.['resumedFromPlanId'] as string) ?? null,
      status: 'queued' satisfies AgentOperationStatus,
      progress: null,
      result: null,
      error: null,
      threadId: (payload.context?.['threadId'] as string) ?? null,
      nextEventSeq: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: null,
      expiresAt: ttlFromNow(ACTIVE_JOB_RETENTION_DAYS),
    };
  }

  /**
   * Create a new job document when a job is enqueued.
   * The frontend can immediately start listening to this document.
   */
  async create(payload: AgentJobPayload): Promise<void> {
    await this.jobRef(payload.operationId).set(this.buildInitialJobData(payload));
  }

  /**
   * Create a job document only when the operationId has not been claimed yet.
   * This is used by idempotent enqueue routes where duplicate client requests
   * intentionally resolve to the same operation document.
   */
  async createIfAbsent(payload: AgentJobPayload): Promise<boolean> {
    const ref = this.jobRef(payload.operationId);

    return this.db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (snap.exists) return false;

      txn.set(ref, this.buildInitialJobData(payload));
      return true;
    });
  }

  /**
   * Update the progress fields while the worker is processing.
   * Called by the AgentWorker's onUpdate callback.
   */
  async updateProgress(operationId: string, progress: AgentJobProgress): Promise<void> {
    const jobRef = this.jobRef(operationId);

    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(jobRef);
      if (!snapshot.exists) {
        return;
      }

      const currentStatus = snapshot.get('status');
      if (
        typeof currentStatus === 'string' &&
        LOCKED_PROGRESS_STATUSES.has(currentStatus as AgentOperationStatus)
      ) {
        return;
      }

      tx.update(jobRef, {
        status: progress.status,
        progress,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  /**
   * Mark the job as completed and store the final result.
   */
  async markCompleted(operationId: string, result: AgentOperationResult): Promise<void> {
    const progress = buildTerminalProgress({
      status: 'completed',
      message:
        typeof result.summary === 'string' && result.summary.trim().length > 0
          ? result.summary
          : 'Operation completed.',
      outcomeCode: 'success_default',
    });

    // Sanitize before write: strip `undefined` values and non-serializable
    // nested objects that cause Firestore INVALID_ARGUMENT errors.
    const safeResult = sanitizeForFirestore({
      ...result,
      success: true,
    });
    const snapshot = await this.jobRef(operationId).get();
    const currentData = snapshot.data() as Partial<AgentJobDocument> | undefined;
    const shouldTrackCompletion = currentData?.status !== 'completed';

    try {
      await this.jobRef(operationId).update({
        status: 'completed' satisfies AgentOperationStatus,
        error: null,
        result: safeResult,
        progress,
        yieldState: null,
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        expiresAt: ttlFromNow(TERMINAL_JOB_RETENTION_DAYS),
      });
    } catch (err) {
      // Diagnostic: dump the structure of the offending payload so we can
      // pinpoint which field shape is being rejected by Firestore.
      logger.error('markCompleted Firestore update failed — dumping payload structure', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
        resultStructure: describeStructure(safeResult, 0, 4),
      });
      throw err;
    }

    await this.syncEventExpiryForRetentionDays(operationId, TERMINAL_JOB_RETENTION_DAYS).catch(
      (err: unknown) => {
        logger.error('[AgentJobs] Failed to sync event TTL after completion', {
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    );

    if (shouldTrackCompletion) {
      await trackAgentJobTerminalEvent({
        operationId,
        status: 'completed',
        userId: currentData?.userId ?? null,
        origin: currentData?.origin ?? null,
        threadId: currentData?.threadId ?? null,
        intent: currentData?.intent ?? null,
        autoResolveType: currentData?.autoResolveType ?? null,
        autoResolveStatus: currentData?.autoResolveStatus ?? null,
        summary: typeof result.summary === 'string' ? result.summary : null,
      });
    }
  }

  /**
   * Mark the job as failed and store the error message.
   */
  async markFailed(operationId: string, error: string): Promise<void> {
    const progress = buildTerminalProgress({
      status: 'failed',
      message: error,
      outcomeCode: 'task_failed',
    });

    const jobRef = this.jobRef(operationId);
    let alertInput: {
      operationId: string;
      userId?: string | null;
      origin?: string | null;
      threadId?: string | null;
      intent?: string | null;
      replayPayload?: AgentJobPayload | null;
      error: string;
      createdAt?: unknown;
      failedAt: Date;
    } | null = null;

    const shouldQueueAlert = process.env['NODE_ENV'] !== 'test';
    let shouldTrackFailure = false;
    let analyticsInput: TerminalAnalyticsMetadata | null = null;

    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(jobRef);
      if (!snapshot.exists) {
        return;
      }

      const currentStatus = snapshot.get('status');
      if (
        typeof currentStatus === 'string' &&
        LOCKED_FAILURE_STATUSES.has(currentStatus as AgentOperationStatus)
      ) {
        return;
      }

      shouldTrackFailure = true;
      const data = snapshot.data() as Partial<AgentJobDocument> | undefined;
      analyticsInput = {
        userId: data?.userId ?? null,
        origin: data?.origin ?? null,
        threadId: data?.threadId ?? null,
        intent: data?.intent ?? null,
        autoResolveType: data?.autoResolveType ?? null,
        autoResolveStatus: data?.autoResolveStatus ?? null,
      };

      const existingAlertStatus = snapshot.exists ? snapshot.get('failureAlertStatus') : null;
      const shouldSetAlertPending =
        shouldQueueAlert &&
        !FAILURE_ALERT_TERMINAL_STATUSES.has(
          typeof existingAlertStatus === 'string' ? existingAlertStatus : ''
        );

      const update: Record<string, unknown> = {
        status: 'failed' satisfies AgentOperationStatus,
        error,
        progress,
        yieldState: null,
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        expiresAt: ttlFromNow(TERMINAL_JOB_RETENTION_DAYS),
      };

      if (shouldSetAlertPending) {
        update['failureAlertStatus'] = 'pending';
        update['failureAlertQueuedAt'] = FieldValue.serverTimestamp();
        update['failureAlertError'] = null;
        update['failureSlackAlertStatus'] = 'pending';
        update['failureSlackAlertQueuedAt'] = FieldValue.serverTimestamp();
        update['failureSlackAlertError'] = null;

        alertInput = {
          operationId,
          userId: data?.userId ?? null,
          origin: data?.origin ?? null,
          threadId: data?.threadId ?? null,
          intent: data?.intent ?? null,
          replayPayload: data?.replayPayload ?? null,
          error,
          createdAt: data?.createdAt,
          failedAt: new Date(),
        };
      }

      tx.update(jobRef, update);
    });

    await this.syncEventExpiryForRetentionDays(operationId, TERMINAL_JOB_RETENTION_DAYS).catch(
      (err: unknown) => {
        logger.error('[AgentJobs] Failed to sync event TTL after failure', {
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    );

    if (shouldTrackFailure) {
      const terminalAnalyticsInput =
        analyticsInput ??
        ({
          userId: null,
          origin: null,
          threadId: null,
          intent: null,
          autoResolveType: null,
          autoResolveStatus: null,
        } satisfies TerminalAnalyticsMetadata);

      await trackAgentJobTerminalEvent({
        operationId,
        status: 'failed',
        userId: terminalAnalyticsInput.userId ?? null,
        origin: terminalAnalyticsInput.origin ?? null,
        threadId: terminalAnalyticsInput.threadId ?? null,
        intent: terminalAnalyticsInput.intent ?? null,
        autoResolveType: terminalAnalyticsInput.autoResolveType ?? null,
        autoResolveStatus: terminalAnalyticsInput.autoResolveStatus ?? null,
        error,
      });
    }

    if (alertInput) {
      await this.dispatchFailureAlert(alertInput);
      await this.dispatchRecoveryStartedEmail(alertInput);
    }
  }

  private async dispatchRecoveryStartedEmail(input: {
    operationId: string;
    userId?: string | null;
    origin?: string | null;
    intent?: string | null;
    replayPayload?: AgentJobPayload | null;
    error: string;
  }): Promise<void> {
    if (!input.userId) return;

    const {
      classifyAgentJobAutoResolveType,
      shouldAutoRetryAgentJob,
      shouldSendAgentJobCustomerRecoveryEmail,
    } = await import('../services/agent-job-auto-resolver.service.js');
    const { isAgentJobCustomerRecoveryEmailEnabled, sendAgentJobRecoveryStartedEmail } =
      await import('../../../services/communications/agent-jobs/email/agent-job-recovery-started-email.service.js');

    if (!isAgentJobCustomerRecoveryEmailEnabled()) return;
    const autoResolveType = classifyAgentJobAutoResolveType(input.error);
    if (!autoResolveType) return;

    if (!shouldAutoRetryAgentJob({ replayPayload: input.replayPayload ?? null }, autoResolveType)) {
      return;
    }

    if (
      !shouldSendAgentJobCustomerRecoveryEmail({
        origin: input.origin ?? 'user',
        replayPayload: input.replayPayload ?? null,
      })
    ) {
      await this.jobRef(input.operationId).set(
        {
          autoRecoveryStartedEmailStatus: 'skipped',
          autoRecoveryStartedEmailError: 'suppressed_by_policy',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return;
    }

    const jobRef = this.jobRef(input.operationId);
    const claimed = await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(jobRef);
      if (!snapshot.exists) return false;

      const currentStatus = snapshot.get('autoRecoveryStartedEmailStatus');
      if (currentStatus === 'sent' || currentStatus === 'sending') return false;

      tx.set(
        jobRef,
        {
          autoRecoveryStartedEmailStatus: 'sending',
          autoRecoveryStartedEmailError: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return true;
    });

    if (!claimed) return;

    try {
      const result = await sendAgentJobRecoveryStartedEmail({
        db: this.db,
        userId: input.userId,
        operationId: input.operationId,
        intent: input.intent,
      });

      await jobRef.set(
        {
          autoRecoveryStartedEmailStatus: result === 'sent' ? 'sent' : 'skipped',
          ...(result === 'sent'
            ? { autoRecoveryStartedEmailSentAt: FieldValue.serverTimestamp() }
            : { autoRecoveryStartedEmailError: result }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AgentJobs] Recovery-started customer email failed', {
        operationId: input.operationId,
        error: message,
      });

      await jobRef
        .set(
          {
            autoRecoveryStartedEmailStatus: 'failed',
            autoRecoveryStartedEmailFailedAt: FieldValue.serverTimestamp(),
            autoRecoveryStartedEmailError: message,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch((statusErr: unknown) => {
          logger.error('[AgentJobs] Failed to persist recovery-started email error status', {
            operationId: input.operationId,
            error: statusErr instanceof Error ? statusErr.message : String(statusErr),
          });
        });
    }
  }

  private async dispatchFailureAlert(input: {
    operationId: string;
    userId?: string | null;
    origin?: string | null;
    threadId?: string | null;
    intent?: string | null;
    error: string;
    createdAt?: unknown;
    failedAt: Date;
  }): Promise<void> {
    const jobRef = this.jobRef(input.operationId);
    let emailError: string | null = null;

    try {
      const { sendAgentJobFailureAlert } =
        await import('../../../services/communications/agent-jobs/email/agent-job-failure-alert.service.js');

      await sendAgentJobFailureAlert(input);
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      logger.error('[AgentJobs] Failure alert email failed', {
        operationId: input.operationId,
        error: emailError,
      });
    }

    await this.dispatchFailureSlackAlert(input);

    if (!emailError) {
      await jobRef
        .set(
          {
            failureAlertStatus: 'sent',
            failureAlertSentAt: FieldValue.serverTimestamp(),
            failureAlertError: null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch((statusErr: unknown) => {
          logger.error('[AgentJobs] Failed to persist failure alert sent status', {
            operationId: input.operationId,
            error: statusErr instanceof Error ? statusErr.message : String(statusErr),
          });
        });

      return;
    }

    await jobRef
      .set(
        {
          failureAlertStatus: 'failed',
          failureAlertFailedAt: FieldValue.serverTimestamp(),
          failureAlertError: emailError,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch((statusErr: unknown) => {
        logger.error('[AgentJobs] Failed to persist failure alert error status', {
          operationId: input.operationId,
          error: statusErr instanceof Error ? statusErr.message : String(statusErr),
        });
      });
  }

  private async dispatchFailureSlackAlert(input: {
    operationId: string;
    userId?: string | null;
    origin?: string | null;
    threadId?: string | null;
    intent?: string | null;
    error: string;
  }): Promise<void> {
    const jobRef = this.jobRef(input.operationId);

    try {
      const { sendSlackAlert } = await import('../../../services/platform/alert.service.js');
      const delivered = await sendSlackAlert({
        target: 'agent',
        severity: 'critical',
        title: 'Agent X Job Failed',
        summary: 'An Agent X background job has failed and needs review.',
        fields: [
          { label: 'Operation ID', value: input.operationId },
          { label: 'User ID', value: input.userId || 'unknown' },
          { label: 'Origin', value: input.origin || 'unknown' },
          { label: 'Thread ID', value: input.threadId || 'not linked' },
          { label: 'Error', value: truncateForAlert(input.error) },
          ...(input.intent
            ? [{ label: 'Intent', value: truncateForAlert(input.intent, 900) }]
            : []),
        ],
      });

      await jobRef
        .set(
          {
            failureSlackAlertStatus: delivered ? 'sent' : 'failed',
            ...(delivered
              ? { failureSlackAlertSentAt: FieldValue.serverTimestamp() }
              : { failureSlackAlertFailedAt: FieldValue.serverTimestamp() }),
            failureSlackAlertError: delivered
              ? null
              : 'Slack webhook delivery failed or is not configured.',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch((statusErr: unknown) => {
          logger.error('[AgentJobs] Failed to persist Slack failure alert status', {
            operationId: input.operationId,
            error: statusErr instanceof Error ? statusErr.message : String(statusErr),
          });
        });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AgentJobs] Failure alert Slack dispatch failed', {
        operationId: input.operationId,
        error: message,
      });

      await jobRef
        .set(
          {
            failureSlackAlertStatus: 'failed',
            failureSlackAlertFailedAt: FieldValue.serverTimestamp(),
            failureSlackAlertError: message,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch((statusErr: unknown) => {
          logger.error('[AgentJobs] Failed to persist Slack failure alert error status', {
            operationId: input.operationId,
            error: statusErr instanceof Error ? statusErr.message : String(statusErr),
          });
        });
    }
  }

  /**
   * Mark the job as yielded (awaiting user input or approval).
   * Stores the serialized yield state so the resume route can reconstruct the agent.
   */
  async markYielded(operationId: string, yieldState: AgentYieldState): Promise<void> {
    const safeYieldState = sanitizeForFirestore(yieldState);
    await this.jobRef(operationId).update({
      status:
        yieldState.reason === 'needs_approval'
          ? ('awaiting_approval' satisfies AgentOperationStatus)
          : ('awaiting_input' satisfies AgentOperationStatus),
      yieldState: safeYieldState,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: ttlFromNow(ACTIVE_JOB_RETENTION_DAYS),
    });
  }

  /**
   * Mark the job as explicitly paused (resumable).
   *
   * Unlike generic yielded state, this preserves an explicit paused lifecycle
   * status for UI contracts while still storing the same yield context needed
   * by the resume route.
   */
  async markPaused(operationId: string, yieldState: AgentYieldState): Promise<void> {
    await this.jobRef(operationId).update({
      status: 'paused' satisfies AgentOperationStatus,
      yieldState: sanitizeForFirestore(yieldState),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: ttlFromNow(ACTIVE_JOB_RETENTION_DAYS),
    });
  }

  /**
   * Mark the job as cancelled.
   */
  async markCancelled(
    operationId: string,
    options?: {
      message?: string;
    }
  ): Promise<void> {
    const progress = buildTerminalProgress({
      status: 'cancelled',
      message: options?.message ?? 'Operation cancelled by user.',
    });

    await this.jobRef(operationId).update({
      status: 'cancelled' satisfies AgentOperationStatus,
      progress,
      yieldState: null,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      expiresAt: ttlFromNow(TERMINAL_JOB_RETENTION_DAYS),
    });

    await this.syncEventExpiryForRetentionDays(operationId, TERMINAL_JOB_RETENTION_DAYS).catch(
      (err: unknown) => {
        logger.error('[AgentJobs] Failed to sync event TTL after cancellation', {
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    );
  }

  /**
   * Mark that the live viewer disconnected while the operation continues.
   * This is observability metadata only; it does not change operation status.
   */
  async markDetached(operationId: string): Promise<void> {
    await this.jobRef(operationId).set(
      {
        viewerDetachedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  /**
   * Patch a subset of context fields onto an existing job document.
   * Used for best-effort updates that happen after the job is already enqueued
   * (e.g. stitching in a `threadId` that was created asynchronously).
   *
   * Only merges the keys present in `patch` — never overwrites the full document.
   */
  async patchContext(operationId: string, patch: Record<string, unknown>): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    // Flatten into top-level dotted paths that Firestore's merge-update understands.
    // e.g. { threadId: 'abc' } → updates the top-level `threadId` field directly.
    for (const [key, value] of Object.entries(patch)) {
      update[key] = value;
    }

    await this.jobRef(operationId).update(update);
  }

  /**
   * Get all jobs for a specific user (most recent first).
   * Used by the "Agent X command center" to show job history.
   */
  async getByUser(userId: string, limit = 20): Promise<AgentJobDocument[]> {
    const snapshot = await this.collectionRef()
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AgentJobDocument);
  }

  async getByUserPage(userId: string, limit = 20, beforeCreatedAt?: string): Promise<AgentJobPage> {
    const pageLimit = Math.max(1, Math.min(limit, 200));
    let query = this.collectionRef().where('userId', '==', userId).orderBy('createdAt', 'desc');

    if (beforeCreatedAt) {
      const cursorDate = new Date(beforeCreatedAt);
      if (!Number.isNaN(cursorDate.getTime())) {
        query = query.startAfter(Timestamp.fromDate(cursorDate));
      }
    }

    const snapshot = await query.limit(pageLimit + 1).get();
    const docs = snapshot.docs.map((doc) => doc.data() as AgentJobDocument);
    const hasMore = docs.length > pageLimit;
    const jobs = hasMore ? docs.slice(0, pageLimit) : docs;
    const lastJob = jobs[jobs.length - 1];
    const nextCreatedAt = hasMore ? this.toCursorIso(lastJob?.createdAt) : undefined;

    return {
      jobs,
      ...(nextCreatedAt ? { nextCreatedAt } : {}),
      hasMore,
    };
  }

  private toCursorIso(value: unknown): string | undefined {
    if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }

    return undefined;
  }

  /**
   * Aggregate execution stats for a recurring schedule key.
   * Used by list_recurring_tasks so Agent X can answer run-count questions.
   */
  async getExecutionSummaryByScheduleKey(
    userId: string,
    recurringTaskKey: string
  ): Promise<{
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastRunAt: string | null;
    lastRunStatus: 'completed' | 'failed' | null;
  }> {
    if (!userId.trim() || !recurringTaskKey.trim()) {
      return {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRunAt: null,
        lastRunStatus: null,
      };
    }

    const snapshot = await this.collectionRef()
      .where('userId', '==', userId)
      .where('recurringTaskKey', '==', recurringTaskKey)
      .get();

    let successfulRuns = 0;
    let failedRuns = 0;
    let latestMs = 0;
    let lastRunAt: string | null = null;
    let lastRunStatus: 'completed' | 'failed' | null = null;

    for (const doc of snapshot.docs) {
      const data = doc.data() as AgentJobDocument;
      if (data.status === 'completed') successfulRuns += 1;
      if (data.status === 'failed') failedRuns += 1;

      const createdAtMs = data.createdAt?.toMillis?.() ?? 0;
      if (createdAtMs > latestMs) {
        latestMs = createdAtMs;
        lastRunAt = new Date(createdAtMs).toISOString();
        lastRunStatus =
          data.status === 'completed' || data.status === 'failed' ? data.status : null;
      }
    }

    return {
      totalRuns: snapshot.size,
      successfulRuns,
      failedRuns,
      lastRunAt,
      lastRunStatus,
    };
  }

  /**
   * Get a single job document by operationId.
   */
  async getById(operationId: string): Promise<AgentJobDocument | null> {
    const doc = await this.jobRef(operationId).get();

    return doc.exists ? (doc.data() as AgentJobDocument) : null;
  }

  /**
   * Find any in-flight operations for the given thread. Used by the
   * concurrency-policy guard when a user sends a new message while a prior
   * op is still running, awaiting approval, or awaiting input. Excludes
   * terminal states (completed, failed, cancelled).
   *
   * Sorted oldest-first so callers see the chronological progression.
   *
   * Requires a Firestore composite index on (threadId asc, status asc).
   */
  async findActiveByThread(threadId: string): Promise<AgentJobDocument[]> {
    if (!threadId) return [];
    const ACTIVE: readonly AgentOperationStatus[] = [
      'queued',
      'thinking',
      'acting',
      'paused',
      'awaiting_approval',
      'awaiting_input',
      'streaming_result',
    ];
    const snapshot = await this.collectionRef()
      .where('threadId', '==', threadId)
      .where('status', 'in', ACTIVE as AgentOperationStatus[])
      .get();
    return snapshot.docs
      .map((d) => d.data() as AgentJobDocument)
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return aMs - bMs;
      });
  }

  /**
   * Find active weekly playbook generations for a user.
   * Used by the playbook enqueue route to reattach client retries instead of
   * creating duplicate billable operations while an earlier generation is still running.
   */
  async findActivePlaybookByUser(userId: string): Promise<AgentJobDocument[]> {
    if (!userId) return [];
    const ACTIVE: readonly AgentOperationStatus[] = [
      'queued',
      'thinking',
      'acting',
      'paused',
      'awaiting_approval',
      'awaiting_input',
      'streaming_result',
    ];

    const snapshot = await this.collectionRef()
      .where('userId', '==', userId)
      .where('status', 'in', ACTIVE as AgentOperationStatus[])
      .get();

    return snapshot.docs
      .map((d) => d.data() as AgentJobDocument)
      .filter((job) => {
        const mode = job.replayPayload?.context?.['mode'];
        return mode === 'playbook' || job.intent === 'Generate weekly playbook';
      })
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
  }

  /**
   * Find an existing operation for a given user and idempotency key.
   * Used to deduplicate client retries.
   */
  async getByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<AgentJobDocument | null> {
    const snapshot = await this.collectionRef()
      .where('userId', '==', userId)
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0]?.data() as AgentJobDocument;
  }

  // ─── Event Subcollection (Real-Time Streaming) ──────────────────────────

  /**
   * Append a single event to the `events` subcollection.
   * The frontend listens to this subcollection via `onSnapshot` to render
   * live step-by-step updates without holding open an SSE connection.
   *
   * Uses auto-generated document IDs — ordering is guaranteed by the `seq` field.
   */
  async writeJobEvent(operationId: string, event: Omit<JobEvent, 'createdAt'>): Promise<void> {
    const parentRef = this.jobRef(operationId);
    const eventRef = parentRef.collection(EVENTS_SUBCOLLECTION).doc();

    await parentRef
      .collection(EVENTS_SUBCOLLECTION)
      .doc(eventRef.id)
      .set(this.buildEventWritePayload(operationId, eventRef.id, event));
  }

  /**
   * Reserve a contiguous range of event sequence numbers atomically.
   *
   * Returns the first reserved sequence. Callers can use
   * `[start, start + 1, ...]` for multi-event writes that must preserve order.
   */
  async allocateEventSeqRange(operationId: string, count = 1): Promise<number> {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error('allocateEventSeqRange count must be a positive integer');
    }

    const parentRef = this.jobRef(operationId);

    return this.db.runTransaction(async (txn) => {
      const parentSnap = await txn.get(parentRef);
      if (!parentSnap.exists) {
        throw new Error(`Operation ${operationId} not found`);
      }

      const currentRaw = parentSnap.get('nextEventSeq');
      let currentSeq =
        typeof currentRaw === 'number' && Number.isFinite(currentRaw)
          ? Math.max(0, Math.floor(currentRaw))
          : 0;

      // Backward compatibility for operations created before nextEventSeq existed.
      if (typeof currentRaw !== 'number') {
        const latestEventQuery = parentRef
          .collection(EVENTS_SUBCOLLECTION)
          .orderBy('seq', 'desc')
          .limit(1);
        const latestEventSnap = await txn.get(latestEventQuery);
        const latestDoc = latestEventSnap.docs[0];
        const latestSeq = latestDoc ? latestDoc.get('seq') : -1;
        if (typeof latestSeq === 'number' && Number.isFinite(latestSeq)) {
          currentSeq = Math.max(currentSeq, Math.floor(latestSeq) + 1);
        }
      }

      txn.update(parentRef, {
        nextEventSeq: currentSeq + count,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return currentSeq;
    });
  }

  /**
   * Atomically allocate and persist a single event sequence number.
   *
   * Returns the persisted sequence so callers can forward it to live transports.
   */
  async writeJobEventWithAutoSeq(
    operationId: string,
    event: Omit<JobEvent, 'createdAt' | 'seq'>
  ): Promise<number> {
    const parentRef = this.jobRef(operationId);

    return this.db.runTransaction(async (txn) => {
      const parentSnap = await txn.get(parentRef);
      if (!parentSnap.exists) {
        throw new Error(`Operation ${operationId} not found`);
      }

      const currentRaw = parentSnap.get('nextEventSeq');
      let nextSeq =
        typeof currentRaw === 'number' && Number.isFinite(currentRaw)
          ? Math.max(0, Math.floor(currentRaw))
          : 0;

      if (typeof currentRaw !== 'number') {
        const latestEventQuery = parentRef
          .collection(EVENTS_SUBCOLLECTION)
          .orderBy('seq', 'desc')
          .limit(1);
        const latestEventSnap = await txn.get(latestEventQuery);
        const latestDoc = latestEventSnap.docs[0];
        const latestSeq = latestDoc ? latestDoc.get('seq') : -1;
        if (typeof latestSeq === 'number' && Number.isFinite(latestSeq)) {
          nextSeq = Math.max(nextSeq, Math.floor(latestSeq) + 1);
        }
      }

      const eventRef = parentRef.collection(EVENTS_SUBCOLLECTION).doc();
      txn.set(
        eventRef,
        this.buildEventWritePayload(operationId, eventRef.id, {
          ...event,
          seq: nextSeq,
        })
      );
      txn.update(parentRef, {
        nextEventSeq: nextSeq + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return nextSeq;
    });
  }

  /**
   * Batch-write multiple events in a single Firestore commit.
   * Used by the debounced writer to flush accumulated deltas efficiently.
   */
  async writeJobEventBatch(
    operationId: string,
    events: ReadonlyArray<Omit<JobEvent, 'createdAt'>>
  ): Promise<void> {
    if (events.length === 0) return;

    const batch = this.db.batch();
    const parentRef = this.jobRef(operationId);

    for (const event of events) {
      const docRef = parentRef.collection(EVENTS_SUBCOLLECTION).doc();
      batch.set(docRef, this.buildEventWritePayload(operationId, docRef.id, event));
    }

    await batch.commit();
  }

  /**
   * Read all events for a job, ordered by sequence number.
   * Used for replay when the frontend reconnects mid-job.
   */
  async getJobEvents(operationId: string): Promise<JobEvent[]> {
    const snapshot = await this.jobRef(operationId)
      .collection(EVENTS_SUBCOLLECTION)
      .orderBy('seq', 'asc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as JobEvent);
  }
}
