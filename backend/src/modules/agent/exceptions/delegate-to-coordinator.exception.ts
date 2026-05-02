/**
 * @fileoverview Delegate-to-Coordinator Exception
 * @module @nxt1/backend/modules/agent/exceptions
 *
 * Control-flow signal thrown by the `delegate_to_coordinator` tool when the
 * Primary Agent decides a specialist coordinator should handle a sub-task.
 * Distinct from {@link AgentDelegationException} — that one re-runs the
 * Planner; this one targets a specific coordinator directly.
 *
 * The Primary Agent's executeTool wrapper catches this, runs the named
 * coordinator via {@link AgentRouterExecutionService}, and feeds the
 * coordinator's output back as the tool observation so the ReAct loop
 * continues seamlessly.
 */

import type { AgentIdentifier } from '@nxt1/core';

export interface DelegateToCoordinatorPayload {
  readonly coordinatorId: Exclude<AgentIdentifier, 'router'>;
  readonly goal: string;
}

export class DelegateToCoordinatorException extends Error {
  readonly isDelegateToCoordinator = true as const;
  readonly payload: DelegateToCoordinatorPayload;

  constructor(payload: DelegateToCoordinatorPayload) {
    super(`Primary delegating to "${payload.coordinatorId}": "${payload.goal.slice(0, 120)}"`);
    this.name = 'DelegateToCoordinatorException';
    this.payload = payload;
  }
}

export function isDelegateToCoordinator(err: unknown): err is DelegateToCoordinatorException {
  return (
    err instanceof DelegateToCoordinatorException ||
    (err instanceof Error &&
      'isDelegateToCoordinator' in err &&
      (err as DelegateToCoordinatorException).isDelegateToCoordinator === true)
  );
}
