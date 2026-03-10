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
import type {
  AgentJobPayload,
  AgentJobUpdate,
  AgentJobOrigin,
  AgentOperationResult,
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
    subscriptionTier: 'premium',
  } as AgentUserContext;
}

function createMockContextBuilder(userContext?: AgentUserContext): ContextBuilder {
  const ctx = userContext ?? createMockUserContext();
  return {
    buildContext: vi.fn().mockResolvedValue(ctx),
    compressToPrompt: vi
      .fn()
      .mockReturnValue(
        `Athlete: ${ctx.displayName}, Sport: ${ctx.sport}, Position: ${ctx.position}`
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
      toolCalls: [],
      model: 'anthropic/claude-3.5-haiku',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      latencyMs: 200,
      costUsd: 0.0001,
      finishReason: 'stop',
    }),
    complete: vi.fn(),
  } as unknown as OpenRouterService;
}

function createMockAgent(id: string, result?: AgentOperationResult): BaseAgent {
  return {
    id,
    name: `Mock ${id}`,
    getAvailableTools: vi.fn().mockReturnValue([]),
    getSystemPrompt: vi.fn().mockReturnValue(`System prompt for ${id}`),
    getModelRouting: vi.fn().mockReturnValue({ tier: 'balanced' }),
    execute: vi.fn().mockResolvedValue(
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
        tasks: [{ id: '1', assignedAgent: 'scout', description: 'Analyze tape', dependsOn: [] }],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const agentId = await router.classify('Grade my tape', 'user-123');

      expect(agentId).toBe('scout');
    });

    it('should return "router" for multi-task plans', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'scout', description: 'Analyze tape', dependsOn: [] },
          { id: '2', assignedAgent: 'recruiter', description: 'Email coaches', dependsOn: ['1'] },
        ],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const agentId = await router.classify('Grade tape and email coaches', 'user-123');

      expect(agentId).toBe('router');
    });

    it('should return "general" when plan has no tasks', async () => {
      llm = createMockLLM({ tasks: [] });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const agentId = await router.classify('ambiguous request', 'user-123');

      expect(agentId).toBe('general');
    });

    it('should build user context before classifying', async () => {
      llm = createMockLLM({
        tasks: [{ id: '1', assignedAgent: 'general', description: 'test', dependsOn: [] }],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      await router.classify('hello', 'user-123');

      expect(contextBuilder.buildContext).toHaveBeenCalledWith('user-123');
      expect(contextBuilder.compressToPrompt).toHaveBeenCalled();
    });
  });

  // ─── run() ──────────────────────────────────────────────────────────────

  describe('run()', () => {
    it('should execute a single-task plan successfully', async () => {
      llm = createMockLLM({
        summary: 'Analyze the tape.',
        tasks: [
          { id: '1', assignedAgent: 'scout', description: 'Analyze highlight tape', dependsOn: [] },
        ],
      });

      const scoutAgent = createMockAgent('scout', {
        summary: 'Tape graded: B+ overall.',
        data: { grade: 'B+' },
        suggestions: ['Upload more recent footage.'],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(scoutAgent);

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
      expect(scoutAgent.execute).toHaveBeenCalledTimes(1);

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
          { id: '1', assignedAgent: 'scout', description: 'Grade tape', dependsOn: [] },
          { id: '2', assignedAgent: 'recruiter', description: 'Email coaches', dependsOn: ['1'] },
        ],
      });

      const executionOrder: string[] = [];

      const scoutAgent = createMockAgent('scout');
      (scoutAgent.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        executionOrder.push('scout');
        return { summary: 'Tape graded.', data: {}, suggestions: [] };
      });

      const recruiterAgent = createMockAgent('recruiter');
      (recruiterAgent.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        executionOrder.push('recruiter');
        return { summary: 'Emails sent.', data: {}, suggestions: [] };
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(scoutAgent);
      router.registerAgent(recruiterAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-002',
        userId: 'user-123',
        intent: 'Grade tape and email coaches',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      await router.run(payload);

      // Scout must run before recruiter
      expect(executionOrder).toEqual(['scout', 'recruiter']);
    });

    it('should inject upstream results into downstream task intents', async () => {
      llm = createMockLLM({
        tasks: [
          { id: '1', assignedAgent: 'scout', description: 'Grade tape', dependsOn: [] },
          {
            id: '2',
            assignedAgent: 'recruiter',
            description: 'Email coaches with grade',
            dependsOn: ['1'],
          },
        ],
      });

      const scoutAgent = createMockAgent('scout', {
        summary: 'Grade: A-',
        data: { grade: 'A-' },
        suggestions: [],
      });

      const recruiterAgent = createMockAgent('recruiter');
      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(scoutAgent);
      router.registerAgent(recruiterAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-003',
        userId: 'user-123',
        intent: 'Grade and email',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      await router.run(payload);

      // The recruiter should receive enriched intent with upstream results
      const recruiterCall = (recruiterAgent.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      const taskIntent = recruiterCall[0] as string;
      expect(taskIntent).toContain('[Result from task 1]');
      expect(taskIntent).toContain('Grade: A-');
    });

    it('should handle agent execution failure gracefully', async () => {
      llm = createMockLLM({
        tasks: [{ id: '1', assignedAgent: 'scout', description: 'Grade tape', dependsOn: [] }],
      });

      const scoutAgent = createMockAgent('scout');
      (scoutAgent.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM timeout'));

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(scoutAgent);

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

      // Should not throw — should handle gracefully
      expect(result).toBeDefined();

      // Should have emitted a failure update
      expect(updates.some((u) => u.step?.message?.includes('failed'))).toBe(true);
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
        tasks: [{ id: '1', assignedAgent: 'general', description: 'test', dependsOn: [] }],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      const generalAgent = createMockAgent('general');
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
      expect(userMessage).toContain('[Request]');
      expect(userMessage).toContain('Help me improve my stats');
    });
  });

  // ─── onUpdate Callback ─────────────────────────────────────────────────

  describe('update emissions', () => {
    it('should emit structured updates with operationId and timestamps', async () => {
      llm = createMockLLM({
        tasks: [{ id: '1', assignedAgent: 'general', description: 'test', dependsOn: [] }],
      });

      const generalAgent = createMockAgent('general');
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
    });

    it('should work without onUpdate callback (no-op)', async () => {
      llm = createMockLLM({
        tasks: [{ id: '1', assignedAgent: 'general', description: 'test', dependsOn: [] }],
      });

      const generalAgent = createMockAgent('general');
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
        tasks: [{ id: '1', assignedAgent: 'scout', description: 'test', dependsOn: [] }],
      });

      const scoutAgent = createMockAgent('scout', {
        summary: 'Scout done.',
        suggestions: [],
      });

      const router = new AgentRouter(llm, toolRegistry, contextBuilder);
      router.registerAgent(scoutAgent);

      const payload: AgentJobPayload = {
        operationId: 'op-010',
        userId: 'user-123',
        intent: 'test',
        origin: TEST_ORIGIN,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };

      const result = await router.run(payload);
      expect(result.summary).toContain('Scout done.');
      expect(scoutAgent.execute).toHaveBeenCalledTimes(1);
    });
  });
});
