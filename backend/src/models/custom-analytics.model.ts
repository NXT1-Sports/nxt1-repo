/**
 * @fileoverview Custom Analytics Mongoose Model
 * @module @nxt1/backend/models/custom-analytics
 *
 * Mongoose schema and model for a flexible, data-agnostic analytics store.
 * Allows tracking recruiting signals, NIL events, performance metrics, and more.
 */

import { model, Schema, type Model } from 'mongoose';
import type { CustomAnalyticsEvent } from '@nxt1/core/models';
import { getRuntimeEnvironment } from '../config/runtime-environment.js';

type CustomAnalyticsDoc = Omit<CustomAnalyticsEvent, '_id'>;

const CustomAnalyticsSchema = new Schema<CustomAnalyticsDoc>(
  {
    environment: {
      type: String,
      required: true,
      enum: ['staging', 'production'],
      index: true,
      default: () => getRuntimeEnvironment(),
    },
    userId: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    metric: { type: String, required: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    tags: { type: [String], default: [] },
    timestamp: { type: String, required: true, index: true },
    source: { type: String, required: true, enum: ['agent', 'user', 'system'] },
    details: { type: Schema.Types.Mixed },
  },
  {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: false }, // Adds mongoose createdAt, avoids updatedAt
  }
);

// Compound index for querying a user's specific metric events chronologically
CustomAnalyticsSchema.index({ environment: 1, userId: 1, category: 1, timestamp: -1 });

export const CustomAnalyticsModel: Model<CustomAnalyticsDoc> = model<CustomAnalyticsDoc>(
  'CustomAnalytics',
  CustomAnalyticsSchema,
  'customAnalytics'
);
