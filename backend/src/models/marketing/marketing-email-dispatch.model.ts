/**
 * @fileoverview MarketingEmailDispatch Mongoose Model
 * @module @nxt1/backend/models/marketing-email-dispatch
 */

import type { Connection, Model } from 'mongoose';
import mongoose from 'mongoose';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';
import { getMongoEnvironmentConnection } from '../../config/database.config.js';

const { Schema } = mongoose;

export const MARKETING_EMAIL_DISPATCH_MODEL_NAME = 'MarketingEmailDispatch';

export type MarketingEmailDispatchProvider = 'platform_smtp' | 'brevo';

export type MarketingEmailDispatchStatus =
  | 'attempted'
  | 'sent'
  | 'failed'
  | 'delivered'
  | 'bounced'
  | 'blocked'
  | 'unsubscribed'
  | 'complained';

export interface MarketingEmailDispatchDocument {
  readonly environment: RuntimeEnvironment;
  readonly dispatchId: string;
  readonly trackingId: string;
  readonly campaignKey: string;
  readonly campaignFamily: string;
  readonly provider: MarketingEmailDispatchProvider;
  readonly userId?: string | null;
  readonly recipientEmailHash: string;
  readonly recipientDomain?: string | null;
  readonly subject: string;
  readonly replyTo?: string | null;
  readonly sendStatus: MarketingEmailDispatchStatus;
  readonly providerMessageId?: string | null;
  readonly failureReason?: string | null;
  readonly metadata: Record<string, unknown>;
  readonly sentAt?: Date | null;
  readonly failedAt?: Date | null;
  readonly deliveredAt?: Date | null;
  readonly bouncedAt?: Date | null;
  readonly unsubscribedAt?: Date | null;
  readonly complainedAt?: Date | null;
  readonly lastEventAt?: Date | null;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

const MarketingEmailDispatchSchema = new Schema<MarketingEmailDispatchDocument>(
  {
    environment: { type: String, required: true, enum: ['staging', 'production'], index: true },
    dispatchId: { type: String, required: true, unique: true },
    trackingId: { type: String, required: true, index: true },
    campaignKey: { type: String, required: true, index: true },
    campaignFamily: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ['platform_smtp', 'brevo'], index: true },
    userId: { type: String, default: null, index: true },
    recipientEmailHash: { type: String, required: true, index: true },
    recipientDomain: { type: String, default: null, index: true },
    subject: { type: String, required: true },
    replyTo: { type: String, default: null },
    sendStatus: {
      type: String,
      required: true,
      enum: [
        'attempted',
        'sent',
        'failed',
        'delivered',
        'bounced',
        'blocked',
        'unsubscribed',
        'complained',
      ],
      index: true,
    },
    providerMessageId: { type: String, default: null },
    failureReason: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    sentAt: { type: Date, default: null, index: true },
    failedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    bouncedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
    complainedAt: { type: Date, default: null },
    lastEventAt: { type: Date, default: null },
  },
  {
    versionKey: false,
    collection: 'marketingEmailDispatches',
    timestamps: true,
  }
);

MarketingEmailDispatchSchema.index({ environment: 1, campaignKey: 1, createdAt: -1 });
MarketingEmailDispatchSchema.index({ environment: 1, campaignFamily: 1, createdAt: -1 });
MarketingEmailDispatchSchema.index({ environment: 1, sendStatus: 1, createdAt: -1 });
MarketingEmailDispatchSchema.index(
  { environment: 1, provider: 1, providerMessageId: 1 },
  {
    sparse: true,
  }
);
MarketingEmailDispatchSchema.index(
  { environment: 1, campaignKey: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sendStatus: 'attempted',
      userId: { $type: 'string' },
    },
  }
);

export function getMarketingEmailDispatchModel(
  connection: Connection = getMongoEnvironmentConnection()
): Model<MarketingEmailDispatchDocument> {
  const existingModel = connection.models[MARKETING_EMAIL_DISPATCH_MODEL_NAME] as
    Model<MarketingEmailDispatchDocument> | undefined;
  if (existingModel) return existingModel;

  return connection.model<MarketingEmailDispatchDocument>(
    MARKETING_EMAIL_DISPATCH_MODEL_NAME,
    MarketingEmailDispatchSchema,
    'marketingEmailDispatches'
  );
}

export const MarketingEmailDispatchModel = new Proxy({} as Model<MarketingEmailDispatchDocument>, {
  get(_target, prop) {
    const model = getMarketingEmailDispatchModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getMarketingEmailDispatchModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getMarketingEmailDispatchModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
