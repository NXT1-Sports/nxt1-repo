import { describe, expect, it, vi } from 'vitest';
import type { AgentSessionContext } from '@nxt1/core';
import type { LLMToolCall } from '../../llm/llm.types.js';
import type { ToolRegistry } from '../../tools/tool-registry.js';
import type { AskUserToolContext } from '../../tools/system/ask-user.tool.js';
import type { ApprovalGateService } from '../../services/approval-gate.service.js';
import type { OnStreamEvent } from '../../queue/event-writer.js';
import type { PrimaryDispatcher } from '../primary-dispatcher.js';
import type { CapabilityRegistry } from '../../capabilities/capability-registry.js';
import { PrimaryAgent } from '../primary.agent.js';
import { DelegateToCoordinatorTool } from '../../tools/system/delegate-to-coordinator.tool.js';
import { PlanAndExecuteTool } from '../../tools/system/plan-and-execute.tool.js';
import { ToolRegistry as ConcreteToolRegistry } from '../../tools/tool-registry.js';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
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

class TestPrimaryAgent extends PrimaryAgent {
  async callExecuteTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    signal?: AbortSignal,
    yieldContext?: AskUserToolContext,
    sessionContext?: { operationId?: string },
    currentMessages?: readonly [],
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

describe('PrimaryAgent delegation control flow', () => {
  it('injects the 2026 reasoning contract into system prompt', () => {
    const capabilities = {
      current: () => ({
        rendered: {
          compactMarkdown: 'Capabilities',
          detailedMarkdown: 'Capabilities',
        },
      }),
    } as unknown as CapabilityRegistry;

    const dispatcher: PrimaryDispatcher = {
      runCoordinator: vi.fn(),
      runPlan: vi.fn(),
    };

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const prompt = agent.getSystemPrompt(createMockContext());

    expect(prompt).toContain('Primary Reasoning Contract (2026)');
    expect(prompt).toContain('simple_routing');
    expect(prompt).toContain('numeric_or_aggregation');
    expect(prompt).toContain('sketch the likely steps to finish the request');
    expect(prompt).toContain('search_web` and `firecrawl_search_web` as fallback tools');
    expect(prompt).toContain('single objective sentence as the handoff payload');
    expect(prompt).toContain('Ask User Decision Matrix (CRITICAL)');
    expect(prompt).toContain('Do NOT call `ask_user` for data already present in task context');
    // Decision boundary: direct lookup vs. delegate for recruiting
    expect(prompt).toContain('Simple factual lookup');
    expect(prompt).toContain('use `search_colleges` or `search_college_coaches` directly');
    expect(prompt).toContain('Full recruiting workflow');
    expect(prompt).toContain(
      'use `delegate_to_coordinator` with coordinatorId=`recruiting_coordinator`'
    );
  });

  it('appends configured primary prompt additions without replacing the built-in contract', () => {
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

    const dispatcher: PrimaryDispatcher = {
      runCoordinator: vi.fn(),
      runPlan: vi.fn(),
    };

    const agent = new TestPrimaryAgent(capabilities, dispatcher);
    const prompt = agent.getSystemPrompt(createMockContext());

    expect(prompt).toContain('Primary Reasoning Contract (2026)');
    expect(prompt).toContain('## Operator Additions');
    expect(prompt).toContain('Primary operator note.');
    expect(prompt).toContain('Router policy note.');

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

    const dispatcher: PrimaryDispatcher = {
      runCoordinator: vi.fn(),
      runPlan: vi.fn(),
    };

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

    const dispatcher: PrimaryDispatcher = {
      runCoordinator: vi.fn().mockReturnValue(dispatchPromise),
      runPlan: vi.fn(),
    };

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

    const dispatcher: PrimaryDispatcher = {
      runCoordinator: vi.fn(),
      runPlan: vi.fn().mockReturnValue(planPromise),
    };

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

    const dispatcher: PrimaryDispatcher = {
      runCoordinator: vi.fn().mockResolvedValue({
        success: true,
        observation: '## performance_coordinator dispatch result\n- analyzed',
        coordinatorArtifacts: {
          videoUrl: 'https://cdn.example.com/analyzed.mp4',
        },
      }),
      runPlan: vi.fn(),
    };

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
      })
    );
    expect(observation).toContain('coordinator_artifacts');
    expect(observation).toContain('https://cdn.example.com/analyzed.mp4');

    agent.endRun('op-3');
  });
});
