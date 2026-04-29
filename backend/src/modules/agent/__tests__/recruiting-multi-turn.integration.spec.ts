/**
 * @fileoverview Integration test for the thread-as-truth multi-turn flow
 * (Phase H2). Wires `ThreadMessageWriter` and `ThreadMessageReplayService`
 * end-to-end through a realistic recruiting conversation:
 *
 *   Turn 1 (user): "send 20 emails to D2 Texas football coaches for MJ Wilson"
 *     → assistant tool_call(search_college_coaches)
 *     → tool result (coach list)
 *     → assistant text + tool_call(batch_send_email)  [yields needs_approval]
 *   Turn 2 (user): "approve"
 *     → replay loads the canonical thread
 *     → architecture invariant: replayed messages are structurally valid,
 *       in chronological order, with every prior tool_call resolved by
 *       its tool result. The coordinator can resume by appending the
 *       approved tool result without re-running search.
 *
 * This test is the regression net for the entire thread-as-truth
 * pipeline: any future change to the writer's persistence shape or the
 * replay's reconciliation walker that breaks this round-trip will fail
 * here.
 *
 * The Mongo layer is mocked at the model level — `AgentChatService` is
 * stubbed to write into an in-memory array, and `AgentMessageModel.find`
 * reads from the same array. No real DB connection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMMessage, LLMToolCall } from '../llm/llm.types.js';

// ── Mongoose mock (mirrors thread-message-replay.service.spec.ts) ───────
const findChain = {
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

vi.mock('../../../models/agent/agent-message.model.js', () => ({
  AgentMessageModel: {
    find: vi.fn(() => findChain),
  },
}));

import {
  ThreadMessageReplayService,
  __resetThreadMessageReplayServiceForTests,
} from '../memory/thread-message-replay.service.js';
import {
  ThreadMessageWriter,
  __resetThreadMessageWriterForTests,
} from '../memory/thread-message-writer.service.js';
import type { AgentChatService } from '../services/agent-chat.service.js';

// ── In-memory persisted thread ──────────────────────────────────────────

interface PersistedRow {
  readonly _id: string;
  readonly threadId: string;
  readonly userId: string;
  readonly role: 'user' | 'assistant' | 'tool' | 'system';
  readonly content: string;
  readonly agentId?: string;
  readonly operationId?: string;
  readonly toolCallsWire?: readonly LLMToolCall[];
  readonly toolCallId?: string;
  readonly createdAt: string;
}

function createInMemoryThread(): {
  readonly rows: PersistedRow[];
  readonly chat: AgentChatService;
} {
  const rows: PersistedRow[] = [];
  let counter = 0;

  const chat: Partial<AgentChatService> = {
    addMessage: vi.fn(async (params) => {
      counter += 1;
      const id = `m_${counter.toString().padStart(3, '0')}`;
      const row: PersistedRow = {
        _id: id,
        threadId: params.threadId,
        userId: params.userId,
        role: params.role as PersistedRow['role'],
        content: params.content,
        ...(params.agentId && { agentId: params.agentId }),
        ...(params.operationId && { operationId: params.operationId }),
        ...(params.toolCallsWire?.length && {
          toolCallsWire: params.toolCallsWire as readonly LLMToolCall[],
        }),
        ...(params.toolCallId && { toolCallId: params.toolCallId }),
        createdAt: new Date(Date.now() + counter).toISOString(),
      };
      rows.push(row);
      return {
        id,
        threadId: row.threadId,
        userId: row.userId,
        role: row.role,
        content: row.content,
        origin: params.origin,
        agentId: params.agentId,
        operationId: params.operationId,
        createdAt: row.createdAt,
      } as never;
    }),
  };

  return { rows, chat: chat as AgentChatService };
}

// ── Helper: fixed wire-format tool calls so we can assert linkage ───────

const SEARCH_COACHES_CALL: LLMToolCall = {
  id: 'call_search_001',
  type: 'function',
  function: {
    name: 'search_college_coaches',
    arguments: JSON.stringify({ division: 'D2', state: 'TX', sport: 'football' }),
  },
};

const BATCH_SEND_CALL: LLMToolCall = {
  id: 'call_batch_send_001',
  type: 'function',
  function: {
    name: 'batch_send_email',
    arguments: JSON.stringify({
      recipients: 20,
      subject: 'MJ Wilson | 2026 QB | 6\'3" 215lbs | 3,200 Pass Yds',
      body: '...draft body...',
    }),
  },
};

const SEARCH_RESULT_JSON = JSON.stringify({
  coaches: Array.from({ length: 20 }, (_, i) => ({
    name: `Coach ${i + 1}`,
    school: `D2 Texas School ${i + 1}`,
    email: `coach${i + 1}@example.edu`,
  })),
});

// ── Test suite ──────────────────────────────────────────────────────────

describe('Recruiting multi-turn (thread-as-truth integration)', () => {
  const THREAD_ID = 'thread_recruiting_mj_wilson';
  const USER_ID = 'user_mj_wilson';
  const OPERATION_ID = 'op_turn_1';

  beforeEach(() => {
    vi.clearAllMocks();
    findChain.sort.mockReturnThis();
    findChain.limit.mockReturnThis();
    findChain.select.mockReturnThis();
    findChain.lean.mockReturnThis();
    __resetThreadMessageReplayServiceForTests();
    __resetThreadMessageWriterForTests();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('round-trips a 4-message recruiting flow with structurally valid replay', async () => {
    const { rows, chat } = createInMemoryThread();
    const writer = new ThreadMessageWriter(chat);

    // ── Turn 1: simulate BaseAgent.runLoop appending mid-flight ──────
    // 1. User intent
    await writer.append(
      { role: 'user', content: 'Send 20 emails to D2 Texas football coaches for MJ Wilson.' },
      { threadId: THREAD_ID, userId: USER_ID, operationId: OPERATION_ID }
    );

    // 2. Assistant decides to search; emits tool_call (no text yet)
    await writer.append(
      { role: 'assistant', content: '', tool_calls: [SEARCH_COACHES_CALL] },
      {
        threadId: THREAD_ID,
        userId: USER_ID,
        agentId: 'recruiting_coordinator',
        operationId: OPERATION_ID,
      }
    );

    // 3. Tool result resolves the search call
    await writer.append(
      { role: 'tool', content: SEARCH_RESULT_JSON, tool_call_id: SEARCH_COACHES_CALL.id },
      {
        threadId: THREAD_ID,
        userId: USER_ID,
        agentId: 'recruiting_coordinator',
        operationId: OPERATION_ID,
      }
    );

    // 4. Assistant drafts + emits batch_send_email tool_call → YIELDS
    //    (the writer persists this turn so replay sees it; the yield's
    //    pendingAssistantMessage is what the resume service uses if the
    //    write didn't land — here it did.)
    await writer.append(
      {
        role: 'assistant',
        content: 'Drafted email for 20 D2 Texas coaches. Subject: MJ Wilson | 2026 QB...',
        tool_calls: [BATCH_SEND_CALL],
      },
      {
        threadId: THREAD_ID,
        userId: USER_ID,
        agentId: 'recruiting_coordinator',
        operationId: OPERATION_ID,
      }
    );

    // The thread now has 4 rows persisted.
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);

    // ── Turn 2: replay loads the canonical thread for the resume ─────
    findChain.exec.mockResolvedValueOnce(rows);

    const replay = new ThreadMessageReplayService();
    const replayed: readonly LLMMessage[] = await replay.loadAsLLMMessages(THREAD_ID);

    // Architectural invariant 1: chronological order preserved
    expect(replayed.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);

    // Architectural invariant 2: assistant turn 1 has resolved tool_call
    const firstAssistant = replayed[1] as LLMMessage & { tool_calls?: LLMToolCall[] };
    expect(firstAssistant.tool_calls).toHaveLength(1);
    expect(firstAssistant.tool_calls![0].id).toBe(SEARCH_COACHES_CALL.id);
    expect(firstAssistant.tool_calls![0].function.name).toBe('search_college_coaches');

    // Architectural invariant 3: tool row is paired by id
    const toolMsg = replayed[2] as LLMMessage & { tool_call_id?: string };
    expect(toolMsg.tool_call_id).toBe(SEARCH_COACHES_CALL.id);
    expect(toolMsg.content).toBe(SEARCH_RESULT_JSON);

    // Architectural invariant 4: pending batch_send_email survived as
    // an unresolved tool_call on the final assistant turn — this is the
    // call the user is approving in Turn 2. (Reconciliation drops it
    // since there's no tool result yet, but the assistant's content
    // remains, anchoring the LLM's reasoning.)
    const finalAssistant = replayed[3] as LLMMessage & { tool_calls?: LLMToolCall[] };
    expect(finalAssistant.content).toContain('Drafted email');
    // tool_calls is dropped because no tool row resolves call_batch_send_001
    expect(finalAssistant.tool_calls).toBeUndefined();

    // Architectural invariant 5: no orphan tool rows leaked through
    expect(replayed.filter((m) => m.role === 'tool')).toHaveLength(1);
  });

  it('round-trip is idempotent across multiple replays (no mutation)', async () => {
    const { rows, chat } = createInMemoryThread();
    const writer = new ThreadMessageWriter(chat);

    await writer.append(
      { role: 'user', content: 'q' },
      { threadId: THREAD_ID, userId: USER_ID, operationId: OPERATION_ID }
    );
    await writer.append(
      { role: 'assistant', content: '', tool_calls: [SEARCH_COACHES_CALL] },
      { threadId: THREAD_ID, userId: USER_ID, operationId: OPERATION_ID }
    );
    await writer.append(
      { role: 'tool', content: '[]', tool_call_id: SEARCH_COACHES_CALL.id },
      { threadId: THREAD_ID, userId: USER_ID, operationId: OPERATION_ID }
    );

    // Replay twice, assert byte-identical output and no row mutation.
    findChain.exec.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows);

    const replay = new ThreadMessageReplayService();
    const first = await replay.loadAsLLMMessages(THREAD_ID);
    const second = await replay.loadAsLLMMessages(THREAD_ID);

    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // Persisted rows untouched
    expect(rows).toHaveLength(3);
  });

  it('preserves linkage when the writer persists multiple parallel tool_calls', async () => {
    const { rows, chat } = createInMemoryThread();
    const writer = new ThreadMessageWriter(chat);

    const callA: LLMToolCall = {
      id: 'call_a',
      type: 'function',
      function: { name: 'search_web', arguments: '{"q":"a"}' },
    };
    const callB: LLMToolCall = {
      id: 'call_b',
      type: 'function',
      function: { name: 'search_web', arguments: '{"q":"b"}' },
    };

    await writer.append(
      { role: 'user', content: 'parallel' },
      { threadId: THREAD_ID, userId: USER_ID, operationId: OPERATION_ID }
    );
    await writer.append(
      { role: 'assistant', content: '', tool_calls: [callA, callB] },
      { threadId: THREAD_ID, userId: USER_ID, operationId: OPERATION_ID }
    );
    await writer.append(
      { role: 'tool', content: 'result_a', tool_call_id: 'call_a' },
      { threadId: THREAD_ID, userId: USER_ID, operationId: OPERATION_ID }
    );
    await writer.append(
      { role: 'tool', content: 'result_b', tool_call_id: 'call_b' },
      { threadId: THREAD_ID, userId: USER_ID, operationId: OPERATION_ID }
    );

    findChain.exec.mockResolvedValueOnce(rows);
    const replay = new ThreadMessageReplayService();
    const replayed = await replay.loadAsLLMMessages(THREAD_ID);

    expect(replayed).toHaveLength(4);
    const assistant = replayed[1] as LLMMessage & { tool_calls?: LLMToolCall[] };
    expect(assistant.tool_calls).toHaveLength(2);
    expect(assistant.tool_calls!.map((c) => c.id).sort()).toEqual(['call_a', 'call_b']);
    const toolRows = replayed.slice(2) as Array<LLMMessage & { tool_call_id?: string }>;
    expect(toolRows.map((t) => t.tool_call_id).sort()).toEqual(['call_a', 'call_b']);
  });
});
