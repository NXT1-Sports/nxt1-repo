/**
 * @fileoverview LLM Call MongoDB model — AI telemetry and cost tracking
 * @module @nxt1/backend/models/llm-call
 *
 * Persists one document per OpenRouter API call for cost attribution,
 * daily limit enforcement, and usage dashboard reporting.
 */

import mongoose, { type Model } from 'mongoose';
import type { AgentIdentifier } from '@nxt1/core';
import type { RuntimeEnvironment } from '../config/runtime-environment.js';

const { model, models, Schema } = mongoose;

export interface LLMCallDocument {
  readonly environment: RuntimeEnvironment;
  readonly operationId: string;
  readonly userId: string;
  readonly agentId: AgentIdentifier;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly hadToolCall: boolean;
  readonly timestamp: Date;
}

const LLMCallSchema = new Schema<LLMCallDocument>(
  {
    environment: { type: String, required: true, enum: ['staging', 'production'], index: true },
    operationId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    model: { type: String, required: true, index: true },
    inputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
    totalTokens: { type: Number, required: true, default: 0 },
    costUsd: { type: Number, required: true, default: 0 },
    latencyMs: { type: Number, required: true, default: 0 },
    hadToolCall: { type: Boolean, required: true, default: false },
    timestamp: { type: Date, required: true, index: true },
  },
  {
    versionKey: false,
    collection: 'llmCalls',
    timestamps: { createdAt: true, updatedAt: false },
    // 90-day TTL keeps storage bounded; usage summaries should be computed before expiry.
    expireAfterSeconds: 60 * 60 * 24 * 90,
  }
);

// Compound index for per-user daily queries (limit checking)
LLMCallSchema.index({ environment: 1, userId: 1, timestamp: -1 });

// Compound index for per-operation rollups
LLMCallSchema.index({ environment: 1, operationId: 1, timestamp: -1 });

export const LLMCallModel: Model<LLMCallDocument> =
  (models['LLMCall'] as Model<LLMCallDocument> | undefined) ??
  model<LLMCallDocument>('LLMCall', LLMCallSchema, 'llmCalls');
