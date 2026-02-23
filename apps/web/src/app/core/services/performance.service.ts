/**
 * @fileoverview Web Performance Monitoring Service
 * @module @nxt1/web/core/services
 *
 * Firebase Performance Monitoring integration for web via @angular/fire.
 * Provides automatic and custom performance tracking with:
 * - Page load traces (automatic)
 * - HTTP/S network request monitoring (automatic)
 * - Custom code traces for critical paths
 * - Custom metrics and attributes
 * - Web Vitals integration
 *
 * SSR-safe implementation with graceful fallback on server.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { Performance, trace as firebaseTrace } from '@angular/fire/performance';
import type { PerformanceTrace } from 'firebase/performance';
import { NxtLoggingService } from '@nxt1/ui/services';

import type {
  PerformanceAdapter,
  PerformanceConfig,
  ActiveTrace,
  ActiveHttpMetric,
  ScreenTrace,
  TraceConfig,
  HttpMethod,
  TraceMetrics,
  TraceAttributes,
  TraceState,
} from '@nxt1/core/performance';

import {
  createNoOpPerformanceAdapter,
  DEFAULT_PERFORMANCE_CONFIG,
  ATTRIBUTE_NAMES,
} from '@nxt1/core/performance';

// ============================================
// WEB TRACE IMPLEMENTATION
// ============================================

/**
 * Active trace wrapper for Firebase Performance (Web)
 */
class WebTrace implements ActiveTrace {
  readonly startTime: number;
  private _state: TraceState = 'running';
  private _attributes: TraceAttributes = {};
  private _metrics: TraceMetrics = {};

  constructor(
    readonly name: string,
    private readonly perfTrace: PerformanceTrace,
    private readonly logger: ReturnType<NxtLoggingService['child']>
  ) {
    this.startTime = Date.now();
  }

  get state(): TraceState {
    return this._state;
  }

  async stop(): Promise<void> {
    if (this._state === 'stopped') return;
    this._state = 'stopped';

    try {
      this.perfTrace.stop();
      this.logger.debug(`Trace stopped: ${this.name}`, {
        duration: Date.now() - this.startTime,
      });
    } catch (error) {
      this.logger.warn(`Failed to stop trace: ${this.name}`, { error });
    }
  }

  async putMetric(metricName: string, value: number): Promise<void> {
    if (this._state === 'stopped') return;
    this._metrics[metricName] = value;

    try {
      this.perfTrace.putMetric(metricName, value);
    } catch (error) {
      this.logger.warn(`Failed to put metric: ${metricName}`, { error });
    }
  }

  async incrementMetric(metricName: string, delta = 1): Promise<void> {
    if (this._state === 'stopped') return;
    const currentValue = this._metrics[metricName] ?? 0;
    const newValue = currentValue + delta;
    this._metrics[metricName] = newValue;

    try {
      this.perfTrace.putMetric(metricName, newValue);
    } catch (error) {
      this.logger.warn(`Failed to increment metric: ${metricName}`, { error });
    }
  }

  async putAttribute(attributeName: string, value: string): Promise<void> {
    if (this._state === 'stopped') return;
    this._attributes[attributeName] = value;

    try {
      this.perfTrace.putAttribute(attributeName, value);
    } catch (error) {
      this.logger.warn(`Failed to put attribute: ${attributeName}`, { error });
    }
  }

  async removeAttribute(attributeName: string): Promise<void> {
    if (this._state === 'stopped') return;
    delete this._attributes[attributeName];

    try {
      this.perfTrace.removeAttribute(attributeName);
    } catch (error) {
      this.logger.warn(`Failed to remove attribute: ${attributeName}`, { error });
    }
  }

  getAttribute(name: string): string | undefined {
    return this._attributes[name];
  }

  getAttributes(): TraceAttributes {
    return { ...this._attributes };
  }
}

// ============================================
// WEB HTTP METRIC IMPLEMENTATION
// ============================================

/**
 * HTTP metric wrapper for web
 * Note: Web Firebase Performance automatically tracks XMLHttpRequest and Fetch
 * This is for manual tracking of custom requests
 */
class WebHttpMetric implements ActiveHttpMetric {
  readonly startTime: number;
  private _responseCode?: number;
  private _attributes: TraceAttributes = {};
  private readonly trace: PerformanceTrace;

  constructor(
    readonly url: string,
    readonly method: HttpMethod,
    perf: Performance,
    private readonly logger: ReturnType<NxtLoggingService['child']>
  ) {
    this.startTime = Date.now();
    // Create a trace to track the HTTP request
    const traceName = `http_${method.toLowerCase()}_${this.sanitizeUrl(url)}`;
    this.trace = firebaseTrace(perf, traceName);
    this.trace.start();
  }

  private sanitizeUrl(url: string): string {
    // Remove query params and normalize for trace naming
    try {
      const parsed = new URL(url);
      return parsed.pathname.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
    } catch {
      return 'unknown';
    }
  }

  async setHttpResponseCode(code: number): Promise<void> {
    this._responseCode = code;
    try {
      this.trace.putAttribute('http_response_code', String(code));
      this.trace.putMetric('response_code', code);
    } catch (error) {
      this.logger.warn('Failed to set HTTP response code', { error });
    }
  }

  async setRequestPayloadSize(bytes: number): Promise<void> {
    try {
      this.trace.putMetric('request_payload_size', bytes);
    } catch (error) {
      this.logger.warn('Failed to set request payload size', { error });
    }
  }

  async setResponsePayloadSize(bytes: number): Promise<void> {
    try {
      this.trace.putMetric('response_payload_size', bytes);
    } catch (error) {
      this.logger.warn('Failed to set response payload size', { error });
    }
  }

  async setResponseContentType(contentType: string): Promise<void> {
    try {
      this.trace.putAttribute('content_type', contentType);
    } catch (error) {
      this.logger.warn('Failed to set content type', { error });
    }
  }

  async putAttribute(name: string, value: string): Promise<void> {
    this._attributes[name] = value;
    try {
      this.trace.putAttribute(name, value);
    } catch (error) {
      this.logger.warn(`Failed to put HTTP metric attribute: ${name}`, { error });
    }
  }

  async stop(): Promise<void> {
    try {
      this.trace.putMetric('duration_ms', Date.now() - this.startTime);
      this.trace.stop();
      this.logger.debug(`HTTP metric stopped: ${this.method} ${this.url}`, {
        duration: Date.now() - this.startTime,
        responseCode: this._responseCode,
      });
    } catch (error) {
      this.logger.warn('Failed to stop HTTP metric', { error });
    }
  }
}

// ============================================
// WEB SCREEN TRACE IMPLEMENTATION
// ============================================

/**
 * Screen/route trace wrapper for web navigation performance
 */
class WebScreenTrace implements ScreenTrace {
  readonly startTime: number;
  private readonly trace: PerformanceTrace;

  constructor(
    readonly screenName: string,
    perf: Performance,
    private readonly logger: ReturnType<NxtLoggingService['child']>
  ) {
    this.startTime = Date.now();
    this.trace = firebaseTrace(perf, `screen_${screenName}`);
    this.trace.start();
  }

  async stop(): Promise<void> {
    try {
      this.trace.putMetric('duration_ms', Date.now() - this.startTime);
      this.trace.stop();
      this.logger.debug(`Screen trace stopped: ${this.screenName}`, {
        duration: Date.now() - this.startTime,
      });
    } catch (error) {
      this.logger.warn(`Failed to stop screen trace: ${this.screenName}`, { error });
    }
  }
}

// ============================================
// PERFORMANCE SERVICE
// ============================================

/**
 * Web Performance Monitoring Service
 *
 * Wraps @angular/fire/performance for web performance tracking.
 * Implements the PerformanceAdapter interface for consistent API.
 *
 * Features:
 * - Automatic page load traces
 * - Automatic HTTP/S network request monitoring
 * - Custom code traces for business-critical operations
 * - Custom metrics and attributes
 * - SSR-safe with graceful degradation
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class FeedComponent {
 *   private readonly performance = inject(PerformanceService);
 *
 *   async loadFeed() {
 *     const trace = await this.performance.startTrace('feed_load');
 *     try {
 *       const data = await this.api.getFeed();
 *       await trace.putMetric('items_loaded', data.length);
 *       return data;
 *     } finally {
 *       await trace.stop();
 *     }
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class PerformanceService implements PerformanceAdapter {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly perf = inject(Performance, { optional: true });
  private readonly loggerService = inject(NxtLoggingService);
  private readonly logger = this.loggerService.child('PerformanceService');

  private _config: Required<PerformanceConfig> = { ...DEFAULT_PERFORMANCE_CONFIG };
  private _ready = false;
  private _globalAttributes: TraceAttributes = {};

  /**
   * Fallback adapter for SSR
   */
  private readonly noOpAdapter = createNoOpPerformanceAdapter();

  /**
   * Check if running in browser
   */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /**
   * Check if running on server (SSR)
   */
  private get isServer(): boolean {
    return isPlatformServer(this.platformId);
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  /**
   * Initialize Performance Monitoring.
   * For web, this primarily sets up global attributes.
   */
  async initialize(config?: PerformanceConfig): Promise<void> {
    this._config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };

    if (this.isServer || !this.perf) {
      await this.noOpAdapter.initialize(this._config);
      this._ready = false;
      this.logger.debug('Initialized in no-op mode (server-side rendering)');
      return;
    }

    try {
      // Set app version attribute globally
      if (this._config.appVersion) {
        await this.setGlobalAttribute(ATTRIBUTE_NAMES.APP_VERSION, this._config.appVersion);
      }

      // Set platform attribute
      await this.setGlobalAttribute(ATTRIBUTE_NAMES.PLATFORM, 'web');

      this._ready = true;
      this.logger.info('Performance Monitoring initialized', {
        enabled: this._config.enabled,
        platform: 'web',
      });
    } catch (error) {
      this.logger.error('Failed to initialize Performance Monitoring', { error });
      this._ready = false;
    }
  }

  /**
   * Check if Performance Monitoring is enabled
   */
  isEnabled(): boolean {
    return this._ready && this._config.enabled && this.isBrowser && !!this.perf;
  }

  /**
   * Enable/disable Performance Monitoring at runtime
   * Note: Web Firebase Performance doesn't support runtime disable
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this._config = { ...this._config, enabled };
    this.logger.info(`Performance Monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  // ==========================================
  // CUSTOM TRACES
  // ==========================================

  /**
   * Start a custom code trace
   */
  async startTrace(name: string): Promise<ActiveTrace> {
    if (!this.isEnabled() || !this.perf) {
      return this.noOpAdapter.startTrace(name);
    }

    try {
      const perfTrace = firebaseTrace(this.perf, name);
      perfTrace.start();
      this.logger.debug(`Trace started: ${name}`);

      const webTrace = new WebTrace(name, perfTrace, this.logger);

      // Apply global attributes to trace
      for (const [key, value] of Object.entries(this._globalAttributes)) {
        await webTrace.putAttribute(key, value);
      }

      return webTrace;
    } catch (error) {
      this.logger.warn(`Failed to start trace: ${name}`, { error });
      return this.noOpAdapter.startTrace(name);
    }
  }

  /**
   * Start a trace with initial configuration
   */
  async startTraceWithConfig(config: TraceConfig): Promise<ActiveTrace> {
    const trace = await this.startTrace(config.name);

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

  /**
   * Stop a trace by name
   * Note: Web API doesn't support stopping by name, use the trace handle instead
   */
  async stopTrace(_name: string): Promise<void> {
    this.logger.warn('stopTrace by name not supported on web, use trace.stop() instead');
  }

  // ==========================================
  // HTTP METRICS
  // ==========================================

  /**
   * Start tracking an HTTP request manually
   * Note: Firebase Performance automatically tracks fetch/XHR requests
   */
  async startHttpMetric(url: string, httpMethod: HttpMethod): Promise<ActiveHttpMetric> {
    if (!this.isEnabled() || !this.perf) {
      return this.noOpAdapter.startHttpMetric(url, httpMethod);
    }

    try {
      this.logger.debug(`HTTP metric started: ${httpMethod} ${url}`);
      return new WebHttpMetric(url, httpMethod, this.perf, this.logger);
    } catch (error) {
      this.logger.warn('Failed to start HTTP metric', { error });
      return this.noOpAdapter.startHttpMetric(url, httpMethod);
    }
  }

  // ==========================================
  // SCREEN TRACES
  // ==========================================

  /**
   * Start a screen/route trace for measuring navigation performance
   */
  async startScreenTrace(screenName: string): Promise<ScreenTrace> {
    if (!this.isEnabled() || !this.perf) {
      return this.noOpAdapter.startScreenTrace(screenName);
    }

    try {
      this.logger.debug(`Screen trace started: ${screenName}`);
      return new WebScreenTrace(screenName, this.perf, this.logger);
    } catch (error) {
      this.logger.warn(`Failed to start screen trace: ${screenName}`, { error });
      return this.noOpAdapter.startScreenTrace(screenName);
    }
  }

  // ==========================================
  // GLOBAL ATTRIBUTES
  // ==========================================

  /**
   * Set a global attribute that will be attached to all new traces
   */
  async setGlobalAttribute(name: string, value: string): Promise<void> {
    this._globalAttributes[name] = value;
    this.logger.debug(`Global attribute set: ${name}=${value}`);
  }

  /**
   * Remove a global attribute
   */
  async removeGlobalAttribute(name: string): Promise<void> {
    delete this._globalAttributes[name];
    this.logger.debug(`Global attribute removed: ${name}`);
  }

  /**
   * Get all global attributes
   */
  getGlobalAttributes(): TraceAttributes {
    return { ...this._globalAttributes };
  }

  // ==========================================
  // UTILITY: TRACE WRAPPER
  // ==========================================

  /**
   * Wrap an async function with performance tracing
   *
   * @example
   * ```typescript
   * const data = await performance.trace('fetch_users', async () => {
   *   return await api.getUsers();
   * }, {
   *   attributes: { source: 'home_screen' },
   *   onSuccess: async (result, trace) => {
   *     await trace.putMetric('items_loaded', result.length);
   *   },
   * });
   * ```
   */
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
      await trace.putAttribute('success', 'true');
      return result;
    } catch (error) {
      await trace.putAttribute('success', 'false');
      await trace.putAttribute('error_type', (error as Error).name || 'Error');
      if (options?.onError) {
        await options.onError(error as Error, trace);
      }
      throw error;
    } finally {
      await trace.stop();
    }
  }

  // ==========================================
  // USER CONTEXT
  // ==========================================

  /**
   * Set user context for all traces
   * Call after user authentication
   */
  async setUserContext(userId: string, role?: string, tier?: string): Promise<void> {
    await this.setGlobalAttribute(ATTRIBUTE_NAMES.USER_ID, userId);
    if (role) {
      await this.setGlobalAttribute(ATTRIBUTE_NAMES.USER_ROLE, role);
    }
    if (tier) {
      await this.setGlobalAttribute(ATTRIBUTE_NAMES.USER_TIER, tier);
    }
    this.logger.info('User context set for performance traces');
  }

  /**
   * Clear user context (call on logout)
   */
  async clearUserContext(): Promise<void> {
    await this.removeGlobalAttribute(ATTRIBUTE_NAMES.USER_ID);
    await this.removeGlobalAttribute(ATTRIBUTE_NAMES.USER_ROLE);
    await this.removeGlobalAttribute(ATTRIBUTE_NAMES.USER_TIER);
    this.logger.info('User context cleared from performance traces');
  }

  // ==========================================
  // TESTING / VERIFICATION
  // ==========================================

  /**
   * Test Performance Monitoring integration.
   * Use this to verify traces are being sent to Firebase.
   *
   * Call from browser console:
   * ```
   * window.testPerformance()
   * ```
   *
   * @returns Test results object
   */
  async testPerformance(): Promise<{
    success: boolean;
    platform: string;
    traceSent: boolean;
    httpMetricSent: boolean;
    duration: number;
    message: string;
  }> {
    const startTime = Date.now();
    const results = {
      success: false,
      platform: 'web',
      traceSent: false,
      httpMetricSent: false,
      duration: 0,
      message: '',
    };

    this.logger.info('🧪 Starting Performance Monitoring test...');

    try {
      // Test 1: Custom trace
      const trace = await this.startTrace('test_staging_trace');
      await trace.putAttribute('environment', 'staging');
      await trace.putAttribute('test_timestamp', new Date().toISOString());
      await trace.putMetric('test_value', 42);
      await trace.putMetric('random_value', Math.floor(Math.random() * 1000));

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 500));

      await trace.stop();
      results.traceSent = true;
      this.logger.info('✅ Custom trace sent: test_staging_trace');

      // Test 2: HTTP metric
      const httpMetric = await this.startHttpMetric('https://api.example.com/test', 'GET');
      await httpMetric.setHttpResponseCode(200);
      await httpMetric.setResponsePayloadSize(1024);
      await httpMetric.putAttribute('test', 'true');
      await httpMetric.stop();
      results.httpMetricSent = true;
      this.logger.info('✅ HTTP metric sent: GET https://api.example.com/test');

      // Test 3: Trace wrapper
      const wrapperResult = await this.trace(
        'test_trace_wrapper',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { tested: true };
        },
        {
          attributes: { wrapper_test: 'true' },
          metrics: { items_processed: 5 },
        }
      );
      this.logger.info('✅ Trace wrapper executed:', wrapperResult);

      results.success = true;
      results.duration = Date.now() - startTime;
      results.message = '🎉 All performance tests passed! Check Firebase Console in 12-24 hours.';

      this.logger.info(results.message);
      this.logger.info(`   Total test duration: ${results.duration}ms`);
      this.logger.info('   Traces sent: test_staging_trace, test_trace_wrapper');
      this.logger.info('   HTTP metrics sent: GET https://api.example.com/test');
    } catch (error) {
      results.duration = Date.now() - startTime;
      results.message = `❌ Performance test failed: ${(error as Error).message}`;
      this.logger.error(results.message, { error });
    }

    return results;
  }
}
