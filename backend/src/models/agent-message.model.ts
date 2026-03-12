/**
 * @fileoverview AgentMessage Mongoose Model
 * @module @nxt1/backend/models/agent-message
 *
 * Mongoose schema and model for the `agentMessages` collection.
 * Each document is a single message within an AgentThread — either
 * a user prompt, assistant reply, system note, or tool output.
 *
 * The `embedding` field is reserved for Phase 2 (MongoDB Atlas Vector Search).
 * When populated, it enables semantic retrieval of past conversation context
 * for RAG-style memory injection.
 *
 * Indexes:
 * - { threadId, createdAt: 1 }   → Chronological message listing within a thread
 * - { userId, createdAt: -1 }    → Cross-thread search for a user's messages
 * - { operationId }              → Link messages to background operations
 */

import { model, Schema, Model } from 'mongoose';
import type { AgentMessage, AgentMessageRole, AgentMessageTokenUsage } from '@nxt1/core';
import type { AgentIdentifier, AgentJobOrigin, AgentToolCallRecord } from '@nxt1/core';

// ─── Enum values for Mongoose validation ────────────────────────────────────

const MESSAGE_ROLES: readonly AgentMessageRole[] = ['user', 'assistant', 'system', 'tool'];

const JOB_ORIGINS: readonly AgentJobOrigin[] = [
  'user',
  'system_cron',
  'database_event',
  'webhook',
  'agent_chain',
];

const AGENT_IDS: readonly AgentIdentifier[] = [
  'router',
  'data_coordinator',
  'recruiting_coordinator',
  'brand_media_coordinator',
  'performance_coordinator',
  'compliance_coordinator',
  'general',
];

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const ToolCallRecordSchema = new Schema<AgentToolCallRecord>(
  {
    toolName: { type: String, required: true },
    input: { type: Schema.Types.Mixed, required: true },
    output: { type: Schema.Types.Mixed },
    durationMs: { type: Number },
    status: {
      type: String,
      required: true,
      enum: ['success', 'error', 'blocked_by_guardrail'],
    },
    timestamp: { type: String, required: true },
  },
  { _id: false, versionKey: false }
);

const TokenUsageSchema = new Schema<AgentMessageTokenUsage>(
  {
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    model: { type: String, required: true },
    costUsd: { type: Number },
  },
  { _id: false, versionKey: false }
);

// ─── Main Schema ────────────────────────────────────────────────────────────

const AgentMessageSchema = new Schema<AgentMessage>(
  {
    threadId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true, enum: MESSAGE_ROLES },
    content: { type: String, required: true },
    origin: { type: String, required: true, enum: JOB_ORIGINS },
    agentId: { type: String, enum: AGENT_IDS },
    operationId: { type: String },
    resultData: { type: Schema.Types.Mixed },
    toolCalls: { type: [ToolCallRecordSchema] },
    tokenUsage: { type: TokenUsageSchema },
    // Phase 2: Vector embedding for Atlas Vector Search.
    // select: false prevents loading large arrays on every query.
    embedding: { type: [Number], select: false },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

// ─── Compound Indexes ───────────────────────────────────────────────────────

// Chronological listing within a thread (primary query)
AgentMessageSchema.index({ threadId: 1, createdAt: 1 });

// Cross-thread search sorted by recency
AgentMessageSchema.index({ userId: 1, createdAt: -1 });

// Sparse index on operationId (most messages won't have one)
AgentMessageSchema.index({ operationId: 1 }, { sparse: true });

// ─── Model ──────────────────────────────────────────────────────────────────

export const AgentMessageModel: Model<AgentMessage> = model<AgentMessage>(
  'AgentMessage',
  AgentMessageSchema
);
