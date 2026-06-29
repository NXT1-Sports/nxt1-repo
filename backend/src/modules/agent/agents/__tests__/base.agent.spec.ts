import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { z } from 'zod';
import { BaseAgent } from '../base.agent.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../tools/base.tool.js';
import { AgentDelegationException } from '../../exceptions/agent-delegation.exception.js';
import { AgentYieldException } from '../../exceptions/agent-yield.exception.js';
import type { LLMMessage, LLMToolCall } from '../../llm/llm.types.js';
import { AskUserTool } from '../../tools/system/ask-user.tool.js';
import {
  resetOperationMemoryServiceForTests,
  getOperationMemoryService,
} from '../../services/operation-memory.service.js';
import {
  DEFAULT_AGENT_APP_CONFIG,
  parseAgentAppConfig,
  setCachedAgentAppConfig,
} from '../../config/agent-app-config.js';

class FakeReadTool extends BaseTool {
  readonly name = 'fake_read_tool';
  readonly description = 'Returns structured profile data.';
  readonly parameters = z.object({});
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  async execute(
    _input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    return {
      success: true,
      data: {
        userId: 'user-123',
        teamId: 'team-789',
        route: '/profile/123456',
        name: 'Jordan Miles',
      },
    };
  }
}

class FakeDynamicExportTool extends BaseTool {
  readonly name = 'dynamic_export';
  readonly description = 'Exports a structured document.';
  readonly parameters = z.object({
    format: z.string(),
    fileName: z.string(),
    title: z.string(),
    rows: z.array(z.array(z.string())).min(1),
  });
  readonly isMutation = false;
  readonly category = 'system' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    return {
      success: true,
      data: {
        fileName: input['fileName'],
        rowCount: Array.isArray(input['rows']) ? input['rows'].length : 0,
      },
    };
  }
}

class FakeGenerateThumbnailTool extends BaseTool {
  readonly name = 'ffmpeg_generate_thumbnail';
  readonly description = 'Extracts a still frame from a video.';
  readonly parameters = z.object({
    inputPath: z.string().min(1),
    time: z.string().optional(),
  });
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    return {
      success: true,
      data: {
        imageUrl: 'https://cdn.example.com/generated-frame.jpg',
        inputPath: input['inputPath'],
      },
    };
  }
}

class FakeFailTool extends BaseTool {
  readonly name = 'analyze_video';
  readonly description = 'Returns a structured failure.';
  readonly parameters = z.object({});
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['performance_coordinator'] as const;

  async execute(): Promise<ToolResult> {
    return {
      success: false,
      error: 'OpenAI image API error 500: upstream image model unavailable.',
    };
  }
}

class FakeEnvironmentEchoTool extends BaseTool {
  readonly name = 'fake_environment_echo_tool';
  readonly description = 'Returns the execution environment passed to the tool.';
  readonly parameters = z.object({});
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  lastContext?: ToolExecutionContext;

  async execute(
    _input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    this.lastContext = context;

    return {
      success: true,
      data: {
        environment: context?.environment ?? null,
      },
    };
  }
}

class FakeParseDocumentTool extends BaseTool {
  readonly name = 'parse_document';
  readonly description = 'Parses a document attachment.';
  readonly parameters = z.object({
    url: z.string().url(),
  });
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;

  calls: Array<Record<string, unknown>> = [];

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    this.calls.push(input);
    return {
      success: true,
      data: {
        source: 'firecrawl',
        fileName: 'Sample.pdf',
        url: input['url'],
      },
    };
  }
}

class FakeAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'strategy_coordinator';
  readonly name: string = 'Fake Agent';

  getSystemPrompt(): string {
    return 'You are a test agent.';
  }

  getAvailableTools(): readonly string[] {
    return ['fake_read_tool'];
  }

  getModelRouting(): ModelRoutingConfig {
    return {
      tier: 'chat',
      maxTokens: 200,
      temperature: 0.2,
    };
  }

  callAugmentToolCallWithArtifact(
    toolCall: LLMToolCall,
    messages: readonly LLMMessage[],
    context?: AgentSessionContext,
    artifactLedger?: ReadonlyArray<{ toolName: string; artifacts: Record<string, unknown> }>
  ): LLMToolCall {
    return this.augmentToolCallWithArtifact(toolCall, messages, context, artifactLedger);
  }

  callPruneMessageHistory(messages: LLMMessage[]): void {
    (
      this as unknown as { pruneMessageHistory: (messages: LLMMessage[]) => void }
    ).pruneMessageHistory(messages);
  }

  callExecuteTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    sessionContext?: {
      operationId?: string;
      sessionId?: string;
      threadId?: string;
      environment?: 'staging' | 'production';
      environment?: 'staging' | 'production';
      allowedToolNames?: readonly string[];
    }
  ): Promise<string> {
    return this.executeTool(
      toolCall,
      registry,
      userId,
      undefined,
      undefined,
      sessionContext as never
    );
  }

  callCompressMessageHistoryIfNeeded(params: {
    messages: LLMMessage[];
    llm: { complete: (...args: unknown[]) => Promise<{ content: string | null }> };
    context: AgentSessionContext;
    iteration: number;
    promptBudgetTokens: number;
  }): Promise<void> {
    return (
      this as unknown as {
        compressMessageHistoryIfNeeded: (args: {
          messages: LLMMessage[];
          llm: {
            complete: (...args: unknown[]) => Promise<{ content: string | null }>;
          };
          context: AgentSessionContext;
          iteration: number;
          promptBudgetTokens: number;
        }) => Promise<void>;
      }
    ).compressMessageHistoryIfNeeded(params);
  }

  callBuildRuntimeTemporalContext(intent: string, context?: AgentSessionContext): string {
    return (
      this as unknown as {
        buildRuntimeTemporalContext: (
          intentArg: string,
          contextArg?: AgentSessionContext
        ) => string;
      }
    ).buildRuntimeTemporalContext(intent, context);
  }

  callWithConfiguredSystemPrompt(basePrompt: string): string {
    return (
      this as unknown as {
        withConfiguredSystemPrompt: (prompt: string) => string;
      }
    ).withConfiguredSystemPrompt(basePrompt);
  }

  callSummarizeMiddleExchangesWithLlm(
    middleExchanges: readonly LLMMessage[][],
    llm: { complete: (...args: unknown[]) => Promise<{ content: string | null }> },
    context: AgentSessionContext
  ): Promise<string> {
    return (
      this as unknown as {
        summarizeMiddleExchangesWithLlm: (
          middle: readonly LLMMessage[][],
          llmArg: {
            complete: (...args: unknown[]) => Promise<{ content: string | null }>;
          },
          ctx: AgentSessionContext
        ) => Promise<string>;
      }
    ).summarizeMiddleExchangesWithLlm(middleExchanges, llm, context);
  }
}

class FakeRouterAgent extends FakeAgent {
  override readonly id: AgentIdentifier = 'router';
  override readonly name = 'Fake Router Agent';
}

class FakePerformanceAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'performance_coordinator';
  readonly name = 'Fake Performance Agent';

  getSystemPrompt(): string {
    return 'You are a performance test agent.';
  }

  getAvailableTools(): readonly string[] {
    return ['analyze_video'];
  }

  getModelRouting(): ModelRoutingConfig {
    return {
      tier: 'chat',
      maxTokens: 200,
      temperature: 0.2,
    };
  }

  callExecuteToolWithMessages(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    currentMessages: readonly LLMMessage[],
    sessionContext?: {
      operationId?: string;
      sessionId?: string;
      threadId?: string;
      allowedToolNames?: readonly string[];
      conversationHistory?: readonly LLMMessage[];
    }
  ): Promise<string> {
    return this.executeTool(
      toolCall,
      registry,
      userId,
      undefined,
      undefined,
      sessionContext as never,
      currentMessages
    );
  }

  callHydrateDrawnContextBurnAnnotationInput(
    input: Record<string, unknown>,
    currentMessages: readonly LLMMessage[],
    sessionContext?: {
      selectedContexts?: readonly import('@nxt1/core').AgentXSelectedContext[];
    }
  ): void {
    (
      this as unknown as {
        hydrateDrawnContextBurnAnnotationInput: (params: {
          toolName: string;
          input: Record<string, unknown>;
          currentMessages?: readonly LLMMessage[];
          sessionContext?: {
            selectedContexts?: readonly import('@nxt1/core').AgentXSelectedContext[];
          };
        }) => void;
      }
    ).hydrateDrawnContextBurnAnnotationInput({
      toolName: 'ffmpeg_burn_annotation',
      input,
      currentMessages,
      sessionContext,
    });
  }
}

class FakeAnalyzeVideoTool extends BaseTool {
  readonly name = 'analyze_video';
  readonly description = 'Analyzes a video clip.';
  readonly parameters = z.object({ url: z.string().url(), prompt: z.string().optional() });
  readonly isMutation = false;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['performance_coordinator'] as const;

  calls = 0;

  async execute(): Promise<ToolResult> {
    this.calls += 1;
    return {
      success: true,
      data: {
        analysis: 'ok',
      },
    };
  }
}

class _FakeBurnAnnotationTool extends BaseTool {
  readonly name = 'ffmpeg_burn_annotation';
  readonly description = 'Burns an annotation into a video clip.';
  readonly parameters = z.object({
    inputPath: z.string().min(1),
    annotation: z.object({
      kind: z.enum(['freehand', 'square', 'circle']),
      bounds: z.object({
        minX: z.number(),
        minY: z.number(),
        maxX: z.number(),
        maxY: z.number(),
      }),
      strokeCount: z.number(),
      points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    }),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    strokeColor: z.string().optional(),
  });
  readonly isMutation = true;
  readonly category = 'media' as const;
  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents = ['performance_coordinator'] as const;

  receivedInput: Record<string, unknown> | null = null;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    this.receivedInput = input;
    return {
      success: true,
      data: {
        videoUrl: 'https://cdn.example.com/annotated-clip.mp4',
      },
    };
  }
}

class FakeExtractLiveViewMediaTool extends BaseTool {
  readonly name = 'extract_live_view_media';
  readonly description = 'Extracts media from live view.';
  readonly parameters = z.object({});
  readonly isMutation = false;
  readonly category = 'automation' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  calls = 0;

  async execute(): Promise<ToolResult> {
    this.calls += 1;
    return {
      success: true,
      data: {
        videoUrl: 'https://cdn.example.com/clip.mp4',
        mediaArtifact: {
          source: 'hudl',
          transport: 'signed',
        },
      },
    };
  }
}

class FakeSearchCollegeCoachesTool extends BaseTool {
  readonly name = 'search_college_coaches';
  readonly description = 'Looks up coaching staff for a school.';
  readonly parameters = z.object({ schoolName: z.string() });
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    return {
      success: true,
      data: {
        schoolName: input['schoolName'],
      },
    };
  }
}

class FakeDelegateTaskTool extends BaseTool {
  readonly name = 'delegate_task';
  readonly description = 'Delegates to another agent.';
  readonly parameters = z.object({ forwarding_intent: z.string() });
  readonly isMutation = false;
  readonly category = 'system' as const;
  readonly entityGroup = 'system_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    throw new AgentDelegationException({
      forwardingIntent: String(input['forwarding_intent'] ?? 'delegate'),
      sourceAgent: 'delegate_task_tool',
    });
  }
}

class FakeTransientReadTool extends BaseTool {
  readonly name = 'fake_transient_read_tool';
  readonly description = 'Fails once with a transient error, then succeeds.';
  readonly parameters = z.object({});
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  calls = 0;

  async execute(): Promise<ToolResult> {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        success: false,
        error: '429 rate limit from upstream',
      };
    }

    return {
      success: true,
      data: {
        ok: true,
      },
    };
  }
}

class FakeTransientMutationTool extends BaseTool {
  readonly name = 'fake_transient_mutation_tool';
  readonly description = 'Mutation tools should not auto-retry.';
  readonly parameters = z.object({});
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'platform_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  calls = 0;

  async execute(): Promise<ToolResult> {
    this.calls += 1;
    return {
      success: false,
      error: '429 rate limit from upstream',
    };
  }
}

class FakeRunMicrosoftTool extends BaseTool {
  readonly name = 'run_microsoft_365_tool';
  readonly description = 'Executes a Microsoft 365 MCP tool.';
  readonly parameters = z.object({
    toolName: z.string(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  });
  readonly isMutation = false;
  readonly category = 'automation' as const;
  readonly entityGroup = 'integration_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    return {
      success: true,
      data: {
        toolName: input['toolName'],
      },
    };
  }
}

class FakeMicrosoftAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'strategy_coordinator';
  readonly name = 'Fake Microsoft Agent';

  getSystemPrompt(): string {
    return 'You are a test agent for Microsoft tools.';
  }

  getAvailableTools(): readonly string[] {
    return ['run_microsoft_365_tool'];
  }

  getModelRouting(): ModelRoutingConfig {
    return {
      tier: 'chat',
      maxTokens: 200,
      temperature: 0.2,
    };
  }
}

class FakeFirecrawlMonitorTool extends BaseTool {
  readonly description = 'Exercises Firecrawl monitor progress labeling.';
  readonly parameters = z.object({});
  readonly isMutation = false;
  readonly category = 'automation' as const;
  readonly entityGroup = 'integration_tools' as const;
  override readonly allowedAgents = ['strategy_coordinator'] as const;

  constructor(readonly name: string) {
    super();
  }

  async execute(): Promise<ToolResult> {
    return {
      success: true,
      data: {
        ok: true,
      },
    };
  }
}

class FakeFirecrawlMonitorAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'strategy_coordinator';
  readonly name = 'Fake Firecrawl Monitor Agent';

  constructor(private readonly availableTools: readonly string[]) {
    super();
  }

  getSystemPrompt(): string {
    return 'You are a test agent for Firecrawl monitor tools.';
  }

  getAvailableTools(): readonly string[] {
    return this.availableTools;
  }

  getModelRouting(): ModelRoutingConfig {
    return {
      tier: 'chat',
      maxTokens: 200,
      temperature: 0.2,
    };
  }
}

class FakeBrandAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'brand_coordinator';
  readonly name = 'Fake Brand Agent';

  getSystemPrompt(): string {
    return 'You are a brand test agent.';
  }

  getAvailableTools(): readonly string[] {
    return ['delegate_task'];
  }

  getModelRouting(): ModelRoutingConfig {
    return {
      tier: 'chat',
      maxTokens: 200,
      temperature: 0.2,
    };
  }

  callExecuteTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    sessionContext?: {
      operationId?: string;
      sessionId?: string;
      threadId?: string;
      allowedToolNames?: readonly string[];
    },
    currentMessages?: readonly LLMMessage[]
  ): Promise<string> {
    return this.executeTool(
      toolCall,
      registry,
      userId,
      undefined,
      undefined,
      sessionContext as never,
      currentMessages
    );
  }
}

class FakeUniversalDelegateTaskTool extends BaseTool {
  readonly name = 'delegate_task';
  readonly description = 'Delegates to another agent.';
  readonly parameters = z.object({ forwarding_intent: z.string() });
  readonly isMutation = false;
  readonly category = 'system' as const;
  readonly entityGroup = 'system_tools' as const;
  override readonly allowedAgents = ['*'] as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    throw new AgentDelegationException({
      forwardingIntent: String(input['forwarding_intent'] ?? 'delegate'),
      sourceAgent: 'delegate_task_tool',
    });
  }
}

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetOperationMemoryServiceForTests();
  setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);
});

describe('BaseAgent runtime date guardrail', () => {
  it('uses session timezone when formatting current date near UTC midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-04T03:48:00.000Z'));

    const agent = new FakeAgent();
    const context = { ...createMockContext(), timezone: 'America/Chicago' };
    const temporalContext = agent.callBuildRuntimeTemporalContext('what time is it', context);

    expect(temporalContext).toContain('Wednesday, June 3, 2026');
    expect(temporalContext).toContain('10:48 PM CDT');
    expect(temporalContext).toContain('2026-06-04T03:48:00.000Z');
    expect(temporalContext).toContain(
      'Words like "today," "tonight," "this evening," and "tomorrow" must map to that local date, not the UTC date'
    );
    expect(temporalContext).not.toContain('June 4, 2026, 10:48 PM CDT');
  });

  it('includes recurring schedule verification guidance in the shared contract', () => {
    const agent = new FakeAgent();
    const prompt = agent.callWithConfiguredSystemPrompt(agent.getSystemPrompt());

    expect(prompt).toContain('Recurring schedule creation (CRITICAL)');
    expect(prompt).toContain(
      'After ANY successful recurring schedule creation or update, immediately call `list_recurring_tasks`'
    );
    expect(prompt).toContain(
      'if the user asked for a first run later today but `nextRun` jumped about a week'
    );
    expect(prompt).toContain('Team Files / Universal Files contract');
    expect(prompt).toContain('editableViaUniversalDocumentTool: false');
    expect(prompt).toContain('saved back onto that SAME selected workspace record');
    expect(prompt).toContain(
      'Do NOT use `query_nxt1_platform_data` or low-level collection mutation tools as the primary path'
    );
  });
});

describe('BaseAgent identifier scrubbing', () => {
  it('returns connect-provider guidance when a stale email send tool call is not allowed', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();

    const observation = await agent.callExecuteTool(
      {
        id: 'call_send_email',
        type: 'function',
        function: {
          name: 'send_email',
          arguments:
            '{"toEmail":"john@nxt1sports.com","subject":"Check out NXT1","bodyHtml":"<p>Check out NXT1.</p>"}',
        },
      },
      registry,
      'viewer-1',
      {
        operationId: 'op-email-blocked',
        sessionId: 'session-email-blocked',
        allowedToolNames: ['fake_read_tool'],
      }
    );

    expect(JSON.parse(observation)).toEqual({
      success: false,
      error:
        'No connected email account found. Please connect Gmail or Outlook in Settings -> Email before sending emails.',
      data: {
        requiresEmailConnection: true,
      },
    });
  });

  it('preserves identifier fields inside internal tool observations for follow-up tool calls', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeReadTool());

    const observation = await agent.callExecuteTool(
      {
        id: 'call_fake_read',
        type: 'function',
        function: {
          name: 'fake_read_tool',
          arguments: '{}',
        },
      },
      registry,
      'viewer-1',
      {
        operationId: 'op-preserve-identifiers',
        sessionId: 'session-preserve-identifiers',
        allowedToolNames: ['fake_read_tool'],
      }
    );

    expect(JSON.parse(observation)).toEqual({
      success: true,
      data: {
        userId: 'user-123',
        teamId: 'team-789',
        route: '/profile/123456',
        name: 'Jordan Miles',
      },
    });
  });

  it('passes the session environment through to tool execution context', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const tool = new FakeEnvironmentEchoTool();
    registry.register(tool);

    const observation = await agent.callExecuteTool(
      {
        id: 'call_environment_echo',
        type: 'function',
        function: {
          name: 'fake_environment_echo_tool',
          arguments: '{}',
        },
      },
      registry,
      'viewer-1',
      {
        operationId: 'op-environment-echo',
        sessionId: 'session-environment-echo',
        environment: 'staging',
        allowedToolNames: ['fake_environment_echo_tool'],
      }
    );

    expect(tool.lastContext?.environment).toBe('staging');
    expect(JSON.parse(observation)).toEqual({
      success: true,
      data: {
        environment: 'staging',
      },
    });
  });

  it('sanitizes final summaries in non-streaming mode', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Found user id user-123 at /profile/123456 for team team-789.',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
    };

    const result = await agent.execute(
      'Find Jordan',
      createMockContext(),
      [],
      llm as never,
      registry
    );

    expect(result.summary).not.toContain('user-123');
    expect(result.summary).not.toContain('team-789');
  });

  it('sanitizes streamed tool args, tool results, and final output', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeReadTool());

    const events: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const llm = {
      completeStream: vi.fn().mockImplementation(async (_messages, _options, onDelta) => {
        callCount += 1;

        if (callCount === 1) {
          onDelta({ content: 'User id user-123', done: false });
          onDelta({
            toolName: 'fake_read_tool',
            toolArgs: '{"userId":"user-123","teamId":"team-789"}',
            done: false,
          });
          return {
            content: 'Checking user-123',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'fake_read_tool', arguments: '{}' },
              },
            ],
            model: 'test-model',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            costUsd: 0,
            finishReason: 'tool_calls',
          };
        }

        return {
          content: 'Jordan Miles is the athlete. Team id team-789.',
          toolCalls: [],
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          costUsd: 0,
          finishReason: 'stop',
        };
      }),
    };

    const result = await agent.execute(
      'Find Jordan',
      createMockContext(),
      [],
      llm as never,
      registry,
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    const toolCallEvent = events.find((event) => event['type'] === 'tool_call');
    const toolResultRecord = (result.data as Record<string, unknown>)['toolCallRecords'] as Array<
      Record<string, unknown>
    >;
    const deltaEvents = events.filter((event) => event['type'] === 'delta');

    expect(String(toolCallEvent?.['toolArgs'] ?? '')).not.toContain('user-123');
    expect(String(toolCallEvent?.['toolArgs'] ?? '')).not.toContain('team-789');
    expect(toolResultRecord[0]?.['output']).toEqual(
      expect.objectContaining({
        errorCode: 'AGENT_TOOL_NOT_ALLOWED',
      })
    );
    expect(deltaEvents.some((event) => String(event['text'] ?? '').includes('user-123'))).toBe(
      false
    );
    expect(result.summary).not.toContain('team-789');
    expect(result.data).toEqual(
      expect.objectContaining({
        toolCallRecords: expect.any(Array),
      })
    );
  });

  it('compacts URL descriptors in shared tool step labels', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('analyze_video', {
      url: 'https://hudl.com/video/abc123',
    });

    expect(label).toBe('Analyzing game film');
  });

  it('normalizes scrape webpage labels without surfacing wait timings', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('scrape_webpage', {
      url: 'https://fan.hudl.com/team/example',
      waitFor: 8000,
      format: 'rawHtml',
    });

    expect(label).toBe('Reviewing source page');
  });

  it('uses playbook-specific scrape labels for PDF import context', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('scrape_webpage', {
      url: 'https://storage.googleapis.com/nxt1-imports/Seed-Test-One-Playbook.pdf',
      query: 'extract formations and install notes from this football playbook',
    });

    expect(label).toBe('Reviewing strategy file');
  });

  it('uses section-specific labels for distilled profile reads', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('read_distilled_section', {
      url: 'https://www.maxpreps.com/athletes/example',
      section: 'seasonStats',
    });

    expect(label).toBe('Reading season stats');
  });

  it('normalizes ffmpeg trim labels without surfacing clip offsets', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('ffmpeg_trim_video', {
      inputPath: 'https://cdn.example.com/source.mp4',
      startTime: 103,
      endTime: 117,
    });

    expect(label).toBe('Trimming video');
  });

  it('normalizes ffmpeg merge labels without surfacing raw input URL arrays', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('ffmpeg_merge_videos', {
      inputPaths: [
        'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/3TURitdha123/clip-1.mp4',
        'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/3TURitdha123/clip-2.mp4',
      ],
    });

    expect(label).toBe('Merging video clips');
  });

  it('normalizes write intel labels without surfacing raw entity ids', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('write_intel', {
      entityType: 'athlete',
      entityId: 'T4jXcSaKvmY4kOUrP0ktJ6BDoeI3',
    });

    expect(label).toBe('Writing intelligence report');
  });

  it('uses role-neutral profile labels for get_user_profile', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('get_user_profile', {
      userId: 'coach-123',
    });

    expect(label).toBe('Reviewing user profile');
  });

  it('normalizes film review labels without surfacing raw review ids', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('get_film_review', {
      filmReviewId: '0ORPTNTxADr8wMmQkDrr_football_output_1779152454300f',
    });

    expect(label).toBe('Get Film Review');
  });

  it('normalizes parse document labels without surfacing raw storage paths', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('parse_document', {
      storagePath:
        'Users/RElFnXTPHcMKWuu4ib8qQT6qoiL2/uploads/pdf/unbound/1782337970116_Sample.pdf',
    });

    expect(label).toBe('Parse Document');
  });

  it('prefers explicit file names for parse document labels', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('parse_document', {
      fileName: 'Sample.pdf',
      storagePath:
        'Users/RElFnXTPHcMKWuu4ib8qQT6qoiL2/uploads/pdf/unbound/1782337970116_Sample.pdf',
    });

    expect(label).toBe('Parse Document: Sample.pdf');
  });

  it('normalizes universal game plan update labels to a user-friendly descriptor', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('update_universal_team_document', {
      documentId: 'mC3D9qg5d9amvcO0otvi_basketball-mens_pregame_2026-05-28_westfield-warriors',
      fileType: 'game_plan',
      customSections:
        '[{"id":"strengths-weaknesses","title":"Strengths & Weaknesses","content":"..."}]',
    });

    expect(label).toBe('Update Gameplan: Westfield Warriors (Pregame • 2026-05-28)');
  });

  it('keeps artifact URLs in compacted tool history summaries', () => {
    const agent = new FakeAgent();
    const toolExchange = (
      id: string,
      name: string,
      data: Record<string, unknown>
    ): LLMMessage[] => [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id,
            type: 'function',
            function: { name, arguments: JSON.stringify({ inputPath: `${id}.mp4` }) },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: id,
        content: JSON.stringify({ success: true, data }),
      },
    ];

    const messages: LLMMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'build a highlight reel' },
      ...toolExchange('t1', 'extract_hudl_video', {
        videoUrl: 'https://cdn.example.com/source.mp4',
      }),
      ...toolExchange('t2', 'analyze_video', { summary: 'best plays found' }),
      ...toolExchange('t3', 'ffmpeg_trim_video', {
        videoUrl: 'https://cdn.example.com/clip-1.mp4',
      }),
      ...toolExchange('t4', 'ffmpeg_merge_videos', {
        outputUrl: 'https://cdn.example.com/merged.mp4',
        videoUrl: 'https://cdn.example.com/merged.mp4',
      }),
      ...toolExchange('t5', 'ffmpeg_generate_thumbnail', {
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      }),
      ...toolExchange('t6', 'analyze_image', { summary: 'usable image' }),
      ...toolExchange('t7', 'generate_graphic', { imageUrl: 'https://cdn.example.com/card.png' }),
      ...toolExchange('t8', 'runway_generate_video', {
        videoUrl: 'https://cdn.example.com/intro.mp4',
      }),
    ];

    agent.callPruneMessageHistory(messages);

    const compactedSummary = messages.find(
      (message) =>
        message.role === 'assistant' &&
        typeof message.content === 'string' &&
        message.content.includes('[Context compacted')
    );

    expect(compactedSummary?.content).toContain('ffmpeg_merge_videos');
    expect(compactedSummary?.content).toContain('videoUrl=https://cdn.example.com/merged.mp4');
    expect(compactedSummary?.content).toContain('thumbnailUrl=https://cdn.example.com/thumb.jpg');
  });

  it('auto-injects mediaArtifact from conversationHistory into analyze_video', () => {
    const agent = new FakeAgent();
    const context = {
      ...createMockContext(),
      conversationHistory: [
        {
          role: 'tool' as const,
          content: JSON.stringify({
            success: true,
            data: {
              mediaArtifact: { source: 'hudl', clipId: 'abc123' },
            },
          }),
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const toolCall: LLMToolCall = {
      id: 'analyze_1',
      type: 'function',
      function: {
        name: 'analyze_video',
        arguments: JSON.stringify({
          url: 'https://vc.hudl.com/video/abc123',
          prompt: 'Analyze this',
        }),
      },
    };

    const augmented = agent.callAugmentToolCallWithArtifact(toolCall, [], context);
    const args = JSON.parse(augmented.function.arguments) as Record<string, unknown>;

    expect(args['artifact']).toBeUndefined();
  });

  it('auto-injects subjectPhotoUrls but does not inject non-organization logos into generate_graphic', () => {
    const agent = new FakeAgent();
    const context = {
      ...createMockContext(),
      conversationHistory: [
        {
          role: 'tool' as const,
          content: JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  profileImgs: ['https://cdn.example.com/profile-1.png'],
                  galleryImages: ['https://cdn.example.com/team-1.png'],
                  logoUrl: 'https://cdn.example.com/team-logo.png',
                },
              ],
              colleges: [{ logoUrl: 'https://cdn.example.com/college-logo.png', found: true }],
            },
          }),
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const toolCall: LLMToolCall = {
      id: 'graphic_1',
      type: 'function',
      function: {
        name: 'generate_graphic',
        arguments: JSON.stringify({
          graphicType: 'athlete',
          textRequirements: ['COMMITTED'],
          dimensions: '1080x1080',
          styleDescription: 'Modern sports graphic',
          userId: 'user-1',
        }),
      },
    };

    const augmented = agent.callAugmentToolCallWithArtifact(toolCall, [], context);
    const args = JSON.parse(augmented.function.arguments) as Record<string, unknown>;

    expect(args['subjectPhotoUrls']).toEqual([
      'https://cdn.example.com/profile-1.png',
      'https://cdn.example.com/team-1.png',
    ]);
    expect(args['logoUrls']).toBeUndefined();
    expect(args['applyMode']).toBe('photo_lock');
    expect(args['assetSelectionApproved']).toBe(false);
    expect(Array.isArray(args['autoRetrievedSources'])).toBe(true);
  });

  it('does not override explicit subjectPhotoUrls/logoUrls in generate_graphic calls', () => {
    const agent = new FakeAgent();
    const context = {
      ...createMockContext(),
      conversationHistory: [
        {
          role: 'tool' as const,
          content: JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  profileImgs: ['https://cdn.example.com/auto-profile.png'],
                  logoUrl: 'https://cdn.example.com/auto-logo.png',
                },
              ],
            },
          }),
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const toolCall: LLMToolCall = {
      id: 'graphic_2',
      type: 'function',
      function: {
        name: 'generate_graphic',
        arguments: JSON.stringify({
          graphicType: 'athlete',
          textRequirements: ['WELCOME'],
          dimensions: '1080x1080',
          styleDescription: 'Clean and modern',
          userId: 'user-1',
          subjectPhotoUrls: ['https://cdn.example.com/user-upload-photo.png'],
          logoUrls: ['https://cdn.example.com/user-upload-logo.png'],
          assetSelectionApproved: true,
        }),
      },
    };

    const augmented = agent.callAugmentToolCallWithArtifact(toolCall, [], context);
    const args = JSON.parse(augmented.function.arguments) as Record<string, unknown>;

    expect(args['subjectPhotoUrls']).toEqual(['https://cdn.example.com/user-upload-photo.png']);
    expect(args['logoUrls']).toEqual(['https://cdn.example.com/user-upload-logo.png']);
    expect(args['assetSelectionApproved']).toBe(true);
  });

  it('extracts logo and image URLs from welcome-style intent text when tool args omit them', () => {
    const agent = new FakeAgent();
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a brand coordinator.',
      },
      {
        role: 'user',
        content:
          'Create a welcome graphic.\n- Team Logo: https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Organizations/venice-logo.png\n- Athlete Photo: https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/venice-athlete.png',
      },
    ];

    const toolCall: LLMToolCall = {
      id: 'graphic_welcome',
      type: 'function',
      function: {
        name: 'generate_graphic',
        arguments: JSON.stringify({
          graphicType: 'team',
          textRequirements: ['WELCOME TO VENICE INDIANS FOOTBALL'],
          dimensions: '1080x1080',
          styleDescription: 'Premium team welcome',
          userId: 'user-1',
        }),
      },
    };

    const augmented = agent.callAugmentToolCallWithArtifact(
      toolCall,
      messages,
      createMockContext()
    );
    const args = JSON.parse(augmented.function.arguments) as Record<string, unknown>;

    expect(args['logoUrls']).toEqual([
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Organizations/venice-logo.png',
    ]);
    expect(args['subjectPhotoUrls']).toEqual([
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/venice-athlete.png',
    ]);
  });

  it('skips duplicate extract_live_view_media executions using OperationMemory', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const extractTool = new FakeExtractLiveViewMediaTool();
    registry.register(extractTool);

    const operationMemory = getOperationMemoryService();
    operationMemory.init('op-dedup', 'Analyze the current live-view clip');

    const toolCall: LLMToolCall = {
      id: 'extract_1',
      type: 'function',
      function: {
        name: 'extract_live_view_media',
        arguments: JSON.stringify({}),
      },
    };

    const first = await agent.callExecuteTool(toolCall, registry, 'viewer-1', {
      operationId: 'op-dedup',
      sessionId: 'session-dedup',
      allowedToolNames: ['extract_live_view_media'],
    });
    const second = await agent.callExecuteTool(toolCall, registry, 'viewer-1', {
      operationId: 'op-dedup',
      sessionId: 'session-dedup',
      allowedToolNames: ['extract_live_view_media'],
    });

    expect(extractTool.calls).toBe(1);
    expect(JSON.parse(first)).toEqual(expect.objectContaining({ success: true }));
    expect(JSON.parse(second)).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          _dedupedFromOperationMemory: true,
          videoUrl: 'https://cdn.example.com/clip.mp4',
        }),
      })
    );
  });

  it('reroutes scrape_webpage on signed document URLs to parse_document before execution', async () => {
    const agent = new FakeRouterAgent();
    const registry = new ToolRegistry();
    const parseTool = new FakeParseDocumentTool();
    registry.register(parseTool);

    const toolCall: LLMToolCall = {
      id: 'doc_scrape_1',
      type: 'function',
      function: {
        name: 'scrape_webpage',
        arguments: JSON.stringify({
          url: 'https://storage.googleapis.com/test-bucket/uploads/Sample.pdf?X-Goog-Signature=abc',
        }),
      },
    };

    const result = await agent.callExecuteTool(toolCall, registry, 'viewer-1', {
      sessionId: 'session-doc-reroute',
      allowedToolNames: ['scrape_webpage', 'parse_document'],
    });

    expect(parseTool.calls).toEqual([
      {
        url: 'https://storage.googleapis.com/test-bucket/uploads/Sample.pdf?X-Goog-Signature=abc',
      },
    ]);
    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          fileName: 'Sample.pdf',
        }),
      })
    );
  });

  it('reroutes open_live_view on signed document URLs to parse_document before router denial', async () => {
    const agent = new FakeRouterAgent();
    const registry = new ToolRegistry();
    const parseTool = new FakeParseDocumentTool();
    registry.register(parseTool);

    const toolCall: LLMToolCall = {
      id: 'doc_live_view_1',
      type: 'function',
      function: {
        name: 'open_live_view',
        arguments: JSON.stringify({
          url: 'https://storage.googleapis.com/test-bucket/uploads/Sample.pdf?X-Goog-Signature=abc',
        }),
      },
    };

    const result = await agent.callExecuteTool(toolCall, registry, 'viewer-1', {
      sessionId: 'session-doc-live-view-reroute',
      allowedToolNames: ['open_live_view', 'parse_document'],
    });

    expect(parseTool.calls).toEqual([
      {
        url: 'https://storage.googleapis.com/test-bucket/uploads/Sample.pdf?X-Goog-Signature=abc',
      },
    ]);
    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          source: 'firecrawl',
        }),
      })
    );
  });

  it('does not block analyze_video for drawn-context film requests when annotation burn fails', async () => {
    const agent = new FakePerformanceAgent();
    const registry = new ToolRegistry();
    const analyzeVideoTool = new FakeAnalyzeVideoTool();
    registry.register(analyzeVideoTool);

    const currentMessages: LLMMessage[] = [
      {
        role: 'user',
        content:
          '[Selected contexts from user request]\n- hasDrawing: true\n- Marked-frame timestamp: 7.5s\n- video-frame normalized bounds x=0.306-0.342, y=0.613-0.672',
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'burn_1',
            type: 'function',
            function: {
              name: 'ffmpeg_burn_annotation',
              arguments: '{}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'burn_1',
        content: JSON.stringify({
          success: false,
          error: 'FFmpeg burn_annotation failed: could not render overlay image',
        }),
      },
    ];

    const result = await agent.callExecuteToolWithMessages(
      {
        id: 'video_1',
        type: 'function',
        function: {
          name: 'analyze_video',
          arguments: JSON.stringify({
            url: 'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-1/uploads/video.MOV',
            prompt: 'Identify the circled player',
          }),
        },
      },
      registry,
      'viewer-1',
      currentMessages,
      { allowedToolNames: ['analyze_video'] }
    );

    expect(analyzeVideoTool.calls).toBe(1);
    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          analysis: 'ok',
        }),
      })
    );
  });

  it('returns temporary-unavailable guidance for ffmpeg_burn_annotation requests', async () => {
    const agent = new FakePerformanceAgent();
    const registry = new ToolRegistry();
    const burnTool = new _FakeBurnAnnotationTool();
    registry.register(burnTool);

    const result = await agent.callExecuteToolWithMessages(
      {
        id: 'burn_now',
        type: 'function',
        function: {
          name: 'ffmpeg_burn_annotation',
          arguments: JSON.stringify({
            inputPath: 'https://cdn.example.com/source.mov',
            annotation: {
              kind: 'freehand',
              strokeCount: 1,
              bounds: { minX: 0.1, minY: 0.1, maxX: 0.3, maxY: 0.4 },
            },
          }),
        },
      },
      registry,
      'viewer-1',
      [],
      { allowedToolNames: ['ffmpeg_burn_annotation'] }
    );

    expect(burnTool.receivedInput).toBeNull();
    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'FEATURE_TEMPORARILY_UNAVAILABLE',
        error: expect.stringContaining('temporarily unavailable'),
      })
    );
  });

  it('hydrates ffmpeg_burn_annotation input from selected-context annotation metadata', () => {
    const agent = new FakePerformanceAgent();

    const currentMessages: LLMMessage[] = [
      {
        role: 'user',
        content:
          '[Selected contexts (confirmed by user for this turn):\n' +
          '1. film_play (State Championship Cutup): Fourth Quarter @ 01:12 @ 72s-78s — Boundary throw with drawn route — User drawing annotation: freehand, 2 stroke(s), video-frame normalized bounds x=0.1-0.5, y=0.2-0.7, centered in the center-left of the video frame. Marked-frame timestamp: 74.25s; use this exact timestamp when generating fallback still frames instead of the play start. A flattened annotated full-frame image attachment named "fourth-quarter-annotated-7200.jpg" is included with this turn; treat it as a visual reference only. Use the structured annotation bounds/points as the source of truth when burning the user-drawn light-green marking directly into the clip for seamless video analysis. Normalized path points: 0.1,0.2 | 0.5,0.7.\n' +
          ']\n' +
          '[Instruction: prioritize these contexts while reasoning and cite their timestamps when relevant. If a selected context includes a drawing annotation, treat the annotation coordinates as the user-selected area even if the raw video frame does not visibly contain the overlay.]',
      },
    ];

    const input: Record<string, unknown> = {
      inputPath: 'https://cdn.example.com/source.mov',
    };

    agent.callHydrateDrawnContextBurnAnnotationInput(input, currentMessages, {
      selectedContexts: [
        {
          id: 'film-play-1',
          kind: 'film_play',
          title: 'State Championship Cutup',
          timeRange: { startSec: 72, endSec: 78 },
          annotation: {
            kind: 'freehand',
            strokeCount: 2,
            bounds: {
              minX: 0.1,
              minY: 0.2,
              maxX: 0.5,
              maxY: 0.7,
            },
            points: [
              { x: 0.1, y: 0.2 },
              { x: 0.5, y: 0.7 },
            ],
          },
          metadata: {
            annotationStrokeColor: 'light-green',
            annotationStrokeColorHex: '#ccff00',
          },
        },
      ],
    });

    expect(input).toEqual(
      expect.objectContaining({
        inputPath: 'https://cdn.example.com/source.mov',
        startTime: 72,
        endTime: 78,
        strokeColor: '#ccff00',
        annotation: expect.objectContaining({
          kind: 'freehand',
          strokeCount: 2,
          bounds: {
            minX: 0.1,
            minY: 0.2,
            maxX: 0.5,
            maxY: 0.7,
          },
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.5, y: 0.7 },
          ],
        }),
      })
    );
  });

  it('does not block a new full-video upload because prior history contained drawings', async () => {
    const agent = new FakePerformanceAgent();
    const registry = new ToolRegistry();
    const analyzeVideoTool = new FakeAnalyzeVideoTool();
    registry.register(analyzeVideoTool);

    const result = await agent.callExecuteToolWithMessages(
      {
        id: 'video_full_1',
        type: 'function',
        function: {
          name: 'analyze_video',
          arguments: JSON.stringify({
            url: 'https://cdn.example.com/full-game.mp4',
            prompt: 'Analyze the whole video I uploaded.',
          }),
        },
      },
      registry,
      'viewer-1',
      [
        {
          role: 'user',
          content: '[Attached video: full-game.mp4 — https://cdn.example.com/full-game.mp4]',
        },
      ],
      {
        conversationHistory: [
          {
            role: 'user',
            content:
              '[Selected contexts from user request]\n- hasDrawing: true\n- Marked-frame timestamp: 7.5s\n- video-frame normalized bounds x=0.306-0.342, y=0.613-0.672',
          },
        ],
        allowedToolNames: ['analyze_video'],
      }
    );

    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ analysis: 'ok' }),
      })
    );
    expect(analyzeVideoTool.calls).toBe(1);
  });

  it('guides router away from forbidden live-view extraction tools', async () => {
    const agent = new FakeRouterAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeExtractLiveViewMediaTool());

    const result = await agent.callExecuteTool(
      {
        id: 'extract_router_1',
        type: 'function',
        function: {
          name: 'extract_live_view_media',
          arguments: JSON.stringify({}),
        },
      },
      registry,
      'viewer-1',
      { allowedToolNames: ['delegate_to_coordinator'] }
    );

    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        errorCode: 'AGENT_TOOL_NOT_ALLOWED',
        guidance: expect.stringContaining('coordinatorId="performance_coordinator"'),
      })
    );
  });

  it('derives non-empty summary text from coordinator observation for delegation short-circuit', () => {
    const agent = new FakeAgent();
    const toolRecords = [
      {
        toolName: 'delegate_to_coordinator',
        status: 'success',
        timestamp: new Date().toISOString(),
      },
    ];

    const summary = (
      agent as unknown as {
        resolveDelegationShortCircuitSummary: (
          extractedToolData: Record<string, unknown>,
          toolCallRecords: readonly Record<string, unknown>[]
        ) => string;
      }
    ).resolveDelegationShortCircuitSummary(
      {
        coordinator_observation:
          '## performance_coordinator dispatch result\n- ✅ `task_1`: Analyze uploaded film and return tendencies.',
      },
      toolRecords
    );

    expect(summary.trim().length).toBeGreaterThan(0);
    expect(summary).toContain('Analyze uploaded film and return tendencies');
  });

  it('ignores boilerplate completed film-review text and derives a scouting summary', () => {
    const agent = new FakeAgent();

    const summary = (
      agent as unknown as {
        resolveDelegationShortCircuitSummary: (
          extractedToolData: Record<string, unknown>,
          toolCallRecords: readonly Record<string, unknown>[]
        ) => string;
      }
    ).resolveDelegationShortCircuitSummary(
      {
        response: 'Completed: get film review.',
        filmReview: {
          opponentName: 'Warren G Harding',
          keyInsights: [
            'They over-rotate to motion from trips on early downs.',
            'Boundary corners play inside leverage and bail late in Cover 3.',
            'Interior fit widens against split-flow action.',
          ],
        },
      },
      []
    );

    expect(summary.toLowerCase()).not.toContain('completed: get film review');
    expect(summary).toContain('Warren G Harding');
    expect(summary.toLowerCase()).toContain('top tendencies');
  });

  it('repairs truncated dynamic_export tool arguments before execution', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeDynamicExportTool());

    const malformedArgs =
      '{"format":"pdf","fileName":"Crown-Point-Elite30-Coach-Outreach-Framework.pdf","title":"Crown Point Bulldogs Elite 30 - Coach Outreach Framework","rows":[["Ngoc Son (2025)","G","D2 / D3 / NAIA / JUCO","Indiana Tech"],["Cooper Malaski","F","D1 mid-major / D2","Valparaiso"]]';

    const result = await agent.callExecuteTool(
      {
        id: 'dynamic_export_1',
        type: 'function',
        function: {
          name: 'dynamic_export',
          arguments: malformedArgs,
        },
      },
      registry,
      'viewer-1',
      { allowedToolNames: ['dynamic_export'] }
    );

    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          fileName: 'Crown-Point-Elite30-Coach-Outreach-Framework.pdf',
          rowCount: 2,
        }),
      })
    );
  });

  it('repairs truncated signed URL string arguments before execution', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeGenerateThumbnailTool());

    const signedUrl =
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user/uploads/video.MOV?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=' +
      '9b8a5d6c8e7f3a2b1d0c'.repeat(80);
    const malformedArgs = `{"inputPath":"${signedUrl}`;

    const result = await agent.callExecuteTool(
      {
        id: 'thumbnail_1',
        type: 'function',
        function: {
          name: 'ffmpeg_generate_thumbnail',
          arguments: malformedArgs,
        },
      },
      registry,
      'viewer-1',
      { allowedToolNames: ['ffmpeg_generate_thumbnail'] }
    );

    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          imageUrl: 'https://cdn.example.com/generated-frame.jpg',
          inputPath: signedUrl,
        }),
      })
    );
  });

  it('prefers draft team post copy over raw team identifiers in tool step labels', () => {
    const agent = new FakeAgent();
    const teamId = 'mC3D9qg5d9amvcO0otvi';

    const label = agent['resolveToolInvocationLabel']('write_team_post', {
      teamId,
      teamCode: 'crown-point-basketball',
      posts: [
        {
          content: 'Big win tonight. Crown Point moves to 18-2 after a complete team effort.',
        },
      ],
    });

    expect(label).toContain('Publishing team update: Big win tonight.');
    expect(label).toContain('Crown Point moves to 18-2');
    expect(label).not.toContain(teamId);
  });

  it('normalizes delete timeline post labels without surfacing raw post ids', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('delete_timeline_post', {
      postId: 'RZ4Pb1u7FpAhdRaNoUaF',
    });

    expect(label).toBe('Delete Timeline Post');
    expect(label).not.toContain('RZ4Pb1u7FpAhdRaNoUaF');
  });

  it('emits stable step ids and contextual labels for parallel tool calls', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeSearchCollegeCoachesTool());

    const events: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const llm = {
      completeStream: vi.fn().mockImplementation(async (_messages, _options, _onDelta) => {
        callCount += 1;

        if (callCount === 1) {
          return {
            content: 'Let me search for coaching staff contact information.',
            toolCalls: [
              {
                id: 'call_ohio_state',
                type: 'function',
                function: {
                  name: 'search_college_coaches',
                  arguments: JSON.stringify({ schoolName: 'Ohio State' }),
                },
              },
              {
                id: 'call_michigan',
                type: 'function',
                function: {
                  name: 'search_college_coaches',
                  arguments: JSON.stringify({ schoolName: 'Michigan' }),
                },
              },
            ],
            model: 'test-model',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            costUsd: 0,
            finishReason: 'tool_calls',
          };
        }

        return {
          content: 'Found coaching contacts for both schools.',
          toolCalls: [],
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          costUsd: 0,
          finishReason: 'stop',
        };
      }),
    };

    await agent.execute(
      'Find coach contacts',
      createMockContext(),
      [],
      llm as never,
      registry,
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    const activeEvents = events.filter((event) => event['type'] === 'step_active');
    const resultEvents = events.filter((event) => event['type'] === 'tool_result');

    expect(activeEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: 'call_ohio_state',
          message: 'Searching coaching staff: Ohio State',
        }),
        expect.objectContaining({
          stepId: 'call_michigan',
          message: 'Searching coaching staff: Michigan',
        }),
      ])
    );

    expect(resultEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: 'call_ohio_state',
          message: 'Searching coaching staff: Ohio State',
        }),
        expect.objectContaining({
          stepId: 'call_michigan',
          message: 'Searching coaching staff: Michigan',
        }),
      ])
    );
  });

  it('emits a terminal tool_result before rethrowing delegation control flow', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeDelegateTaskTool());

    const events: Array<Record<string, unknown>> = [];
    const llm = {
      completeStream: vi.fn().mockResolvedValue({
        content: 'I need to transfer this request.',
        toolCalls: [
          {
            id: 'call_delegate',
            type: 'function',
            function: {
              name: 'delegate_task',
              arguments: JSON.stringify({ forwarding_intent: 'Find the right specialist' }),
            },
          },
        ],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'tool_calls',
      }),
    };

    await expect(
      agent.execute(
        'Find the right specialist',
        createMockContext(),
        [],
        llm as never,
        registry,
        undefined,
        (event) => events.push(event as unknown as Record<string, unknown>)
      )
    ).rejects.toBeInstanceOf(AgentDelegationException);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'step_active',
          stepId: 'call_delegate',
          toolName: 'delegate_task',
        }),
        expect.objectContaining({
          type: 'tool_result',
          stepId: 'call_delegate',
          toolName: 'delegate_task',
          toolSuccess: true,
          toolResult: { delegated: true },
        }),
      ])
    );
  });

  it('persists structured tool errors in tool_result events', async () => {
    const agent = new FakePerformanceAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeFailTool());

    const events: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const llm = {
      completeStream: vi.fn().mockImplementation(async () => {
        callCount += 1;

        if (callCount === 1) {
          return {
            content: 'I will try the image tool first.',
            toolCalls: [
              {
                id: 'call_fail_graphic',
                type: 'function',
                function: {
                  name: 'analyze_video',
                  arguments: JSON.stringify({}),
                },
              },
            ],
            model: 'test-model',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            costUsd: 0,
            finishReason: 'tool_calls',
          };
        }

        return {
          content: 'The image tool failed and I need another path.',
          toolCalls: [],
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          costUsd: 0,
          finishReason: 'stop',
        };
      }),
    };

    await agent.execute(
      'Create a graphic',
      createMockContext(),
      [],
      llm as never,
      registry,
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_result',
          stepId: 'call_fail_graphic',
          toolName: 'analyze_video',
          toolSuccess: false,
          error: 'OpenAI image API error 500: upstream image model unavailable.',
          toolResult: {
            error: 'OpenAI image API error 500: upstream image model unavailable.',
          },
        }),
      ])
    );
  });

  it('treats ask_user as an exclusive yield tool when sibling tools are co-emitted', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new AskUserTool());
    registry.register(new FakeDelegateTaskTool());

    const llm = {
      completeStream: vi.fn().mockResolvedValue({
        content: 'I need one detail before routing this.',
        toolCalls: [
          {
            id: 'call_ask_user',
            type: 'function',
            function: {
              name: 'ask_user',
              arguments: JSON.stringify({ question: 'Practice defaults?' }),
            },
          },
          {
            id: 'call_delegate',
            type: 'function',
            function: {
              name: 'delegate_task',
              arguments: JSON.stringify({ forwarding_intent: 'Build the script' }),
            },
          },
        ],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'tool_calls',
      }),
    };

    let yielded: AgentYieldException | undefined;
    try {
      await agent.execute(
        'Build a practice script',
        createMockContext(),
        [],
        llm as never,
        registry,
        undefined,
        () => undefined
      );
    } catch (err) {
      if (err instanceof AgentYieldException) yielded = err;
      else throw err;
    }

    expect(yielded).toBeDefined();
    const assistantWithToolCalls = yielded?.payload.messages.find(
      (message) => message.role === 'assistant' && (message.tool_calls?.length ?? 0) > 0
    );

    expect(assistantWithToolCalls?.tool_calls?.map((toolCall) => toolCall.function.name)).toEqual([
      'ask_user',
    ]);
  });

  it('blocks brand coordinator media delegation and returns an actionable error', async () => {
    const agent = new FakeBrandAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeUniversalDelegateTaskTool());

    const observation = await agent.callExecuteTool(
      {
        id: 'call_delegate_media',
        type: 'function',
        function: {
          name: 'delegate_task',
          arguments: JSON.stringify({
            forwarding_intent: 'The ffmpeg merge for this highlight reel failed, delegate this.',
          }),
        },
      },
      registry,
      'viewer-1',
      {
        operationId: 'op-brand-media-delegate-block',
        sessionId: 'session-brand-media-delegate-block',
        allowedToolNames: ['delegate_task'],
      },
      [
        {
          role: 'assistant',
          content: 'I attempted ffmpeg_merge_videos and it failed.',
          tool_calls: [
            {
              id: 'ffmpeg_call_1',
              type: 'function',
              function: {
                name: 'ffmpeg_merge_videos',
                arguments: JSON.stringify({ inputPaths: ['a.mp4'] }),
              },
            },
          ],
        },
      ]
    );

    expect(JSON.parse(observation)).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Delegation is blocked for this media request'),
      })
    );
  });

  it('still allows brand coordinator to delegate non-media out-of-domain requests', async () => {
    const agent = new FakeBrandAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeUniversalDelegateTaskTool());

    await expect(
      agent.callExecuteTool(
        {
          id: 'call_delegate_non_media',
          type: 'function',
          function: {
            name: 'delegate_task',
            arguments: JSON.stringify({
              forwarding_intent:
                'This request is to audit Firestore analytics exports and data quality checks.',
            }),
          },
        },
        registry,
        'viewer-1',
        {
          operationId: 'op-brand-non-media-delegate-allowed',
          sessionId: 'session-brand-non-media-delegate-allowed',
          allowedToolNames: ['delegate_task'],
        }
      )
    ).rejects.toBeInstanceOf(AgentDelegationException);
  });

  it('humanizes Microsoft MCP progress labels for non-developer phrasing', async () => {
    const agent = new FakeMicrosoftAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeRunMicrosoftTool());

    const events: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const llm = {
      completeStream: vi.fn().mockImplementation(async () => {
        callCount += 1;

        if (callCount === 1) {
          return {
            content: 'I will check your Microsoft calendar.',
            toolCalls: [
              {
                id: 'call_ms_calendar',
                type: 'function',
                function: {
                  name: 'run_microsoft_365_tool',
                  arguments: JSON.stringify({
                    toolName: 'list-calendar-events',
                    arguments: { top: 5 },
                  }),
                },
              },
            ],
            model: 'test-model',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            costUsd: 0,
            finishReason: 'tool_calls',
          };
        }

        return {
          content: 'Done checking your calendar.',
          toolCalls: [],
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          costUsd: 0,
          finishReason: 'stop',
        };
      }),
    };

    await agent.execute(
      'Check my calendar',
      createMockContext(),
      [],
      llm as never,
      registry,
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'step_active',
          stepId: 'call_ms_calendar',
          message: 'Using Microsoft 365: calendar events',
        }),
      ])
    );
  });

  it('humanizes Firecrawl monitor progress labels for non-developer phrasing', async () => {
    const expectations = [
      ['list_firecrawl_monitors', 'Reviewing page monitors'],
      ['get_firecrawl_monitor', 'Reviewing monitor details'],
      ['write_firecrawl_monitor', 'Enabling page monitor'],
      ['update_firecrawl_monitor', 'Updating monitor settings'],
      ['delete_firecrawl_monitor', 'Removing page monitor'],
      ['get_firecrawl_monitor_check', 'Reviewing monitor results'],
    ] as const;

    for (const [toolName, expectedLabel] of expectations) {
      const agent = new FakeFirecrawlMonitorAgent([toolName]);
      const registry = new ToolRegistry();
      registry.register(new FakeFirecrawlMonitorTool(toolName));

      const events: Array<Record<string, unknown>> = [];
      let callCount = 0;
      const llm = {
        completeStream: vi.fn().mockImplementation(async () => {
          callCount += 1;

          if (callCount === 1) {
            return {
              content: 'Checking monitor status.',
              toolCalls: [
                {
                  id: `call_${toolName}`,
                  type: 'function',
                  function: {
                    name: toolName,
                    arguments: '{}',
                  },
                },
              ],
              model: 'test-model',
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              latencyMs: 1,
              costUsd: 0,
              finishReason: 'tool_calls',
            };
          }

          return {
            content: 'Done checking monitor status.',
            toolCalls: [],
            model: 'test-model',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            costUsd: 0,
            finishReason: 'stop',
          };
        }),
      };

      await agent.execute(
        'Check my monitor settings',
        createMockContext(),
        [],
        llm as never,
        registry,
        undefined,
        (event) => events.push(event as unknown as Record<string, unknown>)
      );

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'step_active',
            stepId: `call_${toolName}`,
            message: expectedLabel,
          }),
        ])
      );
    }
  });

  it('emits one LLM-generated progress commentary for a large single tool burst', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeReadTool());

    const events: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Finished the query burst and now consolidating findings.',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
      completeStream: vi.fn().mockImplementation(async () => {
        callCount += 1;

        if (callCount === 1) {
          return {
            content: 'Running checks.',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'fake_read_tool', arguments: '{}' },
              },
              {
                id: 'call_2',
                type: 'function',
                function: { name: 'fake_read_tool', arguments: '{}' },
              },
              {
                id: 'call_3',
                type: 'function',
                function: { name: 'fake_read_tool', arguments: '{}' },
              },
              {
                id: 'call_4',
                type: 'function',
                function: { name: 'fake_read_tool', arguments: '{}' },
              },
              {
                id: 'call_5',
                type: 'function',
                function: { name: 'fake_read_tool', arguments: '{}' },
              },
              {
                id: 'call_6',
                type: 'function',
                function: { name: 'fake_read_tool', arguments: '{}' },
              },
            ],
            model: 'test-model',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            costUsd: 0,
            finishReason: 'tool_calls',
          };
        }

        return {
          content: 'All set.',
          toolCalls: [],
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          costUsd: 0,
          finishReason: 'stop',
        };
      }),
    };

    const result = await agent.execute(
      'Run checks',
      createMockContext(),
      [],
      llm as never,
      registry,
      undefined,
      (event) => events.push(event as unknown as Record<string, unknown>)
    );

    const commentaryEvent = events.find(
      (event) =>
        event['type'] === 'delta' &&
        event['noBatch'] === true &&
        String(event['text'] ?? '').includes('consolidating findings')
    );

    expect(commentaryEvent).toBeDefined();
    expect(vi.mocked(llm.complete)).toHaveBeenCalledTimes(1);
    const progressPromptMessages = vi.mocked(llm.complete).mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    expect(progressPromptMessages[1]?.content).toContain('Completed tool calls: 6');
    expect(result.summary).not.toContain('consolidating findings');
  });

  it('injects PDF attachments as document refs and instructs parse_document explicitly', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Processed attachments.',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
    };

    const context: AgentSessionContext = {
      ...createMockContext(),
      attachments: [
        { url: 'https://storage.example/image.jpg', mimeType: 'image/jpeg' },
        {
          url: 'https://storage.example/report.pdf',
          mimeType: 'application/pdf',
          name: 'report.pdf',
        },
      ],
      videoAttachments: [
        {
          url: 'https://video.example/clip.mp4',
          mimeType: 'video/mp4',
          name: 'clip.mp4',
          storagePath: 'Users/user-123/uploads/clip.mp4',
          cloudflareVideoId: 'cf-video-123',
        },
      ],
    };

    await agent.execute('Analyze these files', context, [], llm as never, registry);

    const completeMessages = vi.mocked(llm.complete).mock.calls[0]?.[0] as Array<{
      role: string;
      content: unknown;
    }>;
    const userMessage = completeMessages.find((message) => message.role === 'user');
    expect(userMessage).toBeDefined();
    expect(Array.isArray(userMessage?.content)).toBe(true);

    const contentParts = userMessage?.content as Array<Record<string, unknown>>;
    const imageParts = contentParts.filter((part) => part['type'] === 'image_url');
    const textPart = contentParts.find((part) => part['type'] === 'text');
    const textBody = String((textPart?.['text'] as string | undefined) ?? '');
    const llmOptions = vi.mocked(llm.complete).mock.calls[0]?.[1] as {
      tier?: string;
    };

    // Images sent as image_url parts
    expect(imageParts).toHaveLength(1);
    expect(JSON.stringify(imageParts[0])).toContain('https://storage.example/image.jpg');

    // Text body includes explicit document/video references and parse_document guidance
    expect(textBody).toContain(
      '[Attached video (already visible to user — do not re-embed): clip.mp4 — https://video.example/clip.mp4 | storagePath: Users/user-123/uploads/clip.mp4 | cloudflareVideoId: cf-video-123]'
    );
    expect(textBody).toContain(
      '[Attached document (already visible to user — do not re-embed): https://storage.example/report.pdf | name: report.pdf | mimeType: application/pdf]'
    );
    expect(textBody).toContain('your FIRST tool must be parse_document');
    expect(textBody).toContain(
      'Never use scrape_webpage or open_live_view for direct document URLs'
    );
    expect(textBody).not.toContain('[Extracted Attachment Content]');
    expect(textBody).not.toContain('[Attachment Extract:');

    expect(llmOptions?.tier).toBe('vision_analysis');
  });

  it('does not duplicate video refs already injected by the chat route', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Processed video.',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
    };
    const videoUrl = 'https://storage.googleapis.com/nxt1-test/highlight-source.mp4';

    await agent.execute(
      `Make a highlight reel\n\n[Attached video (already visible to user — do not re-embed): highlight-source.mp4 — ${videoUrl} | cloudflareVideoId: cf-highlight-123]`,
      {
        ...createMockContext(),
        attachments: [
          {
            url: videoUrl,
            mimeType: 'video/mp4',
            name: 'highlight-source.mp4',
            storagePath: 'Users/user-123/uploads/highlight-source.mp4',
          },
        ],
        videoAttachments: [
          {
            url: videoUrl,
            mimeType: 'video/mp4',
            name: 'highlight-source.mp4',
            storagePath: 'Users/user-123/uploads/highlight-source.mp4',
            cloudflareVideoId: 'cf-highlight-123',
          },
        ],
      },
      [],
      llm as never,
      registry
    );

    const completeMessages = vi.mocked(llm.complete).mock.calls[0]?.[0] as Array<{
      role: string;
      content: unknown;
    }>;
    const userMessage = completeMessages.find((message) => message.role === 'user');
    const textBody =
      typeof userMessage?.content === 'string'
        ? userMessage.content
        : JSON.stringify(userMessage?.content);

    expect(textBody.match(/\[Attached video \(/g) ?? []).toHaveLength(1);
    expect(textBody).toContain(videoUrl);
    expect(textBody).not.toContain(
      '[Attached document (already visible to user — do not re-embed): video/mp4'
    );
  });

  it('references CSV attachments without hidden fetches and instructs parse_document', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Parsed CSV.',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
    };

    await agent.execute(
      'Analyze attached stat sheet',
      {
        ...createMockContext(),
        attachments: [
          {
            url: 'https://storage.googleapis.com/bucket/path/stats.csv?X-Goog-Algorithm=GOOG4-RSA-SHA256',
            mimeType: 'text/csv',
            name: 'stats.csv',
            storagePath: 'Users/user-123/uploads/unbound/stats.csv',
          },
        ],
      },
      [],
      llm as never,
      registry
    );

    const completeMessages = vi.mocked(llm.complete).mock.calls[0]?.[0] as Array<{
      role: string;
      content: unknown;
    }>;
    const userMessage = completeMessages.find((message) => message.role === 'user');
    const content = userMessage?.content;
    const textBody = typeof content === 'string' ? content : JSON.stringify(content);

    expect(textBody).toContain(
      '[Attached document (already visible to user — do not re-embed): https://storage.googleapis.com/bucket/path/stats.csv?X-Goog-Algorithm=GOOG4-RSA-SHA256 | name: stats.csv | mimeType: text/csv | storagePath: Users/user-123/uploads/unbound/stats.csv]'
    );
    expect(textBody).toContain('your FIRST tool must be parse_document');
    expect(textBody).toContain(
      'Never use scrape_webpage or open_live_view for direct document URLs'
    );
    expect(textBody).not.toContain('[Extracted Attachment Content]');
    expect(textBody).not.toContain('| name | points | assists |');
  });

  it('inlines signed storage image attachments as data URLs before calling the vision model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'image/png',
          'content-length': '4',
        }),
        arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
      })
    );

    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Processed image.',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
    };

    await agent.execute(
      'Analyze this image',
      {
        ...createMockContext(),
        attachments: [
          {
            url: 'https://storage.googleapis.com/bucket/path/image.png?X-Goog-Algorithm=GOOG4-RSA-SHA256',
            mimeType: 'image/png',
            storagePath: 'Users/user-123/uploads/unbound/image.png',
          },
        ],
      },
      [],
      llm as never,
      registry
    );

    const completeMessages = vi.mocked(llm.complete).mock.calls[0]?.[0] as Array<{
      role: string;
      content: unknown;
    }>;
    const userMessage = completeMessages.find((message) => message.role === 'user');
    const contentParts = userMessage?.content as Array<Record<string, unknown>>;
    const textPart = contentParts.find((part) => part['type'] === 'text') as
      | { text?: string }
      | undefined;
    const imagePart = contentParts.find((part) => part['type'] === 'image_url');
    const imagePayload = imagePart?.['image_url'] as { url?: string } | undefined;

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    expect(textPart?.text).toContain(
      '[Attached image (already visible to user — do not re-embed): image-1'
    );
    expect(textPart?.text).toContain(
      'https://storage.googleapis.com/bucket/path/image.png?X-Goog-Algorithm=GOOG4-RSA-SHA256'
    );
    expect(textPart?.text).toContain('Use attached image URLs when calling image-analysis tools.');
    expect(imagePayload?.url).toBe('data:image/png;base64,AQIDBA==');
  });

  it('injects deterministic compute-first prompt guidance for numeric intents', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'You have 12 offers.',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
    };

    await agent.execute(
      'How many offers do I have?',
      createMockContext(),
      [],
      llm as never,
      registry
    );

    const messages = vi.mocked(llm.complete).mock.calls[0]?.[0] as Array<{
      role: string;
      content: unknown;
    }>;
    const systemMessage = messages.find((message) => message.role === 'system');
    const systemContent = String(systemMessage?.content ?? '');

    expect(systemContent).toContain('Deterministic Compute-First Rule');
    expect(systemContent).toContain('Never estimate or infer totals/counts');
  });

  it('ignores configured coordinator prompt additions and keeps the base coordinator prompt authoritative', async () => {
    setCachedAgentAppConfig(
      parseAgentAppConfig({
        prompts: {
          agentSystemPrompts: {
            strategy_coordinator: 'Operator note for {{today}}.',
          },
        },
      })
    );

    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Done.',
        toolCalls: [],
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        costUsd: 0,
        finishReason: 'stop',
      }),
    };

    await agent.execute('What should I do today?', createMockContext(), [], llm as never, registry);

    const messages = vi.mocked(llm.complete).mock.calls[0]?.[0] as Array<{
      role: string;
      content: unknown;
    }>;
    const systemMessage = messages.find((message) => message.role === 'system');
    const systemContent = String(systemMessage?.content ?? '');

    expect(systemContent).toContain('You are a test agent.');
    expect(systemContent).not.toContain('## Operator Additions');
    expect(systemContent).not.toContain('Operator note for');
  });

  it('attaches evidenceTrace metadata for numeric tool-backed responses', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    registry.register(new FakeReadTool());

    const llm = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'Let me verify that.',
          toolCalls: [
            {
              id: 'call_stats',
              type: 'function',
              function: { name: 'fake_read_tool', arguments: '{}' },
            },
          ],
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          costUsd: 0,
          finishReason: 'tool_calls',
        })
        .mockResolvedValueOnce({
          content: 'You have 12 offers.',
          toolCalls: [],
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          costUsd: 0,
          finishReason: 'stop',
        }),
    };

    const result = await agent.execute(
      'How many offers do I have?',
      createMockContext(),
      [],
      llm as never,
      registry
    );

    const evidenceTrace = (result.data?.['evidenceTrace'] ?? []) as Array<Record<string, unknown>>;
    expect(evidenceTrace.length).toBeGreaterThan(0);
    expect(evidenceTrace[0]?.['toolName']).toBe('fake_read_tool');
  });

  it('compresses middle exchanges with extraction-tier LLM summary under token pressure', async () => {
    const agent = new FakeAgent();
    const messages: LLMMessage[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'run a complex workflow' },
    ];

    for (let i = 1; i <= 8; i++) {
      messages.push({
        role: 'assistant',
        content: `calling tool ${i}`,
        tool_calls: [
          {
            id: `call_${i}`,
            type: 'function',
            function: {
              name: 'fake_read_tool',
              arguments: JSON.stringify({ index: i }),
            },
          },
        ],
      });
      messages.push({
        role: 'tool',
        tool_call_id: `call_${i}`,
        content: JSON.stringify({
          success: true,
          data: { longText: 'x'.repeat(2400), step: i },
        }),
      });
    }

    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: 'Work completed: gathered data, validated entries, and produced final artifacts.',
      }),
    };

    await agent.callCompressMessageHistoryIfNeeded({
      messages,
      llm: llm as unknown as {
        complete: (...args: unknown[]) => Promise<{ content: string | null }>;
      },
      context: createMockContext(),
      iteration: 8,
      promptBudgetTokens: 2_000,
    });

    expect(llm.complete).toHaveBeenCalledTimes(1);
    const compressedMsg = messages.find(
      (message) =>
        message.role === 'assistant' &&
        typeof message.content === 'string' &&
        message.content.startsWith('[Context compressed]')
    );
    expect(compressedMsg).toBeDefined();
    expect(messages.length).toBeLessThan(18);
  });

  it('falls back to deterministic compression summary when extraction model fails', async () => {
    const agent = new FakeAgent();
    const middleExchanges: LLMMessage[][] = [];

    for (let i = 1; i <= 4; i++) {
      middleExchanges.push([
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: `call_fail_${i}`,
              type: 'function',
              function: {
                name: 'fake_read_tool',
                arguments: JSON.stringify({ index: i }),
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: `call_fail_${i}`,
          content: JSON.stringify({
            success: i % 2 === 0,
            data: i % 2 === 0 ? { ok: true, longText: 'y'.repeat(2200), step: i } : undefined,
            error: i % 2 === 0 ? undefined : 'timeout',
          }),
        },
      ]);
    }

    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('extraction model unavailable')),
    };

    const summary = await agent.callSummarizeMiddleExchangesWithLlm(
      middleExchanges,
      llm as unknown as { complete: (...args: unknown[]) => Promise<{ content: string | null }> },
      createMockContext()
    );

    expect(summary).toContain('[Context compressed]');
    expect(summary).toContain('fake_read_tool');
  });

  it('retries transient non-mutation tool failures and returns success', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const transientTool = new FakeTransientReadTool();
    registry.register(transientTool);

    const observation = await agent.callExecuteTool(
      {
        id: 'call_retry_read',
        type: 'function',
        function: {
          name: 'fake_transient_read_tool',
          arguments: JSON.stringify({}),
        },
      },
      registry,
      'viewer-1',
      {
        operationId: 'op-tool-retry-read',
        sessionId: 'session-tool-retry-read',
        allowedToolNames: ['fake_transient_read_tool'],
      }
    );

    expect(transientTool.calls).toBe(2);
    expect(JSON.parse(observation)).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ ok: true }),
      })
    );
  });

  it('does not retry transient failures for mutation tools', async () => {
    const agent = new FakeAgent();
    const registry = new ToolRegistry();
    const mutationTool = new FakeTransientMutationTool();
    registry.register(mutationTool);

    const observation = await agent.callExecuteTool(
      {
        id: 'call_retry_mutation',
        type: 'function',
        function: {
          name: 'fake_transient_mutation_tool',
          arguments: JSON.stringify({}),
        },
      },
      registry,
      'viewer-1',
      {
        operationId: 'op-tool-retry-mutation',
        sessionId: 'session-tool-retry-mutation',
        allowedToolNames: ['fake_transient_mutation_tool'],
      }
    );

    expect(mutationTool.calls).toBe(1);
    expect(JSON.parse(observation)).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('429'),
      })
    );
  });
});
