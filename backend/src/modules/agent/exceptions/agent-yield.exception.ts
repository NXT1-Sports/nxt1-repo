/**
 * @fileoverview Agent Yield Exception
 * @module @nxt1/backend/modules/agent/errors
 *
 * Thrown by tools (AskUserTool) or the ApprovalGate to signal
 * that the agent must suspend execution and wait for user input.
 *
 * The BullMQ worker catches this exception, serializes the yield
 * state to Firestore + MongoDB, and completes the job cleanly
 * (without marking it as failed). When the user responds, the
 * resume route re-enqueues a new job that picks up from the
 * saved message array.
 *
 * This is NOT an error — it is a control-flow signal. The worker
 * treats it differently from real errors.
 */

import type { AgentYieldReason, AgentIdentifier } from '@nxt1/core';
import type { LLMMessage } from '../llm/llm.types.js';

/**
 * Phase N (yield-state versioning): stamp every payload with a schema
 * version so future LLMMessage shape changes don't orphan paused
 * threads. Resume service inspects this and applies adapter shims for
 * older versions.
 */
export const AGENT_YIELD_PAYLOAD_VERSION = 1 as const;

export interface AgentYieldPayload {
  /**
   * Phase N: schema version of this payload. Defaults to undefined for
   * v0 records written before this field existed; resume service treats
   * `undefined | 1` as the current shape.
   */
  readonly version?: number;
  /** Why the agent is yielding. */
  readonly reason: AgentYieldReason;
  /** The question / action summary shown to the user. */
  readonly promptToUser: string;
  /** Which sub-agent was executing when the yield happened. */
  readonly agentId: AgentIdentifier;
  /**
   * The full LLM message array at the point of suspension.
   *
   * Phase L: this is now a *defensive snapshot*. The canonical source of
   * truth on resume is `ThreadMessageReplayService.loadAsLLMMessages`.
   * `messages` is retained only so legacy paused threads (pre-rollout)
   * still resume correctly.
   */
  readonly messages: readonly LLMMessage[];
  /**
   * Phase L: the in-flight assistant turn that triggered the yield but
   * was *not* yet persisted by ThreadMessageWriter (because the
   * approval gate intercepted before tool execution). Resume appends
   * this to the replayed history.
   */
  readonly pendingAssistantMessage?: LLMMessage;
  /** The tool call that triggered the yield (for approval-based yields). */
  readonly pendingToolCall?: {
    readonly toolName: string;
    readonly toolInput: Record<string, unknown>;
    readonly toolCallId: string;
  };
  /** ID of the approval request (if reason is 'needs_approval'). */
  readonly approvalId?: string;
  /** DAG execution context for multi-task plans. */
  readonly planContext?: {
    readonly currentTaskId: string;
    readonly completedTaskResults: Record<string, unknown>;
    readonly enrichedIntent: string;
  };
}

/**
 * Control-flow exception that signals the agent must suspend and wait.
 * The worker catches this and transitions the job to `awaiting_input`
 * or `awaiting_approval` status instead of marking it as failed.
 */
export class AgentYieldException extends Error {
  readonly isYield = true as const;
  readonly payload: AgentYieldPayload;

  constructor(payload: AgentYieldPayload) {
    super(`Agent yielded: ${payload.reason} — ${payload.promptToUser}`);
    this.name = 'AgentYieldException';
    this.payload = payload;
  }
}

/** Type guard to identify yield exceptions in catch blocks. */
export function isAgentYield(err: unknown): err is AgentYieldException {
  return (
    err instanceof AgentYieldException ||
    (err instanceof Error && 'isYield' in err && (err as AgentYieldException).isYield === true)
  );
}
