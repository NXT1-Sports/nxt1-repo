import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionContext, AgentUserContext } from '@nxt1/core';
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

const createService = (
  executePlanImpl: (args: Record<string, unknown>) => Promise<unknown>,
  options: { resolveUserContext?: (userId: string) => Promise<AgentUserContext> } = {}
) =>
  new AgentRouterPrimaryService({
    executionService: {
      executePlan: executePlanImpl,
    } as never,
    contextService: {
      hydrateSessionContextAttachments: vi
        .fn()
        .mockImplementation(async (sessionContext: AgentSessionContext) => sessionContext),
    } as never,
    policyService: {} as never,
    planningService: {} as never,
    planner: {} as never,
    agents: new Map(),
    resolveToolAccessContext: vi.fn().mockResolvedValue({}),
    ...(options.resolveUserContext ? { resolveUserContext: options.resolveUserContext } : {}),
    planRepository: {} as never,
  });

describe('AgentRouterPrimaryService', () => {
  it('streams coordinator start and task lifecycle updates during handoff', async () => {
    const events: Record<string, unknown>[] = [];
    const service = createService(async (args) => {
      const onUpdate = args['onUpdate'] as ((update: Record<string, unknown>) => void) | undefined;
      onUpdate?.({
        operationId: 'op-progress',
        status: 'acting',
        agentId: 'strategy_coordinator',
        stageType: 'router',
        stage: 'agent_thinking',
        step: {
          id: 'step-1',
          timestamp: new Date().toISOString(),
          status: 'acting',
          message: 'Running task strategy_coordinator_1: Create a Cover 2 beater diagram',
          agentId: 'strategy_coordinator',
          stageType: 'router',
          stage: 'agent_thinking',
          payload: { eventType: 'task_started', taskId: 'strategy_coordinator_1' },
        },
      });

      return {
        taskResults: new Map([
          [
            'strategy_coordinator_1',
            {
              summary: 'Cover 2 beater diagram complete with QB read progression.',
            },
          ],
        ]),
        mutableTasks: [
          {
            id: 'strategy_coordinator_1',
            status: 'completed',
            description: 'Create a Cover 2 beater diagram',
          },
        ],
      };
    });

    const result = await service.runCoordinator(
      'strategy_coordinator',
      'Create a Cover 2 beater diagram',
      {
        operationId: 'op-progress',
        userId: 'user-1',
        enrichedIntent: 'Create a football Cover 2 beater diagram.',
        sessionContext: createSessionContext(),
        onStreamEvent: (event) => events.push(event as unknown as Record<string, unknown>),
      }
    );

    expect(result.success).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'operation',
          agentId: 'strategy_coordinator',
          stage: 'routing_to_agent',
          message: 'Strategy Coordinator is starting...',
        }),
        expect.objectContaining({
          type: 'progress_subphase',
          agentId: 'strategy_coordinator',
          stage: 'agent_thinking',
          message: 'Running task strategy_coordinator_1: Create a Cover 2 beater diagram',
          metadata: expect.objectContaining({
            phase: 'coordinator_dispatch',
            originalEventType: 'task_started',
            taskId: 'strategy_coordinator_1',
          }),
        }),
      ])
    );
  });

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

  it('does not treat a completed task description echo as a user-facing coordinator response', async () => {
    const taskDescription =
      'Analyze 8 selected film clips from the film review. Surface the most important trends, tendencies, leverage points, and what should be prioritized next.';
    const service = createService(async (args) => {
      const onStreamEvent = args['onStreamEvent'] as
        | ((event: Record<string, unknown>) => void)
        | undefined;
      onStreamEvent?.({
        type: 'delta',
        agentId: 'performance_coordinator',
        text: 'Analyzing review source distribution across multiple film datasets.',
      });

      return {
        taskResults: new Map([
          [
            'performance_coordinator_1',
            {
              summary: taskDescription,
              data: {},
            },
          ],
        ]),
        mutableTasks: [
          {
            id: 'performance_coordinator_1',
            status: 'completed',
            description: taskDescription,
          },
        ],
      };
    });

    const result = await service.runCoordinator('performance_coordinator', taskDescription, {
      operationId: 'op-task-echo',
      userId: 'user-1',
      enrichedIntent: 'Analyze selected film clips',
      sessionContext: createSessionContext(),
      onStreamEvent: vi.fn(),
    });

    expect(result.success).toBe(true);
    expect(result.streamedDeltaCount).toBe(1);
    expect(result.userAlreadyReceivedResponse).toBe(false);
    expect(result.observation).not.toContain(`  ${taskDescription}`);
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

  it('enriches coordinator payloads with organization context for brand handoffs', async () => {
    let capturedTask: { structuredPayload?: Record<string, unknown> } | undefined;
    const service = createService(
      async (args) => {
        const plan = args['plan'] as {
          tasks: Array<{ structuredPayload?: Record<string, unknown> }>;
        };
        capturedTask = plan.tasks[0];

        return {
          taskResults: new Map([
            [
              'brand_coordinator_1',
              {
                summary: 'Brand handoff accepted with organization context for color lookup.',
              },
            ],
          ]),
          mutableTasks: [
            {
              id: 'brand_coordinator_1',
              status: 'completed',
              description: 'Create a highlight reel',
            },
          ],
        };
      },
      {
        resolveUserContext: vi.fn().mockResolvedValue({
          userId: 'user-1',
          role: 'athlete',
          displayName: 'John Doe',
          organizationId: 'org-crown-point',
          teamId: 'team-basketball',
          teamCode: '2P49TB',
        } as AgentUserContext),
      }
    );

    await service.runCoordinator(
      'brand_coordinator',
      'Create a highlight reel',
      {
        operationId: 'op-brand-org',
        userId: 'user-1',
        enrichedIntent: 'Create an elite highlight reel for Crown Point Bulldogs.',
        sessionContext: createSessionContext(),
      },
      {
        team: 'Crown Point Bulldogs',
        sport: 'Basketball Mens',
      }
    );

    expect(capturedTask?.structuredPayload).toMatchObject({
      team: 'Crown Point Bulldogs',
      sport: 'Basketball Mens',
      teamId: 'team-basketball',
      teamCode: '2P49TB',
      organizationId: 'org-crown-point',
    });
  });

  it('hydrates prior thread attachments before executing an approved saved plan', async () => {
    const hydratedContext: AgentSessionContext = {
      ...createSessionContext(),
      threadId: 'thread-1',
      videoAttachments: [
        {
          url: 'https://cdn.example.com/highlight.mov',
          mimeType: 'video/quicktime',
          name: 'highlight.mov',
          thumbnailUrl: 'https://cdn.example.com/highlight.jpg',
        },
      ],
    };
    const hydrateSessionContextAttachments = vi.fn().mockResolvedValue(hydratedContext);
    const executePlan = vi.fn().mockResolvedValue({
      taskResults: new Map([
        [
          'brand_1',
          {
            summary: 'Highlight video completed.',
          },
        ],
      ]),
      mutableTasks: [
        {
          id: 'brand_1',
          status: 'completed',
          description: 'Create highlight video',
        },
      ],
    });

    const planRepository = {
      getById: vi.fn().mockResolvedValue({
        planId: 'plan-1',
        userId: 'user-1',
        tasks: [{ id: 'brand_1', description: 'Create highlight video', status: 'pending' }],
      }),
      markExecuting: vi.fn().mockResolvedValue(undefined),
      syncExecutionSnapshot: vi.fn().mockResolvedValue(undefined),
      markTerminal: vi.fn().mockResolvedValue(undefined),
    } as never;

    const service = new AgentRouterPrimaryService({
      executionService: { executePlan } as never,
      contextService: {
        hydrateSessionContextAttachments,
        buildTaskIntent: vi.fn(),
      } as never,
      policyService: { rerouteDelegatedTask: vi.fn() } as never,
      planningService: {} as never,
      planner: {} as never,
      agents: new Map(),
      resolveToolAccessContext: vi.fn().mockResolvedValue({}),
      planRepository,
    });

    await service.runApprovedPlan('plan-1', {
      operationId: 'op-1',
      userId: 'user-1',
      enrichedIntent: 'Create highlight video',
      sessionContext: {
        ...createSessionContext(),
        threadId: 'thread-1',
      },
    });

    expect(hydrateSessionContextAttachments).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-1' })
    );
    expect(executePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        context: hydratedContext,
      })
    );
  });
});
