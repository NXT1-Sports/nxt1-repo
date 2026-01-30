/**
 * @fileoverview Performance Monitoring Adapter Interface
 * @module @nxt1/core/performance
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Defines the common interface for performance monitoring across all platforms.
 * Implementations:
 * - Mobile (iOS/Android): @capacitor-firebase/performance
 * - Web: firebase/performance via @angular/fire
 * - SSR/Test: No-op or memory adapter
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type {
  PerformanceConfig,
  ActiveTrace,
  ActiveHttpMetric,
  ScreenTrace,
  TraceConfig,
  HttpMethod,
  HttpMetricData,
  TraceMetrics,
  TraceAttributes,
  TraceState,
} from './performance.types';

import { DEFAULT_PERFORMANCE_CONFIG } from './performance.types';

// ============================================
// ADAPTER INTERFACE
// ============================================

/**
 * Performance Monitoring Adapter Interface
 *
 * Implement this interface for platform-specific performance monitoring.
 * All methods are async to support both synchronous and asynchronous
 * implementations.
 *
 * @example
 * ```typescript
 * // Mobile implementation
 * import { PerformanceAdapter } from '@nxt1/core/performance';
 * import { FirebasePerformance } from '@capacitor-firebase/performance';
 *
 * @Injectable({ providedIn: 'root' })
 * export class PerformanceService implements PerformanceAdapter {
 *   async startTrace(name: string) {
 *     await FirebasePerformance.startTrace({ traceName: name });
 *     // ... return ActiveTrace handle
 *   }
 * }
 * ```
 */
export interface PerformanceAdapter {
  // ==========================================
  // LIFECYCLE
  // ==========================================

  /**
   * Initialize performance monitoring.
   * Call early in app bootstrap.
   */
  initialize(config?: PerformanceConfig): Promise<void>;

  /**
   * Check if performance monitoring is enabled
   */
  isEnabled(): boolean;

  /**
   * Enable/disable performance monitoring at runtime
   */
  setEnabled(enabled: boolean): Promise<void>;

  // ==========================================
  // CUSTOM TRACES
  // ==========================================

  /**
   * Start a custom code trace.
   * Use for measuring specific operations like data loading, processing, etc.
   *
   * @param name - Unique trace name (max 100 chars, alphanumeric + underscore)
   * @returns Active trace handle to stop and add metrics/attributes
   *
   * @example
   * ```typescript
   * const trace = await performance.startTrace('feed_load');
   * try {
   *   const data = await api.getFeed();
   *   await trace.putMetric('items_loaded', data.length);
   *   await trace.putAttribute('cache_status', 'miss');
   * } finally {
   *   await trace.stop();
   * }
   * ```
   */
  startTrace(name: string): Promise<ActiveTrace>;

  /**
   * Start a custom trace with configuration
   */
  startTraceWithConfig(config: TraceConfig): Promise<ActiveTrace>;

  /**
   * Stop a trace by name (if using name-based tracking)
   */
  stopTrace(name: string): Promise<void>;

  // ==========================================
  // HTTP METRICS (Manual tracking)
  // ==========================================

  /**
   * Start tracking an HTTP request manually.
   * Use when automatic network monitoring doesn't capture the request
   * or when you need custom attributes.
   *
   * @param url - Request URL
   * @param httpMethod - HTTP method
   * @returns Active HTTP metric handle
   *
   * @example
   * ```typescript
   * const metric = await performance.startHttpMetric(url, 'POST');
   * try {
   *   const response = await fetch(url, { method: 'POST', body });
   *   await metric.setHttpResponseCode(response.status);
   *   await metric.setResponsePayloadSize(response.headers.get('content-length'));
   * } finally {
   *   await metric.stop();
   * }
   * ```
   */
  startHttpMetric(url: string, httpMethod: HttpMethod): Promise<ActiveHttpMetric>;

  // ==========================================
  // SCREEN TRACES (Native only)
  // ==========================================

  /**
   * Start a screen trace for measuring screen rendering performance.
   * On web, this is a no-op (browser handles this via Web Vitals).
   *
   * @param screenName - Screen/route name
   * @returns Screen trace handle
   */
  startScreenTrace(screenName: string): Promise<ScreenTrace>;

  // ==========================================
  // GLOBAL ATTRIBUTES
  // ==========================================

  /**
   * Set a global attribute that will be attached to all traces.
   * Use for user context, app version, etc.
   *
   * @param name - Attribute name (max 40 chars)
   * @param value - Attribute value (max 100 chars)
   */
  setGlobalAttribute(name: string, value: string): Promise<void>;

  /**
   * Remove a global attribute
   */
  removeGlobalAttribute(name: string): Promise<void>;

  /**
   * Get all global attributes
   */
  getGlobalAttributes(): TraceAttributes;

  // ==========================================
  // UTILITIES
  // ==========================================

  /**
   * Wrap an async function with performance tracing.
   * Automatically starts/stops trace and handles errors.
   *
   * @param traceName - Name for the trace
   * @param fn - Async function to execute
   * @param options - Optional metrics/attributes to add
   * @returns Result of the function
   *
   * @example
   * ```typescript
   * const data = await performance.trace('fetch_users', async () => {
   *   return await api.getUsers();
   * });
   * ```
   */
  trace<T>(
    traceName: string,
    fn: () => Promise<T>,
    options?: {
      metrics?: TraceMetrics;
      attributes?: TraceAttributes;
      onSuccess?: (result: T, trace: ActiveTrace) => Promise<void>;
      onError?: (error: Error, trace: ActiveTrace) => Promise<void>;
    }
  ): Promise<T>;
}

// ============================================
// MEMORY ADAPTER (For Testing)
// ============================================

/**
 * In-memory trace for testing
 */
class MemoryTrace implements ActiveTrace {
  readonly startTime: number;
  private _state: TraceState = 'running';
  private _metrics: TraceMetrics = {};
  private _attributes: TraceAttributes = {};

  constructor(
    readonly name: string,
    private readonly adapter: MemoryPerformanceAdapter
  ) {
    this.startTime = Date.now();
  }

  get state(): TraceState {
    return this._state;
  }

  async stop(): Promise<void> {
    if (this._state === 'stopped') return;
    this._state = 'stopped';
    this.adapter._recordTrace(
      this.name,
      Date.now() - this.startTime,
      this._metrics,
      this._attributes
    );
  }

  async putMetric(name: string, value: number): Promise<void> {
    this._metrics[name] = value;
  }

  async incrementMetric(name: string, delta = 1): Promise<void> {
    this._metrics[name] = (this._metrics[name] ?? 0) + delta;
  }

  async putAttribute(name: string, value: string): Promise<void> {
    this._attributes[name] = value;
  }

  async removeAttribute(name: string): Promise<void> {
    delete this._attributes[name];
  }

  getAttribute(name: string): string | undefined {
    return this._attributes[name];
  }

  getAttributes(): TraceAttributes {
    return { ...this._attributes };
  }
}

/**
 * In-memory HTTP metric for testing
 */
class MemoryHttpMetric implements ActiveHttpMetric {
  readonly startTime: number;
  private _responseCode?: number;
  private _requestSize?: number;
  private _responseSize?: number;
  private _contentType?: string;
  private _attributes: TraceAttributes = {};

  constructor(
    readonly url: string,
    readonly method: HttpMethod,
    private readonly adapter: MemoryPerformanceAdapter
  ) {
    this.startTime = Date.now();
  }

  async setHttpResponseCode(code: number): Promise<void> {
    this._responseCode = code;
  }

  async setRequestPayloadSize(bytes: number): Promise<void> {
    this._requestSize = bytes;
  }

  async setResponsePayloadSize(bytes: number): Promise<void> {
    this._responseSize = bytes;
  }

  async setResponseContentType(contentType: string): Promise<void> {
    this._contentType = contentType;
  }

  async putAttribute(name: string, value: string): Promise<void> {
    this._attributes[name] = value;
  }

  async stop(): Promise<void> {
    this.adapter._recordHttpMetric({
      url: this.url,
      httpMethod: this.method,
      httpResponseCode: this._responseCode,
      requestPayloadSize: this._requestSize,
      responsePayloadSize: this._responseSize,
      responseContentType: this._contentType,
      attributes: this._attributes,
    });
  }
}

/**
 * In-memory screen trace for testing
 */
class MemoryScreenTrace implements ScreenTrace {
  readonly startTime: number;

  constructor(
    readonly screenName: string,
    private readonly adapter: MemoryPerformanceAdapter
  ) {
    this.startTime = Date.now();
  }

  async stop(): Promise<void> {
    this.adapter._recordScreenTrace(this.screenName, Date.now() - this.startTime);
  }
}

/**
 * Recorded trace data for assertions in tests
 */
export interface RecordedTrace {
  name: string;
  duration: number;
  metrics: TraceMetrics;
  attributes: TraceAttributes;
  timestamp: number;
}

/**
 * Recorded HTTP metric for assertions in tests
 */
export interface RecordedHttpMetric extends HttpMetricData {
  duration: number;
  timestamp: number;
}

/**
 * Recorded screen trace for assertions in tests
 */
export interface RecordedScreenTrace {
  screenName: string;
  duration: number;
  timestamp: number;
}

/**
 * Memory-based Performance Adapter for Testing
 *
 * Records all traces in memory for assertions.
 *
 * @example
 * ```typescript
 * const adapter = createMemoryPerformanceAdapter();
 * const trace = await adapter.startTrace('test_trace');
 * await trace.putMetric('count', 5);
 * await trace.stop();
 *
 * expect(adapter.traces[0].name).toBe('test_trace');
 * expect(adapter.traces[0].metrics.count).toBe(5);
 * ```
 */
export class MemoryPerformanceAdapter implements PerformanceAdapter {
  private _config: Required<PerformanceConfig> = { ...DEFAULT_PERFORMANCE_CONFIG };
  private _enabled = true;
  private _globalAttributes: TraceAttributes = {};

  // Recorded data for assertions
  readonly traces: RecordedTrace[] = [];
  readonly httpMetrics: RecordedHttpMetric[] = [];
  readonly screenTraces: RecordedScreenTrace[] = [];

  async initialize(config?: PerformanceConfig): Promise<void> {
    this._config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };
    this._enabled = this._config.enabled;
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this._enabled = enabled;
  }

  async startTrace(name: string): Promise<ActiveTrace> {
    return new MemoryTrace(name, this);
  }

  async startTraceWithConfig(config: TraceConfig): Promise<ActiveTrace> {
    const trace = new MemoryTrace(config.name, this);
    if (config.metrics) {
      for (const [key, value] of Object.entries(config.metrics)) {
        await trace.putMetric(key, value);
      }
    }
    if (config.attributes) {
      for (const [key, value] of Object.entries(config.attributes)) {
        await trace.putAttribute(key, value);
      }
    }
    return trace;
  }

  async stopTrace(_name: string): Promise<void> {
    // Memory adapter doesn't track by name
  }

  async startHttpMetric(url: string, httpMethod: HttpMethod): Promise<ActiveHttpMetric> {
    return new MemoryHttpMetric(url, httpMethod, this);
  }

  async startScreenTrace(screenName: string): Promise<ScreenTrace> {
    return new MemoryScreenTrace(screenName, this);
  }

  async setGlobalAttribute(name: string, value: string): Promise<void> {
    this._globalAttributes[name] = value;
  }

  async removeGlobalAttribute(name: string): Promise<void> {
    delete this._globalAttributes[name];
  }

  getGlobalAttributes(): TraceAttributes {
    return { ...this._globalAttributes };
  }

  async trace<T>(
    traceName: string,
    fn: () => Promise<T>,
    options?: {
      metrics?: TraceMetrics;
      attributes?: TraceAttributes;
      onSuccess?: (result: T, trace: ActiveTrace) => Promise<void>;
      onError?: (error: Error, trace: ActiveTrace) => Promise<void>;
    }
  ): Promise<T> {
    const trace = await this.startTrace(traceName);

    // Apply initial metrics/attributes
    if (options?.metrics) {
      for (const [key, value] of Object.entries(options.metrics)) {
        await trace.putMetric(key, value);
      }
    }
    if (options?.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        await trace.putAttribute(key, value);
      }
    }

    try {
      const result = await fn();
      if (options?.onSuccess) {
        await options.onSuccess(result, trace);
      }
      return result;
    } catch (error) {
      if (options?.onError) {
        await options.onError(error as Error, trace);
      }
      throw error;
    } finally {
      await trace.stop();
    }
  }

  // Internal methods for recording
  /** @internal */
  _recordTrace(
    name: string,
    duration: number,
    metrics: TraceMetrics,
    attributes: TraceAttributes
  ): void {
    this.traces.push({
      name,
      duration,
      metrics: { ...metrics },
      attributes: { ...attributes, ...this._globalAttributes },
      timestamp: Date.now(),
    });
  }

  /** @internal */
  _recordHttpMetric(data: HttpMetricData): void {
    this.httpMetrics.push({
      ...data,
      duration: Date.now(),
      timestamp: Date.now(),
    });
  }

  /** @internal */
  _recordScreenTrace(screenName: string, duration: number): void {
    this.screenTraces.push({
      screenName,
      duration,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all recorded data (for test reset)
   */
  clear(): void {
    this.traces.length = 0;
    this.httpMetrics.length = 0;
    this.screenTraces.length = 0;
    this._globalAttributes = {};
  }
}

// ============================================
// NO-OP ADAPTER (For SSR)
// ============================================

/**
 * No-op trace that does nothing
 */
const noOpTrace: ActiveTrace = {
  name: '',
  state: 'stopped',
  startTime: 0,
  stop: async () => {
    /* no-op for SSR */
  },
  putMetric: async () => {
    /* no-op for SSR */
  },
  incrementMetric: async () => {
    /* no-op for SSR */
  },
  putAttribute: async () => {
    /* no-op for SSR */
  },
  removeAttribute: async () => {
    /* no-op for SSR */
  },
  getAttribute: () => undefined,
  getAttributes: () => ({}),
};

/**
 * No-op HTTP metric that does nothing
 */
const noOpHttpMetric: ActiveHttpMetric = {
  url: '',
  method: 'GET',
  startTime: 0,
  setHttpResponseCode: async () => {
    /* no-op for SSR */
  },
  setRequestPayloadSize: async () => {
    /* no-op for SSR */
  },
  setResponsePayloadSize: async () => {
    /* no-op for SSR */
  },
  setResponseContentType: async () => {
    /* no-op for SSR */
  },
  putAttribute: async () => {
    /* no-op for SSR */
  },
  stop: async () => {
    /* no-op for SSR */
  },
};

/**
 * No-op screen trace that does nothing
 */
const noOpScreenTrace: ScreenTrace = {
  screenName: '',
  startTime: 0,
  stop: async () => {
    /* no-op for SSR */
  },
};

/**
 * No-op Performance Adapter
 *
 * Use on SSR or when performance monitoring is disabled.
 * All methods are no-ops that resolve immediately.
 */
export class NoOpPerformanceAdapter implements PerformanceAdapter {
  private _enabled = false;
  private _globalAttributes: TraceAttributes = {};

  async initialize(_config?: PerformanceConfig): Promise<void> {
    // No-op for SSR - nothing to initialize
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this._enabled = enabled;
  }

  async startTrace(_name: string): Promise<ActiveTrace> {
    return noOpTrace;
  }

  async startTraceWithConfig(_config: TraceConfig): Promise<ActiveTrace> {
    return noOpTrace;
  }

  async stopTrace(_name: string): Promise<void> {
    // No-op for SSR - nothing to stop
  }

  async startHttpMetric(_url: string, _httpMethod: HttpMethod): Promise<ActiveHttpMetric> {
    return noOpHttpMetric;
  }

  async startScreenTrace(_screenName: string): Promise<ScreenTrace> {
    return noOpScreenTrace;
  }

  async setGlobalAttribute(name: string, value: string): Promise<void> {
    this._globalAttributes[name] = value;
  }

  async removeGlobalAttribute(name: string): Promise<void> {
    delete this._globalAttributes[name];
  }

  getGlobalAttributes(): TraceAttributes {
    return { ...this._globalAttributes };
  }

  async trace<T>(
    _traceName: string,
    fn: () => Promise<T>,
    _options?: {
      metrics?: TraceMetrics;
      attributes?: TraceAttributes;
      onSuccess?: (result: T, trace: ActiveTrace) => Promise<void>;
      onError?: (error: Error, trace: ActiveTrace) => Promise<void>;
    }
  ): Promise<T> {
    return fn();
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a no-op performance adapter for SSR or disabled monitoring
 */
export function createNoOpPerformanceAdapter(): PerformanceAdapter {
  return new NoOpPerformanceAdapter();
}

/**
 * Create a memory-based performance adapter for testing
 */
export function createMemoryPerformanceAdapter(): MemoryPerformanceAdapter {
  return new MemoryPerformanceAdapter();
}
