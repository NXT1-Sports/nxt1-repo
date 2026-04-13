/**
 * @fileoverview Agent X Routes Tests
 * @module @nxt1/backend/routes/__tests__/agent-x
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app, {
  __getMockFirestoreDocument,
  __resetMockFirestore,
  __seedMockFirestoreDocument,
} from '../../test-app.js';
import { expectExpressRouter } from './route-test.utils.js';
import { AgentYieldException } from '../../modules/agent/errors/agent-yield.error.js';

describe('Agent X Routes', () => {
  let router: unknown;
  let setAgentDependencies: typeof import('../../routes/agent-x.routes.js').setAgentDependencies;

  beforeAll(async () => {
    const module = await import('../../routes/agent-x.routes.js');
    router = module.default;
    setAgentDependencies = module.setAgentDependencies;
  }, 15_000);

  beforeEach(() => {
    __resetMockFirestore();
    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetMockFirestore();
  });

  it('should export a valid Express router', () => {
    expectExpressRouter(
      router,
      [
        { path: '/cancel/:id', method: 'post' },
        { path: '/history', method: 'get' },
        { path: '/operations-log', method: 'get' },
        { path: '/dashboard', method: 'get' },
        { path: '/threads', method: 'get' },
      ],
      5
    );
  });

  it('should resolve approvals with edited tool input and resume the exact pending call', async () => {
    const jobRepository = createMockJobRepository({
      userId: 'test-user',
      intent: 'Send a recruiting email',
      threadId: 'thread-123',
      yieldState: {
        reason: 'needs_approval',
        promptToUser: 'Review this email before sending.',
        agentId: 'general',
        messages: [{ role: 'user', content: 'Draft an email' }],
        pendingToolCall: {
          toolName: 'send_email',
          toolInput: {
            toEmail: 'old@example.com',
            subject: 'Old subject',
            bodyHtml: '<p>Old body</p>',
          },
          toolCallId: 'tool-1',
        },
        approvalId: 'approval-123',
        yieldedAt: '2026-04-12T00:00:00.000Z',
        expiresAt: '2026-04-13T00:00:00.000Z',
      },
      status: 'awaiting_approval',
    });
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn(),
        compressToPrompt: vi.fn(),
        getRecentThreadHistory: vi.fn(),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
    });

    __seedMockFirestoreDocument('agentApprovalRequests/approval-123', {
      userId: 'test-user',
      status: 'pending',
      operationId: 'op-original',
      toolInput: {
        toEmail: 'old@example.com',
        subject: 'Old subject',
        bodyHtml: '<p>Old body</p>',
      },
    });

    const editedToolInput = {
      toEmail: 'coach@example.com',
      subject: 'Updated subject',
      bodyHtml: '<p>Updated body</p>',
    };

    const response = await request(app)
      .post('/api/v1/agent-x/approvals/approval-123/resolve')
      .set('Authorization', 'Bearer test-token')
      .send({ decision: 'approved', toolInput: editedToolInput });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        approvalId?: string;
        yieldState?: {
          pendingToolCall?: {
            toolInput?: Record<string, unknown>;
          };
        };
      };
    };
    expect(resumedPayload.context?.approvalId).toBe('approval-123');
    expect(resumedPayload.context?.yieldState?.pendingToolCall?.toolInput).toEqual(editedToolInput);

    expect(__getMockFirestoreDocument('agentApprovalRequests/approval-123')).toMatchObject({
      status: 'approved',
      resolvedBy: 'test-user',
      toolInput: editedToolInput,
    });
  });

  it('should persist and surface inline needs_input yields from /chat', async () => {
    const jobRepository = createMockJobRepository();
    const chatService = {
      addMessage: vi.fn(),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateThreadTitle: vi.fn().mockResolvedValue(null),
    };
    const llmService = {
      completeStream: vi
        .fn()
        .mockImplementation(
          async (
            _messages: unknown,
            _options: unknown,
            onDelta?: (delta: { toolName?: string; toolCallIndex?: number }) => void
          ) => {
            onDelta?.({ toolName: 'ask_user', toolCallIndex: 0 });
            return {
              model: 'openai/gpt-4.1-mini',
              usage: { inputTokens: 10, outputTokens: 5 },
              content: '',
              toolCalls: [
                {
                  id: 'tool-ask-user-1',
                  type: 'function',
                  function: {
                    name: 'ask_user',
                    arguments: JSON.stringify({ question: 'Which college should I target first?' }),
                  },
                },
              ],
            };
          }
        ),
      embed: vi.fn(),
    };
    const toolRegistry = {
      getDefinitions: vi.fn().mockReturnValue([
        {
          name: 'ask_user',
          description: 'Ask the user for missing context.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string' },
            },
            required: ['question'],
          },
        },
      ]),
      execute: vi.fn().mockRejectedValue(
        new AgentYieldException({
          reason: 'needs_input',
          promptToUser: 'Which college should I target first?',
          agentId: 'general',
          messages: [{ role: 'assistant', content: null }],
        })
      ),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: llmService as never,
      toolRegistry: toolRegistry as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Help me build a recruiting plan', mode: 'recruiting' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Which college should I target first?');
    expect(response.text).toContain('"status":"awaiting_input"');
    expect(response.text).toContain('"yieldState"');
    expect(jobRepository.create).toHaveBeenCalledTimes(1);
    expect(jobRepository.markYielded).toHaveBeenCalledTimes(1);
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'assistant',
        content: 'Which college should I target first?',
      })
    );
  });
});

function createMockJobRepository(jobDoc?: Record<string, unknown>) {
  const repository = {
    withDb: vi.fn(),
    getById: vi.fn().mockResolvedValue(jobDoc ?? null),
    create: vi.fn().mockResolvedValue(undefined),
    markYielded: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markCancelled: vi.fn().mockResolvedValue(undefined),
  };

  repository.withDb.mockReturnValue(repository);
  return repository;
}
