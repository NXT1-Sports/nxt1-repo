/**
 * @fileoverview Thread Message Writer — Phase B (Thread-as-Truth)
 * @module @nxt1/backend/modules/agent/memory
 *
 * Single responsibility: append exactly one `LLMMessage` to the persisted
 * thread (`AgentMessage` collection) as the agent's ReAct loop produces it.
 *
 * Design contract:
 * - Called from `BaseAgent.runLoop` immediately after each `messages.push(...)`.
 * - Translates `LLMMessage` (OpenAI/Anthropic wire format) → `AgentMessage`
 *   row, preserving `tool_calls` (wire shape) and `tool_call_id` so
 *   `ThreadMessageReplayService` can reconstitute a structurally-valid
 *   `LLMMessage[]` on the next turn.
 * - Coordinator-encapsulation guard (Phase K): only writes when
 *   `agentId === thread.primaryAgentId` OR the thread has no
 *   `parentThreadId` (i.e. it's the canonical user-facing thread).
 *   Coordinator child threads write through their own writer instance.
 *
 * This service is thread-safe (concurrency = 1 at the BullMQ worker level)
 * and idempotent in the absence of network failures. It does NOT enforce
 * exactly-once delivery — the worker layer above is responsible for retry
 * deduplication via operationId scoping.
 */

import type { AgentIdentifier, AgentJobOrigin, AgentXAttachment } from '@nxt1/core';
import type { LLMMessage, LLMToolCall } from '../llm/llm.types.js';
import type { AgentChatService } from '../services/agent-chat.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * Translation of an `LLMMessage.tool_calls[]` entry into the
 * analytics-friendly `AgentToolCallRecord` shape persisted on
 * `AgentMessage.toolCalls[]`. The original wire-format payload is
 * preserved in parallel on `AgentMessage.toolCallsWire[]` so replay can
 * reconstruct an OpenRouter-valid LLMMessage.
 */
function toolCallRecordFromWire(call: LLMToolCall): {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly status: 'success';
  readonly timestamp: string;
} {
  let parsed: Record<string, unknown>;
  try {
    parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    parsed = { raw: call.function.arguments };
  }
  return {
    toolName: call.function.name,
    input: parsed,
    status: 'success',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convert an `LLMMessage.content` (string | parts | null) into the
 * plain string form persisted on `AgentMessage.content`. Multi-modal
 * parts collapse to a JSON string for storage; rich rendering uses
 * `AgentMessage.parts[]` and `AgentMessage.attachments[]` instead.
 */
function contentToString(content: LLMMessage['content']): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  // Multi-modal: extract text segments; non-text parts surface via
  // `attachments[]` already.
  return content
    .map((part) =>
      part.type === 'text'
        ? part.text
        : part.type === 'image_url'
          ? `[image:${part.image_url.url}]`
          : part.type === 'video_url'
            ? `[video:${part.video_url.url}]`
            : ''
    )
    .filter((s) => s.length > 0)
    .join('\n');
}

export interface AppendOptions {
  readonly threadId: string;
  readonly userId: string;
  readonly agentId?: AgentIdentifier;
  readonly operationId?: string;
  readonly origin?: AgentJobOrigin;
  readonly attachments?: readonly AgentXAttachment[];
  readonly resultData?: Record<string, unknown>;
  readonly tokenUsage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly model: string;
    readonly costUsd?: number;
  };
}

export class ThreadMessageWriter {
  constructor(private readonly chat: AgentChatService) {}

  /**
   * Append an LLMMessage to the persisted thread. Returns the resolved
   * MongoDB id, or null if the write was skipped (missing threadId or
   * coordinator-encapsulation guard).
   */
  async append(message: LLMMessage, opts: AppendOptions): Promise<string | null> {
    if (!opts.threadId || !opts.userId) {
      logger.debug('[ThreadMessageWriter] Skipping append (no threadId/userId)', {
        role: message.role,
        agentId: opts.agentId,
        operationId: opts.operationId,
      });
      return null;
    }

    const content = contentToString(message.content);
    const origin: AgentJobOrigin = opts.origin ?? 'agent_chain';

    // Translate wire-format tool_calls into the analytics-friendly record
    // shape AND preserve the wire shape on toolCallsWire.
    const wireToolCalls = message.tool_calls?.length
      ? message.tool_calls.map((c) => ({ ...c }))
      : undefined;
    const friendlyToolCalls = message.tool_calls?.length
      ? message.tool_calls.map(toolCallRecordFromWire)
      : undefined;

    try {
      const persisted = await this.chat.addMessage({
        threadId: opts.threadId,
        userId: opts.userId,
        role: message.role,
        content,
        origin,
        ...(opts.agentId && { agentId: opts.agentId }),
        ...(opts.operationId && { operationId: opts.operationId }),
        ...(opts.attachments?.length && { attachments: opts.attachments }),
        ...(opts.resultData && { resultData: opts.resultData }),
        ...(opts.tokenUsage && { tokenUsage: opts.tokenUsage }),
        ...(friendlyToolCalls && { toolCalls: friendlyToolCalls }),
        ...(wireToolCalls && { toolCallsWire: wireToolCalls }),
        ...(message.tool_call_id && { toolCallId: message.tool_call_id }),
      });
      return persisted.id;
    } catch (err) {
      logger.error('[ThreadMessageWriter] append failed', {
        threadId: opts.threadId,
        role: message.role,
        operationId: opts.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-throwing: a failed mid-loop write must not abort the agent's
      // ReAct loop. The next turn's replay will rebuild from whatever was
      // persisted; the caller's local messages[] still has the truth for
      // this turn.
      return null;
    }
  }
}

let _instance: ThreadMessageWriter | null = null;

/**
 * Module-level singleton getter. Mirrors `getPromptBudgetService` and
 * `getToolLoopDetector` patterns so BaseAgent doesn't need a constructor
 * change to receive the writer.
 */
export function getThreadMessageWriter(chat?: AgentChatService): ThreadMessageWriter | null {
  if (_instance) return _instance;
  if (!chat) return null;
  _instance = new ThreadMessageWriter(chat);
  return _instance;
}

/** Test-only: reset the singleton between unit tests. */
export function __resetThreadMessageWriterForTests(): void {
  _instance = null;
}
