/**
 * @fileoverview Analytics Custom Event Template MongoDB model
 * @module @nxt1/backend/models/analytics-custom-template
 */

import mongoose, { type Model } from 'mongoose';
import type { AnalyticsCustomEventTemplate } from '@nxt1/core/models';

const { model, models, Schema } = mongoose;

type PersistedBaseDomain = AnalyticsCustomEventTemplate['baseDomain'];
type PersistedStatus = AnalyticsCustomEventTemplate['status'];

export interface AnalyticsCustomEventTemplateDocument {
  readonly _id?: string;
  readonly id?: string;
  readonly templateKey: string;
  readonly displayName: string;
  readonly description: string;
  readonly baseDomain: PersistedBaseDomain;
  readonly canonicalEventType: string;
  readonly aliases: readonly string[];
  readonly requiredPayloadFields: readonly string[];
  readonly suggestedTags: readonly string[];
  readonly payloadSchemaVersion: string;
  readonly status: PersistedStatus;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly usageCount: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const AnalyticsCustomEventTemplateSchema = new Schema<AnalyticsCustomEventTemplateDocument>(
  {
    templateKey: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: { type: String, required: true },
    description: { type: String, required: true },
    baseDomain: {
      type: String,
      required: true,
      enum: ['recruiting', 'nil', 'performance', 'engagement', 'communication'],
      index: true,
    },
    canonicalEventType: { type: String, required: true },
    aliases: { type: [String], default: [], lowercase: true },
    requiredPayloadFields: { type: [String], default: [] },
    suggestedTags: { type: [String], default: [] },
    payloadSchemaVersion: { type: String, default: '1.0.0' },
    status: {
      type: String,
      required: true,
      enum: ['active', 'deprecated', 'pending_review'],
      default: 'active',
      index: true,
    },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    lastUsedAt: { type: Date, default: null },
    usageCount: { type: Number, default: 0, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    versionKey: false,
    collection: 'analyticsCustomTemplates',
    timestamps: { createdAt: false, updatedAt: false },
  }
);

// Compound index for discovery queries (baseDomain + status + usageCount).
// templateKey is already indexed via unique:true on the field definition.
AnalyticsCustomEventTemplateSchema.index({
  baseDomain: 1,
  status: 1,
  usageCount: -1,
});

export const AnalyticsCustomEventTemplateModel: Model<AnalyticsCustomEventTemplateDocument> =
  (models['AnalyticsCustomEventTemplate'] as
    | Model<AnalyticsCustomEventTemplateDocument>
    | undefined) ??
  model<AnalyticsCustomEventTemplateDocument>(
    'AnalyticsCustomEventTemplate',
    AnalyticsCustomEventTemplateSchema,
    'analyticsCustomTemplates'
  );
