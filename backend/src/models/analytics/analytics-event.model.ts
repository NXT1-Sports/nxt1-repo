/**
 * @fileoverview Analytics Event MongoDB model
 * @module @nxt1/backend/models/analytics-event
 */

import mongoose, { type Model } from 'mongoose';
import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUBJECT_TYPES,
  type AnalyticsDomain,
  type AnalyticsSubjectType,
} from '@nxt1/core/models';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';

const { model, models, Schema } = mongoose;

export interface AnalyticsEventDocument {
  readonly environment: RuntimeEnvironment;
  readonly subjectId: string;
  readonly subjectType: AnalyticsSubjectType;
  readonly domain: AnalyticsDomain;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly source: 'agent' | 'user' | 'system';
  readonly actorUserId?: string | null;
  readonly sessionId?: string | null;
  readonly threadId?: string | null;
  readonly value?: number | string | boolean | null;
  readonly numericValue?: number | null;
  readonly tags: string[];
  readonly payload: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly meta: {
    readonly environment: RuntimeEnvironment;
    readonly subjectId: string;
    readonly subjectType: AnalyticsSubjectType;
    readonly domain: AnalyticsDomain;
  };
}

const AnalyticsEventSchema = new Schema<AnalyticsEventDocument>(
  {
    environment: { type: String, required: true, enum: ['staging', 'production'], index: true },
    subjectId: { type: String, required: true, index: true },
    subjectType: { type: String, required: true, enum: [...ANALYTICS_SUBJECT_TYPES], index: true },
    domain: { type: String, required: true, enum: [...ANALYTICS_DOMAINS], index: true },
    eventType: { type: String, required: true, index: true },
    occurredAt: { type: Date, required: true, index: true },
    source: { type: String, required: true, enum: ['agent', 'user', 'system'], index: true },
    actorUserId: { type: String, default: null },
    sessionId: { type: String, default: null },
    threadId: { type: String, default: null },
    value: { type: Schema.Types.Mixed, default: null },
    numericValue: { type: Number, default: null },
    tags: { type: [String], default: [] },
    payload: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
    meta: {
      type: {
        environment: { type: String, required: true, enum: ['staging', 'production'] },
        subjectId: { type: String, required: true },
        subjectType: { type: String, required: true, enum: [...ANALYTICS_SUBJECT_TYPES] },
        domain: { type: String, required: true, enum: [...ANALYTICS_DOMAINS] },
      },
      required: true,
      _id: false,
    },
  },
  {
    versionKey: false,
    collection: 'analyticsEvents',
    timestamps: { createdAt: true, updatedAt: false },
    timeseries: {
      timeField: 'occurredAt',
      metaField: 'meta',
      granularity: 'hours',
    },
    expireAfterSeconds: 60 * 60 * 24 * 90,
  }
);

AnalyticsEventSchema.index({ environment: 1, subjectId: 1, domain: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ environment: 1, actorUserId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ environment: 1, eventType: 1, occurredAt: -1 });

export const AnalyticsEventModel: Model<AnalyticsEventDocument> =
  (models['AnalyticsEvent'] as Model<AnalyticsEventDocument> | undefined) ??
  model<AnalyticsEventDocument>('AnalyticsEvent', AnalyticsEventSchema, 'analyticsEvents');
