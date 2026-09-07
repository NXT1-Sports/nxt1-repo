import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRouter } from '../agent.router.js';
import type { BaseAgent } from '../agents/base.agent.js';
import { RecruitingCoordinatorAgent } from '../agents/recruiting-coordinator.agent.js';
import { PlannerAgent } from '../agents/planner.agent.js';
import { AgentRouterPrimaryService } from '../orchestrator/agent-router-primary.service.js';
import { AgentRouterPlanningService } from '../orchestrator/agent-router-planning.service.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ContextBuilder } from '../memory/context-builder.js';
import { AgentDelegationException } from '../exceptions/agent-delegation.exception.js';
import type { AgentPlanRepository } from '../queue/agent-plan.repository.js';
import type {
  AgentIdentifier,
  AgentJobOrigin,
  AgentJobPayload,
  AgentJobUpdate,
  AgentOperationResult,
  AgentPromptContext,
  AgentSessionContext,
  AgentToolDefinition,
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
    getModelRouting: vi.fn().mockReturnValue({ tier: 'text' }),
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

  /**
   * Wire a transparent Primary that immediately delegates every intent to
   * PrimaryService.runPlan(). This exercises the same planner → execution
   * pipeline the old fallback used while satisfying the new hard invariant
   * that Primary must be wired before router.run() is called.
   */
  function wirePrimary(router: AgentRouter): void {
    const bundle = router.getOrchestratorBundle();
    const planStore = new Map<string, unknown>();
    const planRepository = {
      getLatestRevisableByThread: vi.fn().mockResolvedValue(null),
      createDraft: vi.fn().mockImplementation(async (input) => {
        const draft = {
          planId: input.planId,
          userId: input.userId,
          threadId: input.threadId,
          originOperationId: input.originOperationId,
          version: input.version ?? 1,
          status: input.status ?? 'draft',
          summary: input.summary,
          planHash: input.planHash,
          tasks: input.tasks,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        planStore.set(input.planId, draft);
        return draft;
      }),
      reviseDraft: vi.fn().mockImplementation(async (input) => {
        const revised = {
          ...input.existingPlan,
          originOperationId: input.originOperationId,
          summary: input.summary,
          planHash: input.planHash,
          tasks: input.tasks,
          version: input.existingPlan.version + 1,
          updatedAt: new Date().toISOString(),
        };
        planStore.set(input.existingPlan.planId, revised);
        return revised;
      }),
      getById: vi.fn().mockImplementation(async (planId) => planStore.get(planId) ?? null),
      markExecuting: vi.fn(),
      syncExecutionSnapshot: vi.fn(),
      markTerminal: vi.fn(),
    } as unknown as AgentPlanRepository;
    const service = new AgentRouterPrimaryService({
      ...bundle,
      agents: router.getRegisteredAgents(),
      resolveToolAccessContext: async () =>
        bundle.policyService.buildToolAccessContext(createMockUserContext()),
      planRepository,
    });
    const primary = {
      id: 'router' as const,
      name: 'Test Primary',
      beginRun: vi.fn(),
      endRun: vi.fn(),
      execute: vi
        .fn()
        .mockImplementation(
          async (intent: string, context: AgentSessionContext): Promise<AgentOperationResult> => {
            const dispatchContext = {
              operationId: context.operationId ?? 'test-op',
              userId: context.userId ?? 'user-123',
              enrichedIntent: intent,
              sessionContext: context,
            };

            const planResult = await service.runPlan(intent, dispatchContext);
            const planObservation = (() => {
              try {
                return JSON.parse(planResult.observation) as {
                  approval?: { payload?: { planId?: string } };
                };
              } catch {
                return null;
              }
            })();

            const planId = planObservation?.approval?.payload?.planId;
            const result =
              planResult.success && typeof planId === 'string' && planId.length > 0
                ? await service.runApprovedPlan(planId, dispatchContext)
                : planResult;

            return {
              summary: result.observation,
              suggestions: [],
              ...(result.success ? {} : { data: { operationStatus: 'failed' as const } }),
            };
          }
        ),
    } as unknown as import('../agents/primary.agent.js').PrimaryAgent;
    router.setPrimary(primary, service);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    toolRegistry = createMockToolRegistry();
    contextBuilder = createMockContextBuilder();
    llm = createMockLLM({ tasks: [] });
  });

  describe('run()', () => {
    it('routes explicit coordinator prompt prefixes directly to the selected coordinator', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const brandAgent = createMockAgent('brand_coordinator', {
        summary: 'Created the game day graphic.',
        data: { response: 'Created the game day graphic.' },
        suggestions: [],
      });
      router.registerAgent(brandAgent);

      const bundle = router.getOrchestratorBundle();
      const service = new AgentRouterPrimaryService({
        ...bundle,
        agents: router.getRegisteredAgents(),
        resolveToolAccessContext: async () =>
          bundle.policyService.buildToolAccessContext(createMockUserContext()),
        planRepository: {} as AgentPlanRepository,
      });
      const primary = {
        id: 'router' as const,
        name: 'Test Primary',
        beginRun: vi.fn(),
        endRun: vi.fn(),
        execute: vi.fn(),
      } as unknown as import('../agents/primary.agent.js').PrimaryAgent;
      router.setPrimary(primary, service);

      const result = await router.run({
        operationId: 'op-direct-brand',
        userId: 'user-123',
        sessionId: 'session-123',
        intent: '@brand create a hype graphic for Friday night',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(primary.beginRun).not.toHaveBeenCalled();
      expect(primary.execute).not.toHaveBeenCalled();
      expect(brandAgent.execute).toHaveBeenCalledOnce();
      expect(brandAgent.execute).toHaveBeenCalledWith(
        expect.stringContaining('Objective: create a hype graphic for Friday night'),
        expect.any(Object),
        expect.any(Array),
        llm,
        toolRegistry,
        undefined,
        undefined,
        undefined
      );
      expect((brandAgent.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).not.toContain(
        '@brand'
      );
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        directCoordinatorBypass: true,
        coordinatorId: 'brand_coordinator',
      });
    });

    it('routes selected coordinator card actions directly to the selected coordinator', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const strategyAgent = createMockAgent('strategy_coordinator', {
        summary: 'Built the strategy brief.',
        data: { response: 'Built the strategy brief.' },
        suggestions: [],
      });
      router.registerAgent(strategyAgent);

      const bundle = router.getOrchestratorBundle();
      const service = new AgentRouterPrimaryService({
        ...bundle,
        agents: router.getRegisteredAgents(),
        resolveToolAccessContext: async () =>
          bundle.policyService.buildToolAccessContext(createMockUserContext()),
        planRepository: {} as AgentPlanRepository,
      });
      const primary = {
        id: 'router' as const,
        name: 'Test Primary',
        beginRun: vi.fn(),
        endRun: vi.fn(),
        execute: vi.fn(),
      } as unknown as import('../agents/primary.agent.js').PrimaryAgent;
      router.setPrimary(primary, service);

      const result = await router.run({
        operationId: 'op-selected-strategy',
        userId: 'user-123',
        sessionId: 'session-123',
        intent: 'Build a red-zone game plan',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        context: {
          selectedAction: {
            coordinatorId: 'strategy_coordinator',
            actionId: 'red-zone-plan',
            surface: 'command',
          },
        },
      });

      expect(primary.execute).not.toHaveBeenCalled();
      expect(strategyAgent.execute).toHaveBeenCalledOnce();
      const strategyTaskIntent = (strategyAgent.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as string;
      expect(strategyTaskIntent).toContain('"selectedAction"');
      expect(strategyTaskIntent).toContain('"actionId": "red-zone-plan"');
      expect(strategyTaskIntent).toContain('"surface": "command"');
      expect(result.data).toMatchObject({
        directCoordinatorBypass: true,
        coordinatorId: 'strategy_coordinator',
      });
    });

    it('force-exposes open_live_view for pure browser-open Hudl prompts', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const openLiveViewDefinition: AgentToolDefinition = {
        name: 'open_live_view',
        description: 'Open live browser session',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        allowedAgents: ['*'],
        isMutation: false,
        category: 'system',
        entityGroup: 'platform_tools',
      };

      (toolRegistry.getDefinitions as ReturnType<typeof vi.fn>).mockReturnValue([
        openLiveViewDefinition,
      ]);
      (toolRegistry as ToolRegistry & { matchDiscoverableWithScores: ReturnType<typeof vi.fn> })
        .matchDiscoverableWithScores = vi.fn().mockResolvedValue([]);

      const primary = {
        id: 'router' as const,
        name: 'Test Primary',
        beginRun: vi.fn(),
        endRun: vi.fn(),
        execute: vi.fn().mockResolvedValue({
          summary: 'Opened Hudl.',
          data: { ok: true },
          suggestions: [],
        }),
      } as unknown as import('../agents/primary.agent.js').PrimaryAgent;
      router.setPrimary(primary, {} as AgentRouterPrimaryService);

      await router.run({
        operationId: 'op-force-open-hudl',
        userId: 'user-123',
        sessionId: 'session-123',
        intent: 'go to hudl',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(primary.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.arrayContaining([expect.objectContaining({ name: 'open_live_view' })]),
        llm,
        toolRegistry,
        undefined,
        undefined,
        undefined
      );
    });

    it('force-exposes universal document retrieval tools for playbook reduction prompts', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const fileDefinitions: AgentToolDefinition[] = [
        {
          name: 'list_universal_team_documents',
          description: 'List team files',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          allowedAgents: ['*'],
          isMutation: false,
          category: 'database',
          entityGroup: 'user_tools',
        },
        {
          name: 'get_universal_team_document',
          description: 'Open a team file',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          allowedAgents: ['*'],
          isMutation: false,
          category: 'database',
          entityGroup: 'user_tools',
        },
      ];

      (toolRegistry.getDefinitions as ReturnType<typeof vi.fn>).mockReturnValue(fileDefinitions);
      (toolRegistry as ToolRegistry & { matchDiscoverableWithScores: ReturnType<typeof vi.fn> })
        .matchDiscoverableWithScores = vi.fn().mockResolvedValue([]);

      const primary = {
        id: 'router' as const,
        name: 'Test Primary',
        beginRun: vi.fn(),
        endRun: vi.fn(),
        execute: vi.fn().mockResolvedValue({
          summary: 'Reduced the playbook.',
          data: { ok: true },
          suggestions: [],
        }),
      } as unknown as import('../agents/primary.agent.js').PrimaryAgent;
      router.setPrimary(primary, {} as AgentRouterPrimaryService);

      await router.run({
        operationId: 'op-force-playbook-file',
        userId: 'user-123',
        sessionId: 'session-123',
        intent: 'Reduce the playbook to the highest-impact concepts.',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(primary.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({ name: 'list_universal_team_documents' }),
          expect.objectContaining({ name: 'get_universal_team_document' }),
        ]),
        llm,
        toolRegistry,
        undefined,
        undefined,
        undefined
      );
    });

    it('force-exposes film review read tools for selected film breakdown prompts', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const filmDefinitions: AgentToolDefinition[] = [
        {
          name: 'get_film_review',
          description: 'Load a film review',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          allowedAgents: ['*'],
          isMutation: false,
          category: 'database',
          entityGroup: 'user_tools',
        },
        {
          name: 'list_film_review_sources',
          description: 'List film review sources',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          allowedAgents: ['*'],
          isMutation: false,
          category: 'database',
          entityGroup: 'user_tools',
        },
        {
          name: 'get_film_review_source_breakdown',
          description: 'Get source breakdown rows',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          allowedAgents: ['*'],
          isMutation: false,
          category: 'database',
          entityGroup: 'user_tools',
        },
        {
          name: 'execute_sandbox_script',
          description: 'Analyze film review data',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          allowedAgents: ['*'],
          isMutation: false,
          category: 'system',
          entityGroup: 'user_tools',
        },
      ];

      (toolRegistry.getDefinitions as ReturnType<typeof vi.fn>).mockReturnValue(filmDefinitions);
      (toolRegistry as ToolRegistry & { matchDiscoverableWithScores: ReturnType<typeof vi.fn> })
        .matchDiscoverableWithScores = vi.fn().mockResolvedValue([]);

      const primary = {
        id: 'router' as const,
        name: 'Test Primary',
        beginRun: vi.fn(),
        endRun: vi.fn(),
        execute: vi.fn().mockResolvedValue({
          summary: 'Analyzed the selected film breakdown.',
          data: { ok: true },
          suggestions: [],
        }),
      } as unknown as import('../agents/primary.agent.js').PrimaryAgent;
      router.setPrimary(primary, {} as AgentRouterPrimaryService);

      await router.run({
        operationId: 'op-force-film-review-read',
        userId: 'user-123',
        sessionId: 'session-123',
        intent: 'Analyze this breakdown and identify the biggest trends and tendencies for these 50 selected film plays.',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(primary.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({ name: 'get_film_review' }),
          expect.objectContaining({ name: 'list_film_review_sources' }),
          expect.objectContaining({ name: 'get_film_review_source_breakdown' }),
          expect.objectContaining({ name: 'execute_sandbox_script' }),
        ]),
        llm,
        toolRegistry,
        undefined,
        undefined,
        undefined
      );
    });

    it('force-exposes film review read tools from selected context even when the raw prompt is generic', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const filmDefinitions: AgentToolDefinition[] = [
        {
          name: 'get_film_review',
          description: 'Load a film review',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          allowedAgents: ['*'],
          isMutation: false,
          category: 'database',
          entityGroup: 'user_tools',
        },
        {
          name: 'list_film_review_sources',
          description: 'List film review sources',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          allowedAgents: ['*'],
          isMutation: false,
          category: 'database',
          entityGroup: 'user_tools',
        },
      ];

      (toolRegistry.getDefinitions as ReturnType<typeof vi.fn>).mockReturnValue(filmDefinitions);
      (toolRegistry as ToolRegistry & { matchDiscoverableWithScores: ReturnType<typeof vi.fn> })
        .matchDiscoverableWithScores = vi.fn().mockResolvedValue([]);

      const primary = {
        id: 'router' as const,
        name: 'Test Primary',
        beginRun: vi.fn(),
        endRun: vi.fn(),
        execute: vi.fn().mockResolvedValue({
          summary: 'Analyzed the selected film breakdown.',
          data: { ok: true },
          suggestions: [],
        }),
      } as unknown as import('../agents/primary.agent.js').PrimaryAgent;
      router.setPrimary(primary, {} as AgentRouterPrimaryService);

      await router.run({
        operationId: 'op-force-film-from-selected-context',
        userId: 'user-123',
        sessionId: 'session-123',
        intent: 'Analyze this breakdown and identify the biggest trends and tendencies.',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        context: {
          selectedContexts: [
            {
              id: 'film_play:film_review:b069f6aba08135482001093d226f2e25110470e1:bundle',
              kind: 'film_play',
              title: 'NXT1 Full Game (Wk 2) (50 selected film plays)',
              source: {
                type: 'film_review',
                id: 'b069f6aba08135482001093d226f2e25110470e1',
                label: 'NXT1 Full Game (Wk 2)',
              },
            },
          ],
        },
      } as AgentJobPayload);

      expect(primary.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({ name: 'get_film_review' }),
          expect.objectContaining({ name: 'list_film_review_sources' }),
        ]),
        llm,
        toolRegistry,
        undefined,
        undefined,
        undefined
      );
    });

    it('forwards plan executionMode into Primary session context on initial runs', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const primary = {
        id: 'router' as const,
        name: 'Test Primary',
        beginRun: vi.fn(),
        endRun: vi.fn(),
        execute: vi.fn().mockResolvedValue({
          summary: 'Planned successfully.',
          data: { ok: true },
          suggestions: [],
        }),
      } as unknown as import('../agents/primary.agent.js').PrimaryAgent;

      router.setPrimary(primary, {} as AgentRouterPrimaryService);

      await router.run({
        operationId: 'op-plan-mode',
        userId: 'user-123',
        intent: 'Create a highlight video',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        context: {
          executionMode: 'plan',
        },
      });

      expect(primary.beginRun).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionContext: expect.objectContaining({ executionMode: 'plan' }),
        })
      );
      expect(primary.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ executionMode: 'plan' }),
        expect.any(Array),
        llm,
        toolRegistry,
        undefined,
        undefined,
        undefined
      );
    });

    it('keeps plan mode on Primary even when a coordinator is preselected', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const brandAgent = createMockAgent('brand_coordinator');
      router.registerAgent(brandAgent);
      const primary = {
        id: 'router' as const,
        name: 'Test Primary',
        beginRun: vi.fn(),
        endRun: vi.fn(),
        execute: vi.fn().mockResolvedValue({
          summary: 'Planned successfully.',
          data: { ok: true },
          suggestions: [],
        }),
      } as unknown as import('../agents/primary.agent.js').PrimaryAgent;

      router.setPrimary(primary, {} as AgentRouterPrimaryService);

      await router.run({
        operationId: 'op-plan-selected-agent',
        userId: 'user-123',
        sessionId: 'session-123',
        intent: '@brand create a hype graphic',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
        agent: 'brand_coordinator',
        context: {
          executionMode: 'plan',
        },
      });

      expect(primary.beginRun).toHaveBeenCalledOnce();
      expect(primary.execute).toHaveBeenCalledOnce();
      expect(brandAgent.execute).not.toHaveBeenCalled();
    });

    it('blocks email send requests before Primary routing when no provider is connected', async () => {
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const streamEvents: Array<{ type: string; cardData?: { type?: string; title?: string } }> =
        [];

      const result = await router.run(
        {
          operationId: 'op-email-provider-required',
          userId: 'user-123',
          intent:
            'send email to john@nxt1sports.com & ray@nxt1sports.com telling them check out nxt 1',
          origin: TEST_ORIGIN,
          priority: 'normal',
          createdAt: new Date().toISOString(),
        },
        undefined,
        undefined,
        (event) => streamEvents.push(event)
      );

      expect(result.summary).toBe(
        'To send emails through Agent X, please connect your Gmail or Outlook account first in Settings -> Email.'
      );
      expect(streamEvents).toContainEqual(
        expect.objectContaining({
          type: 'card',
          cardData: expect.objectContaining({
            type: 'connect-account',
            title: 'Email Account Required',
          }),
        })
      );
    });

    it('passes existing draft context into planning before revising the saved plan', async () => {
      llm = createMockLLM({
        summary: 'Updated plan scoped to D1 only.',
        tasks: [
          {
            id: '1',
            assignedAgent: 'recruiting_coordinator',
            displayLabel: 'Build D1 target list',
            description: 'Compile D1-only college targets for each athlete.',
            dependsOn: [],
          },
        ],
      });

      const planningService = new AgentRouterPlanningService(llm, toolRegistry);
      const planner = new PlannerAgent(llm);
      const existingDraft = {
        planId: 'plan_existing',
        userId: 'user-123',
        threadId: 'thread-123',
        originOperationId: 'op-old',
        version: 3,
        status: 'draft' as const,
        summary: 'Original multi-division outreach plan.',
        planHash: 'hash-old',
        tasks: [
          {
            id: 'old-1',
            assignedAgent: 'recruiting_coordinator' as const,
            displayLabel: 'Build target lists',
            description: 'Compile D1, D2, and D3 target programs.',
            dependsOn: [],
            status: 'pending' as const,
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const planRepository = {
        getLatestRevisableByThread: vi.fn().mockResolvedValue(existingDraft),
        reviseDraft: vi
          .fn()
          .mockImplementation(
            async ({ existingPlan, originOperationId, summary, planHash, tasks }) => ({
              ...existingPlan,
              originOperationId,
              version: existingPlan.version + 1,
              summary,
              planHash,
              tasks,
              status: 'draft' as const,
              updatedAt: new Date().toISOString(),
            })
          ),
        createDraft: vi.fn(),
      } as unknown as AgentPlanRepository;

      const service = new AgentRouterPrimaryService({
        executionService: {} as never,
        contextService: {} as never,
        policyService: {} as never,
        planningService,
        planner,
        agents: new Map(),
        resolveToolAccessContext: async () => ({}) as never,
        planRepository,
      });

      const result = await service.runPlan('Scope the outreach to Division 1 only.', {
        operationId: 'op-new',
        userId: 'user-123',
        enrichedIntent: 'Scope the outreach to Division 1 only.',
        sessionContext: {
          sessionId: 'session-123',
          userId: 'user-123',
          threadId: 'thread-123',
          operationId: 'op-new',
          conversationHistory: [],
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        },
      });

      const plannerCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(plannerCall?.[1]).toContain('[Plan Revision Context]');
      expect(plannerCall?.[1]).toContain('Original multi-division outreach plan.');

      const observation = JSON.parse(result.observation) as Record<string, unknown>;
      expect(observation['plan_created']).toBe(false);
      expect(observation['plan_revised']).toBe(true);
      expect(observation['plan_id']).toBe('plan_existing');
      expect(observation['plan_version']).toBe(4);
      expect(planRepository.reviseDraft).toHaveBeenCalledTimes(1);
      expect(planRepository.createDraft).not.toHaveBeenCalled();
    });

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
      wirePrimary(router);

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
      expect(result.summary).toContain('## execute_saved_plan dispatch result');
      expect(result.summary).toContain('Analyze highlight tape');
      // Finalization no longer emits acting in this flow; verify updates were emitted.
      expect(updates.length).toBeGreaterThan(0);
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
      wirePrimary(router);

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
      wirePrimary(router);

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
      wirePrimary(router);

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

      expect(result.summary).toContain('LLM timeout');
      expect(result.data).toMatchObject({ operationStatus: 'failed' });
      // 'failed' final status came from finalizationService (removed). Verify error result returned.
      expect(result.summary).toBeDefined();
    });

    it('should return clarification when planner produces no tasks', async () => {
      llm = createMockLLM({
        summary: 'Need clarification before planning.',
        tasks: [],
        clarificationQuestion: 'Which coaches should I email?',
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      wirePrimary(router);
      const result = await router.run({
        operationId: 'op-005',
        userId: 'user-123',
        intent: 'something impossible',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(result.summary).toContain('no tasks');
      expect(result.data).toMatchObject({ operationStatus: 'failed' });
      expect(result.suggestions).toEqual([]);
    });

    it('should fail when planner assigns a non-routable agent', async () => {
      llm = createMockLLM({
        tasks: [{ id: '1', assignedAgent: 'nonexistent', description: 'test', dependsOn: [] }],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      wirePrimary(router);
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

      expect(result.summary).toBeDefined();
      expect(result.data).toMatchObject({ operationStatus: 'failed' });
    });

    it('should prepend user profile to intent before planning', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(createMockAgent('strategy_coordinator'));
      wirePrimary(router);

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
      wirePrimary(router);

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
      wirePrimary(router);

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
      expect(statuses.length).toBeGreaterThan(0);
    });
  });

  describe('primary team handoff safeguards', () => {
    it('fills in missing teamCode on coordinator dispatch from active team context', async () => {
      const executionService = {
        executePlan: vi.fn().mockResolvedValue({
          taskResults: new Map([
            [
              'data_coordinator_1',
              {
                summary: 'Roster sync queued.',
              },
            ],
          ]),
          mutableTasks: [
            {
              id: 'data_coordinator_1',
              status: 'completed',
              description: 'Write the team roster',
            },
          ],
        }),
      };

      const service = new AgentRouterPrimaryService({
        executionService: executionService as never,
        contextService: {
          buildTaskIntent: vi.fn().mockReturnValue('Objective: write the team roster'),
        } as never,
        policyService: {
          rerouteDelegatedTask: vi.fn(),
        } as never,
        planningService: {} as never,
        planner: {} as never,
        agents: new Map(),
        resolveUserContext: async () =>
          ({
            userId: 'coach-1',
            displayName: 'Coach Test',
            role: 'coach',
            teamId: 'team-1',
            teamCode: 'TEAM123',
          }) as AgentUserContext,
        resolveToolAccessContext: async () => ({
          userId: 'coach-1',
          role: 'coach',
          teamId: 'team-1',
          allowedEntityGroups: ['platform_tools', 'system_tools', 'team_tools', 'user_tools'],
        }),
        planRepository: {} as never,
      });

      await service.runCoordinator(
        'data_coordinator',
        'Write the team roster from the latest source.',
        {
          operationId: 'op-team-handoff',
          userId: 'coach-1',
          enrichedIntent: 'Write the team roster from the latest source.',
          sessionContext: {
            sessionId: 'session-1',
            userId: 'coach-1',
            operationId: 'op-team-handoff',
            conversationHistory: [],
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          },
        },
        { sourceUrl: 'https://www.maxpreps.com/roster' }
      );

      expect(executionService.executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: {
            tasks: [
              expect.objectContaining({
                structuredPayload: expect.objectContaining({
                  sourceUrl: 'https://www.maxpreps.com/roster',
                  teamId: 'team-1',
                  teamCode: 'TEAM123',
                }),
              }),
            ],
          },
        })
      );
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
      (toolRegistry as ToolRegistry & { match: ReturnType<typeof vi.fn> }).match = vi
        .fn()
        .mockResolvedValue([
          { name: 'search_colleges', description: 'Search colleges', category: 'database' },
          {
            name: 'unassigned_internal_tool',
            description: 'Should not count as matched capability evidence',
            category: 'integration',
          },
        ]);

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
                matchedToolNames: string[];
              }>;
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
      expect(recruitingSnapshot?.allowedToolNames).not.toContain('unassigned_internal_tool');
      expect(recruitingSnapshot?.matchedToolNames).toContain('search_colleges');
      expect(recruitingSnapshot?.matchedToolNames).not.toContain('unassigned_internal_tool');
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
      wirePrimary(router);

      const result = await router.run({
        operationId: 'op-010',
        userId: 'user-123',
        intent: 'test',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      });

      expect(result.summary).toContain('## execute_saved_plan dispatch result');
      expect(result.summary).toContain('- ✅ `1`: test');
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
            model: 'openai/gpt-chat-latest',
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

      contextBuilder = createMockContextBuilder({
        ...createMockUserContext(),
        connectedAccounts: [
          {
            provider: 'gmail',
            email: 'sender@gmail.com',
            isTokenValid: true,
          },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(adminAgent);
      router.registerAgent(recruitingAgent);
      wirePrimary(router);

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

      expect(result.summary).toContain('## execute_saved_plan dispatch result');
      expect(result.summary).toContain(
        'Draft and send the requested email to nxt1@nxt1sports.com.'
      );
      expect(adminAgent.execute).toHaveBeenCalledTimes(1);
      expect(recruitingAgent.execute).toHaveBeenCalledTimes(1);
      expect(plannerCallCount).toBe(2);
      // Reroute message comes from executionService via onUpdate → no longer
      // wired through the Primary dispatch path. Verify via observable result instead.
    });
  });
});
