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

  it('refreshes a stale assistant_partial row when a richer snapshot reuses its idempotency key', async () => {
    const service = new AgentChatService();
    const duplicateError = Object.assign(new Error('duplicate key'), { code: 11000 });
    const existing = {
      _id: 'msg-partial',
      threadId: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      role: 'assistant',
      content: 'Working on your reel and preparing the final delivery now.',
      origin: 'user',
      agentId: 'router',
      operationId: 'chat-op-1',
      semanticPhase: 'assistant_partial',
      idempotencyKey: 'chat-op-1:assistant_partial',
      steps: [],
      parts: [],
      attachments: [{ type: 'video', url: 'https://cdn.example.com/reel.mp4' }],
      toolCalls: [],
      createdAt: '2026-08-04T18:57:00.000Z',
    };
    const enriched = {
      ...existing,
      content: 'Your gunslinger highlight reel is ready.',
      attachments: [
        {
          type: 'video',
          url: 'https://cdn.example.com/reel.mp4',
          thumbnailUrl: 'https://cdn.example.com/poster.jpg',
        },
      ],
      resultData: { videoUrl: 'https://cdn.example.com/reel.mp4' },
    };

    vi.mocked(AgentMessageModel.create).mockRejectedValueOnce(duplicateError);
    vi.mocked(AgentMessageModel.findOne).mockReturnValueOnce(execResult(existing) as never);
    vi.mocked(AgentMessageModel.findOneAndUpdate).mockReturnValueOnce(
      execResult(enriched) as never
    );

    const result = await service.addMessage({
      threadId: existing.threadId,
      userId: existing.userId,
      role: 'assistant',
      content: enriched.content,
      origin: 'user',
      agentId: 'router',
      operationId: existing.operationId,
      semanticPhase: 'assistant_partial',
      idempotencyKey: existing.idempotencyKey,
      attachments: enriched.attachments as never,
      resultData: enriched.resultData,
    });

    expect(result.content).toBe(enriched.content);
    expect(AgentMessageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { idempotencyKey: existing.idempotencyKey },
      {
        $set: expect.objectContaining({
          content: enriched.content,
          attachments: enriched.attachments,
          resultData: enriched.resultData,
        }),
      },
      { returnDocument: 'after' }
    );
  });

  it('preserves meaningful assistant_partial content when a metadata refresh contains only whitespace', async () => {
    const service = new AgentChatService();
    const duplicateError = Object.assign(new Error('duplicate key'), { code: 11000 });
    const existing = {
      _id: 'msg-partial-whitespace',
      threadId: '6a20f3b8db16e0ce56f0dbde',
      userId: 'user-123',
      role: 'assistant',
      content: 'Your reel is ready.',
      origin: 'user',
      agentId: 'router',
      operationId: 'chat-op-2',
      semanticPhase: 'assistant_partial',
      idempotencyKey: 'chat-op-2:assistant_partial',
      createdAt: '2026-08-04T18:57:00.000Z',
    };
    const enriched = {
      ...existing,
      resultData: { videoUrl: 'https://cdn.example.com/reel.mp4' },
    };

    vi.mocked(AgentMessageModel.create).mockRejectedValueOnce(duplicateError);
    vi.mocked(AgentMessageModel.findOne).mockReturnValueOnce(execResult(existing) as never);
    vi.mocked(AgentMessageModel.findOneAndUpdate).mockReturnValueOnce(
      execResult(enriched) as never
    );

    const result = await service.addMessage({
      threadId: existing.threadId,
      userId: existing.userId,
      role: 'assistant',
      content: '   \n',
      origin: 'user',
      agentId: 'router',
      operationId: existing.operationId,
      semanticPhase: 'assistant_partial',
      idempotencyKey: existing.idempotencyKey,
      resultData: enriched.resultData,
    });

    const update = vi.mocked(AgentMessageModel.findOneAndUpdate).mock.calls[0]?.[1] as {
      $set?: Record<string, unknown>;
    };
    expect(update.$set).not.toHaveProperty('content');
    expect(result.content).toBe(existing.content);
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

  it('uses the dedicated title model chain for prompt-only title generation', async () => {
    const service = new AgentChatService();
    const llmService = {
      complete: vi.fn().mockResolvedValue({ content: 'My Title', toolCalls: [] }),
    };

    const result = await service.generateTitleFromPromptOnly(
      'build me a spring football outreach plan',
      llmService as never
    );

    expect(result).toBe('My Title');
    expect(llmService.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        maxTokens: 50,
        temperature: 0.3,
        candidateModels: ['~anthropic/claude-haiku-latest', 'google/gemini-3.6-flash'],
      })
    );
  });

  it('uses the dedicated title model chain for operation title generation', async () => {
    const service = new AgentChatService();
    const llmService = {
      complete: vi.fn().mockResolvedValue({ content: 'Built Your Outreach Plan', toolCalls: [] }),
    };

    const result = await service.generateOperationTitle(
      'build me a spring football outreach plan',
      'I built your outreach plan and email draft.',
      llmService as never
    );

    expect(result).toBe('Built Your Outreach Plan');
    expect(llmService.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        maxTokens: 60,
        temperature: 0.3,
        candidateModels: ['~anthropic/claude-haiku-latest', 'google/gemini-3.6-flash'],
      })
    );
  });
});
