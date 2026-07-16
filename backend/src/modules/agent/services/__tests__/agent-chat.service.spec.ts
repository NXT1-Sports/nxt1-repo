import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../models/agent/agent-thread.model.js', () => ({
  AgentThreadModel: {
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../../../../models/agent/agent-message.model.js', () => ({
  AgentMessageModel: {
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('../../../../models/agent/agent-upload-outbox.model.js', () => ({
  AgentUploadOutboxModel: {
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const { AgentThreadModel } = await import('../../../../models/agent/agent-thread.model.js');
const { AgentMessageModel } = await import('../../../../models/agent/agent-message.model.js');
const { AgentChatService } = await import('../agent-chat.service.js');

function execResult<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function leanExecResult<T>(value: T) {
  return { lean: vi.fn().mockReturnValue(execResult(value)) };
}

function sortedLeanExecResult<T>(value: T) {
  return {
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnValue(execResult(value)),
  };
}

describe('AgentChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repairs missing thread metadata from existing messages before returning a thread', async () => {
    const service = new AgentChatService();
    const firstMessage = {
      _id: 'msg-user',
      threadId: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      role: 'user',
      content: 'Send an email to john@nxt1sports.com',
      origin: 'system_cron',
      createdAt: '2026-06-04T04:00:00.000Z',
    };
    const lastMessage = {
      _id: 'msg-assistant',
      threadId: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      role: 'assistant',
      content: 'Email sent.',
      origin: 'system_cron',
      agentId: 'admin_coordinator',
      createdAt: '2026-06-04T04:00:05.000Z',
    };
    const repairedThread = {
      _id: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      title: 'Send An Email To',
      lastAgentId: 'admin_coordinator',
      lastMessageAt: lastMessage.createdAt,
      messageCount: 2,
      archived: false,
      createdAt: firstMessage.createdAt,
      updatedAt: '2026-06-04T04:00:06.000Z',
      latestPausedYieldState: null,
    };

    vi.mocked(AgentThreadModel.findOne).mockReturnValueOnce(leanExecResult(null) as never);
    vi.mocked(AgentMessageModel.findOne)
      .mockReturnValueOnce(sortedLeanExecResult(firstMessage) as never)
      .mockReturnValueOnce(sortedLeanExecResult(lastMessage) as never);
    vi.mocked(AgentMessageModel.countDocuments).mockReturnValueOnce(execResult(2) as never);
    vi.mocked(AgentThreadModel.findOneAndUpdate).mockReturnValueOnce(
      leanExecResult(repairedThread) as never
    );

    const result = await service.getThreadWithMetadata('6a20f3b8db16e0ce56f0dbde', 'user-123');

    expect(result?.id).toBe('6a20f3b8db16e0ce56f0dbde');
    expect(result?.messageCount).toBe(2);
    expect(AgentThreadModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '6a20f3b8db16e0ce56f0dbde', userId: 'user-123' },
      expect.objectContaining({
        $set: expect.objectContaining({
          lastAgentId: 'admin_coordinator',
          lastMessageAt: lastMessage.createdAt,
          messageCount: 2,
        }),
        $setOnInsert: expect.objectContaining({
          userId: 'user-123',
          archived: false,
          createdAt: firstMessage.createdAt,
        }),
      }),
      { upsert: true, returnDocument: 'after' }
    );
  });

  it('upserts thread metadata when adding a message to a missing scheduled thread', async () => {
    const service = new AgentChatService();
    const message = {
      _id: 'msg-assistant',
      threadId: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      role: 'assistant',
      content: 'Email sent.',
      origin: 'system_cron',
      agentId: 'admin_coordinator',
      createdAt: '2026-06-04T04:00:05.000Z',
    };

    vi.mocked(AgentMessageModel.create).mockResolvedValueOnce(message as never);
    vi.mocked(AgentThreadModel.updateOne).mockReturnValueOnce(
      execResult({ acknowledged: true }) as never
    );

    const result = await service.addMessage({
      threadId: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      role: 'assistant',
      content: 'Email sent.',
      origin: 'system_cron',
      agentId: 'admin_coordinator',
    });

    expect(result.id).toBe('msg-assistant');
    expect(AgentThreadModel.updateOne).toHaveBeenCalledWith(
      { _id: '6a20f3b8db16e0ce56f0dbde', userId: 'user-123' },
      expect.objectContaining({
        $set: expect.objectContaining({
          lastAgentId: 'admin_coordinator',
          memorySummarized: false,
        }),
        $setOnInsert: expect.objectContaining({
          userId: 'user-123',
          archived: false,
        }),
        $inc: { messageCount: 1 },
      }),
      { upsert: true }
    );
  });

  it('fast-paths assistant_tool_call rows without thread metadata or summarization work', async () => {
    const queueService = {
      enqueueThreadSummarization: vi.fn().mockResolvedValue('job-1'),
    };
    const service = new AgentChatService(queueService as never);
    const message = {
      _id: 'msg-tool-call',
      threadId: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      role: 'assistant',
      content: '',
      origin: 'agent_chain',
      agentId: 'router',
      createdAt: '2026-06-15T12:00:00.000Z',
      semanticPhase: 'assistant_tool_call',
    };

    vi.mocked(AgentMessageModel.create).mockResolvedValueOnce(message as never);

    const result = await service.addMessage({
      threadId: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      role: 'assistant',
      content: '',
      origin: 'agent_chain',
      agentId: 'router',
      semanticPhase: 'assistant_tool_call',
    });

    expect(result.id).toBe('msg-tool-call');
    expect(AgentThreadModel.updateOne).not.toHaveBeenCalled();
    expect(queueService.enqueueThreadSummarization).not.toHaveBeenCalled();
  });

  it('replaces short fresh placeholder titles with generated titles', async () => {
    const service = new AgentChatService();

    vi.mocked(AgentThreadModel.findOne).mockReturnValueOnce(
      leanExecResult({
        _id: 'thread-123',
        userId: 'user-123',
        title: 'Create',
        category: 'general',
        lastAgentId: null,
        lastMessageAt: '2026-06-11T19:57:18.000Z',
        messageCount: 1,
        archived: false,
        createdAt: '2026-06-11T19:57:17.000Z',
        updatedAt: '2026-06-11T19:57:18.000Z',
      }) as never
    );
    vi.mocked(AgentThreadModel.updateOne).mockReturnValueOnce(
      execResult({ modifiedCount: 1 }) as never
    );

    const result = await service.applyGeneratedThreadTitle(
      'thread-123',
      'user-123',
      'Create Highlight Reel from uploaded clips',
      'Create Highlight Reel'
    );

    expect(result).toBe('Create Highlight Reel');
    expect(AgentThreadModel.updateOne).toHaveBeenCalledWith(
      { _id: 'thread-123', userId: 'user-123' },
      expect.objectContaining({
        $set: expect.objectContaining({
          title: 'Create Highlight Reel',
        }),
      })
    );
  });

  it('does not replace short manual titles on established threads', async () => {
    const service = new AgentChatService();

    vi.mocked(AgentThreadModel.findOne).mockReturnValueOnce(
      leanExecResult({
        _id: 'thread-456',
        userId: 'user-123',
        title: 'Create',
        category: 'general',
        lastAgentId: null,
        lastMessageAt: '2026-06-11T19:57:18.000Z',
        messageCount: 3,
        archived: false,
        createdAt: '2026-06-11T19:57:17.000Z',
        updatedAt: '2026-06-11T19:57:18.000Z',
      }) as never
    );

    const result = await service.applyGeneratedThreadTitle(
      'thread-456',
      'user-123',
      'Create Highlight Reel from uploaded clips',
      'Create Highlight Reel'
    );

    expect(result).toBeNull();
    expect(AgentThreadModel.updateOne).not.toHaveBeenCalled();
  });
});
