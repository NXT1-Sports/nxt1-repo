/**
 * @fileoverview Agent Delegation Exception
 * @module @nxt1/backend/modules/agent/errors
 *
 * Thrown by the `delegate_task` tool when a sub-agent determines that
 * the user's request is outside its domain. This is a **control-flow
 * signal**, not an error. The AgentRouter catches it, strips the
 * forced `payload.agent`, and re-dispatches the intent through the
 * PlannerAgent so the correct coordinator handles the task.
 *
 * Design rationale:
 * - Exception-based (not a return value) so the ReAct loop aborts
 *   immediately instead of wasting tokens on a conversational summary.
 * - Mirrors the AgentYieldException pattern for consistency.
 * - Includes a `delegationCount` guard to prevent infinite loops
 *   between the Planner and coordinators.
 */

export interface AgentDelegationPayload {
  /** The user's original intent to be re-planned by the Chief of Staff. */
  readonly forwardingIntent: string;
  /** The agent that initiated the delegation. */
  readonly sourceAgent: string;
}

/**
 * Control-flow exception that signals an agent is handing off to the Planner.
 * The AgentRouter catches this and re-dispatches through the full DAG flow.
 */
export class AgentDelegationException extends Error {
  readonly isDelegation = true as const;
  readonly payload: AgentDelegationPayload;

  constructor(payload: AgentDelegationPayload) {
    super(`Agent "${payload.sourceAgent}" delegated: "${payload.forwardingIntent.slice(0, 100)}"`);
    this.name = 'AgentDelegationException';
    this.payload = payload;
  }
}

/** Type guard to identify delegation exceptions in catch blocks. */
export function isAgentDelegation(err: unknown): err is AgentDelegationException {
  return (
    err instanceof AgentDelegationException ||
    (err instanceof Error &&
      'isDelegation' in err &&
      (err as AgentDelegationException).isDelegation === true)
  );
}
