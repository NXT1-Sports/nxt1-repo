/**
 * @fileoverview Agent Router — Unit Tests
 * @module @nxt1/backend/modules/agent
 *
 * Tests the orchestration layer: classify, run, context enrichment,
 * task dependency execution, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRouter } from '../agent.router.js';
import type { BaseAgent } from '../agents/base.agent.js';
import { RecruitingCoordinatorAgent } from '../agents/recruiting-coordinator.agent.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ContextBuilder } from '../memory/context-builder.js';
import { AgentDelegationException } from '../exceptions/agent-delegation.exception.js';
import type {
  AgentJobPayload,
  AgentJobUpdate,
  AgentJobOrigin,
  AgentOperationResult,
  AgentPromptContext,
  AgentUserContext,
} from '@nxt1/core';

const TEST_ORIGIN: AgentJobOrigin = 'user';

// ─── Mock Factories ─────────────────────────────────────────────────────────

function createMockUserContext(): AgentUserContext {
  return {
    userId: 'user-123',
    displayName: 'Test Athlete',
    role: 'athlete',
    sport: 'football',
    position: 'QB',
    graduationYear: 2026,
  } as AgentUserContext;
}

function createMockContextBuilder(userContext?: AgentUserContext): ContextBuilder {
  const ctx = userContext ?? createMockUserContext();
  const promptContext: AgentPromptContext = {
    profile: ctx,
    memories: {
      user: [
        {
          id: 'mem-1',
          userId: ctx.userId,
          target: 'user',
          content: 'User prefers improvement plans with weekly milestones.',
          category: 'goal',
          createdAt: '2026-03-01T00:00:00Z',
        },
      ],
      team: [],
      organization: [],
    },
  };

  return {
    buildContext: vi.fn().mockResolvedValue(ctx),
    buildPromptContext: vi.fn().mockResolvedValue(promptContext),
    getMemoriesForContext: vi.fn().mockResolvedValue(promptContext.memories),
    getRecentSyncSummariesForContext: vi.fn().mockResolvedValue([]),
    getRecentThreadHistory: vi.fn().mockResolvedValue(''),
    getActiveThreadsSummary: vi.fn().mockResolvedValue(''),
    compressToPrompt: vi
      .fn()
      .mockImplementation(
        (
          profile: AgentUserContext,
          memories: AgentPromptContext['memories'] = { user: [], team: [], organization: [] }
        ) =>
          `Athlete: ${profile.displayName}, Sport: ${profile.sport}, Position: ${profile.position}, MemoryCount: ${memories.user.length}`
      ),
  } as unknown as ContextBuilder;
}

function createMockToolRegistry(): ToolRegistry {
  return {
    getDefinitions: vi.fn().mockReturnValue([]),
    execute: vi.fn().mockResolvedValue({ result: 'ok' }),
  } as unknown as ToolRegistry;
}

/**
 * Create a mock LLM that returns a plan when called via prompt().
 * The plan JSON is configurable.
 */
function createMockLLM(planJson: object): OpenRouterService {
  const normalizedPlan =
    typeof planJson === 'object' && planJson !== null && 'tasks' in planJson
      ? (planJson as {
          summary?: string;
          estimatedSteps?: number;
          directResponse?: string;
          tasks?: unknown[];
          clarificationQuestion?: string | null;
          clarificationContext?: string | null;
        })
      : { tasks: [] };

  const classifierResponse = normalizedPlan.directResponse
    ? {
        route: 'chat' as const,
        reasoning: 'Simple conversational response.',
        requiredContextScopes: [],
        directResponse: normalizedPlan.directResponse,
        planSummary: null,
      }
    : {
        route: 'action' as const,
        reasoning: 'Coordinator execution required.',
        requiredContextScopes: [],
        directResponse: null,
        planSummary: normalizedPlan.summary ?? null,
      };

  const strictPlannerResponse =
    Array.isArray(normalizedPlan.tasks) && normalizedPlan.tasks.length > 0
      ? {
          resultType: 'execution' as const,
          summary: normalizedPlan.summary ?? 'Created execution plan.',
          estimatedSteps: normalizedPlan.estimatedSteps ?? normalizedPlan.tasks.length,
          tasks: normalizedPlan.tasks,
          clarificationQuestion: null,
          clarificationContext: null,
        }
      : {
          resultType: 'clarification' as const,
          summary: normalizedPlan.summary ?? 'Need clarification before planning.',
          estimatedSteps: 0,
          tasks: [],
          clarificationQuestion:
            normalizedPlan.clarificationQuestion ?? 'Can you clarify what you want me to do?',
          clarificationContext: normalizedPlan.clarificationContext ?? null,
        };

  return {
    prompt: vi
      .fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(classifierResponse),
        parsedOutput: classifierResponse,
        toolCalls: [],
        model: 'anthropic/claude-haiku-4-5',
        usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
        latencyMs: 120,
        costUsd: 0.00005,
        finishReason: 'stop',
      })
      .mockResolvedValue({
        content: JSON.stringify(strictPlannerResponse),
        parsedOutput: strictPlannerResponse,
        toolCalls: [],
        model: 'anthropic/claude-sonnet-4-5',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        latencyMs: 200,
        costUsd: 0.0001,
        finishReason: 'stop',
      }),
    complete: vi.fn(),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  } as unknown as OpenRouterService;
}

function createMockAgent(id: string, result?: AgentOperationResult): BaseAgent {
  return {
    id,
    name: `Mock ${id}`,
    getAvailableTools: vi.fn().mockReturnValue([]),
    getSystemPrompt: vi.fn().mockReturnValue(`System prompt for ${id}`),
    getModelRouting: vi.fn().mockReturnValue({ tier: 'chat' }),
    execute: vi.fn().mockResolvedValue(
      result ?? {
        summary: `${id} completed successfully.`,
        data: { processed: true },
        suggestions: [],
      }
    ),
    resumeExecution: vi.fn().mockResolvedValue(
      result ?? {
        summary: `${id} completed successfully.`,
        data: { processed: true },
        suggestions: [],
      }
    ),
  } as unknown as BaseAgent;
}

describe('AgentRouter', () => {
  let llm: OpenRouterService;
  let toolRegistry: ToolRegistry;
  let contextBuilder: ContextBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    toolRegistry = createMockToolRegistry();
    contextBuilder = createMockContextBuilder();
  });

  // ─── run() ──────────────────────────────────────────────────────────────

  describe('run()', () => {
    it('should answer conversational requests without building full prompt context', async () => {
      const llm = {
        prompt: vi.fn().mockResolvedValueOnce({
          parsedOutput: {
            isConversational: true,
            reasoning: 'Simple greeting.',
            directResponse: 'Hi there! How can I help today?',
            estimatedComplexity: 'simple',
          },
          content: JSON.stringify({
            isConversational: true,
            reasoning: 'Simple greeting.',
            directResponse: 'Hi there! How can I help today?',
            estimatedComplexity: 'simple',
          }),
          model: 'anthropic/claude-haiku-4-5',
          usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
          latencyMs: 120,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const result = await router.run({
        operationId: 'op-chat-fast-path',
        userId: 'user-123',
        intent: 'Hi',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(result.summary).toBe('Hi there! How can I help today?');
      expect(contextBuilder.buildPromptContext).not.toHaveBeenCalled();
      expect(contextBuilder.buildContext).toHaveBeenCalledWith('user-123', undefined);
      expect(llm.prompt).toHaveBeenCalledTimes(1);
    });

    it('should return a direct conversational response after loading profile context', async () => {
      const llm = {
        prompt: vi
          .fn()
          .mockResolvedValueOnce({
            parsedOutput: {
              isConversational: true,
              reasoning: 'Needs lightweight personalization.',
              directResponse: null,
              estimatedComplexity: 'simple',
            },
            content: JSON.stringify({
              isConversational: true,
              reasoning: 'Needs lightweight personalization.',
              directResponse: null,
              estimatedComplexity: 'simple',
            }),
            model: 'anthropic/claude-haiku-4-5',
            usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
            latencyMs: 120,
            costUsd: 0.0001,
            toolCalls: [],
            finishReason: 'stop',
          })
          .mockResolvedValueOnce({
            parsedOutput: {
              summary:
                'As a football QB, I can help with recruiting, film, branding, and planning.',
              directResponse:
                'As a football QB, I can help with recruiting, film, branding, and planning.',
              tasks: [],
            },
            content: JSON.stringify({
              summary:
                'As a football QB, I can help with recruiting, film, branding, and planning.',
              directResponse:
                'As a football QB, I can help with recruiting, film, branding, and planning.',
              tasks: [],
            }),
            model: 'anthropic/claude-haiku-4-5',
            usage: { inputTokens: 60, outputTokens: 40, totalTokens: 100 },
            latencyMs: 180,
            costUsd: 0.0002,
            toolCalls: [],
            finishReason: 'stop',
          }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const result = await router.run({
        operationId: 'op-chat-profile-context',
        userId: 'user-123',
        intent: 'How can you help me?',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(result.summary).toContain('As a football QB');
      expect(contextBuilder.buildContext).toHaveBeenCalledWith('user-123', undefined);
      expect(contextBuilder.buildPromptContext).not.toHaveBeenCalled();
      expect(contextBuilder.getRecentThreadHistory).not.toHaveBeenCalled();
      expect(llm.prompt).toHaveBeenCalledTimes(2);
    });

    it('should load thread-aware context for self-introspection questions', async () => {
      const llm = {
        prompt: vi
          .fn()
          .mockResolvedValueOnce({
            parsedOutput: {
              isConversational: true,
              reasoning: 'Self-introspection request.',
              directResponse: null,
              estimatedComplexity: 'simple',
            },
            content: JSON.stringify({
              isConversational: true,
              reasoning: 'Self-introspection request.',
              directResponse: null,
              estimatedComplexity: 'simple',
            }),
            model: 'anthropic/claude-haiku-4-5',
            usage: { inputTokens: 60, outputTokens: 24, totalTokens: 84 },
            latencyMs: 120,
            costUsd: 0.0001,
            toolCalls: [],
            finishReason: 'stop',
          })
          .mockResolvedValueOnce({
            parsedOutput: {
              summary:
                'I know you are a football QB, you prefer weekly milestone plans, and your recent sync shows updated recruiting priorities.',
              directResponse:
                'I know you are a football QB, you prefer weekly milestone plans, and your recent sync shows updated recruiting priorities.',
              tasks: [],
            },
            content: JSON.stringify({
              summary:
                'I know you are a football QB, you prefer weekly milestone plans, and your recent sync shows updated recruiting priorities.',
              directResponse:
                'I know you are a football QB, you prefer weekly milestone plans, and your recent sync shows updated recruiting priorities.',
              tasks: [],
            }),
            model: 'anthropic/claude-haiku-4-5',
            usage: { inputTokens: 80, outputTokens: 50, totalTokens: 130 },
            latencyMs: 180,
            costUsd: 0.0002,
            toolCalls: [],
            finishReason: 'stop',
          }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;
      (contextBuilder.getActiveThreadsSummary as ReturnType<typeof vi.fn>).mockResolvedValue(
        '\n- Recruiting follow-up plan\n- QB mechanics review'
      );
      (contextBuilder.getRecentThreadHistory as ReturnType<typeof vi.fn>).mockResolvedValue(
        '--- Recent conversation history ---\n[User]: Summarize what you know about me\n--- End conversation history ---'
      );

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const result = await router.run({
        operationId: 'op-chat-self-knowledge',
        userId: 'user-123',
        intent: 'What do you know about me?',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        context: { threadId: 'thread-self-knowledge' },
      });

      expect(result.summary).toContain('football QB');
      expect(contextBuilder.buildContext).toHaveBeenCalledWith('user-123', undefined);
      expect(contextBuilder.getActiveThreadsSummary).toHaveBeenCalledWith('user-123', 8);
      expect(contextBuilder.getRecentThreadHistory).toHaveBeenCalledWith(
        'thread-self-knowledge',
        20
      );
      expect(contextBuilder.buildPromptContext).not.toHaveBeenCalled();
      expect(llm.prompt).toHaveBeenCalledTimes(2);
    });

    it('should reuse conversational classification cache for repeated no-context chat requests', async () => {
      const llm = {
        prompt: vi.fn().mockResolvedValue({
          parsedOutput: {
            isConversational: true,
            reasoning: 'Greeting.',
            directResponse: 'Hi there! How can I help today?',
            estimatedComplexity: 'simple',
          },
          content: JSON.stringify({
            isConversational: true,
            reasoning: 'Greeting.',
            directResponse: 'Hi there! How can I help today?',
            estimatedComplexity: 'simple',
          }),
          model: 'anthropic/claude-haiku-4-5',
          usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
          latencyMs: 120,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const payload: AgentJobPayload = {
        operationId: 'op-chat-cache-1',
        userId: 'user-123',
        intent: 'Hi',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const first = await router.run(payload);
      const second = await router.run({
        ...payload,
        operationId: 'op-chat-cache-2',
      });

      expect(first.summary).toBe('Hi there! How can I help today?');
      expect(second.summary).toBe('Hi there! How can I help today?');
      expect(llm.prompt).toHaveBeenCalledTimes(1);
    });

    it('should not reuse thread-aware direct responses across repeated requests', async () => {
      const routeDecision = {
        parsedOutput: {
          isConversational: true,
          reasoning: 'Needs thread context.',
          directResponse: null,
          estimatedComplexity: 'simple',
        },
        content: JSON.stringify({
          isConversational: true,
          reasoning: 'Needs thread context.',
          directResponse: null,
          estimatedComplexity: 'simple',
        }),
        model: 'anthropic/claude-haiku-4-5',
        usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
        latencyMs: 120,
        costUsd: 0.0001,
        toolCalls: [],
        finishReason: 'stop',
      };

      const contextualResponse = {
        parsedOutput: {
          summary: 'Based on our recent thread, here is the follow-up.',
          directResponse: 'Based on our recent thread, here is the follow-up.',
          tasks: [],
        },
        content: JSON.stringify({
          summary: 'Based on our recent thread, here is the follow-up.',
          directResponse: 'Based on our recent thread, here is the follow-up.',
          tasks: [],
        }),
        model: 'anthropic/claude-haiku-4-5',
        usage: { inputTokens: 60, outputTokens: 40, totalTokens: 100 },
        latencyMs: 180,
        costUsd: 0.0002,
        toolCalls: [],
        finishReason: 'stop',
      };

      const llm = {
        prompt: vi
          .fn()
          .mockResolvedValueOnce(routeDecision)
          .mockResolvedValueOnce(contextualResponse)
          .mockResolvedValueOnce(routeDecision)
          .mockResolvedValueOnce(contextualResponse),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      (contextBuilder.getRecentThreadHistory as ReturnType<typeof vi.fn>).mockResolvedValue(
        '--- Recent conversation history ---\n[User]: Continue that idea\n--- End conversation history ---'
      );

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const basePayload: AgentJobPayload = {
        operationId: 'op-thread-live-1',
        userId: 'user-123',
        intent: 'Continue from before',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        context: { threadId: 'thread-1' },
      };

      await router.run(basePayload);
      await router.run({
        ...basePayload,
        operationId: 'op-thread-live-2',
      });

      expect(contextBuilder.getRecentThreadHistory).toHaveBeenCalledTimes(2);
      expect(llm.prompt).toHaveBeenCalledTimes(3);
    });

    it('should route actionable requests through planner execution', async () => {
      const llm = {
        prompt: vi
          .fn()
          .mockResolvedValueOnce({
            parsedOutput: {
              isConversational: false,
              reasoning: 'Coordinator execution required.',
              directResponse: null,
              estimatedComplexity: 'moderate',
            },
            content: JSON.stringify({
              isConversational: false,
              reasoning: 'Coordinator execution required.',
              directResponse: null,
              estimatedComplexity: 'moderate',
            }),
            model: 'anthropic/claude-haiku-4-5',
            usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
            latencyMs: 120,
            costUsd: 0.0001,
            toolCalls: [],
            finishReason: 'stop',
          })
          .mockResolvedValueOnce({
            parsedOutput: {
              summary: 'Send recruiting emails.',
              estimatedSteps: 1,
              tasks: [
                {
                  id: '1',
                  assignedAgent: 'recruiting_coordinator',
                  description: 'Draft and send recruiting emails',
                  dependsOn: [],
                },
              ],
            },
            content: JSON.stringify({
              summary: 'Send recruiting emails.',
              estimatedSteps: 1,
              tasks: [
                {
                  id: '1',
                  assignedAgent: 'recruiting_coordinator',
                  description: 'Draft and send recruiting emails',
                  dependsOn: [],
                },
              ],
            }),
            model: 'anthropic/claude-sonnet-4-5',
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            latencyMs: 240,
            costUsd: 0.001,
            toolCalls: [],
            finishReason: 'stop',
          }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const recruitingAgent = createMockAgent('recruiting_coordinator', {
        summary: 'Recruiting emails queued.',
        data: { sent: true },
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(recruitingAgent);

      const streamEvents: Array<Record<string, unknown>> = [];
      const result = await router.run(
        {
          operationId: 'op-plan-escalation',
          userId: 'user-123',
          intent: 'Send recruiting emails to college coaches',
          origin: TEST_ORIGIN,
          priority: 'normal',
          createdAt: new Date().toISOString(),
        },
        undefined,
        undefined,
        (event) => streamEvents.push(event as Record<string, unknown>)
      );

      expect(result.summary).toBe('Recruiting emails queued.');
      expect(contextBuilder.buildContext).toHaveBeenCalled();
      expect(contextBuilder.buildPromptContext).not.toHaveBeenCalled();
      expect(llm.prompt).toHaveBeenCalledTimes(2);
      expect((llm.prompt as ReturnType<typeof vi.fn>).mock.calls[1]?.[2]).toMatchObject({
        outputSchema: { name: 'planner_execution_plan' },
      });
      expect(streamEvents.some((event) => event.type === 'operation')).toBe(true);
    });

    it('should fall through to planner execution when planner classification fails', async () => {
      const llm = {
        prompt: vi
          .fn()
          .mockRejectedValueOnce(new Error('triage timeout'))
          .mockResolvedValueOnce({
            parsedOutput: {
              summary: 'Send recruiting emails.',
              estimatedSteps: 1,
              tasks: [
                {
                  id: '1',
                  assignedAgent: 'recruiting_coordinator',
                  description: 'Draft and send recruiting emails',
                  dependsOn: [],
                },
              ],
            },
            content: JSON.stringify({
              summary: 'Send recruiting emails.',
              estimatedSteps: 1,
              tasks: [
                {
                  id: '1',
                  assignedAgent: 'recruiting_coordinator',
                  description: 'Draft and send recruiting emails',
                  dependsOn: [],
                },
              ],
            }),
            model: 'anthropic/claude-sonnet-4-5',
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            latencyMs: 240,
            costUsd: 0.001,
            toolCalls: [],
            finishReason: 'stop',
          }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const recruitingAgent = createMockAgent('recruiting_coordinator', {
        summary: 'Recruiting emails queued.',
        data: { sent: true },
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(recruitingAgent);

      const result = await router.run({
        operationId: 'op-triage-fallback',
        userId: 'user-123',
        intent: 'Send recruiting emails to college coaches',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(result.summary).toBe('Recruiting emails queued.');
      expect(llm.prompt).toHaveBeenCalledTimes(2);
      expect((llm.prompt as ReturnType<typeof vi.fn>).mock.calls[1]?.[2]).toMatchObject({
        outputSchema: { name: 'planner_execution_plan' },
      });
    });

    it('should emit baseline run metrics for first progress, first token, planner latency, completion, and success', async () => {
      const llm = {
        prompt: vi
          .fn()
          .mockResolvedValueOnce({
            parsedOutput: {
              route: 'plan',
              requiredContextScopes: [],
              directResponse: null,
              planSummary: 'send recruiting emails',
            },
            content: JSON.stringify({
              route: 'plan',
              requiredContextScopes: [],
              directResponse: null,
              planSummary: 'send recruiting emails',
            }),
            model: 'anthropic/claude-haiku-4-5',
            usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
            latencyMs: 120,
            costUsd: 0.0001,
            toolCalls: [],
            finishReason: 'stop',
          })
          .mockResolvedValueOnce({
            parsedOutput: {
              summary: 'Send recruiting emails.',
              estimatedSteps: 1,
              tasks: [
                {
                  id: '1',
                  assignedAgent: 'recruiting_coordinator',
                  description: 'Draft and send recruiting emails',
                  dependsOn: [],
                },
              ],
            },
            content: JSON.stringify({
              summary: 'Send recruiting emails.',
              estimatedSteps: 1,
              tasks: [
                {
                  id: '1',
                  assignedAgent: 'recruiting_coordinator',
                  description: 'Draft and send recruiting emails',
                  dependsOn: [],
                },
              ],
            }),
            model: 'anthropic/claude-sonnet-4-5',
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            latencyMs: 240,
            costUsd: 0.001,
            toolCalls: [],
            finishReason: 'stop',
          }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const recruitingAgent = createMockAgent('recruiting_coordinator', {
        summary: 'Recruiting emails queued.',
        data: { sent: true },
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(recruitingAgent);

      const streamEvents: Array<Record<string, unknown>> = [];
      await router.run(
        {
          operationId: 'op-metrics-baseline',
          userId: 'user-123',
          intent: 'Send recruiting emails to college coaches',
          origin: TEST_ORIGIN,
          priority: 'normal',
          createdAt: new Date().toISOString(),
        },
        () => undefined,
        undefined,
        (event) => streamEvents.push(event as Record<string, unknown>)
      );

      const metricNames = streamEvents
        .filter((event) => event.type === 'metric')
        .map((event) => (event.metadata as Record<string, unknown> | undefined)?.['metricName'])
        .filter((metricName): metricName is string => typeof metricName === 'string');
      const metricEvent = streamEvents.find(
        (event) =>
          event.type === 'metric' &&
          (event.metadata as Record<string, unknown> | undefined)?.['metricName'] ===
            'planner_latency_ms'
      );

      expect(metricNames).toContain('first_progress_ms');
      expect(metricNames).toContain('planner_latency_ms');
      expect(metricNames).toContain('completion_latency_ms');
      expect(metricNames).toContain('success_rate');
      expect(metricEvent?.messageKey).toBe('agent.metric.planner_latency_ms');
    });

    it('should stop execution when agentic turn count exceeds maxAgenticTurns', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const payload: AgentJobPayload = {
        operationId: 'op-turn-limit',
        userId: 'user-123',
        intent: 'Keep researching until complete',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        context: {
          agenticTurnCount: 6,
        },
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('maximum execution turn limit');
      expect(result.data).toEqual(
        expect.objectContaining({
          maxIterationsReached: true,
          operationStatus: 'failed',
          maxAgenticTurns: 6,
          agenticTurnCount: 7,
        })
      );
      expect(contextBuilder.buildPromptContext).not.toHaveBeenCalled();
      expect(updates.some((u) => u.status === 'failed')).toBe(true);
    });

    it('should resume yielded approval jobs via resumeExecution and forward approvalId', async () => {
      llm = createMockLLM({ tasks: [] });

      const recruitingAgent = createMockAgent('recruiting_coordinator', {
        summary: 'Approved email sent successfully.',
        data: { sent: true },
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(recruitingAgent);

      const yieldState = {
        reason: 'needs_approval' as const,
        agentId: 'recruiting_coordinator' as const,
        promptToUser: 'Approve sending this email?',
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'assistant', content: null, tool_calls: [] },
        ],
        pendingToolCall: {
          toolName: 'send_email',
          toolInput: { toEmail: 'coach@example.com', subject: 'Hello coach' },
          toolCallId: 'tool-call-1',
        },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };

      const payload: AgentJobPayload = {
        operationId: 'op-resume-approval',
        userId: 'user-123',
        intent: 'Send my coach outreach email',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        context: {
          approvalId: 'approval-123',
          yieldState,
        },
      };

      const result = await router.run(payload);

      expect(recruitingAgent.resumeExecution).toHaveBeenCalledWith(
        yieldState,
        expect.objectContaining({ operationId: 'op-resume-approval', userId: 'user-123' }),
        expect.any(Array),
        llm,
        toolRegistry,
        undefined,
        undefined,
        undefined,
        'approval-123'
      );

      expect(result.summary).toBe('Approved email sent successfully.');
    });

    it('should execute a single-task plan successfully', async () => {
      llm = createMockLLM({
        summary: 'Analyze the tape.',
        tasks: [
          {
            id: '1',
            assignedAgent: 'performance_coordinator',
            description: 'Analyze highlight tape',
            dependsOn: [],
          },
        ],
      });

      const performanceAgent = createMockAgent('performance_coordinator', {
        summary: 'Tape graded: B+ overall.',
        data: { grade: 'B+' },
        suggestions: ['Upload more recent footage.'],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(performanceAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-001',
        userId: 'user-123',
        intent: 'Grade my highlight tape',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      // Agent should have been called
      expect(performanceAgent.execute).toHaveBeenCalledTimes(1);

      // Result should contain the agent's summary
      expect(result.summary).toContain('Tape graded: B+ overall.');

      // Suggestions should propagate
      expect(result.suggestions).toContain('Upload more recent footage.');

      // Should have emitted updates
      expect(updates.length).toBeGreaterThan(0);
      expect(updates.some((u) => u.status === 'completed')).toBe(true);
    });

    it('should execute tasks in dependency order', async () => {
      llm = createMockLLM({
        summary: 'Grade then email.',
        tasks: [
          {
            id: '1',
            assignedAgent: 'performance_coordinator',
            description: 'Grade tape',
            dependsOn: [],
          },
          {
            id: '2',
            assignedAgent: 'recruiting_coordinator',
            description: 'Email coaches',
            dependsOn: ['1'],
          },
        ],
      });

      const executionOrder: string[] = [];

      const performanceAgent = createMockAgent('performance_coordinator');
      (performanceAgent.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        executionOrder.push('performance_coordinator');
        return { summary: 'Tape graded.', data: {}, suggestions: [] };
      });

      const recruitingAgent = createMockAgent('recruiting_coordinator');
      (recruitingAgent.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        executionOrder.push('recruiting_coordinator');
        return { summary: 'Emails sent.', data: {}, suggestions: [] };
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(performanceAgent);
      router.registerAgent(recruitingAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-002',
        userId: 'user-123',
        intent: 'Grade tape and email coaches',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      await router.run(payload);

      // Performance coordinator must run before recruiting coordinator
      expect(executionOrder).toEqual(['performance_coordinator', 'recruiting_coordinator']);
    });

    it('should inject upstream results into downstream task intents', async () => {
      llm = createMockLLM({
        tasks: [
          {
            id: '1',
            assignedAgent: 'performance_coordinator',
            description: 'Grade tape',
            dependsOn: [],
          },
          {
            id: '2',
            assignedAgent: 'recruiting_coordinator',
            description: 'Email coaches with grade',
            dependsOn: ['1'],
          },
        ],
      });

      const performanceAgent = createMockAgent('performance_coordinator', {
        summary: 'Grade: A-',
        data: { grade: 'A-' },
        suggestions: [],
      });

      const recruitingAgent = createMockAgent('recruiting_coordinator');
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(performanceAgent);
      router.registerAgent(recruitingAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-003',
        userId: 'user-123',
        intent: 'Grade and email',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      await router.run(payload);

      // The recruiting coordinator should receive enriched intent with upstream results
      const recruitingCall = (recruitingAgent.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const taskIntent = recruitingCall[0] as string;
      expect(taskIntent).toContain('[Result from task 1]');
      expect(taskIntent).toContain('Grade: A-');
    });

    it('should handle agent execution failure gracefully', async () => {
      llm = createMockLLM({
        tasks: [
          {
            id: '1',
            assignedAgent: 'performance_coordinator',
            description: 'Grade tape',
            dependsOn: [],
          },
        ],
      });

      const performanceAgent = createMockAgent('performance_coordinator');
      (performanceAgent.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('LLM timeout')
      );

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(performanceAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-004',
        userId: 'user-123',
        intent: 'Grade tape',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('Execution plan failed.');
      expect(result.summary).toContain('Task 1');
      expect(result.summary).toContain('LLM timeout');
      expect(result.data).toMatchObject({
        operationStatus: 'failed',
        firstFailedTask: {
          id: '1',
          assignedAgent: 'performance_coordinator',
          error: 'LLM timeout',
        },
      });

      expect(updates.some((u) => u.step?.message?.includes('failed'))).toBe(true);
      expect(updates.some((u) => u.status === 'failed')).toBe(true);
    });

    it('should return empty result when planner returns no tasks', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);

      const payload: AgentJobPayload = {
        operationId: 'op-005',
        userId: 'user-123',
        intent: 'something impossible',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const result = await router.run(payload);

      expect(result.summary).toBe('Need clarification before planning.');
      expect(result.suggestions).toEqual([]);
    });

    it('should answer greeting chat through the Chief of Staff direct-response path', async () => {
      llm = {
        prompt: vi.fn().mockResolvedValue({
          parsedOutput: {
            isConversational: true,
            reasoning: 'Greeting request.',
            directResponse:
              "I'm Agent X, your NXT1 Chief of Staff. UserID 19oowBH8EfZ6AYrU4fNuRSreonO2 TeamID mC3D9qg5d9amvcO0otvi OrgID nB8n9iNsm5M5KBxfGUC9.",
            estimatedComplexity: 'simple',
          },
          content: JSON.stringify({
            isConversational: true,
            reasoning: 'Greeting request.',
            directResponse:
              "I'm Agent X, your NXT1 Chief of Staff. UserID 19oowBH8EfZ6AYrU4fNuRSreonO2 TeamID mC3D9qg5d9amvcO0otvi OrgID nB8n9iNsm5M5KBxfGUC9.",
            estimatedComplexity: 'simple',
          }),
          model: 'anthropic/claude-haiku-4-5',
          usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
          latencyMs: 120,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);

      const payload: AgentJobPayload = {
        operationId: 'op-chief-of-staff-fallback',
        userId: 'user-123',
        intent: 'hello',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (update) => updates.push(update));

      expect(result.summary).toContain("I'm Agent X, your NXT1 Chief of Staff.");
      expect(result.summary).not.toContain('19oowBH8EfZ6AYrU4fNuRSreonO2');
      expect(result.summary).not.toContain('mC3D9qg5d9amvcO0otvi');
      expect(result.summary).not.toContain('nB8n9iNsm5M5KBxfGUC9');
      expect(
        updates.some(
          (update) =>
            (update.agentId === 'router' || update.step?.agentId === 'router') &&
            (update.metadata?.['executionMode'] === 'chief_of_staff_direct' ||
              update.step?.metadata?.['executionMode'] === 'chief_of_staff_direct')
        )
      ).toBe(true);
      expect(
        updates.some(
          (update) =>
            (typeof update.step?.message === 'string' &&
              update.step.message.includes('[redacted]')) ||
            (typeof (update as { message?: unknown }).message === 'string' &&
              ((update as { message?: string }).message?.includes('[redacted]') ?? false))
        )
      ).toBe(true);
    });

    it('should stream Chief of Staff direct responses as multiple non-batched deltas', async () => {
      const directResponse =
        "Hi John! I'm the Chief of Staff for Agent X, the AI engine of NXT1 Sports. I'm here to help you manage your Crown Point Bulldogs basketball program. What would you like to accomplish today?";

      llm = createMockLLM({
        summary: 'Chief of Staff greeting response.',
        directResponse,
        tasks: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);

      const payload: AgentJobPayload = {
        operationId: 'op-chief-of-staff-stream-chunks',
        userId: 'user-123',
        intent: 'hello',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const streamedEvents: Array<{ type?: string; text?: string; noBatch?: boolean }> = [];

      const result = await router.run(payload, undefined, undefined, (event) =>
        streamedEvents.push(event)
      );

      const deltaEvents = streamedEvents.filter((event) => event.type === 'delta');
      expect(deltaEvents.length).toBeGreaterThan(1);
      expect(deltaEvents.every((event) => event.noBatch === true)).toBe(true);

      const streamedText = deltaEvents
        .map((event) => event.text ?? '')
        .join('')
        .trim();
      expect(streamedText).toBe(result.summary.trim());
    });

    it('should fail when planner assigns a non-routable agent', async () => {
      llm = createMockLLM({
        tasks: [{ id: '1', assignedAgent: 'nonexistent', description: 'test', dependsOn: [] }],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);

      const payload: AgentJobPayload = {
        operationId: 'op-006',
        userId: 'user-123',
        intent: 'test',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('Planner assigned non-routable agents');
      expect(updates.some((u) => u.status === 'failed')).toBe(true);
    });

    it('should perform one constrained replan when first plan is infeasible', async () => {
      llm = {
        prompt: vi.fn().mockImplementation(async (_system, _input, config) => {
          if (config?.outputSchema?.name === 'classifier_route_decision') {
            const routeDecision = {
              route: 'action',
              reasoning: 'Coordinator execution required',
              requiredContextScopes: [],
              directResponse: null,
              planSummary: 'Do the task with replanning if needed',
            };

            return {
              content: JSON.stringify(routeDecision),
              parsedOutput: routeDecision,
              toolCalls: [],
              model: 'deepseek/deepseek-v3.2',
              usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
              latencyMs: 100,
              costUsd: 0.00005,
              finishReason: 'stop',
            };
          }

          const planningCallCount = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[2]?.outputSchema?.name === 'planner_action_execution_plan'
          ).length;
          const plan =
            planningCallCount === 1
              ? {
                  resultType: 'execution',
                  summary: 'Initial infeasible plan.',
                  estimatedSteps: 1,
                  tasks: [
                    {
                      id: '1',
                      assignedAgent: 'admin_coordinator',
                      description: 'invalid task',
                      dependsOn: [],
                    },
                  ],
                  clarificationQuestion: null,
                  clarificationContext: null,
                }
              : {
                  resultType: 'execution',
                  summary: 'Replanned feasible plan.',
                  estimatedSteps: 1,
                  tasks: [
                    {
                      id: '1',
                      assignedAgent: 'strategy_coordinator',
                      description: 'valid task',
                      dependsOn: [],
                    },
                  ],
                  clarificationQuestion: null,
                  clarificationContext: null,
                };

          return {
            content: JSON.stringify(plan),
            parsedOutput: plan,
            toolCalls: [],
            model: 'anthropic/claude-sonnet-4.5',
            usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
            latencyMs: 150,
            costUsd: 0.0002,
            finishReason: 'stop',
          };
        }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const strategyAgent = createMockAgent('strategy_coordinator', {
        summary: 'Replanned task executed successfully.',
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(strategyAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-replan-once',
        userId: 'user-123',
        intent: 'Do the task with replanning if needed',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect((llm.prompt as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('should fail with capability_mismatch after one constrained replan', async () => {
      let planningCalls = 0;

      llm = {
        prompt: vi.fn().mockImplementation(async (_system, _input, config) => {
          if (config?.outputSchema?.name === 'classifier_route_decision') {
            const routeDecision = {
              route: 'action',
              reasoning: 'Coordinator execution required',
              requiredContextScopes: [],
              directResponse: null,
              planSummary: 'Find coaches and run recruiting outreach',
            };

            return {
              content: JSON.stringify(routeDecision),
              parsedOutput: routeDecision,
              toolCalls: [],
              model: 'deepseek/deepseek-v3.2',
              usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
              latencyMs: 100,
              costUsd: 0.00005,
              finishReason: 'stop',
            };
          }

          planningCalls += 1;
          const plan =
            planningCalls === 1
              ? {
                  resultType: 'execution',
                  summary: 'Initial capability-mismatched plan.',
                  estimatedSteps: 1,
                  tasks: [
                    {
                      id: '1',
                      assignedAgent: 'strategy_coordinator',
                      description: 'task one',
                      dependsOn: [],
                    },
                  ],
                  clarificationQuestion: null,
                  clarificationContext: null,
                }
              : {
                  resultType: 'execution',
                  summary: 'Replanned but still mismatched.',
                  estimatedSteps: 1,
                  tasks: [
                    {
                      id: '2',
                      assignedAgent: 'strategy_coordinator',
                      description: 'task two',
                      dependsOn: [],
                    },
                  ],
                  clarificationQuestion: null,
                  clarificationContext: null,
                };

          return {
            content: JSON.stringify(plan),
            parsedOutput: plan,
            toolCalls: [],
            model: 'anthropic/claude-sonnet-4.5',
            usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
            latencyMs: 150,
            costUsd: 0.0002,
            finishReason: 'stop',
          };
        }),
        complete: vi.fn(),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as OpenRouterService;

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));
      router.registerAgent(createMockAgent('recruiting_coordinator'));

      (
        router as unknown as {
          planningService: {
            buildCapabilitySnapshot: (
              intent: string,
              toolAccessContext: unknown,
              agents: unknown
            ) => Promise<{
              schemaVersion: number;
              hash: string;
              coordinators: Array<{
                agentId: string;
                allowedToolNames: string[];
                allowedEntityGroups: string[];
                matchedToolNames: string[];
                staticSkillHints: string[];
                matchedSkillHints: string[];
                confidence: {
                  matchedToolCount: number;
                  allowedToolCount: number;
                  toolCoverageRatio: number;
                  matchedSkillCount: number;
                  staticSkillCount: number;
                  skillCoverageRatio: number;
                };
              }>;
            }>;
          };
        }
      ).planningService.buildCapabilitySnapshot = vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hash: 'snapshot-hash',
        coordinators: [
          {
            agentId: 'strategy_coordinator',
            allowedToolNames: ['plan_strategy'],
            allowedEntityGroups: [],
            matchedToolNames: [],
            staticSkillHints: [],
            matchedSkillHints: [],
            confidence: {
              matchedToolCount: 0,
              allowedToolCount: 1,
              toolCoverageRatio: 0,
              matchedSkillCount: 0,
              staticSkillCount: 0,
              skillCoverageRatio: 0,
            },
          },
          {
            agentId: 'recruiting_coordinator',
            allowedToolNames: ['send_email'],
            allowedEntityGroups: [],
            matchedToolNames: ['send_email'],
            staticSkillHints: [],
            matchedSkillHints: [],
            confidence: {
              matchedToolCount: 1,
              allowedToolCount: 1,
              toolCoverageRatio: 1,
              matchedSkillCount: 0,
              staticSkillCount: 0,
              skillCoverageRatio: 0,
            },
          },
        ],
      });

      const payload: AgentJobPayload = {
        operationId: 'op-capability-mismatch',
        userId: 'user-123',
        intent: 'Find coaches and run recruiting outreach',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect((llm.prompt as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(result.summary).toContain('infeasible execution plan');
      expect(result.summary).toContain('capability_mismatch');
      expect(result.data?.['operationStatus']).toBe('failed');
      expect(result.data?.['preflightIssueCounts']).toMatchObject({ capability_mismatch: 1 });
      expect(updates.some((u) => u.step?.message?.includes('attempting constrained replan'))).toBe(
        true
      );
    });

    it('should fail fast when constrained replan is a no-op', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const noOpPlan = {
        summary: 'Invalid plan returned repeatedly.',
        tasks: [
          {
            id: '1',
            assignedAgent: 'strategy_coordinator',
            description: 'invalid dependency chain',
            dependsOn: ['missing-task-99'],
          },
        ],
      };

      const mockedPlanner = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            summary: 'Initial invalid plan.',
            data: { plan: noOpPlan },
            suggestions: [],
          })
          .mockResolvedValueOnce({
            summary: 'Replanned invalid plan is identical.',
            data: { plan: noOpPlan },
            suggestions: [],
          }),
      };

      (router as unknown as { planner: { execute: typeof mockedPlanner.execute } }).planner =
        mockedPlanner;

      const payload: AgentJobPayload = {
        operationId: 'op-noop-replan',
        userId: 'user-123',
        intent: 'Generate a valid strategy plan',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('did not change the infeasible execution plan');
      expect(result.data?.['operationStatus']).toBe('failed');
      expect(result.data?.['replanNoOp']).toBe(true);
      expect(result.data?.['preflightIssueCounts']).toMatchObject({ unknown_dependency: 1 });
      expect(mockedPlanner.execute).toHaveBeenCalledTimes(2);
      expect(updates.some((u) => u.step?.message?.includes('attempting constrained replan'))).toBe(
        true
      );
    });

    it('should fail preflight when planner emits duplicate task IDs', async () => {
      llm = createMockLLM({
        summary: 'Duplicate IDs plan',
        tasks: [
          {
            id: '1',
            assignedAgent: 'strategy_coordinator',
            description: 'first task',
            dependsOn: [],
          },
          {
            id: '1',
            assignedAgent: 'strategy_coordinator',
            description: 'second task with duplicate id',
            dependsOn: [],
          },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const payload: AgentJobPayload = {
        operationId: 'op-duplicate-task-id',
        userId: 'user-123',
        intent: 'Run duplicate ID plan',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('infeasible execution plan');
      expect(result.summary).toContain('duplicate_task_id');
      expect(result.data?.['operationStatus']).toBe('failed');
      expect(updates.some((u) => u.step?.message?.includes('attempting constrained replan'))).toBe(
        true
      );
    });

    it('should fail preflight when planner emits circular dependencies', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const circularPlan = {
        summary: 'Circular dependency plan',
        tasks: [
          {
            id: '1',
            assignedAgent: 'strategy_coordinator',
            description: 'task one',
            dependsOn: ['2'],
          },
          {
            id: '2',
            assignedAgent: 'strategy_coordinator',
            description: 'task two',
            dependsOn: ['1'],
          },
        ],
      };

      const mockedPlanner = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            summary: 'Initial circular plan.',
            data: { plan: circularPlan },
            suggestions: [],
          })
          .mockResolvedValueOnce({
            summary: 'Replanned circular plan still invalid.',
            data: { plan: circularPlan },
            suggestions: [],
          }),
      };

      (router as unknown as { planner: { execute: typeof mockedPlanner.execute } }).planner =
        mockedPlanner;

      const payload: AgentJobPayload = {
        operationId: 'op-circular-dependency',
        userId: 'user-123',
        intent: 'Run circular dependency plan',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('infeasible execution plan');
      expect(result.summary).toContain('circular_dependency');
      expect(result.data?.['operationStatus']).toBe('failed');
      expect(mockedPlanner.execute).toHaveBeenCalledTimes(2);
      expect(updates.some((u) => u.step?.message?.includes('attempting constrained replan'))).toBe(
        true
      );
    });

    it('should fail preflight when planner emits an empty task id', async () => {
      llm = createMockLLM({
        summary: 'Missing task id plan',
        tasks: [
          {
            id: '',
            assignedAgent: 'strategy_coordinator',
            description: 'task missing id',
            dependsOn: [],
          },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const payload: AgentJobPayload = {
        operationId: 'op-missing-task-id',
        userId: 'user-123',
        intent: 'Run missing task id plan',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('infeasible execution plan');
      expect(result.summary).toContain('missing_task_id');
      expect(result.data?.['operationStatus']).toBe('failed');
      expect(updates.some((u) => u.step?.message?.includes('attempting constrained replan'))).toBe(
        true
      );
    });

    it('should fail preflight when planner emits self dependency', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const selfDependencyPlan = {
        summary: 'Self dependency plan',
        tasks: [
          {
            id: '1',
            assignedAgent: 'strategy_coordinator',
            description: 'task depends on itself',
            dependsOn: ['1'],
          },
        ],
      };

      const mockedPlanner = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            summary: 'Initial self-dependency plan.',
            data: { plan: selfDependencyPlan },
            suggestions: [],
          })
          .mockResolvedValueOnce({
            summary: 'Replanned self-dependency plan still invalid.',
            data: { plan: selfDependencyPlan },
            suggestions: [],
          }),
      };

      (router as unknown as { planner: { execute: typeof mockedPlanner.execute } }).planner =
        mockedPlanner;

      const payload: AgentJobPayload = {
        operationId: 'op-self-dependency',
        userId: 'user-123',
        intent: 'Run self dependency plan',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('infeasible execution plan');
      expect(result.summary).toContain('self_dependency');
      expect(result.data?.['operationStatus']).toBe('failed');
      expect(mockedPlanner.execute).toHaveBeenCalledTimes(2);
      expect(updates.some((u) => u.step?.message?.includes('attempting constrained replan'))).toBe(
        true
      );
    });

    it('should fail preflight when planner emits an oversized task plan', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const oversizedPlan = {
        summary: 'Oversized plan with too many tasks',
        tasks: Array.from({ length: 25 }, (_, index) => ({
          id: `${index + 1}`,
          assignedAgent: 'strategy_coordinator',
          description: `task ${index + 1}`,
          dependsOn: [],
        })),
      };

      const mockedPlanner = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            summary: 'Initial oversized plan.',
            data: { plan: oversizedPlan },
            suggestions: [],
          })
          .mockResolvedValueOnce({
            summary: 'Replanned oversized plan still invalid.',
            data: { plan: oversizedPlan },
            suggestions: [],
          }),
      };

      (router as unknown as { planner: { execute: typeof mockedPlanner.execute } }).planner =
        mockedPlanner;

      const payload: AgentJobPayload = {
        operationId: 'op-oversized-plan',
        userId: 'user-123',
        intent: 'Build an extremely detailed mega plan',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const result = await router.run(payload);

      expect(result.summary).toContain('plan_task_limit_exceeded');
      expect(result.data?.['operationStatus']).toBe('failed');
      expect(result.data?.['preflightIssueCounts']).toMatchObject({
        plan_task_limit_exceeded: 1,
      });
      expect(mockedPlanner.execute).toHaveBeenCalledTimes(2);
    });

    it('should fail preflight when task dependencies exceed limits or repeat', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const excessiveDependenciesPlan = {
        summary: 'Task has too many dependencies and duplicates',
        tasks: [
          {
            id: '1',
            assignedAgent: 'strategy_coordinator',
            description: 'aggregate all prior steps',
            dependsOn: ['2', '2', '3', '4', '5', '6', '7', '8', '9'],
          },
          ...Array.from({ length: 8 }, (_, index) => ({
            id: `${index + 2}`,
            assignedAgent: 'strategy_coordinator',
            description: `dependency task ${index + 2}`,
            dependsOn: [],
          })),
        ],
      };

      const mockedPlanner = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            summary: 'Initial dependency-heavy plan.',
            data: { plan: excessiveDependenciesPlan },
            suggestions: [],
          })
          .mockResolvedValueOnce({
            summary: 'Replanned dependency-heavy plan still invalid.',
            data: { plan: excessiveDependenciesPlan },
            suggestions: [],
          }),
      };

      (router as unknown as { planner: { execute: typeof mockedPlanner.execute } }).planner =
        mockedPlanner;

      const payload: AgentJobPayload = {
        operationId: 'op-dependency-limit',
        userId: 'user-123',
        intent: 'Build dependency heavy plan',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const result = await router.run(payload);

      expect(result.summary).toContain('task_dependency_limit_exceeded');
      expect(result.summary).toContain('duplicate_dependency');
      expect(result.data?.['operationStatus']).toBe('failed');
      expect(result.data?.['preflightIssueCounts']).toMatchObject({
        task_dependency_limit_exceeded: 1,
        duplicate_dependency: 1,
      });
      expect(mockedPlanner.execute).toHaveBeenCalledTimes(2);
    });

    it('should emit replan issue-delta telemetry when constrained replan fixes issues', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const mockedPlanner = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            summary: 'Initial invalid plan.',
            data: {
              plan: {
                summary: 'Unknown dependency plan',
                tasks: [
                  {
                    id: '1',
                    assignedAgent: 'strategy_coordinator',
                    description: 'run analysis',
                    dependsOn: ['missing-task-999'],
                  },
                ],
              },
            },
            suggestions: [],
          })
          .mockResolvedValueOnce({
            summary: 'Corrected plan.',
            data: {
              plan: {
                summary: 'Feasible plan',
                tasks: [
                  {
                    id: '1',
                    assignedAgent: 'strategy_coordinator',
                    description: 'run analysis',
                    dependsOn: [],
                  },
                ],
              },
            },
            suggestions: [],
          }),
      };

      (router as unknown as { planner: { execute: typeof mockedPlanner.execute } }).planner =
        mockedPlanner;

      const payload: AgentJobPayload = {
        operationId: 'op-replan-delta',
        userId: 'user-123',
        intent: 'Run the analysis task',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      const replanFinished = updates.find(
        (u) =>
          typeof u.step?.payload === 'object' &&
          u.step?.payload !== null &&
          (u.step?.payload as Record<string, unknown>)['eventType'] === 'plan_replan_finished'
      );

      expect(replanFinished).toBeDefined();
      const issueDelta = (replanFinished?.step?.payload as Record<string, unknown>)[
        'issueDelta'
      ] as {
        beforeCount: number;
        afterCount: number;
        resolved: string[];
        introduced: string[];
      };
      expect(issueDelta.beforeCount).toBe(1);
      expect(issueDelta.afterCount).toBe(0);
      expect(issueDelta.resolved).toContain('1:unknown_dependency');
      expect(issueDelta.introduced).toEqual([]);

      const planCreatedUpdate = updates.find(
        (u) =>
          typeof u.step?.payload === 'object' &&
          u.step?.payload !== null &&
          (u.step?.payload as Record<string, unknown>)['eventType'] === 'plan_created'
      );

      expect(planCreatedUpdate?.metadata?.['preflightIssueDelta']).toEqual(
        expect.objectContaining({
          beforeCount: 1,
          afterCount: 0,
        })
      );

      expect(result.data?.['operationStatus']).toBeUndefined();
      expect(mockedPlanner.execute).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Context Enrichment ─────────────────────────────────────────────────

  describe('context enrichment', () => {
    it('should prepend user profile to intent before planning', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const generalAgent = createMockAgent('strategy_coordinator');
      router.registerAgent(generalAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-007',
        userId: 'user-123',
        intent: 'Help me improve my stats',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      await router.run(payload);

      // The LLM prompt (planner) should receive enriched intent
      const plannerCalls = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls;
      const planningCall =
        plannerCalls.find((call) => call[2]?.outputSchema?.name === 'planner_execution_plan') ??
        plannerCalls[plannerCalls.length - 1];
      const userMessage = planningCall[1] as string;

      expect(userMessage).toContain('[User Profile]');
      expect(userMessage).toContain('Test Athlete');
      expect(userMessage).toContain('football');
      expect(userMessage).toContain('MemoryCount: 0');
      expect(userMessage).toContain('[Request]');
      expect(userMessage).toContain('Help me improve my stats');
    });

    it('should attach planner-time capability snapshot to planning input', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      const payload: AgentJobPayload = {
        operationId: 'op-capability-snapshot',
        userId: 'user-123',
        intent: 'Build a weekly recruiting strategy',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      await router.run(payload);

      const planningCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[1];
      const planningIntent = planningCall[1] as string;

      expect(planningIntent).toContain('[Coordinator Capability Snapshot]');
      expect(planningIntent).toContain('schemaVersion: 1');
      expect(planningIntent).toContain('strategy_coordinator');
    });

    it('should keep capability snapshot aligned with policy-filtered tool exposure', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(new RecruitingCoordinatorAgent());

      const toolAccessContext = {
        operationId: 'op-policy-alignment',
        userId: 'user-123',
        origin: TEST_ORIGIN,
        environment: 'production' as const,
      };

      (toolRegistry.getDefinitions as ReturnType<typeof vi.fn>).mockImplementation(
        (agentId: string) => {
          if (agentId !== 'recruiting_coordinator') return [];
          return [
            {
              name: 'search_colleges',
              description: 'Search colleges',
              category: 'database',
            },
            {
              name: 'query_gmail_emails',
              description: 'Query Gmail',
              category: 'integration',
            },
            {
              name: 'unassigned_internal_tool',
              description: 'Should not be surfaced in capability snapshot',
              category: 'integration',
            },
          ];
        }
      );

      const snapshot = await (
        router as unknown as {
          planningService: {
            buildCapabilitySnapshot: (
              intent: string,
              accessContext: typeof toolAccessContext,
              agents: ReadonlyMap<AgentIdentifier, BaseAgent>
            ) => Promise<{
              coordinators: Array<{
                agentId: string;
                allowedToolNames: string[];
              }>;
            }>;
          };
        }
      ).planningService.buildCapabilitySnapshot(
        'Find football colleges and email coaches',
        toolAccessContext,
        (
          router as unknown as {
            getRegisteredAgents: () => ReadonlyMap<AgentIdentifier, BaseAgent>;
          }
        ).getRegisteredAgents()
      );

      const recruitingSnapshot = snapshot.coordinators.find(
        (coordinator) => coordinator.agentId === 'recruiting_coordinator'
      );

      expect(recruitingSnapshot).toBeDefined();
      expect(recruitingSnapshot?.allowedToolNames).toContain('search_colleges');
      expect(recruitingSnapshot?.allowedToolNames).toContain('query_gmail_emails');
      expect(recruitingSnapshot?.allowedToolNames).not.toContain('unassigned_internal_tool');
    });
  });

  // ─── onUpdate Callback ─────────────────────────────────────────────────

  describe('update emissions', () => {
    it('should emit structured updates with operationId and timestamps', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const generalAgent = createMockAgent('strategy_coordinator');
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(generalAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-008',
        userId: 'user-123',
        intent: 'test',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      await router.run(payload, (u) => updates.push(u));

      // All updates should reference the correct operationId
      for (const update of updates) {
        expect(update.operationId).toBe('op-008');
        expect(update.step?.timestamp).toBeDefined();
        expect(update.step?.id).toBeDefined();
      }

      // Should have at least: thinking, acting, completed
      const statuses = updates.map((u) => u.status);
      expect(statuses).toContain('thinking');
      expect(statuses).toContain('acting');
      expect(statuses).toContain('completed');
      expect(
        updates.some(
          (u) => u.stage === 'decomposing_intent' || u.step?.stage === 'decomposing_intent'
        )
      ).toBe(true);
      expect(updates.at(-1)?.outcomeCode ?? updates.at(-1)?.step?.outcomeCode).toBe(
        'success_default'
      );
    });

    it('should work without onUpdate callback (no-op)', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const generalAgent = createMockAgent('strategy_coordinator');
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(generalAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-009',
        userId: 'user-123',
        intent: 'test',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      // Should not throw when no callback provided
      const result = await router.run(payload);
      expect(result).toBeDefined();
    });
  });

  // ─── Agent Registration ─────────────────────────────────────────────────

  describe('registerAgent()', () => {
    it('should register and use agents by ID', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'performance_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const performanceAgent = createMockAgent('performance_coordinator', {
        summary: 'Performance review done.',
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(performanceAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-010',
        userId: 'user-123',
        intent: 'test',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const result = await router.run(payload);
      expect(result.summary).toContain('Performance review done.');
      expect(performanceAgent.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Delegation Handoff ─────────────────────────────────────────────────

  describe('delegation handoff', () => {
    it('should re-dispatch through Planner when a direct agent throws AgentDelegationException', async () => {
      // Direct agent path: brand_coordinator is set directly on payload.
      // brand_coordinator throws delegation → Router catches, strips agent lock,
      // re-dispatches through Planner → Planner routes to recruiting_coordinator.
      const plannerCallCount = { value: 0 };

      llm = {
        prompt: vi.fn().mockImplementation(async (_system, _input, config) => {
          plannerCallCount.value++;

          if (config?.outputSchema?.name === 'classifier_route_decision') {
            const routeDecision = {
              route: 'action',
              reasoning: 'Coordinator execution required',
              requiredContextScopes: [],
              directResponse: null,
              planSummary: 'Send recruiting emails to D2 coaches',
            };

            return {
              content: JSON.stringify(routeDecision),
              parsedOutput: routeDecision,
              toolCalls: [],
              model: 'anthropic/claude-haiku-4-5',
              usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
              latencyMs: 200,
              costUsd: 0.0001,
              finishReason: 'stop',
            };
          }

          const plan = {
            resultType: 'execution',
            summary: 'Recruiting task.',
            estimatedSteps: 1,
            tasks: [
              {
                id: '1',
                assignedAgent: 'recruiting_coordinator',
                description: 'Send emails',
                dependsOn: [],
              },
            ],
            clarificationQuestion: null,
            clarificationContext: null,
          };

          return {
            content: JSON.stringify(plan),
            parsedOutput: plan,
            toolCalls: [],
            model: 'anthropic/claude-haiku-4-5',
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            latencyMs: 200,
            costUsd: 0.0001,
            finishReason: 'stop',
          };
        }),
        complete: vi.fn(),
      } as unknown as OpenRouterService;

      const brandMediaAgent = createMockAgent('brand_coordinator');
      (brandMediaAgent.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AgentDelegationException({
          forwardingIntent: 'Send recruiting emails to D2 coaches',
          sourceAgent: 'brand_coordinator',
        })
      );

      const recruitingAgent = createMockAgent('recruiting_coordinator', {
        summary: 'Emails sent to 5 coaches.',
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(brandMediaAgent);
      router.registerAgent(recruitingAgent);

      const updates: AgentJobUpdate[] = [];
      const payload: AgentJobPayload = {
        operationId: 'op-delegation-1',
        userId: 'user-123',
        intent: 'Send emails to coaches',
        agent: 'brand_coordinator' as AgentJobPayload['agent'],
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const result = await router.run(payload, (u) => updates.push(u));

      // Recruiting agent should have handled the re-dispatched request
      expect(recruitingAgent.execute).toHaveBeenCalledTimes(1);
      expect(result.summary).toContain('Emails sent to 5 coaches.');

      // Should have emitted a "transferring" update
      expect(updates.some((u) => u.step?.message?.includes('Transferring'))).toBe(true);
    });

    it('should reroute the task when delegation occurs in DAG execution (Planner path)', async () => {
      const plannerCallCount = { value: 0 };

      llm = {
        prompt: vi.fn().mockImplementation(async (_system, _input, config) => {
          plannerCallCount.value++;

          if (config?.outputSchema?.name === 'classifier_route_decision') {
            const routeDecision = {
              route: 'action',
              reasoning: 'Coordinator execution required',
              requiredContextScopes: [],
              directResponse: null,
              planSummary:
                'Send email to nxt1@nxt1sports.com asking them to check out the platform',
            };

            return {
              content: JSON.stringify(routeDecision),
              parsedOutput: routeDecision,
              toolCalls: [],
              model: 'deepseek/deepseek-v3.2',
              usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
              latencyMs: 200,
              costUsd: 0.0001,
              finishReason: 'stop',
            };
          }

          if (plannerCallCount.value === 2) {
            const initialPlan = {
              resultType: 'execution',
              summary: 'Route to admin.',
              estimatedSteps: 1,
              tasks: [
                {
                  id: '1',
                  assignedAgent: 'admin_coordinator',
                  description:
                    'Send email to nxt1@nxt1sports.com asking them to check out the platform.',
                  dependsOn: [],
                },
              ],
              clarificationQuestion: null,
              clarificationContext: null,
            };

            return {
              content: JSON.stringify(initialPlan),
              parsedOutput: initialPlan,
              toolCalls: [],
              model: 'anthropic/claude-haiku-4-5',
              usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
              latencyMs: 200,
              costUsd: 0.0001,
              finishReason: 'stop',
            };
          }

          const reroutedPlan = {
            resultType: 'execution',
            summary: 'Route to recruiting.',
            estimatedSteps: 1,
            tasks: [
              {
                id: '1',
                assignedAgent: 'recruiting_coordinator',
                description: 'Draft and send the requested email to nxt1@nxt1sports.com.',
                dependsOn: [],
              },
            ],
            clarificationQuestion: null,
            clarificationContext: null,
          };

          return {
            content: JSON.stringify(reroutedPlan),
            parsedOutput: reroutedPlan,
            toolCalls: [],
            model: 'anthropic/claude-haiku-4-5',
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            latencyMs: 200,
            costUsd: 0.0001,
            finishReason: 'stop',
          };
        }),
        complete: vi.fn(),
      } as unknown as OpenRouterService;

      const adminAgent = createMockAgent('admin_coordinator');
      (adminAgent.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new AgentDelegationException({
          forwardingIntent:
            'Send an email to nxt1@nxt1sports.com with a link to nxt1sports.com and a message to check out the platform.',
          sourceAgent: 'admin_coordinator',
        })
      );

      const recruitingAgent = createMockAgent('recruiting_coordinator', {
        summary: 'Email sent successfully.',
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(adminAgent);
      router.registerAgent(recruitingAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-delegation-loop',
        userId: 'user-123',
        intent: 'Send email to nxt1@nxt1sports.com asking them to check out the platform',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('Email sent successfully.');
      expect(adminAgent.execute).toHaveBeenCalledTimes(1);
      expect(recruitingAgent.execute).toHaveBeenCalledTimes(1);
      expect(plannerCallCount.value).toBe(3);
      expect(
        updates.some((u) => u.step?.message?.includes('rerouted to recruiting_coordinator'))
      ).toBe(true);
    });

    it('should include routing hint to avoid same-agent bounce', async () => {
      // Direct-agent path: brand_coordinator delegates, check the intent passed to Planner
      llm = createMockLLM({
        summary: 'After delegation.',
        tasks: [
          {
            id: '1',
            assignedAgent: 'recruiting_coordinator',
            description: 'Handle it',
            dependsOn: [],
          },
        ],
      });

      const brandMediaAgent = createMockAgent('brand_coordinator');
      (brandMediaAgent.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AgentDelegationException({
          forwardingIntent: 'Send emails to coaches',
          sourceAgent: 'brand_coordinator',
        })
      );

      const recruitingAgent = createMockAgent('recruiting_coordinator', {
        summary: 'Done.',
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(brandMediaAgent);
      router.registerAgent(recruitingAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-delegation-hint',
        userId: 'user-123',
        intent: 'Send emails to coaches',
        agent: 'brand_coordinator' as AgentJobPayload['agent'],
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      await router.run(payload);

      // The Planner's prompt() should have received an intent with the routing hint
      expect(llm.prompt).toHaveBeenCalled();
      const promptCalls = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls;
      // Find the call that includes the routing hint (delegation re-dispatch)
      const hasRoutingHint = promptCalls.some(
        (call) =>
          typeof call[1] === 'string' &&
          call[1].includes('brand_coordinator') &&
          call[1].includes('could not handle')
      );
      expect(hasRoutingHint).toBe(true);
    });
  });
});
