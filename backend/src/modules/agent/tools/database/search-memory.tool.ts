/**
 * @fileoverview Search Memory Tool — MongoDB Atlas Vector Search
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Enables Agent X to perform semantic search over per-user stored memories.
 * This is the RAG (Retrieval-Augmented Generation) retrieval step: before
 * answering a question, agents can query previously stored facts, user
 * preferences, recruiting context, and past conversation summaries to
 * ground their responses in verified, personalized data.
 *
 * Storage backend: MongoDB Atlas Vector Search (`agentMemories` collection).
 * Embedding model: OpenAI text-embedding-3-small (1536 dimensions).
 *
 * NOTE: This is distinct from Global Knowledge (`agentGlobalKnowledge`
 * collection), which is auto-injected into all agent system prompts via
 * `GlobalKnowledgeSkill` and is NOT a user-facing tool.
 *
 * @example
 * Agent flow for "Which conferences should I target?":
 * 1. Call search_memory({ query: "target conferences recruiting preferences", userId: "abc", topK: 3 })
 * 2. Read recalled memories (e.g., "User prefers SEC and Big 12 schools")
 * 3. Incorporate that context into the coaching recommendation
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import type { VectorMemoryService } from '../../memory/vector.service.js';
import type { AgentMemoryCategory } from '@nxt1/core';

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
    "Semantic search over the user's stored memories (per-user vector store). " +
    'Use this to retrieve stored user preferences, goals, recruiting context, ' +
    'past conversation summaries, and performance data before making decisions. ' +
    'Always call this at the start of a session to personalize your response ' +
    'with relevant historical context. ' +
    'Results are ranked by cosine similarity to your query.';

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

    const rawCategory = input['category'];
    const category =
      typeof rawCategory === 'string' &&
      VALID_CATEGORIES.includes(rawCategory as AgentMemoryCategory)
        ? (rawCategory as AgentMemoryCategory)
        : undefined;

    // ── Recall ─────────────────────────────────────────────────────────
    try {
      const memories = await this.vectorMemory.recall(userId, query, topK);

      // Optionally filter by category client-side (Atlas pre-filters by userId only)
      const filtered = category ? memories.filter((m) => m.category === category) : memories;

      return {
        success: true,
        data: {
          query,
          count: filtered.length,
          memories: filtered.map((m) => ({
            id: m.id,
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
}
