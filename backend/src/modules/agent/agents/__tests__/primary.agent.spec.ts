import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionContext } from '@nxt1/core';
import type { LLMMessage, LLMToolCall } from '../../llm/llm.types.js';
import type { ToolRegistry } from '../../tools/tool-registry.js';
import type { AskUserToolContext } from '../../tools/system/ask-user.tool.js';
import type { ApprovalGateService } from '../../services/approval-gate.service.js';
import type { OnStreamEvent } from '../../queue/event-writer.js';
import type { PrimaryDispatcher } from '../primary-dispatcher.js';
import type { CapabilityRegistry } from '../../capabilities/capability-registry.js';
import { PrimaryAgent } from '../primary.agent.js';
import { DelegateToCoordinatorTool } from '../../tools/system/delegate-to-coordinator.tool.js';
import { CreatePlanTool } from '../../tools/system/create-plan.tool.js';
import { ExecuteSavedPlanTool } from '../../tools/system/execute-saved-plan.tool.js';
import { PlanAndExecuteTool } from '../../tools/system/plan-and-execute.tool.js';
import { ToolRegistry as ConcreteToolRegistry } from '../../tools/tool-registry.js';
import { BaseTool, type ToolResult } from '../../tools/base.tool.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import { z } from 'zod';
import {
  DEFAULT_AGENT_APP_CONFIG,
  parseAgentAppConfig,
  setCachedAgentAppConfig,
} from '../../config/agent-app-config.js';

function createMockContext(): AgentSessionContext {
  const now = new Date().toISOString();
  return {
    sessionId: 'test-session',
    userId: 'viewer-1',
    conversationHistory: [],
    createdAt: now,
    lastActiveAt: now,
  };
}

type PrimaryDispatcherOverrides = {
  runCoordinator?: PrimaryDispatcher['runCoordinator'];
  runPlan?: PrimaryDispatcher['runPlan'];
  runApprovedPlan?: PrimaryDispatcher['runApprovedPlan'];
};

function createPrimaryDispatcherMock(
  overrides: PrimaryDispatcherOverrides = {}
): PrimaryDispatcher {
  return {
    runCoordinator: overrides.runCoordinator ?? vi.fn(),
    runPlan: overrides.runPlan ?? vi.fn(),
    runApprovedPlan: overrides.runApprovedPlan ?? vi.fn(),
  };
}

class TestPrimaryAgent extends PrimaryAgent {
  async callExecuteTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    signal?: AbortSignal,
    yieldContext?: AskUserToolContext,
    sessionContext?: { operationId?: string },
    currentMessages?: readonly LLMMessage[],
    approvalGate?: ApprovalGateService,
    onStreamEvent?: OnStreamEvent
  ): Promise<string> {
    return this.executeTool(
      toolCall,
      registry,
      userId,
      signal,
      yieldContext,
      sessionContext,
      currentMessages,
      approvalGate,
      onStreamEvent
    );
  }
}

class StubCaptureLiveViewScreenshotTool extends BaseTool {
  readonly name = 'capture_live_view_screenshot';
  readonly description = 'Capture live-view screenshot';
  readonly parameters = z.object({});
  readonly isMutation = false;
  readonly category = 'system' as const;
  readonly entityGroup = 'platform_tools' as const;

  async execute(): Promise<ToolResult> {
    return {
      success: true,
      data: {
        sessionId: 'live-session-1',
        imageUrl: 'https://storage.example.com/live-view.png',
        pageUrl: 'https://www.hudl.com/library/18832',
        mimeType: 'image/png',
      },
    };
  }
}

class StubSendEmailTool extends BaseTool {
  readonly name = 'send_email';
  readonly description = 'Send email';
  readonly parameters = z.object({});
  readonly isMutation = true;
  readonly category = 'communication' as const;
  readonly entityGroup = 'system_tools' as const;

  async execute(): Promise<ToolResult> {
    return { success: true };
  }
}

class StubListTeamFileFoldersTool extends BaseTool {
  readonly name = 'list_team_file_folders';
  readonly description = 'List team file folders';
  readonly parameters = z.object({
    teamId: z.string(),
  });
  readonly isMutation = false;
  readonly category = 'team' as const;
  readonly entityGroup = 'team_tools' as const;

  async execute(args: z.infer<typeof this.parameters>): Promise<ToolResult> {
    return {
      success: true,
      data: {
        folders: [
          {
            id: 'folder-123',
            teamId: args.teamId,
            name: 'Game Plans',
          },
        ],
      },
    };
  }
}

describe('PrimaryAgent delegation control flow', () => {
  it('hides blocked email send tools from the primary tool surface', () => {
    const registry = new ConcreteToolRegistry();
    registry.register(new StubSendEmailTool());

    const definitions = PrimaryAgent.buildPrimaryToolDefinitions(registry, {
      userId: 'viewer-1',
      role: 'athlete',
      allowedEntityGroups: ['system_tools'],
      blockedToolNames: ['send_email'],
    });

    expect(definitions.some((definition) => definition.name === 'send_email')).toBe(false);
  });

  it('removes execution shortcuts from the primary tool surface in plan mode', () => {
    const registry = new ConcreteToolRegistry();
    registry.register(new DelegateToCoordinatorTool());
    registry.register(new CreatePlanTool());
    registry.register(new ExecuteSavedPlanTool());
    registry.register(new PlanAndExecuteTool());

    const definitions = PrimaryAgent.buildPrimaryToolDefinitions(registry, {
      userId: 'viewer-1',
      role: 'athlete',
      allowedEntityGroups: ['system_tools'],
      executionMode: 'plan',
    });

    const toolNames = definitions.map((definition) => definition.name);

    expect(toolNames).toContain('create_plan');
    expect(toolNames).toContain('execute_saved_plan');
    expect(toolNames).not.toContain('delegate_to_coordinator');
    expect(toolNames).not.toContain('plan_and_execute');
  });

  it('rejects direct coordinator delegation when the surfaced plan-mode allowlist excludes it', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock();
    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const registry = new ConcreteToolRegistry();
    registry.register(new DelegateToCoordinatorTool());

    const result = await agent.callExecuteTool(
      {
        id: 'delegate_router_1',
        type: 'function',
        function: {
          name: 'delegate_to_coordinator',
          arguments: JSON.stringify({
            coordinatorId: 'brand_coordinator',
            goal: 'Create a highlight video.',
          }),
        },
      },
      registry,
      'viewer-1',
      undefined,
      undefined,
      { allowedToolNames: ['create_plan'] }
    );

    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Tool is not allowed in this execution context: delegate_to_coordinator',
      })
    );
    expect(dispatcher.runCoordinator).not.toHaveBeenCalled();
  });

  it('injects the 2026 operating contract into system prompt', () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock();

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const prompt = agent.getSystemPrompt(createMockContext());

    expect(prompt).toContain('Primary Operating Contract (2026)');
    expect(prompt).toContain('simple_routing');
    expect(prompt).toContain('numeric_or_aggregation');
    expect(prompt).toContain('sketch the likely steps to finish the request');
    expect(prompt).toContain('The router must stay fast. Do NOT perform web research');
    expect(prompt).toContain('delegate to `data_coordinator`');
    expect(prompt).toContain('Connected-source monitoring ownership');
    expect(prompt).toContain('Router may handle simple read-only monitor lookups directly');
    expect(prompt).toContain('delegate to `strategy_coordinator`');
    expect(prompt).toContain('NEVER call `generate_graphic` directly from router');
    expect(prompt).toContain('External social publishing boundary');
    expect(prompt).toContain('Do NOT promise external publishing');
    expect(prompt).toContain(
      'Only delegate posting to `data_coordinator` when the destination is explicitly the NXT1 timeline/feed'
    );
    expect(prompt).toContain('Live-view film requests are coordinator-owned');
    expect(prompt).toContain(
      'NEVER call `create_play_diagram`, `write_playbooks`, or film review tools (`list_film_reviews`, `get_film_review`, `save_film_review`, `update_film_review`, `delete_film_review`, annotations, AI refresh) directly from the router'
    );
    expect(prompt).toContain(
      'This restriction does NOT apply to universal document tools (`create_universal_team_document`, `list_universal_team_documents`, `get_universal_team_document`, `update_universal_team_document`, `delete_universal_team_document`) and team file library organization tools (`list_team_file_folders`, `create_team_file_folder`, `update_team_file_folder`, `delete_team_file_folder`, `move_universal_file_to_folder`), which the router may use directly.'
    );
    expect(prompt).toContain('clear user-requested play/drill diagram generation');
    expect(prompt).toContain(
      'delegate to `strategy_coordinator` immediately and do not ask permission first'
    );
    expect(prompt).toContain('single objective sentence as the handoff payload');
    expect(prompt).toContain(
      'first write ONE short warm sentence to the user in normal chat prose'
    );
    expect(prompt).toContain('Ask User Decision Matrix (CRITICAL)');
    expect(prompt).toContain('Do NOT call `ask_user` for data already present in task context');
    expect(prompt).toContain('Bare attachment intent rule (CRITICAL)');
    expect(prompt).toContain(
      'If the user only uploads or attaches an image, video, or document without explicitly asking to save it'
    );
    expect(prompt).toContain(
      'ask what they want to do with the file before delegating or mutating anything'
    );
    // Decision boundary: direct lookup vs. delegate for recruiting
    expect(prompt).toContain('Simple factual lookup');
    expect(prompt).toContain('use `search_colleges` or `search_college_coaches` directly');
    expect(prompt).toContain('Full recruiting workflow');
    expect(prompt).toContain(
      'use `delegate_to_coordinator` with coordinatorId=`recruiting_coordinator`'
    );
    expect(prompt).toContain('Recurring scheduling rule (CRITICAL)');
    expect(prompt).toContain(
      'Never claim a task was scheduled unless the relevant recurring tool actually returned success'
    );
    expect(prompt).toContain('There is no separate one-time delayed execution tool');
    expect(prompt).toContain(
      'Do not emulate a one-time delay by inventing date-pinned cron expressions'
    );
    expect(prompt).toContain('preserve that requested offset when selecting the recurring time');
    expect(prompt).toContain('verify the actual nextRun with `list_recurring_tasks`');
    expect(prompt).toContain('Memory persistence rule');
    expect(prompt).toContain('call `save_memory` immediately');
    expect(prompt).toContain('Router analytics rule');
    expect(prompt).toContain('call `track_analytics_event` once before the final response');
  });

  it('uses a plan-only operating contract in plan mode', () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock();
    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const prompt = agent.getSystemPrompt({ ...createMockContext(), executionMode: 'plan' });

    expect(prompt).toContain('Primary Plan Mode Contract (2026)');
    expect(prompt).toContain('Use `create_plan` for new executable requests');
    expect(prompt).toContain('Do not start execution');
    expect(prompt).not.toContain('Primary Operating Contract (2026)');
    expect(prompt).not.toContain('Creative Video Workflow Routing');
    expect(prompt).not.toContain('delegate_to_coordinator');
    expect(prompt).not.toContain('Routing this to');
  });

  it('uses a fast non-reasoning model route for the primary front door', () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock();

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const routing = agent.getModelRouting();

    expect(routing.enableThinking).toBe(false);
    expect(routing.modelOverride).toBe('~anthropic/claude-sonnet-latest');
    expect(routing.temperature).toBe(0);
  });

  it('keeps heavy web-research tools out of the primary router policy', () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock();

    const agent = new TestPrimaryAgent(capabilities, dispatcher);

    expect(agent.getAvailableTools()).toContain('list_firecrawl_monitors');
    expect(agent.getAvailableTools()).toContain('get_firecrawl_monitor');
    expect(agent.getAvailableTools()).toContain('get_firecrawl_monitor_check');
    expect(agent.getAvailableTools()).toContain('list_team_file_folders');
    expect(agent.getAvailableTools()).toContain('create_team_file_folder');
    expect(agent.getAvailableTools()).toContain('update_team_file_folder');
    expect(agent.getAvailableTools()).toContain('delete_team_file_folder');
    expect(agent.getAvailableTools()).toContain('move_universal_file_to_folder');
    expect(agent.getAvailableTools()).not.toContain('write_firecrawl_monitor');
    expect(agent.getAvailableTools()).not.toContain('update_firecrawl_monitor');
    expect(agent.getAvailableTools()).not.toContain('delete_firecrawl_monitor');
    expect(agent.getAvailableTools()).not.toContain('search_web');
    expect(agent.getAvailableTools()).not.toContain('firecrawl_search_web');
    expect(agent.getAvailableTools()).not.toContain('scrape_webpage');
    expect(agent.getAvailableTools()).not.toContain('map_website');
    expect(agent.getAvailableTools()).not.toContain('extract_web_data');
  });

  it('ignores configured primary prompt additions and keeps the built-in contract authoritative', () => {
    const config = parseAgentAppConfig({
      prompts: {
        primarySystemPrompt: 'Primary operator note.',
        agentSystemPrompts: {
          router: 'Router policy note.',
        },
      },
    });
    setCachedAgentAppConfig(config);

    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock();

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const prompt = agent.getSystemPrompt(createMockContext());

    expect(prompt).toContain('Primary Operating Contract (2026)');
    expect(prompt).not.toContain('## Operator Additions');
    expect(prompt).not.toContain('Primary operator note.');
    expect(prompt).not.toContain('Router policy note.');

    setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);
  });

  it('attaches tool exposure trace metadata to primary execution result', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock();

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'trace-op-1',
    };

    agent.beginRun({
      operationId: 'trace-op-1',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Show my stats',
    });

    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Tool-aware response',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
    } as unknown as OpenRouterService;

    const result = await agent.execute(
      'Show my stats',
      context,
      [],
      llm,
      new ConcreteToolRegistry()
    );

    const debug = (result.data?.['debug'] ?? {}) as Record<string, unknown>;
    const trace = (debug['toolExposureTrace'] ?? {}) as Record<string, unknown>;

    expect(Array.isArray(trace['exposedTools'])).toBe(true);
    expect(Array.isArray(trace['selectedTools'])).toBe(true);
    expect((trace['exposedTools'] as unknown[]).length).toBeGreaterThan(0);

    agent.endRun('trace-op-1');
  });

  it('emits terminal tool_result before delegate_to_coordinator dispatch finishes', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    let resolveDispatch: ((value: { success: boolean; observation: string }) => void) | undefined;
    const dispatchPromise = new Promise<{ success: boolean; observation: string }>((resolve) => {
      resolveDispatch = resolve;
    });

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockReturnValue(dispatchPromise),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = createMockContext();
    agent.beginRun({
      operationId: 'op-1',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Send recruiting emails',
    });

    const registry = new ConcreteToolRegistry();
    registry.register(new DelegateToCoordinatorTool());

    const events: Array<Record<string, unknown>> = [];
    const toolCall: LLMToolCall = {
      id: 'call_delegate',
      type: 'function',
      function: {
        name: 'delegate_to_coordinator',
        arguments: JSON.stringify({
          coordinator: 'recruiting_coordinator',
          goal: 'Send recruiting emails to division 2 coaches in Texas',
        }),
      },
    };

    const observationPromise = agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-1' },
      [],
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    await vi.waitFor(() => {
      expect(dispatcher.runCoordinator).toHaveBeenCalledOnce();
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'tool_result',
            stepId: 'call_delegate',
            toolName: 'delegate_to_coordinator',
            toolSuccess: true,
            toolResult: {
              delegated: true,
              coordinatorId: 'recruiting_coordinator',
            },
          }),
        ])
      );
    });

    resolveDispatch?.({
      success: true,
      observation: '## recruiting_coordinator dispatch result\n- ok',
    });

    const observation = await observationPromise;
    expect(observation).toContain('recruiting_coordinator dispatch result');

    agent.endRun('op-1');
  });

  it('routes accidental router FFmpeg calls to the brand coordinator', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: 'Brand coordinator completed the media step.',
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = createMockContext();
    agent.beginRun({
      operationId: 'op-brand-media-fallback',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Create a Marvel villain highlight reel.',
    });

    const registry = new ConcreteToolRegistry();
    const events: Array<Record<string, unknown>> = [];
    const toolCall: LLMToolCall = {
      id: 'call_ffmpeg_convert',
      type: 'function',
      function: {
        name: 'ffmpeg_convert_video',
        arguments: JSON.stringify({
          inputPath: 'https://storage.example.com/intro.mp4',
          outputPath: 'intro-with-audio.mp4',
          addSilentAudio: true,
        }),
      },
    };

    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-brand-media-fallback' },
      [],
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'brand_coordinator',
      expect.stringContaining('creative media processing step'),
      expect.any(Object),
      expect.objectContaining({
        inputPath: 'https://storage.example.com/intro.mp4',
        outputPath: 'intro-with-audio.mp4',
        addSilentAudio: true,
        originalToolName: 'ffmpeg_convert_video',
        source: 'router_brand_media_tool_fallback',
      })
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolName: 'ffmpeg_convert_video',
          toolSuccess: true,
          toolResult: {
            delegated: true,
            coordinatorId: 'brand_coordinator',
          },
        }),
      ])
    );
    expect(observation).toContain('Brand coordinator completed the media step.');

    agent.endRun('op-brand-media-fallback');
  });

  it('emits terminal tool_result before plan_and_execute dispatch finishes', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    let resolvePlan: ((value: { success: boolean; observation: string }) => void) | undefined;
    const planPromise = new Promise<{ success: boolean; observation: string }>((resolve) => {
      resolvePlan = resolve;
    });

    const dispatcher = createPrimaryDispatcherMock({
      runPlan: vi.fn().mockReturnValue(planPromise),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = createMockContext();
    agent.beginRun({
      operationId: 'op-2',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Build a recruiting plan',
    });

    const registry = new ConcreteToolRegistry();
    registry.register(new PlanAndExecuteTool());

    const events: Array<Record<string, unknown>> = [];
    const toolCall: LLMToolCall = {
      id: 'call_plan',
      type: 'function',
      function: {
        name: 'plan_and_execute',
        arguments: JSON.stringify({
          goal: 'Build a recruiting plan across multiple coordinators',
        }),
      },
    };

    const observationPromise = agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-2' },
      [],
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    await vi.waitFor(() => {
      expect(dispatcher.runPlan).toHaveBeenCalledOnce();
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'tool_result',
            stepId: 'call_plan',
            toolName: 'plan_and_execute',
            toolSuccess: true,
            toolResult: {
              planned: true,
            },
          }),
        ])
      );
    });

    resolvePlan?.({
      success: true,
      observation: '## plan dispatch result\n- ok',
    });

    const observation = await observationPromise;
    expect(observation).toContain('plan dispatch result');

    agent.endRun('op-2');
  });

  it('forwards prior tool artifacts into coordinator dispatch context and returns coordinator artifacts', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## performance_coordinator dispatch result\n- analyzed',
        coordinatorArtifacts: {
          videoUrl: 'https://cdn.example.com/analyzed.mp4',
        },
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'op-3',
    };

    agent.beginRun({
      operationId: 'op-3',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Analyze the current Hudl clip',
    });

    const registry = new ConcreteToolRegistry();
    registry.register(new DelegateToCoordinatorTool());

    const toolCall: LLMToolCall = {
      id: 'call_delegate_artifact',
      type: 'function',
      function: {
        name: 'delegate_to_coordinator',
        arguments: JSON.stringify({
          coordinator: 'performance_coordinator',
          goal: 'Analyze the active clip',
        }),
      },
    };

    const currentMessages = [
      {
        role: 'tool' as const,
        content: JSON.stringify({
          success: true,
          data: {
            videoUrl: 'https://vc.hudl.com/video/123',
            mediaArtifact: { source: 'hudl', clipId: '123' },
          },
        }),
        tool_call_id: 'extract_call',
      },
    ];

    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-3' },
      currentMessages,
      undefined,
      undefined
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'performance_coordinator',
      'Analyze the active clip',
      expect.objectContaining({
        enrichedIntent: expect.stringContaining('[Prior Tool Results from Primary'),
      }),
      undefined
    );
    expect(observation).toContain('coordinator_artifacts');
    expect(observation).toContain('https://cdn.example.com/analyzed.mp4');

    agent.endRun('op-3');
  });

  it('forwards router-resolved brand snapshot results into coordinator handoff payload', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## brand_coordinator dispatch result\n- graphic built',
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      operationId: 'op-brand-handoff',
      userId: 'user-1',
      sessionContext: createMockContext(),
      enrichedIntent: 'Create a Crown Point Bulldogs graphic.',
    };
    agent.beginRun(context);

    const registry = new ConcreteToolRegistry();
    registry.register(new DelegateToCoordinatorTool());
    const toolCall: LLMToolCall = {
      id: 'call_delegate_brand',
      type: 'function',
      function: {
        name: 'delegate_to_coordinator',
        arguments: JSON.stringify({
          coordinator: 'brand_coordinator',
          goal: 'Create the team graphic.',
          structured_payload: {
            organizationId: 'org-crown-point',
            teamId: 'team-crown-point',
          },
        }),
      },
    };

    const currentMessages = [
      {
        role: 'tool' as const,
        content: JSON.stringify({
          success: true,
          data: {
            view: 'organization_profile_snapshot',
            count: 0,
            items: [],
          },
        }),
        tool_call_id: 'org_query',
      },
      {
        role: 'tool' as const,
        content: JSON.stringify({
          success: true,
          data: {
            view: 'team_profile_snapshot',
            count: 1,
            items: [
              {
                name: 'Crown Point Bulldogs',
                logoUrl: 'https://cdn.example.com/crown-point-logo.png',
              },
            ],
          },
        }),
        tool_call_id: 'team_query',
      },
    ];

    await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-brand-handoff' },
      currentMessages,
      undefined,
      undefined
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'brand_coordinator',
      'Create the team graphic.',
      expect.any(Object),
      expect.objectContaining({
        organizationId: 'org-crown-point',
        teamId: 'team-crown-point',
        resolvedBrandContext: {
          organizationProfileSnapshot: {
            found: false,
            count: 0,
          },
          teamProfileSnapshot: {
            found: true,
            count: 1,
            item: {
              name: 'Crown Point Bulldogs',
              logoUrl: 'https://cdn.example.com/crown-point-logo.png',
            },
          },
        },
      })
    );

    agent.endRun('op-brand-handoff');
  });

  it('reroutes direct analyze_video tool calls to a video-capable coordinator', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## strategy_coordinator dispatch result\n- analyzed',
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'op-4',
    };

    agent.beginRun({
      operationId: 'op-4',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Review this game film and give strategic recommendations',
    });

    const registry = new ConcreteToolRegistry();

    const toolCall: LLMToolCall = {
      id: 'call_direct_analyze',
      type: 'function',
      function: {
        name: 'analyze_video',
        arguments: JSON.stringify({
          url: 'https://cdn.example.com/film.mp4',
          prompt: 'Analyze this film and provide strategic recommendations.',
        }),
      },
    };

    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-4' },
      [],
      undefined,
      undefined
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'performance_coordinator',
      expect.stringContaining('Analyze the provided video'),
      expect.objectContaining({
        operationId: 'op-4',
      }),
      expect.objectContaining({
        source: 'router_analyze_video_fallback',
        url: 'https://cdn.example.com/film.mp4',
      })
    );
    expect(observation).toContain('strategy_coordinator');

    agent.endRun('op-4');
  });

  it('reroutes direct generate_graphic tool calls to brand_coordinator', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## brand_coordinator dispatch result\n- graphic generated',
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'op-5',
    };

    agent.beginRun({
      operationId: 'op-5',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Create a recruiting commitment graphic',
    });

    const registry = new ConcreteToolRegistry();

    const toolCall: LLMToolCall = {
      id: 'call_direct_graphic',
      type: 'function',
      function: {
        name: 'generate_graphic',
        arguments: JSON.stringify({
          graphicType: 'commitment',
          text: 'Committed',
        }),
      },
    };

    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-5' },
      [],
      undefined,
      undefined
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'brand_coordinator',
      expect.stringContaining('creative media processing step'),
      expect.objectContaining({
        operationId: 'op-5',
      }),
      expect.objectContaining({
        source: 'router_brand_media_tool_fallback',
        originalToolName: 'generate_graphic',
        graphicType: 'commitment',
      })
    );
    expect(observation).toContain('brand_coordinator');

    agent.endRun('op-5');
  });

  it('reroutes direct create_play_diagram tool calls to strategy_coordinator', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## strategy_coordinator dispatch result\n- play diagram created',
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'op-6',
    };

    agent.beginRun({
      operationId: 'op-6',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Diagram 2x2 verticals vs cover 3',
    });

    const registry = new ConcreteToolRegistry();

    const toolCall: LLMToolCall = {
      id: 'call_direct_play_diagram',
      type: 'function',
      function: {
        name: 'create_play_diagram',
        arguments: JSON.stringify({
          sport: 'football',
          title: '2x2 Verticals vs Cover 3',
        }),
      },
    };

    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-6' },
      [],
      undefined,
      undefined
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'strategy_coordinator',
      expect.stringContaining('strategy artifact request'),
      expect.objectContaining({
        operationId: 'op-6',
      }),
      expect.objectContaining({
        source: 'router_create_play_diagram_fallback',
        originalToolName: 'create_play_diagram',
        sport: 'football',
      })
    );
    expect(observation).toContain('strategy_coordinator');

    agent.endRun('op-6');
  });

  it('reroutes direct list_universal_team_documents tool calls to strategy_coordinator', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## strategy_coordinator dispatch result\n- universal team documents listed',
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'op-6b',
    };

    agent.beginRun({
      operationId: 'op-6b',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Show the Duke 3PT containment game plan',
    });

    const registry = new ConcreteToolRegistry();

    const toolCall: LLMToolCall = {
      id: 'call_direct_list_universal_team_documents',
      type: 'function',
      function: {
        name: 'list_universal_team_documents',
        arguments: JSON.stringify({
          teamId: 'team-1',
          fileType: 'game_plan',
        }),
      },
    };

    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-6b' },
      [],
      undefined,
      undefined
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'strategy_coordinator',
      expect.stringContaining('strategy artifact request'),
      expect.objectContaining({
        operationId: 'op-6b',
      }),
      expect.objectContaining({
        source: 'router_list_universal_team_documents_fallback',
        originalToolName: 'list_universal_team_documents',
        teamId: 'team-1',
        fileType: 'game_plan',
      })
    );
    expect(observation).toContain('strategy_coordinator');

    agent.endRun('op-6b');
  });

  it('executes direct team file folder lookup tools without strategy fallback', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn(),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'op-6b-folder',
    };

    agent.beginRun({
      operationId: 'op-6b-folder',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Organize the file library into better folders',
    });

    const registry = new ConcreteToolRegistry();
    registry.register(new StubListTeamFileFoldersTool());

    const toolCall: LLMToolCall = {
      id: 'call_direct_list_team_file_folders',
      type: 'function',
      function: {
        name: 'list_team_file_folders',
        arguments: JSON.stringify({
          teamId: 'team-1',
        }),
      },
    };

    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-6b-folder' },
      [],
      undefined,
      undefined
    );

    expect(dispatcher.runCoordinator).not.toHaveBeenCalled();
    expect(observation).toContain('folder-123');
    expect(observation).toContain('Game Plans');

    agent.endRun('op-6b-folder');
  });

  it('reroutes direct update_universal_team_document tool calls to strategy_coordinator', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## strategy_coordinator dispatch result\n- universal team document updated',
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'op-6c',
    };

    agent.beginRun({
      operationId: 'op-6c',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Update the game plan strengths section',
    });

    const registry = new ConcreteToolRegistry();

    const toolCall: LLMToolCall = {
      id: 'call_direct_update_universal_team_document',
      type: 'function',
      function: {
        name: 'update_universal_team_document',
        arguments: JSON.stringify({
          documentId: 'gp_123_football_pregame_2026-05-28_westfield-warriors',
          fileType: 'game_plan',
          customSections: [{ id: 'strengths', title: 'Strengths', content: 'Updated' }],
        }),
      },
    };

    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-6c' },
      [],
      undefined,
      undefined
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'strategy_coordinator',
      expect.stringContaining('strategy artifact request'),
      expect.objectContaining({
        operationId: 'op-6c',
      }),
      expect.objectContaining({
        source: 'router_update_universal_team_document_fallback',
        originalToolName: 'update_universal_team_document',
        documentId: 'gp_123_football_pregame_2026-05-28_westfield-warriors',
        fileType: 'game_plan',
      })
    );
    expect(observation).toContain('strategy_coordinator');

    agent.endRun('op-6c');
  });

  it('reroutes live-view clip scrolling to the film coordinator extraction workflow', async () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher = createPrimaryDispatcherMock({
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## performance_coordinator dispatch result\n- extracted last clips',
      }),
    });

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const context = {
      ...createMockContext(),
      operationId: 'op-live-view-film',
    };

    agent.beginRun({
      operationId: 'op-live-view-film',
      userId: context.userId,
      sessionContext: context,
      enrichedIntent: 'Can you watch the last 5 clips on this Hudl page and give me a report?',
    });

    const toolCall: LLMToolCall = {
      id: 'call_interact_scroll_clips',
      type: 'function',
      function: {
        name: 'interact_with_live_view',
        arguments: JSON.stringify({
          prompt:
            'Scroll all the way to the bottom of the clip list/playlist on the right side of the page to see the last clips',
        }),
      },
    };

    const currentMessages: readonly LLMMessage[] = [
      {
        role: 'tool',
        content: JSON.stringify({
          success: true,
          data: {
            sessionId: 'live-session-1',
            url: 'https://www.hudl.com/library/18832',
            title: 'Library - Boys Varsity Football - Hudl',
            content: 'Interactive elements:\nClip list with plays and playlist rows',
          },
        }),
      },
    ];

    const registry = new ConcreteToolRegistry();
    registry.register(new StubCaptureLiveViewScreenshotTool());
    const events: Array<Record<string, unknown>> = [];
    const observation = await agent.callExecuteTool(
      toolCall,
      registry,
      context.userId,
      undefined,
      undefined,
      { operationId: 'op-live-view-film' },
      currentMessages,
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    expect(dispatcher.runCoordinator).toHaveBeenCalledWith(
      'performance_coordinator',
      expect.stringContaining('real media extraction'),
      expect.objectContaining({ operationId: 'op-live-view-film' }),
      expect.objectContaining({
        source: 'router_live_view_film_interaction_fallback',
        originalLiveViewPrompt: expect.stringContaining('Scroll all the way'),
        liveViewContext: expect.objectContaining({
          sessionId: 'live-session-1',
          url: 'https://www.hudl.com/library/18832',
        }),
        preInteractionScreenshot: expect.objectContaining({
          imageUrl: 'https://storage.example.com/live-view.png',
        }),
      })
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_result',
          toolName: 'capture_live_view_screenshot',
          toolSuccess: true,
          toolResult: expect.objectContaining({
            imageUrl: 'https://storage.example.com/live-view.png',
          }),
        }),
        expect.objectContaining({
          type: 'tool_result',
          toolName: 'interact_with_live_view',
          toolSuccess: true,
          toolResult: expect.objectContaining({
            delegated: true,
            coordinatorId: 'performance_coordinator',
          }),
        }),
      ])
    );
    expect(observation).toContain('performance_coordinator');

    agent.endRun('op-live-view-film');
  });
});
