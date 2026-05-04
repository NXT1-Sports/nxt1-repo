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
 * - { expiresAt: 1 } (TTL)       → Auto-delete old messages after retention period
 */

import { Schema, Model, type Connection } from 'mongoose';
import type { AgentMessage, AgentMessageRole, AgentMessageTokenUsage } from '@nxt1/core';
import type { AgentIdentifier, AgentJobOrigin, AgentToolCallRecord } from '@nxt1/core';
import { getMongoEnvironmentConnection } from '../../config/database.config.js';

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
  'admin_coordinator',
  'brand_coordinator',
  'data_coordinator',
  'strategy_coordinator',
  'recruiting_coordinator',
  'performance_coordinator',
];

const MESSAGE_ACTION_TYPES = [
  'copied',
  'viewed',
  'edited',
  'deleted',
  'undone',
  'feedback_submitted',
] as const;

const FEEDBACK_CATEGORIES = ['helpful', 'incorrect', 'incomplete', 'confusing', 'other'] as const;

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

const MessageEditRecordSchema = new Schema(
  {
    editedAt: { type: String, required: true },
    originalContent: { type: String, required: true },
    newContent: { type: String, required: true },
    reason: { type: String },
    agentRerunId: { type: String },
  },
  { _id: false, versionKey: false }
);

const MessageFeedbackSchema = new Schema(
  {
    userId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, maxlength: 500 },
    category: { type: String, enum: FEEDBACK_CATEGORIES },
    createdAt: { type: String, required: true },
  },
  { _id: false, versionKey: false }
);

const MessageActionRecordSchema = new Schema(
  {
    type: { type: String, required: true, enum: MESSAGE_ACTION_TYPES },
    userId: { type: String, required: true },
    timestamp: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false, versionKey: false }
);

// ─── Main Schema ────────────────────────────────────────────────────────────

const AGENT_MESSAGE_MODEL_NAME = 'AgentMessage';

const AgentMessageSchema = new Schema<AgentMessage>(
  {
    threadId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true, enum: MESSAGE_ROLES },
    /**
     * Text content of the message. NOT required — assistant messages that
     * contain only tool_calls (no text) legitimately have empty content.
     * Mongoose rejects empty strings with `required: true`, so we use a
     * default of '' to allow pure tool-call turns to persist correctly.
     */
    content: { type: String, default: '' },
    origin: { type: String, required: true, enum: JOB_ORIGINS },
    agentId: { type: String, enum: AGENT_IDS },
    operationId: { type: String },
    resultData: { type: Schema.Types.Mixed },
    toolCalls: { type: [ToolCallRecordSchema] },
    /**
     * Phase A (thread-as-truth): LLM wire-format tool_calls preserved
     * verbatim from OpenRouter so replay can reconstruct a structurally
     * valid LLMMessage[]. Stored alongside `toolCalls` (analytics-friendly
     * shape). Each entry: `{ id, type:'function', function:{name, arguments} }`.
     */
    toolCallsWire: { type: [Schema.Types.Mixed] },
    /**
     * Phase A (thread-as-truth): for role:'tool' messages, the id of the
     * assistant.tool_calls entry this row resolves. Sparse index — only
     * tool rows have it.
     */
    toolCallId: { type: String, sparse: true, index: true },
    steps: { type: [Schema.Types.Mixed] },
    parts: { type: [Schema.Types.Mixed] },
    attachments: { type: [Schema.Types.Mixed] },
    cards: { type: [Schema.Types.Mixed] },
    tokenUsage: { type: TokenUsageSchema },
    editHistory: { type: [MessageEditRecordSchema], default: [] },
    feedback: { type: MessageFeedbackSchema },
    actions: { type: [MessageActionRecordSchema], default: [] },
    deletedAt: { type: Date, default: null, sparse: true },
    deletedBy: { type: String, sparse: true },
    restoreTokenId: { type: String, sparse: true },
    // Phase 2: Vector embedding for Atlas Vector Search.
    // select: false prevents loading large arrays on every query.
    embedding: { type: [Number], select: false },
    createdAt: { type: String, required: true },
    /**
     * MongoDB TTL field — auto-deletes documents after this date.
     * Default: 90 days from creation. Set to null to retain indefinitely.
     */
    expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
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

// idempotencyKey: added via .add() (not in Schema<AgentMessage> constructor)
// because the @nxt1/core dist type may lag behind the source during
// Turborepo cached builds. The field is functionally identical — .add()
// accepts an untyped SchemaDefinition object and does NOT validate against
// the generic type parameter.
AgentMessageSchema.add({
  /**
   * Optional caller-supplied idempotency key. When present, a unique
   * sparse index prevents duplicate rows from worker retries or
   * concurrent writes for the same logical message (e.g. the worker's
   * final assistant persist on BullMQ retry). Callers use a stable
   * composite key such as `${operationId}:final-assistant`.
   */
  idempotencyKey: { type: String },
  /**
   * Semantic phase of this row in the agent's write lifecycle.
   * Enables UI projection to suppress `assistant_partial` rows when
   * `assistant_final` exists for the same operationId.
   * Sparse index — only tagged rows are indexed.
   */
  semanticPhase: { type: String },
});

// Prevents duplicate persists on worker retry or concurrent calls.
// Callers opt in by supplying a stable idempotencyKey; messages without
// one are unaffected (sparse index ignores null/undefined).
AgentMessageSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

// Phase-scoped lookup: find all rows for an operationId by their semantic phase.
// Used by analytics and the thread-history projection pipeline.
AgentMessageSchema.index({ operationId: 1, semanticPhase: 1 }, { sparse: true });

// Active vs soft-deleted message lookups.
AgentMessageSchema.index({ threadId: 1, deletedAt: 1, createdAt: 1 });

// Feedback and interaction analytics queries.
AgentMessageSchema.index({ 'feedback.userId': 1, createdAt: -1 }, { sparse: true });
AgentMessageSchema.index({ 'actions.type': 1, createdAt: -1 }, { sparse: true });

// TTL index — MongoDB automatically deletes documents once expiresAt is in the past.
// The `expireAfterSeconds: 0` means "expire exactly at the expiresAt date".
AgentMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Model ──────────────────────────────────────────────────────────────────

export function getAgentMessageModel(
  connection: Connection = getMongoEnvironmentConnection()
): Model<AgentMessage> {
  const existingModel = connection.models[AGENT_MESSAGE_MODEL_NAME] as
    | Model<AgentMessage>
    | undefined;
  if (existingModel) return existingModel;

  return connection.model<AgentMessage>(AGENT_MESSAGE_MODEL_NAME, AgentMessageSchema);
}

export const AgentMessageModel = new Proxy({} as Model<AgentMessage>, {
  get(_target, prop) {
    const model = getAgentMessageModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getAgentMessageModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getAgentMessageModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
