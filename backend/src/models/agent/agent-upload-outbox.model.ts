/**
 * @fileoverview AgentUploadOutbox Mongoose Model
 * @module @nxt1/backend/models/agent-upload-outbox
 *
 * Durable server-side outbox for video attachment late-sync operations.
 *
 * When a TUS upload completes in the browser but the corresponding agent
 * message has not yet been persisted to MongoDB (race condition: video
 * finishes uploading after the user hits Send, browser refreshes before
 * the in-memory sync call completes), the attachment is written here and
 * reconciled on the next GET /threads/:threadId/messages call.
 *
 * Lifecycle:
 *   1. POST /messages/attachments/sync  → message found    → attach directly, skip outbox
 *   2. POST /messages/attachments/sync  → message NOT found → write outbox entry (status: pending)
 *   3. GET  /threads/:threadId/messages → reconcile outbox  → attach + mark synced
 *
 * Indexes:
 *   - { userId, idempotencyKey, status }  → reconciliation lookup (compound)
 *   - { expiresAt: 1 } TTL               → auto-delete entries after 7 days
 */

import { Schema, type Model, type Connection } from 'mongoose';
import type { AgentXAttachment } from '@nxt1/core';
import { getMongoEnvironmentConnection } from '../../config/database.config.js';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface AgentUploadOutboxEntry {
  _id: unknown;
  /** Firebase UID of the user who owns the message. */
  userId: string;
  /** Idempotency key of the user message this attachment belongs to. */
  idempotencyKey: string;
  /** Full attachment payload including cloudflareVideoId for videos. */
  attachment: AgentXAttachment;
  /** pending = waiting for reconciliation; synced = successfully applied. */
  status: 'pending' | 'synced';
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 timestamp when the entry was reconciled and marked synced. */
  syncedAt?: string;
  /** MongoDB TTL field — document is auto-deleted once this date passes (7 days). */
  expiresAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const AGENT_UPLOAD_OUTBOX_MODEL_NAME = 'AgentUploadOutbox';

const AgentUploadOutboxSchema = new Schema<AgentUploadOutboxEntry>(
  {
    userId: { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: true },
    attachment: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'synced'],
      default: 'pending',
    },
    createdAt: { type: String, required: true },
    syncedAt: { type: String },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { versionKey: false }
);

// Compound index for O(1) reconciliation lookups
AgentUploadOutboxSchema.index({ userId: 1, idempotencyKey: 1, status: 1 });

// TTL — MongoDB auto-deletes documents once expiresAt is in the past
AgentUploadOutboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Model factory ───────────────────────────────────────────────────────────

export function getAgentUploadOutboxModel(
  connection: Connection = getMongoEnvironmentConnection()
): Model<AgentUploadOutboxEntry> {
  const existing = connection.models[AGENT_UPLOAD_OUTBOX_MODEL_NAME] as
    | Model<AgentUploadOutboxEntry>
    | undefined;
  if (existing) return existing;

  return connection.model<AgentUploadOutboxEntry>(
    AGENT_UPLOAD_OUTBOX_MODEL_NAME,
    AgentUploadOutboxSchema
  );
}

/**
 * Lazy Proxy model — resolves the Mongoose model on first access.
 * Identical pattern to AgentMessageModel; safe for top-level imports.
 */
export const AgentUploadOutboxModel = new Proxy({} as Model<AgentUploadOutboxEntry>, {
  get(_target, prop) {
    const model = getAgentUploadOutboxModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getAgentUploadOutboxModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getAgentUploadOutboxModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
