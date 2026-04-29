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
    expect(prompt).toContain('single objective sentence as the handoff payload');
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
});
