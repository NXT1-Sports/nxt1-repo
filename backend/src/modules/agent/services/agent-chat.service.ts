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
  AgentMessageActionType,
  AgentMessageFeedback,
  AgentJobOrigin,
  AgentIdentifier,
  AgentToolCallRecord,
  AgentMessageTokenUsage,
  AgentThreadCategory,
  AgentThreadQuery,
  AgentMessageQuery,
  PaginatedResult,
  AgentXAttachment,
  AgentYieldState,
} from '@nxt1/core';
import { AgentThreadModel } from '../../../models/agent/agent-thread.model.js';
import { AgentMessageModel } from '../../../models/agent/agent-message.model.js';
import { AgentUploadOutboxModel } from '../../../models/agent/agent-upload-outbox.model.js';
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

/**
 * Prompt used by generateTitleFromPromptOnly — takes only the user's message,
 * no assistant reply needed. Optimised for sub-500ms latency.
 */
const PROMPT_ONLY_TITLE_GENERATION_PROMPT = `You are a concise title generator for a sports AI platform. Given only the user's message, generate a short descriptive title (3-6 words) that captures their intent. Rules:
- Output ONLY the title text, nothing else
- No quotes, no punctuation at the end
- Use title case
- Be specific (e.g. "Ohio D2 College Search" not "College Question")
- Include sport/context when relevant
- Maximum 50 characters`;

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

  /**
   * Store paused yield state on thread so it survives session re-entry.
   * Called when an operation is paused; persists Resume card UI state to MongoDB.
   */
  async updateThreadPausedYieldState(
    threadId: string,
    yieldState: AgentYieldState
  ): Promise<boolean> {
    const result = await AgentThreadModel.updateOne(
      { _id: threadId },
      { $set: { latestPausedYieldState: yieldState, updatedAt: new Date().toISOString() } }
    ).exec();
    return result.modifiedCount > 0;
  }

  /**
   * Clear paused yield state from thread after operation resumes or is cancelled.
   * Prevents stale Resume card from appearing after workflow completes.
   */
  async clearThreadPausedYieldState(threadId: string): Promise<boolean> {
    const result = await AgentThreadModel.updateOne(
      { _id: threadId },
      { $set: { latestPausedYieldState: null, updatedAt: new Date().toISOString() } }
    ).exec();
    return result.modifiedCount > 0;
  }

  /**
   * Fetch thread with all metadata including paused yield state.
   * Used by routes that need to return complete thread info in response.
   */
  async getThreadWithMetadata(
    threadId: string,
    userId: string
  ): Promise<(AgentThread & { latestPausedYieldState?: unknown }) | null> {
    const doc = await AgentThreadModel.findOne({
      _id: threadId,
      userId,
    })
      .lean()
      .exec();

    if (!doc) return null;

    return {
      ...this.toThread(doc),
      latestPausedYieldState: doc.latestPausedYieldState ?? null,
    };
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
   * Generate a concise thread title from the user's prompt alone.
   *
   * Fires immediately after thread creation — no assistant reply needed.
   * Uses a prompt-only input so it completes in ~300-600ms (well before the
   * first agent token arrives), enabling instant title display in the sidebar.
   *
   * Does NOT call applyGeneratedThreadTitle — the caller is responsible for
   * applying the title and emitting the SSE event.
   *
   * @returns The generated title string, or null if generation failed.
   */
  async generateTitleFromPromptOnly(
    prompt: string,
    llmService: OpenRouterService
  ): Promise<string | null> {
    try {
      const result = await llmService.complete(
        [
          { role: 'system', content: PROMPT_ONLY_TITLE_GENERATION_PROMPT },
          { role: 'user', content: `User prompt: "${prompt.trim().slice(0, 300)}"` },
        ],
        { tier: 'extraction', maxTokens: 50, temperature: 0.3 }
      );
      const title = (result.content ?? '')
        .replace(/^["']|["']$/g, '')
        .replace(/[.!?]+$/, '')
        .trim()
        .slice(0, 50);
      return title || null;
    } catch (err) {
      logger.warn('[AgentChatService] Failed to generate title from prompt only', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
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
    attachments?: readonly AgentXAttachment[];
    resultData?: Record<string, unknown>;
    toolCalls?: readonly AgentToolCallRecord[];
    /**
     * Phase A (thread-as-truth): wire-format LLM tool_calls preserved
     * verbatim from OpenRouter. Persisted alongside `toolCalls` so
     * `ThreadMessageReplayService` can reconstruct a structurally-valid
     * `LLMMessage[]` on the next turn without reverse-engineering the
     * analytics-friendly shape.
     */
    toolCallsWire?: readonly import('../llm/llm.types.js').LLMToolCall[];
    /**
     * Phase A (thread-as-truth): for `role:'tool'` rows, the id of the
     * assistant.tool_calls entry this row resolves.
     */
    toolCallId?: string;
    steps?: readonly import('@nxt1/core').AgentXToolStep[];
    parts?: readonly import('@nxt1/core').AgentXMessagePart[];
    tokenUsage?: AgentMessageTokenUsage;
    /**
     * Optional caller-supplied idempotency key. When set, a unique sparse
     * index on the `AgentMessage` collection guarantees exactly-once
     * persistence across BullMQ retries. If the key was already used, the
     * existing document is returned and thread metadata is NOT re-incremented.
     * Use a stable composite key such as `${operationId}:final-assistant`.
     */
    idempotencyKey?: string;
    /**
     * Semantic phase of this row in the agent's write lifecycle.
     * When `assistant_final` exists for an operationId, the UI projection
     * suppresses all `assistant_partial` rows for that same operationId so
     * pause/resume flows never render two assistant bubbles for one turn.
     */
    semanticPhase?: import('@nxt1/core').AgentMessageSemanticPhase;
  }): Promise<AgentMessage> {
    const now = new Date().toISOString();

    const docFields = {
      threadId: params.threadId,
      userId: params.userId,
      role: params.role,
      content: params.content,
      origin: params.origin,
      agentId: params.agentId,
      operationId: params.operationId,
      attachments: params.attachments,
      resultData: params.resultData,
      toolCalls: params.toolCalls,
      toolCallsWire: params.toolCallsWire,
      toolCallId: params.toolCallId,
      steps: params.steps,
      parts: params.parts,
      tokenUsage: params.tokenUsage,
      semanticPhase: params.semanticPhase,
      createdAt: now,
    };

    // Create the message document. When an idempotencyKey is supplied we do
    // an optimistic insert and catch the E11000 duplicate-key error so that
    // BullMQ job retries and concurrent writes never produce extra rows.
    // Use findOne's return type (NonNullable variant) so TypeScript resolves
    // the single-document overload rather than the array rest-param overload.
    let doc: NonNullable<Awaited<ReturnType<typeof AgentMessageModel.findOne>>>;
    if (params.idempotencyKey) {
      try {
        doc = await AgentMessageModel.create(
          // Cast through unknown — the @nxt1/core dist type may lag behind
          // source during Turbo cached builds. The idempotencyKey field is
          // valid at runtime once AgentMessageSchema.add() registers it.
          { ...docFields, idempotencyKey: params.idempotencyKey } as unknown as typeof docFields
        );
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) {
          // Duplicate key — return the already-persisted message as-is.
          const existing = await AgentMessageModel.findOne({
            idempotencyKey: params.idempotencyKey,
          }).exec();
          if (!existing) throw err; // Should never happen; re-throw to surface the issue.
          logger.info('[AgentChatService] Idempotent duplicate — returning existing message', {
            idempotencyKey: params.idempotencyKey,
            existingId: existing.id,
          });
          return this.toMessage(existing);
        }
        throw err;
      }
    } else {
      doc = await AgentMessageModel.create(docFields);
    }

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

    const filter: Record<string, unknown> = { threadId: query.threadId, deletedAt: null };
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

  /**
   * Fetch a single active message by ID with user ownership enforcement.
   */
  async getMessageById(messageId: string, userId: string): Promise<AgentMessage | null> {
    const doc = await AgentMessageModel.findOne({
      _id: messageId,
      userId,
      deletedAt: null,
    })
      .lean()
      .exec();

    return doc ? this.toMessage(doc) : null;
  }

  /**
   * Write an attachment to the durable upload outbox.
   *
   * Called by the sync endpoint when the target user message cannot be found
   * yet (race condition: TUS upload finished, browser called sync, but the
   * `/chat` POST that persists the message hasn't committed yet).
   *
   * The thread-load reconciler (reconcileUploadOutboxForThread) applies
   * pending entries automatically on the next GET /threads/:threadId/messages.
   */
  async queueAttachmentSync(params: {
    userId: string;
    idempotencyKey: string;
    attachment: AgentXAttachment;
  }): Promise<void> {
    const now = new Date().toISOString();
    await AgentUploadOutboxModel.create({
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      attachment: params.attachment,
      status: 'pending',
      createdAt: now,
    });

    logger.info('[AgentChatService] Upload attachment queued to outbox', {
      idempotencyKey: params.idempotencyKey,
      attachmentId: params.attachment.id,
      userId: params.userId,
    });
  }

  /**
   * Reconcile pending upload-outbox entries for a loaded thread.
   *
   * Collects idempotency keys from user messages, finds matching pending
   * outbox entries, applies each one via syncMessageAttachmentByIdempotencyKey,
   * and marks them synced. Returns the updated message array.
   *
   * Safe to call on every thread-messages load — it is a no-op when the
   * outbox has no pending entries for this user.
   */
  async reconcileUploadOutboxForThread(params: {
    userId: string;
    messages: AgentMessage[];
  }): Promise<AgentMessage[]> {
    const { userId, messages } = params;

    // Collect idempotency keys present on user messages
    const idempotencyKeys = messages
      .filter(
        (m) =>
          m.role === 'user' &&
          typeof (m as unknown as Record<string, unknown>)['idempotencyKey'] === 'string'
      )
      .map((m) => (m as unknown as Record<string, unknown>)['idempotencyKey'] as string);

    if (idempotencyKeys.length === 0) return messages;

    const pendingEntries = await AgentUploadOutboxModel.find({
      userId,
      idempotencyKey: { $in: idempotencyKeys },
      status: 'pending',
    })
      .lean()
      .exec();

    if (pendingEntries.length === 0) return messages;

    logger.info('[AgentChatService] Reconciling upload outbox entries for thread', {
      userId,
      pendingCount: pendingEntries.length,
    });

    let updatedMessages = [...messages];
    const syncedAt = new Date().toISOString();

    for (const entry of pendingEntries) {
      try {
        const updated = await this.syncMessageAttachmentByIdempotencyKey({
          userId,
          idempotencyKey: entry.idempotencyKey,
          attachment: entry.attachment as AgentXAttachment,
        });

        if (updated) {
          await AgentUploadOutboxModel.updateOne(
            { _id: entry._id },
            { $set: { status: 'synced', syncedAt } }
          ).exec();

          updatedMessages = updatedMessages.map((m) => (m.id === updated.id ? updated : m));

          logger.info('[AgentChatService] Upload outbox entry reconciled', {
            idempotencyKey: entry.idempotencyKey,
            attachmentId: (entry.attachment as AgentXAttachment).id,
            messageId: updated.id,
          });
        }
      } catch (err) {
        logger.warn('[AgentChatService] Failed to reconcile upload outbox entry', {
          idempotencyKey: entry.idempotencyKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return updatedMessages;
  }

  async syncMessageAttachmentByIdempotencyKey(params: {
    userId: string;
    idempotencyKey: string;
    attachment: AgentXAttachment;
  }): Promise<AgentMessage | null> {
    const existing = await AgentMessageModel.findOne({
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      role: 'user',
      deletedAt: null,
    })
      .lean()
      .exec();

    if (!existing) {
      return null;
    }

    const currentAttachments = Array.isArray(existing.attachments) ? existing.attachments : [];
    const nextAttachments = [
      ...currentAttachments.filter((attachment) => attachment?.id !== params.attachment.id),
      params.attachment,
    ];

    const doc = await AgentMessageModel.findOneAndUpdate(
      {
        _id: existing._id,
        userId: params.userId,
        deletedAt: null,
      },
      {
        $set: {
          attachments: nextAttachments,
        },
      },
      { new: true }
    )
      .lean()
      .exec();

    return doc ? this.toMessage(doc) : null;
  }

  /**
   * Find the next active assistant reply after a specific message.
   */
  async getNextAssistantMessage(threadId: string, createdAt: string): Promise<AgentMessage | null> {
    const doc = await AgentMessageModel.findOne({
      threadId,
      role: 'assistant',
      deletedAt: null,
      createdAt: { $gt: createdAt },
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return doc ? this.toMessage(doc) : null;
  }

  /**
   * Resolve the latest persisted assistant message linked to an operation.
   * Used by SSE fallback/synthetic terminal paths to preserve canonical
   * MongoDB message IDs even when the terminal event must be reconstructed.
   */
  async getLatestAssistantMessageForOperation(operationId: string): Promise<AgentMessage | null> {
    const doc = await AgentMessageModel.findOne({
      operationId,
      role: 'assistant',
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return doc ? this.toMessage(doc) : null;
  }

  /**
   * Update a user-authored message and append immutable edit history.
   */
  async editUserMessage(params: {
    messageId: string;
    userId: string;
    threadId: string;
    newContent: string;
    reason?: string;
    agentRerunId?: string;
  }): Promise<AgentMessage | null> {
    const existing = await AgentMessageModel.findOne({
      _id: params.messageId,
      userId: params.userId,
      threadId: params.threadId,
      role: 'user',
      deletedAt: null,
    })
      .lean()
      .exec();

    if (!existing) return null;

    const nowIso = new Date().toISOString();
    const doc = await AgentMessageModel.findOneAndUpdate(
      { _id: params.messageId },
      {
        $set: { content: params.newContent },
        $push: {
          editHistory: {
            editedAt: nowIso,
            originalContent: existing.content,
            newContent: params.newContent,
            ...(params.reason ? { reason: params.reason } : {}),
            ...(params.agentRerunId ? { agentRerunId: params.agentRerunId } : {}),
          },
          actions: {
            type: 'edited' as AgentMessageActionType,
            userId: params.userId,
            timestamp: nowIso,
            metadata: {
              ...(params.reason ? { reason: params.reason } : {}),
              ...(params.agentRerunId ? { agentRerunId: params.agentRerunId } : {}),
            },
          },
        },
      },
      { new: true }
    )
      .lean()
      .exec();

    return doc ? this.toMessage(doc) : null;
  }

  /**
   * Persist user feedback against a message in their own thread.
   */
  async setMessageFeedback(params: {
    messageId: string;
    userId: string;
    threadId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    category?: AgentMessageFeedback['category'];
    text?: string;
  }): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const result = await AgentMessageModel.updateOne(
      {
        _id: params.messageId,
        threadId: params.threadId,
        userId: params.userId,
        deletedAt: null,
      },
      {
        $set: {
          feedback: {
            userId: params.userId,
            rating: params.rating,
            ...(params.category ? { category: params.category } : {}),
            ...(params.text ? { text: params.text.slice(0, 500) } : {}),
            createdAt: nowIso,
          },
        },
        $push: {
          actions: {
            type: 'feedback_submitted' as AgentMessageActionType,
            userId: params.userId,
            timestamp: nowIso,
            metadata: {
              rating: params.rating,
              ...(params.category ? { category: params.category } : {}),
            },
          },
        },
      }
    ).exec();

    return result.modifiedCount > 0;
  }

  /**
   * Append a message-level action record for analytics/auditing.
   */
  async appendMessageAction(params: {
    messageId: string;
    userId: string;
    action: AgentMessageActionType;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    const result = await AgentMessageModel.updateOne(
      { _id: params.messageId, userId: params.userId, deletedAt: null },
      {
        $push: {
          actions: {
            type: params.action,
            userId: params.userId,
            timestamp: new Date().toISOString(),
            ...(params.metadata ? { metadata: params.metadata } : {}),
          },
        },
      }
    ).exec();

    return result.modifiedCount > 0;
  }

  /**
   * Soft-delete a message and decrement the thread message count.
   */
  async softDeleteMessage(params: {
    messageId: string;
    userId: string;
    restoreTokenId: string;
  }): Promise<AgentMessage | null> {
    const doc = await AgentMessageModel.findOneAndUpdate(
      {
        _id: params.messageId,
        userId: params.userId,
        deletedAt: null,
      },
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: params.userId,
          restoreTokenId: params.restoreTokenId,
        },
        $push: {
          actions: {
            type: 'deleted' as AgentMessageActionType,
            userId: params.userId,
            timestamp: new Date().toISOString(),
          },
        },
      },
      { new: true }
    )
      .lean()
      .exec();

    if (!doc) return null;

    await AgentThreadModel.updateOne(
      { _id: doc.threadId, userId: params.userId },
      {
        $inc: { messageCount: -1 },
        $set: { updatedAt: new Date().toISOString() },
      }
    ).exec();

    return this.toMessage(doc);
  }

  /**
   * Restore a previously soft-deleted message by restore token.
   */
  async undoSoftDelete(params: {
    messageId: string;
    userId: string;
    restoreTokenId: string;
  }): Promise<AgentMessage | null> {
    const doc = await AgentMessageModel.findOneAndUpdate(
      {
        _id: params.messageId,
        userId: params.userId,
        deletedBy: params.userId,
        restoreTokenId: params.restoreTokenId,
        deletedAt: { $ne: null },
      },
      {
        $set: { deletedAt: null },
        $unset: { deletedBy: '', restoreTokenId: '' },
        $push: {
          actions: {
            type: 'undone' as AgentMessageActionType,
            userId: params.userId,
            timestamp: new Date().toISOString(),
          },
        },
      },
      { new: true }
    )
      .lean()
      .exec();

    if (!doc) return null;

    await AgentThreadModel.updateOne(
      { _id: doc.threadId, userId: params.userId },
      {
        $inc: { messageCount: 1 },
        $set: { updatedAt: new Date().toISOString() },
      }
    ).exec();

    return this.toMessage(doc);
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
    const deletedAtIso =
      doc.deletedAt instanceof Date
        ? doc.deletedAt.toISOString()
        : typeof doc.deletedAt === 'string'
          ? doc.deletedAt
          : null;

    return {
      id: String(doc._id),
      threadId: doc.threadId,
      userId: doc.userId,
      role: doc.role,
      content: doc.content,
      origin: doc.origin,
      agentId: doc.agentId,
      operationId: doc.operationId,
      attachments: doc.attachments,
      resultData: doc.resultData,
      toolCalls: doc.toolCalls,
      toolCallsWire: doc.toolCallsWire,
      toolCallId: doc.toolCallId,
      steps: doc.steps,
      parts: doc.parts,
      tokenUsage: doc.tokenUsage,
      editHistory: doc.editHistory,
      feedback: doc.feedback,
      actions: doc.actions,
      embedding: doc.embedding,
      deletedAt: deletedAtIso,
      deletedBy: doc.deletedBy,
      restoreTokenId: doc.restoreTokenId,
      createdAt: doc.createdAt,
      semanticPhase: doc.semanticPhase,
    };
  }
}
