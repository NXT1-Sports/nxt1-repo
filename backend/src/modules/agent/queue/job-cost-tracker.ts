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

interface JobCostBucket {
  totalUsd: number;
  byFeatureUsd: Map<string, number>;
  byFeatureCount: Map<string, number>;
}

/** In-memory accumulator: operationId → cost bucket for this job. */
const costByJob = new Map<string, JobCostBucket>();

function normalizeFeatureKey(feature?: string): string | null {
  if (typeof feature !== 'string') {
    return null;
  }

  const normalized = feature
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return normalized.length > 0 ? normalized : null;
}

/**
 * Add the cost of a single LLM call to the running total for a job.
 * Called from the onTelemetry callback in bootstrap.ts.
 */
export function addJobCost(operationId: string, costUsd: number, feature?: string): void {
  if (!operationId || !Number.isFinite(costUsd) || costUsd <= 0) return;

  const bucket = costByJob.get(operationId) ?? {
    totalUsd: 0,
    byFeatureUsd: new Map<string, number>(),
    byFeatureCount: new Map<string, number>(),
  };
  bucket.totalUsd += costUsd;

  const featureKey = normalizeFeatureKey(feature);
  if (featureKey) {
    bucket.byFeatureUsd.set(featureKey, (bucket.byFeatureUsd.get(featureKey) ?? 0) + costUsd);
    bucket.byFeatureCount.set(featureKey, (bucket.byFeatureCount.get(featureKey) ?? 0) + 1);
  }

  costByJob.set(operationId, bucket);
}

/**
 * Return the feature-level cost breakdown for a job and clear the in-memory entry.
 */
export function getAndClearJobCostBreakdown(operationId: string): {
  totalUsd: number;
  byFeatureUsd: Record<string, number>;
  byFeatureCount: Record<string, number>;
} {
  const bucket = costByJob.get(operationId);
  costByJob.delete(operationId);

  if (!bucket) {
    return { totalUsd: 0, byFeatureUsd: {}, byFeatureCount: {} };
  }

  const byFeatureUsd: Record<string, number> = {};
  for (const [feature, featureCost] of bucket.byFeatureUsd.entries()) {
    byFeatureUsd[feature] = featureCost;
  }

  const byFeatureCount: Record<string, number> = {};
  for (const [feature, featureCount] of bucket.byFeatureCount.entries()) {
    byFeatureCount[feature] = featureCount;
  }

  return {
    totalUsd: bucket.totalUsd,
    byFeatureUsd,
    byFeatureCount,
  };
}

/**
 * Return the accumulated cost for a job and remove it from the map.
 * Called by AgentWorker after the job finishes so memory doesn't grow unbounded.
 */
export function getAndClearJobCost(operationId: string): number {
  return getAndClearJobCostBreakdown(operationId).totalUsd;
}
