/**
 * @fileoverview Agent Chat Service — Thread & Message Persistence
 * @module @nxt1/backend/modules/agent/services
 *
 * CRUD operations for Agent X conversation history in MongoDB.
 * This service is the single access point for reading/writing
 * threads and messages. The worker calls it after completing a
 * job to persist the assistant reply, and the routes call it
 * to serve chat history to the frontend.
 *
 * Architecture:
 * ┌──────────────┐     ┌───────────────────┐     ┌──────────────┐
 * │ Agent Worker  │ ──► │ AgentChatService  │ ──► │ MongoDB      │
 * │ (on complete) │     │ (this file)       │     │ (threads +   │
 * └──────────────┘     └───────────────────┘     │  messages)   │
 *                              ▲                  └──────────────┘
 * ┌──────────────┐             │
 * │ agent-x.routes│ ───────────┘
 * │ GET /threads  │
 * └──────────────┘
 *
 * Thread lifecycle:
 * 1. User sends first prompt → createThread() + addMessage(user) + addMessage(assistant)
 * 2. User sends follow-up   → addMessage(user) + addMessage(assistant) (same thread)
 * 3. User archives thread   → archiveThread()
 */

import type {
  AgentThread,
  AgentMessage,
  AgentMessageRole,
  AgentJobOrigin,
  AgentIdentifier,
  AgentToolCallRecord,
  AgentMessageTokenUsage,
  AgentThreadCategory,
  AgentThreadQuery,
  AgentMessageQuery,
  PaginatedResult,
} from '@nxt1/core';
import { AgentThreadModel } from '../../../models/agent-thread.model.js';
import { AgentMessageModel } from '../../../models/agent-message.model.js';
import { logger } from '../../../utils/logger.js';

// ─── Service ────────────────────────────────────────────────────────────────

export class AgentChatService {
  // ─── Thread Operations ──────────────────────────────────────────────────

  /**
   * Create a new conversation thread.
   * Called when the user sends their first message (no existing threadId).
   */
  async createThread(params: {
    userId: string;
    title?: string;
    category?: AgentThreadCategory;
  }): Promise<AgentThread> {
    const now = new Date().toISOString();

    const doc = await AgentThreadModel.create({
      userId: params.userId,
      title: params.title ?? 'New Conversation',
      category: params.category,
      lastMessageAt: now,
      messageCount: 0,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });

    logger.info('[AgentChatService] Thread created', {
      threadId: doc.id,
      userId: params.userId,
    });

    return this.toThread(doc);
  }

  /**
   * List threads for a user with cursor-based pagination.
   * Sorted by most recent activity (lastMessageAt descending).
   */
  async getUserThreads(query: AgentThreadQuery): Promise<PaginatedResult<AgentThread>> {
    const limit = Math.min(query.limit ?? 20, 100);

    const filter: Record<string, unknown> = { userId: query.userId };
    if (query.archived !== undefined) filter['archived'] = query.archived;
    if (query.category) filter['category'] = query.category;
    if (query.before) filter['lastMessageAt'] = { $lt: query.before };

    const docs = await AgentThreadModel.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const hasMore = docs.length > limit;
    const items = docs.slice(0, limit).map((d) => this.toThread(d));
    const nextCursor = hasMore ? items[items.length - 1]?.lastMessageAt : undefined;

    return { items, hasMore, nextCursor };
  }

  /**
   * Get a single thread by ID (with ownership check).
   */
  async getThread(threadId: string, userId: string): Promise<AgentThread | null> {
    const doc = await AgentThreadModel.findOne({ _id: threadId, userId }).lean().exec();
    return doc ? this.toThread(doc) : null;
  }

  /**
   * Archive (soft-hide) a thread. Does NOT delete messages.
   */
  async archiveThread(threadId: string, userId: string): Promise<boolean> {
    const result = await AgentThreadModel.updateOne(
      { _id: threadId, userId },
      { $set: { archived: true, updatedAt: new Date().toISOString() } }
    ).exec();
    return result.modifiedCount > 0;
  }

  /**
   * Update thread title (user rename or auto-generated summary).
   */
  async updateThreadTitle(threadId: string, userId: string, title: string): Promise<boolean> {
    const result = await AgentThreadModel.updateOne(
      { _id: threadId, userId },
      { $set: { title, updatedAt: new Date().toISOString() } }
    ).exec();
    return result.modifiedCount > 0;
  }

  // ─── Message Operations ─────────────────────────────────────────────────

  /**
   * Add a message to a thread and update thread metadata.
   * This is the primary write path — called for both user prompts
   * and assistant replies.
   */
  async addMessage(params: {
    threadId: string;
    userId: string;
    role: AgentMessageRole;
    content: string;
    origin: AgentJobOrigin;
    agentId?: AgentIdentifier;
    operationId?: string;
    resultData?: Record<string, unknown>;
    toolCalls?: readonly AgentToolCallRecord[];
    tokenUsage?: AgentMessageTokenUsage;
  }): Promise<AgentMessage> {
    const now = new Date().toISOString();

    // Create the message document
    const doc = await AgentMessageModel.create({
      threadId: params.threadId,
      userId: params.userId,
      role: params.role,
      content: params.content,
      origin: params.origin,
      agentId: params.agentId,
      operationId: params.operationId,
      resultData: params.resultData,
      toolCalls: params.toolCalls,
      tokenUsage: params.tokenUsage,
      createdAt: now,
    });

    // Update thread metadata (last message time, count, last agent)
    // Must use $set + $inc explicitly — MongoDB rejects mixing bare fields with atomic operators
    const $set: Record<string, unknown> = {
      lastMessageAt: now,
      updatedAt: now,
    };
    if (params.agentId) {
      $set['lastAgentId'] = params.agentId;
    }

    await AgentThreadModel.updateOne(
      { _id: params.threadId, userId: params.userId },
      { $set, $inc: { messageCount: 1 } }
    ).exec();

    logger.info('[AgentChatService] Message added', {
      messageId: doc.id,
      threadId: params.threadId,
      role: params.role,
    });

    return this.toMessage(doc);
  }

  /**
   * Get messages for a thread with cursor-based pagination.
   * Returns messages in chronological order (oldest first).
   */
  async getThreadMessages(query: AgentMessageQuery): Promise<PaginatedResult<AgentMessage>> {
    const limit = Math.min(query.limit ?? 50, 200);

    const filter: Record<string, unknown> = { threadId: query.threadId };
    if (query.before) filter['createdAt'] = { $lt: query.before };

    const docs = await AgentMessageModel.find(filter)
      .sort({ createdAt: 1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const hasMore = docs.length > limit;
    const items = docs.slice(0, limit).map((d) => this.toMessage(d));
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt : undefined;

    return { items, hasMore, nextCursor };
  }

  // ─── Document → Interface Mappers ───────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toThread(doc: any): AgentThread {
    return {
      id: String(doc._id),
      userId: doc.userId,
      title: doc.title,
      category: doc.category,
      lastAgentId: doc.lastAgentId,
      lastMessageAt: doc.lastMessageAt,
      messageCount: doc.messageCount,
      archived: doc.archived,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toMessage(doc: any): AgentMessage {
    return {
      id: String(doc._id),
      threadId: doc.threadId,
      userId: doc.userId,
      role: doc.role,
      content: doc.content,
      origin: doc.origin,
      agentId: doc.agentId,
      operationId: doc.operationId,
      resultData: doc.resultData,
      toolCalls: doc.toolCalls,
      tokenUsage: doc.tokenUsage,
      embedding: doc.embedding,
      createdAt: doc.createdAt,
    };
  }
}
