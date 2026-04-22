/**
 * @fileoverview Save Memory Tool — Explicit Vector Memory Writes
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Allows Agent X to proactively persist user preferences, goals, and
 * recruiting context to long-term vector memory during a conversation.
 *
 * When the user says things like "remember that I only want SEC schools"
 * or "my goal is to get a D1 scholarship by senior year", the agent
 * invokes this tool to embed and store that information so future
 * sessions can recall it automatically through prompt-context retrieval,
 * with `search_memory` available only for manual deep inspection.
 *
 * Categories are restricted to prevent the agent from polluting the
 * memory store with transient data or internal reasoning.
 *
 * @example
 * Agent flow for "Please remember I only want to play for SEC schools":
 * 1. Call save_memory({ content: "User only wants to target SEC conference schools for recruiting.", category: "preference" })
 * 2. VectorMemoryService embeds and persists to MongoDB
 * 3. Future sessions receive it through automatic retrieval before prompting
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import type { VectorMemoryService } from '../../memory/vector.service.js';
import type { AgentMemoryCategory } from '@nxt1/core';
import { z } from 'zod';

/**
 * Categories the agent is allowed to write via this tool.
 * Excludes 'conversation' (reserved for background summarization),
 * 'profile_update' (set by data writes), and 'system' (internal only).
 */
const WRITABLE_CATEGORIES: readonly AgentMemoryCategory[] = [
  'preference',
  'goal',
  'recruiting_context',
  'performance_data',
];

const SaveMemoryInputSchema = z.object({
  userId: z.string().trim().min(1),
  content: z.string().trim().min(1),
  category: z.enum(WRITABLE_CATEGORIES),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class SaveMemoryTool extends BaseTool {
  readonly name = 'save_memory';
  readonly description =
    'Save an important piece of information to your long-term memory so you can recall it in future conversations. ' +
    'Use this when the user explicitly asks you to remember something, or when they share a strong preference, ' +
    'goal, recruiting constraint, or performance context that should persist across sessions. ' +
    'Examples: "Remember I only want SEC schools", "My goal is a D1 scholarship", ' +
    '"I run a 4.5 forty", "I prefer morning workouts". ' +
    'Do NOT save transient chat content or internal reasoning — only user-stated facts and preferences.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID of the user.\n' +
    '- content (required): Concise third-person fact to remember.\n' +
    '- category (required): One of preference, goal, recruiting_context, performance_data.\n' +
    '- metadata (optional): Key-value context (e.g. { sport, position, conference }).';

  readonly parameters = SaveMemoryInputSchema;

  // All coordinators can save memories
  override readonly allowedAgents = [
    'strategy_coordinator',
    'recruiting_coordinator',
    'performance_coordinator',
    'admin_coordinator',
    'data_coordinator',
    'brand_coordinator',
  ] as const;

  readonly isMutation = true;
  readonly category = 'database' as const;

  private readonly vectorMemory: VectorMemoryService;

  constructor(vectorMemory: VectorMemoryService) {
    super();
    this.vectorMemory = vectorMemory;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const parsed = SaveMemoryInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { userId, content, category, metadata } = parsed.data;

    // ── Store in vector memory ──────────────────────────────────────────
    try {
      const entry = await this.vectorMemory.store(userId, content, category, metadata);
      return {
        success: true,
        data: {
          memoryId: entry.id,
          category,
          message:
            `Memory saved (id: ${entry.id}). ` +
            `To delete or replace this memory later, call delete_memory with this memoryId.`,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to save memory: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
