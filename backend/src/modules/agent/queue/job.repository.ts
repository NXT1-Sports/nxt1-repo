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
 * Collection: `agentJobs/{operationId}`
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
  AgentOperationStatus,
  AgentOperationResult,
  AgentYieldState,
} from '@nxt1/core';
import type { AgentJobProgress } from './queue.types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const COLLECTION = 'agentJobs' as const;
const ACTIVE_JOB_RETENTION_DAYS = 14;
const TERMINAL_JOB_RETENTION_DAYS = 30;

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
}
