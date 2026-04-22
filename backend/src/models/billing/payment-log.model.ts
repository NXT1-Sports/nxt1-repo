/**
 * @fileoverview PaymentLog Mongoose Model
 * @module @nxt1/backend/models/payment-log
 *
 * Mongoose schema and model for the `paymentlogs` collection.
 * Each document represents a Stripe invoice or payment event logged
 * via webhook for audit trail, payment history UI, and receipt generation.
 *
 * Migrated from Firestore `PaymentLogs` collection.
 * Timestamps are plain JS Date objects (not Firestore Timestamps).
 *
 * The unique index on `invoiceId` provides built-in dedup for Stripe
 * webhook replays — all upsert operations use `findOneAndUpdate` with
 * `{ invoiceId }` as the filter so duplicate deliveries are idempotent.
 *
 * Indexes:
 * - { invoiceId } unique                → Stripe webhook dedup
 * - { userId, createdAt: -1 }          → Payment history per user (default sort)
 * - { organizationId, createdAt: -1 }  → Org payment history
 * - { status, createdAt: -1 }          → Admin reconciliation
 */

import { model, Schema, Model, Types } from 'mongoose';

// ─── Document Interface ──────────────────────────────────────────────────────

export interface PaymentLogDocument {
  _id: Types.ObjectId;
  invoiceId: string;
  customerId: string;
  userId: string;
  teamId?: string;
  organizationId?: string;
  amountDue: number;
  amountPaid: number;
  amountRefunded?: number;
  currency: string;
  status: 'PAID' | 'FAILED' | 'PENDING' | 'VOID' | 'REFUNDED';
  invoiceUrl?: string;
  receiptUrl?: string;
  paymentMethodLabel?: string;
  /** Stripe event type that originated this log (e.g. 'wallet_topup', 'org_invoice_topup') */
  type?: string;
  finalizationSource?: 'webhook' | 'client_return' | 'direct_charge';
  rawEvent: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const PaymentLogSchema = new Schema<PaymentLogDocument>(
  {
    invoiceId: { type: String, required: true, unique: true },
    customerId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    teamId: { type: String },
    organizationId: { type: String, index: true },
    amountDue: { type: Number, required: true, default: 0 },
    amountPaid: { type: Number, required: true, default: 0 },
    amountRefunded: { type: Number },
    currency: { type: String, required: true, default: 'usd' },
    status: {
      type: String,
      required: true,
      enum: ['PAID', 'FAILED', 'PENDING', 'VOID', 'REFUNDED'],
      default: 'PENDING',
    },
    invoiceUrl: { type: String },
    receiptUrl: { type: String },
    paymentMethodLabel: { type: String },
    type: { type: String },
    finalizationSource: {
      type: String,
      enum: ['webhook', 'client_return', 'direct_charge'],
    },
    rawEvent: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date },
  },
  { versionKey: false }
);

// ─── Compound Indexes ─────────────────────────────────────────────────────────

// Payment history per user sorted by newest first
PaymentLogSchema.index({ userId: 1, createdAt: -1 });

// Org payment history sorted by newest first
PaymentLogSchema.index({ organizationId: 1, createdAt: -1 });

// Admin reconciliation: find logs by status + time range
PaymentLogSchema.index({ status: 1, createdAt: -1 });

// ─── Model ───────────────────────────────────────────────────────────────────

export const PaymentLogModel: Model<PaymentLogDocument> = model<PaymentLogDocument>(
  'PaymentLog',
  PaymentLogSchema
);
