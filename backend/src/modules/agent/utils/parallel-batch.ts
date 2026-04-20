/**
 * @fileoverview parallelBatch — Shared Concurrency-Controlled Fan-Out Primitive
 * @module @nxt1/backend/modules/agent/utils
 *
 * A single, composable utility for every place in the agent that needs to
 * process a collection of items in parallel with a concurrency cap.
 *
 * Before this utility existed, concurrency control was re-implemented
 * independently in:
 *   - ScraperService.scrapeMany()      (scraping tools)
 *   - ScraperService.warmCache()       (scheduled cache warming)
 *   - ScraperMediaService.persistBatch() (media download/upload)
 *
 * All of those callers now delegate their inner loop here, so there is one
 * tested, reviewed implementation of the semaphore pattern in the codebase.
 *
 * Design decisions:
 *   - Returns a discriminated union ({status:'fulfilled'|'rejected'}) that
 *     mirrors the native Promise.allSettled shape so callers can use familiar
 *     patterns to split successes from errors.
 *   - The concurrency cap is hard-limited to [1, MAX_SAFE_CONCURRENCY] to
 *     prevent accidental credit burn or connection pool exhaustion.
 *   - The AbortSignal is checked before each work item starts. Items that are
 *     already in-flight are NOT cancelled — callers must propagate the signal
 *     to the underlying operations themselves (e.g. fetch({signal})).
 *   - onProgress is called after every item completes (fulfilled or rejected)
 *     so progress bars always reach 100% regardless of failures.
 *   - Input order is preserved in the output array.
 *
 * @example
 * ```ts
 * // Parallel stats sub-page fetches, capped at 4 concurrent Firecrawl calls
 * const batchResults = await parallelBatch(
 *   statsUrls.map(url => ({ url, signal: context?.signal })),
 *   (req) => this.scraper.scrape(req),
 *   {
 *     concurrency: 4,
 *     signal: context?.signal,
 *     onProgress: (done, total) => progress?.(`Fetching stats sub-pages ${done}/${total}…`),
 *   },
 * );
 * const succeeded = batchResults.filter(r => r.status === 'fulfilled');
 * const failed    = batchResults.filter(r => r.status === 'rejected');
 * ```
 *
 * @example
 * ```ts
 * // Media download/upload — same pattern, different worker function
 * const persisted = await parallelBatch(
 *   items,
 *   (item) => this.persistOne(item, staging),
 *   { concurrency: MAX_CONCURRENT_DOWNLOADS, signal },
 * );
 * const results = persisted
 *   .filter(r => r.status === 'fulfilled' && r.value !== null)
 *   .map(r => (r as BatchFulfilled<PersistedMedia | null>).value!);
 * ```
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A successfully completed batch item.  `value` is the resolved value of the
 * worker function.
 */
export interface BatchFulfilled<T> {
  readonly status: 'fulfilled';
  readonly value: T;
  /** Zero-based index of this item in the original input array. */
  readonly index: number;
}

/**
 * A failed batch item.  `reason` is the thrown error (always an `Error`
 * instance — non-Error throws are wrapped automatically).
 */
export interface BatchRejected {
  readonly status: 'rejected';
  readonly reason: Error;
  /** Zero-based index of this item in the original input array. */
  readonly index: number;
}

/** Discriminated union returned for every input item. */
export type BatchResult<T> = BatchFulfilled<T> | BatchRejected;

/** Options for `parallelBatch`. */
export interface ParallelBatchOptions {
  /**
   * Maximum number of items processed concurrently.
   * Clamped to [1, 20] regardless of the value provided.
   * @default 5
   */
  readonly concurrency?: number;

  /**
   * Called after each item completes (fulfilled or rejected).
   * @param completed - Number of items finished so far (1-based).
   * @param total     - Total number of items in the batch.
   * @param index     - Zero-based index of the item that just finished.
   */
  readonly onProgress?: (completed: number, total: number, index: number) => void;

  /**
   * When this signal fires, no NEW items will be started.
   * Items already in-flight continue to completion.
   * Callers are responsible for propagating the signal to their own async ops.
   */
  readonly signal?: AbortSignal;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Hard upper bound on concurrency to prevent runaway resource consumption. */
const MAX_SAFE_CONCURRENCY = 20;

/** Minimum concurrency — a batch always processes at least one item at a time. */
const MIN_CONCURRENCY = 1;

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Process an array of items in parallel, capped at `concurrency` simultaneous
 * in-flight operations.  Always resolves (never rejects) — errors from
 * individual items appear as `{ status: 'rejected', reason }` entries.
 *
 * Input order is preserved in the output array.
 *
 * @param items      - The collection to process.
 * @param worker     - Async function invoked for each item.
 * @param options    - Concurrency cap, progress callback, and abort signal.
 * @returns          - A settled result for every input item, in input order.
 */
export async function parallelBatch<TInput, TOutput>(
  items: readonly TInput[],
  worker: (item: TInput, index: number) => Promise<TOutput>,
  options?: ParallelBatchOptions
): Promise<BatchResult<TOutput>[]> {
  const total = items.length;
  if (total === 0) return [];

  const concurrency = Math.max(
    MIN_CONCURRENCY,
    Math.min(options?.concurrency ?? 5, MAX_SAFE_CONCURRENCY)
  );
  const signal = options?.signal;
  const onProgress = options?.onProgress;

  // Pre-allocate the results array so output order matches input order.
  const results: BatchResult<TOutput>[] = new Array(total);
  let completed = 0;
  let nextIndex = 0;

  /**
   * Each "lane" loops over indices until exhausted.
   * Using a shared mutable `nextIndex` counter guarantees no two lanes pick
   * the same item without requiring a heavy synchronisation primitive — this
   * is safe because microtask-level JS execution is single-threaded.
   */
  const runLane = async (): Promise<void> => {
    while (nextIndex < total) {
      // Honour abort between items (in-flight items finish normally).
      if (signal?.aborted) break;

      const idx = nextIndex++;
      const item = items[idx];

      try {
        const value = await worker(item, idx);
        results[idx] = { status: 'fulfilled', value, index: idx };
      } catch (err) {
        results[idx] = {
          status: 'rejected',
          reason: err instanceof Error ? err : new Error(String(err)),
          index: idx,
        };
      }

      completed++;
      onProgress?.(completed, total, idx);
    }
  };

  // Spawn `concurrency` lanes and let them race to completion.
  await Promise.all(Array.from({ length: concurrency }, () => runLane()));

  return results;
}
