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
 * - { expiresAt: 1 } (TTL)          → Auto-delete old threads after retention period
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

/**
 * Extended thread document with backend-only fields not exposed in the core type.
 * `memorySummarized` is used exclusively by the cron-based MemorySummarizationService.
 */
interface AgentThreadDocument extends AgentThread {
  memorySummarized?: boolean;
  mediaCleaned?: boolean;
}

const AgentThreadSchema = new Schema<AgentThreadDocument>(
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
    /**
     * MongoDB TTL field — auto-deletes threads after this date.
     * Default: 180 days from creation (6 months). Set to null to retain indefinitely.
     */
    expiresAt: { type: Date, default: () => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) },
    /**
     * Whether this thread's messages have been summarized into long-term vector memory.
     * Set to true by the MemorySummarizationService after successful extraction.
     * Used to avoid re-processing threads on subsequent cron runs.
     */
    memorySummarized: { type: Boolean, default: false },
    /**
     * Whether this thread's staged media has been cleaned up from Firebase Storage.
     * Set to true by the cleanup-thread-media cron after deleting the media folder.
     * Prevents re-processing on subsequent cron runs.
     */
    mediaCleaned: { type: Boolean, default: false },
  },
  { versionKey: false }
);

// ─── Compound Indexes ───────────────────────────────────────────────────────

// Primary listing: user's threads sorted by most recent activity
AgentThreadSchema.index({ userId: 1, lastMessageAt: -1 });

// Archived filter
AgentThreadSchema.index({ userId: 1, archived: 1 });

// TTL index — MongoDB automatically deletes threads once expiresAt is in the past.
AgentThreadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Cron: find unsummarized threads with old lastMessageAt for memory extraction
AgentThreadSchema.index({ memorySummarized: 1, lastMessageAt: 1 });

// Cron: find threads about to expire whose media hasn't been cleaned
AgentThreadSchema.index({ mediaCleaned: 1, expiresAt: 1 });

// ─── Model ──────────────────────────────────────────────────────────────────

export const AgentThreadModel: Model<AgentThreadDocument> = model<AgentThreadDocument>(
  'AgentThread',
  AgentThreadSchema
);
