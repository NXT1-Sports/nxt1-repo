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

// ─── Constants ──────────────────────────────────────────────────────────────

const COLLECTION = 'AgentJobs' as const;
const EVENTS_SUBCOLLECTION = 'events' as const;
const JOB_EVENT_SCHEMA_VERSION = 2;
const ACTIVE_JOB_RETENTION_DAYS = 14;
const TERMINAL_JOB_RETENTION_DAYS = 30;
const LOCKED_PROGRESS_STATUSES = new Set<AgentOperationStatus>([
  'paused',
  'awaiting_input',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

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
}

function ttlFromNow(days: number): FirebaseFirestore.Timestamp {
  const expiresAtMs = Date.now() + days * 24 * 60 * 60 * 1000;
  return Timestamp.fromMillis(expiresAtMs);
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

function sanitizeForFirestore<T>(value: T): T {
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
  readonly idempotencyKey?: string | null;
  readonly intent: string;
  readonly origin: string;
  readonly status: AgentOperationStatus;
  readonly progress: AgentJobProgress | null;
  readonly result: AgentOperationResult | null;
  readonly error: string | null;
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

// ─── Repository ─────────────────────────────────────────────────────────────

export class AgentJobRepository {
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestore();
  }

  /**
   * Create a request-scoped repository that writes to a specific Firestore.
   * Used by route handlers to target staging vs production Firestore.
   */
  withDb(db: Firestore): AgentJobRepository {
    return new AgentJobRepository(db);
  }

  /**
   * Create a new job document when a job is enqueued.
   * The frontend can immediately start listening to this document.
   */
  async create(payload: AgentJobPayload): Promise<void> {
    await this.db
      .collection(COLLECTION)
      .doc(payload.operationId)
      .set({
        operationId: payload.operationId,
        userId: payload.userId,
        idempotencyKey: (payload.context?.['idempotencyKey'] as string) ?? null,
        intent: payload.displayIntent ?? payload.intent,
        origin: payload.origin,
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
      });
  }

  /**
   * Update the progress fields while the worker is processing.
   * Called by the AgentWorker's onUpdate callback.
   */
  async updateProgress(operationId: string, progress: AgentJobProgress): Promise<void> {
    const jobRef = this.db.collection(COLLECTION).doc(operationId);

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
    const safeResult = sanitizeForFirestore(result);

    try {
      await this.db
        .collection(COLLECTION)
        .doc(operationId)
        .update({
          status: 'completed' satisfies AgentOperationStatus,
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

    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .update({
        status: 'failed' satisfies AgentOperationStatus,
        error,
        progress,
        yieldState: null,
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        expiresAt: ttlFromNow(TERMINAL_JOB_RETENTION_DAYS),
      });
  }

  /**
   * Mark the job as yielded (awaiting user input or approval).
   * Stores the serialized yield state so the resume route can reconstruct the agent.
   */
  async markYielded(operationId: string, yieldState: AgentYieldState): Promise<void> {
    const safeYieldState = sanitizeForFirestore(yieldState);
    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .update({
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
    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .update({
        status: 'paused' satisfies AgentOperationStatus,
        yieldState: sanitizeForFirestore(yieldState),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: ttlFromNow(ACTIVE_JOB_RETENTION_DAYS),
      });
  }

  /**
   * Mark the job as cancelled (user-initiated).
   */
  async markCancelled(operationId: string): Promise<void> {
    const progress = buildTerminalProgress({
      status: 'cancelled',
      message: 'Operation cancelled by user.',
    });

    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .update({
        status: 'cancelled' satisfies AgentOperationStatus,
        progress,
        yieldState: null,
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        expiresAt: ttlFromNow(TERMINAL_JOB_RETENTION_DAYS),
      });
  }

  /**
   * Mark that the live viewer disconnected while the operation continues.
   * This is observability metadata only; it does not change operation status.
   */
  async markDetached(operationId: string): Promise<void> {
    await this.db.collection(COLLECTION).doc(operationId).set(
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

    await this.db.collection(COLLECTION).doc(operationId).update(update);
  }

  /**
   * Get all jobs for a specific user (most recent first).
   * Used by the "Agent X command center" to show job history.
   */
  async getByUser(userId: string, limit = 20): Promise<AgentJobDocument[]> {
    const snapshot = await this.db
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AgentJobDocument);
  }

  /**
   * Get a single job document by operationId.
   */
  async getById(operationId: string): Promise<AgentJobDocument | null> {
    const doc = await this.db.collection(COLLECTION).doc(operationId).get();

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
    const snapshot = await this.db
      .collection(COLLECTION)
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
   * Find an existing operation for a given user and idempotency key.
   * Used to deduplicate client retries.
   */
  async getByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<AgentJobDocument | null> {
    const snapshot = await this.db
      .collection(COLLECTION)
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
    const eventRef = this.db
      .collection(COLLECTION)
      .doc(operationId)
      .collection(EVENTS_SUBCOLLECTION)
      .doc();

    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .collection(EVENTS_SUBCOLLECTION)
      .doc(eventRef.id)
      .set({
        schemaVersion: JOB_EVENT_SCHEMA_VERSION,
        eventId: eventRef.id,
        emittedAt: new Date().toISOString(),
        operationId: event.operationId ?? operationId,
        ...event,
        createdAt: FieldValue.serverTimestamp(),
      });
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

    const parentRef = this.db.collection(COLLECTION).doc(operationId);

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
    const parentRef = this.db.collection(COLLECTION).doc(operationId);

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
      txn.set(eventRef, {
        schemaVersion: JOB_EVENT_SCHEMA_VERSION,
        eventId: eventRef.id,
        emittedAt: new Date().toISOString(),
        operationId: event.operationId ?? operationId,
        ...event,
        seq: nextSeq,
        createdAt: FieldValue.serverTimestamp(),
      });
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
    const parentRef = this.db.collection(COLLECTION).doc(operationId);

    for (const event of events) {
      const docRef = parentRef.collection(EVENTS_SUBCOLLECTION).doc();
      batch.set(docRef, {
        schemaVersion: JOB_EVENT_SCHEMA_VERSION,
        eventId: docRef.id,
        emittedAt: new Date().toISOString(),
        operationId: event.operationId ?? operationId,
        ...event,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }

  /**
   * Read all events for a job, ordered by sequence number.
   * Used for replay when the frontend reconnects mid-job.
   */
  async getJobEvents(operationId: string): Promise<JobEvent[]> {
    const snapshot = await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .collection(EVENTS_SUBCOLLECTION)
      .orderBy('seq', 'asc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as JobEvent);
  }
}
