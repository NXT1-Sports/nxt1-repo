import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionContext } from '@nxt1/core';
import { AgentRouterPrimaryService } from '../agent-router-primary.service.js';

const createSessionContext = (): AgentSessionContext => {
  const now = new Date().toISOString();
  return {
    sessionId: 'session-1',
    userId: 'user-1',
    conversationHistory: [],
    createdAt: now,
    lastActiveAt: now,
  };
};

const createService = (executePlanImpl: (args: Record<string, unknown>) => Promise<unknown>) =>
  new AgentRouterPrimaryService({
    executionService: {
      executePlan: executePlanImpl,
    } as never,
    contextService: {} as never,
    policyService: {} as never,
    planningService: {} as never,
    planner: {} as never,
    agents: new Map(),
    resolveToolAccessContext: vi.fn().mockResolvedValue({}),
    planRepository: {} as never,
  });

describe('AgentRouterPrimaryService', () => {
  it('does not mark userAlreadyReceivedResponse true for progress-only streamed deltas', async () => {
    const service = createService(async (args) => {
      const onStreamEvent = args['onStreamEvent'] as
        | ((event: Record<string, unknown>) => void)
        | undefined;
      onStreamEvent?.({
        type: 'delta',
        agentId: 'performance_coordinator',
        text: 'Analyzing film...',
      });

      return {
        taskResults: new Map([
          [
            'performance_coordinator_1',
            {
              summary: '',
              data: {},
            },
          ],
        ]),
        mutableTasks: [
          {
            id: 'performance_coordinator_1',
            status: 'completed',
            description: 'Analyze uploaded film',
          },
        ],
      };
    });

    const result = await service.runCoordinator(
      'performance_coordinator',
      'Analyze uploaded film',
      {
        operationId: 'op-1',
        userId: 'user-1',
        enrichedIntent: 'Scout the next football opponent',
        sessionContext: createSessionContext(),
        onStreamEvent: vi.fn(),
      }
    );

    expect(result.success).toBe(true);
    expect(result.streamedDeltaCount).toBe(1);
    expect(result.userAlreadyReceivedResponse).toBe(false);
  });

  it('marks userAlreadyReceivedResponse true when streamed deltas include a real final summary', async () => {
    const service = createService(async (args) => {
      const onStreamEvent = args['onStreamEvent'] as
        | ((event: Record<string, unknown>) => void)
        | undefined;
      onStreamEvent?.({
        type: 'delta',
        agentId: 'performance_coordinator',
        text: 'Top tendency: 72% inside zone on 2nd-and-medium.',
      });

      return {
        taskResults: new Map([
          [
            'performance_coordinator_2',
            {
              summary:
                'Opponent tendency report complete with down-and-distance, pressure looks, and three install points.',
            },
          ],
        ]),
        mutableTasks: [
          {
            id: 'performance_coordinator_2',
            status: 'completed',
            description: 'Analyze uploaded film',
          },
        ],
      };
    });

    const result = await service.runCoordinator(
      'performance_coordinator',
      'Analyze uploaded film',
      {
        operationId: 'op-2',
        userId: 'user-1',
        enrichedIntent: 'Scout the next football opponent',
        sessionContext: createSessionContext(),
        onStreamEvent: vi.fn(),
      }
    );

    expect(result.success).toBe(true);
    expect(result.streamedDeltaCount).toBe(1);
    expect(result.userAlreadyReceivedResponse).toBe(true);
  });

  it('does not mark userAlreadyReceivedResponse true for generic tool-only completion text', async () => {
    const service = createService(async (args) => {
      const onStreamEvent = args['onStreamEvent'] as
        | ((event: Record<string, unknown>) => void)
        | undefined;
      onStreamEvent?.({
        type: 'delta',
        agentId: 'performance_coordinator',
        text: 'Completed: get film review.',
      });

      return {
        taskResults: new Map([
          [
            'performance_coordinator_3',
            {
              summary: 'Completed: get film review.',
            },
          ],
        ]),
        mutableTasks: [
          {
            id: 'performance_coordinator_3',
            status: 'completed',
            description: 'Analyze uploaded film',
          },
        ],
      };
    });

    const result = await service.runCoordinator(
      'performance_coordinator',
      'Analyze uploaded film',
      {
        operationId: 'op-3',
        userId: 'user-1',
        enrichedIntent: 'Scout the next football opponent',
        sessionContext: createSessionContext(),
        onStreamEvent: vi.fn(),
      }
    );

    expect(result.success).toBe(true);
    expect(result.streamedDeltaCount).toBe(1);
    expect(result.userAlreadyReceivedResponse).toBe(false);
  });

  it('filters generic task summaries from coordinator observation output', async () => {
    const service = createService(async () => {
      return {
        taskResults: new Map([
          [
            'performance_coordinator_4',
            {
              summary: 'Returned 7 field(s).',
            },
          ],
        ]),
        mutableTasks: [
          {
            id: 'performance_coordinator_4',
            status: 'completed',
            description: 'Analyze uploaded film',
          },
        ],
      };
    });

    const result = await service.runCoordinator(
      'performance_coordinator',
      'Analyze uploaded film',
      {
        operationId: 'op-4',
        userId: 'user-1',
        enrichedIntent: 'Scout the next football opponent',
        sessionContext: createSessionContext(),
        onStreamEvent: vi.fn(),
      }
    );

    expect(result.success).toBe(true);
    expect(result.userAlreadyReceivedResponse).toBe(false);
    expect(result.observation).not.toContain('Returned 7 field(s).');
  });
});
