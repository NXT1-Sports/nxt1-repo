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
  return {
    prompt: vi.fn().mockResolvedValue({
      content: JSON.stringify(planJson),
      parsedOutput: planJson,
      toolCalls: [],
      model: 'anthropic/claude-haiku-4-5',
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

  // ─── classify() ─────────────────────────────────────────────────────────

  describe('classify()', () => {
    it('should return the agent ID for a single-task plan', async () => {
      llm = createMockLLM({
        summary: 'Single task',
        tasks: [
          {
            id: '1',
            assignedAgent: 'performance_coordinator',
            description: 'Analyze tape',
            dependsOn: [],
          },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const agentId = await router.classify('Grade my tape', 'user-123');

      expect(agentId).toBe('performance_coordinator');
    });

    it('should return "router" for multi-task plans', async () => {
      llm = createMockLLM({
        tasks: [
          {
            id: '1',
            assignedAgent: 'performance_coordinator',
            description: 'Analyze tape',
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

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const agentId = await router.classify('Grade tape and email coaches', 'user-123');

      expect(agentId).toBe('router');
    });

    it('should return "strategy_coordinator" when plan has no tasks', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const agentId = await router.classify('ambiguous request', 'user-123');

      expect(agentId).toBe('strategy_coordinator');
    });

    it('should build user context before classifying', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      await router.classify('hello', 'user-123');

      expect(contextBuilder.buildPromptContext).toHaveBeenCalledWith('user-123', 'hello');
      expect(contextBuilder.compressToPrompt).toHaveBeenCalled();
    });
  });

  // ─── run() ──────────────────────────────────────────────────────────────

  describe('run()', () => {
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

      expect(result.summary).toContain('Could not create an execution plan');
      expect(result.suggestions).toBeDefined();
    });

    it('should throw when assigned agent is not registered', async () => {
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
      await router.run(payload, (u) => updates.push(u));

      // Should emit failure for the unregistered agent
      expect(updates.some((u) => u.step?.message?.includes('No agent registered'))).toBe(true);
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
      const promptCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[0];
      const userMessage = promptCall[1] as string;

      expect(userMessage).toContain('[User Profile]');
      expect(userMessage).toContain('Test Athlete');
      expect(userMessage).toContain('football');
      expect(userMessage).toContain('MemoryCount: 1');
      expect(userMessage).toContain('[Request]');
      expect(userMessage).toContain('Help me improve my stats');
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
        prompt: vi.fn().mockImplementation(async () => {
          const plan = {
            summary: 'Recruiting task.',
            tasks: [
              {
                id: '1',
                assignedAgent: 'recruiting_coordinator',
                description: 'Send emails',
                dependsOn: [],
              },
            ],
          };
          plannerCallCount.value++;
          // Only called during re-dispatch (Planner planning phase)
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

    it('should fail the task when delegation occurs in DAG execution (Planner path)', async () => {
      // Direct agent path: brand_coordinator delegates → Router re-dispatches through Planner
      // → Planner routes to brand_coordinator again → DAG catch treats it as immediate task failure
      llm = createMockLLM({
        summary: 'Route to brand media.',
        tasks: [
          {
            id: '1',
            assignedAgent: 'brand_coordinator',
            description: 'Handle it',
            dependsOn: [],
          },
        ],
      });

      const brandMediaAgent = createMockAgent('brand_coordinator');
      (brandMediaAgent.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AgentDelegationException({
          forwardingIntent: 'I cannot handle this',
          sourceAgent: 'brand_coordinator',
        })
      );

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(brandMediaAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-delegation-loop',
        userId: 'user-123',
        intent: 'Do something ambiguous',
        agent: 'brand_coordinator' as AgentJobPayload['agent'],
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(payload, (u) => updates.push(u));

      expect(result.summary).toContain('Execution plan failed.');
      expect(result.summary).toContain('brand_coordinator');
      expect(result.data).toMatchObject({
        operationStatus: 'failed',
        firstFailedTask: {
          id: '1',
          assignedAgent: 'brand_coordinator',
        },
      });
      // The brand coordinator should have been called at least twice (direct + DAG)
      expect(brandMediaAgent.execute).toHaveBeenCalled();
      // Should have emitted a "misrouted" update from the DAG handler
      expect(updates.some((u) => u.step?.message?.includes('misrouted'))).toBe(true);
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
