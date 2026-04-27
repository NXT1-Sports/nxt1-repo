/**
 * @fileoverview Search Memory Tool — MongoDB Atlas Vector Search
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Enables Agent X to inspect long-term memories on demand.
 *
 * Use this tool for scoped recall, memory audits, locating a memory ID before
 * deletion, or whenever a coordinator needs durable user history to answer well.
 *
 * Storage backend: MongoDB Atlas Vector Search (`agentMemories` collection).
 * Embedding model: OpenAI text-embedding-3-small (1536 dimensions).
 *
 * NOTE: This is distinct from Global Knowledge (`agentGlobalKnowledge`
 * collection), which is auto-injected into all agent system prompts via
 * `GlobalKnowledgeSkill` and is NOT a user-facing tool.
 *
 * @example
 * Agent flow for "Delete the old SEC preference memory":
 * 1. Call search_memory({ query: "SEC preference", userId: "abc", target: "all", organizationId: "org_1", topK: 3 })
 * 2. Find the matching memory ID in the grouped results
 * 3. Pass that ID into delete_memory
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import type { VectorMemoryService } from '../../memory/vector.service.js';
import type { AgentMemoryCategory, AgentMemoryRecallOptions, AgentMemoryTarget } from '@nxt1/core';
import { z } from 'zod';

type SearchMemoryTarget = AgentMemoryTarget | 'all';

const VALID_CATEGORIES: readonly AgentMemoryCategory[] = [
  'preference',
  'goal',
  'conversation',
  'profile_update',
  'recruiting_context',
  'performance_data',
  'system',
];

const SearchMemoryInputSchema = z.object({
  userId: z.string().trim().min(1),
  query: z.string().trim().min(1),
  topK: z.coerce.number().optional(),
  target: z.enum(['user', 'team', 'organization', 'all']).optional(),
  teamId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  category: z.enum(VALID_CATEGORIES).optional(),
});

export class SearchMemoryTool extends BaseTool {
  readonly name = 'search_memory';
  readonly description =
    'Semantic search over long-term stored memories on demand. ' +
    'Use this when you need scope-specific recall (user/team/organization), past preferences, goals, recruiting context, or a memory ID for delete_memory. ' +
    'Results are grouped by scope and ranked by similarity to your query.';

  readonly parameters = SearchMemoryInputSchema;

  // All coordinators can recall context from the knowledge base
  override readonly allowedAgents = ['*'] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  readonly entityGroup = 'platform_tools' as const;
  private readonly vectorMemory: VectorMemoryService;

  constructor(vectorMemory: VectorMemoryService) {
    super();
    this.vectorMemory = vectorMemory;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const parsed = SearchMemoryInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues
          .map((issue) =>
            issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
          )
          .join(', '),
      };
    }

    const { query, userId, teamId, organizationId, category } = parsed.data;
    const topK = Math.min(Math.max(1, Math.round(parsed.data.topK ?? 5)), 20);

    const target: SearchMemoryTarget = parsed.data.target ?? 'all';

    if (target === 'team' && !teamId) {
      return this.paramError('teamId');
    }

    if (target === 'organization' && !organizationId) {
      return this.paramError('organizationId');
    }
    const recallOptions: AgentMemoryRecallOptions = {
      category,
      teamId,
      organizationId,
      perTargetLimit: topK,
      targets: this.resolveTargets(target, teamId, organizationId),
    };

    // ── Recall ─────────────────────────────────────────────────────────
    try {
      const grouped = await this.vectorMemory.recallByScope(userId, query, recallOptions);
      const flattened = [...grouped.user, ...grouped.team, ...grouped.organization];

      const markdown = [
        `## Memory Search Results for "${query}" (${flattened.length} found)`,
        '',
        ...flattened.map(
          (m, i) => `### ${i + 1}. [${m.target}] ${m.category || 'General'}\n${m.content}`
        ),
      ].join('\n');

      return {
        success: true,
        markdown,
        data: {
          query,
          count: flattened.length,
          grouped,
          memories: flattened.map((m) => ({
            id: m.id,
            target: m.target,
            teamId: m.teamId,
            organizationId: m.organizationId,
            content: m.content,
            category: m.category,
            metadata: m.metadata,
            createdAt: m.createdAt,
          })),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Memory search failed';
      return { success: false, error: message };
    }
  }

  private resolveTargets(
    target: SearchMemoryTarget,
    teamId?: string,
    organizationId?: string
  ): readonly AgentMemoryTarget[] {
    if (target === 'user' || target === 'team' || target === 'organization') {
      return [target];
    }

    const targets: AgentMemoryTarget[] = ['user'];
    if (teamId) targets.push('team');
    if (organizationId) targets.push('organization');
    return targets;
  }
}
