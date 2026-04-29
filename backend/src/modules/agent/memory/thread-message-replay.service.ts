/**
 * @fileoverview Thread Message Replay Service — Phase C (Thread-as-Truth)
 * @module @nxt1/backend/modules/agent/memory
 *
 * Single source of truth for "what does the agent remember?".
 *
 * On every turn (initial dispatch, resume after approval, coordinator
 * call-back), the orchestrator calls `loadAsLLMMessages(threadId)` to
 * rehydrate the canonical `LLMMessage[]` from MongoDB. This array IS the
 * conversation \u2014 there is no parallel "summary string" path.
 *
 * Guarantees:
 * 1. Messages are returned in chronological order (oldest \u2192 newest).
 * 2. `assistant` rows with persisted `tool_calls` are followed immediately
 *    by their resolving `tool` rows (pairing-validity sweep).
 * 3. Orphaned tool rows (no matching assistant.tool_calls) are dropped.
 * 4. Orphaned assistant.tool_calls (no matching tool rows) are dropped \u2014
 *    the assistant content is preserved but `tool_calls` is stripped.
 *    OpenRouter rejects unresolved tool_calls and this is the safe fix.
 * 5. Token-budget trim is applied from the *head* (oldest first), keeping
 *    the most recent turn intact and preserving system messages from the
 *    caller (system messages live in the agent's prompt assembly, not in
 *    persisted history, so this method never returns role:'system').
 *
 * This replaces the legacy `getRecentThreadHistory` flat-string format
 * (capped at 500 chars) and the lossy `historyMessages.map(m => ({role,
 * content}))` cast in `BaseAgent.execute()`.
 */

import type { LLMMessage, LLMToolCall } from '../llm/llm.types.js';
import { AgentMessageModel } from '../../../models/agent/agent-message.model.js';
import { logger } from '../../../utils/logger.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface RawRow {
  readonly _id: unknown;
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: string;
  readonly toolCallsWire?: readonly LLMToolCall[];
  readonly toolCalls?: readonly {
    readonly toolName: string;
    readonly input: Record<string, unknown>;
  }[];
  readonly toolCallId?: string;
  readonly createdAt: string;
  readonly deletedAt?: Date | string | null;
}

/** Approximate token count for a content string. */
function approxTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Reconstruct wire-format tool_calls when only the analytics-friendly
 * `toolCalls` field exists (legacy rows pre-Phase A). Best-effort \u2014 we
 * generate stable synthetic ids so resume can still pair them with tool
 * rows that quote the same `toolCallId`.
 */
function reconstructWireToolCalls(row: RawRow): readonly LLMToolCall[] | undefined {
  if (row.toolCallsWire?.length) return row.toolCallsWire;
  if (!row.toolCalls?.length) return undefined;
  return row.toolCalls.map((c, idx) => ({
    id: `legacy_${String(row._id).slice(-8)}_${idx}`,
    type: 'function' as const,
    function: {
      name: c.toolName,
      arguments: JSON.stringify(c.input ?? {}),
    },
  }));
}

/**
 * Convert a persisted row to an LLMMessage. Returns null if the row
 * cannot be safely projected (e.g. tool row without a toolCallId).
 */
function rowToLLM(row: RawRow): LLMMessage | null {
  if (row.role === 'system') {
    // Persisted system rows are rare \u2014 system prompts live in agent
    // prompt assembly. Drop them so we don't inject duplicates.
    return null;
  }

  if (row.role === 'tool') {
    if (!row.toolCallId) {
      logger.warn('[ThreadMessageReplay] Dropping tool row without toolCallId', {
        rowId: String(row._id),
      });
      return null;
    }
    return {
      role: 'tool',
      content: row.content ?? '',
      tool_call_id: row.toolCallId,
    };
  }

  if (row.role === 'assistant') {
    const wireCalls = reconstructWireToolCalls(row);
    return {
      role: 'assistant',
      content: row.content ?? '',
      ...(wireCalls && wireCalls.length > 0 && { tool_calls: wireCalls }),
    };
  }

  // role === 'user'
  return {
    role: 'user',
    content: row.content ?? '',
  };
}

/**
 * Pairing-validity sweep. Walks the array twice:
 *
 *   Pass 1 (positional validity):
 *     Tracks an "active assistant pending tool_call ids" window. A tool row
 *     is valid only if its `tool_call_id` is in the window of the most
 *     recent assistant turn AND there is no intervening non-tool message
 *     between that assistant and this tool row. Anthropic's API enforces
 *     this strictly: `messages.N.content[*].tool_use_id` must reference
 *     a `tool_use` block that exists on the IMMEDIATELY PRECEDING
 *     assistant message — global id membership is not enough.
 *
 *   Pass 2 (output materialisation):
 *     Emits the survivors. Drops orphan tool rows. Filters
 *     assistant.tool_calls down to the ids that were resolved in pass 1.
 *     If an assistant ends up with zero resolved tool_calls AND empty
 *     content, the entire turn is dropped.
 *
 * This is the single source of structural correctness before the prompt
 * is shipped to OpenRouter — provider 400s caused by orphaned
 * `tool_use_id` blocks (Vertex/Anthropic's most common rejection)
 * originate here.
 */
function reconcileToolPairs(messages: LLMMessage[]): LLMMessage[] {
  // ── Pass 1: compute valid tool indices + resolved ids ──────────────────
  const validToolIndices = new Set<number>();
  const resolvedIds = new Set<string>();
  let activePendingIds: Set<string> | null = null;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'tool') {
      if (activePendingIds !== null && m.tool_call_id && activePendingIds.has(m.tool_call_id)) {
        validToolIndices.add(i);
        resolvedIds.add(m.tool_call_id);
      }
      // Tool rows do NOT close the active assistant window — multiple
      // tool rows can resolve the same assistant's tool_calls in a row.
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      // New assistant with tool_calls → open a fresh window. Any
      // pending ids from the previous assistant that weren't resolved
      // are now permanently orphan (handled by pass 2's filter).
      activePendingIds = new Set(m.tool_calls.map((c) => c.id));
    } else {
      // Any other message (user, assistant text, system) closes the
      // window. Subsequent tool rows are orphan.
      activePendingIds = null;
    }
  }

  // ── Pass 2: materialise output ────────────────────────────────────────
  const out: LLMMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'tool') {
      if (validToolIndices.has(i)) out.push(m);
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const kept = m.tool_calls.filter((c) => resolvedIds.has(c.id));
      if (kept.length === m.tool_calls.length) {
        out.push(m);
      } else if (kept.length > 0) {
        out.push({ ...m, tool_calls: kept });
      } else {
        // No resolvable tool calls — drop tool_calls; if content is
        // also empty, drop the assistant turn entirely.
        if (m.content && (typeof m.content !== 'string' || m.content.trim().length > 0)) {
          const next = { ...m };
          delete (next as { tool_calls?: readonly LLMToolCall[] }).tool_calls;
          out.push(next);
        }
      }
      continue;
    }
    out.push(m);
  }
  return out;
}

/**
 * Remove consecutive text-only assistant messages with identical content.
 *
 * This guards against the race where `ThreadMessageWriter` writes the final
 * LLM text turn mid-loop AND the worker's final persist step writes the same
 * content again with enriched metadata (steps, parts, toolCalls). Both rows
 * are valid from the LLM-replay perspective but would cause the UI to display
 * the answer twice when the thread is reloaded.
 *
 * Only consecutive pure-text assistant messages are collapsed \u2014 tool-calling
 * turns and user messages are never touched.
 */
function deduplicateConsecutiveAssistantMessages(messages: LLMMessage[]): LLMMessage[] {
  const out: LLMMessage[] = [];
  for (const m of messages) {
    if (m.role === 'assistant' && !m.tool_calls?.length && out.length > 0) {
      const prev = out[out.length - 1];
      if (
        prev.role === 'assistant' &&
        !prev.tool_calls?.length &&
        (prev.content ?? '') === (m.content ?? '')
      ) {
        // Duplicate text-only assistant turn \u2014 skip the second occurrence.
        continue;
      }
    }
    out.push(m);
  }
  return out;
}

/**
 * Trim from the head until total approximate tokens fit `maxTokens`.
 * Always keeps the final assistant↔tool pair contiguous — we never split
 * an assistant.tool_calls from its resolving tool rows even if the budget
 * would otherwise force it.
 */
function trimToBudget(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
  let total = messages.reduce(
    (sum, m) => sum + approxTokens(typeof m.content === 'string' ? m.content : ''),
    0
  );
  if (total <= maxTokens) return messages;

  const trimmed = [...messages];
  while (total > maxTokens && trimmed.length > 2) {
    const dropped = trimmed.shift();
    if (!dropped) break;
    // If we dropped an assistant with tool_calls, also drop the
    // immediately-following tool rows it owns so we don't leave orphans.
    if (dropped.role === 'assistant' && dropped.tool_calls?.length) {
      const ids = new Set(dropped.tool_calls.map((c) => c.id));
      while (
        trimmed.length > 0 &&
        trimmed[0]?.role === 'tool' &&
        ids.has(trimmed[0].tool_call_id ?? '')
      ) {
        trimmed.shift();
      }
    }
    total = trimmed.reduce(
      (sum, m) => sum + approxTokens(typeof m.content === 'string' ? m.content : ''),
      0
    );
  }
  return trimmed;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface ReplayOptions {
  /** Max number of rows to fetch from MongoDB (default 200). */
  readonly limit?: number;
  /**
   * Approximate max tokens worth of history to return. Defaults to the
   * primary agent's `maxPromptTokens / 3` so prompt assembly has 2/3
   * for system prompt + tools + current intent.
   */
  readonly maxTokens?: number;
}

export class ThreadMessageReplayService {
  /**
   * Load the canonical `LLMMessage[]` for `threadId`. The returned array
   * is ready to feed into `OpenRouterService.complete` as `messages` after
   * the caller prepends its system prompt(s).
   */
  async loadAsLLMMessages(
    threadId: string,
    opts: ReplayOptions = {}
  ): Promise<readonly LLMMessage[]> {
    if (!threadId) return [];
    const limit = opts.limit ?? 200;
    const maxTokens = opts.maxTokens ?? 50_000;

    const rawDocs = (await AgentMessageModel.find({ threadId, deletedAt: null })
      .sort({ createdAt: 1 })
      .limit(limit)
      .select('_id role content toolCallsWire toolCalls toolCallId createdAt deletedAt')
      .lean()
      .exec()) as unknown as readonly RawRow[];

    if (rawDocs.length === 0) return [];

    const projected: LLMMessage[] = [];
    for (const row of rawDocs) {
      const llm = rowToLLM(row);
      if (llm) projected.push(llm);
    }

    const reconciled = reconcileToolPairs(projected);
    const deduped = deduplicateConsecutiveAssistantMessages(reconciled);
    const trimmed = trimToBudget(deduped, maxTokens);

    logger.debug('[ThreadMessageReplay] Loaded', {
      threadId,
      rawCount: rawDocs.length,
      projectedCount: projected.length,
      reconciledCount: reconciled.length,
      dedupedCount: deduped.length,
      finalCount: trimmed.length,
    });

    return trimmed;
  }
}

let _instance: ThreadMessageReplayService | null = null;

export function getThreadMessageReplayService(): ThreadMessageReplayService {
  if (!_instance) _instance = new ThreadMessageReplayService();
  return _instance;
}

export function __resetThreadMessageReplayServiceForTests(): void {
  _instance = null;
}
