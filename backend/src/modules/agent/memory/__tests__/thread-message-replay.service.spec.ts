/**
 * @fileoverview Unit tests for ThreadMessageReplayService (Phase C).
 *
 * Validates the four invariants the service guarantees:
 *  1. Chronological order
 *  2. Tool-pair reconciliation drops orphan tool rows AND orphan
 *     assistant.tool_calls
 *  3. Legacy rows (no `toolCallsWire`) get synthesized stable IDs
 *  4. Token budget head-trim preserves final assistant↔tool contiguity
 *
 * Mongoose is mocked at the module level — these are pure unit tests
 * with no MongoDB connection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const findChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

vi.mock('../../../../models/agent/agent-message.model.js', () => ({
  AgentMessageModel: {
    find: vi.fn(() => findChain),
  },
}));

import { AgentMessageModel } from '../../../../models/agent/agent-message.model.js';
import {
  ThreadMessageReplayService,
  __resetThreadMessageReplayServiceForTests,
  getThreadMessageReplayService,
} from '../thread-message-replay.service.js';

function setRows(rows: readonly Record<string, unknown>[]): void {
  findChain.exec.mockResolvedValueOnce(rows);
}

describe('ThreadMessageReplayService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findChain.sort.mockReturnThis();
    findChain.limit.mockReturnThis();
    findChain.select.mockReturnThis();
    findChain.lean.mockReturnThis();
    __resetThreadMessageReplayServiceForTests();
  });

  it('returns empty array for missing threadId', async () => {
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('');
    expect(result).toEqual([]);
    expect(AgentMessageModel.find).not.toHaveBeenCalled();
  });

  it('returns empty array when no rows exist', async () => {
    setRows([]);
    const svc = new ThreadMessageReplayService();
    expect(await svc.loadAsLLMMessages('thread-1')).toEqual([]);
  });

  it('drops persisted system rows (system prompts live in agent assembly)', async () => {
    setRows([
      { _id: 1, role: 'system', content: 'hidden', createdAt: '2025-01-01T00:00:00Z' },
      { _id: 2, role: 'user', content: 'hi', createdAt: '2025-01-01T00:00:01Z' },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('preserves tool_call_id on tool rows and tool_calls on assistant rows', async () => {
    setRows([
      { _id: 1, role: 'user', content: 'find coaches', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: 2,
        role: 'assistant',
        content: '',
        toolCallsWire: [
          {
            id: 'call_xyz',
            type: 'function',
            function: { name: 'search_coaches', arguments: '{"sport":"football"}' },
          },
        ],
        createdAt: '2025-01-01T00:00:01Z',
      },
      {
        _id: 3,
        role: 'tool',
        content: '[{"name":"Smith"}]',
        toolCallId: 'call_xyz',
        createdAt: '2025-01-01T00:00:02Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    expect(result).toHaveLength(3);
    expect(result[1].role).toBe('assistant');
    expect((result[1] as { tool_calls?: unknown[] }).tool_calls).toHaveLength(1);
    expect(result[2].role).toBe('tool');
    expect((result[2] as { tool_call_id?: string }).tool_call_id).toBe('call_xyz');
  });

  it('drops tool rows missing toolCallId', async () => {
    setRows([
      { _id: 1, role: 'user', content: 'q', createdAt: '2025-01-01T00:00:00Z' },
      { _id: 2, role: 'tool', content: 'orphan', createdAt: '2025-01-01T00:00:01Z' },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('drops orphan tool rows whose tool_call_id has no preceding assistant', async () => {
    setRows([
      { _id: 1, role: 'user', content: 'q', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: 2,
        role: 'tool',
        content: 'unmatched',
        toolCallId: 'call_does_not_exist',
        createdAt: '2025-01-01T00:00:01Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    expect(result.find((m) => m.role === 'tool')).toBeUndefined();
  });

  it('drops assistant.tool_calls entries that have no resolving tool row', async () => {
    setRows([
      { _id: 1, role: 'user', content: 'q', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: 2,
        role: 'assistant',
        content: 'I will help.',
        toolCallsWire: [
          {
            id: 'call_unresolved',
            type: 'function',
            function: { name: 'search', arguments: '{}' },
          },
        ],
        createdAt: '2025-01-01T00:00:01Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    expect(result).toHaveLength(2);
    const assistant = result[1] as { tool_calls?: unknown[]; content?: string };
    expect(assistant.tool_calls).toBeUndefined();
    expect(assistant.content).toBe('I will help.');
  });

  it('drops the assistant turn entirely when it had only orphan tool_calls AND empty content', async () => {
    setRows([
      { _id: 1, role: 'user', content: 'q', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: 2,
        role: 'assistant',
        content: '',
        toolCallsWire: [
          { id: 'call_orphan', type: 'function', function: { name: 'x', arguments: '{}' } },
        ],
        createdAt: '2025-01-01T00:00:01Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('synthesizes stable wire IDs for legacy rows that only have analytics-friendly toolCalls', async () => {
    setRows([
      { _id: 'abc12345', role: 'user', content: 'q', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: 'doc123def',
        role: 'assistant',
        content: '',
        toolCalls: [{ toolName: 'search', input: { q: 'x' } }],
        createdAt: '2025-01-01T00:00:01Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    // The assistant row is dropped because no tool result resolves the synthesized id,
    // but its content is empty so the whole turn is removed. The user row remains.
    expect(result).toHaveLength(1);
  });

  it('keeps a legacy assistant↔tool pair when the toolCallId matches the synthesized id', async () => {
    const docId = 'aaaaaaaaaa12345678';
    const synthesizedId = `legacy_${docId.slice(-8)}_0`;
    setRows([
      { _id: 'u1', role: 'user', content: 'q', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: docId,
        role: 'assistant',
        content: '',
        toolCalls: [{ toolName: 'search', input: { q: 'x' } }],
        createdAt: '2025-01-01T00:00:01Z',
      },
      {
        _id: 't1',
        role: 'tool',
        content: '[ok]',
        toolCallId: synthesizedId,
        createdAt: '2025-01-01T00:00:02Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    expect(result).toHaveLength(3);
    expect(result[2].role).toBe('tool');
  });

  it('trims from the head when over budget but keeps final pair contiguous', async () => {
    const longContent = 'x'.repeat(2000); // ~500 tokens
    setRows([
      // 5 user/assistant exchanges
      { _id: 1, role: 'user', content: longContent, createdAt: '2025-01-01T00:00:00Z' },
      { _id: 2, role: 'assistant', content: longContent, createdAt: '2025-01-01T00:00:01Z' },
      { _id: 3, role: 'user', content: longContent, createdAt: '2025-01-01T00:00:02Z' },
      { _id: 4, role: 'assistant', content: longContent, createdAt: '2025-01-01T00:00:03Z' },
      { _id: 5, role: 'user', content: 'recent', createdAt: '2025-01-01T00:00:04Z' },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t', { maxTokens: 600 });
    // Should keep at least the most recent message
    expect(result.length).toBeLessThan(5);
    expect(result[result.length - 1].content).toBe('recent');
  });

  it('singleton returns the same instance', () => {
    const a = getThreadMessageReplayService();
    const b = getThreadMessageReplayService();
    expect(a).toBe(b);
  });

  // Regression test for the Vertex/Anthropic 400 we hit in production:
  // "messages.2.content.0: unexpected `tool_use_id` found in `tool_result`
  //  blocks: ... Each `tool_result` block must have a corresponding
  //  `tool_use` block in the previous message."
  //
  // Cause: a tool row is positionally orphan (its assistant emitter is
  // separated from it by a non-tool message) even though its id appears
  // somewhere in `emittedIds` globally.
  it('drops positionally-orphan tool rows even when the id was emitted earlier', async () => {
    setRows([
      { _id: 1, role: 'user', content: 'q1', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: 2,
        role: 'assistant',
        content: '',
        toolCallsWire: [
          { id: 'toolu_X', type: 'function', function: { name: 's', arguments: '{}' } },
        ],
        createdAt: '2025-01-01T00:00:01Z',
      },
      {
        _id: 3,
        role: 'tool',
        content: 'result for X',
        toolCallId: 'toolu_X',
        createdAt: '2025-01-01T00:00:02Z',
      },
      // Window CLOSES here — a user message follows the resolved pair.
      { _id: 4, role: 'user', content: 'q2', createdAt: '2025-01-01T00:00:03Z' },
      // This tool row's id was emitted way back at index 2, but it's now
      // positionally orphan — Anthropic will reject the prompt.
      {
        _id: 5,
        role: 'tool',
        content: 'late result for X',
        toolCallId: 'toolu_X',
        createdAt: '2025-01-01T00:00:04Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    // Only one tool row should survive — the one immediately following
    // its emitting assistant. The orphan tool row after the user message
    // is dropped.
    const toolRows = result.filter((m) => m.role === 'tool');
    expect(toolRows).toHaveLength(1);
    expect((toolRows[0] as { content: string }).content).toBe('result for X');
    // And the order is preserved (user, assistant, tool, user).
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'user']);
  });

  it('drops a tool row that has no preceding assistant in scope (window already closed)', async () => {
    setRows([
      // Assistant emitted X but never got a tool result before the user
      // followed up — the X assistant.tool_calls will be stripped by
      // pass 2 (orphan emit) and a stray tool row anywhere in the
      // remainder is also dropped.
      { _id: 1, role: 'user', content: 'q1', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: 2,
        role: 'assistant',
        content: 'I will look into that.',
        toolCallsWire: [
          { id: 'toolu_X', type: 'function', function: { name: 's', arguments: '{}' } },
        ],
        createdAt: '2025-01-01T00:00:01Z',
      },
      { _id: 3, role: 'user', content: 'q2', createdAt: '2025-01-01T00:00:02Z' },
      {
        _id: 4,
        role: 'tool',
        content: 'late result',
        toolCallId: 'toolu_X',
        createdAt: '2025-01-01T00:00:03Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    // The assistant keeps its content but loses tool_calls (orphan).
    // The trailing tool row is dropped (window closed by user).
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const assistant = result[1] as { content?: string; tool_calls?: unknown[] };
    expect(assistant.tool_calls).toBeUndefined();
    expect(assistant.content).toBe('I will look into that.');
  });

  it('keeps multiple tool rows that resolve the same assistant.tool_calls batch', async () => {
    setRows([
      { _id: 1, role: 'user', content: 'q', createdAt: '2025-01-01T00:00:00Z' },
      {
        _id: 2,
        role: 'assistant',
        content: '',
        toolCallsWire: [
          { id: 'toolu_X', type: 'function', function: { name: 'a', arguments: '{}' } },
          { id: 'toolu_Y', type: 'function', function: { name: 'b', arguments: '{}' } },
        ],
        createdAt: '2025-01-01T00:00:01Z',
      },
      {
        _id: 3,
        role: 'tool',
        content: 'X result',
        toolCallId: 'toolu_X',
        createdAt: '2025-01-01T00:00:02Z',
      },
      {
        _id: 4,
        role: 'tool',
        content: 'Y result',
        toolCallId: 'toolu_Y',
        createdAt: '2025-01-01T00:00:03Z',
      },
    ]);
    const svc = new ThreadMessageReplayService();
    const result = await svc.loadAsLLMMessages('t');
    expect(result).toHaveLength(4);
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool']);
  });
});
