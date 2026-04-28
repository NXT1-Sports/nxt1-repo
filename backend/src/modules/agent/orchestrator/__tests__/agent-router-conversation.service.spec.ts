import { describe, expect, it, vi } from 'vitest';
import type { AgentJobPayload, AgentSessionContext } from '@nxt1/core';
import { AgentRouterConversationService } from '../agent-router-conversation.service.js';

describe('AgentRouterConversationService', () => {
  it('falls through immediately when the current turn includes attachments', async () => {
    const llm = {
      prompt: vi.fn(),
    };

    const service = new AgentRouterConversationService(
      llm as never,
      {
        buildContext: vi.fn(),
        buildPromptContext: vi.fn(),
        getMemoriesForContext: vi.fn(),
        getRecentSyncSummariesForContext: vi.fn(),
        getRecentThreadHistory: vi.fn(),
        getActiveThreadsSummary: vi.fn(),
        compressToPrompt: vi.fn(),
      } as never,
      {
        appendAssistantMessage: vi.fn(),
      },
      {
        emitProgressOperation: vi.fn(),
        emitMetricSample: vi.fn(),
        emitStreamedTextChunks: vi.fn(),
        emitUpdate: vi.fn(),
        recordPhaseLatency: vi.fn(),
      }
    );

    const payload: AgentJobPayload = {
      operationId: 'op-123',
      userId: 'user-123',
      intent: 'what is this image',
      sessionId: 'session-123',
      origin: 'user',
      context: {},
    };

    const context: AgentSessionContext = {
      sessionId: 'session-123',
      userId: 'user-123',
      conversationHistory: [],
      createdAt: '2026-04-27T00:00:00.000Z',
      lastActiveAt: '2026-04-27T00:00:00.000Z',
      operationId: 'op-123',
      attachments: [{ url: 'https://storage.example/image.jpg', mimeType: 'image/jpeg' }],
    };

    const result = await service.tryConversationalRoute({
      payload,
      context,
      environment: 'staging',
    });

    expect(result).toEqual({ kind: 'fallthrough' });
    expect(llm.prompt).not.toHaveBeenCalled();
  });
});
