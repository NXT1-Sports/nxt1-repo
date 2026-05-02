import { describe, expect, it, vi } from 'vitest';
import type {
  AgentIdentifier,
  AgentOperationResult,
  AgentSessionContext,
  AgentTask,
  AgentToolAccessContext,
  AgentToolDefinition,
} from '@nxt1/core';
import { AgentRouterContextService } from '../agent-router-context.service.js';
import { AgentRouterExecutionService } from '../agent-router-execution.service.js';
import type { BaseAgent } from '../../agents/base.agent.js';
import type { ToolRegistry, MatchedToolDefinition } from '../../tools/tool-registry.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';

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
  it('buildTaskIntent produces an objective-first handoff block', () => {
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

    const taskIntent = contextService.buildTaskIntent(task, new Map(), '[User Profile]\nAthlete');

    expect(taskIntent).toContain('[Agent Handoff]');
    expect(taskIntent).toContain('Objective: Create a 60-second cinematic highlight reel');
    expect(taskIntent).not.toContain('[Current Task]');
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
});
