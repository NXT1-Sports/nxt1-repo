/**
 * @fileoverview Crashlytics Adapter Interface
 * @module @nxt1/core/crashlytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Platform-agnostic interface for crash reporting.
 * Implementations:
 * - Mobile: @capacitor-firebase/crashlytics
 * - Web: Google Analytics 4 exception events
 * - Backend: Google Cloud Error Reporting
 * - Test/SSR: Memory/No-op adapter
 *
 * @author NXT1 Engineering
 * @version 1.1.0
 */

import type {
  CrashBreadcrumb,
  CrashCustomKeys,
  CrashException,
  CrashlyticsConfig,
  CrashSeverity,
  CrashUser,
} from './crashlytics.types';

import type { AppError } from './app-error';

// ============================================
// CRASHLYTICS ADAPTER INTERFACE
// ============================================

/**
 * Platform-agnostic Crashlytics adapter interface.
 *
 * All implementations must provide these methods.
 * This allows the GlobalErrorHandler to work across all platforms.
 *
 * @example
 * ```typescript
 * // Mobile implementation
 * const crashlytics = createMobileCrashlyticsAdapter(config);
 *
 * // Web implementation
 * const crashlytics = createWebCrashlyticsAdapter(config);
 *
 * // Usage is identical
 * crashlytics.recordException({ message: 'Something went wrong' });
 * ```
 */
export interface CrashlyticsAdapter {
  /**
   * Initialize the crashlytics adapter.
   * Call this early in the app bootstrap process.
   */
  initialize(config?: CrashlyticsConfig): Promise<void>;

  /**
   * Check if crash collection is enabled.
   */
  isEnabled(): Promise<boolean>;

  /**
   * Enable or disable crash collection.
   * Useful for user privacy preferences.
   *
   * @param enabled - Whether to enable crash collection
   */
  setEnabled(enabled: boolean): Promise<void>;

  /**
   * Check if the adapter is ready to record crashes.
   */
  isReady(): boolean;

  // ==========================================
  // USER IDENTIFICATION
  // ==========================================

  /**
   * Set the user ID for crash attribution.
   * Call after successful authentication.
   *
   * @param userId - Firebase Auth UID
   */
  setUserId(userId: string): Promise<void>;

  /**
   * Set full user information for crash attribution.
   *
   * @param user - User info (id, email, name)
   */
  setUser(user: CrashUser): Promise<void>;

  /**
   * Clear user identification.
   * Call on logout.
   */
  clearUser(): Promise<void>;

  // ==========================================
  // CUSTOM KEYS (Contextual Data)
  // ==========================================

  /**
   * Set a custom key-value pair for crash context.
   * Values must be strings, numbers, or booleans.
   *
   * @param key - Key name (use CRASH_KEYS constants)
   * @param value - Value (string, number, or boolean)
   */
  setCustomKey(key: string, value: string | number | boolean): Promise<void>;

  /**
   * Set multiple custom keys at once.
   *
   * @param keys - Object with key-value pairs
   */
  setCustomKeys(keys: CrashCustomKeys): Promise<void>;

  // ==========================================
  // BREADCRUMBS (User Journey)
  // ==========================================

  /**
   * Add a breadcrumb to track user actions leading to a crash.
   * Breadcrumbs are retained up to maxBreadcrumbs (default 100).
   *
   * @param breadcrumb - Breadcrumb data
   */
  addBreadcrumb(breadcrumb: CrashBreadcrumb): Promise<void>;

  /**
   * Add a simple log message as a breadcrumb.
   * Shorthand for addBreadcrumb with type 'console'.
   *
   * @param message - Log message
   */
  log(message: string): Promise<void>;

  // ==========================================
  // EXCEPTION RECORDING
  // ==========================================

  /**
   * Record a non-fatal exception.
   * Use this for errors that don't crash the app but should be tracked.
   *
   * @param exception - Exception details
   */
  recordException(exception: CrashException): Promise<void>;

  /**
   * Record an Error object as a non-fatal exception.
   * Convenience method that extracts message and stack from Error.
   *
   * @param error - JavaScript Error object
   * @param severity - Optional severity override
   */
  recordError(error: Error, severity?: CrashSeverity): Promise<void>;

  /**
   * Record a unified AppError with full context.
   * This is the preferred method for recording errors with rich metadata.
   *
   * @param appError - Unified AppError object
   */
  recordAppError?(appError: AppError): Promise<void>;

  // ==========================================
  // CRASH TESTING
  // ==========================================

  /**
   * Force a crash for testing purposes.
   * ⚠️ WARNING: This will crash the app!
   * Only use in development/testing.
   */
  crash(): Promise<void>;

  /**
   * Check if this is a debug/test build.
   * Returns true if debug mode is enabled.
   */
  isDebugMode(): boolean;

  /**
   * Send any unsent crash reports immediately.
   * Normally crashes are sent on next app launch.
   */
  sendUnsentReports(): Promise<void>;

  /**
   * Delete any unsent crash reports.
   * Use with caution - data will be lost.
   */
  deleteUnsentReports(): Promise<void>;

  /**
   * Check if there are unsent reports from a previous crash.
   */
  didCrashOnPreviousExecution(): Promise<boolean>;
}

// ============================================
// NO-OP ADAPTER (SSR/Testing)
// ============================================

/**
 * No-op Crashlytics adapter for SSR and testing.
 * All methods are safe no-ops that don't throw.
 *
 * @example
 * ```typescript
 * // Use in SSR or tests
 * const crashlytics = createNoOpCrashlyticsAdapter();
 * ```
 */
export function createNoOpCrashlyticsAdapter(): CrashlyticsAdapter {
  let _debug = false;

  return {
    async initialize(config) {
      _debug = config?.debug ?? false;
      if (_debug) {
        console.debug('[Crashlytics:NoOp] Initialized (no-op mode)');
      }
    },

    async isEnabled() {
      return false;
    },

    async setEnabled(_enabled) {
      // No-op
    },

    isReady() {
      return true; // Always "ready" (just does nothing)
    },

    async setUserId(userId) {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] setUserId:', userId);
      }
    },

    async setUser(user) {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] setUser:', user);
      }
    },

    async clearUser() {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] clearUser');
      }
    },

    async setCustomKey(key, value) {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] setCustomKey:', key, value);
      }
    },

    async setCustomKeys(keys) {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] setCustomKeys:', keys);
      }
    },

    async addBreadcrumb(breadcrumb) {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] addBreadcrumb:', breadcrumb);
      }
    },

    async log(message) {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] log:', message);
      }
    },

    async recordException(exception) {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] recordException:', exception);
      }
    },

    async recordError(error, severity) {
      if (_debug) {
        console.debug('[Crashlytics:NoOp] recordError:', error.message, severity);
      }
    },

    async crash() {
      console.warn('[Crashlytics:NoOp] crash() called but ignored in no-op mode');
    },

    isDebugMode() {
      return _debug;
    },

    async sendUnsentReports() {
      // No-op
    },

    async deleteUnsentReports() {
      // No-op
    },

    async didCrashOnPreviousExecution() {
      return false;
    },
  };
}

// ============================================
// MEMORY ADAPTER (Testing with recording)
// ============================================

/**
 * In-memory Crashlytics adapter for testing.
 * Records all crashes for assertion.
 *
 * @example
 * ```typescript
 * const crashlytics = createMemoryCrashlyticsAdapter();
 * // ... trigger errors ...
 * expect(crashlytics.getRecordedExceptions()).toHaveLength(1);
 * ```
 */
export interface MemoryCrashlyticsAdapter extends CrashlyticsAdapter {
  /** Get all recorded exceptions */
  getRecordedExceptions(): CrashException[];

  /** Get all recorded breadcrumbs */
  getRecordedBreadcrumbs(): CrashBreadcrumb[];

  /** Get all recorded custom keys */
  getRecordedCustomKeys(): CrashCustomKeys;

  /** Get current user */
  getCurrentUser(): CrashUser | null;

  /** Clear all recorded data */
  clear(): void;
}

export function createMemoryCrashlyticsAdapter(): MemoryCrashlyticsAdapter {
  let _enabled = true;
  let _debug = false;
  let _ready = false;
  let _user: CrashUser | null = null;
  const _customKeys: CrashCustomKeys = {};
  const _breadcrumbs: CrashBreadcrumb[] = [];
  const _exceptions: CrashException[] = [];

  return {
    async initialize(config) {
      _debug = config?.debug ?? false;
      _enabled = config?.enabled ?? true;
      _ready = true;

      if (config?.initialCustomKeys) {
        Object.assign(_customKeys, config.initialCustomKeys);
      }
    },

    async isEnabled() {
      return _enabled;
    },

    async setEnabled(enabled) {
      _enabled = enabled;
    },

    isReady() {
      return _ready;
    },

    async setUserId(userId) {
      _user = { userId };
    },

    async setUser(user) {
      _user = user;
    },

    async clearUser() {
      _user = null;
    },

    async setCustomKey(key, value) {
      _customKeys[key] = value;
    },

    async setCustomKeys(keys) {
      Object.assign(_customKeys, keys);
    },

    async addBreadcrumb(breadcrumb) {
      _breadcrumbs.push({
        ...breadcrumb,
        timestamp: breadcrumb.timestamp ?? new Date().toISOString(),
      });
    },

    async log(message) {
      _breadcrumbs.push({
        type: 'console',
        message,
        timestamp: new Date().toISOString(),
      });
    },

    async recordException(exception) {
      if (_enabled) {
        _exceptions.push(exception);
      }
    },

    async recordError(error, severity) {
      if (_enabled) {
        _exceptions.push({
          message: error.message,
          name: error.name,
          stacktrace: error.stack,
          severity: severity ?? 'error',
        });
      }
    },

    async crash() {
      throw new Error('[Crashlytics:Memory] Test crash triggered');
    },

    isDebugMode() {
      return _debug;
    },

    async sendUnsentReports() {
      // No-op for memory adapter
    },

    async deleteUnsentReports() {
      _exceptions.length = 0;
    },

    async didCrashOnPreviousExecution() {
      return false;
    },

    // Memory adapter specific methods
    getRecordedExceptions() {
      return [..._exceptions];
    },

    getRecordedBreadcrumbs() {
      return [..._breadcrumbs];
    },

    getRecordedCustomKeys() {
      return { ..._customKeys };
    },

    getCurrentUser() {
      return _user;
    },

    clear() {
      _exceptions.length = 0;
      _breadcrumbs.length = 0;
      Object.keys(_customKeys).forEach((k) => delete _customKeys[k]);
      _user = null;
    },
  };
}
