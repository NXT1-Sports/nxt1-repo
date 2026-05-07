/**
 * @fileoverview Agent Mutation Policy Outbox Model
 * @module @nxt1/backend/models/agent/agent-mutation-policy-outbox
 *
 * Durable idempotency ledger for post-mutation policy steps that must run
 * exactly once per mutation execution key.
 */

import { Schema, type Model, type Connection } from 'mongoose';
import { getMongoEnvironmentConnection } from '../../config/database.config.js';

export type AgentMutationPolicyStep = 'analytics' | 'sync_delta' | 'memory';

export interface AgentMutationPolicyOutboxEntry {
  _id: unknown;
  userId: string;
  toolName: string;
  operationId?: string;
  threadId?: string;
  sessionId?: string;
  executionKey: string;
  step: AgentMutationPolicyStep;
  status: 'completed' | 'failed';
  attempts: number;
  policyVersion: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: Date;
}

const AGENT_MUTATION_POLICY_OUTBOX_MODEL_NAME = 'AgentMutationPolicyOutbox';

const AgentMutationPolicyOutboxSchema = new Schema<AgentMutationPolicyOutboxEntry>(
  {
    userId: { type: String, required: true, index: true },
    toolName: { type: String, required: true, index: true },
    operationId: { type: String, index: true },
    threadId: { type: String, index: true },
    sessionId: { type: String, index: true },
    executionKey: { type: String, required: true },
    step: {
      type: String,
      required: true,
      enum: ['analytics', 'sync_delta', 'memory'],
    },
    status: {
      type: String,
      required: true,
      enum: ['completed', 'failed'],
      default: 'completed',
    },
    attempts: { type: Number, required: true, default: 1 },
    policyVersion: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    errorMessage: { type: String },
    completedAt: { type: String },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  { versionKey: false }
);

AgentMutationPolicyOutboxSchema.index({ executionKey: 1, step: 1 }, { unique: true });
AgentMutationPolicyOutboxSchema.index({ userId: 1, createdAt: -1 });
AgentMutationPolicyOutboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function getAgentMutationPolicyOutboxModel(
  connection: Connection = getMongoEnvironmentConnection()
): Model<AgentMutationPolicyOutboxEntry> {
  const existing = connection.models[AGENT_MUTATION_POLICY_OUTBOX_MODEL_NAME] as
    | Model<AgentMutationPolicyOutboxEntry>
    | undefined;
  if (existing) return existing;

  return connection.model<AgentMutationPolicyOutboxEntry>(
    AGENT_MUTATION_POLICY_OUTBOX_MODEL_NAME,
    AgentMutationPolicyOutboxSchema
  );
}

export const AgentMutationPolicyOutboxModel = new Proxy(
  {} as Model<AgentMutationPolicyOutboxEntry>,
  {
    get(_target, prop) {
      const model = getAgentMutationPolicyOutboxModel();
      const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === 'function' ? value.bind(model) : value;
    },
    has(_target, prop) {
      const model = getAgentMutationPolicyOutboxModel();
      return prop in model;
    },
    getOwnPropertyDescriptor(_target, prop) {
      const model = getAgentMutationPolicyOutboxModel() as unknown as Record<PropertyKey, unknown>;
      const value = model[prop];
      if (value === undefined) return undefined;
      return { configurable: true, enumerable: true, writable: true, value };
    },
  }
);
