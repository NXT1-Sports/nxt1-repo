/**
 * @fileoverview Web Crashlytics Service
 * @module @nxt1/web/core/services
 *
 * Web implementation of CrashlyticsAdapter using Google Analytics 4.
 *
 * Firebase Crashlytics doesn't support web natively, so we use GA4's
 * 'exception' event for error tracking. This provides:
 * - Error tracking in Google Analytics 4
 * - Correlation with Firebase Console (same project)
 * - User journey tracking via breadcrumbs
 *
 * For full crash analytics, native mobile apps still provide the best
 * experience via @capacitor-firebase/crashlytics.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { Analytics, logEvent, setUserId, setUserProperties } from '@angular/fire/analytics';

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

/**
 * Web Crashlytics Service
 *
 * Implements CrashlyticsAdapter using Google Analytics 4 exception events.
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

  /** Firebase Analytics instance - may be null on server */
  private readonly analytics = inject(Analytics, { optional: true });

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
   * Initialize Crashlytics (web version).
   * For web, this sets up GA4 exception tracking.
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
        await this.syncUserPropertiesToGA4();
      }

      // Setup global error handler integration
      if (this.isBrowser && this._config.collectConsoleBreadcrumbs) {
        this.setupConsoleInterception();
      }

      this._ready = true;
      this.logDebug('Web Crashlytics initialized (GA4 mode)');
    } catch (error) {
      console.error('[Crashlytics:Web] Initialization failed:', error);
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

      // Set in Firebase Analytics
      if (this.analytics) {
        setUserId(this.analytics, userId);
      }

      this.logDebug('User ID set:', userId);
    } catch (error) {
      console.error('[Crashlytics:Web] setUserId failed:', error);
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

      await this.syncUserPropertiesToGA4();
    } catch (error) {
      console.error('[Crashlytics:Web] setUser failed:', error);
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

      // Clear in Firebase Analytics
      if (this.analytics) {
        setUserId(this.analytics, '');
      }

      this.logDebug('User cleared');
    } catch (error) {
      console.error('[Crashlytics:Web] clearUser failed:', error);
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

      // Sync relevant keys to GA4 user properties
      await this.syncUserPropertiesToGA4();
    } catch (error) {
      console.error('[Crashlytics:Web] setCustomKey failed:', error);
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

    await this.syncUserPropertiesToGA4();
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

      this.logDebug('Breadcrumb added:', entry.message);
    } catch (error) {
      console.error('[Crashlytics:Web] addBreadcrumb failed:', error);
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
      // Log to GA4 as exception event
      if (this.analytics) {
        const eventParams: Record<string, unknown> = {
          description: exception.message.substring(0, 150), // GA4 limit
          fatal: exception.severity === 'fatal',
        };

        // Add custom dimensions
        if (exception.code) {
          eventParams['error_code'] = exception.code;
        }
        if (exception.category) {
          eventParams['error_category'] = exception.category;
        }
        if (exception.name) {
          eventParams['error_name'] = exception.name;
        }

        // Add user context
        if (this._userId) {
          eventParams['user_id'] = this._userId;
        }

        // Add relevant custom keys
        if (this._customKeys[CRASH_KEYS.SCREEN_NAME]) {
          eventParams['screen_name'] = this._customKeys[CRASH_KEYS.SCREEN_NAME];
        }

        // Log the exception event
        logEvent(this.analytics, GA4_EVENTS.EXCEPTION, eventParams);

        // Also log as custom event for more detail
        logEvent(this.analytics, GA4_EVENTS.APP_ERROR, {
          ...eventParams,
          severity: exception.severity ?? 'error',
          breadcrumb_count: this._breadcrumbs.length,
          stack_available: !!exception.stacktrace,
        });
      }

      // Log to console in debug mode
      if (this._config.debug) {
        console.group('[Crashlytics:Web] Exception Recorded');
        console.error('Message:', exception.message);
        if (exception.stacktrace) {
          console.error('Stack:', exception.stacktrace);
        }
        console.log('Context:', this._customKeys);
        console.log('Breadcrumbs:', this._breadcrumbs.slice(-10));
        console.groupEnd();
      }

      this.logDebug('Exception recorded:', exception.message);
    } catch (error) {
      console.error('[Crashlytics:Web] recordException failed:', error);
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
    console.warn('[Crashlytics:Web] Triggering test crash (non-fatal on web)');
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
   * Send unsent reports (no-op on web, GA4 sends automatically)
   */
  async sendUnsentReports(): Promise<void> {
    // GA4 sends events automatically
    this.logDebug('GA4 events are sent automatically');
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
   * Sync relevant custom keys to GA4 user properties
   */
  private async syncUserPropertiesToGA4(): Promise<void> {
    if (!this.analytics) return;

    try {
      const properties: Record<string, string | null> = {};

      // Map custom keys to GA4 user properties
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
        setUserProperties(this.analytics, properties);
      }
    } catch (error) {
      console.error('[Crashlytics:Web] syncUserPropertiesToGA4 failed:', error);
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

  private logDebug(...args: unknown[]): void {
    if (this._config.debug) {
      console.debug('[Crashlytics:Web]', ...args);
    }
  }
}
