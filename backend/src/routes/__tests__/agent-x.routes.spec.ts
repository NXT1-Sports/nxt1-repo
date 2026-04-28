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
  let chatRouteTestUtils: typeof import('../../routes/agent/chat.routes.js').__agentChatRouteTestUtils;

  beforeAll(async () => {
    const module = await import('../../routes/agent/index.js');
    router = module.default;
    const shared = await import('../../routes/agent/shared.js');
    setAgentDependencies = shared.setAgentDependencies;
    activeAbortControllers = shared.activeAbortControllers;
    const chatRoutes = await import('../../routes/agent/chat.routes.js');
    chatRouteTestUtils = chatRoutes.__agentChatRouteTestUtils;
  }, 15_000);

  beforeEach(() => {
    __resetMockFirestore();
    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
        cancel: vi.fn().mockResolvedValue(true),
      } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: null,
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
    chatRouteTestUtils.clearActiveUserStreams();
    __resetMockFirestore();
  });

  it('should fetch a message and append viewed annotation', async () => {
    const messageId = '64f10b2a6f1c2e0c1d3e8a10';
    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: messageId,
        threadId: '64f10b2a6f1c2e0c1d3e8a11',
        userId: 'test-user',
        role: 'assistant',
        content: 'Test reply',
        origin: 'user',
        createdAt: new Date().toISOString(),
      }),
      appendMessageAction: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
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

    const response = await request(app)
      .get(`/api/v1/agent-x/messages/${messageId}`)
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(chatService.appendMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'viewed', messageId })
    );
  });

  it('should edit a user message and enqueue rerun operation', async () => {
    const messageId = '64f10b2a6f1c2e0c1d3e8a20';
    const threadId = '64f10b2a6f1c2e0c1d3e8a21';
    const nowIso = new Date().toISOString();

    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Old prompt',
        origin: 'user',
        createdAt: nowIso,
      }),
      editUserMessage: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Updated prompt',
        origin: 'user',
        createdAt: nowIso,
      }),
      getNextAssistantMessage: vi.fn().mockResolvedValue(null),
      softDeleteMessage: vi.fn(),
    };
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
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

    const response = await request(app)
      .put(`/api/v1/agent-x/messages/${messageId}`)
      .set('Authorization', 'Bearer test-token')
      .send({
        message: 'Updated prompt',
        threadId,
        reason: 'clarification',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.rerunEnqueued).toBe(true);
    expect(queueService.enqueue).toHaveBeenCalledTimes(1);
  });

  it('should delete, undo, submit feedback, and annotate message', async () => {
    const messageId = '64f10b2a6f1c2e0c1d3e8a30';
    const threadId = '64f10b2a6f1c2e0c1d3e8a31';
    const nowIso = new Date().toISOString();

    const chatService = {
      getMessageById: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Delete me',
        origin: 'user',
        createdAt: nowIso,
      }),
      softDeleteMessage: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Delete me',
        origin: 'user',
        createdAt: nowIso,
      }),
      getNextAssistantMessage: vi.fn().mockResolvedValue(null),
      undoSoftDelete: vi.fn().mockResolvedValue({
        id: messageId,
        threadId,
        userId: 'test-user',
        role: 'user',
        content: 'Delete me',
        origin: 'user',
        createdAt: nowIso,
      }),
      setMessageFeedback: vi.fn().mockResolvedValue(true),
      appendMessageAction: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: { enqueue: vi.fn() } as never,
      jobRepository: createMockJobRepository() as never,
      chatService: chatService as never,
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

    const deleteRes = await request(app)
      .post(`/api/v1/agent-x/messages/${messageId}/delete`)
      .set('Authorization', 'Bearer test-token')
      .send({ threadId, deleteResponse: false });

    expect(deleteRes.status).toBe(200);
    const restoreTokenId = deleteRes.body.data.restoreTokenId as string;
    expect(typeof restoreTokenId).toBe('string');

    const undoRes = await request(app)
      .post(`/api/v1/agent-x/messages/${messageId}/undo`)
      .set('Authorization', 'Bearer test-token')
      .send({ restoreTokenId });
    expect(undoRes.status).toBe(200);

    const feedbackRes = await request(app)
      .post(`/api/v1/agent-x/messages/${messageId}/feedback`)
      .set('Authorization', 'Bearer test-token')
      .send({ threadId, rating: 5, category: 'helpful', text: 'Great answer' });
    expect(feedbackRes.status).toBe(200);

    const annotateRes = await request(app)
      .post(`/api/v1/agent-x/messages/${messageId}/annotation`)
      .set('Authorization', 'Bearer test-token')
      .send({ action: 'copied', metadata: { source: 'chat_bubble' } });
    expect(annotateRes.status).toBe(200);
  });

  it('should export a valid Express router', () => {
    expectExpressRouter(
      router,
      [
        { path: '/pause/:id', method: 'post' },
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
    const chatService = {
      addMessage: vi.fn(),
      clearThreadPausedYieldState: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
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
    expect(chatService.clearThreadPausedYieldState).toHaveBeenCalledWith('thread-123');
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
    expect(chatService.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'strategy_coordinator',
      })
    );

    const payload = vi.mocked(jobRepository.create).mock.calls[0][0] as { agent?: unknown };
    expect(payload.agent).toBeUndefined();
  });

  it('should stream a billing-action card when chat is blocked by the billing gate', async () => {
    const now = new Date();
    const periodKey = now.toISOString().slice(0, 7);
    const timestamp = { seconds: Math.floor(now.getTime() / 1000), nanoseconds: 0 };

    __seedMockFirestoreDocument('Users/test-user', {
      activeBillingTarget: {
        ownerId: 'test-user',
        ownerType: 'individual',
        source: 'default',
      },
    });
    __seedMockFirestoreDocument('Wallets/test-user', {
      balanceCents: 0,
      pendingHoldsCents: 100,
      iapLowBalanceNotified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    __seedMockFirestoreDocument('BillingPreferences/test-user', {
      hardStop: true,
      paymentProvider: 'iap',
      budgetInterval: 'monthly',
      budgetAlertsEnabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    __seedMockFirestoreDocument(`PeriodLedgers/test-user:${periodKey}`, {
      monthlyBudget: 0,
      currentPeriodSpend: 0,
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      periodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
      ).toISOString(),
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const jobRepository = createMockJobRepository();
    const chatService = {
      addMessage: vi.fn(),
      createThread: vi.fn().mockResolvedValue({ id: 'thread-123' }),
      getThread: vi.fn().mockResolvedValue(null),
      generateTitleFromPromptOnly: vi.fn().mockResolvedValue(null),
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
      .send({ message: 'Build my recruiting plan', mode: 'recruiting' });

    expect(response.status).toBe(200);
    const events = parseSseEvents(response.text).filter((event) => event.event.length > 0);

    expect(events.map((event) => event.event)).toEqual(['thread', 'delta', 'card', 'done']);
    expect(events[0]?.data).toMatchObject({ threadId: 'thread-123' });
    expect(events[1]?.data).toMatchObject({
      content: expect.stringContaining('Add funds to continue this request.'),
    });
    expect(events[2]?.data).toMatchObject({
      agentId: 'router',
      type: 'billing-action',
      title: 'Add Funds to Continue',
      payload: {
        reason: 'insufficient_funds',
        description: expect.stringContaining('Wallet balance'),
      },
    });
    expect(events[3]?.data).toMatchObject({ status: 'complete', threadId: 'thread-123' });

    expect(jobRepository.create).not.toHaveBeenCalled();
    expect(queueService.enqueue).not.toHaveBeenCalled();
    expect(chatService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-123',
        role: 'user',
        content: 'Build my recruiting plan',
      })
    );
  });

  it('should normalize chat attachments to plain objects in job payload context', async () => {
    const jobRepository = createMockJobRepository();
    jobRepository.getById.mockResolvedValue({
      operationId: 'chat-op-2',
      threadId: 'thread-123',
      userId: 'test-user',
      status: 'awaiting_input',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'done',
        message: 'Awaiting input',
        status: 'awaiting_input',
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
      .send({
        message: 'Review this image',
        mode: 'recruiting',
        attachments: [
          {
            id: 'de8a1081-9654-4d6e-8c6d-5e5cb5778ab6',
            url: 'https://cdn.example.com/test-image.png',
            name: 'test-image.png',
            mimeType: 'image/png',
            type: 'image',
            sizeBytes: 12345,
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(jobRepository.create).mock.calls[0]?.[0] as {
      context?: {
        attachments?: Array<Record<string, unknown>>;
      };
    };
    const attachment = payload.context?.attachments?.[0];
    expect(attachment).toMatchObject({
      id: 'de8a1081-9654-4d6e-8c6d-5e5cb5778ab6',
      url: 'https://cdn.example.com/test-image.png',
      name: 'test-image.png',
      mimeType: 'image/png',
      type: 'image',
      sizeBytes: 12345,
    });
    expect(Object.getPrototypeOf(attachment ?? null)).toBe(Object.prototype);
  });

  it('should keep quick prompt labels visible while resolving a detailed hidden intent and plain selectedAction payload', async () => {
    const jobRepository = createMockJobRepository();
    jobRepository.getById.mockResolvedValue({
      operationId: 'chat-op-quick-action',
      threadId: 'thread-123',
      userId: 'test-user',
      status: 'awaiting_input',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'done',
        message: 'Awaiting input',
        status: 'awaiting_input',
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
      .send({
        message: 'Game Plan',
        mode: 'strategy',
        selectedAction: {
          coordinatorId: 'strategy_coordinator',
          actionId: 'strategy-priority',
          surface: 'command',
          label: 'Game Plan',
        },
      });

    expect(response.status).toBe(200);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(jobRepository.create).mock.calls[0]?.[0] as {
      intent: string;
      displayIntent: string;
      context?: {
        selectedAction?: Record<string, unknown>;
      };
    };
    const selectedAction = payload.context?.selectedAction;

    expect(payload.displayIntent).toBe('Game Plan');
    expect(payload.intent).not.toBe('Game Plan');
    expect(payload.intent).toContain('Execution requirements:');
    expect(payload.intent).toContain('Selected action: Athlete Game Plan.');
    expect(selectedAction).toMatchObject({
      coordinatorId: 'strategy_coordinator',
      actionId: 'strategy-priority',
      surface: 'command',
      label: 'Game Plan',
    });
    expect(Object.getPrototypeOf(selectedAction ?? null)).toBe(Object.prototype);
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

  it('should emit a single terminal done event when Firestore tail sees done and completed status together', async () => {
    const operationId = '3f6f0f42-8e31-4b2e-92ad-fd5e67a97a11';
    const jobRepository = createMockJobRepository();
    jobRepository.getById
      .mockResolvedValueOnce({
        operationId,
        threadId: 'thread-tail-1',
        userId: 'test-user',
        status: 'in-progress',
      })
      .mockResolvedValueOnce({
        operationId,
        threadId: 'thread-tail-1',
        userId: 'test-user',
        status: 'completed',
      });

    jobRepository.getJobEvents
      .mockResolvedValueOnce([
        {
          seq: 1,
          type: 'step_active',
          step: 'research',
          message: 'Working',
        },
      ])
      .mockResolvedValueOnce([
        {
          seq: 1,
          type: 'step_active',
          step: 'research',
          message: 'Working',
        },
        {
          seq: 2,
          type: 'done',
          message: 'Completed',
          status: 'completed',
        },
      ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
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

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Resume operation stream',
        resumeOperationId: operationId,
      });

    expect(response.status).toBe(200);

    const doneEvents = response.text.match(/event: done\n/g) ?? [];
    expect(doneEvents).toHaveLength(1);
  });

  it('should deliver replay-window events exactly once when live emits before replay resolves', async () => {
    const operationId = '9fbe4182-b5d9-4ca6-8426-2d66913d6fe4';
    let releaseReplay: (() => void) | null = null;
    const replayGate = new Promise<void>((resolve) => {
      releaseReplay = resolve;
    });

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-race-1',
      userId: 'test-user',
      status: 'processing',
    });

    const replayEvents = [
      {
        seq: 1,
        type: 'delta',
        text: 'initial',
      },
      {
        seq: 2,
        type: 'delta',
        text: 'replay-window-event',
      },
      {
        seq: 3,
        type: 'done',
        operationId,
        threadId: 'thread-race-1',
        status: 'complete',
        success: true,
      },
    ];

    jobRepository.getJobEvents.mockImplementation(async () => {
      await replayGate;
      return replayEvents;
    });

    const liveCallbacks: Array<(msg: { event: string; data: unknown }) => void> = [];
    const pubsubService = {
      isHealthy: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_id: string, callback: (msg: { event: string; data: unknown }) => void) => {
            liveCallbacks.push(callback);
            return vi.fn();
          }
        ),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: pubsubService as never,
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

    const streamPromise = new Promise<request.Response>((resolve, reject) => {
      request(app)
        .post('/api/v1/agent-x/chat')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Reconnect race test', resumeOperationId: operationId })
        .end((err, response) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
    });

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(1);
      expect(liveCallbacks.length).toBe(1);
    });

    // Simulate live event arriving during replay window (before getJobEvents resolves).
    liveCallbacks[0]?.({
      event: 'delta',
      data: {
        seq: 2,
        content: 'replay-window-event',
      },
    });

    releaseReplay?.();

    const response = await streamPromise;
    expect(response.status).toBe(200);

    const replayWindowDeltaMatches = response.text.match(/"content":"replay-window-event"/g) ?? [];
    expect(replayWindowDeltaMatches).toHaveLength(1);

    const doneEvents = response.text.match(/event: done\n/g) ?? [];
    expect(doneEvents).toHaveLength(1);
  });

  it('should emit only one terminal done when replay and live both contain terminal events', async () => {
    const operationId = 'bd4eb42f-6aa3-4c66-8f2f-fd6f0b76f3e7';
    let releaseReplay: (() => void) | null = null;
    const replayGate = new Promise<void>((resolve) => {
      releaseReplay = resolve;
    });

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-terminal-race-1',
      userId: 'test-user',
      status: 'processing',
    });

    jobRepository.getJobEvents.mockImplementation(async () => {
      await replayGate;
      return [
        {
          seq: 1,
          type: 'operation',
          operationId,
          threadId: 'thread-terminal-race-1',
          status: 'running',
          timestamp: '2026-04-25T00:00:00.000Z',
        },
        {
          seq: 2,
          type: 'done',
          operationId,
          threadId: 'thread-terminal-race-1',
          status: 'complete',
          success: true,
        },
      ];
    });

    const liveCallbacks: Array<(msg: { event: string; data: unknown }) => void> = [];
    const pubsubService = {
      isHealthy: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_id: string, callback: (msg: { event: string; data: unknown }) => void) => {
            liveCallbacks.push(callback);
            return vi.fn();
          }
        ),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: pubsubService as never,
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

    const streamPromise = new Promise<request.Response>((resolve, reject) => {
      request(app)
        .post('/api/v1/agent-x/chat')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Terminal dedupe race', resumeOperationId: operationId })
        .end((err, response) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
    });

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(1);
      expect(liveCallbacks.length).toBe(1);
    });

    // Live terminal arrives before replay resolves.
    liveCallbacks[0]?.({
      event: 'done',
      data: {
        seq: 3,
        operationId,
        threadId: 'thread-terminal-race-1',
        status: 'complete',
        success: true,
      },
    });

    releaseReplay?.();
    const response = await streamPromise;

    expect(response.status).toBe(200);
    const doneEvents = response.text.match(/event: done\n/g) ?? [];
    expect(doneEvents).toHaveLength(1);
  });

  it('should include canonical DB messageId when completion is synthesized from terminal job status', async () => {
    const operationId = 'de8f2d2a-b6d3-4ef0-b07a-3cb4f9766b67';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-synthetic-done-1',
      userId: 'test-user',
      status: 'completed',
    });
    jobRepository.getJobEvents.mockResolvedValue([]);

    const chatService = {
      addMessage: vi.fn(),
      getLatestAssistantMessageForOperation: vi.fn().mockResolvedValue({
        id: '64f10b2a6f1c2e0c1d3e8b01',
      }),
    };

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: chatService as never,
      pubsub: null,
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

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Synthetic completed terminal', resumeOperationId: operationId });

    expect(response.status).toBe(200);

    const doneEvent = parseSseEvents(response.text).find((evt) => evt.event === 'done');
    expect(doneEvent?.data?.['success']).toBe(true);
    expect(doneEvent?.data?.['messageId']).toBe('64f10b2a6f1c2e0c1d3e8b01');
    expect(chatService.getLatestAssistantMessageForOperation).toHaveBeenCalledWith(operationId);
  });

  it('should increment seq regression counter when stale live seq is received', async () => {
    const operationId = 'fbb27af3-f6e2-46b6-b5d0-14f3f9b84a2a';
    const liveCallbacks: Array<(msg: { event: string; data: unknown }) => void> = [];
    const pubsubService = {
      isHealthy: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_id: string, callback: (msg: { event: string; data: unknown }) => void) => {
            liveCallbacks.push(callback);
            return vi.fn();
          }
        ),
    };

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-seq-regression',
      userId: 'test-user',
      status: 'processing',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 2,
        type: 'operation',
        operationId,
        threadId: 'thread-seq-regression',
        status: 'running',
        timestamp: '2026-04-25T00:00:00.000Z',
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: pubsubService as never,
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

    const beforeObs = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');
    const beforeSeqRegressionTotal =
      (beforeObs.body?.data?.counters?.seqRegressionDetectedTotal as number | undefined) ?? 0;

    const streamPromise = new Promise<request.Response>((resolve, reject) => {
      request(app)
        .post('/api/v1/agent-x/chat')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Seq regression counter', resumeOperationId: operationId })
        .end((err, response) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(response);
        });
    });

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(1);
      expect(liveCallbacks.length).toBe(1);
    });

    // stale seq (1) after replay has advanced lastSeq to 2
    liveCallbacks[0]?.({
      event: 'delta',
      data: {
        seq: 1,
        content: 'stale-delta',
      },
    });

    // close stream with fresh terminal event
    liveCallbacks[0]?.({
      event: 'done',
      data: {
        seq: 3,
        operationId,
        threadId: 'thread-seq-regression',
        status: 'complete',
        success: true,
      },
    });

    const response = await streamPromise;
    expect(response.status).toBe(200);
    expect(response.text).not.toContain('stale-delta');

    const afterObs = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');
    const afterSeqRegressionTotal =
      (afterObs.body?.data?.counters?.seqRegressionDetectedTotal as number | undefined) ?? 0;

    expect(afterSeqRegressionTotal).toBeGreaterThan(beforeSeqRegressionTotal);
  });

  it('should replay title_updated and operation events for resumed operation streams', async () => {
    const operationId = '0decb9a4-c36f-468f-a5ad-5b1479d5d111';
    const jobRepository = createMockJobRepository();
    jobRepository.getById.mockResolvedValue({
      operationId,
      threadId: 'thread-replay-1',
      userId: 'test-user',
      status: 'awaiting_approval',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'title_updated',
        operationId,
        threadId: 'thread-replay-1',
        title: 'Updated Thread Title',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        seq: 2,
        type: 'operation',
        operationId,
        threadId: 'thread-replay-1',
        status: 'awaiting_approval',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
      {
        seq: 3,
        type: 'done',
        operationId,
        threadId: 'thread-replay-1',
        status: 'awaiting_approval',
        message: 'Awaiting approval',
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
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

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Resume operation replay',
        resumeOperationId: operationId,
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: title_updated');
    expect(response.text).toContain('"title":"Updated Thread Title"');
    expect(response.text).toContain('event: operation');
    expect(response.text).toContain('"status":"awaiting_approval"');
  });

  it('should replay panel events from persisted live-view tool results', async () => {
    const operationId = '11111111-2222-4333-8444-555555555555';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-live-view',
      userId: 'test-user',
      status: 'processing',
    });

    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 1,
        type: 'tool_result',
        stepId: 'step-live-view',
        toolName: 'open_live_view',
        toolSuccess: true,
        message: 'Opening virtual browser',
        toolResult: {
          autoOpenPanel: {
            type: 'live-view',
            url: 'https://connect.firecrawl.dev/session/replay-123',
            title: 'acumbbcamps.com',
          },
        },
      },
      {
        seq: 2,
        type: 'done',
        operationId,
        threadId: 'thread-live-view',
        status: 'complete',
        success: true,
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
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

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({
        message: 'Resume live view replay',
        resumeOperationId: operationId,
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: panel');
    expect(response.text).toContain('https://connect.firecrawl.dev/session/replay-123');
  });

  it.each([
    {
      name: 'happy path',
      status: 'processing',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-happy',
          threadId: 'thread-contract',
          status: 'running',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'complete',
          success: true,
        },
      ],
      expected: [
        { event: 'operation', status: 'running' },
        { event: 'done', status: 'complete' },
      ],
    },
    {
      name: 'yield path',
      status: 'awaiting_input',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-yield',
          threadId: 'thread-contract',
          status: 'awaiting_input',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'awaiting_input',
          success: true,
        },
      ],
      expected: [
        { event: 'operation', status: 'awaiting_input' },
        { event: 'done', status: 'awaiting_input' },
      ],
    },
    {
      name: 'approval path',
      status: 'awaiting_approval',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-approval',
          threadId: 'thread-contract',
          status: 'awaiting_approval',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'awaiting_approval',
          success: true,
        },
      ],
      expected: [
        { event: 'operation', status: 'awaiting_approval' },
        { event: 'done', status: 'awaiting_approval' },
      ],
    },
    {
      name: 'cancel path',
      status: 'cancelled',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-cancel',
          threadId: 'thread-contract',
          status: 'cancelled',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'cancelled',
          success: false,
        },
      ],
      expected: [
        { event: 'operation', status: 'cancelled' },
        { event: 'done', status: 'cancelled' },
      ],
    },
    {
      name: 'reconnect path',
      status: 'processing',
      afterSeq: 0,
      events: [
        {
          seq: 0,
          type: 'delta',
          text: 'old',
        },
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-reconnect',
          threadId: 'thread-contract',
          status: 'running',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'complete',
          success: true,
        },
      ],
      expected: [
        { event: 'operation', status: 'running' },
        { event: 'done', status: 'complete' },
      ],
      expectNoSubstring: '"content":"old"',
    },
    {
      name: 'failure path',
      status: 'failed',
      afterSeq: undefined,
      events: [
        {
          seq: 1,
          type: 'operation',
          operationId: 'op-contract-failure',
          threadId: 'thread-contract',
          status: 'failed',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          seq: 2,
          type: 'done',
          status: 'failed',
          success: false,
        },
      ],
      expected: [
        { event: 'operation', status: 'failed' },
        { event: 'done', status: 'failed' },
      ],
    },
  ])(
    'should enforce SSE lifecycle sequence contract for $name',
    async ({ status, afterSeq, events, expected, expectNoSubstring }) => {
      const operationId = 'a8fe6a3f-2f92-4458-9cf7-2ecfe54c0111';
      const jobRepository = createMockJobRepository({
        operationId,
        threadId: 'thread-contract',
        userId: 'test-user',
        status,
      });
      jobRepository.getJobEvents.mockResolvedValue(events);

      setAgentDependencies({
        queueService: {
          enqueue: vi.fn().mockResolvedValue('job-123'),
        } as never,
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

      const payload: Record<string, unknown> = {
        message: 'Resume operation replay',
        resumeOperationId: operationId,
      };
      if (typeof afterSeq === 'number') {
        payload['afterSeq'] = afterSeq;
      }

      const response = await request(app)
        .post('/api/v1/agent-x/chat')
        .set('Authorization', 'Bearer test-token')
        .set('Accept', 'text/event-stream')
        .send(payload);

      expect(response.status).toBe(200);
      const parsedEvents = parseSseEvents(response.text).filter(
        (evt) => evt.event === 'operation' || evt.event === 'done'
      );

      expect(parsedEvents).toHaveLength(expected.length);
      for (let i = 0; i < expected.length; i += 1) {
        const expectedEvent = expected[i];
        const actualEvent = parsedEvents[i];
        expect(actualEvent?.event).toBe(expectedEvent?.event);
        expect(actualEvent?.data?.status).toBe(expectedEvent?.status);
      }

      if (expectNoSubstring) {
        expect(response.text).not.toContain(expectNoSubstring);
      }
    }
  );

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

  it('should reject chat stream attachment when user exceeds concurrent stream limit', async () => {
    const operationId = 'd8f52f2e-85b0-4f36-a8c7-df8c3f2cc802';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-stream-limit',
      userId: 'test-user',
      status: 'in-progress',
    });

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
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

    chatRouteTestUtils.setActiveUserStreams('test-user', 5);

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Retry stream', resumeOperationId: operationId });

    expect(response.status).toBe(429);
    expect(response.body.code).toBe('AGENT_STREAM_LIMIT_REACHED');
  });

  it('should replace an existing stream for the same operation instead of rejecting at stream limit', async () => {
    const operationId = '8ef6679c-2f96-4f57-b122-6e8ca4f1ad8a';
    const beforeObs = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');
    const beforeTakeovers =
      (beforeObs.body?.data?.counters?.streamTakeoverTotal as number | undefined) ?? 0;

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-stream-takeover',
      userId: 'test-user',
      status: 'processing',
    });
    jobRepository.getJobEvents.mockResolvedValue([
      {
        seq: 11,
        type: 'done',
        operationId,
        threadId: 'thread-stream-takeover',
        status: 'complete',
        success: true,
      },
    ]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
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

    chatRouteTestUtils.setActiveUserStreams('test-user', 5);
    chatRouteTestUtils.setActiveOperationStream('test-user', operationId, 'test-stream-0');

    const response = await request(app)
      .post('/api/v1/agent-x/chat')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'text/event-stream')
      .send({ message: 'Reconnect to same operation', resumeOperationId: operationId });

    expect(response.status).toBe(200);
    expect(response.text).toContain('event: done');
    expect(chatRouteTestUtils.getActiveUserStreamCount('test-user')).toBe(4);

    const afterObs = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');
    const afterTakeovers =
      (afterObs.body?.data?.counters?.streamTakeoverTotal as number | undefined) ?? 0;
    expect(afterTakeovers).toBeGreaterThan(beforeTakeovers);
  });

  it('should emit stream_replaced to the old stream when a second client attaches to the same operation', async () => {
    const operationId = '3c8adf37-f3f0-4e11-9f0a-28f7468ecc20';
    const liveCallbacks: Array<(msg: { event: string; data: unknown }) => void> = [];
    const pubsubService = {
      isHealthy: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi
        .fn()
        .mockImplementation(
          async (_id: string, callback: (msg: { event: string; data: unknown }) => void) => {
            liveCallbacks.push(callback);
            return vi.fn();
          }
        ),
    };

    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-stream-dual',
      userId: 'test-user',
      status: 'processing',
    });
    jobRepository.getJobEvents.mockResolvedValue([]);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage: vi.fn(),
      } as never,
      pubsub: pubsubService as never,
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

    const startStreamRequest = (message: string) =>
      new Promise<request.Response>((resolve, reject) => {
        request(app)
          .post('/api/v1/agent-x/chat')
          .set('Authorization', 'Bearer test-token')
          .set('Accept', 'text/event-stream')
          .send({ message, resumeOperationId: operationId })
          .end((err, response) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(response);
          });
      });

    const firstStreamPromise = startStreamRequest('First viewer');

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(1);
    });

    const secondStreamPromise = startStreamRequest('Second viewer');

    await vi.waitFor(() => {
      expect(pubsubService.subscribe).toHaveBeenCalledTimes(2);
    });

    liveCallbacks[1]?.({
      event: 'done',
      data: {
        seq: 41,
        operationId,
        threadId: 'thread-stream-dual',
        status: 'complete',
        success: true,
      },
    });

    const [firstStreamResponse, secondStreamResponse] = await Promise.all([
      firstStreamPromise,
      secondStreamPromise,
    ]);

    expect(firstStreamResponse.status).toBe(200);
    expect(firstStreamResponse.text).toContain('event: stream_replaced');
    expect(firstStreamResponse.text).toContain('"reason":"replaced"');

    expect(secondStreamResponse.status).toBe(200);
    expect(secondStreamResponse.text).toContain('event: done');
    expect(secondStreamResponse.text).not.toContain('event: stream_replaced');
  });

  it('should expose stream observability counters and active stream counts', async () => {
    chatRouteTestUtils.setActiveUserStreams('test-user', 2);

    const response = await request(app)
      .get('/api/v1/agent-x/stream-observability')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.activeStreams.user).toBe(2);
    expect(response.body.data.activeStreams.global).toBeGreaterThanOrEqual(2);
    expect(response.body.data.counters).toBeDefined();
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

  it('should persist paused yield lifecycle when pausing an operation', async () => {
    const operationId = 'f9e26a8e-f935-4fcb-95af-6e21d33fca21';
    const pauseAbortController = new AbortController();
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-pause-1',
      userId: 'test-user',
      status: 'processing',
      progress: {
        status: 'processing',
        message: 'Working',
        agentId: 'strategy_coordinator',
        percent: 35,
        currentStep: 1,
        totalSteps: 3,
      },
    });
    jobRepository.allocateEventSeqRange.mockResolvedValue(14);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
        cancel: vi.fn().mockResolvedValue(true),
      } as never,
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

    activeAbortControllers.set(operationId, {
      controller: pauseAbortController,
      createdAt: Date.now(),
      userId: 'test-user',
    });

    const response = await request(app)
      .post(`/api/v1/agent-x/pause/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('paused');
    expect(pauseAbortController.signal.aborted).toBe(true);
    expect(jobRepository.markPaused).toHaveBeenCalledWith(
      operationId,
      expect.objectContaining({
        reason: 'needs_input',
        promptToUser: 'Operation paused. Resume whenever you are ready.',
        pendingToolCall: expect.objectContaining({
          toolName: 'resume_paused_operation',
        }),
      })
    );
    expect(jobRepository.writeJobEvent).toHaveBeenCalledTimes(1);

    const operationEventWrite = vi.mocked(jobRepository.writeJobEvent).mock.calls[0]?.[1] as {
      type?: string;
      status?: string;
      seq?: number;
      yieldState?: { pendingToolCall?: { toolName?: string } };
    };
    expect(operationEventWrite.type).toBe('operation');
    expect(operationEventWrite.status).toBe('paused');
    expect(operationEventWrite.yieldState?.pendingToolCall?.toolName).toBe(
      'resume_paused_operation'
    );
  });

  it('should resume a paused yielded job without requiring user response text', async () => {
    const operationId = 'c8d26f9c-85b6-44c9-8d4a-9958683d7e9f';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-pause-resume-1',
      userId: 'test-user',
      intent: 'Build a recruiting campaign plan',
      status: 'paused',
      yieldState: {
        reason: 'needs_input',
        promptToUser: 'Operation paused. Resume whenever you are ready.',
        agentId: 'strategy_coordinator',
        messages: [{ role: 'user', content: 'Build a recruiting campaign plan' }],
        pendingToolCall: {
          toolName: 'resume_paused_operation',
          toolInput: { operationId },
          toolCallId: 'pause_resume_op',
        },
        yieldedAt: '2026-04-25T00:00:00.000Z',
        expiresAt: '2026-05-01T00:00:00.000Z',
      },
    });

    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
      cancel: vi.fn().mockResolvedValue(true),
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

    const response = await request(app)
      .post(`/api/v1/agent-x/resume-job/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(jobRepository.create).toHaveBeenCalledTimes(1);
    expect(jobRepository.markCompleted).toHaveBeenCalledWith(
      operationId,
      expect.objectContaining({
        summary: expect.stringContaining('Resumed after pause'),
        data: expect.objectContaining({ resumedFromPause: true }),
      })
    );

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        yieldState?: {
          messages?: Array<Record<string, unknown>>;
        };
      };
    };
    expect(resumedPayload.context?.yieldState?.messages).toEqual([
      { role: 'user', content: 'Build a recruiting campaign plan' },
    ]);
  });

  it('should reuse the saved ask_user tool call id when resuming yielded input', async () => {
    const operationId = '8eec9a65-94a0-44fc-94f8-d2bdde1fa57d';
    const addMessage = vi.fn();
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-ask-user-resume-1',
      userId: 'test-user',
      intent: 'Help me plan my recruiting outreach',
      status: 'awaiting_input',
      yieldState: {
        reason: 'needs_input',
        promptToUser: 'I need a few details first.',
        agentId: 'admin_coordinator',
        messages: [
          { role: 'user', content: 'Help me plan my recruiting outreach' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_ask_user_42',
                type: 'function',
                function: {
                  name: 'ask_user',
                  arguments: '{"question":"What is your grad year?"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            content: JSON.stringify({ success: false, error: 'Tool execution was interrupted.' }),
            tool_call_id: 'call_ask_user_42',
          },
        ],
        yieldedAt: '2026-04-25T00:00:00.000Z',
        expiresAt: '2026-05-01T00:00:00.000Z',
      },
    });

    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-ask-user-123'),
      isHealthy: vi.fn().mockResolvedValue(true),
      cancel: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: jobRepository as never,
      chatService: {
        addMessage,
        clearThreadPausedYieldState: vi.fn(),
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

    const response = await request(app)
      .post(`/api/v1/agent-x/resume-job/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({ response: 'I am class of 2027 and I play point guard.' });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(addMessage).not.toHaveBeenCalled();

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        yieldState?: {
          messages?: Array<Record<string, unknown>>;
        };
      };
    };

    expect(resumedPayload.context?.yieldState?.messages).toEqual([
      { role: 'user', content: 'Help me plan my recruiting outreach' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_ask_user_42',
            type: 'function',
            function: {
              name: 'ask_user',
              arguments: '{"question":"What is your grad year?"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: JSON.stringify({
          success: true,
          data: { userResponse: 'I am class of 2027 and I play point guard.' },
        }),
        tool_call_id: 'call_ask_user_42',
      },
    ]);
  });

  it('should strip synthetic pause tool_result messages when resuming a paused job', async () => {
    const operationId = 'e06f4d6d-56e2-4d0a-ac93-6f0964138c80';
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-pause-resume-2',
      userId: 'test-user',
      intent: 'Continue paused operation',
      status: 'paused',
      yieldState: {
        reason: 'needs_input',
        promptToUser: 'Operation paused. Resume whenever you are ready.',
        agentId: 'strategy_coordinator',
        messages: [
          { role: 'user', content: 'Continue paused operation' },
          {
            role: 'tool',
            content: JSON.stringify({ success: true }),
            tool_call_id: 'pause_resume_chat-c0d95276-ad5f-44d5-b7e4-4fee0dd3d6af',
          },
        ],
        pendingToolCall: {
          toolName: 'resume_paused_operation',
          toolInput: { operationId },
          toolCallId: 'pause_resume_op',
        },
        yieldedAt: '2026-04-25T00:00:00.000Z',
        expiresAt: '2026-05-01T00:00:00.000Z',
      },
    });

    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-124'),
      isHealthy: vi.fn().mockResolvedValue(true),
      cancel: vi.fn().mockResolvedValue(true),
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

    const response = await request(app)
      .post(`/api/v1/agent-x/resume-job/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);

    const resumedPayload = vi.mocked(jobRepository.create).mock.calls[0][0] as {
      context?: {
        yieldState?: {
          messages?: Array<Record<string, unknown>>;
        };
      };
    };

    expect(resumedPayload.context?.yieldState?.messages).toEqual([
      { role: 'user', content: 'Continue paused operation' },
    ]);
  });

  it('should persist cancellation lifecycle events when cancelling an operation', async () => {
    const operationId = '54d85e88-e75f-4d4f-b97d-5579f78f2478';
    const cancelAbortController = new AbortController();
    const jobRepository = createMockJobRepository({
      operationId,
      threadId: 'thread-cancel-1',
      userId: 'test-user',
      status: 'processing',
    });
    jobRepository.allocateEventSeqRange.mockResolvedValue(8);

    setAgentDependencies({
      queueService: {
        enqueue: vi.fn().mockResolvedValue('job-123'),
      } as never,
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

    activeAbortControllers.set(operationId, {
      controller: cancelAbortController,
      createdAt: Date.now(),
      userId: 'test-user',
    });

    const response = await request(app)
      .post(`/api/v1/agent-x/cancel/${operationId}`)
      .set('Authorization', 'Bearer test-token')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(cancelAbortController.signal.aborted).toBe(true);
    expect(jobRepository.markCancelled).toHaveBeenCalledWith(operationId);
    expect(jobRepository.writeJobEvent).toHaveBeenCalledTimes(2);

    const operationEventWrite = vi.mocked(jobRepository.writeJobEvent).mock.calls[0]?.[1] as {
      type?: string;
      status?: string;
      seq?: number;
    };
    const doneEventWrite = vi.mocked(jobRepository.writeJobEvent).mock.calls[1]?.[1] as {
      type?: string;
      status?: string;
      seq?: number;
    };

    expect(operationEventWrite.type).toBe('operation');
    expect(operationEventWrite.status).toBe('cancelled');
    expect(doneEventWrite.type).toBe('done');
    expect(doneEventWrite.status).toBe('cancelled');
    expect(doneEventWrite.seq).toBeGreaterThan(operationEventWrite.seq ?? -1);
  });

  it('should stamp expiresAt on AgentJobOutbox doc when /enqueue succeeds', async () => {
    const queueService = {
      enqueue: vi.fn().mockResolvedValue('job-ttl-test'),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: createMockJobRepository() as never,
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
      .send({ intent: 'Build a recruiting plan for fall semester' });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);

    const operationId = response.body.data.operationId as string;
    expect(typeof operationId).toBe('string');

    const outboxDoc = __getMockFirestoreDocument(`AgentJobOutbox/${operationId}`);
    expect(outboxDoc).toBeDefined();
    expect(outboxDoc?.status).toBe('enqueued');
    expect(outboxDoc?.jobId).toBe('job-ttl-test');

    // expiresAt should be stamped as a Timestamp ~7 days from now.
    // structuredClone loses the getter prototype so Firebase Timestamp
    // is stored as { _seconds, _nanoseconds } in the mock document store.
    const expiresAt = outboxDoc?.expiresAt as { _seconds: number } | undefined;
    expect(expiresAt).toBeDefined();
    expect(typeof expiresAt?._seconds).toBe('number');

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    expect(expiresAt!._seconds).toBeGreaterThan(nowSeconds + sevenDaysSeconds - 60);
    expect(expiresAt!._seconds).toBeLessThan(nowSeconds + sevenDaysSeconds + 60);
  });

  it('should stamp error expiresAt on AgentJobOutbox doc when enqueue throws', async () => {
    const queueService = {
      enqueue: vi.fn().mockRejectedValue(new Error('Queue unavailable')),
      isHealthy: vi.fn().mockResolvedValue(true),
    };

    setAgentDependencies({
      queueService: queueService as never,
      jobRepository: createMockJobRepository() as never,
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
      .send({ intent: 'Build a recruiting plan' });

    // The route should return an error response when enqueue fails
    expect(response.status).toBeGreaterThanOrEqual(400);

    // Find the outbox doc by scanning mock writes — operationId not in error response
    const { __getMockFirestoreWrites } = await import('../../test-app.js');
    const outboxWrites = __getMockFirestoreWrites().filter((w) =>
      w.path.startsWith('AgentJobOutbox/')
    );
    expect(outboxWrites.length).toBeGreaterThan(0);

    const errorWrite = outboxWrites.find((w) => w.payload?.['status'] === 'error');
    expect(errorWrite).toBeDefined();
    expect(errorWrite?.payload?.['lastError']).toBe('Queue unavailable');

    // structuredClone loses the getter prototype so Firebase Timestamp
    // is stored as { _seconds, _nanoseconds } in the mock write store.
    const expiresAt = errorWrite?.payload?.['expiresAt'] as { _seconds: number } | undefined;
    expect(expiresAt).toBeDefined();
    expect(typeof expiresAt?._seconds).toBe('number');

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    expect(expiresAt!._seconds).toBeGreaterThan(nowSeconds + sevenDaysSeconds - 60);
    expect(expiresAt!._seconds).toBeLessThan(nowSeconds + sevenDaysSeconds + 60);
  });
});

function createMockJobRepository(jobDoc?: Record<string, unknown>) {
  const repository = {
    withDb: vi.fn(),
    getById: vi.fn().mockResolvedValue(jobDoc ?? null),
    getByIdempotencyKey: vi.fn().mockResolvedValue(null),
    getJobEvents: vi.fn().mockResolvedValue([]),
    allocateEventSeqRange: vi.fn().mockResolvedValue(0),
    writeJobEvent: vi.fn().mockResolvedValue(undefined),
    writeJobEventWithAutoSeq: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(undefined),
    markYielded: vi.fn().mockResolvedValue(undefined),
    markPaused: vi.fn().mockResolvedValue(undefined),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markCancelled: vi.fn().mockResolvedValue(undefined),
    markDetached: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    patchContext: vi.fn().mockResolvedValue(undefined),
  };

  repository.withDb.mockReturnValue(repository);
  return repository;
}

function parseSseEvents(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  return raw
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      const eventMatch = /^event:\s*(.+)$/m.exec(frame);
      const dataMatch = /^data:\s*(.+)$/m.exec(frame);
      const event = eventMatch?.[1]?.trim() ?? '';
      const dataRaw = dataMatch?.[1]?.trim() ?? '{}';
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(dataRaw) as Record<string, unknown>;
      } catch {
        // data remains {}
      }
      return { event, data };
    });
}
