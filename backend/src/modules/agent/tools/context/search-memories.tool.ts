/**
 * @fileoverview Search Memories Tool — Lazy Long-Term Recall
 * @module @nxt1/backend/modules/agent/tools/context
 */

import { z } from 'zod';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import type { VectorMemoryService } from '../../memory/vector.service.js';

const InputSchema = z.object({
  query: z.string().trim().min(1),
  k: z.coerce.number().int().min(1).max(20).optional(),
  userId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
});

export class SearchMemoriesTool extends BaseTool {
  readonly name = 'search_memories';
  readonly description =
    'Search long-term memories on demand. Use this when you need durable recall ' +
    'from prior conversations, saved preferences, recruiting context, or goal history.';

  readonly parameters = InputSchema;
  readonly isMutation = false;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;

  override readonly allowedAgents = ['*'] as const;

  constructor(private readonly vectorMemory: VectorMemoryService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = parsed.data.userId ?? context?.userId;
    if (!userId) {
      return { success: false, error: 'userId is required (none in input or execution context)' };
    }

    const topK = parsed.data.k ?? 5;
    const targets: Array<'user' | 'team' | 'organization'> = ['user'];
    if (parsed.data.teamId) targets.push('team');
    if (parsed.data.organizationId) targets.push('organization');

    const grouped = await this.vectorMemory.recallByScope(userId, parsed.data.query, {
      perTargetLimit: topK,
      targets,
      ...(parsed.data.teamId ? { teamId: parsed.data.teamId } : {}),
      ...(parsed.data.organizationId ? { organizationId: parsed.data.organizationId } : {}),
    });

    const memories = [...grouped.user, ...grouped.team, ...grouped.organization];

    return {
      success: true,
      data: {
        query: parsed.data.query,
        count: memories.length,
        memories: memories.map((memory) => ({
          id: memory.id,
          target: memory.target,
          content: memory.content,
          category: memory.category,
          teamId: memory.teamId,
          organizationId: memory.organizationId,
          createdAt: memory.createdAt,
        })),
      },
      markdown:
        memories.length > 0
          ? [
              `## Memory Search Results for "${parsed.data.query}"`,
              '',
              ...memories.map(
                (memory, index) =>
                  `${index + 1}. [${memory.target}] ${memory.content}${
                    memory.category ? ` (${memory.category})` : ''
                  }`
              ),
            ].join('\n')
          : `## Memory Search Results for "${parsed.data.query}"\n\n- No matching memories found.`,
    };
  }
}
