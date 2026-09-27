import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentMessageEditService } from '../agent-message-edit.service.js';
import type { AgentChatService } from '../agent-chat.service.js';
import type { AgentJobRepository } from '../../queue/job.repository.js';
import type { AgentOperationCancellationService } from '../agent-operation-cancellation.service.js';
import type { AgentQueueService } from '../../queue/queue.service.js';

const { enqueueWithOutboxMock } = vi.hoisted(() => ({
  enqueueWithOutboxMock: vi
    .fn()
    .mockResolvedValue({ jobId: 'job-replacement-1', deduplicated: false }),
}));

vi.mock('../../queue/outbox.service.js', () => ({
  enqueueWithOutbox: enqueueWithOutboxMock,
}));

describe('AgentMessageEditService', () => {
  let mockChatService: {
    getMessageById: ReturnType<typeof vi.fn>;
    isLatestUserTurn: ReturnType<typeof vi.fn>;
    editUserMessage: ReturnType<typeof vi.fn>;
    softDeleteAssistantMessagesForOperation: ReturnType<typeof vi.fn>;
  };
  let mockJobRepository: {
    withDb: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockCancellationService: {
    cancelOperation: ReturnType<typeof vi.fn>;
  };
  let mockDb: Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {} as Firestore;

    mockChatService = {
      getMessageById: vi.fn(),
      isLatestUserTurn: vi.fn().mockResolvedValue(true),
      editUserMessage: vi.fn(),
      softDeleteAssistantMessagesForOperation: vi.fn().mockResolvedValue(['asst-old-1']),
    };

    mockJobRepository = {
      withDb: vi.fn().mockReturnThis(),
      create: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn().mockResolvedValue({
        operationId: 'op-old-1',
        replayPayload: {
          agent: 'recruiting_coordinator',
          context: {
            threadId: 'thread-1',
            executionMode: 'plan',
            effortLevel: 'high',
            attachments: [{ name: 'highlight.mp4', url: 'https://cdn.example.com/h.mp4' }],
          },
        },
      }),
    };

    mockCancellationService = {
      cancelOperation: vi.fn().mockResolvedValue({
        success: true,
        operationId: 'op-old-1',
        wasActive: true,
        queueCancelled: true,
        controlBroadcast: true,
      }),
    };
  });

  function createTestService(queue?: AgentQueueService | null) {
    return new AgentMessageEditService(
      mockChatService as unknown as AgentChatService,
      mockJobRepository as unknown as AgentJobRepository,
      queue ?? null,
      mockCancellationService as unknown as AgentOperationCancellationService
    );
  }

  it('rejects empty message content', async () => {
    const service = createTestService();

    const result = await service.editAndResend(mockDb, {
      messageId: 'msg-1',
      userId: 'user-1',
      threadId: 'thread-1',
      message: '   ',
      environment: 'production',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot be empty');
  });

  it('rejects when message is not found or user mismatch', async () => {
    mockChatService.getMessageById.mockResolvedValue(null);

    const service = createTestService();

    const result = await service.editAndResend(mockDb, {
      messageId: 'msg-not-found',
      userId: 'user-1',
      threadId: 'thread-1',
      message: 'New prompt',
      environment: 'production',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Message not found');
  });

  it('rejects when message role is not user', async () => {
    mockChatService.getMessageById.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'assistant',
      content: 'I am agent',
      createdAt: new Date().toISOString(),
    });

    const service = createTestService();

    const result = await service.editAndResend(mockDb, {
      messageId: 'msg-1',
      userId: 'user-1',
      threadId: 'thread-1',
      message: 'New prompt',
      environment: 'production',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Only user messages can be edited');
  });

  it('rejects messages older than 5 minutes', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockChatService.getMessageById.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: 'Old text',
      createdAt: tenMinutesAgo,
    });

    const service = createTestService();

    const result = await service.editAndResend(mockDb, {
      messageId: 'msg-1',
      userId: 'user-1',
      threadId: 'thread-1',
      message: 'New prompt',
      environment: 'production',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('5 minutes');
  });

  it('rejects when not the latest user turn', async () => {
    mockChatService.getMessageById.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: 'Old text',
      createdAt: new Date().toISOString(),
    });
    mockChatService.isLatestUserTurn.mockResolvedValue(false);

    const service = createTestService();

    const result = await service.editAndResend(mockDb, {
      messageId: 'msg-1',
      userId: 'user-1',
      threadId: 'thread-1',
      message: 'New prompt',
      environment: 'production',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('latest user prompt');
  });

  it('rejects when expectedRevision does not match', async () => {
    mockChatService.getMessageById.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: 'Old text',
      createdAt: new Date().toISOString(),
      revision: 2,
    });

    const service = createTestService();

    const result = await service.editAndResend(mockDb, {
      messageId: 'msg-1',
      userId: 'user-1',
      threadId: 'thread-1',
      message: 'New prompt',
      expectedRevision: 1,
      environment: 'production',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already been modified');
  });

  it('atomically supersedes prior run, edits message, and enqueues replacement preserving context', async () => {
    const nowIso = new Date().toISOString();
    mockChatService.getMessageById.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: 'Original prompt',
      createdAt: nowIso,
      operationId: 'op-old-1',
      revision: 0,
    });

    mockChatService.editUserMessage.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: 'Revised prompt',
      createdAt: nowIso,
      operationId: 'op-replacement-1',
      revision: 1,
    });

    const mockQueueService = { enqueue: vi.fn() } as unknown as AgentQueueService;
    const service = createTestService(mockQueueService);

    const result = await service.editAndResend(mockDb, {
      messageId: 'msg-1',
      userId: 'user-1',
      threadId: 'thread-1',
      message: 'Revised prompt',
      reason: 'clarification',
      environment: 'production',
    });

    expect(result.success).toBe(true);
    expect(result.data?.message.content).toBe('Revised prompt');
    expect(result.data?.rerunEnqueued).toBe(true);
    expect(result.data?.supersededOperationId).toBe('op-old-1');
    expect(result.data?.deletedAssistantMessageIds).toEqual(['asst-old-1']);

    // Cancellation called on prior operation with reason 'superseded_by_edit'
    expect(mockCancellationService.cancelOperation).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        operationId: 'op-old-1',
        reason: 'superseded_by_edit',
        supersededByOperationId: expect.any(String),
      })
    );

    // Old assistant rows soft-deleted
    expect(mockChatService.softDeleteAssistantMessagesForOperation).toHaveBeenCalledWith(
      'thread-1',
      'op-old-1',
      'user-1'
    );

    // Enqueued replacement payload preserves context & attachments from original job
    expect(enqueueWithOutboxMock).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        intent: 'Revised prompt',
        agent: 'recruiting_coordinator',
        context: expect.objectContaining({
          threadId: 'thread-1',
          executionMode: 'plan',
          effortLevel: 'high',
          supersedesOperationId: 'op-old-1',
          attachments: [{ name: 'highlight.mp4', url: 'https://cdn.example.com/h.mp4' }],
        }),
      }),
      'production',
      mockQueueService
    );

    // Replacement AgentJobs document is created synchronously before enqueue,
    // so the frontend always has a Firestore doc to bind to.
    expect(mockJobRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'Revised prompt' })
    );
  });

  it('returns a retryable failure when the replacement AgentJobs document cannot be created', async () => {
    mockChatService.getMessageById.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: 'Original prompt',
      createdAt: new Date().toISOString(),
      operationId: 'op-old-1',
      revision: 0,
    });
    mockChatService.editUserMessage.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      userId: 'user-1',
      role: 'user',
      content: 'Revised prompt',
      createdAt: new Date().toISOString(),
      operationId: 'op-replacement-1',
      revision: 1,
    });
    mockJobRepository.create.mockRejectedValue(new Error('Firestore unavailable'));

    const mockQueueService = { enqueue: vi.fn() } as unknown as AgentQueueService;
    const service = createTestService(mockQueueService);

    const result = await service.editAndResend(mockDb, {
      messageId: 'msg-1',
      userId: 'user-1',
      threadId: 'thread-1',
      message: 'Revised prompt',
      environment: 'production',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Please retry');
    expect(enqueueWithOutboxMock).not.toHaveBeenCalled();
  });
});
