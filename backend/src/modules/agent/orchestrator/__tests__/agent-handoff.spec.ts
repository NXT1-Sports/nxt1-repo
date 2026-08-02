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
import {
  AgentRouterExecutionService,
  computeForcedToolInclusions,
} from '../agent-router-execution.service.js';
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
  it('forces deterministic source analysis for selected-film player stat requests', () => {
    const forced = computeForcedToolInclusions(
      'Analyze the 18 selected film plays and pull the full offensive stats for each player on our team.'
    );

    expect(forced).toContain('analyze_film_review_sources');
    expect(forced).toContain('list_film_review_sources');
  });

  it('forces sandbox computation for selected-film saved-row performance questions', () => {
    const forced = computeForcedToolInclusions(
      'How did our offense do on these selected film plays from Riverside Full Game 2026?'
    );

    expect(forced).toContain('execute_sandbox_script');
    expect(forced).toContain('get_film_review');
    expect(forced).not.toContain('analyze_film_review_sources');
    expect(forced).not.toContain('analyze_film_review_source_breakdowns');
  });

  it('routes known film breakdown corrections through the lossless patch writer', () => {
    const forced = computeForcedToolInclusions(
      'Set DEF FRONT to Odd on the selected film breakdown row.'
    );

    expect(forced).toContain('patch_film_review_source_breakdowns');
    expect(forced).not.toContain('analyze_film_review_source_breakdowns');
  });

  it('routes video-derived breakdown updates through analysis and lossless patching', () => {
    const forced = computeForcedToolInclusions(
      'Watch all selected clips, identify every defensive front, and add it to the film breakdown.'
    );

    expect(forced).toContain('analyze_film_review_source_breakdowns');
    expect(forced).toContain('patch_film_review_source_breakdowns');
  });

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

  it('preserves selected film context drawing directives during coordinator handoff', () => {
    const contextService = new AgentRouterContextService(
      {
        compressToPrompt: () => 'mocked',
      } as never,
      undefined
    );

    const task: AgentTask = {
      id: 't1',
      assignedAgent: 'performance_coordinator',
      description: 'Analyze the marked film play',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const taskIntent = contextService.buildTaskIntent(
      task,
      new Map(),
      [
        '[User Profile]',
        'Athlete',
        '',
        '[Request]',
        'Can you see who I circled?',
        '',
        '[Selected contexts (confirmed by user for this turn):',
        '1. film_play (Week 4 Cutup): Play 3 @ 11.5s-18.5s — User drawing annotation: freehand, 1 stroke(s), video-frame normalized bounds x=0.123-0.543, y=0.235-0.765, centered in the center-middle of the video frame.',
        ']',
        '[Instruction: prioritize these contexts while reasoning and cite their timestamps when relevant. If a selected context includes a drawing annotation, treat the annotation coordinates as the user-selected area even if the raw video frame does not visibly contain the overlay.]',
      ].join('\n')
    );

    expect(taskIntent).toContain('[User Profile]\nAthlete');
    expect(taskIntent).toContain('[Selected Contexts From User Request]');
    expect(taskIntent).toContain('User drawing annotation: freehand, 1 stroke(s)');
    expect(taskIntent).toContain('video-frame normalized bounds x=0.123-0.543, y=0.235-0.765');
    expect(taskIntent).toContain('raw video frame does not visibly contain the overlay');
    expect(taskIntent).toContain('Objective: Analyze the marked film play');
    expect(taskIntent).not.toContain('Can you see who I circled?');
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

  it('does not carry sport from thread history when latest user turn does not restate it', () => {
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

    expect(enriched).not.toContain('[Resolved Sport Context]');
  });

  it('uses an explicit session sport lock from job context when request does not restate sport', () => {
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
      { sportLock: 'football' }
    );

    expect(enriched).toContain('[Resolved Sport Context]');
    expect(enriched).toContain('Profile active sport: basketball');
    expect(enriched).toContain('Session lock refers to: football');
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
    const contextService = new AgentRouterContextService(
      {
        compressToPrompt: () => 'Name: Test Athlete\nRole: athlete\nSport: football',
      } as never,
      undefined
    );
    const userContext: AgentUserContext = {
      userId: 'user-1',
      role: 'athlete',
      displayName: 'Test Athlete',
      sport: 'football',
    };
    contextService.enrichIntentWithContext(
      'Create Highlight Reel from uploaded video',
      userContext,
      {
        selectedAction: {
          coordinatorId: 'brand_coordinator',
          actionId: 'brand-highlight',
          surface: 'command',
        },
        videoAttachments: [
          {
            name: 'source.mp4',
            mimeType: 'video/mp4',
            url: 'https://storage.googleapis.com/nxt1-test/source.mp4',
            cloudflareVideoId: 'cf-source-1',
          },
        ],
      }
    );

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

  it('forces canonical snapshot lookup and suppresses broad platform lookup for brand highlight branding', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'query_nxt1_platform_data',
        description: 'Query broad platform data across all collections',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'system',
        entityGroup: 'platform_tools',
      },
      {
        name: 'query_nxt1_data',
        description:
          'Read canonical user, team, and organization snapshots including logoUrl, primaryColor, and secondaryColor',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'database',
        entityGroup: 'platform_tools',
      },
      {
        name: 'generate_graphic',
        description: 'Generate a branded sports graphic',
        parameters: {},
        allowedAgents: ['brand_coordinator'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
    ];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue([
        { ...baseDefs[0], semanticScore: 0.96 },
        { ...baseDefs[2], semanticScore: 0.9 },
      ]),
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
              summary: 'Built the branded highlight reel.',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    await service.executePlan({
      operationId: 'op-brand-snapshot-lookup',
      userId: 'user-1',
      plan: {
        tasks: [
          {
            id: 't-brand-snapshot-lookup',
            assignedAgent: 'brand_coordinator',
            description: 'Create a branded Crown Point Bulldogs highlight reel',
            dependsOn: [],
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      enrichedIntent: 'Create a branded Crown Point Bulldogs highlight reel from attached clips',
      context: createContext(),
      toolAccessContext: {
        userId: 'user-1',
        role: 'director',
        allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
      },
      taskMaxRetries: 0,
      agents: new Map([['brand_coordinator', fakeAgent]]),
      buildTaskIntent: () =>
        'Objective: Create a branded Crown Point Bulldogs highlight reel from attached clips',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('query_nxt1_data');
    expect(usedToolNames).toContain('generate_graphic');
    expect(usedToolNames).not.toContain('query_nxt1_platform_data');
  });

  it('forces Files lookup tools for callsheets even when data query scores higher', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'query_nxt1_data',
        description: 'Read canonical platform data views.',
        parameters: {},
        allowedAgents: ['strategy_coordinator'],
        isMutation: false,
        category: 'database',
        entityGroup: 'platform_tools',
      },
      {
        name: 'list_universal_team_documents',
        description: 'Search saved Files semantically for playbooks, callsheets, and templates.',
        parameters: {},
        allowedAgents: ['strategy_coordinator'],
        isMutation: false,
        category: 'database',
        entityGroup: 'user_tools',
      },
      {
        name: 'get_universal_team_document',
        description: 'Inspect a saved Files item.',
        parameters: {},
        allowedAgents: ['strategy_coordinator'],
        isMutation: false,
        category: 'database',
        entityGroup: 'user_tools',
      },
      {
        name: 'parse_document',
        description: 'Parse uploaded or pointer document files.',
        parameters: {},
        allowedAgents: ['strategy_coordinator'],
        isMutation: false,
        category: 'media',
        entityGroup: 'platform_tools',
      },
      {
        name: 'render_pdf_pages',
        description: 'Render PDF pages when parsing needs vision review.',
        parameters: {},
        allowedAgents: ['strategy_coordinator'],
        isMutation: false,
        category: 'media',
        entityGroup: 'platform_tools',
      },
      {
        name: 'create_universal_team_document',
        description: 'Create a saved Files document for strategy artifacts.',
        parameters: {},
        allowedAgents: ['strategy_coordinator'],
        isMutation: true,
        category: 'database',
        entityGroup: 'user_tools',
      },
      {
        name: 'dynamic_export',
        description: 'Export a callsheet or coaching document.',
        parameters: {},
        allowedAgents: ['strategy_coordinator'],
        isMutation: false,
        category: 'system',
        entityGroup: 'platform_tools',
      },
    ];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue([{ ...baseDefs[0]!, semanticScore: 0.95 }]),
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
              summary: 'Built callsheet.',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    await service.executePlan({
      operationId: 'op-callsheet-files-tools',
      userId: 'user-1',
      plan: {
        tasks: [
          {
            id: 't-callsheet-files-tools',
            assignedAgent: 'strategy_coordinator',
            description: 'Make me a callsheet from our plays',
            dependsOn: [],
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      enrichedIntent: 'Make me a callsheet from our plays',
      context: createContext(),
      toolAccessContext: {
        userId: 'user-1',
        role: 'coach',
        allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
      },
      taskMaxRetries: 0,
      agents: new Map([['strategy_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Make me a callsheet from our plays',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('query_nxt1_data');
    expect(usedToolNames).toContain('list_universal_team_documents');
    expect(usedToolNames).toContain('get_universal_team_document');
    expect(usedToolNames).toContain('parse_document');
    expect(usedToolNames).toContain('render_pdf_pages');
    expect(usedToolNames).toContain('create_universal_team_document');
    expect(usedToolNames).toContain('dynamic_export');
  });

  it('marks explicit failed coordinator results as failed tasks', async () => {
    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue([]),
      matchWithScores: vi.fn().mockResolvedValue([]),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.5, 0.4, 0.3]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const fakeAgent = {
      id: 'brand_coordinator' as AgentIdentifier,
      name: 'Brand',
      execute: vi.fn().mockResolvedValue({
        summary: 'Task completed.',
        data: {},
        suggestions: [],
        success: false,
        errorMessage: 'Media production did not produce a final video URL.',
      } as AgentOperationResult),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);
    const task: AgentTask = {
      id: 't-media-failed',
      assignedAgent: 'brand_coordinator',
      description: 'Create highlight video from attached clips',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const result = await service.executePlan({
      operationId: 'op-media-failed',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'Create highlight video from attached clips',
      context: createContext(),
      toolAccessContext: {
        userId: 'user-1',
        role: 'athlete',
        allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
      },
      taskMaxRetries: 0,
      agents: new Map([['brand_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Create highlight video from attached clips',
      rerouteDelegatedTask: async () => null,
    });

    expect(result.mutableTasks[0]?.status).toBe('failed');
    expect(result.mutableTasks[0]?._lastError).toContain('final video URL');
    expect(result.taskResults.size).toBe(0);
  });

  it('forces FFmpeg tools for selected highlight reel action with attached video', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'generate_graphic',
        description: 'Generate a graphic or title card image',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'runway_generate_video',
        description: 'Animate a generated still image with Runway',
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
      {
        name: 'stage_media',
        description: 'Stage media for downstream editing',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'analyze_video',
        description: 'Analyze source video for highlight timestamps',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'get_video_details',
        description: 'Read source video metadata',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'enable_download',
        description: 'Enable source media download for editing tools',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'ffmpeg_trim_video',
        description: 'Trim a source video to selected highlight moments',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'ffmpeg_merge_videos',
        description: 'Merge trimmed clips into one reel',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
      {
        name: 'ffmpeg_generate_thumbnail',
        description: 'Generate a thumbnail for a merged reel',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'media',
        entityGroup: 'user_tools',
      },
    ];

    const scoredDefs: MatchedToolDefinition[] = [
      { ...baseDefs[0], semanticScore: 0.9 },
      { ...baseDefs[1], semanticScore: 0.86 },
    ];

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
    const contextService = new AgentRouterContextService(
      {
        compressToPrompt: () => 'Name: Test Athlete\nRole: athlete\nSport: football',
      } as never,
      undefined
    );
    const userContext: AgentUserContext = {
      userId: 'user-1',
      role: 'athlete',
      displayName: 'Test Athlete',
      sport: 'football',
    };
    const enrichedIntent = contextService.enrichIntentWithContext(
      'Create Highlight Reel from uploaded video',
      userContext,
      {
        selectedAction: {
          coordinatorId: 'brand_coordinator',
          actionId: 'brand-highlight',
          surface: 'command',
        },
        videoAttachments: [
          {
            name: 'source.mp4',
            mimeType: 'video/mp4',
            url: 'https://storage.googleapis.com/nxt1-test/source.mp4',
            cloudflareVideoId: 'cf-source-1',
          },
        ],
      }
    );

    const task: AgentTask = {
      id: 't2c',
      assignedAgent: 'brand_coordinator',
      description: 'Create Highlight Reel from uploaded video',
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
      operationId: 'op-2c',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent,
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['brand_coordinator', fakeAgent]]),
      buildTaskIntent: (activeTask, upstreamResults, enrichedContext) =>
        contextService.buildTaskIntent(activeTask, upstreamResults, enrichedContext),
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('generate_graphic');
    expect(usedToolNames).toContain('runway_generate_video');
    expect(usedToolNames).toContain('runway_check_task');
    expect(usedToolNames).toContain('stage_media');
    expect(usedToolNames).toContain('analyze_video');
    expect(usedToolNames).toContain('get_video_details');
    expect(usedToolNames).toContain('enable_download');
    expect(usedToolNames).toContain('ffmpeg_trim_video');
    expect(usedToolNames).toContain('ffmpeg_merge_videos');
    expect(usedToolNames).toContain('ffmpeg_generate_thumbnail');
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

  it('retains social scraper tools for mixed connected-source profile syncs', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'classify_media_url',
        description: 'Classify URL acquisition strategy',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'system',
        entityGroup: 'system_tools',
      },
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
        name: 'scrape_twitter',
        description: 'Scrape tweets and profile timelines from Twitter/X with Apify-hosted actors',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'analytics',
        entityGroup: 'platform_tools',
      },
      {
        name: 'search_apify_actors',
        description: 'Search Apify actors',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'analytics',
        entityGroup: 'platform_tools',
      },
      {
        name: 'get_apify_actor_details',
        description: 'Get Apify actor details',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'analytics',
        entityGroup: 'platform_tools',
      },
      {
        name: 'call_apify_actor',
        description: 'Call an Apify actor',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'analytics',
        entityGroup: 'platform_tools',
      },
      {
        name: 'get_apify_actor_output',
        description: 'Get Apify actor output',
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
    ];

    const scoredDefs: MatchedToolDefinition[] = [{ ...baseDefs[1], semanticScore: 0.91 }];

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
      id: 't3-social',
      assignedAgent: 'data_coordinator',
      description: 'Sync linked MaxPreps and X accounts',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools'],
    };

    const taskIntent = [
      'Objective: Sync my connected accounts.',
      'Accounts to sync:',
      '- MaxPreps: https://www.maxpreps.com/athlete/example/football/stats.htm',
      '- X: https://x.com/HooverBucsBBall',
    ].join('\n');

    await service.executePlan({
      operationId: 'op-3-social',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: taskIntent,
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['data_coordinator', fakeAgent]]),
      buildTaskIntent: () => taskIntent,
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('scrape_and_index_profile');
    expect(usedToolNames).toContain('read_distilled_section');
    expect(usedToolNames).toContain('classify_media_url');
    expect(usedToolNames).toContain('scrape_twitter');
    expect(usedToolNames).toContain('search_apify_actors');
    expect(usedToolNames).toContain('get_apify_actor_details');
    expect(usedToolNames).toContain('call_apify_actor');
    expect(usedToolNames).toContain('get_apify_actor_output');
  });

  it('forces schedule writer tools for direct event write intents', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'write_calendar_events',
        description: 'Write camps, combines, showcases, and exposure events',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'database',
        entityGroup: 'team_tools',
      },
      {
        name: 'write_schedule',
        description: 'Write competitive schedule events',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'database',
        entityGroup: 'team_tools',
      },
      {
        name: 'mutate_nxt1_data',
        description: 'Generic NXT1 data mutation',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'database',
        entityGroup: 'platform_tools',
      },
    ];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue([]),
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
              summary: 'Schedule event saved.',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    const task: AgentTask = {
      id: 't4',
      assignedAgent: 'data_coordinator',
      description: 'Save AAU Nationals in Orlando from June 28 through July 1',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const accessContext: AgentToolAccessContext = {
      userId: 'user-1',
      role: 'athlete',
      allowedEntityGroups: ['platform_tools', 'system_tools', 'team_tools'],
    };

    await service.executePlan({
      operationId: 'op-4',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'AAU Nationals in Orlando FL 28 June thru 1 July',
      context: createContext(),
      toolAccessContext: accessContext,
      taskMaxRetries: 0,
      agents: new Map([['data_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Save AAU Nationals in Orlando FL 28 June thru 1 July',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('write_calendar_events');
    expect(usedToolNames).toContain('write_schedule');
    expect(usedToolNames).toContain('mutate_nxt1_data');
  });

  it('marks explicit blocked tool-unavailable coordinator results as failed', async () => {
    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue([]),
      matchWithScores: vi.fn().mockResolvedValue([]),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.5, 0.4, 0.3]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const fakeAgent = {
      id: 'data_coordinator' as AgentIdentifier,
      name: 'Data Coordinator',
      execute: vi.fn().mockResolvedValue({
        summary:
          '**Blocked:** The required write_calendar_events tool is not available in the current toolset for saving this schedule event. No action taken.',
        data: {},
        suggestions: [],
      } as AgentOperationResult),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    const task: AgentTask = {
      id: 't5',
      assignedAgent: 'data_coordinator',
      description: 'Save a schedule event',
      dependsOn: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const result = await service.executePlan({
      operationId: 'op-5',
      userId: 'user-1',
      plan: { tasks: [task] },
      enrichedIntent: 'Save AAU Nationals as a schedule event',
      context: createContext(),
      toolAccessContext: {
        userId: 'user-1',
        role: 'athlete',
        allowedEntityGroups: ['platform_tools', 'system_tools', 'team_tools'],
      },
      taskMaxRetries: 0,
      agents: new Map([['data_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Save a schedule event',
      rerouteDelegatedTask: async () => null,
    });

    expect(result.taskResults.size).toBe(0);
    expect(result.mutableTasks[0]?.status).toBe('failed');
    expect(result.mutableTasks[0]?._lastError).toContain(
      'write_calendar_events tool is not available'
    );
  });

  it('does not expose internal NXT1 post tools for external social publish intents', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'write_timeline_post',
        description: 'Create a new post on the user NXT1 timeline',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'communication',
        entityGroup: 'user_tools',
      },
      {
        name: 'write_team_post',
        description: 'Create a new post on the team NXT1 timeline',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'database',
        entityGroup: 'team_tools',
      },
      {
        name: 'query_nxt1_data',
        description: 'Read NXT1 profile context',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: false,
        category: 'database',
        entityGroup: 'platform_tools',
      },
    ];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue([
        { ...baseDefs[0], semanticScore: 0.95 },
        { ...baseDefs[1], semanticScore: 0.92 },
        { ...baseDefs[2], semanticScore: 0.6 },
      ]),
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
              summary: 'Prepared the graphic and caption for manual Instagram posting.',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    await service.executePlan({
      operationId: 'op-6',
      userId: 'user-1',
      plan: {
        tasks: [
          {
            id: 't6',
            assignedAgent: 'data_coordinator',
            description: 'Post the finished graphic on Instagram',
            dependsOn: [],
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      enrichedIntent: 'Make a better one and post it on Instagram',
      context: createContext(),
      toolAccessContext: {
        userId: 'user-1',
        role: 'athlete',
        allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools', 'team_tools'],
      },
      taskMaxRetries: 0,
      agents: new Map([['data_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Make a better one and post it on Instagram',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).not.toContain('write_timeline_post');
    expect(usedToolNames).not.toContain('write_team_post');
    expect(usedToolNames).toContain('query_nxt1_data');
  });

  it('keeps internal NXT1 posting tools for explicit NXT1 feed intents', async () => {
    const baseDefs: AgentToolDefinition[] = [
      {
        name: 'write_timeline_post',
        description: 'Create a new post on the user NXT1 timeline',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'communication',
        entityGroup: 'user_tools',
      },
      {
        name: 'write_team_post',
        description: 'Create a new post on the team NXT1 timeline',
        parameters: {},
        allowedAgents: ['*'],
        isMutation: true,
        category: 'database',
        entityGroup: 'team_tools',
      },
    ];

    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue(baseDefs),
      matchWithScores: vi.fn().mockResolvedValue([
        { ...baseDefs[0], semanticScore: 0.95 },
        { ...baseDefs[1], semanticScore: 0.92 },
      ]),
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
              summary: 'Posted to the NXT1 timeline.',
              data: {},
              suggestions: [],
            } as AgentOperationResult;
          }
        ),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    await service.executePlan({
      operationId: 'op-7',
      userId: 'user-1',
      plan: {
        tasks: [
          {
            id: 't7',
            assignedAgent: 'data_coordinator',
            description: 'Post the finished graphic to my NXT1 timeline',
            dependsOn: [],
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      enrichedIntent: 'Post this to my NXT1 timeline',
      context: createContext(),
      toolAccessContext: {
        userId: 'user-1',
        role: 'athlete',
        allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools', 'team_tools'],
      },
      taskMaxRetries: 0,
      agents: new Map([['data_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Post this to my NXT1 timeline',
      rerouteDelegatedTask: async () => null,
    });

    const usedToolNames = (capturedToolDefs[0] ?? []).map((tool) => tool.name);
    expect(usedToolNames).toContain('write_timeline_post');
    expect(usedToolNames).toContain('write_team_post');
  });

  it('marks false external social publish claims as failed', async () => {
    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue([]),
      matchWithScores: vi.fn().mockResolvedValue([]),
    } as unknown as ToolRegistry;

    const llm = {
      embed: vi.fn().mockResolvedValue([0.5, 0.4, 0.3]),
    } as unknown as OpenRouterService;

    const telemetry = {
      emitProgressOperation: vi.fn(),
      emitUpdate: vi.fn(),
      recordPhaseLatency: vi.fn(),
    };

    const fakeAgent = {
      id: 'data_coordinator' as AgentIdentifier,
      name: 'Data Coordinator',
      execute: vi.fn().mockResolvedValue({
        summary: 'Posted the graphic to Instagram.',
        data: {},
        suggestions: [],
      } as AgentOperationResult),
    } as unknown as BaseAgent;

    const service = new AgentRouterExecutionService(llm, toolRegistry, telemetry);

    const result = await service.executePlan({
      operationId: 'op-8',
      userId: 'user-1',
      plan: {
        tasks: [
          {
            id: 't8',
            assignedAgent: 'data_coordinator',
            description: 'Post the finished graphic on Instagram',
            dependsOn: [],
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      enrichedIntent: 'Make a better one and post it on Instagram',
      context: createContext(),
      toolAccessContext: {
        userId: 'user-1',
        role: 'athlete',
        allowedEntityGroups: ['platform_tools', 'system_tools', 'user_tools', 'team_tools'],
      },
      taskMaxRetries: 0,
      agents: new Map([['data_coordinator', fakeAgent]]),
      buildTaskIntent: () => 'Objective: Make a better one and post it on Instagram',
      rerouteDelegatedTask: async () => null,
    });

    expect(result.taskResults.size).toBe(0);
    expect(result.mutableTasks[0]?.status).toBe('failed');
    expect(result.mutableTasks[0]?._lastError).toContain(
      'Direct external social publishing is not connected yet'
    );
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
