/**
 * @fileoverview Mobile Performance Monitoring Service
 * @module @nxt1/mobile/core/services
 *
 * Native Firebase Performance Monitoring integration for iOS/Android via Capacitor.
 * Provides automatic and custom performance tracking with:
 * - App start time measurement
 * - Screen rendering traces (native)
 * - HTTP/S network request monitoring (automatic)
 * - Custom code traces for critical paths
 * - Custom metrics and attributes
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebasePerformance } from '@capacitor-firebase/performance';
import { NxtLoggingService } from '@nxt1/ui';

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
// NATIVE TRACE IMPLEMENTATION
// ============================================

/**
 * Active trace wrapper for Capacitor Firebase Performance
 */
class NativeTrace implements ActiveTrace {
  readonly startTime: number;
  private _state: TraceState = 'running';
  private _attributes: TraceAttributes = {};

  constructor(
    readonly name: string,
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
      await FirebasePerformance.stopTrace({ traceName: this.name });
      this.logger.debug(`Trace stopped: ${this.name}`, {
        duration: Date.now() - this.startTime,
      });
    } catch (error) {
      this.logger.warn(`Failed to stop trace: ${this.name}`, { error });
    }
  }

  async putMetric(metricName: string, value: number): Promise<void> {
    if (this._state === 'stopped') return;

    try {
      await FirebasePerformance.putTraceMetric({
        traceName: this.name,
        metricName,
        value,
      });
    } catch (error) {
      this.logger.warn(`Failed to put metric: ${metricName}`, { error });
    }
  }

  async incrementMetric(metricName: string, delta = 1): Promise<void> {
    if (this._state === 'stopped') return;

    try {
      await FirebasePerformance.incrementTraceMetric({
        traceName: this.name,
        metricName,
        incrementBy: delta,
      });
    } catch (error) {
      this.logger.warn(`Failed to increment metric: ${metricName}`, { error });
    }
  }

  async putAttribute(attributeName: string, value: string): Promise<void> {
    if (this._state === 'stopped') return;
    this._attributes[attributeName] = value;

    try {
      await FirebasePerformance.putTraceAttribute({
        traceName: this.name,
        attributeName,
        attributeValue: value,
      });
    } catch (error) {
      this.logger.warn(`Failed to put attribute: ${attributeName}`, { error });
    }
  }

  async removeAttribute(attributeName: string): Promise<void> {
    if (this._state === 'stopped') return;
    delete this._attributes[attributeName];

    try {
      await FirebasePerformance.removeTraceAttribute({
        traceName: this.name,
        attributeName,
      });
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
// NATIVE HTTP METRIC IMPLEMENTATION
// ============================================

/**
 * Active HTTP metric wrapper for Capacitor Firebase Performance
 */
class NativeHttpMetric implements ActiveHttpMetric {
  readonly startTime: number;

  constructor(
    readonly url: string,
    readonly method: HttpMethod,
    private readonly logger: ReturnType<NxtLoggingService['child']>
  ) {
    this.startTime = Date.now();
  }

  async setHttpResponseCode(code: number): Promise<void> {
    try {
      await FirebasePerformance.putHttpMetricAttribute({
        url: this.url,
        httpMethod: this.method,
        attributeName: 'http_response_code',
        attributeValue: String(code),
      });
    } catch (error) {
      this.logger.warn('Failed to set HTTP response code', { error });
    }
  }

  async setRequestPayloadSize(bytes: number): Promise<void> {
    try {
      await FirebasePerformance.putHttpMetricAttribute({
        url: this.url,
        httpMethod: this.method,
        attributeName: 'request_payload_size',
        attributeValue: String(bytes),
      });
    } catch (error) {
      this.logger.warn('Failed to set request payload size', { error });
    }
  }

  async setResponsePayloadSize(bytes: number): Promise<void> {
    try {
      await FirebasePerformance.putHttpMetricAttribute({
        url: this.url,
        httpMethod: this.method,
        attributeName: 'response_payload_size',
        attributeValue: String(bytes),
      });
    } catch (error) {
      this.logger.warn('Failed to set response payload size', { error });
    }
  }

  async setResponseContentType(contentType: string): Promise<void> {
    try {
      await FirebasePerformance.putHttpMetricAttribute({
        url: this.url,
        httpMethod: this.method,
        attributeName: 'content_type',
        attributeValue: contentType,
      });
    } catch (error) {
      this.logger.warn('Failed to set content type', { error });
    }
  }

  async putAttribute(name: string, value: string): Promise<void> {
    try {
      await FirebasePerformance.putHttpMetricAttribute({
        url: this.url,
        httpMethod: this.method,
        attributeName: name,
        attributeValue: value,
      });
    } catch (error) {
      this.logger.warn(`Failed to put HTTP metric attribute: ${name}`, { error });
    }
  }

  async stop(): Promise<void> {
    try {
      await FirebasePerformance.stopHttpMetric({
        url: this.url,
        httpMethod: this.method,
      });
      this.logger.debug(`HTTP metric stopped: ${this.method} ${this.url}`, {
        duration: Date.now() - this.startTime,
      });
    } catch (error) {
      this.logger.warn('Failed to stop HTTP metric', { error });
    }
  }
}

// ============================================
// NATIVE SCREEN TRACE IMPLEMENTATION
// ============================================

/**
 * Screen trace wrapper for native screen rendering performance
 */
class NativeScreenTrace implements ScreenTrace {
  readonly startTime: number;

  constructor(
    readonly screenName: string,
    private readonly logger: ReturnType<NxtLoggingService['child']>
  ) {
    this.startTime = Date.now();
  }

  async stop(): Promise<void> {
    try {
      // Screen traces on native use the standard trace API
      await FirebasePerformance.stopTrace({ traceName: `_st_${this.screenName}` });
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
 * Mobile Performance Monitoring Service
 *
 * Wraps @capacitor-firebase/performance for native performance tracking.
 * Implements the PerformanceAdapter interface for consistent API.
 *
 * Features:
 * - Automatic app start time tracking
 * - Automatic HTTP/S network request monitoring
 * - Custom code traces for business-critical operations
 * - Custom metrics and attributes
 * - Global attributes for user context
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
  private readonly logger = inject(NxtLoggingService).child('PerformanceService');
  private _config: Required<PerformanceConfig> = { ...DEFAULT_PERFORMANCE_CONFIG };
  private _ready = false;
  private _isNative = false;
  private _globalAttributes: TraceAttributes = {};

  /**
   * Fallback adapter for non-native platforms (web preview in Ionic serve)
   */
  private readonly noOpAdapter = createNoOpPerformanceAdapter();

  constructor() {
    this._isNative = Capacitor.isNativePlatform();
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  /**
   * Initialize Performance Monitoring.
   * Call early in app bootstrap (main.ts or APP_INITIALIZER).
   */
  async initialize(config?: PerformanceConfig): Promise<void> {
    this._config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };

    if (!this._isNative) {
      await this.noOpAdapter.initialize(this._config);
      this._ready = true;
      this.logger.debug('Initialized in no-op mode (not native platform)');
      return;
    }

    try {
      // Enable/disable performance collection
      await FirebasePerformance.setEnabled({ enabled: this._config.enabled });

      // Set app version attribute globally
      if (this._config.appVersion) {
        await this.setGlobalAttribute(ATTRIBUTE_NAMES.APP_VERSION, this._config.appVersion);
      }

      // Set platform attribute
      await this.setGlobalAttribute(ATTRIBUTE_NAMES.PLATFORM, Capacitor.getPlatform());

      this._ready = true;
      this.logger.info('Performance Monitoring initialized', {
        enabled: this._config.enabled,
        platform: Capacitor.getPlatform(),
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
    return this._ready && this._config.enabled;
  }

  /**
   * Enable/disable Performance Monitoring at runtime
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this._config = { ...this._config, enabled };

    if (!this._isNative) {
      await this.noOpAdapter.setEnabled(enabled);
      return;
    }

    try {
      await FirebasePerformance.setEnabled({ enabled });
      this.logger.info(`Performance Monitoring ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      this.logger.error('Failed to set enabled state', { error });
    }
  }

  // ==========================================
  // CUSTOM TRACES
  // ==========================================

  /**
   * Start a custom code trace
   */
  async startTrace(name: string): Promise<ActiveTrace> {
    if (!this._isNative) {
      return this.noOpAdapter.startTrace(name);
    }

    if (!this._ready || !this._config.enabled) {
      return this.noOpAdapter.startTrace(name);
    }

    try {
      await FirebasePerformance.startTrace({ traceName: name });
      this.logger.debug(`Trace started: ${name}`);

      const trace = new NativeTrace(name, this.logger);

      // Apply global attributes to trace
      for (const [key, value] of Object.entries(this._globalAttributes)) {
        await trace.putAttribute(key, value);
      }

      return trace;
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
   * Stop a trace by name (alternative API)
   */
  async stopTrace(name: string): Promise<void> {
    if (!this._isNative || !this._ready) return;

    try {
      await FirebasePerformance.stopTrace({ traceName: name });
    } catch (error) {
      this.logger.warn(`Failed to stop trace: ${name}`, { error });
    }
  }

  // ==========================================
  // HTTP METRICS
  // ==========================================

  /**
   * Start tracking an HTTP request manually
   */
  async startHttpMetric(url: string, httpMethod: HttpMethod): Promise<ActiveHttpMetric> {
    if (!this._isNative) {
      return this.noOpAdapter.startHttpMetric(url, httpMethod);
    }

    if (!this._ready || !this._config.enabled) {
      return this.noOpAdapter.startHttpMetric(url, httpMethod);
    }

    try {
      await FirebasePerformance.startHttpMetric({ url, httpMethod });
      this.logger.debug(`HTTP metric started: ${httpMethod} ${url}`);
      return new NativeHttpMetric(url, httpMethod, this.logger);
    } catch (error) {
      this.logger.warn('Failed to start HTTP metric', { error });
      return this.noOpAdapter.startHttpMetric(url, httpMethod);
    }
  }

  // ==========================================
  // SCREEN TRACES
  // ==========================================

  /**
   * Start a screen trace for measuring screen rendering
   */
  async startScreenTrace(screenName: string): Promise<ScreenTrace> {
    if (!this._isNative) {
      return this.noOpAdapter.startScreenTrace(screenName);
    }

    if (!this._ready || !this._config.enabled) {
      return this.noOpAdapter.startScreenTrace(screenName);
    }

    try {
      // Use standard trace with screen name prefix
      const traceName = `_st_${screenName}`;
      await FirebasePerformance.startTrace({ traceName });
      this.logger.debug(`Screen trace started: ${screenName}`);
      return new NativeScreenTrace(screenName, this.logger);
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

    // Note: Firebase Performance doesn't have a native "global attributes" API
    // We store them locally and apply to each new trace
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
}
