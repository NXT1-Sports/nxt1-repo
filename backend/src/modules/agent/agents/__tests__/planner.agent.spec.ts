import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlannerAgent } from '../planner.agent.js';
import type { AgentSessionContext } from '@nxt1/core';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { LLMCompletionResult } from '../../llm/llm.types.js';

function createStrictPlannerResponse(
  overrides?: Partial<Record<string, unknown>>
): LLMCompletionResult {
  const parsedOutput = {
    resultType: 'execution',
    summary: 'Created execution plan.',
    estimatedSteps: 1,
    clarificationQuestion: null,
    clarificationContext: null,
    tasks: [
      {
        id: '1',
        assignedAgent: 'strategy_coordinator',
        description: 'Handle request',
        dependsOn: [],
      },
    ],
    ...(overrides ?? {}),
  };

  return {
    content: JSON.stringify(parsedOutput),
    parsedOutput,
    toolCalls: [],
    model: 'anthropic/claude-sonnet-4-5',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    latencyMs: 200,
    costUsd: 0.0001,
    finishReason: 'stop',
  } as LLMCompletionResult;
}

function createMockLLM(result: LLMCompletionResult): OpenRouterService {
  return {
    prompt: vi.fn().mockResolvedValue(result),
    complete: vi.fn(),
    completeStream: vi.fn(),
  } as unknown as OpenRouterService;
}

function createMockContext(overrides?: Partial<AgentSessionContext>): AgentSessionContext {
  const now = new Date().toISOString();
  return {
    sessionId: 'test-session-001',
    userId: 'user-123',
    conversationHistory: [],
    createdAt: now,
    lastActiveAt: now,
    ...overrides,
  };
}

describe('PlannerAgent', () => {
  let context: AgentSessionContext;

  beforeEach(() => {
    context = createMockContext();
  });

  it('parses a valid single-task execution plan', async () => {
    const llm = createMockLLM(
      createStrictPlannerResponse({
        summary: 'Analyze the highlight tape.',
        estimatedSteps: 1,
        tasks: [
          {
            id: '1',
            assignedAgent: 'performance_coordinator',
            description: 'Analyze and grade the uploaded highlight tape.',
            dependsOn: [],
          },
        ],
      })
    );
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('Grade my highlight tape', context, []);

    expect(result.summary).toBe('Analyze the highlight tape.');
    const plan = result.data?.['plan'] as { tasks: Array<{ assignedAgent: string }> };
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]?.assignedAgent).toBe('performance_coordinator');
  });

  it('parses multi-task plans with dependencies', async () => {
    const llm = createMockLLM(
      createStrictPlannerResponse({
        summary: 'Grade tape, then email coaches.',
        estimatedSteps: 2,
        tasks: [
          {
            id: '1',
            assignedAgent: 'performance_coordinator',
            description: 'Analyze and grade the highlight tape.',
            dependsOn: [],
          },
          {
            id: '2',
            assignedAgent: 'recruiting_coordinator',
            description: 'Draft emails to D3 coaches in Ohio using the grade report.',
            dependsOn: ['1'],
          },
        ],
      })
    );
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('Grade my tape and email D3 coaches in Ohio', context, []);

    const plan = result.data?.['plan'] as { tasks: Array<{ id: string; dependsOn: string[] }> };
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[1]?.dependsOn).toEqual(['1']);
    expect(result.data?.['estimatedSteps']).toBe(2);
  });

  it('resolves capability snapshot before strict planning and injects it into the prompt', async () => {
    const llm = createMockLLM(createStrictPlannerResponse());
    const planner = new PlannerAgent(llm);
    const ordering: string[] = [];
    const capabilitySnapshotResolver = vi.fn().mockImplementation(async () => {
      ordering.push('snapshot');
      return {
        schemaVersion: 1,
        hash: 'snapshot-hash',
        coordinators: [
          {
            agentId: 'strategy_coordinator',
            allowedToolNames: ['generate_scout_report'],
            allowedEntityGroups: ['platform_tools'],
            matchedToolNames: ['generate_scout_report'],
            staticSkillHints: ['global_knowledge'],
            matchedSkillHints: ['global_knowledge'],
            confidence: {
              matchedToolCount: 1,
              allowedToolCount: 1,
              toolCoverageRatio: 1,
              matchedSkillCount: 1,
              staticSkillCount: 1,
              skillCoverageRatio: 1,
            },
          },
        ],
      };
    });

    await planner.execute('Build a scouting workflow', context, [], undefined, {
      capabilitySnapshotResolver,
    });

    expect(ordering).toEqual(['snapshot']);
    const plannerCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(plannerCall[1]).toContain('[Coordinator Capability Snapshot]');
    expect(plannerCall[1]).toContain('snapshot-hash');
    expect(plannerCall[2].outputSchema.name).toBe('planner_execution_plan');
  });

  it('returns clarification data when the planner requests missing input', async () => {
    const llm = createMockLLM(
      createStrictPlannerResponse({
        resultType: 'clarification',
        summary: 'Need clarification before planning.',
        estimatedSteps: 0,
        clarificationQuestion: 'Which coaches should I email?',
        clarificationContext: 'Missing recipients.',
        tasks: [],
      })
    );
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('Email coaches', context, []);

    expect(result.summary).toBe('Need clarification before planning.');
    expect(result.data?.['clarificationQuestion']).toBe('Which coaches should I email?');
    const plan = result.data?.['plan'] as { tasks: unknown[] };
    expect(plan.tasks).toEqual([]);
  });

  it('throws when the planner returns no structured output', async () => {
    const llm = createMockLLM({
      ...createStrictPlannerResponse(),
      parsedOutput: undefined,
    });
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('Do something', context, [])).rejects.toThrow(
      'Planner LLM response failed schema validation'
    );
  });

  it('throws when the planner assigns a non-routable agent', async () => {
    const llm = createMockLLM(
      createStrictPlannerResponse({
        tasks: [
          {
            id: '1',
            assignedAgent: 'router',
            description: 'Invalid routing target',
            dependsOn: [],
          },
        ],
      })
    );
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('Do something', context, [])).rejects.toThrow(
      'Planner assigned non-routable agents'
    );
  });

  it('throws on circular dependencies', async () => {
    const llm = createMockLLM(
      createStrictPlannerResponse({
        tasks: [
          {
            id: '1',
            assignedAgent: 'strategy_coordinator',
            description: 'First task',
            dependsOn: ['2'],
          },
          {
            id: '2',
            assignedAgent: 'recruiting_coordinator',
            description: 'Second task',
            dependsOn: ['1'],
          },
        ],
      })
    );
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('Do something', context, [])).rejects.toThrow(
      'Circular dependency detected'
    );
  });

  it('includes coordinator catalogue in the strict planner prompt', () => {
    const planner = new PlannerAgent(createMockLLM(createStrictPlannerResponse()));
    const prompt = planner.getSystemPrompt(context);

    expect(prompt).toContain('You are the action planner for Agent X');
    expect(prompt).toContain('strategy_coordinator');
    expect(prompt).toContain('recruiting_coordinator');
  });

  it('defines no tools and uses the routing tier', () => {
    const planner = new PlannerAgent(createMockLLM(createStrictPlannerResponse()));

    expect(planner.getAvailableTools()).toEqual([]);
    expect(planner.getModelRouting()).toMatchObject({ tier: 'routing', maxTokens: 4096 });
  });

  it('returns strict-planning metadata', async () => {
    const llm = createMockLLM(createStrictPlannerResponse());
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('Do something', context, []);
    const metadata = result.data?.['metadata'] as Record<string, unknown>;

    expect(metadata).toMatchObject({
      tier: 'routing',
      executionMode: 'strict_action_planner',
      resultType: 'execution',
    });
    expect(String(metadata['classificationReasoning'])).toContain(
      'legacy tier classification removed'
    );
  });

  it('streams planner thinking immediately when onStreamEvent is provided', async () => {
    const response = createStrictPlannerResponse({
      summary: 'Planned successfully.',
      tasks: [
        {
          id: '1',
          assignedAgent: 'strategy_coordinator',
          description: 'Create recruiting plan.',
          dependsOn: [],
        },
      ],
    });
    const llm = createMockLLM(response);

    (llm.completeStream as ReturnType<typeof vi.fn>).mockImplementation(
      async (_messages, _options, onDelta) => {
        onDelta({ content: '', done: false, thinkingContent: 'Thinking first...' });
        onDelta({ content: '', done: false, thinkingContent: 'Thinking second...' });
        onDelta({ content: '', done: true });
        return {
          content: JSON.stringify(response.parsedOutput),
          model: 'anthropic/claude-sonnet-4-5',
          toolCalls: [],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          finishReason: 'stop',
        };
      }
    );

    const planner = new PlannerAgent(llm);
    const events: string[] = [];
    const result = await planner.execute(
      'Build plan',
      context,
      [],
      undefined,
      undefined,
      undefined,
      (event) => {
        if (event.type === 'thinking' && event.thinkingText) {
          events.push(event.thinkingText);
        }
      }
    );

    expect(llm.completeStream).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['Thinking first...', 'Thinking second...']);
    expect(result.summary).toBe('Planned successfully.');
  });
});
