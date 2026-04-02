/**
 * @fileoverview In-process job cost tracker
 * @module @nxt1/backend/modules/agent/queue
 *
 * Accumulates LLM costs per operationId using the onTelemetry callback.
 * This bypasses the Helicone REST API (which requires a matching org API key)
 * and instead uses the cost estimates already computed by OpenRouterService
 * after each LLM response.
 *
 * Lifecycle:
 *   addJobCost(operationId, costUsd)   — called by onTelemetry for every LLM call
 *   getAndClearJobCost(operationId)    — called by AgentWorker after job completes
 */

/** In-memory accumulator: operationId → total costUsd for this job. */
const costByJob = new Map<string, number>();

/**
 * Add the cost of a single LLM call to the running total for a job.
 * Called from the onTelemetry callback in bootstrap.ts.
 */
export function addJobCost(operationId: string, costUsd: number): void {
  if (!operationId) return;
  costByJob.set(operationId, (costByJob.get(operationId) ?? 0) + costUsd);
}

/**
 * Return the accumulated cost for a job and remove it from the map.
 * Called by AgentWorker after the job finishes so memory doesn't grow unbounded.
 */
export function getAndClearJobCost(operationId: string): number {
  const cost = costByJob.get(operationId) ?? 0;
  costByJob.delete(operationId);
  return cost;
}
