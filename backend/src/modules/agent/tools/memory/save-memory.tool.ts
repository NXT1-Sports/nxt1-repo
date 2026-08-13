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
 * sessions can recall it through on-demand memory retrieval.
 *
 * Categories are restricted to prevent the agent from polluting the
 * memory store with transient data or internal reasoning.
 *
 * @example
 * Agent flow for "Please remember I only want to play for SEC schools":
 * 1. Call save_memory({ content: "User only wants to target SEC conference schools for recruiting.", category: "preference" })
 * 2. VectorMemoryService embeds and persists to MongoDB
 * 3. Future sessions can retrieve it with search_memory when needed
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
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

const SaveMemoryCategorySchema = z.enum(WRITABLE_CATEGORIES);
const SaveMemoryMetadataSchema = z.record(z.string(), z.unknown()).optional();

const SaveMemorySingleInputSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1),
  category: SaveMemoryCategorySchema,
  metadata: SaveMemoryMetadataSchema,
});

const SaveMemoryLegacyFactInputSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  fact: z.string().trim().min(1),
  category: SaveMemoryCategorySchema,
  metadata: SaveMemoryMetadataSchema,
});

const SaveMemoryLegacyFactEntrySchema = z
  .object({
    category: SaveMemoryCategorySchema,
    fact: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    metadata: SaveMemoryMetadataSchema,
  })
  .superRefine((value, ctx) => {
    if (value.fact || value.content) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fact'],
      message: 'fact or content is required',
    });
  });

const SaveMemoryLegacyFactsInputSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  facts: z.array(SaveMemoryLegacyFactEntrySchema).min(1),
  metadata: SaveMemoryMetadataSchema,
});

const SaveMemoryInputSchema = z.union([
  SaveMemorySingleInputSchema,
  SaveMemoryLegacyFactInputSchema,
  SaveMemoryLegacyFactsInputSchema,
]);

type SaveMemoryInput = z.infer<typeof SaveMemoryInputSchema>;

interface NormalizedSaveMemoryEntry {
  readonly category: AgentMemoryCategory;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

function mergeMetadata(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>
): Record<string, unknown> | undefined {
  const merged = {
    ...(base ?? {}),
    ...(override ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function normalizeSaveMemoryEntries(input: SaveMemoryInput): readonly NormalizedSaveMemoryEntry[] {
  if ('facts' in input) {
    return input.facts.map((entry) => ({
      category: entry.category,
      content: entry.content ?? entry.fact ?? '',
      metadata: mergeMetadata(input.metadata, entry.metadata),
    }));
  }

  if ('fact' in input) {
    return [
      {
        category: input.category,
        content: input.fact,
        metadata: input.metadata,
      },
    ];
  }

  return [
    {
      category: input.category,
      content: input.content,
      metadata: input.metadata,
    },
  ];
}

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
    '- userId (optional when execution context already identifies the current user): Firebase UID of the user.\n' +
    '- content (required): Concise third-person fact to remember.\n' +
    '- category (required): One of preference, goal, recruiting_context, performance_data.\n' +
    '- metadata (optional): Key-value context (e.g. { sport, position, conference }).';

  readonly parameters = SaveMemoryInputSchema;

  // Router and coordinators can save durable memories.
  override readonly allowedAgents = [
    'router',
    'strategy_coordinator',
    'recruiting_coordinator',
    'performance_coordinator',
    'admin_coordinator',
    'data_coordinator',
    'brand_coordinator',
  ] as const;

  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;
  private readonly vectorMemory: VectorMemoryService;

  constructor(vectorMemory: VectorMemoryService) {
    super();
    this.vectorMemory = vectorMemory;
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = SaveMemoryInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = context?.userId;
    if (!userId) {
      return {
        success: false,
        error: 'userId is required in execution context',
        isValidationError: true,
      };
    }

    if (parsed.data.userId && parsed.data.userId !== userId) {
      return {
        success: false,
        error: 'Forbidden: provided userId does not match the authenticated user context',
        isValidationError: true,
      };
    }

    const entries = normalizeSaveMemoryEntries(parsed.data);

    // ── Store in vector memory ──────────────────────────────────────────
    try {
      const storedEntries = [] as Array<{
        readonly id: string;
        readonly category: AgentMemoryCategory;
        readonly content: string;
      }>;

      for (const entry of entries) {
        const stored = await this.vectorMemory.store(
          userId,
          entry.content,
          entry.category,
          entry.metadata
        );
        storedEntries.push({
          id: stored.id,
          category: entry.category,
          content: entry.content,
        });
      }

      if (storedEntries.length === 1) {
        const [entry] = storedEntries;
        return {
          success: true,
          data: {
            memoryId: entry.id,
            memoryIds: [entry.id],
            category: entry.category,
            count: 1,
            message:
              `Memory saved (id: ${entry.id}). ` +
              `To delete or replace this memory later, call delete_memory with this memoryId.`,
          },
        };
      }

      return {
        success: true,
        data: {
          memoryIds: storedEntries.map((entry) => entry.id),
          count: storedEntries.length,
          categories: [...new Set(storedEntries.map((entry) => entry.category))],
          message:
            `Saved ${storedEntries.length} memories. ` +
            `Use delete_memory with a returned memoryId to remove or replace any of them later.`,
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
