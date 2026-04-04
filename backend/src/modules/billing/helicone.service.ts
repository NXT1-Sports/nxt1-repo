/**
 * @fileoverview Helicone Service
 * @module @nxt1/backend/modules/billing
 *
 * Fetches actual AI cost from Helicone.ai after a job completes.
 * Tags each AI call with jobId / userId / feature so costs can be queried per-job.
 */

import { logger } from '../../utils/logger.js';

const HELICONE_API_BASE = 'https://api.helicone.ai/v1';

// ============================================
// TYPES
// ============================================

export interface HeliconeRequestFilter {
  jobId?: string;
  userId?: string;
  feature?: string;
}

export interface HeliconeJobCostResult {
  /** Total cost in USD across all requests for this jobId */
  totalCostUsd: number;
  /** Number of requests found */
  requestCount: number;
  /** Whether the result came from Helicone or a fallback */
  source: 'helicone' | 'fallback';
}

// ============================================
// INTERNAL HELPERS
// ============================================

function getApiKey(): string {
  const key = process.env['HELICONE_API_KEY'];
  if (!key) {
    throw new Error('HELICONE_API_KEY is not configured');
  }
  return key;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get the total cost of all AI requests tagged with a given jobId.
 *
 * Helicone stores custom properties per request. We tag each AI call with
 * `Helicone-Property-Job-Id`, `Helicone-Property-User-Id`, and
 * `Helicone-Property-Feature` headers when proxying through Helicone.
 *
 * @param jobId - The unique job ID used to tag AI calls
 * @param retries - Number of retry attempts when Helicone returns 0 requests (default 3)
 * @param retryDelayMs - Delay between retries in ms (default 3000 — Helicone indexing lag)
 * @returns Total cost in USD
 */
export async function getJobCost(
  jobId: string,
  retries = 3,
  retryDelayMs = 3000
): Promise<HeliconeJobCostResult> {
  const apiKey = getApiKey();

  const fetchOnce = async (): Promise<HeliconeJobCostResult> => {
    // Use the point-query endpoint (not clickhouse) for per-job lookups.
    // Property names must be lowercase — HTTP/2 normalises all header names to lowercase
    // before Helicone stores them, so 'Helicone-Property-job-id' is stored as 'job-id'.
    // The properties filter must be wrapped in request_response_rmt per Helicone docs.
    const response = await fetch(`${HELICONE_API_BASE}/request/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        filter: {
          request_response_rmt: {
            properties: {
              'job-id': {
                equals: jobId,
              },
            },
          },
        },
        limit: 1000,
        offset: 0,
        sort: {
          created_at: 'desc',
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Helicone API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ costUSD?: number; cost_usd?: number; cost?: number }>;
      meta?: { total?: number };
    };

    const requests = data.data ?? [];
    const totalCostUsd = requests.reduce((sum, req) => {
      // Helicone may return cost under different field names depending on API version
      const cost = req.costUSD ?? req.cost_usd ?? req.cost ?? 0;
      return sum + cost;
    }, 0);

    logger.info('[helicone] Fetched job cost', {
      jobId,
      requestCount: requests.length,
      totalCostUsd,
    });

    return {
      totalCostUsd,
      requestCount: requests.length,
      source: 'helicone',
    };
  };

  // Retry loop: Helicone can take a few seconds to index requests after job completion.
  // If requestCount === 0, wait and retry before concluding there is truly no cost.
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      logger.info('[helicone] Retrying job cost fetch (Helicone indexing lag)', {
        jobId,
        attempt,
        retries,
      });
    }
    try {
      const result = await fetchOnce();
      if (result.requestCount > 0 || attempt === retries) {
        return result;
      }
      // requestCount === 0 and still have retries left — keep waiting
    } catch (error) {
      lastError = error;
    }
  }

  logger.error('[helicone] Failed to fetch job cost — using fallback 0', {
    jobId,
    error: lastError,
  });

  return {
    totalCostUsd: 0,
    requestCount: 0,
    source: 'fallback',
  };
}

/**
 * Get costs aggregated by feature for a given user over a date range.
 * Useful for usage analytics or monthly billing reconciliation.
 *
 * @param userId - The user ID used to tag AI calls
 * @param startDate - ISO date string for start of range
 * @param endDate - ISO date string for end of range
 */
export async function getUserCostByPeriod(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ totalCostUsd: number; requestCount: number }> {
  const apiKey = getApiKey();

  try {
    const response = await fetch(`${HELICONE_API_BASE}/request/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        filter: {
          and: [
            {
              properties: {
                'User-Id': { equals: userId },
              },
            },
            {
              request: {
                created_at: { gte: startDate },
              },
            },
            {
              request: {
                created_at: { lte: endDate },
              },
            },
          ],
        },
        limit: 10000,
        offset: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`Helicone API error ${response.status}`);
    }

    const data = (await response.json()) as {
      data: Array<{ costUSD?: number; cost_usd?: number }>;
    };
    const requests = data.data ?? [];
    const totalCostUsd = requests.reduce((sum, req) => {
      return sum + (req.costUSD ?? req.cost_usd ?? 0);
    }, 0);

    return { totalCostUsd, requestCount: requests.length };
  } catch (error) {
    logger.error('[helicone] Failed to fetch user period cost', {
      userId,
      startDate,
      endDate,
      error,
    });
    return { totalCostUsd: 0, requestCount: 0 };
  }
}

/**
 * Build the Helicone proxy headers to tag an AI request.
 * Add these to every AI SDK / fetch call so costs are tracked per-job.
 *
 * Usage:
 *   const headers = buildHeliconeHeaders({ jobId, userId, feature });
 *   await openai.chat.completions.create({ ... }, { headers });
 */
export function buildHeliconeHeaders(params: {
  jobId: string;
  userId: string;
  feature: string;
}): Record<string, string> {
  const apiKey = process.env['HELICONE_API_KEY'];
  if (!apiKey) {
    return {};
  }

  return {
    'Helicone-Auth': `Bearer ${apiKey}`,
    'Helicone-Property-Job-Id': params.jobId,
    'Helicone-Property-User-Id': params.userId,
    'Helicone-Property-Feature': params.feature,
  };
}
