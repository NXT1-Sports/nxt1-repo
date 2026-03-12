/**
 * @fileoverview AgentThread Mongoose Model
 * @module @nxt1/backend/models/agent-thread
 *
 * Mongoose schema and model for the `agentThreads` collection.
 * Each document represents a conversation thread between a user
 * and Agent X, containing metadata for sidebar listing, sorting,
 * and filtering.
 *
 * Indexes:
 * - { userId, lastMessageAt: -1 }  → Fast thread listing per user (default sort)
 * - { userId, archived }            → Filter archived threads
 */

import { model, Schema, Model } from 'mongoose';
import type { AgentThread, AgentThreadCategory, AgentIdentifier } from '@nxt1/core';

// ─── Category & Agent enums (for Mongoose validation) ───────────────────────

const THREAD_CATEGORIES: readonly AgentThreadCategory[] = [
  'general',
  'recruiting',
  'highlights',
  'graphics',
  'scouting',
  'analytics',
  'compliance',
  'performance',
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

// ─── Schema ─────────────────────────────────────────────────────────────────

const AgentThreadSchema = new Schema<AgentThread>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, default: 'New Conversation' },
    category: { type: String, enum: THREAD_CATEGORIES },
    lastAgentId: { type: String, enum: AGENT_IDS },
    lastMessageAt: { type: String, required: true },
    messageCount: { type: Number, required: true, default: 0 },
    archived: { type: Boolean, required: true, default: false },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

// ─── Compound Indexes ───────────────────────────────────────────────────────

// Primary listing: user's threads sorted by most recent activity
AgentThreadSchema.index({ userId: 1, lastMessageAt: -1 });

// Archived filter
AgentThreadSchema.index({ userId: 1, archived: 1 });

// ─── Model ──────────────────────────────────────────────────────────────────

export const AgentThreadModel: Model<AgentThread> = model<AgentThread>(
  'AgentThread',
  AgentThreadSchema
);
