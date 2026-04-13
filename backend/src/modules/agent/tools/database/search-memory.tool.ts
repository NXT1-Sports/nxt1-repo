/**
 * @fileoverview Search Memory Tool — MongoDB Atlas Vector Search
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Enables Agent X to manually inspect long-term memories after the automatic
 * prompt-context retrieval path has already run.
 *
 * Use this tool for scoped drill-down, memory audits, or locating a memory ID
 * before deletion. It is no longer the primary retrieval mechanism for normal
 * prompt assembly.
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

export class SearchMemoryTool extends BaseTool {
  readonly name = 'search_memory';
  readonly description =
    'Manual semantic search over long-term stored memories. ' +
    'Automatic prompt assembly already injects the most relevant memories before normal agent reasoning. ' +
    'Use this only when you need deeper drill-down, scope-specific recall (user/team/organization), ' +
    'or a memory ID for delete_memory. Results are grouped by scope and ranked by similarity to your query.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Firebase UID of the user whose memories to search.',
      },
      query: {
        type: 'string',
        description:
          'Natural language query describing what you are looking for. ' +
          'Example: "recruiting goals and target colleges" or "recent performance improvements".',
      },
      topK: {
        type: 'number',
        description: 'Number of memories to retrieve (1–20). Defaults to 5.',
      },
      target: {
        type: 'string',
        enum: ['user', 'team', 'organization', 'all'],
        description:
          'Optional: inspect a specific scope or use "all" to search every available scope. ' +
          'When omitted, the tool searches user memories and any provided team/org scope.',
      },
      teamId: {
        type: 'string',
        description:
          'Optional: required when target is "team". Also used to include team-scoped recall when target is omitted or "all".',
      },
      organizationId: {
        type: 'string',
        description:
          'Optional: required when target is "organization". Also used to include organization-scoped recall when target is omitted or "all".',
      },
      category: {
        type: 'string',
        enum: VALID_CATEGORIES,
        description:
          'Optional: filter results to a specific memory category. ' +
          'Omit to search across all categories.',
      },
    },
    required: ['userId', 'query'],
  } as const;

  // All coordinators can recall context from the knowledge base
  override readonly allowedAgents = [
    'general',
    'recruiting_coordinator',
    'performance_coordinator',
    'compliance_coordinator',
    'data_coordinator',
    'brand_media_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly vectorMemory: VectorMemoryService;

  constructor(vectorMemory: VectorMemoryService) {
    super();
    this.vectorMemory = vectorMemory;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    // ── Input validation ───────────────────────────────────────────────
    const query = this.str(input, 'query');
    if (!query) {
      return this.paramError('query');
    }

    const rawTopK = this.num(input, 'topK');
    const topK = Math.min(Math.max(1, Math.round(rawTopK ?? 5)), 20);

    const userId = this.str(input, 'userId') ?? '';
    if (!userId) {
      return this.paramError('userId');
    }

    const teamId = this.str(input, 'teamId') ?? undefined;
    const organizationId = this.str(input, 'organizationId') ?? undefined;

    const rawTarget = this.str(input, 'target');
    const target: SearchMemoryTarget =
      rawTarget === 'user' ||
      rawTarget === 'team' ||
      rawTarget === 'organization' ||
      rawTarget === 'all'
        ? rawTarget
        : 'all';

    if (target === 'team' && !teamId) {
      return this.paramError('teamId');
    }

    if (target === 'organization' && !organizationId) {
      return this.paramError('organizationId');
    }

    const rawCategory = input['category'];
    const category =
      typeof rawCategory === 'string' &&
      VALID_CATEGORIES.includes(rawCategory as AgentMemoryCategory)
        ? (rawCategory as AgentMemoryCategory)
        : undefined;

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

      return {
        success: true,
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
