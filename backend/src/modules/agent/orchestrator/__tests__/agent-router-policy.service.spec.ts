import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionContext, AgentUserContext } from '@nxt1/core';
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
        description: 'Execute a personalized email outreach campaign to 42 Texas football coaches.',
        statusNote: 'Reassigned from data_coordinator to recruiting_coordinator.',
      })
    );
    expect(reroute?.structuredPayload).toMatchObject({
      storagePath: 'Users/test/contacts.csv',
      delegationContext: {
        sourceAgentId: 'data_coordinator',
        priorWork:
          '[Prior Work from data_coordinator] Tools already executed: search_web, dynamic_export',
      },
    });
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
