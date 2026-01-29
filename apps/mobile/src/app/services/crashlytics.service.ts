/**
 * @fileoverview Mobile Crashlytics Service
 * @module @nxt1/mobile/services
 *
 * Native Firebase Crashlytics integration for iOS/Android via Capacitor.
 * Provides full crash reporting with:
 * - Native crash collection (ANRs, NDK crashes on Android)
 * - Non-fatal exception recording
 * - Breadcrumb tracking
 * - Custom keys for context
 * - User identification
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseCrashlytics, type StackFrame } from '@capacitor-firebase/crashlytics';
import { NxtLoggingService } from '@nxt1/ui';

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
} from '@nxt1/core/crashlytics';

/**
 * Mobile Crashlytics Service
 *
 * Wraps @capacitor-firebase/crashlytics for native crash reporting.
 * Implements the CrashlyticsAdapter interface for consistent API.
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
  private readonly logger = inject(NxtLoggingService).child('CrashlyticsService');
  private _config: Required<CrashlyticsConfig> = { ...DEFAULT_CRASHLYTICS_CONFIG };
  private _ready = false;
  private _isNative = false;
  private _breadcrumbs: CrashBreadcrumb[] = [];

  /**
   * Fallback adapter for non-native platforms (web preview)
   */
  private readonly noOpAdapter = createNoOpCrashlyticsAdapter();

  constructor() {
    this._isNative = Capacitor.isNativePlatform();
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  /**
   * Initialize Crashlytics.
   * Call early in app bootstrap (main.ts or app.config.ts).
   */
  async initialize(config?: CrashlyticsConfig): Promise<void> {
    this._config = { ...DEFAULT_CRASHLYTICS_CONFIG, ...config };

    if (!this._isNative) {
      // Use no-op adapter for web preview in Capacitor
      await this.noOpAdapter.initialize(this._config);
      this._ready = true;
      this.logDebug('Initialized in no-op mode (not native platform)');
      return;
    }

    try {
      // Enable/disable crash collection
      await FirebaseCrashlytics.setEnabled({ enabled: this._config.enabled });

      // Set initial custom keys
      if (this._config.initialCustomKeys) {
        await this.setCustomKeys(this._config.initialCustomKeys);
      }

      // Set app version
      await this.setCustomKey(
        CRASH_KEYS.APP_VERSION,
        this._config.initialCustomKeys?.app_version ?? '1.0.0'
      );

      this._ready = true;
      this.logDebug('Crashlytics initialized successfully');

      // Log if there was a crash on previous execution
      const didCrash = await this.didCrashOnPreviousExecution();
      if (didCrash) {
        this.logDebug('App crashed on previous execution');
        await this.log('Previous session ended with a crash');
      }
    } catch (error) {
      console.error('[Crashlytics] Initialization failed:', error);
      // Fall back to no-op mode
      await this.noOpAdapter.initialize(this._config);
      this._ready = true;
    }
  }

  /**
   * Check if crash collection is enabled
   */
  async isEnabled(): Promise<boolean> {
    if (!this._isNative) {
      return this.noOpAdapter.isEnabled();
    }

    try {
      const result = await FirebaseCrashlytics.isEnabled();
      return result.enabled;
    } catch {
      return false;
    }
  }

  /**
   * Enable or disable crash collection.
   * Useful for user privacy preferences.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.setEnabled(enabled);
    }

    try {
      await FirebaseCrashlytics.setEnabled({ enabled });
      this._config.enabled = enabled;
      this.logDebug(`Crash collection ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('[Crashlytics] setEnabled failed:', error);
    }
  }

  /**
   * Check if Crashlytics is ready to record crashes
   */
  isReady(): boolean {
    return this._ready;
  }

  // ==========================================
  // USER IDENTIFICATION
  // ==========================================

  /**
   * Set user ID for crash attribution.
   * Call after successful authentication.
   */
  async setUserId(userId: string): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.setUserId(userId);
    }

    try {
      await FirebaseCrashlytics.setUserId({ userId });
      await this.setCustomKey(CRASH_KEYS.USER_ID, userId);
      this.logDebug('User ID set:', userId);
    } catch (error) {
      console.error('[Crashlytics] setUserId failed:', error);
    }
  }

  /**
   * Set full user information for crash attribution
   */
  async setUser(user: CrashUser): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.setUser(user);
    }

    try {
      await FirebaseCrashlytics.setUserId({ userId: user.userId });

      // Set additional user info as custom keys
      const keys: CrashCustomKeys = {
        [CRASH_KEYS.USER_ID]: user.userId,
      };

      if (user.email) {
        // Mask email for privacy (only domain visible)
        const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        keys['user_email_domain'] = maskedEmail;
      }

      if (user.displayName) {
        keys['user_name'] = user.displayName.substring(0, 50);
      }

      await this.setCustomKeys(keys);
      this.logDebug('User set:', user.userId);
    } catch (error) {
      console.error('[Crashlytics] setUser failed:', error);
    }
  }

  /**
   * Clear user identification.
   * Call on logout.
   */
  async clearUser(): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.clearUser();
    }

    try {
      // Firebase Crashlytics doesn't have a direct clearUser method
      // Set empty user ID to clear
      await FirebaseCrashlytics.setUserId({ userId: '' });
      await this.setCustomKeys({
        [CRASH_KEYS.USER_ID]: '',
        user_email_domain: '',
        user_name: '',
      });
      this.logDebug('User cleared');
    } catch (error) {
      console.error('[Crashlytics] clearUser failed:', error);
    }
  }

  // ==========================================
  // CUSTOM KEYS
  // ==========================================

  /**
   * Set a custom key-value pair for crash context
   */
  async setCustomKey(key: string, value: string | number | boolean): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.setCustomKey(key, value);
    }

    try {
      // Truncate long string values
      const safeValue =
        typeof value === 'string'
          ? value.substring(0, BREADCRUMB_LIMITS.MAX_CUSTOM_KEY_VALUE_LENGTH)
          : value;

      await FirebaseCrashlytics.setCustomKey({
        key,
        value: safeValue,
        type: typeof value as 'string' | 'boolean' | 'long' | 'double',
      });
    } catch (error) {
      console.error('[Crashlytics] setCustomKey failed:', key, error);
    }
  }

  /**
   * Set multiple custom keys at once
   */
  async setCustomKeys(keys: CrashCustomKeys): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.setCustomKeys(keys);
    }

    // Mask any sensitive data before sending
    const safeKeys = maskSensitiveData(keys);

    const promises = Object.entries(safeKeys)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => this.setCustomKey(key, value!));

    await Promise.allSettled(promises);
  }

  // ==========================================
  // BREADCRUMBS
  // ==========================================

  /**
   * Add a breadcrumb to track user actions leading to a crash
   */
  async addBreadcrumb(breadcrumb: CrashBreadcrumb): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.addBreadcrumb(breadcrumb);
    }

    try {
      // Build log message with type prefix
      let message = `[${breadcrumb.type}] ${breadcrumb.message}`;

      // Add data if present (truncated)
      if (breadcrumb.data) {
        const safeData = maskSensitiveData(breadcrumb.data as Record<string, unknown>);
        const dataStr = JSON.stringify(safeData);
        if (dataStr.length <= BREADCRUMB_LIMITS.MAX_DATA_SIZE) {
          message += ` | ${dataStr}`;
        }
      }

      // Truncate total message
      message = message.substring(0, BREADCRUMB_LIMITS.MAX_MESSAGE_LENGTH);

      await FirebaseCrashlytics.log({ message });

      // Store locally for debugging
      this._breadcrumbs.push({
        ...breadcrumb,
        timestamp: breadcrumb.timestamp ?? new Date().toISOString(),
      });

      // Trim old breadcrumbs
      if (this._breadcrumbs.length > this._config.maxBreadcrumbs) {
        this._breadcrumbs = this._breadcrumbs.slice(-this._config.maxBreadcrumbs);
      }
    } catch (error) {
      console.error('[Crashlytics] addBreadcrumb failed:', error);
    }
  }

  /**
   * Add a simple log message as a breadcrumb
   */
  async log(message: string): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.log(message);
    }

    try {
      const safeMessage = message.substring(0, BREADCRUMB_LIMITS.MAX_MESSAGE_LENGTH);
      await FirebaseCrashlytics.log({ message: safeMessage });
    } catch (error) {
      console.error('[Crashlytics] log failed:', error);
    }
  }

  // ==========================================
  // EXCEPTION RECORDING
  // ==========================================

  /**
   * Record a non-fatal exception
   */
  async recordException(exception: CrashException): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.recordException(exception);
    }

    try {
      // Build exception options
      const options: {
        message: string;
        stacktrace?: StackFrame[];
        code?: number;
      } = {
        message: exception.message.substring(0, BREADCRUMB_LIMITS.MAX_MESSAGE_LENGTH),
      };

      // Parse stacktrace into StackFrame[] format if available
      if (exception.stacktrace) {
        options.stacktrace = this.parseStacktrace(exception.stacktrace);
      }

      // Add error code if available (convert string code to number hash)
      if (exception.code) {
        options.code = this.hashCode(exception.code);
      }

      // Set severity as custom key for filtering
      if (exception.severity) {
        await this.setCustomKey('last_error_severity', exception.severity);
      }

      // Set category as custom key for filtering
      if (exception.category) {
        await this.setCustomKey('last_error_category', exception.category);
      }

      // Record the exception
      await FirebaseCrashlytics.recordException(options);

      this.logDebug('Exception recorded:', exception.message);
    } catch (error) {
      console.error('[Crashlytics] recordException failed:', error);
    }
  }

  /**
   * Record an Error object as a non-fatal exception
   */
  async recordError(error: Error, severity: CrashSeverity = 'error'): Promise<void> {
    if (!this._isNative) {
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
  // CRASH TESTING
  // ==========================================

  /**
   * Force a crash for testing purposes.
   * ⚠️ WARNING: This will crash the app!
   */
  async crash(): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.crash();
    }

    if (this._config.debug) {
      console.warn('[Crashlytics] Triggering test crash...');
      await this.log('Test crash triggered by developer');
    }

    await FirebaseCrashlytics.crash({ message: 'NXT1 Test Crash' });
  }

  /**
   * Check if this is debug mode
   */
  isDebugMode(): boolean {
    return this._config.debug;
  }

  /**
   * Send any unsent crash reports immediately
   */
  async sendUnsentReports(): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.sendUnsentReports();
    }

    try {
      await FirebaseCrashlytics.sendUnsentReports();
      this.logDebug('Unsent reports sent');
    } catch (error) {
      this.logger.error('sendUnsentReports failed', error);
    }
  }

  /**
   * Delete any unsent crash reports
   */
  async deleteUnsentReports(): Promise<void> {
    if (!this._isNative) {
      return this.noOpAdapter.deleteUnsentReports();
    }

    try {
      await FirebaseCrashlytics.deleteUnsentReports();
      this.logDebug('Unsent reports deleted');
    } catch (error) {
      this.logger.error('deleteUnsentReports failed', error);
    }
  }

  /**
   * Check if there are unsent reports from a previous crash
   */
  async didCrashOnPreviousExecution(): Promise<boolean> {
    if (!this._isNative) {
      return this.noOpAdapter.didCrashOnPreviousExecution();
    }

    try {
      const result = await FirebaseCrashlytics.didCrashOnPreviousExecution();
      return result.crashed;
    } catch {
      return false;
    }
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
   * Track user action for breadcrumbs
   */
  async trackUserAction(action: string, data?: Record<string, unknown>): Promise<void> {
    await this.addBreadcrumb({
      type: 'ui',
      message: action,
      data,
    });
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private logDebug(...args: unknown[]): void {
    if (this._config.debug) {
      this.logger.debug('Crashlytics', { details: args });
    }
  }

  /**
   * Simple hash code for string to number conversion
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Parse a JavaScript stack trace string into StackFrame[] format
   * for @capacitor-firebase/crashlytics
   */
  private parseStacktrace(stacktrace: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const lines = stacktrace.split('\n');

    for (const line of lines) {
      // Match patterns like:
      // "at functionName (fileName:lineNumber:columnNumber)"
      // "at fileName:lineNumber:columnNumber"
      const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+)(?::\d+)?\)?/);

      if (match) {
        frames.push({
          functionName: match[1] || '<anonymous>',
          fileName: match[2],
          lineNumber: parseInt(match[3], 10),
        });
      }
    }

    // Limit to first 50 frames to avoid oversized payloads
    return frames.slice(0, 50);
  }
}
