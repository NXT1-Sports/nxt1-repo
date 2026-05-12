/**
 * @fileoverview Agent Job Outbox — shared idempotent enqueue with Firestore outbox.
 * @module @nxt1/backend/modules/agent/queue/outbox
 *
 * Extracted from chat.routes.ts so server-initiated jobs (scrape, welcome
 * graphic) use the same durable outbox pattern as user-initiated /enqueue calls:
 *
 *   1. Write a 'pending' outbox doc first (at-least-once durability).
 *   2. Push to BullMQ.
 *   3. Flip the doc to 'enqueued' on success, 'error' on failure.
 *   4. Idempotency: if an 'enqueued' doc already exists for this operationId,
 *      return the stored jobId without re-pushing to the queue.
 *   5. The cron reconciler in chat.routes.ts retries any 'pending'/'error' docs
 *      that slipped through, so even if the process crashes between steps 1-2
 *      the job still gets delivered.
 */

import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AgentJobPayload } from '@nxt1/core';
import type { AgentQueueService } from './queue.service.js';
import { logger } from '../../../utils/logger.js';

// ─── Constants ───────────────────────────────────────────────────────────────
// Exported so the reconciler cron in chat.routes.ts can reference the same values.

export const OUTBOX_COLLECTION = 'AgentJobOutbox';

export const OUTBOX_TTL_PENDING_DAYS = 1;
export const OUTBOX_TTL_ENQUEUED_DAYS = 7;
export const OUTBOX_TTL_ERROR_DAYS = 7;

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentOutboxStatus = 'pending' | 'enqueued' | 'error';

interface AgentOutboxDocument {
  operationId: string;
  userId: string;
  environment: string;
  status: AgentOutboxStatus;
  jobId?: string;
  attempts: number;
  payload: AgentJobPayload;
  lastError?: string | null;
  expiresAt: FirebaseFirestore.Timestamp;
  enqueuedAt?: FirebaseFirestore.FieldValue;
  createdAt: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function outboxTtlFromNow(days: number): FirebaseFirestore.Timestamp {
  return Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Enqueue an agent job through the Firestore outbox for durability.
 *
 * Safe to call from server-initiated paths (scrape, welcome graphic, etc.)
 * as well as from user-initiated HTTP handlers — uses the same collection
 * so the cron reconciler covers all origins.
 *
 * @returns `{ jobId, deduplicated }` — deduplicated=true means this
 *   operationId was already enqueued and we returned the existing jobId.
 */
export async function enqueueWithOutbox(
  db: Firestore,
  payload: AgentJobPayload,
  environment: 'staging' | 'production',
  queue: AgentQueueService
): Promise<{ jobId: string; deduplicated: boolean }> {
  const outboxRef = db.collection(OUTBOX_COLLECTION).doc(payload.operationId);
  const existing = await outboxRef.get();

  if (existing.exists) {
    const existingData = existing.data() as Partial<AgentOutboxDocument>;
    if (existingData.status === 'enqueued' && typeof existingData.jobId === 'string') {
      logger.info('[Outbox] Deduplicated — job already enqueued', {
        operationId: payload.operationId,
        jobId: existingData.jobId,
      });
      return { jobId: existingData.jobId, deduplicated: true };
    }
  }

  // Write pending outbox doc FIRST for durability.
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
    const jobId = await queue.enqueue(payload, environment);
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
