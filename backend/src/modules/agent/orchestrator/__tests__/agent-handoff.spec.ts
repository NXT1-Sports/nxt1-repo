import { describe, expect, it, vi } from 'vitest';
import type {
  AgentIdentifier,
  AgentOperationResult,
  AgentSessionContext,
  AgentTask,
  AgentToolAccessContext,
  AgentToolDefinition,
  AgentUserContext,
} from '@nxt1/core';
import { AgentRouterContextService } from '../agent-router-context.service.js';
import { AgentRouterExecutionService } from '../agent-router-execution.service.js';
import type { BaseAgent } from '../../agents/base.agent.js';
import type { ToolRegistry, MatchedToolDefinition } from '../../tools/tool-registry.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import { AgentDelegationException } from '../../exceptions/agent-delegation.exception.js';

function createContext(): AgentSessionContext {
  const now = new Date().toISOString();
  return {
    sessionId: 'session-1',
    userId: 'user-1',
    conversationHistory: [],
    createdAt: now,
    lastActiveAt: now,
  };
}

describe('Agent handoff and tool narrowing', () => {
  it('buildTaskIntent scopes handoff to objective and enforces task boundaries', () => {
    const contextService = new AgentRouterContextService(
      {
        compressToPrompt: () => 'mocked',
      } as never,
      undefined
    );

    const task: AgentTask = {
      id: 't1',
      assignedAgent: 'strategy_coordinator',
      description: 'Create a 60-second cinematic highlight reel',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const taskIntent = contextService.buildTaskIntent(
      task,
      new Map(),
      '[User Profile]\nAthlete\n\n[Request]\nCreate, export, and send everything end to end'
    );

    expect(taskIntent).toContain('[User Profile]\nAthlete');
    expect(taskIntent).toContain('[Agent Handoff]');
    expect(taskIntent).toContain('Objective: Create a 60-second cinematic highlight reel');
    expect(taskIntent).toContain('[Task Boundaries]');
    expect(taskIntent).toContain('Execute only this Objective for the current task.');
    expect(taskIntent).toContain('Do NOT perform downstream or future plan tasks in this step.');
    expect(taskIntent).not.toContain('[Request]');
    expect(taskIntent).not.toContain('Create, export, and send everything end to end');
    expect(taskIntent).not.toContain('[Current Task]');
  });

  it('adds request sport override when the user explicitly asks about a different sport', () => {
    const contextService = new AgentRouterContextService(
      {
        compressToPrompt: () => 'Name: Multi Sport Athlete\nSport: basketball',
      } as never,
      undefined
    );

    const userContext: AgentUserContext = {
      userId: 'user-1',
      role: 'athlete',
      displayName: 'Multi Sport Athlete',
      sport: 'basketball',
      sports: [
        { sport: 'basketball', positions: ['PG'], isActive: true },
        { sport: 'football', positions: ['QB'], isActive: false },
      ],
    };

    const enriched = contextService.enrichIntentWithContext(
      'Break down my football film from last game',
      userContext
    );

    expect(enriched).toContain('[Resolved Sport Context]');
    expect(enriched).toContain('Profile active sport: basketball');
    expect(enriched).toContain('Request explicitly refers to: football');
    expect(enriched).toContain('Use football as the primary sport context');
  });

  it('keeps the thread sport when the latest user turn does not restate it', () => {
    const contextService = new AgentRouterContextService(
      {
        compressToPrompt: () => 'Name: Multi Sport Athlete\nSport: basketball',
      } as never,
      undefined
    );

    const userContext: AgentUserContext = {
      userId: 'user-1',
      role: 'athlete',
      displayName: 'Multi Sport Athlete',
      sport: 'basketball',
      sports: [
        { sport: 'basketball', positions: ['PG'], isActive: true },
        { sport: 'football', positions: ['QB'], isActive: false },
      ],
    };

    const enriched = contextService.enrichIntentWithContext(
      'Now break down the coverages from that clip',
      userContext,
      undefined,
      '\n<<<THREAD_HISTORY_START>>>\n[User]: Break down my football film from last game\n[Agent X]: Here are the first notes\n<<<THREAD_HISTORY_END>>>'
    );

    expect(enriched).toContain('[Resolved Sport Context]');
    expect(enriched).toContain('Profile active sport: basketball');
    expect(enriched).toContain('Active thread context refers to: football');
    expect(enriched).toContain('Use football as the primary sport context');
  });

  it('keeps safety-buffer read tools while excluding low-score mutations', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'read_safe_tool',
        description: 'Read-safe lookup',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'database',
        entityGroup: 'platform_tools',
      },
      {
        name: 'mutate_low_confidence',
        description: 'Mutation tool with low confidence',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'automation',
        entityGroup: 'platform_tools',
      },
      {
        name: 'mutate_high_confidence',
        description: 'Mutation tool with high confidence',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'automation',
        entityGroup: 'platform_tools',
      },
    ];

    const scoredDefs: MatchedToolDefinition[] = [
      { ...baseDefs[0], semanticScore: 0.21 },
      { ...baseDefs[1], semanticScore: 0.21 },
      { ...baseDefs[2], semanticScore: 0.88 },
    ];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue(scoredDefs),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const capturedToolDefs: AgentToolDefinition[][] = [];
    const fakeAgent = {
      id: 'strategy_coordinator' as AgentIdentifier,
      name: 'Strategy',
      execute: vi
        .fn()
        .mockImplementation(
          async (
            _intent: string,
            _context: AgentSessionContext,
            defs: readonly AgentToolDefinition[]
          ) => {
            capturedToolDefs.push([...defs]);
            return {
              summary: 'ok',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    const task: AgentTask = {
      id: 't1',
      assignedAgent: 'strategy_coordinator',
      description: 'Find athlete opportunities',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
    };

    await service.executePlan({
      operationId: 'op-1',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'Find athlete opportunities',
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['strategy_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Find athlete opportunities',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('read_safe_tool');
    expect(usedToolNames).toContain('mutate_high_confidence');
    expect(usedToolNames).not.toContain('mutate_low_confidence');
  });

  it('retains runway_check_task when a narrowed runway submit tool is selected', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'runway_generate_video',
        description: 'Generate video with Runway',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'runway_check_task',
        description: 'Check Runway task status',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'media',
        entityGroup: 'user_tools',
      },
    ];

    const scoredDefs: MatchedToolDefinition[] = [{ ...baseDefs[0], semanticScore: 0.92 }];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue(scoredDefs),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.5, 0.4, 0.3]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const capturedToolDefs: AgentToolDefinition[][] = [];
    const fakeAgent = {
      id: 'brand_coordinator' as AgentIdentifier,
      name: 'Brand',
      execute: vi
        .fn()
        .mockImplementation(
          async (
            _intent: string,
            _context: AgentSessionContext,
            defs: readonly AgentToolDefinition[]
          ) => {
            capturedToolDefs.push([...defs]);
            return {
              summary: 'ok',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    const task: AgentTask = {
      id: 't2',
      assignedAgent: 'brand_coordinator',
      description: 'Animate an intro graphic with Runway',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
    };

    await service.executePlan({
      operationId: 'op-2',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'Animate an intro graphic with Runway',
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['brand_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Animate an intro graphic with Runway',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('runway_generate_video');
    expect(usedToolNames).toContain('runway_check_task');
  });

  it('retains FFmpeg trim tools when a narrowed brand video-staging workflow is selected', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'stage_media',
        description: 'Stage an external media URL for downstream video editing',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'analyze_video',
        description: 'Analyze game film and return highlight timestamps',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'ffmpeg_trim_video',
        description: 'Trim a source video to a specific time range',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'ffmpeg_merge_videos',
        description: 'Merge multiple trimmed video clips',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'ffmpeg_generate_thumbnail',
        description: 'Generate a thumbnail from a video frame',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
    ];

    const scoredDefs: MatchedToolDefinition[] = [{ ...baseDefs[0], semanticScore: 0.9 }];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue(scoredDefs),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.5, 0.4, 0.3]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const capturedToolDefs: AgentToolDefinition[][] = [];
    const fakeAgent = {
      id: 'brand_coordinator' as AgentIdentifier,
      name: 'Brand',
      execute: vi
        .fn()
        .mockImplementation(
          async (
            _intent: string,
            _context: AgentSessionContext,
            defs: readonly AgentToolDefinition[]
          ) => {
            capturedToolDefs.push([...defs]);
            return {
              summary: 'ok',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    const task: AgentTask = {
      id: 't2b',
      assignedAgent: 'brand_coordinator',
      description: 'Stage Hudl clips and build an elite highlight reel',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
    };

    await service.executePlan({
      operationId: 'op-2b',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'Grab my last couple Hudl videos and build an elite highlight reel',
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['brand_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Stage Hudl clips and build an elite highlight reel',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('stage_media');
    expect(usedToolNames).toContain('analyze_video');
    expect(usedToolNames).toContain('ffmpeg_trim_video');
    expect(usedToolNames).toContain('ffmpeg_merge_videos');
    expect(usedToolNames).toContain('ffmpeg_generate_thumbnail');
    expect(usedToolNames).not.toContain('runway_edit_video');
  });

  it('retains distilled scrape follow-up tools when profile ingestion is selected', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'scrape_and_index_profile',
        description: 'Scrape and distill an external profile',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'analytics',
        entityGroup: 'platform_tools',
      },
      {
        name: 'read_distilled_section',
        description: 'Read a distilled section',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'analytics',
        entityGroup: 'platform_tools',
      },
      {
        name: 'dispatch_extraction',
        description: 'Dispatch raw extraction',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'analytics',
        entityGroup: 'platform_tools',
      },
      {
        name: 'write_core_identity',
        description: 'Write core identity',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'database',
        entityGroup: 'user_tools',
      },
      {
        name: 'write_schedule',
        description: 'Write team schedule',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'database',
        entityGroup: 'team_tools',
      },
    ];

    const scoredDefs: MatchedToolDefinition[] = [{ ...baseDefs[0], semanticScore: 0.91 }];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue(scoredDefs),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.5, 0.4, 0.3]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const capturedToolDefs: AgentToolDefinition[][] = [];
    const fakeAgent = {
      id: 'data_coordinator' as AgentIdentifier,
      name: 'Data Coordinator',
      execute: vi
        .fn()
        .mockImplementation(
          async (
            _intent: string,
            _context: AgentSessionContext,
            defs: readonly AgentToolDefinition[]
          ) => {
            capturedToolDefs.push([...defs]);
            return {
              summary: 'ok',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    const task: AgentTask = {
      id: 't3',
      assignedAgent: 'data_coordinator',
      description: 'Re-sync MaxPreps profile',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools', 'team_tools'],
    };

    await service.executePlan({
      operationId: 'op-3',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'Re-sync my MaxPreps profile',
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['data_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Re-sync my MaxPreps profile',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('scrape_and_index_profile');
    expect(usedToolNames).toContain('read_distilled_section');
    expect(usedToolNames).toContain('dispatch_extraction');
    expect(usedToolNames).toContain('write_core_identity');
    expect(usedToolNames).toContain('write_schedule');
  });

  it('enforces single in-progress task ownership across plan snapshots', async () => {
    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue([]),
      matchWithScores: vi.fn().mockResolvedValue([]),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.2, 0.2, 0.2]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const executionOrder: string[] = [];
    const fakeAgent = {
      id: 'strategy_coordinator' as AgentIdentifier,
      name: 'Strategy',
      execute: vi.fn().mockImplementation(async (intent: string) => {
        executionOrder.push(intent.includes('Step A') ? 'A' : 'B');
        return {
          summary: 'ok',
          data: {},
          suggestions: [],
        } as AgentOperationResult;
      }),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    const taskA: AgentTask = {
      id: 'a',
      assignedAgent: 'strategy_coordinator',
      description: 'Step A objective',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const taskB: AgentTask = {
      id: 'b',
      assignedAgent: 'strategy_coordinator',
      description: 'Step B objective',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const snapshots: Array<readonly { id: string; status: string }[]> = [];

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
    };

    await service.executePlan({
      operationId: 'op-single-active',
      userId: 'user-1',
      plan: { tasks: [taskA, taskB] },
      enrichedIntent: 'Run two independent steps serially',
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['strategy_coordinator', fakeAgent]]),
      buildTaskIntent: (task) => `Objective: ${task.description}`,
      rerouteDelegatedTask: async () => null,
      onPlanStateChange: async (mutableTasks) => {
        snapshots.push(mutableTasks.map((task) => ({ id: task.id, status: task.status })));
      },
    });

    expect(executionOrder).toEqual(['A', 'B']);

    for (const snapshot of snapshots) {
      const inProgressCount = snapshot.filter((task) => task.status === 'in_progress').length;
      expect(inProgressCount).toBeLessThanOrEqual(1);
    }

    const finalSnapshot = snapshots[snapshots.length - 1] ?? [];
    expect(finalSnapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', status: 'completed' }),
        expect.objectContaining({ id: 'b', status: 'completed' }),
      ])
    );
  });

  it('continues the same task under a rerouted coordinator after delegation', async () => {
    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue([]),
      matchWithScores: vi.fn().mockResolvedValue([]),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.2, 0.2, 0.2]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const dataAgent = {
      id: 'data_coordinator' as AgentIdentifier,
      name: 'Data',
      execute: vi.fn().mockRejectedValue(
        new AgentDelegationException({
          sourceAgent: 'data_coordinator',
          forwardingIntent: 'Draft and send personalized recruiting emails to Texas coaches.',
        })
      ),
    } as unknown as BaseAgent;

    const recruitingAgent = {
      id: 'recruiting_coordinator' as AgentIdentifier,
      name: 'Recruiting',
      execute: vi.fn().mockResolvedValue({
        summary: 'Drafted outreach campaign for coach approval.',
        data: {},
        suggestions: [],
      } as AgentOperationResult),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);
    const task: AgentTask = {
      id: '2',
      assignedAgent: 'data_coordinator',
      description: 'Extract Coach Contacts',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
    };

    const result = await service.executePlan({
      operationId: 'op-reroute',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'Send emails to college coaches',
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([
        ['data_coordinator', dataAgent],
        ['recruiting_coordinator', recruitingAgent],
      ]),
      buildTaskIntent: (activeTask) => `Objective: ${activeTask.description}`,
      rerouteDelegatedTask: async () => ({
        assignedAgent: 'recruiting_coordinator',
        description: 'Draft and send personalized recruiting emails to Texas coaches.',
        statusNote: 'Reassigned from data_coordinator to recruiting_coordinator.',
      }),
    });

    expect(dataAgent.execute).toHaveBeenCalledOnce();
    expect(recruitingAgent.execute).toHaveBeenCalledOnce();
    expect(result.mutableTasks[0]).toEqual(
      expect.objectContaining({
        id: '2',
        assignedAgent: 'recruiting_coordinator',
        status: 'completed',
        statusNote: 'Reassigned from data_coordinator to recruiting_coordinator.',
        _lastError: undefined,
      })
    );
  });

  it('stores a safe task error when delegation cannot be rerouted', async () => {
    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue([]),
      matchWithScores: vi.fn().mockResolvedValue([]),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.2, 0.2, 0.2]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const rawForwardingIntent =
      'Execute a personalized email outreach campaign.\n\n[Prior Work from data_coordinator] Tools already executed: search_web';
    const dataAgent = {
      id: 'data_coordinator' as AgentIdentifier,
      name: 'Data',
      execute: vi.fn().mockRejectedValue(
        new AgentDelegationException({
          sourceAgent: 'data_coordinator',
          forwardingIntent: rawForwardingIntent,
        })
      ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);
    const task: AgentTask = {
      id: '2',
      assignedAgent: 'data_coordinator',
      description: 'Extract Coach Contacts',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
    };

    const result = await service.executePlan({
      operationId: 'op-reroute-failed',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'Send emails to college coaches',
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['data_coordinator', dataAgent]]),
      buildTaskIntent: (activeTask) => `Objective: ${activeTask.description}`,
      rerouteDelegatedTask: async () => null,
    });

    expect(result.mutableTasks[0]).toEqual(
      expect.objectContaining({
        id: '2',
        status: 'failed',
        _lastError: 'Coordinator handoff failed. Router could not reassign this task.',
      })
    );
    expect(result.mutableTasks[0]?._lastError).not.toContain(rawForwardingIntent);
    const failedUpdateCall = telemetry.emitUpdate.mock.calls.find(
      (call) => typeof call[4] === 'object' && call[4] !== null && 'internalError' in call[4]
    );
    expect(failedUpdateCall?.[4]).toEqual(
      expect.objectContaining({ internalError: expect.stringContaining(rawForwardingIntent) })
    );
  });
});
