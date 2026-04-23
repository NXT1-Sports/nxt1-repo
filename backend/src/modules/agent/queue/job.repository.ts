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
import type { AgentJobProgress } from './queue.types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const COLLECTION = 'AgentJobs' as const;
const EVENTS_SUBCOLLECTION = 'events' as const;
const ACTIVE_JOB_RETENTION_DAYS = 14;
const TERMINAL_JOB_RETENTION_DAYS = 30;

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
 * - `done`         — The entire job finished (success or failure)
 */
export type JobEventType =
  | 'step_active'
  | 'step_done'
  | 'step_error'
  | 'delta'
  | 'tool_call'
  | 'tool_result'
  | 'card'
  | 'done';

/**
 * A single event document stored in `AgentJobs/{operationId}/events/{autoId}`.
 * The frontend reads these via `onSnapshot`, ordered by `seq`, to reconstruct
 * the live agent execution as a chat-like experience.
 */
export interface JobEvent {
  /** Monotonically increasing sequence number (0-based). */
  readonly seq: number;
  /** Owner's Firebase UID — stamped on write so Firestore rules can check without a parent doc get(). */
  readonly userId: string;
  /** What kind of event this is. */
  readonly type: JobEventType;
  /** Agent identifier if known (e.g. 'recruiting', 'performance'). */
  readonly agentId?: string;
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
  /** Server timestamp set by Firestore. */
  readonly createdAt: FirebaseFirestore.Timestamp;
}

function ttlFromNow(days: number): FirebaseFirestore.Timestamp {
  const expiresAtMs = Date.now() + days * 24 * 60 * 60 * 1000;
  return Timestamp.fromMillis(expiresAtMs);
}

// ─── Document Shape ─────────────────────────────────────────────────────────

export interface AgentJobDocument {
  readonly operationId: string;
  readonly userId: string;
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
        intent: payload.intent,
        origin: payload.origin,
        status: 'queued' satisfies AgentOperationStatus,
        progress: null,
        result: null,
        error: null,
        threadId: (payload.context?.['threadId'] as string) ?? null,
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
    await this.db.collection(COLLECTION).doc(operationId).update({
      status: progress.status,
      progress,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Mark the job as completed and store the final result.
   */
  async markCompleted(operationId: string, result: AgentOperationResult): Promise<void> {
    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .update({
        status: 'completed' satisfies AgentOperationStatus,
        result,
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        expiresAt: ttlFromNow(TERMINAL_JOB_RETENTION_DAYS),
      });
  }

  /**
   * Mark the job as failed and store the error message.
   */
  async markFailed(operationId: string, error: string): Promise<void> {
    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .update({
        status: 'failed' satisfies AgentOperationStatus,
        error,
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
    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .update({
        status:
          yieldState.reason === 'needs_approval'
            ? ('awaiting_approval' satisfies AgentOperationStatus)
            : ('awaiting_input' satisfies AgentOperationStatus),
        yieldState,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: ttlFromNow(ACTIVE_JOB_RETENTION_DAYS),
      });
  }

  /**
   * Mark the job as cancelled (user-initiated).
   */
  async markCancelled(operationId: string): Promise<void> {
    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .update({
        status: 'cancelled' satisfies AgentOperationStatus,
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        expiresAt: ttlFromNow(TERMINAL_JOB_RETENTION_DAYS),
      });
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

  // ─── Event Subcollection (Real-Time Streaming) ──────────────────────────

  /**
   * Append a single event to the `events` subcollection.
   * The frontend listens to this subcollection via `onSnapshot` to render
   * live step-by-step updates without holding open an SSE connection.
   *
   * Uses auto-generated document IDs — ordering is guaranteed by the `seq` field.
   */
  async writeJobEvent(operationId: string, event: Omit<JobEvent, 'createdAt'>): Promise<void> {
    await this.db
      .collection(COLLECTION)
      .doc(operationId)
      .collection(EVENTS_SUBCOLLECTION)
      .add({
        ...event,
        createdAt: FieldValue.serverTimestamp(),
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
