/**
 * @fileoverview Unit tests for ThreadMessageWriter (Phase B).
 *
 * Verifies the writer translates LLMMessage → AgentChatService.addMessage
 * payload with full wire-format fidelity (tool_calls, tool_call_id) so the
 * replay service can reconstitute a structurally-valid message stream.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ThreadMessageWriter,
  getThreadMessageWriter,
  __resetThreadMessageWriterForTests,
} from '../thread-message-writer.service.js';
import type { AgentChatService } from '../../services/agent-chat.service.js';
import type { LLMMessage } from '../../llm/llm.types.js';

function createChatStub() {
  const addMessage = vi.fn().mockResolvedValue({ id: 'persisted-id' });
  return {
    chat: { addMessage } as unknown as AgentChatService,
    addMessage,
  };
}

describe('ThreadMessageWriter', () => {
  beforeEach(() => {
    __resetThreadMessageWriterForTests();
  });

  describe('append()', () => {
    it('persists a plain user message with content collapsed to string', async () => {
      const { chat, addMessage } = createChatStub();
      const writer = new ThreadMessageWriter(chat);

      const msg: LLMMessage = { role: 'user', content: 'Find me 20 D2 coaches in TX.' };
      const id = await writer.append(msg, {
        threadId: 'thread-1',
        userId: 'user-1',
        agentId: 'router',
        operationId: 'op-1',
      });

      expect(id).toBe('persisted-id');
      expect(addMessage).toHaveBeenCalledTimes(1);
      const arg = addMessage.mock.calls[0][0];
      expect(arg.role).toBe('user');
      expect(arg.content).toBe('Find me 20 D2 coaches in TX.');
      expect(arg.threadId).toBe('thread-1');
      expect(arg.toolCalls).toBeUndefined();
      expect(arg.toolCallsWire).toBeUndefined();
      expect(arg.toolCallId).toBeUndefined();
    });

    it('preserves wire-format tool_calls AND emits friendly toolCalls record', async () => {
      const { chat, addMessage } = createChatStub();
      const writer = new ThreadMessageWriter(chat);

      const msg: LLMMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'search_recruiting_database',
              arguments: '{"sport":"football","division":"D2","state":"TX"}',
            },
          },
        ],
      };

      await writer.append(msg, { threadId: 't', userId: 'u', agentId: 'recruiting' });

      expect(addMessage).toHaveBeenCalledTimes(1);
      const arg = addMessage.mock.calls[0][0];
      expect(arg.role).toBe('assistant');
      expect(arg.content).toBe(''); // null content collapses to empty string

      // Wire-format preserved verbatim for replay
      expect(arg.toolCallsWire).toHaveLength(1);
      expect(arg.toolCallsWire[0]).toEqual({
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'search_recruiting_database',
          arguments: '{"sport":"football","division":"D2","state":"TX"}',
        },
      });

      // Friendly record for analytics dashboards
      expect(arg.toolCalls).toHaveLength(1);
      expect(arg.toolCalls[0].toolName).toBe('search_recruiting_database');
      expect(arg.toolCalls[0].input).toEqual({
        sport: 'football',
        division: 'D2',
        state: 'TX',
      });
    });

    it('persists a tool result row with tool_call_id', async () => {
      const { chat, addMessage } = createChatStub();
      const writer = new ThreadMessageWriter(chat);

      const msg: LLMMessage = {
        role: 'tool',
        content: '[{"name":"Coach Smith","email":"smith@u.edu"}]',
        tool_call_id: 'call_abc123',
      };

      await writer.append(msg, { threadId: 't', userId: 'u' });

      const arg = addMessage.mock.calls[0][0];
      expect(arg.role).toBe('tool');
      expect(arg.toolCallId).toBe('call_abc123');
      expect(arg.toolCallsWire).toBeUndefined();
    });

    it('flattens multi-modal content parts into joined text', async () => {
      const { chat, addMessage } = createChatStub();
      const writer = new ThreadMessageWriter(chat);

      const msg: LLMMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'Look at this:' },
          { type: 'image_url', image_url: { url: 'https://cdn/img.png' } },
        ],
      };

      await writer.append(msg, { threadId: 't', userId: 'u' });
      const arg = addMessage.mock.calls[0][0];
      expect(arg.content).toBe('Look at this:\n[image:https://cdn/img.png]');
    });

    it('skips silently when threadId is missing', async () => {
      const { chat, addMessage } = createChatStub();
      const writer = new ThreadMessageWriter(chat);

      const id = await writer.append(
        { role: 'user', content: 'hi' },
        { threadId: '', userId: 'u' }
      );
      expect(id).toBeNull();
      expect(addMessage).not.toHaveBeenCalled();
    });

    it('returns null on persist failure (does not throw)', async () => {
      const addMessage = vi.fn().mockRejectedValue(new Error('mongo down'));
      const writer = new ThreadMessageWriter({ addMessage } as unknown as AgentChatService);

      const id = await writer.append(
        { role: 'assistant', content: 'response' },
        { threadId: 't', userId: 'u' }
      );
      expect(id).toBeNull();
    });
  });

  describe('singleton', () => {
    it('returns null until bootstrapped with a chatService', () => {
      expect(getThreadMessageWriter()).toBeNull();
    });

    it('caches the instance after first construction', () => {
      const { chat } = createChatStub();
      const a = getThreadMessageWriter(chat);
      const b = getThreadMessageWriter();
      expect(a).toBeInstanceOf(ThreadMessageWriter);
      expect(b).toBe(a);
    });
  });
});
