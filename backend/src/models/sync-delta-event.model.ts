/**
 * @fileoverview Sync Delta Event MongoDB model
 * @module @nxt1/backend/models/sync-delta-event
 *
 * Stores compact, short-lived sync diff events so Agent X can reference
 * recent exact profile/team/org changes directly in prompt context.
 */

import mongoose, { type Model } from 'mongoose';
import type { SyncDeltaReport } from '@nxt1/core';
import type { RuntimeEnvironment } from '../config/runtime-environment.js';

const { model, models, Schema } = mongoose;

export interface SyncDeltaEventDocument {
  readonly environment: RuntimeEnvironment;
  readonly userId: string;
  readonly teamId?: string | null;
  readonly organizationId?: string | null;
  readonly sport: string;
  readonly source: string;
  readonly syncedAt: Date;
  readonly promptSummary: string;
  readonly summary: SyncDeltaReport['summary'];
  readonly deltaReport: SyncDeltaReport;
  readonly meta: {
    readonly environment: RuntimeEnvironment;
    readonly userId: string;
    readonly sport: string;
    readonly source: string;
    readonly teamId?: string | null;
    readonly organizationId?: string | null;
  };
}

const SyncDeltaEventSchema = new Schema<SyncDeltaEventDocument>(
  {
    environment: { type: String, required: true, enum: ['staging', 'production'], index: true },
    userId: { type: String, required: true, index: true },
    teamId: { type: String, default: null, index: true },
    organizationId: { type: String, default: null, index: true },
    sport: { type: String, required: true, index: true },
    source: { type: String, required: true, index: true },
    syncedAt: { type: Date, required: true, index: true },
    promptSummary: { type: String, required: true },
    summary: { type: Schema.Types.Mixed, required: true },
    deltaReport: { type: Schema.Types.Mixed, required: true },
    meta: {
      type: {
        environment: { type: String, required: true, enum: ['staging', 'production'] },
        userId: { type: String, required: true },
        sport: { type: String, required: true },
        source: { type: String, required: true },
        teamId: { type: String, default: null },
        organizationId: { type: String, default: null },
      },
      required: true,
      _id: false,
    },
  },
  {
    versionKey: false,
    collection: 'syncDeltaEvents',
    timestamps: { createdAt: true, updatedAt: false },
    timeseries: {
      timeField: 'syncedAt',
      metaField: 'meta',
      granularity: 'hours',
    },
    expireAfterSeconds: 60 * 60 * 24 * 30,
  }
);

SyncDeltaEventSchema.index({ environment: 1, userId: 1, syncedAt: -1 });
SyncDeltaEventSchema.index({ environment: 1, teamId: 1, syncedAt: -1 });
SyncDeltaEventSchema.index({ environment: 1, organizationId: 1, syncedAt: -1 });

export const SyncDeltaEventModel: Model<SyncDeltaEventDocument> =
  (models['SyncDeltaEvent'] as Model<SyncDeltaEventDocument> | undefined) ??
  model<SyncDeltaEventDocument>('SyncDeltaEvent', SyncDeltaEventSchema, 'syncDeltaEvents');
