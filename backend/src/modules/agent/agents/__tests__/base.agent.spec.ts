import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentIdentifier, AgentSessionContext, ModelRoutingConfig } from '@nxt1/core';
import { z } from 'zod';
import { BaseAgent } from '../base.agent.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../tools/base.tool.js';

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
          message: 'Search College Coaches: Ohio State',
        }),
        expect.objectContaining({
          stepId: 'call_michigan',
          message: 'Search College Coaches: Michigan',
        }),
      ])
    );

    expect(resultEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: 'call_ohio_state',
          message: 'Search College Coaches: Ohio State',
        }),
        expect.objectContaining({
          stepId: 'call_michigan',
          message: 'Search College Coaches: Michigan',
        }),
      ])
    );
  });

  it('maps only image attachments to image_url content and appends document refs as text', async () => {
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
        { url: 'https://storage.example/report.pdf', mimeType: 'application/pdf' },
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
    const textPart = contentParts.find((part) => part['type'] === 'text');
    const textBody = String((textPart?.['text'] as string | undefined) ?? '');
    const llmOptions = vi.mocked(llm.complete).mock.calls[0]?.[1] as {
      tier?: string;
    };

    expect(imageParts).toHaveLength(1);
    expect(JSON.stringify(imageParts[0])).toContain('https://storage.example/image.jpg');
    expect(textBody).toContain(
      '[Attached video: clip.mp4 — https://video.example/clip.mp4 | cloudflareVideoId: cf-video-123]'
    );
    expect(textBody).toContain(
      '[Attached document: application/pdf — https://storage.example/report.pdf]'
    );
    expect(llmOptions?.tier).toBe('vision_analysis');
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
});
