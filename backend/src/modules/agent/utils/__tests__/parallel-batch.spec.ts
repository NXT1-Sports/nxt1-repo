/**
 * @fileoverview Unit Tests — parallelBatch
 * @module @nxt1/backend/modules/agent/utils
 *
 * Covers:
 *   - Empty input fast-path
 *   - Fulfilled and rejected results with correct shape
 *   - Input-order preservation in the output array
 *   - Concurrency clamping ([1, 20])
 *   - Actual concurrency ceiling enforcement
 *   - onProgress callback (fired once per item, 1-based count, correct index)
 *   - AbortSignal: new items not started after abort, in-flight items complete
 *   - Non-Error throws are wrapped in Error
 *   - Mixed success / failure batches aggregate correctly
 */

import { describe, expect, it, vi } from 'vitest';
import { parallelBatch, type BatchFulfilled, type BatchRejected } from '../parallel-batch.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a worker that resolves after `delayMs` with the item value. */
function makeDelayedWorker<T>(delayMs: number) {
  return (item: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(item), delayMs));
}

/** Deferred promise — lets tests control when a worker resolves. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parallelBatch', () => {
  // ── Empty input ────────────────────────────────────────────────────────────

  it('returns an empty array immediately for empty input', async () => {
    const result = await parallelBatch([], async (x) => x);
    expect(result).toEqual([]);
  });

  // ── Result shapes ──────────────────────────────────────────────────────────

  it('returns fulfilled results with correct shape', async () => {
    const items = [1, 2, 3];
    const results = await parallelBatch(items, async (x) => x * 2);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
    const values = results.map((r) => (r as BatchFulfilled<number>).value);
    expect(values).toEqual([2, 4, 6]);
  });

  it('returns rejected results with an Error reason', async () => {
    const results = await parallelBatch([1], async () => {
      throw new Error('boom');
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('rejected');
    expect((results[0] as BatchRejected).reason).toBeInstanceOf(Error);
    expect((results[0] as BatchRejected).reason.message).toBe('boom');
  });

  it('wraps non-Error throws in an Error', async () => {
    const results = await parallelBatch(
      ['x'],
      async () => {
        throw 'string error';
      } // eslint-disable-line @typescript-eslint/only-throw-error
    );

    expect(results[0].status).toBe('rejected');
    expect((results[0] as BatchRejected).reason).toBeInstanceOf(Error);
    expect((results[0] as BatchRejected).reason.message).toBe('string error');
  });

  it('exposes the correct zero-based index on each result', async () => {
    const items = ['a', 'b', 'c'];
    const results = await parallelBatch(items, async (x) => x, { concurrency: 1 });

    results.forEach((r, i) => {
      expect(r.index).toBe(i);
    });
  });

  // ── Order preservation ─────────────────────────────────────────────────────

  it('preserves input order in the output array regardless of completion order', async () => {
    // Item 0 takes longer than items 1 and 2 — but output[0] must still be item 0.
    const deferrals = [deferred<number>(), deferred<number>(), deferred<number>()];

    const batchPromise = parallelBatch([0, 1, 2], (idx) => deferrals[idx].promise, {
      concurrency: 3,
    });

    // Resolve in reverse order
    deferrals[2].resolve(200);
    deferrals[1].resolve(100);
    deferrals[0].resolve(50);

    const results = await batchPromise;
    expect(results.map((r) => (r as BatchFulfilled<number>).value)).toEqual([50, 100, 200]);
  });

  // ── Mixed success + failure ────────────────────────────────────────────────

  it('handles a mix of fulfilled and rejected items', async () => {
    const results = await parallelBatch(
      [1, 2, 3, 4],
      async (x) => {
        if (x % 2 === 0) throw new Error(`even: ${x}`);
        return x;
      },
      { concurrency: 4 }
    );

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
    expect(results[3].status).toBe('rejected');

    expect((results[0] as BatchFulfilled<number>).value).toBe(1);
    expect((results[2] as BatchFulfilled<number>).value).toBe(3);
    expect((results[1] as BatchRejected).reason.message).toBe('even: 2');
    expect((results[3] as BatchRejected).reason.message).toBe('even: 4');
  });

  // ── Concurrency clamping ───────────────────────────────────────────────────

  it('clamps concurrency to at least 1 when 0 is provided', async () => {
    // Should not throw or hang — just runs sequentially
    const results = await parallelBatch([1, 2], async (x) => x, { concurrency: 0 });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('clamps concurrency to 20 when a value above MAX_SAFE_CONCURRENCY is provided', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const results = await parallelBatch(items, async (x) => x, { concurrency: 999 });
    expect(results).toHaveLength(25);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  // ── Actual concurrency ceiling ─────────────────────────────────────────────

  it('never exceeds the requested concurrency ceiling', async () => {
    const concurrency = 3;
    let inFlight = 0;
    let maxObserved = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);

    await parallelBatch(
      items,
      async (x) => {
        inFlight++;
        maxObserved = Math.max(maxObserved, inFlight);
        // Simulate async work with a real microtask yield
        await Promise.resolve();
        inFlight--;
        return x;
      },
      { concurrency }
    );

    expect(maxObserved).toBeLessThanOrEqual(concurrency);
  });

  // ── onProgress callback ────────────────────────────────────────────────────

  it('calls onProgress once per item with 1-based completed count and correct index', async () => {
    const progressCalls: Array<{ completed: number; total: number; index: number }> = [];

    const items = ['a', 'b', 'c'];
    await parallelBatch(items, async (x) => x, {
      concurrency: 1,
      onProgress: (completed, total, index) => {
        progressCalls.push({ completed, total, index });
      },
    });

    expect(progressCalls).toHaveLength(3);

    // With concurrency 1 completions are deterministic: index 0, 1, 2
    expect(progressCalls[0]).toEqual({ completed: 1, total: 3, index: 0 });
    expect(progressCalls[1]).toEqual({ completed: 2, total: 3, index: 1 });
    expect(progressCalls[2]).toEqual({ completed: 3, total: 3, index: 2 });
  });

  it('calls onProgress even when a worker rejects', async () => {
    const onProgress = vi.fn();

    await parallelBatch(
      [1, 2],
      async (x) => {
        if (x === 1) throw new Error('fail');
        return x;
      },
      { onProgress }
    );

    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('onProgress completed count reaches total (equals items.length) on the last call', async () => {
    const totals: number[] = [];
    const completeds: number[] = [];

    const items = Array.from({ length: 7 }, (_, i) => i);
    await parallelBatch(items, async (x) => x, {
      concurrency: 3,
      onProgress: (completed, total) => {
        completeds.push(completed);
        totals.push(total);
      },
    });

    expect(totals.every((t) => t === 7)).toBe(true);
    expect(Math.max(...completeds)).toBe(7);
  });

  // ── AbortSignal ────────────────────────────────────────────────────────────

  it('stops starting new items after the signal is aborted', async () => {
    const controller = new AbortController();
    const started: number[] = [];

    // Items 0 and 1 will start (concurrency = 2).
    // We abort midway so items beyond those already in-flight are skipped.
    const items = Array.from({ length: 10 }, (_, i) => i);

    const batchPromise = parallelBatch(
      items,
      async (x) => {
        started.push(x);
        // Abort after the first item starts to prevent the rest from launching
        if (x === 0) controller.abort();
        await makeDelayedWorker<number>(5)(x);
        return x;
      },
      { concurrency: 1, signal: controller.signal }
    );

    await batchPromise;

    // Only item 0 should have started (concurrency 1, aborted immediately)
    expect(started).toEqual([0]);
  });

  it('in-flight items complete normally even after abort', async () => {
    const controller = new AbortController();
    const d0 = deferred<string>();
    const d1 = deferred<string>();

    const batchPromise = parallelBatch(['a', 'b'], (x) => (x === 'a' ? d0.promise : d1.promise), {
      concurrency: 2,
      signal: controller.signal,
    });

    // Both items are now in-flight — abort the signal
    controller.abort();

    // Resolve both in-flight items
    d0.resolve('done-a');
    d1.resolve('done-b');

    const results = await batchPromise;
    // In-flight work completed — both results should be fulfilled
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
  });

  // ── Worker receives correct index argument ─────────────────────────────────

  it('passes the correct zero-based index to the worker function', async () => {
    const receivedIndices: number[] = [];

    await parallelBatch(
      ['x', 'y', 'z'],
      async (item, index) => {
        receivedIndices.push(index);
        return item;
      },
      { concurrency: 1 }
    );

    expect(receivedIndices).toEqual([0, 1, 2]);
  });

  // ── Single item ────────────────────────────────────────────────────────────

  it('handles a single-item batch correctly', async () => {
    const results = await parallelBatch(['only'], async (x) => x.toUpperCase());
    expect(results).toHaveLength(1);
    expect((results[0] as BatchFulfilled<string>).value).toBe('ONLY');
    expect(results[0].index).toBe(0);
  });
});
