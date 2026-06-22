/**
 * @fileoverview MarketingEmailInsightsReport Mongoose Model
 * @module @nxt1/backend/models/marketing-email-insights-report
 */

import type { Connection, Model } from 'mongoose';
import mongoose from 'mongoose';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';
import { getMongoEnvironmentConnection } from '../../config/database.config.js';

const { Schema } = mongoose;

export const MARKETING_EMAIL_INSIGHTS_REPORT_MODEL_NAME = 'MarketingEmailInsightsReport';

export interface MarketingEmailInsightsReportSnapshotDocument {
  readonly environment: RuntimeEnvironment;
  readonly reportType: 'weekly' | 'monthly';
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly generatedAt: Date;
  readonly totals: Record<string, unknown>;
  readonly campaigns: readonly Record<string, unknown>[];
  readonly topLinks: readonly Record<string, unknown>[];
  readonly metadata: Record<string, unknown>;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

const MarketingEmailInsightsReportSchema = new Schema<MarketingEmailInsightsReportSnapshotDocument>(
  {
    environment: { type: String, required: true, enum: ['staging', 'production'], index: true },
    reportType: { type: String, required: true, enum: ['weekly', 'monthly'], index: true },
    periodStart: { type: Date, required: true, index: true },
    periodEnd: { type: Date, required: true, index: true },
    generatedAt: { type: Date, required: true, index: true },
    totals: { type: Schema.Types.Mixed, required: true },
    campaigns: { type: [Schema.Types.Mixed], required: true, default: [] },
    topLinks: { type: [Schema.Types.Mixed], required: true, default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    versionKey: false,
    collection: 'marketingEmailInsightsReports',
    timestamps: true,
  }
);

MarketingEmailInsightsReportSchema.index(
  { environment: 1, reportType: 1, periodStart: 1, periodEnd: 1 },
  { unique: true }
);

export function getMarketingEmailInsightsReportModel(
  connection: Connection = getMongoEnvironmentConnection()
): Model<MarketingEmailInsightsReportSnapshotDocument> {
  const existingModel = connection.models[MARKETING_EMAIL_INSIGHTS_REPORT_MODEL_NAME] as
    | Model<MarketingEmailInsightsReportSnapshotDocument>
    | undefined;
  if (existingModel) return existingModel;

  return connection.model<MarketingEmailInsightsReportSnapshotDocument>(
    MARKETING_EMAIL_INSIGHTS_REPORT_MODEL_NAME,
    MarketingEmailInsightsReportSchema,
    'marketingEmailInsightsReports'
  );
}

export const MarketingEmailInsightsReportModel = new Proxy(
  {} as Model<MarketingEmailInsightsReportSnapshotDocument>,
  {
    get(_target, prop) {
      const model = getMarketingEmailInsightsReportModel();
      const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === 'function' ? value.bind(model) : value;
    },
    has(_target, prop) {
      const model = getMarketingEmailInsightsReportModel();
      return prop in model;
    },
    getOwnPropertyDescriptor(_target, prop) {
      const model = getMarketingEmailInsightsReportModel() as unknown as Record<
        PropertyKey,
        unknown
      >;
      const value = model[prop];
      if (value === undefined) return undefined;
      return { configurable: true, enumerable: true, writable: true, value };
    },
  }
);
