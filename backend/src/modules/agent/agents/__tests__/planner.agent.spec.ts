/**
 * @fileoverview Planner Agent — Unit Tests
 * @module @nxt1/backend/modules/agent/agents
 *
 * Tests the planner's JSON parsing, DAG validation, and cycle detection
 * by mocking the OpenRouterService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlannerAgent } from '../planner.agent.js';
import type { AgentSessionContext } from '@nxt1/core';
import type { OpenRouterService } from '../../llm/openrouter.service.js';
import type { LLMCompletionResult } from '../../llm/llm.types.js';

// ─── Mock Setup ─────────────────────────────────────────────────────────────

function createMockLLM(resultOverrides?: Partial<LLMCompletionResult>): OpenRouterService {
  const baseResult: LLMCompletionResult = {
    content: JSON.stringify({
      tasks: [
        { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
      ],
    }),
    parsedOutput: {
      tasks: [
        { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
      ],
    },
    toolCalls: [],
    model: 'anthropic/claude-haiku-4-5',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    latencyMs: 200,
    costUsd: 0.0001,
    finishReason: 'stop',
  };

  return {
    prompt: vi.fn().mockResolvedValue({ ...baseResult, ...resultOverrides }),
    complete: vi.fn(),
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

  // ─── Happy Path ─────────────────────────────────────────────────────────

  it('should parse a valid single-task plan', async () => {
    const parsedOutput = {
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
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('Grade my highlight tape', context, []);

    expect(result.summary).toBe('Analyze the highlight tape.');
    expect(result.data).toBeDefined();

    const plan = result.data!['plan'] as { tasks: unknown[] };
    expect(plan.tasks).toHaveLength(1);
  });

  it('should parse a multi-task plan with dependencies', async () => {
    const parsedOutput = {
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
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('Grade my tape and email D3 coaches in Ohio', context, []);

    expect(result.summary).toBe('Grade tape, then email coaches.');
    expect(result.data!['estimatedSteps']).toBe(2);

    const plan = result.data!['plan'] as { tasks: Array<{ id: string; dependsOn: string[] }> };
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[1].dependsOn).toEqual(['1']);
  });

  it('should handle parallel tasks (no dependencies)', async () => {
    const parsedOutput = {
      summary: 'Generate graphic and draft email in parallel.',
      estimatedSteps: 2,
      tasks: [
        {
          id: '1',
          assignedAgent: 'brand_coordinator',
          description: 'Generate promo graphic',
          dependsOn: [],
        },
        {
          id: '2',
          assignedAgent: 'recruiting_coordinator',
          description: 'Draft email to coaches',
          dependsOn: [],
        },
      ],
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    const result = await planner.execute(
      'Make a promo graphic and draft a coach email',
      context,
      []
    );

    const plan = result.data!['plan'] as { tasks: Array<{ dependsOn: string[] }> };
    expect(plan.tasks[0].dependsOn).toEqual([]);
    expect(plan.tasks[1].dependsOn).toEqual([]);
  });

  // ─── LLM Call Verification ──────────────────────────────────────────────

  it('should call LLM with a structured output schema and balanced tier', async () => {
    const llm = createMockLLM();
    const planner = new PlannerAgent(llm);

    await planner.execute('Do something', context, []);

    expect(llm.prompt).toHaveBeenCalledTimes(1);
    const callArgs = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[0];

    // System prompt should mention "Chief of Staff"
    expect(callArgs[0]).toContain('Chief of Staff');

    // User message should be the intent
    expect(callArgs[1]).toBe('Do something');

    // Options should include a structured output schema
    expect(callArgs[2]).toMatchObject({
      tier: 'routing',
    });
    expect(callArgs[2].outputSchema).toBeDefined();
    expect(callArgs[2].outputSchema.name).toBe('planner_execution_plan');
  });

  // ─── Error Handling ─────────────────────────────────────────────────────

  it('should throw when LLM does not return structured output', async () => {
    const llm = createMockLLM({ content: 'Not valid JSON {{{}', parsedOutput: undefined });
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('test', context, [])).rejects.toThrow(
      'Planner LLM returned no structured execution plan'
    );
  });

  it('should throw when LLM returns null content', async () => {
    const llm = {
      prompt: vi.fn().mockResolvedValue({
        content: null,
        parsedOutput: undefined,
        toolCalls: [],
        model: 'anthropic/claude-haiku-4-5',
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
        latencyMs: 100,
        costUsd: 0,
        finishReason: 'stop',
      }),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);

    await expect(planner.execute('test', context, [])).rejects.toThrow(
      'Planner LLM returned no structured execution plan'
    );
  });

  it('should throw when response has no tasks array', async () => {
    const llm = createMockLLM({
      content: JSON.stringify({ summary: 'no tasks here' }),
      parsedOutput: { summary: 'no tasks here' },
    });
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('test', context, [])).rejects.toThrow(
      'failed schema validation at tasks'
    );
  });

  it('should throw when a task is not an object', async () => {
    const llm = createMockLLM({
      content: JSON.stringify({ tasks: ['not-an-object'] }),
      parsedOutput: { tasks: ['not-an-object'] },
    });
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('test', context, [])).rejects.toThrow(
      'failed schema validation at tasks.0'
    );
  });

  // ─── DAG Validation ────────────────────────────────────────────────────

  it('should throw when a task depends on an unknown task ID', async () => {
    const parsedOutput = {
      tasks: [
        {
          id: '1',
          assignedAgent: 'performance_coordinator',
          description: 'Analyze tape',
          dependsOn: ['99'],
        },
      ],
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('test', context, [])).rejects.toThrow(
      'depends on unknown task "99"'
    );
  });

  it('should throw when a task depends on itself', async () => {
    const parsedOutput = {
      tasks: [
        {
          id: '1',
          assignedAgent: 'performance_coordinator',
          description: 'Self loop',
          dependsOn: ['1'],
        },
      ],
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('test', context, [])).rejects.toThrow('cannot depend on itself');
  });

  it('should throw on circular dependency (A→B→A)', async () => {
    const parsedOutput = {
      tasks: [
        {
          id: '1',
          assignedAgent: 'performance_coordinator',
          description: 'Task A',
          dependsOn: ['2'],
        },
        {
          id: '2',
          assignedAgent: 'recruiting_coordinator',
          description: 'Task B',
          dependsOn: ['1'],
        },
      ],
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('test', context, [])).rejects.toThrow(
      'Circular dependency detected'
    );
  });

  it('should throw on 3-node circular dependency (A→B→C→A)', async () => {
    const parsedOutput = {
      tasks: [
        {
          id: '1',
          assignedAgent: 'performance_coordinator',
          description: 'Task A',
          dependsOn: ['3'],
        },
        {
          id: '2',
          assignedAgent: 'recruiting_coordinator',
          description: 'Task B',
          dependsOn: ['1'],
        },
        { id: '3', assignedAgent: 'strategy_coordinator', description: 'Task C', dependsOn: ['2'] },
      ],
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    await expect(planner.execute('test', context, [])).rejects.toThrow(
      'Circular dependency detected'
    );
  });

  // ─── Graceful Coercion ──────────────────────────────────────────────────

  it('should coerce task ID to string if LLM returns a number', async () => {
    const parsedOutput = {
      tasks: [
        {
          id: 1,
          assignedAgent: 'performance_coordinator',
          description: 'Numeric ID',
          dependsOn: [],
        },
      ],
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('test', context, []);
    const plan = result.data!['plan'] as { tasks: Array<{ id: string }> };
    expect(plan.tasks[0].id).toBe('1');
    expect(typeof plan.tasks[0].id).toBe('string');
  });

  it('should default assignedAgent to "strategy_coordinator" if missing', async () => {
    const parsedOutput = {
      tasks: [{ id: '1', description: 'No agent specified', dependsOn: [] }],
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('test', context, []);
    const plan = result.data!['plan'] as { tasks: Array<{ assignedAgent: string }> };
    expect(plan.tasks[0].assignedAgent).toBe('strategy_coordinator');
  });

  it('should provide a default summary when LLM omits it', async () => {
    const llmResponse = JSON.stringify({
      tasks: [
        { id: '1', assignedAgent: 'strategy_coordinator', description: 'do stuff', dependsOn: [] },
      ],
    });

    const llm = createMockLLM(llmResponse);
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('test', context, []);
    expect(result.summary).toContain('1 task(s)');
  });

  // ─── System Prompt Quality ─────────────────────────────────────────────

  it('should include agent catalogue in system prompt', () => {
    const llm = createMockLLM('{}');
    const planner = new PlannerAgent(llm);

    const prompt = planner.getSystemPrompt(context);

    // Should list available coordinators
    expect(prompt).toContain('Available Coordinators');
    // Should NOT include router itself
    expect(prompt).not.toMatch(/\(id: "router"\)/);
    // Should include JSON output format instructions
    expect(prompt).toContain('Output Format');
    expect(prompt).toContain('"tasks"');
  });

  it('should define no tools (planner is pure reasoning)', () => {
    const llm = createMockLLM('{}');
    const planner = new PlannerAgent(llm);

    expect(planner.getAvailableTools()).toEqual([]);
  });

  it('should use routing model tier with 1024 maxTokens', () => {
    const llm = createMockLLM('{}');
    const planner = new PlannerAgent(llm);

    const routing = planner.getModelRouting();
    expect(routing.tier).toBe('routing');
    expect(routing.maxTokens).toBe(1024);
  });
});
