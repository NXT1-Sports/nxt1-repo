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

describe('Agent X Routes', () => {
  let router: unknown;
  let setAgentDependencies: typeof import('../../routes/agent/shared.js').setAgentDependencies;
  let activeAbortControllers: typeof import('../../routes/agent/shared.js').activeAbortControllers;

  beforeAll(async () => {
    const module = await import('../../routes/agent/index.js');
    router = module.default;
    const shared = await import('../../routes/agent/shared.js');
    setAgentDependencies = shared.setAgentDependencies;
    activeAbortControllers = shared.activeAbortControllers;
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
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    activeAbortControllers.clear();
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
        agentId: 'strategy_coordinator',
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
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    __seedMockFirestoreDocument('AgentApprovalRequests/approval-123', {
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

    expect(__getMockFirestoreDocument('AgentApprovalRequests/approval-123')).toMatchObject({
      status: 'approved',
      resolvedBy: 'test-user',
      toolInput: editedToolInput,
    });
  });

  it('should enqueue chat and stream replayed yield events from persisted history', async () => {
    const jobRepository = createMockJobRepository();
    jobRepository.getById.mockResolvedValue({
      operationId: 'chat-op-1',
      threadId: 'thread-123',
      userId: 'test-user',
      status: 'awaiting_input',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'card',
        cardData: {
          type: 'ask_user',
          title: 'Agent X has a question',
          payload: { question: 'Which college should I target first?' },
        },
      },
      {
        seq: 2,
        type: 'done',
        message: 'Awaiting input',
        status: 'awaiting_input',
        yieldState: { reason: 'needs_input' },
      },
    ]);

    const chatService = {
      addMessage: vi.fn(),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateThreadTitle: vi.fn().mockResolvedValue(null),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
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
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'user',
        content: 'Help me build a recruiting plan',
      })
    );
  });

  it('should deduplicate /enqueue requests by idempotency key', async () => {
    const jobRepository = createMockJobRepository({
      operationId: 'op-existing-1',
      threadId: 'thread-existing-1',
      userId: 'test-user',
    });
    jobRepository.getByIdempotencyKey.mockResolvedValue({
      operationId: 'op-existing-1',
      threadId: 'thread-existing-1',
      userId: 'test-user',
    });

    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-new'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      contextBuilder: {
        buildContext: vi.fn().mockResolvedValue({}),
        compressToPrompt: vi.fn().mockReturnValue(''),
        getRecentThreadHistory: vi.fn().mockResolvedValue(''),
      } as never,
      llmService: {
        completeStream: vi.fn(),
        embed: vi.fn(),
      } as never,
      agentRouter: {
        run: vi.fn().mockResolvedValue({ summary: '', data: {} }),
      } as never,
    });

    const response = await request(app)
      .post('/api/v1/agent-x/enqueue')
      .set('Authorization', 'Bearer test-token')
      .set('x-idempotency-key', 'enqueue_retry_key_001')
      .send({ intent: 'Generate weekly outreach plan' });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.body.deduplicated).toBe(true);
    expect(response.body.data.operationId).toBe('op-existing-1');
    expect(queueService.enqueue).not.toHaveBeenCalled();
    expect(jobRepository.create).not.toHaveBeenCalled();
  });

  it('should reject invalid idempotency key format', async () => {
    const response = await request(app)
      .post('/api/v1/agent-x/enqueue')
      .set('Authorization', 'Bearer test-token')
      .set('x-idempotency-key', 'bad key with spaces')
      .send({ intent: 'Plan my recruiting week' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(String(response.body.error ?? '')).toContain('Invalid idempotency key');
  });

  it('should deny explicit cancel when operation belongs to another user', async () => {
    const foreignAbortController = new AbortController();
    activeAbortControllers.set('op-foreign', {
      controller: foreignAbortController,
      createdAt: Date.now(),
      userId: 'another-user',
    });

    const response = await request(app)
      .post('/api/v1/agent-x/cancel/op-foreign')
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(foreignAbortController.signal.aborted).toBe(false);
  });
});

function createMockJobRepository(jobDoc?: Record<string, unknown>) {
  const repository = {
    withDb: vi.fn(),
    getById: vi.fn().mockResolvedValue(jobDoc ?? null),
    getByIdempotencyKey: vi.fn().mockResolvedValue(null),
    getJobEvents: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    markYielded: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markCancelled: vi.fn().mockResolvedValue(undefined),
    markDetached: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };

  repository.withDb.mockReturnValue(repository);
  return repository;
}
