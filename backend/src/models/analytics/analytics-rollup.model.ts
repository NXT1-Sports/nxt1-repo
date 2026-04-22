/**
 * @fileoverview Analytics Rollup MongoDB model
 * @module @nxt1/backend/models/analytics-rollup
 */

import mongoose, { type Model } from 'mongoose';
import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUBJECT_TYPES,
  ANALYTICS_SUMMARY_TIMEFRAMES,
  type AnalyticsDomain,
  type AnalyticsSubjectType,
  type AnalyticsSummaryTimeframe,
} from '@nxt1/core/models';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';

const { model, models, Schema } = mongoose;

export interface AnalyticsRollupDocument {
  readonly environment: RuntimeEnvironment;
  readonly subjectId: string;
  readonly subjectType: AnalyticsSubjectType;
  readonly domain: AnalyticsDomain;
  readonly timeframe: AnalyticsSummaryTimeframe;
  readonly totalCount: number;
  readonly numericValueTotal: number;
  readonly countsByEventType: Record<string, number>;
  readonly periodStart?: Date | null;
  readonly periodEnd: Date;
  readonly lastEventAt?: Date | null;
  readonly lastAggregatedAt: Date;
}

const AnalyticsRollupSchema = new Schema<AnalyticsRollupDocument>(
  {
    environment: { type: String, required: true, enum: ['staging', 'production'], index: true },
    subjectId: { type: String, required: true, index: true },
    subjectType: { type: String, required: true, enum: [...ANALYTICS_SUBJECT_TYPES], index: true },
    domain: { type: String, required: true, enum: [...ANALYTICS_DOMAINS], index: true },
    timeframe: {
      type: String,
      required: true,
      enum: [...ANALYTICS_SUMMARY_TIMEFRAMES],
      index: true,
    },
    totalCount: { type: Number, required: true, default: 0 },
    numericValueTotal: { type: Number, required: true, default: 0 },
    countsByEventType: { type: Schema.Types.Mixed, default: {} },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, required: true },
    lastEventAt: { type: Date, default: null },
    lastAggregatedAt: { type: Date, required: true },
  },
  {
    versionKey: false,
    collection: 'analyticsRollups',
    timestamps: true,
  }
);

AnalyticsRollupSchema.index(
  { environment: 1, subjectId: 1, subjectType: 1, domain: 1, timeframe: 1 },
  { unique: true }
);

export const AnalyticsRollupModel: Model<AnalyticsRollupDocument> =
  (models['AnalyticsRollup'] as Model<AnalyticsRollupDocument> | undefined) ??
  model<AnalyticsRollupDocument>('AnalyticsRollup', AnalyticsRollupSchema, 'analyticsRollups');
