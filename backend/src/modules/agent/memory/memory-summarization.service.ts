/**
 * @fileoverview Memory Summarization Service — Background Thread Extraction
 * @module @nxt1/backend/modules/agent/memory
 *
 * Processes inactive Agent X threads and extracts durable memories
 * (preferences, goals, recruiting context) into the vector memory store.
 *
 * Triggered primarily by delayed BullMQ jobs once a thread has been idle
 * for at least 1 hour, with a small nightly cron safety net for missed threads.
 * 1. Fetches the full message history from AgentMessageModel.
 * 2. Sends the transcript to a cheap extraction model (chat tier).
 * 3. Parses structured facts from the LLM response.
 * 4. Stores each fact as a separate vector memory entry.
 * 5. Marks the thread as `memorySummarized: true`.
 *
 * Design decisions:
 * - Uses the 'extraction' tier (Claude Haiku / GPT-4o-mini) to minimize cost.
 * - Processes threads sequentially to avoid overwhelming the LLM API.
 * - Skips threads with < 4 messages (too little signal).
 * - The nightly cron fallback is capped at 5 threads per run to bound load.
 */

import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { VectorMemoryService } from './vector.service.js';
import type { AgentMemoryCategory, AgentMemoryTarget, AgentUserContext } from '@nxt1/core';
import { AgentThreadModel } from '../../../models/agent/agent-thread.model.js';
import { AgentMessageModel } from '../../../models/agent/agent-message.model.js';
import { AgentMemoryModel } from './vector.service.js';
import { ContextBuilder } from './context-builder.js';
import { THREAD_SUMMARIZATION_DELAY_MS } from '../queue/queue.types.js';
import { resolveStructuredOutput } from '../llm/structured-output.js';
import { logger } from '../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Threads must be idle for at least this long before summarization. */
const INACTIVITY_THRESHOLD_MS = THREAD_SUMMARIZATION_DELAY_MS;

/** Minimum messages in a thread to be worth summarizing. */
const MIN_MESSAGES = 4;

/** Maximum threads to process per cron safety-net run. */
const MAX_THREADS_PER_RUN = 5;

/** Maximum messages to include in the extraction prompt (truncate older ones). */
const MAX_MESSAGES_FOR_EXTRACTION = 100;

/** Valid categories from the extraction prompt. */
const VALID_CATEGORIES: readonly AgentMemoryCategory[] = [
  'preference',
  'goal',
  'recruiting_context',
  'performance_data',
];

const VALID_TARGETS: readonly AgentMemoryTarget[] = ['user', 'team', 'organization'];

const extractedSummaryFactSchema = z.object({
  content: z.string().trim().min(1),
  category: z.enum(['preference', 'goal', 'recruiting_context', 'performance_data']),
  target: z.enum(['user', 'team', 'organization']).optional(),
});

const extractedSummaryFactsPayloadSchema = z.object({
  facts: z.array(extractedSummaryFactSchema),
});

const extractedSummaryFactsResultSchema = z.union([
  extractedSummaryFactsPayloadSchema,
  z.array(extractedSummaryFactSchema),
]);

/** System prompt for the memory extraction LLM call. */
const EXTRACTION_SYSTEM_PROMPT = `You are an AI memory extraction system for a sports recruiting platform called NXT1.

Your job is to read a conversation transcript between a user (athlete, coach, or scout) and an AI agent, then extract DURABLE FACTS about the user that should be remembered for future conversations.

Extract ONLY:
- User preferences (e.g., "User prefers SEC schools", "User wants to stay close to home in Texas")
- User goals (e.g., "User's goal is a D1 football scholarship by senior year")
- Recruiting context (e.g., "User has been contacted by Ohio State and Michigan", "User's top 5 schools are...")
- Performance data mentioned by the user (e.g., "User runs a 4.5 forty-yard dash", "User has 3.8 GPA")

Do NOT extract:
- Transient conversation details ("User asked about weather")
- Agent reasoning or internal state
- Greetings, pleasantries, or filler
- Information the agent told the user (only what the USER stated or confirmed)

Return a JSON object with this shape:
{
  "facts": [
    {
      "content": "...",
      "category": "preference|goal|recruiting_context|performance_data",
      "target": "user|team|organization"
    }
  ]
}

Each fact object has:
- "content": A concise third-person statement (e.g., "User prefers SEC conference schools for recruiting.")
- "category": One of "preference", "goal", "recruiting_context", "performance_data"
- "target": One of "user", "team", or "organization"

Use "team" only when the fact should be remembered as team-level context.
Use "organization" only when the fact applies to the school, club, or program above the team.
Default to "user" when in doubt.

If there are no durable facts to extract, return: {"facts": []}

Return ONLY the JSON object, no markdown fences, no explanation.`;

// ─── Service ──────────────────────────────────────────────────────────────────

export interface SummarizationResult {
  readonly threadsProcessed: number;
  readonly memoriesCreated: number;
  readonly threadsSkipped: number;
  readonly errors: number;
}

export class MemorySummarizationService {
  private readonly llm: OpenRouterService;
  private readonly vectorMemory: VectorMemoryService;
  private readonly contextBuilder: ContextBuilder;

  constructor(
    llm: OpenRouterService,
    vectorMemory: VectorMemoryService,
    contextBuilder: ContextBuilder = new ContextBuilder(vectorMemory)
  ) {
    this.llm = llm;
    this.vectorMemory = vectorMemory;
    this.contextBuilder = contextBuilder;
  }

  /**
   * Main entry point: find and summarize all eligible inactive threads.
   *
   * @returns Summary of the run (threads processed, memories created, errors).
   */
  async summarizeInactiveThreads(): Promise<SummarizationResult> {
    const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_MS).toISOString();

    // Find threads that are:
    // 1. Not yet summarized
    // 2. Last message older than the inactivity threshold
    // 3. Have enough messages to be worth summarizing
    const threads = await AgentThreadModel.find({
      memorySummarized: { $ne: true },
      lastMessageAt: { $lt: cutoff },
      messageCount: { $gte: MIN_MESSAGES },
    })
      .sort({ lastMessageAt: 1 }) // oldest first
      .limit(MAX_THREADS_PER_RUN)
      .lean();

    logger.info('[MemorySummarization] Starting run', {
      eligibleThreads: threads.length,
      cutoff,
    });

    let memoriesCreated = 0;
    let threadsSkipped = 0;
    let errors = 0;

    for (const thread of threads) {
      try {
        const created = await this.processSingleThread(String(thread._id), thread.userId);
        if (created === 0) {
          threadsSkipped++;
        }
        memoriesCreated += created;
      } catch (err) {
        errors++;
        logger.error('[MemorySummarization] Failed to process thread', {
          threadId: String(thread._id),
          userId: thread.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const result: SummarizationResult = {
      threadsProcessed: threads.length,
      memoriesCreated,
      threadsSkipped,
      errors,
    };

    logger.info('[MemorySummarization] Run complete', { ...result });
    return result;
  }

  /**
   * Process a single thread: fetch messages, extract facts, store memories.
   * Safe for both delayed queue jobs and the nightly cron safety net.
   *
   * @returns Number of memories created for this thread.
   */
  async processSingleThread(threadId: string, userId: string): Promise<number> {
    const thread = await AgentThreadModel.findOne({ _id: threadId, userId })
      .select('lastMessageAt updatedAt messageCount')
      .lean();

    if (!thread) {
      logger.warn('[MemorySummarization] Thread not found for summarization', { threadId, userId });
      return 0;
    }

    const lastMessageAtMs = Date.parse(thread.lastMessageAt ?? '');
    if (
      Number.isFinite(lastMessageAtMs) &&
      Date.now() - lastMessageAtMs < INACTIVITY_THRESHOLD_MS
    ) {
      logger.info('[MemorySummarization] Skipping active thread', {
        threadId,
        userId,
        lastMessageAt: thread.lastMessageAt,
      });
      return 0;
    }

    let context: AgentUserContext;
    try {
      context = await this.contextBuilder.buildContext(userId);
    } catch {
      context = { userId, role: 'athlete', displayName: 'Unknown User' };
    }

    // Fetch messages in chronological order
    const messages = await AgentMessageModel.find({ threadId })
      .sort({ createdAt: 1 })
      .limit(MAX_MESSAGES_FOR_EXTRACTION)
      .select('role content createdAt')
      .lean();

    if (messages.length < MIN_MESSAGES) {
      await this.markThreadSummarizedIfUnchanged(threadId, thread.updatedAt);
      return 0;
    }

    // Build transcript for the LLM — only user and assistant messages carry signal
    const transcript = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    if (!transcript.trim()) {
      await this.markThreadSummarizedIfUnchanged(threadId, thread.updatedAt);
      return 0;
    }

    // Call the extraction model
    const completion = await this.llm.complete(
      [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      {
        tier: 'extraction',
        temperature: 0,
        maxTokens: 2000,
        outputSchema: {
          name: 'thread_memory_facts',
          schema: extractedSummaryFactsPayloadSchema,
        },
        telemetryContext: {
          operationId: `memory-summarize-${threadId}`,
          userId,
          agentId: 'router',
          feature: 'memory-summarization',
        },
      }
    );

    let facts: Array<{ content: string; category: string; target?: string }>;
    try {
      const extracted = resolveStructuredOutput<
        | z.infer<typeof extractedSummaryFactsPayloadSchema>
        | z.infer<typeof extractedSummaryFactSchema>[]
      >(completion, extractedSummaryFactsResultSchema, 'Memory summarization extraction');
      facts = Array.isArray(extracted) ? extracted : extracted.facts;
    } catch {
      logger.warn('[MemorySummarization] Failed to parse extraction JSON', {
        threadId,
        userId,
        raw: (completion.content ?? '').slice(0, 500),
      });
      await this.markThreadSummarizedIfUnchanged(threadId, thread.updatedAt);
      return 0;
    }

    // Store each valid fact as a vector memory (with dedup guard)
    let stored = 0;
    for (const fact of facts) {
      const target = this.resolveTarget(fact.target, context);
      if (
        !fact.content ||
        typeof fact.content !== 'string' ||
        !fact.category ||
        !VALID_CATEGORIES.includes(fact.category as AgentMemoryCategory) ||
        !target
      ) {
        continue;
      }

      const existing = await AgentMemoryModel.findOne({
        userId,
        target,
        ...(target === 'team' && context.teamId ? { teamId: context.teamId } : {}),
        ...(target === 'organization' && context.organizationId
          ? { organizationId: context.organizationId }
          : {}),
        content: fact.content,
        category: fact.category,
      }).lean();
      if (existing) continue;

      try {
        await this.vectorMemory.store(
          userId,
          fact.content,
          fact.category as AgentMemoryCategory,
          {
            source: 'conversation_summary',
            threadId,
            extractedTarget: target,
          },
          {
            target,
            teamId: context.teamId,
            organizationId: context.organizationId,
          }
        );
        stored++;
      } catch (err) {
        logger.warn('[MemorySummarization] Failed to store extracted fact', {
          threadId,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.markThreadSummarizedIfUnchanged(threadId, thread.updatedAt);

    logger.info('[MemorySummarization] Thread processed', {
      threadId,
      userId,
      factsExtracted: facts.length,
      memoriesStored: stored,
    });

    return stored;
  }

  private async markThreadSummarizedIfUnchanged(
    threadId: string,
    updatedAt: string | undefined
  ): Promise<void> {
    const filter: Record<string, unknown> = { _id: threadId };
    if (updatedAt) {
      filter['updatedAt'] = updatedAt;
    }

    await AgentThreadModel.updateOne(filter, { $set: { memorySummarized: true } }).exec();
  }

  private resolveTarget(
    rawTarget: string | undefined,
    context: AgentUserContext
  ): AgentMemoryTarget | null {
    const target: AgentMemoryTarget = VALID_TARGETS.includes(rawTarget as AgentMemoryTarget)
      ? (rawTarget as AgentMemoryTarget)
      : 'user';

    if (target === 'team' && !context.teamId) {
      return null;
    }

    if (target === 'organization' && !context.organizationId) {
      return null;
    }

    return target;
  }
}
