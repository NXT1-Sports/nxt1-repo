import { describe, expect, it } from 'vitest';
import { resolveToolExecutionDecision } from '../tool-execution-resolver.service.js';

describe('ToolExecutionResolver', () => {
  it('allows tools already present in the active agent policy', () => {
    const decision = resolveToolExecutionDecision({
      activeAgentId: 'router',
      toolName: 'query_nxt1_data',
      policyAllowedToolNames: ['query_nxt1_data'],
      tool: {
        name: 'query_nxt1_data',
        allowedAgents: ['*'],
        isMutation: false,
        category: 'database',
        entityGroup: 'user_tools',
      },
    });

    expect(decision).toEqual(
      expect.objectContaining({
        kind: 'direct',
        reason: 'Tool is allowed by the active agent policy.',
      })
    );
  });

  it('allows capability-direct tools even when absent from the old static policy', () => {
    const decision = resolveToolExecutionDecision({
      activeAgentId: 'router',
      toolName: 'generate_graphic',
      policyAllowedToolNames: [],
      tool: {
        name: 'generate_graphic',
        allowedAgents: ['brand_coordinator'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
    });

    expect(decision).toEqual(
      expect.objectContaining({
        kind: 'direct',
        capability: expect.objectContaining({
          directCallableByDefault: true,
          preferredSpecialists: ['brand_coordinator'],
        }),
      })
    );
  });

  it('keeps background/specialist media extraction out of direct execution', () => {
    const decision = resolveToolExecutionDecision({
      activeAgentId: 'router',
      toolName: 'extract_live_view_media',
      policyAllowedToolNames: [],
      tool: {
        name: 'extract_live_view_media',
        allowedAgents: ['*'],
        isMutation: false,
        category: 'automation',
        entityGroup: 'platform_tools',
      },
    });

    expect(decision).toEqual(
      expect.objectContaining({
        kind: 'background_required',
        specialist: 'performance_coordinator',
      })
    );
  });

  it('allows non-mutating read-like tools by default after access filtering', () => {
    const decision = resolveToolExecutionDecision({
      activeAgentId: 'router',
      toolName: 'read_only_scouting_lookup',
      policyAllowedToolNames: [],
      tool: {
        name: 'read_only_scouting_lookup',
        allowedAgents: ['performance_coordinator'],
        isMutation: false,
        category: 'database',
        entityGroup: 'user_tools',
      },
    });

    expect(decision).toEqual(
      expect.objectContaining({
        kind: 'direct',
        reason:
          'Non-mutating read-like tools are directly executable by default after entity access filtering.',
      })
    );
  });

  it('blocks mutation tools in plan mode even when capability-direct', () => {
    const decision = resolveToolExecutionDecision({
      activeAgentId: 'router',
      toolName: 'generate_graphic',
      policyAllowedToolNames: [],
      executionMode: 'plan',
      tool: {
        name: 'generate_graphic',
        allowedAgents: ['brand_coordinator'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
    });

    expect(decision).toEqual(
      expect.objectContaining({
        kind: 'blocked',
        reason: 'Plan mode is review-only and cannot execute mutation tools.',
      })
    );
  });

  it.each([
    'get_film_review',
    'list_film_reviews',
    'get_film_review_source_breakdown',
    'search_film_review_breakdown_rows',
  ])('lets Primary read film-review data directly instead of delegating: %s', (toolName) => {
    const decision = resolveToolExecutionDecision({
      activeAgentId: 'router',
      toolName,
      policyAllowedToolNames: [],
      tool: {
        name: toolName,
        allowedAgents: ['performance_coordinator'],
        isMutation: false,
        category: 'database',
        entityGroup: 'user_tools',
      },
    });

    expect(decision.kind).toBe('direct');
  });

  it('still routes film-review mutations away from direct Primary execution', () => {
    const decision = resolveToolExecutionDecision({
      activeAgentId: 'router',
      toolName: 'update_film_review',
      policyAllowedToolNames: [],
      tool: {
        name: 'update_film_review',
        allowedAgents: ['performance_coordinator'],
        isMutation: true,
        category: 'database',
        entityGroup: 'user_tools',
      },
    });

    expect(decision.kind).toBe('blocked');
  });
});