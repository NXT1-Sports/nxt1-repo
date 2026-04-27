/**
 * @fileoverview Delete Memory Tool — Remove stored vector memories
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Allows Agent X to delete a specific memory from long-term vector storage.
 * Use `search_memory` only when you need to manually inspect memories or find
 * the exact memory ID before deletion.
 *
 * This enables the full memory lifecycle:
 *   automatic retrieval → optional search_memory audit → delete_memory → save_memory (replace)
 *
 * @example
 * User: "Actually, remove my goal about SEC schools."
 * Agent flow:
 * 1. Call search_memory({ query: "SEC schools goal", userId: "abc", target: "all" })
 * 2. Find matching memory with id "mem_123"
 * 3. Call delete_memory({ memoryId: "mem_123", userId: "abc" })
 * 4. Confirm deletion to user
 */

import { Types } from 'mongoose';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import type { VectorMemoryService } from '../../memory/vector.service.js';
import { z } from 'zod';

const DeleteMemoryInputSchema = z.object({
  userId: z.string().trim().min(1),
  memoryId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

export class DeleteMemoryTool extends BaseTool {
  readonly name = 'delete_memory';
  readonly description =
    'Delete a specific memory from your long-term memory store. ' +
    'Use this when the user asks you to forget, remove, or undo a previously saved memory. ' +
    'If you do not already have the memoryId, use search_memory to inspect memories and find it. ' +
    'To update/replace a memory: delete the old one, then save_memory with the new content.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID of the user.\n' +
    '- memoryId (required): The ID of the memory to delete (from search_memory results).\n' +
    '- reason (optional): Why the memory is being deleted (for logging).';

  readonly parameters = DeleteMemoryInputSchema;

  // All coordinators can delete memories
  override readonly allowedAgents = [
    'strategy_coordinator',
    'recruiting_coordinator',
    'performance_coordinator',
    'admin_coordinator',
    'data_coordinator',
    'brand_coordinator',
  ] as const;

  readonly isMutation = true;
  readonly category = 'system' as const;

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
    const parsed = DeleteMemoryInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { userId, memoryId } = parsed.data;

    if (!Types.ObjectId.isValid(memoryId)) {
      return {
        success: false,
        error: `Invalid memoryId format "${memoryId}". Use the exact ID returned by search_memory when manually inspecting memories.`,
      };
    }

    try {
      context?.emitStage?.('deleting_resource', {
        icon: 'delete',
        memoryId,
      });

      const deleted = await this.vectorMemory.deleteById(memoryId, userId);

      if (!deleted) {
        return {
          success: false,
          error: `Memory "${memoryId}" not found or does not belong to this user.`,
        };
      }

      return {
        success: true,
        data: {
          memoryId,
          message: 'Memory deleted successfully. It will no longer appear in future conversations.',
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to delete memory: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
