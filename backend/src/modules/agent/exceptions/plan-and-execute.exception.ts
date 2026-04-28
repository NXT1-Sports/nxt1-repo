/**
 * @fileoverview Plan-and-Execute Exception
 * @module @nxt1/backend/modules/agent/exceptions
 *
 * Control-flow signal thrown by the `plan_and_execute` tool when the Primary
 * Agent decides a multi-step DAG plan is warranted. The Primary's tool
 * wrapper catches this and routes through the existing PlannerAgent +
 * AgentRouterExecutionService pipeline, then feeds the aggregated result
 * back as a tool observation.
 */

export interface PlanAndExecutePayload {
  readonly goal: string;
}

export class PlanAndExecuteException extends Error {
  readonly isPlanAndExecute = true as const;
  readonly payload: PlanAndExecutePayload;

  constructor(payload: PlanAndExecutePayload) {
    super(`Primary requesting multi-step plan: "${payload.goal.slice(0, 120)}"`);
    this.name = 'PlanAndExecuteException';
    this.payload = payload;
  }
}

export function isPlanAndExecute(err: unknown): err is PlanAndExecuteException {
  return (
    err instanceof PlanAndExecuteException ||
    (err instanceof Error &&
      'isPlanAndExecute' in err &&
      (err as PlanAndExecuteException).isPlanAndExecute === true)
  );
}
