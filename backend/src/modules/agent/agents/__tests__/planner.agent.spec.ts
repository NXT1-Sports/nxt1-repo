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

  it('should call LLM twice: first for classification, then for planning', async () => {
    const classificationResult = {
      isConversational: false,
      reasoning: 'Complex request',
      estimatedComplexity: 'complex',
    };

    const planResult = {
      tasks: [
        { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
      ],
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'anthropic/claude-sonnet-4-5',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    await planner.execute('Do something complex', context, []);

    // Should be called twice: once for classification, once for planning
    expect(llm.prompt).toHaveBeenCalledTimes(2);

    // First call: classification with chat tier
    const classificationCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(classificationCall[2]).toMatchObject({
      tier: 'chat',
      maxTokens: 512,
    });
    expect(classificationCall[2].outputSchema.name).toBe('intent_classification');

    // Second call: planning with routing tier
    const planningCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(planningCall[0]).toContain('Chief of Staff');
    expect(planningCall[2]).toMatchObject({
      tier: 'routing',
      maxTokens: 1024,
    });
    expect(planningCall[2].outputSchema.name).toBe('planner_execution_plan');
  });

  it('should inject capability snapshot context into routing-tier planning input', async () => {
    const classificationResult = {
      isConversational: false,
      reasoning: 'Coordinator execution needed',
      estimatedComplexity: 'moderate',
    };

    const planResult = {
      tasks: [
        { id: '1', assignedAgent: 'strategy_coordinator', description: 'test', dependsOn: [] },
      ],
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'anthropic/claude-sonnet-4-5',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    await planner.execute('Build a scouting workflow', context, [], undefined, {
      capabilitySnapshot: {
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
      },
    });

    const planningCall = (llm.prompt as ReturnType<typeof vi.fn>).mock.calls[1];
    const planningIntent = planningCall[1] as string;

    expect(planningIntent).toContain('[Coordinator Capability Snapshot]');
    expect(planningIntent).toContain('snapshot-hash');
    expect(planningIntent).toContain('strategy_coordinator');
  });

  it('should classify capability questions through the conversational LLM path', async () => {
    const classificationResult = {
      isConversational: true,
      reasoning: 'Capability question is conversational',
      estimatedComplexity: 'simple',
    };

    const planResult = {
      tasks: [],
      directResponse: 'I can help with recruiting, video workflows, and platform guidance.',
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    const result = await planner.execute('What can you do?', context, []);

    expect(llm.prompt).toHaveBeenCalledTimes(2);
    expect(result.data?.['directResponse']).toContain('recruiting');
    const plan = result.data?.['plan'] as { tasks: unknown[] };
    expect(plan.tasks).toHaveLength(0);
  });

  it('should classify greetings through the conversational LLM path', async () => {
    const classificationResult = {
      isConversational: true,
      reasoning: 'Greeting is conversational',
      estimatedComplexity: 'simple',
    };

    const planResult = {
      tasks: [],
      directResponse: 'Hey. What do you want to get done?',
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    const result = await planner.execute('Hey there', context, []);

    expect(llm.prompt).toHaveBeenCalledTimes(2);
    expect(result.data?.['directResponse']).toBe('Hey. What do you want to get done?');
    const plan = result.data?.['plan'] as { tasks: unknown[] };
    expect(plan.tasks).toHaveLength(0);
  });

  it('should not bypass conversational LLM path when assistant history exists', async () => {
    const classificationResult = {
      isConversational: true,
      reasoning: 'Follow-up conversational turn',
      estimatedComplexity: 'simple',
    };

    const planResult = {
      tasks: [],
      directResponse: 'I can keep going from our thread. What should I do next?',
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    const followUpContext = createMockContext({
      conversationHistory: [
        {
          role: 'user',
          content: 'What can you do?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: "I'm Agent X, the NXT1 Chief of Staff...",
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const result = await planner.execute('What can you do?', followUpContext, []);

    expect(llm.prompt).toHaveBeenCalledTimes(2);
    expect(result.data?.['directResponse']).toBe(
      'I can keep going from our thread. What should I do next?'
    );
    expect(result.summary).not.toBe('Chief of Staff capability response.');
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

  it('should use chat model tier with 512 maxTokens', () => {
    const llm = createMockLLM('{}');
    const planner = new PlannerAgent(llm);

    const chatRouting = planner.getChatModelRouting();
    expect(chatRouting.tier).toBe('chat');
    expect(chatRouting.maxTokens).toBe(512);
  });

  // ─── Tier Classification (DeepSeek-First Optimization) ──────────────────

  it('should not skip classification for greetings', async () => {
    const classificationResult = {
      isConversational: true,
      reasoning: 'Greeting is conversational',
      estimatedComplexity: 'simple',
    };

    const planResult = {
      tasks: [],
      directResponse: 'Hello. How can I help?',
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    const result = await planner.execute('Hi there!', context, []);

    expect(result.data!['directResponse']).toBe('Hello. How can I help?');
    expect(result.data!['plan']).toMatchObject({ tasks: [] });
    expect(llm.prompt).toHaveBeenCalledTimes(2);
  });

  it('should include metadata with tier and complexity for executed plan', async () => {
    const parsedOutput = {
      summary: 'Grade tape and email coaches.',
      tasks: [
        {
          id: '1',
          assignedAgent: 'performance_coordinator',
          description: 'Grade tape',
          dependsOn: [],
        },
      ],
    };

    const llm = createMockLLM({ content: JSON.stringify(parsedOutput), parsedOutput });
    const planner = new PlannerAgent(llm);

    const result = await planner.execute('Grade my tape and email coaches', context, []);

    // Should include metadata about the execution
    expect(result.data).toHaveProperty('metadata');
    const metadata = result.data!['metadata'] as Record<string, unknown>;
    expect(metadata).toHaveProperty('tier');
    expect(metadata).toHaveProperty('complexity');
    expect(metadata).toHaveProperty('classificationReasoning');
  });

  it('should classify simple question as conversational (uses chat tier)', async () => {
    const classificationResult = {
      isConversational: true,
      reasoning: 'Simple platform help question',
      estimatedComplexity: 'simple',
    };

    const planResult = {
      tasks: [],
      directResponse: 'Here is how you do that...',
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          // First call: classification
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          // Second call: planning (with chat tier)
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    const result = await planner.execute('How do I edit my profile?', context, []);

    expect(result.data!['directResponse']).toBeDefined();
    const metadata = result.data!['metadata'] as Record<string, unknown>;
    expect(metadata.tier).toBe('chat');
    expect(metadata.complexity).toBe('simple');
  });

  it('should sanitize direct responses returned from conversational planning', async () => {
    const classificationResult = {
      isConversational: true,
      reasoning: 'Simple profile question',
      estimatedComplexity: 'simple',
    };

    const planResult = {
      tasks: [],
      directResponse:
        'You are John Doe. UserID 19oowBH8EfZ6AYrU4fNuRSreonO2, TeamID mC3D9qg5d9amvcO0otvi, OrgID nB8n9iNsm5M5KBxfGUC9',
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    const result = await planner.execute('What do you know about me?', context, []);

    const directResponse = String(result.data?.['directResponse'] ?? '');
    expect(directResponse).not.toContain('19oowBH8EfZ6AYrU4fNuRSreonO2');
    expect(directResponse).not.toContain('mC3D9qg5d9amvcO0otvi');
    expect(directResponse).not.toContain('nB8n9iNsm5M5KBxfGUC9');
    expect(directResponse).toContain('[redacted]');
  });

  it('should classify complex request as requiring planning (uses routing tier)', async () => {
    const classificationResult = {
      isConversational: false,
      reasoning: 'Multi-step work requiring coordinator delegation',
      estimatedComplexity: 'complex',
    };

    const planResult = {
      summary: 'Grade tape and email coaches',
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
          description: 'Email D3 coaches',
          dependsOn: ['1'],
        },
      ],
    };

    const llm = {
      prompt: vi
        .fn()
        .mockResolvedValueOnce({
          // First call: classification
          parsedOutput: classificationResult,
          content: JSON.stringify(classificationResult),
          model: 'deepseek/deepseek-v3.2',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.0001,
          toolCalls: [],
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          // Second call: planning (with routing tier)
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'anthropic/claude-sonnet-4-5',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    const result = await planner.execute('Grade my tape and email D3 coaches in Ohio', context, []);

    const plan = result.data!['plan'] as { tasks: Array<{ id: string; dependsOn: string[] }> };
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[1].dependsOn).toContain('1');

    const metadata = result.data!['metadata'] as Record<string, unknown>;
    expect(metadata.tier).toBe('routing');
    expect(metadata.complexity).toBe('complex');
  });

  it('should fallback to routing tier if classification LLM fails', async () => {
    const planResult = {
      summary: 'Execute request',
      tasks: [
        {
          id: '1',
          assignedAgent: 'strategy_coordinator',
          description: 'Process',
          dependsOn: [],
        },
      ],
    };

    const llm = {
      prompt: vi
        .fn()
        .mockRejectedValueOnce(new Error('Classification failed'))
        .mockResolvedValueOnce({
          // Fallback to routing tier
          parsedOutput: planResult,
          content: JSON.stringify(planResult),
          model: 'anthropic/claude-sonnet-4-5',
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          latencyMs: 200,
          costUsd: 0.001,
          toolCalls: [],
          finishReason: 'stop',
        }),
      complete: vi.fn(),
    } as unknown as OpenRouterService;

    const planner = new PlannerAgent(llm);
    const result = await planner.execute('Do something', context, []);

    const metadata = result.data!['metadata'] as Record<string, unknown>;
    expect(metadata.tier).toBe('routing');
    expect(metadata.classificationReasoning).toContain('failed');
  });
});
