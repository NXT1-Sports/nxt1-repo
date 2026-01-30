/**
 * @fileoverview Performance Trace Utilities
 * @module @nxt1/core/performance
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Utility functions and helpers for performance tracing.
 * Includes trace decorators, timing utilities, and measurement helpers.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { PerformanceAdapter } from './performance-adapter';
import type { ActiveTrace, TraceMetrics, TraceAttributes } from './performance.types';

// ============================================
// TIMING UTILITIES
// ============================================

/**
 * High-resolution timer for accurate measurements
 */
export interface Timer {
  /** Start time (ms) */
  readonly startTime: number;
  /** Get elapsed time in milliseconds */
  elapsed(): number;
  /** Get elapsed time and reset timer */
  lap(): number;
}

/**
 * Create a high-resolution timer
 */
export function createTimer(): Timer {
  let start = Date.now();

  return {
    get startTime() {
      return start;
    },
    elapsed() {
      return Date.now() - start;
    },
    lap() {
      const elapsed = Date.now() - start;
      start = Date.now();
      return elapsed;
    },
  };
}

// ============================================
// TRACE BUILDER
// ============================================

/**
 * Fluent builder for creating traces with complex configurations
 */
export class TraceBuilder<T> {
  private _metrics: TraceMetrics = {};
  private _attributes: TraceAttributes = {};
  private _onSuccess?: (result: T, trace: ActiveTrace) => Promise<void>;
  private _onError?: (error: Error, trace: ActiveTrace) => Promise<void>;

  constructor(
    private readonly adapter: PerformanceAdapter,
    private readonly traceName: string,
    private readonly fn: () => Promise<T>
  ) {}

  /**
   * Add initial metric
   */
  metric(name: string, value: number): this {
    this._metrics[name] = value;
    return this;
  }

  /**
   * Add multiple initial metrics
   */
  metrics(metrics: TraceMetrics): this {
    this._metrics = { ...this._metrics, ...metrics };
    return this;
  }

  /**
   * Add initial attribute
   */
  attribute(name: string, value: string): this {
    this._attributes[name] = value;
    return this;
  }

  /**
   * Add multiple initial attributes
   */
  attributes(attributes: TraceAttributes): this {
    this._attributes = { ...this._attributes, ...attributes };
    return this;
  }

  /**
   * Set success callback
   */
  onSuccess(callback: (result: T, trace: ActiveTrace) => Promise<void>): this {
    this._onSuccess = callback;
    return this;
  }

  /**
   * Set error callback
   */
  onError(callback: (error: Error, trace: ActiveTrace) => Promise<void>): this {
    this._onError = callback;
    return this;
  }

  /**
   * Execute the traced function
   */
  async execute(): Promise<T> {
    return this.adapter.trace(this.traceName, this.fn, {
      metrics: this._metrics,
      attributes: this._attributes,
      onSuccess: this._onSuccess,
      onError: this._onError,
    });
  }
}

/**
 * Create a trace builder for fluent API
 *
 * @example
 * ```typescript
 * const result = await traceBuilder(performance, 'load_feed', async () => {
 *   return await api.getFeed();
 * })
 *   .attribute('screen', 'home')
 *   .attribute('user_tier', 'premium')
 *   .onSuccess(async (result, trace) => {
 *     await trace.putMetric('items', result.length);
 *   })
 *   .execute();
 * ```
 */
export function traceBuilder<T>(
  adapter: PerformanceAdapter,
  traceName: string,
  fn: () => Promise<T>
): TraceBuilder<T> {
  return new TraceBuilder(adapter, traceName, fn);
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Result of a traced batch operation
 */
export interface BatchTraceResult<T> {
  results: (T | Error)[];
  successCount: number;
  errorCount: number;
  totalDuration: number;
}

/**
 * Execute multiple operations with a single parent trace
 *
 * @example
 * ```typescript
 * const { results, successCount, errorCount } = await traceBatch(
 *   performance,
 *   'batch_upload',
 *   files.map(file => () => uploadFile(file))
 * );
 * ```
 */
export async function traceBatch<T>(
  adapter: PerformanceAdapter,
  traceName: string,
  operations: Array<() => Promise<T>>
): Promise<BatchTraceResult<T>> {
  const trace = await adapter.startTrace(traceName);
  const timer = createTimer();
  const results: (T | Error)[] = [];
  let successCount = 0;
  let errorCount = 0;

  await trace.putMetric('operation_count', operations.length);

  try {
    for (let i = 0; i < operations.length; i++) {
      try {
        const result = await operations[i]();
        results.push(result);
        successCount++;
      } catch (error) {
        results.push(error as Error);
        errorCount++;
      }
    }

    await trace.putMetric('success_count', successCount);
    await trace.putMetric('error_count', errorCount);
    await trace.putAttribute('batch_status', errorCount === 0 ? 'success' : 'partial');

    return {
      results,
      successCount,
      errorCount,
      totalDuration: timer.elapsed(),
    };
  } finally {
    await trace.stop();
  }
}

/**
 * Execute operations in parallel with tracing
 */
export async function traceParallel<T>(
  adapter: PerformanceAdapter,
  traceName: string,
  operations: Array<() => Promise<T>>
): Promise<BatchTraceResult<T>> {
  const trace = await adapter.startTrace(traceName);
  const timer = createTimer();

  await trace.putMetric('operation_count', operations.length);

  try {
    const settledResults = await Promise.allSettled(operations.map((op) => op()));

    const results: (T | Error)[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        successCount++;
      } else {
        results.push(result.reason as Error);
        errorCount++;
      }
    }

    await trace.putMetric('success_count', successCount);
    await trace.putMetric('error_count', errorCount);
    await trace.putAttribute('batch_status', errorCount === 0 ? 'success' : 'partial');

    return {
      results,
      successCount,
      errorCount,
      totalDuration: timer.elapsed(),
    };
  } finally {
    await trace.stop();
  }
}

// ============================================
// RETRY WITH TRACING
// ============================================

/**
 * Configuration for traced retry
 */
export interface TracedRetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay between retries in ms (default: 1000) */
  baseDelay?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelay?: number;
  /** Determine if error is retryable (default: all errors) */
  isRetryable?: (error: Error) => boolean;
}

const defaultRetryConfig: Required<TracedRetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000,
  exponentialBackoff: true,
  maxDelay: 10000,
  isRetryable: () => true,
};

/**
 * Execute an operation with automatic retries and tracing
 *
 * @example
 * ```typescript
 * const result = await traceWithRetry(
 *   performance,
 *   'api_call',
 *   async () => api.getData(),
 *   {
 *     maxRetries: 3,
 *     isRetryable: (err) => err.status === 429 || err.status >= 500,
 *   }
 * );
 * ```
 */
export async function traceWithRetry<T>(
  adapter: PerformanceAdapter,
  traceName: string,
  operation: () => Promise<T>,
  config?: TracedRetryConfig
): Promise<T> {
  const opts = { ...defaultRetryConfig, ...config };
  const trace = await adapter.startTrace(traceName);
  let lastError: Error | null = null;
  let attempt = 0;

  try {
    while (attempt <= opts.maxRetries) {
      try {
        const result = await operation();
        await trace.putMetric('retry_count', attempt);
        await trace.putAttribute('success', 'true');
        return result;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        await trace.incrementMetric('error_count');

        // Check if we should retry
        if (attempt > opts.maxRetries || !opts.isRetryable(lastError)) {
          break;
        }

        // Calculate delay
        let delay = opts.baseDelay;
        if (opts.exponentialBackoff) {
          delay = Math.min(opts.baseDelay * Math.pow(2, attempt - 1), opts.maxDelay);
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    await trace.putMetric('retry_count', attempt);
    await trace.putAttribute('success', 'false');
    await trace.putAttribute('error_type', lastError?.name || 'Error');
    throw lastError;
  } finally {
    await trace.stop();
  }
}

// ============================================
// METRIC AGGREGATION
// ============================================

/**
 * Aggregated metrics from multiple traces
 */
export interface AggregatedMetrics {
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Aggregate duration metrics from recorded traces
 * Use with MemoryPerformanceAdapter for local profiling
 */
export function aggregateMetrics(durations: number[]): AggregatedMetrics {
  if (durations.length === 0) {
    return {
      count: 0,
      totalDuration: 0,
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      p50Duration: 0,
      p95Duration: 0,
      p99Duration: 0,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const total = sorted.reduce((sum, d) => sum + d, 0);

  return {
    count: sorted.length,
    totalDuration: total,
    avgDuration: total / sorted.length,
    minDuration: sorted[0],
    maxDuration: sorted[sorted.length - 1],
    p50Duration: percentile(sorted, 50),
    p95Duration: percentile(sorted, 95),
    p99Duration: percentile(sorted, 99),
  };
}
