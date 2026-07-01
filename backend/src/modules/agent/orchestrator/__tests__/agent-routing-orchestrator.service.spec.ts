import { describe, expect, it, vi } from 'vitest';
import { AgentRoutingOrchestratorService } from '../agent-routing-orchestrator.service.js';

describe('AgentRoutingOrchestratorService', () => {
  it('deterministically reroutes delegated work without planner fallback', async () => {
    const planner = { execute: vi.fn() };
    const orchestrator = new AgentRoutingOrchestratorService(planner as never);

    const reroute = await orchestrator.rerouteDelegatedTask(
      'Execute a personalized email outreach campaign to 42 Texas football coaches.\n\n[Prior Work from data_coordinator] Tools already executed: search_web, dynamic_export',
      'data_coordinator',
      {
        sessionId: 'session-1',
        userId: 'user-1',
        conversationHistory: [],
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      }
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
      delegationContext: {
        sourceAgentId: 'data_coordinator',
        priorWork:
          '[Prior Work from data_coordinator] Tools already executed: search_web, dynamic_export',
      },
      workflowOwnership: {
        workflowId: 'recruiting_outreach_campaign',
        owner: 'recruiting_coordinator',
      },
    });
  });

  it('falls back to planner routing when no deterministic rule matches', async () => {
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
    const orchestrator = new AgentRoutingOrchestratorService(planner as never);

    const reroute = await orchestrator.rerouteDelegatedTask(
      'This work needs an owner outside the current specialist.',
      'data_coordinator',
      {
        sessionId: 'session-2',
        userId: 'user-1',
        conversationHistory: [],
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      { sourceId: 'source-1' }
    );

    expect(planner.execute).toHaveBeenCalledOnce();
    expect(planner.execute).toHaveBeenCalledWith(
      expect.stringContaining('This work needs an owner outside the current specialist.'),
      expect.any(Object),
      []
    );
    expect(reroute).toEqual(
      expect.objectContaining({
        assignedAgent: 'strategy_coordinator',
        description: 'Build a revised operations plan',
        statusNote: 'Reassigned from data_coordinator to strategy_coordinator.',
      })
    );
    expect(reroute?.structuredPayload).toEqual({ sourceId: 'source-1' });
  });
});
