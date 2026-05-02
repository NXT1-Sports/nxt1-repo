import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRouter } from '../agent.router.js';
import type { BaseAgent } from '../agents/base.agent.js';
import { RecruitingCoordinatorAgent } from '../agents/recruiting-coordinator.agent.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ContextBuilder } from '../memory/context-builder.js';
import { AgentDelegationException } from '../exceptions/agent-delegation.exception.js';
import type {
  AgentIdentifier,
  AgentJobOrigin,
  AgentJobPayload,
  AgentJobUpdate,
  AgentOperationResult,
  AgentPromptContext,
  AgentUserContext,
} from '@nxt1/core';

const TEST_ORIGIN: AgentJobOrigin = 'user';

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

function createMockLLM(planJson: {
  summary?: string;
  estimatedSteps?: number;
  tasks?: unknown[];
  resultType?: 'execution' | 'clarification';
  clarificationQuestion?: string | null;
  clarificationContext?: string | null;
}): OpenRouterService {
  const strictPlannerResponse =
    Array.isArray(planJson.tasks) && planJson.tasks.length > 0
      ? {
          resultType: planJson.resultType ?? 'execution',
          summary: planJson.summary ?? 'Created execution plan.',
          estimatedSteps: planJson.estimatedSteps ?? planJson.tasks.length,
          tasks: planJson.tasks,
          clarificationQuestion: null,
          clarificationContext: null,
        }
      : {
          resultType: 'clarification' as const,
          summary: planJson.summary ?? 'Need clarification before planning.',
          estimatedSteps: 0,
          tasks: [],
          clarificationQuestion:
            planJson.clarificationQuestion ?? 'Can you clarify what you want me to do?',
          clarificationContext: planJson.clarificationContext ?? null,
        };

  return {
    prompt: vi.fn().mockResolvedValue({
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
    llm = createMockLLM({ tasks: [] });
  });

  describe('run()', () => {
    it('should resume yielded approval jobs via resumeExecution and forward approvalId', async () => {
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

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(
        {
          operationId: 'op-001',
          userId: 'user-123',
          intent: 'Grade my highlight tape',
          origin: TEST_ORIGIN,
          priority: 'normal',
          createdAt: new Date().toISOString(),
        },
        (u) => updates.push(u)
      );

      expect(performanceAgent.execute).toHaveBeenCalledTimes(1);
      expect(result.summary).toContain('Tape graded: B+ overall.');
      expect(result.suggestions).toContain('Upload more recent footage.');
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

      await router.run({
        operationId: 'op-002',
        userId: 'user-123',
        intent: 'Grade tape and email coaches',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

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

      await router.run({
        operationId: 'op-003',
        userId: 'user-123',
        intent: 'Grade and email',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

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

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(
        {
          operationId: 'op-004',
          userId: 'user-123',
          intent: 'Grade tape',
          origin: TEST_ORIGIN,
          priority: 'normal',
          createdAt: new Date().toISOString(),
        },
        (u) => updates.push(u)
      );

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
      expect(updates.some((u) => u.status === 'failed')).toBe(true);
    });

    it('should return clarification when planner produces no tasks', async () => {
      llm = createMockLLM({
        summary: 'Need clarification before planning.',
        tasks: [],
        clarificationQuestion: 'Which coaches should I email?',
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const result = await router.run({
        operationId: 'op-005',
        userId: 'user-123',
        intent: 'something impossible',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(result.summary).toBe('Which coaches should I email?');
      expect(result.data?.['clarificationQuestion']).toBe('Which coaches should I email?');
      expect(result.suggestions).toEqual([]);
    });

    it('should fail when planner assigns a non-routable agent', async () => {
      llm = createMockLLM({
        tasks: [{ id: '1', assignedAgent: 'nonexistent', description: 'test', dependsOn: [] }],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const updates: AgentJobUpdate[] = [];
      const result = await router.run(
        {
          operationId: 'op-006',
          userId: 'user-123',
          intent: 'test',
          origin: TEST_ORIGIN,
          priority: 'normal',
          createdAt: new Date().toISOString(),
        },
        (u) => updates.push(u)
      );

      expect(result.summary).toContain('Planner assigned non-routable agents');
      expect(updates.some((u) => u.status === 'failed')).toBe(true);
    });

    it('should prepend user profile to intent before planning', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));

      await router.run({
        operationId: 'op-007',
        userId: 'user-123',
        intent: 'Help me improve my stats',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      const planningCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[0];
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

      await router.run({
        operationId: 'op-capability-snapshot',
        userId: 'user-123',
        intent: 'Build a weekly recruiting strategy',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      const planningCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[0];
      const planningIntent = planningCall[1] as string;
      expect(planningIntent).toContain('[Coordinator Capability Snapshot]');
      expect(planningIntent).toContain('schemaVersion: 1');
      expect(planningIntent).toContain('strategy_coordinator');
    });

    it('should emit structured updates with operationId and timestamps', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const generalAgent = createMockAgent('strategy_coordinator');
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(generalAgent);

      const updates: AgentJobUpdate[] = [];
      await router.run(
        {
          operationId: 'op-008',
          userId: 'user-123',
          intent: 'test',
          origin: TEST_ORIGIN,
          priority: 'normal',
          createdAt: new Date().toISOString(),
        },
        (u) => updates.push(u)
      );

      for (const update of updates) {
        expect(update.operationId).toBe('op-008');
        expect(update.step?.timestamp).toBeDefined();
        expect(update.step?.id).toBeDefined();
      }

      const statuses = updates.map((u) => u.status);
      expect(statuses).toContain('thinking');
      expect(statuses).toContain('acting');
      expect(statuses).toContain('completed');
    });
  });

  describe('context enrichment', () => {
    it('should keep capability snapshot aligned with policy-filtered tool exposure', async () => {
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
            { name: 'search_colleges', description: 'Search colleges', category: 'database' },
            { name: 'query_gmail_emails', description: 'Query Gmail', category: 'integration' },
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
              coordinators: Array<{ agentId: string; allowedToolNames: string[] }>;
            }>;
          };
          getRegisteredAgents: () => ReadonlyMap<AgentIdentifier, BaseAgent>;
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

      const result = await router.run({
        operationId: 'op-010',
        userId: 'user-123',
        intent: 'test',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(result.summary).toContain('Performance review done.');
      expect(performanceAgent.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('delegation handoff', () => {
    it('should reroute the task when delegation occurs in DAG execution (Planner path)', async () => {
      let plannerCallCount = 0;
      llm = {
        prompt: vi.fn().mockImplementation(async () => {
          plannerCallCount += 1;
          const plan =
            plannerCallCount === 1
              ? {
                  resultType: 'execution' as const,
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
                }
              : {
                  resultType: 'execution' as const,
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
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
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

      const updates: AgentJobUpdate[] = [];
      const result = await router.run(
        {
          operationId: 'op-delegation-loop',
          userId: 'user-123',
          intent: 'Send email to nxt1@nxt1sports.com asking them to check out the platform',
          origin: TEST_ORIGIN,
          priority: 'normal',
          createdAt: new Date().toISOString(),
        },
        (u) => updates.push(u)
      );

      expect(result.summary).toContain('Email sent successfully.');
      expect(adminAgent.execute).toHaveBeenCalledTimes(1);
      expect(recruitingAgent.execute).toHaveBeenCalledTimes(1);
      expect(plannerCallCount).toBe(2);
      expect(
        updates.some((u) => u.step?.message?.includes('rerouted to recruiting_coordinator'))
      ).toBe(true);
    });
  });
});
