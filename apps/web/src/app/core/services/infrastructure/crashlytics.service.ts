/**
 * @fileoverview Web Crash Telemetry Service
 * @module @nxt1/web/core/services
 *
 * Web crash telemetry is now adapter-driven and backend-owned. The browser layer
 * records structured exception events through the shared analytics service while
 * native mobile continues to use dedicated crash reporting.
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';

import type {
  CrashlyticsAdapter,
  CrashBreadcrumb,
  CrashCustomKeys,
  CrashException,
  CrashlyticsConfig,
  CrashSeverity,
  CrashUser,
} from '@nxt1/core/crashlytics';

import {
  createNoOpCrashlyticsAdapter,
  CRASH_KEYS,
  BREADCRUMB_LIMITS,
  maskSensitiveData,
  DEFAULT_CRASHLYTICS_CONFIG,
  GA4_EVENTS,
} from '@nxt1/core/crashlytics';
import type { ILogger } from '@nxt1/core/logging';
import { AnalyticsService } from './analytics.service';
import { LoggingService } from './logging.service';

/**
 * Web Crash Telemetry Service
 *
 * Implements CrashlyticsAdapter through the shared analytics relay.
 * SSR-safe with automatic fallback to no-op mode on server.
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class SomeComponent {
 *   private readonly crashlytics = inject(CrashlyticsService);
 *
 *   async handleError(error: Error) {
 *     await this.crashlytics.recordError(error);
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class CrashlyticsService implements CrashlyticsAdapter {
  private readonly platformId = inject(PLATFORM_ID);

  /** Shared analytics relay for browser-side telemetry */
  private readonly analyticsService = inject(AnalyticsService);
  private readonly logger: ILogger = inject(LoggingService).child('CrashTelemetry');

  private _config: Required<CrashlyticsConfig> = { ...DEFAULT_CRASHLYTICS_CONFIG };
  private _ready = false;
  private _enabled = true;
  private _userId: string | null = null;
  private _customKeys: CrashCustomKeys = {};
  private _breadcrumbs: CrashBreadcrumb[] = [];

  /**
   * Fallback adapter for SSR
   */
  private readonly noOpAdapter = createNoOpCrashlyticsAdapter();

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
   * Initialize crash telemetry for web.
   * For browser builds, exception metadata is relayed through the shared analytics service.
   */
  async initialize(config?: CrashlyticsConfig): Promise<void> {
    this._config = { ...DEFAULT_CRASHLYTICS_CONFIG, ...config };

    if (this.isServer) {
      // Use no-op adapter for SSR
      await this.noOpAdapter.initialize(this._config);
      this._ready = true;
      return;
    }

    try {
      this._enabled = this._config.enabled;

      // Set initial custom keys
      if (this._config.initialCustomKeys) {
        Object.assign(this._customKeys, this._config.initialCustomKeys);
        await this.syncUserPropertiesToAnalytics();
      }

      // Setup global error handler integration
      if (this.isBrowser && this._config.collectConsoleBreadcrumbs) {
        this.setupConsoleInterception();
      }

      this._ready = true;
      this.logDebug('Web crash telemetry initialized');
    } catch (error) {
      this.logger.error('Crash telemetry initialization failed', error);
      await this.noOpAdapter.initialize(this._config);
      this._ready = true;
    }
  }

  /**
   * Check if crash collection is enabled
   */
  async isEnabled(): Promise<boolean> {
    if (this.isServer) {
      return this.noOpAdapter.isEnabled();
    }
    return this._enabled;
  }

  /**
   * Enable or disable crash collection
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.setEnabled(enabled);
    }

    this._enabled = enabled;
    this.logDebug(`Crash collection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if Crashlytics is ready
   */
  isReady(): boolean {
    return this._ready;
  }

  // ==========================================
  // USER IDENTIFICATION
  // ==========================================

  /**
   * Set user ID for crash attribution
   */
  async setUserId(userId: string): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.setUserId(userId);
    }

    try {
      this._userId = userId;
      this._customKeys[CRASH_KEYS.USER_ID] = userId;

      this.analyticsService.setUserId(userId);
      this.logDebug('User ID set', { userId });
    } catch (error) {
      this.logger.warn('Crash telemetry setUserId failed', { error });
    }
  }

  /**
   * Set full user information
   */
  async setUser(user: CrashUser): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.setUser(user);
    }

    try {
      await this.setUserId(user.userId);

      if (user.email) {
        // Mask email for privacy
        const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        this._customKeys['user_email_domain'] = maskedEmail;
      }

      if (user.displayName) {
        this._customKeys['user_name'] = user.displayName.substring(0, 50);
      }

      await this.syncUserPropertiesToAnalytics();
    } catch (error) {
      this.logger.warn('Crash telemetry setUser failed', { error });
    }
  }

  /**
   * Clear user identification
   */
  async clearUser(): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.clearUser();
    }

    try {
      this._userId = null;
      delete this._customKeys[CRASH_KEYS.USER_ID];
      delete this._customKeys['user_email_domain'];
      delete this._customKeys['user_name'];

      this.analyticsService.setUserId(null);
      this.logDebug('User cleared');
    } catch (error) {
      this.logger.warn('Crash telemetry clearUser failed', { error });
    }
  }

  // ==========================================
  // CUSTOM KEYS
  // ==========================================

  /**
   * Set a custom key-value pair
   */
  async setCustomKey(key: string, value: string | number | boolean): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.setCustomKey(key, value);
    }

    try {
      // Truncate long string values
      const safeValue =
        typeof value === 'string'
          ? value.substring(0, BREADCRUMB_LIMITS.MAX_CUSTOM_KEY_VALUE_LENGTH)
          : value;

      this._customKeys[key] = safeValue;

      await this.syncUserPropertiesToAnalytics();
    } catch (error) {
      this.logger.warn('Crash telemetry setCustomKey failed', { error });
    }
  }

  /**
   * Set multiple custom keys
   */
  async setCustomKeys(keys: CrashCustomKeys): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.setCustomKeys(keys);
    }

    // Mask sensitive data
    const safeKeys = maskSensitiveData(keys);

    Object.entries(safeKeys)
      .filter(([_, value]) => value !== undefined)
      .forEach(([key, value]) => {
        this._customKeys[key] = value!;
      });

    await this.syncUserPropertiesToAnalytics();
  }

  // ==========================================
  // BREADCRUMBS
  // ==========================================

  /**
   * Add a breadcrumb
   */
  async addBreadcrumb(breadcrumb: CrashBreadcrumb): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.addBreadcrumb(breadcrumb);
    }

    try {
      const entry: CrashBreadcrumb = {
        ...breadcrumb,
        timestamp: breadcrumb.timestamp ?? new Date().toISOString(),
      };

      // Mask sensitive data in breadcrumb
      if (entry.data) {
        entry.data = maskSensitiveData(entry.data as Record<string, unknown>);
      }

      this._breadcrumbs.push(entry);

      // Trim old breadcrumbs
      if (this._breadcrumbs.length > this._config.maxBreadcrumbs) {
        this._breadcrumbs = this._breadcrumbs.slice(-this._config.maxBreadcrumbs);
      }

      this.logDebug('Breadcrumb added', { message: entry.message });
    } catch (error) {
      this.logger.warn('Crash telemetry addBreadcrumb failed', { error });
    }
  }

  /**
   * Add a simple log message
   */
  async log(message: string): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.log(message);
    }

    await this.addBreadcrumb({
      type: 'console',
      message: message.substring(0, BREADCRUMB_LIMITS.MAX_MESSAGE_LENGTH),
    });
  }

  // ==========================================
  // EXCEPTION RECORDING
  // ==========================================

  /**
   * Record a non-fatal exception
   */
  async recordException(exception: CrashException): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.recordException(exception);
    }

    if (!this._enabled) return;

    try {
      const eventParams: Record<string, unknown> = {
        description: exception.message.substring(0, 150),
        fatal: exception.severity === 'fatal',
      };

      if (exception.code) {
        eventParams['error_code'] = exception.code;
      }
      if (exception.category) {
        eventParams['error_category'] = exception.category;
      }
      if (exception.name) {
        eventParams['error_name'] = exception.name;
      }
      if (this._userId) {
        eventParams['user_id'] = this._userId;
      }
      if (this._customKeys[CRASH_KEYS.SCREEN_NAME]) {
        eventParams['screen_name'] = this._customKeys[CRASH_KEYS.SCREEN_NAME];
      }

      this.analyticsService.trackEvent(GA4_EVENTS.EXCEPTION, eventParams);
      this.analyticsService.trackEvent(GA4_EVENTS.APP_ERROR, {
        ...eventParams,
        severity: exception.severity ?? 'error',
        breadcrumb_count: this._breadcrumbs.length,
        stack_available: !!exception.stacktrace,
      });

      if (this._config.debug) {
        this.logger.error('Crash exception recorded', {
          message: exception.message,
          stacktrace: exception.stacktrace,
          customKeys: this._customKeys,
          recentBreadcrumbs: this._breadcrumbs.slice(-10),
        });
      }

      this.logDebug('Exception recorded', { message: exception.message });
    } catch (error) {
      this.logger.warn('Crash telemetry recordException failed', { error });
    }
  }

  /**
   * Record an Error object
   */
  async recordError(error: Error, severity: CrashSeverity = 'error'): Promise<void> {
    if (this.isServer) {
      return this.noOpAdapter.recordError(error, severity);
    }

    await this.recordException({
      message: error.message,
      name: error.name,
      stacktrace: error.stack,
      severity,
    });
  }

  // ==========================================
  // CRASH TESTING (Web doesn't support true crashes)
  // ==========================================

  /**
   * Simulate a crash for testing.
   * On web, this throws an error that should be caught by GlobalErrorHandler.
   */
  async crash(): Promise<void> {
    this.logger.warn('Triggering test crash (non-fatal on web)');
    await this.log('Test crash triggered by developer');

    // Record as fatal exception
    await this.recordException({
      message: 'NXT1 Test Crash (Web)',
      severity: 'fatal',
      category: 'javascript',
    });

    // Set crash flag so we can detect it next session
    this.setCrashFlag();

    // Actually throw to test error handling
    throw new Error('NXT1 Test Crash');
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode(): boolean {
    return this._config.debug;
  }

  /**
   * Send unsent reports (no-op on web, relay events are fire-and-forget)
   */
  async sendUnsentReports(): Promise<void> {
    this.logDebug('Web crash telemetry relay is fire-and-forget');
  }

  /**
   * Delete unsent reports (no-op on web)
   */
  async deleteUnsentReports(): Promise<void> {
    // Clear local breadcrumbs
    this._breadcrumbs = [];
    this.logDebug('Local breadcrumbs cleared');
  }

  /**
   * Check if crashed on previous execution (always false on web)
   */
  async didCrashOnPreviousExecution(): Promise<boolean> {
    if (this.isServer) {
      return false;
    }

    // Check sessionStorage for crash flag
    try {
      const crashFlag = sessionStorage.getItem('nxt1_did_crash');
      if (crashFlag) {
        sessionStorage.removeItem('nxt1_did_crash');
        return true;
      }
    } catch {
      // sessionStorage may not be available
    }

    return false;
  }

  // ==========================================
  // CONVENIENCE METHODS (NXT1 specific)
  // ==========================================

  /**
   * Track navigation for automatic breadcrumbs
   */
  async trackNavigation(from: string, to: string): Promise<void> {
    await this.setCustomKey(CRASH_KEYS.PREVIOUS_SCREEN, from);
    await this.setCustomKey(CRASH_KEYS.SCREEN_NAME, to);

    if (this._config.collectNavigationBreadcrumbs) {
      await this.addBreadcrumb({
        type: 'navigation',
        message: `Navigated from ${from} to ${to}`,
        data: { from, to },
      });
    }
  }

  /**
   * Track HTTP request for automatic breadcrumbs
   */
  async trackHttpRequest(
    method: string,
    url: string,
    status: number,
    durationMs?: number
  ): Promise<void> {
    if (!this._config.collectHttpBreadcrumbs) return;

    // Mask sensitive parts of URL
    const safeUrl = url.replace(/token=[^&]+/g, 'token=[REDACTED]');

    await this.addBreadcrumb({
      type: 'http',
      message: `${method} ${safeUrl} → ${status}`,
      data: {
        method,
        status,
        duration_ms: durationMs,
      },
    });

    // Track last successful API call
    if (status >= 200 && status < 300) {
      await this.setCustomKey(CRASH_KEYS.LAST_API_SUCCESS, new Date().toISOString());
    }
  }

  /**
   * Get current breadcrumbs (for debugging)
   */
  getBreadcrumbs(): CrashBreadcrumb[] {
    return [...this._breadcrumbs];
  }

  /**
   * Get current custom keys (for debugging)
   */
  getCustomKeys(): CrashCustomKeys {
    return { ...this._customKeys };
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  /**
   * Sync relevant custom keys to the shared analytics relay.
   */
  private async syncUserPropertiesToAnalytics(): Promise<void> {
    try {
      const properties: Record<string, string> = {};

      if (this._customKeys[CRASH_KEYS.USER_ROLE]) {
        properties['user_role'] = String(this._customKeys[CRASH_KEYS.USER_ROLE]);
      }
      if (this._customKeys[CRASH_KEYS.ENVIRONMENT]) {
        properties['app_env'] = String(this._customKeys[CRASH_KEYS.ENVIRONMENT]);
      }
      if (this._customKeys[CRASH_KEYS.APP_VERSION]) {
        properties['app_version'] = String(this._customKeys[CRASH_KEYS.APP_VERSION]);
      }

      if (Object.keys(properties).length > 0) {
        this.analyticsService.setUserProperties(properties);
      }
    } catch (error) {
      this.logger.warn('Crash telemetry user property sync failed', { error });
    }
  }

  /**
   * Setup console.error interception for breadcrumbs
   */
  private setupConsoleInterception(): void {
    const originalError = console.error;

    console.error = (...args: unknown[]) => {
      // Call original
      originalError.apply(console, args);

      // Add as breadcrumb
      const message = args
        .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
        .join(' ');

      this.addBreadcrumb({
        type: 'console',
        message: message.substring(0, BREADCRUMB_LIMITS.MAX_MESSAGE_LENGTH),
      });
    };
  }

  /**
   * Set crash flag for next session
   */
  private setCrashFlag(): void {
    try {
      sessionStorage.setItem('nxt1_did_crash', 'true');
    } catch {
      // sessionStorage may not be available
    }
  }

  private logDebug(message: string, context?: Record<string, unknown>): void {
    if (this._config.debug) {
      this.logger.debug(message, context);
    }
  }
}
