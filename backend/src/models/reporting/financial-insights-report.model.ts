/**
 * @fileoverview FinancialInsightsReport Mongoose Model
 * @module @nxt1/backend/models/financial-insights-report
 */

import type { Connection, Model } from 'mongoose';
import mongoose from 'mongoose';
import type { RuntimeEnvironment } from '../../config/runtime-environment.js';
import { getMongoEnvironmentConnection } from '../../config/database.config.js';

const { Schema } = mongoose;

export const FINANCIAL_INSIGHTS_REPORT_MODEL_NAME = 'FinancialInsightsReport';

export interface FinancialInsightsReportSnapshotDocument {
  readonly environment: RuntimeEnvironment;
  readonly reportType: 'weekly' | 'monthly';
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly generatedAt: Date;
  readonly totals: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

const FinancialInsightsReportSchema = new Schema<FinancialInsightsReportSnapshotDocument>(
  {
    environment: { type: String, required: true, enum: ['staging', 'production'], index: true },
    reportType: { type: String, required: true, enum: ['weekly', 'monthly'], index: true },
    periodStart: { type: Date, required: true, index: true },
    periodEnd: { type: Date, required: true, index: true },
    generatedAt: { type: Date, required: true, index: true },
    totals: { type: Schema.Types.Mixed, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    versionKey: false,
    collection: 'financialInsightsReports',
    timestamps: true,
  }
);

FinancialInsightsReportSchema.index(
  { environment: 1, reportType: 1, periodStart: 1, periodEnd: 1 },
  { unique: true }
);

export function getFinancialInsightsReportModel(
  connection: Connection = getMongoEnvironmentConnection()
): Model<FinancialInsightsReportSnapshotDocument> {
  const existingModel = connection.models[FINANCIAL_INSIGHTS_REPORT_MODEL_NAME] as
    | Model<FinancialInsightsReportSnapshotDocument>
    | undefined;
  if (existingModel) return existingModel;

  return connection.model<FinancialInsightsReportSnapshotDocument>(
    FINANCIAL_INSIGHTS_REPORT_MODEL_NAME,
    FinancialInsightsReportSchema,
    'financialInsightsReports'
  );
}

export const FinancialInsightsReportModel = new Proxy(
  {} as Model<FinancialInsightsReportSnapshotDocument>,
  {
    get(_target, prop) {
      const model = getFinancialInsightsReportModel();
      const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === 'function' ? value.bind(model) : value;
    },
    has(_target, prop) {
      const model = getFinancialInsightsReportModel();
      return prop in model;
    },
    getOwnPropertyDescriptor(_target, prop) {
      const model = getFinancialInsightsReportModel() as unknown as Record<PropertyKey, unknown>;
      const value = model[prop];
      if (value === undefined) return undefined;
      return { configurable: true, enumerable: true, writable: true, value };
    },
  }
);
