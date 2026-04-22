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
import { AgentThreadModel } from '../../../models/agent/agent-thread.model.js';
import { AgentMessageModel } from '../../../models/agent/agent-message.model.js';
import { logger } from '../../../utils/logger.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { AgentQueueService } from '../queue/queue.service.js';
import type { SessionMemoryService } from '../memory/session.service.js';

/**
 * System prompt for auto-generating short conversation titles.
 * Uses a cheap/fast model to summarize the user's intent into 3-6 words.
 */
const TITLE_GENERATION_PROMPT = `You are a concise title generator. Given a user message and optionally an assistant reply from a sports AI platform, generate a short descriptive title (3-6 words) that captures the user's intent. Rules:
- Output ONLY the title text, nothing else
- No quotes, no punctuation at the end
- Use title case
- Be specific to the content (e.g. "Ohio D2 College Search" not "College Question")
- If sports-related, include the sport/context when relevant
- Maximum 50 characters`;

const OPERATION_TITLE_GENERATION_PROMPT = `You are a concise activity title generator. Given a user message and an assistant reply from a sports AI platform, generate a short descriptive action title (6-8 words) for an activity feed item or push notification. Rules:
- Output ONLY the title text, nothing else
- No quotes, no punctuation at the end
- Use title case
- Be specific to the completed action, not generic
- Focus on the finished outcome, not the request itself
- Maximum 60 characters`;

// ─── Service ────────────────────────────────────────────────────────────────

export class AgentChatService {
  constructor(
    private readonly queueService?: AgentQueueService,
    private readonly sessionMemory?: SessionMemoryService
  ) {}

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
    const normalizedTitle = params.title?.trim().slice(0, 80);

    const doc = await AgentThreadModel.create({
      userId: params.userId,
      ...(normalizedTitle ? { title: normalizedTitle } : {}),
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
   * Atomically create a thread seeded with the first user message.
   *
   * Used by both the interactive chat route and background jobs
   * (linked-account scraping, etc.) so every thread starts with a
   * human-readable title derived from the prompt.
   */
  async startConversation(params: {
    userId: string;
    prompt: string;
    category?: AgentThreadCategory;
    origin?: AgentJobOrigin;
  }): Promise<{ thread: AgentThread; message: AgentMessage }> {
    const title = params.prompt.trim().slice(0, 80);

    const thread = await this.createThread({
      userId: params.userId,
      ...(title ? { title } : {}),
      category: params.category,
    });

    const message = await this.addMessage({
      threadId: thread.id,
      userId: params.userId,
      role: 'user' as AgentMessageRole,
      content: params.prompt,
      origin: params.origin ?? 'user',
    });

    logger.info('[AgentChatService] Conversation started', {
      threadId: thread.id,
      userId: params.userId,
      titleLength: title.length,
    });

    return { thread, message };
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
   * Also clears the Redis session cache for this thread so stale state
   * never lingers after the thread is removed from the user's view.
   */
  async archiveThread(threadId: string, userId: string): Promise<boolean> {
    const result = await AgentThreadModel.updateOne(
      { _id: threadId, userId },
      { $set: { archived: true, updatedAt: new Date().toISOString() } }
    ).exec();

    if (result.modifiedCount > 0 && this.sessionMemory) {
      // Fire-and-forget — Redis clear is best-effort; TTL will handle it if this fails
      this.sessionMemory.clear(userId, threadId).catch((err) => {
        logger.warn('[AgentChatService] Failed to clear session memory on archive', {
          threadId,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

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

  async generateOperationTitle(
    userMessage: string,
    assistantReply: string,
    llmService: OpenRouterService
  ): Promise<string | null> {
    try {
      return this.requestGeneratedTitle(
        userMessage,
        assistantReply,
        llmService,
        OPERATION_TITLE_GENERATION_PROMPT,
        60
      );
    } catch (err) {
      logger.warn('[AgentChatService] Failed to auto-generate operation title', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async applyGeneratedThreadTitle(
    threadId: string,
    userId: string,
    userMessage: string,
    generatedTitle: string
  ): Promise<string | null> {
    const thread = await this.getThread(threadId, userId);
    if (!thread) return null;

    const promptPrefix = userMessage.trim().slice(0, 80);
    if (thread.title !== promptPrefix && thread.title.trim().length > 0) {
      return null;
    }

    const updated = await this.updateThreadTitle(threadId, userId, generatedTitle);
    if (updated) {
      logger.info('[AgentChatService] Thread title auto-generated', {
        threadId,
        title: generatedTitle,
      });
    }

    return generatedTitle;
  }

  /**
   * Auto-generate a concise thread title using a cheap/fast LLM model.
   *
   * Called asynchronously (fire-and-forget) after the first assistant response
   * in a new thread. Only runs on the first turn — subsequent messages do not
   * regenerate the title.
   *
   * @returns The generated title, or `null` if generation failed.
   */
  async generateThreadTitle(
    threadId: string,
    userId: string,
    userMessage: string,
    assistantReply: string,
    llmService: OpenRouterService
  ): Promise<string | null> {
    try {
      const generatedTitle = await this.requestGeneratedTitle(
        userMessage,
        assistantReply,
        llmService,
        TITLE_GENERATION_PROMPT,
        50
      );

      if (!generatedTitle) return null;

      return this.applyGeneratedThreadTitle(threadId, userId, userMessage, generatedTitle);
    } catch (err) {
      logger.warn('[AgentChatService] Failed to auto-generate thread title', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async requestGeneratedTitle(
    userMessage: string,
    assistantReply: string,
    llmService: OpenRouterService,
    prompt: string,
    maxLength: number
  ): Promise<string | null> {
    const result = await llmService.complete(
      [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `User message: "${userMessage.trim().slice(0, 200)}"\n\nAssistant reply (first 200 chars): "${assistantReply.trim().slice(0, 200)}"`,
        },
      ],
      { tier: 'extraction', maxTokens: 60, temperature: 0.3 }
    );

    const generatedTitle = (result.content ?? '')
      .replace(/^["']|["']$/g, '')
      .replace(/[.!?]+$/, '')
      .trim()
      .slice(0, maxLength);

    return generatedTitle || null;
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
    steps?: readonly import('@nxt1/core').AgentXToolStep[];
    parts?: readonly import('@nxt1/core').AgentXMessagePart[];
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
      steps: params.steps,
      parts: params.parts,
      tokenUsage: params.tokenUsage,
      createdAt: now,
    });

    // Update thread metadata (last message time, count, last agent)
    // Must use $set + $inc explicitly — MongoDB rejects mixing bare fields with atomic operators
    const $set: Record<string, unknown> = {
      lastMessageAt: now,
      updatedAt: now,
      memorySummarized: false,
    };
    if (params.agentId) {
      $set['lastAgentId'] = params.agentId;
    }

    await AgentThreadModel.updateOne(
      { _id: params.threadId, userId: params.userId },
      { $set, $inc: { messageCount: 1 } }
    ).exec();

    if (this.queueService) {
      try {
        await this.queueService.enqueueThreadSummarization(params.threadId, params.userId);
      } catch (err) {
        logger.warn('[AgentChatService] Failed to enqueue idle summarization', {
          threadId: params.threadId,
          userId: params.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const hasMore = docs.length > limit;
    const page = docs.slice(0, limit);
    const nextCursor = hasMore ? page[page.length - 1]?.createdAt : undefined;
    const items = page.reverse().map((d) => this.toMessage(d));

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
      steps: doc.steps,
      parts: doc.parts,
      tokenUsage: doc.tokenUsage,
      embedding: doc.embedding,
      createdAt: doc.createdAt,
    };
  }
}
