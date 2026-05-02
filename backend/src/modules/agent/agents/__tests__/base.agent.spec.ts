import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { z } from 'zod';
import { BaseAgent } from '../base.agent.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../tools/base.tool.js';
import { AgentDelegationException } from '../../exceptions/agent-delegation.exception.js';
import type { LLMMessage, LLMToolCall } from '../../llm/llm.types.js';
import {
  resetOperationMemoryServiceForTests,
  getOperationMemoryService,
} from '../../services/operation-memory.service.js';

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

class FakeAgent extends BaseAgent {
  readonly id: AgentIdentifier = 'strategy_coordinator';
  readonly name = 'Fake Agent';

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

  callExecuteTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    sessionContext?: {
      operationId?: string;
      sessionId?: string;
      threadId?: string;
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
  readonly category = 'search' as const;
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

class FakeRunMicrosoftTool extends BaseTool {
  readonly name = 'run_microsoft_365_tool';
  readonly description = 'Executes a Microsoft 365 MCP tool.';
  readonly parameters = z.object({
    toolName: z.string(),
    arguments: z.record(z.unknown()).optional(),
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
  resetOperationMemoryServiceForTests();
});

describe('BaseAgent identifier scrubbing', () => {
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
    expect(result.summary).not.toContain('/profile/123456');
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
    expect(toolResultRecord[0]?.['output']).toEqual({ name: 'Jordan Miles' });
    expect(deltaEvents.some((event) => String(event['text'] ?? '').includes('user-123'))).toBe(
      false
    );
    expect(result.summary).not.toContain('team-789');
    expect(result.data).toEqual(
      expect.objectContaining({
        toolCallRecords: expect.any(Array),
        name: 'Jordan Miles',
      })
    );
  });

  it('compacts URL descriptors in shared tool step labels', () => {
    const agent = new FakeAgent();

    const label = agent['resolveToolInvocationLabel']('analyze_video', {
      url: 'https://hudl.com/video/abc123',
    });

    expect(label).toBe('Analyzing game film: Hudl');
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

    expect(args['artifact']).toEqual({ source: 'hudl', clipId: 'abc123' });
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

  it('sends PDF attachments natively to OpenRouter; does not extract', async () => {
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
    const fileParts = contentParts.filter((part) => part['type'] === 'file');
    const textPart = contentParts.find((part) => part['type'] === 'text');
    const textBody = String((textPart?.['text'] as string | undefined) ?? '');
    const llmOptions = vi.mocked(llm.complete).mock.calls[0]?.[1] as {
      tier?: string;
    };

    // PDFs sent as native file parts (no extracted text)
    expect(fileParts).toHaveLength(1);
    expect(JSON.stringify(fileParts[0])).toContain('report.pdf');
    expect(JSON.stringify(fileParts[0])).toContain('https://storage.example/report.pdf');

    // Images sent as image_url parts
    expect(imageParts).toHaveLength(1);
    expect(JSON.stringify(imageParts[0])).toContain('https://storage.example/image.jpg');

    // Text body includes video reference but NOT extracted PDF content
    expect(textBody).toContain(
      '[Attached video: clip.mp4 — https://video.example/clip.mp4 | cloudflareVideoId: cf-video-123]'
    );

    // Ensure extracted PDF content is NOT in the text (native path only)
    expect(textBody).not.toContain('[Extracted Attachment Content]');
    expect(textBody).not.toContain('[Attachment Extract:');

    // Should still have simple PDF reference line
    expect(textBody).toContain(
      '[Attached document: application/pdf — https://storage.example/report.pdf]'
    );

    expect(llmOptions?.tier).toBe('vision_analysis');
  });

  it('extracts CSV attachment content and appends parsed preview to user intent text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'text/csv',
          'content-length': '72',
        }),
        arrayBuffer: vi
          .fn()
          .mockResolvedValue(
            new TextEncoder().encode('name,points,assists\nJordan,24,6\nAvery,18,9').buffer
          ),
      })
    );

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

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    expect(textBody).toContain('[Attached document: text/csv');
    expect(textBody).toContain('[Extracted Attachment Content]');
    expect(textBody).toContain('| name | points | assists |');
    expect(textBody).toContain('| Jordan | 24 | 6 |');
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
    const imagePart = contentParts.find((part) => part['type'] === 'image_url');
    const imagePayload = imagePart?.['image_url'] as { url?: string } | undefined;

    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
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
});
