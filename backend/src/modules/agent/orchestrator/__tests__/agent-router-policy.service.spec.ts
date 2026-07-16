import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionContext, AgentUserContext } from '@nxt1/core';
import { AgentRoutingOrchestratorService } from '../agent-routing-orchestrator.service.js';
import { AgentRouterPolicyService } from '../agent-router-policy.service.js';

function createUserContext(overrides: Partial<AgentUserContext> = {}): AgentUserContext {
  return {
    userId: 'user-123',
    role: 'athlete',
    displayName: 'Test Athlete',
    connectedAccounts: [],
    ...overrides,
  };
}

function createSessionContext(): AgentSessionContext {
  const now = new Date().toISOString();
  return {
    sessionId: 'session-1',
    userId: 'user-123',
    conversationHistory: [],
    createdAt: now,
    lastActiveAt: now,
  };
}

describe('AgentRouterPolicyService', () => {
  const service = new AgentRouterPolicyService({ execute: vi.fn() } as never);

  it('blocks provider email send tools when no email provider is connected', () => {
    const accessContext = service.buildToolAccessContext(createUserContext());

    expect(accessContext.blockedToolNames).toEqual([
      'send_email',
      'batch_send_email',
      'gmail_send_email',
    ]);
  });

  it('allows provider send tools but blocks Gmail-native send when only Microsoft is connected', () => {
    const accessContext = service.buildToolAccessContext(
      createUserContext({
        connectedAccounts: [
          {
            provider: 'microsoft',
            email: 'athlete@outlook.com',
            isTokenValid: true,
          },
        ],
      })
    );

    expect(accessContext.blockedToolNames).toEqual(['gmail_send_email']);
  });

  it('does not block email send tools when Gmail is connected', () => {
    const accessContext = service.buildToolAccessContext(
      createUserContext({
        connectedAccounts: [
          {
            provider: 'gmail',
            email: 'athlete@gmail.com',
            isTokenValid: true,
          },
        ],
      })
    );

    expect(accessContext.blockedToolNames).toBeUndefined();
  });

  it('deterministically reroutes outreach delegation to recruiting without planner fallback', async () => {
    const planner = { execute: vi.fn() };
    const policy = new AgentRouterPolicyService(planner as never);

    const reroute = await policy.rerouteDelegatedTask(
      'Execute a personalized email outreach campaign to 42 Texas football coaches.\n\n[Prior Work from data_coordinator] Tools already executed: search_web, dynamic_export',
      'data_coordinator',
      createSessionContext(),
      { storagePath: 'Users/test/contacts.csv' }
    );

    expect(planner.execute).not.toHaveBeenCalled();
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'recruiting_coordinator',
        description: expect.stringContaining(
          'Execute a personalized email outreach campaign to 42 Texas football coaches.'
        ),
        statusNote:
          'Workflow recruiting_outreach_campaign reassigned from data_coordinator to recruiting_coordinator.',
      })
    );
    expect(reroute?.structuredPayload).toMatchObject({
      storagePath: 'Users/test/contacts.csv',
      workflowOwnership: {
        workflowId: 'recruiting_outreach_campaign',
        owner: 'recruiting_coordinator',
      },
      delegationContext: {
        sourceAgentId: 'data_coordinator',
        priorWork:
          '[Prior Work from data_coordinator] Tools already executed: search_web, dynamic_export',
      },
    });
  });

  it('deterministically reroutes video-study requests to performance coordinator', async () => {
    const planner = { execute: vi.fn() };
    const policy = new AgentRouterPolicyService(planner as never);

    const reroute = await policy.rerouteDelegatedTask(
      'I need a list of videos to watch to improve my quarterback footwork and film study habits.',
      'strategy_coordinator',
      createSessionContext()
    );

    expect(planner.execute).not.toHaveBeenCalled();
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'performance_coordinator',
        statusNote: 'Reassigned from strategy_coordinator to performance_coordinator.',
      })
    );
  });

  it('deterministically reroutes creative highlight video production to brand coordinator', async () => {
    const planner = { execute: vi.fn() };
    const policy = new AgentRouterPolicyService(planner as never);

    const reroute = await policy.rerouteDelegatedTask(
      'Create a highlight video from X for @lwarren084 using his last posted video, with a motion graphic intro and 12-15 clips.',
      'performance_coordinator',
      createSessionContext()
    );

    expect(planner.execute).not.toHaveBeenCalled();
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'brand_coordinator',
        statusNote:
          'Workflow creative_video_edit reassigned from performance_coordinator to brand_coordinator.',
      })
    );
    expect(reroute?.structuredPayload).toMatchObject({
      workflowOwnership: {
        workflowId: 'creative_video_edit',
        owner: 'brand_coordinator',
      },
    });
  });

  it('keeps film-review game-plan delegations with strategy instead of keyword rerouting', async () => {
    const planner = { execute: vi.fn() };
    const policy = new AgentRouterPolicyService(planner as never);

    const reroute = await policy.rerouteDelegatedTask(
      'Create a game plan from these selected film review clips. The source breakdown rows are empty, so extract opponent defensive tendencies and include diagrams.',
      'strategy_coordinator',
      createSessionContext(),
      { filmReviewId: 'review-1', selectedSourceIds: ['source-1', 'source-2'] }
    );

    expect(planner.execute).not.toHaveBeenCalled();
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'strategy_coordinator',
        statusNote: 'Workflow film_review_game_plan remains with strategy_coordinator.',
      })
    );
    expect(reroute?.description).toContain('[Workflow Ownership: film_review_game_plan]');
    expect(reroute?.description).toContain('Continue this film-review game-plan workflow locally');
    expect(reroute?.structuredPayload).toMatchObject({
      filmReviewId: 'review-1',
      workflowOwnership: {
        workflowId: 'film_review_game_plan',
        owner: 'strategy_coordinator',
      },
    });
  });

  it('routes film-review game plans back to strategy from other coordinators', async () => {
    const planner = { execute: vi.fn() };
    const policy = new AgentRouterPolicyService(planner as never);

    const reroute = await policy.rerouteDelegatedTask(
      'Use this film review to build an opponent defensive tendency game plan with priorities and diagrams.',
      'data_coordinator',
      createSessionContext(),
      { filmReviewId: 'review-1' }
    );

    expect(planner.execute).not.toHaveBeenCalled();
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'strategy_coordinator',
        statusNote:
          'Workflow film_review_game_plan reassigned from data_coordinator to strategy_coordinator.',
      })
    );
  });

  it('routes film-review player evaluation to performance instead of strategy', async () => {
    const planner = { execute: vi.fn() };
    const policy = new AgentRouterPolicyService(planner as never);

    const reroute = await policy.rerouteDelegatedTask(
      'Evaluate the quarterback from these selected film review clips and grade his mechanics.',
      'strategy_coordinator',
      createSessionContext(),
      { filmReviewId: 'review-2' }
    );

    expect(planner.execute).not.toHaveBeenCalled();
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'performance_coordinator',
        statusNote:
          'Workflow film_review_player_evaluation reassigned from strategy_coordinator to performance_coordinator.',
      })
    );
  });

  it('adds callsheet preflight guidance for selected film and playbook contexts', async () => {
    const planner = { execute: vi.fn() };
    const policy = new AgentRouterPolicyService(planner as never);

    const reroute = await policy.rerouteDelegatedTask(
      'Based on the film here and our plays, create me a callsheet using the selected playbook and template file.',
      'strategy_coordinator',
      createSessionContext(),
      {
        filmReviewId: 'review-1',
        selectedContexts: [
          { type: 'team_file', id: 'playbook-file', title: 'Sandy Valley Sample Playbook' },
          { type: 'team_file', id: 'template-file', title: 'Eastern Alamance Call Sheet Template' },
        ],
      }
    );

    expect(planner.execute).not.toHaveBeenCalled();
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'strategy_coordinator',
        statusNote: 'Workflow callsheet_generation remains with strategy_coordinator.',
      })
    );
    expect(reroute?.description).toContain('[Workflow Ownership: callsheet_generation]');
    expect(reroute?.description).toContain('Use semantic Files discovery first');
    expect(reroute?.description).toContain('then hydrate selected/referenced Files');
    expect(reroute?.description).toContain(
      'Build situational sections from verified play concepts'
    );
  });

  it('delegates delegated-task rerouting to the routing orchestrator', async () => {
    const orchestratorSpy = vi
      .spyOn(AgentRoutingOrchestratorService.prototype, 'rerouteDelegatedTask')
      .mockResolvedValue({
        assignedAgent: 'recruiting_coordinator',
        description: 'Route to recruiting',
      });

    const policy = new AgentRouterPolicyService({ execute: vi.fn() } as never);

    const reroute = await policy.rerouteDelegatedTask(
      'Route to recruiting',
      'data_coordinator',
      createSessionContext(),
      { sourceId: 'source-2' }
    );

    expect(orchestratorSpy).toHaveBeenCalledOnce();
    expect(orchestratorSpy).toHaveBeenCalledWith(
      'Route to recruiting',
      'data_coordinator',
      expect.objectContaining({ sessionId: 'session-1' }),
      { sourceId: 'source-2' }
    );
    expect(reroute).toEqual({
      assignedAgent: 'recruiting_coordinator',
      description: 'Route to recruiting',
    });

    orchestratorSpy.mockRestore();
  });

  it('uses planner fallback when deterministic routing cannot infer a different owner', async () => {
    const planner = {
      execute: vi.fn().mockResolvedValue({
        data: {
          plan: {
            tasks: [
              {
                id: 'reroute-1',
                assignedAgent: 'strategy_coordinator',
                description: 'Build a revised operations plan',
                dependsOn: [],
                status: 'pending',
                createdAt: new Date().toISOString(),
              },
            ],
          },
        },
      }),
    };
    const policy = new AgentRouterPolicyService(planner as never);

    const reroute = await policy.rerouteDelegatedTask(
      'This work needs an owner outside the current specialist.\n\n[Prior Work from data_coordinator] Tools already executed: query_nxt1_data',
      'data_coordinator',
      createSessionContext(),
      { sourceId: 'source-1' }
    );

    expect(planner.execute).toHaveBeenCalledOnce();
    expect(planner.execute).toHaveBeenCalledWith(
      expect.stringContaining('This work needs an owner outside the current specialist.'),
      expect.any(Object),
      []
    );
    expect(planner.execute.mock.calls[0]?.[0]).not.toContain('[Prior Work from data_coordinator]');
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'strategy_coordinator',
        description: 'Build a revised operations plan',
      })
    );
    expect(reroute?.structuredPayload).toMatchObject({
      sourceId: 'source-1',
      delegationContext: {
        sourceAgentId: 'data_coordinator',
        priorWork: '[Prior Work from data_coordinator] Tools already executed: query_nxt1_data',
      },
    });
  });
});
