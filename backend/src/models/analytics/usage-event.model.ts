/**
 * @fileoverview UsageEvent Mongoose Model
 * @module @nxt1/backend/models/usage-event
 *
 * Mongoose schema and model for the `usageevents` collection.
 * Each document represents a single billable action performed by a user,
 * tracked for audit trail, Stripe invoice item generation, and analytics.
 *
 * Migrated from Firestore `UsageEvents` collection.
 * Timestamps are plain JS Date objects (not Firestore Timestamps).
 *
 * Indexes:
 * - { userId, createdAt: -1 }          → User dashboard queries (default sort)
 * - { teamId, createdAt: -1 }          → Org breakdown queries
 * - { idempotencyKey } unique          → Dedup on write (prevents double billing)
 * - { status, createdAt: 1 }           → Reconciliation worker (PENDING/FAILED events)
 * - { userId, teamId, createdAt: -1 }  → Org member drill-down
 */

import { model, Schema, Model, Types } from 'mongoose';
import { UsageEventStatus } from '../../modules/billing/types/usage-event.types.js';

// ─── Document Interface ──────────────────────────────────────────────────────

export interface UsageEventDocument {
  _id: Types.ObjectId;
  userId: string;
  teamId?: string;
  feature: string;
  quantity: number;
  unitCostSnapshot: number;
  costType: 'static' | 'dynamic';
  rawProviderCostUsd?: number;
  currency: string;
  stripePriceId: string;
  idempotencyKey: string;
  status: string;
  stripeUsageId?: string;
  stripeInvoiceItemId?: string;
  errorMessage?: string;
  retryCount: number;
  lastRetryAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const UsageEventSchema = new Schema<UsageEventDocument>(
  {
    userId: { type: String, required: true, index: true },
    teamId: { type: String, index: true },
    feature: {
      type: String,
      required: true,
    },
    quantity: { type: Number, required: true },
    unitCostSnapshot: { type: Number, required: true },
    costType: {
      type: String,
      required: true,
      enum: ['static', 'dynamic'],
      default: 'static',
    },
    rawProviderCostUsd: { type: Number },
    currency: { type: String, required: true, default: 'usd' },
    stripePriceId: { type: String, default: '' },
    idempotencyKey: { type: String, required: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(UsageEventStatus),
      default: UsageEventStatus.PENDING,
    },
    stripeUsageId: { type: String },
    stripeInvoiceItemId: { type: String },
    errorMessage: { type: String },
    retryCount: { type: Number, required: true, default: 0 },
    lastRetryAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  {
    versionKey: false,
    // Expose _id as `id` string so consumers can use event.id
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Compound Indexes ─────────────────────────────────────────────────────────

// User dashboard: fetch events for a user sorted by newest first
UsageEventSchema.index({ userId: 1, createdAt: -1 });

// Org breakdown: fetch events for a team sorted by newest first
UsageEventSchema.index({ teamId: 1, createdAt: -1 });

// Reconciliation worker: find PENDING/FAILED events (oldest first — process in order)
UsageEventSchema.index({ status: 1, createdAt: 1 });

// Org member drill-down: scoped per user+team queries with time range
UsageEventSchema.index({ userId: 1, teamId: 1, createdAt: -1 });

// Helicone webhook reconciliation: match by nested metadata fields
// (MongoDB uses collection scan for Mixed field queries — acceptable for low-volume webhook reconciliation)

// ─── Model ───────────────────────────────────────────────────────────────────

export const UsageEventModel: Model<UsageEventDocument> = model<UsageEventDocument>(
  'UsageEvent',
  UsageEventSchema
);
