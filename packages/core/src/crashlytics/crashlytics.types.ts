/**
 * @fileoverview Crashlytics Types - Platform Agnostic
 * @module @nxt1/core/crashlytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Enterprise-grade type definitions for crash reporting across all platforms:
 * - Mobile (iOS/Android) via @capacitor-firebase/crashlytics
 * - Web via Google Analytics 4 exception events
 * - Backend via Google Cloud Error Reporting
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// CRASH SEVERITY LEVELS
// ============================================

/**
 * Crash severity for categorization and alerting
 *
 * - fatal: App crashed, user session ended
 * - error: Non-fatal error, user can continue
 * - warning: Potential issue, degraded experience
 * - info: Informational, for debugging only
 */
export type CrashSeverity = 'fatal' | 'error' | 'warning' | 'info';

// ============================================
// ERROR CATEGORIES
// ============================================

/**
 * High-level error categories for filtering and grouping
 */
export type CrashCategory =
  | 'javascript' // JS/TS runtime errors
  | 'network' // HTTP/API failures
  | 'authentication' // Auth failures
  | 'navigation' // Routing errors
  | 'ui' // UI rendering errors
  | 'storage' // Local storage/cache errors
  | 'payment' // Payment processing errors
  | 'media' // Image/video loading errors
  | 'native' // Native platform errors
  | 'unknown'; // Uncategorized errors

// ============================================
// CUSTOM KEYS
// ============================================

/**
 * Custom key-value pairs for crash context.
 * Keys should be short and descriptive.
 * Values must be strings, numbers, or booleans.
 */
export interface CrashCustomKeys {
  /** Current user role (athlete, coach, parent, etc.) */
  user_role?: string;

  /** Current user subscription tier */
  subscription_tier?: 'free' | 'pro' | 'elite';

  /** Active feature flag states */
  feature_flags?: string;

  /** Current app version */
  app_version?: string;

  /** Backend environment */
  backend_env?: 'production' | 'staging' | 'development';

  /** Current screen/route */
  screen_name?: string;

  /** Network connection type */
  connection_type?: string;

  /** Whether user is offline */
  is_offline?: boolean;

  /** Device memory (MB) */
  device_memory_mb?: number;

  /** Last successful API call timestamp */
  last_api_success?: string;

  /** Custom keys - extend as needed */
  [key: string]: string | number | boolean | undefined;
}

// ============================================
// BREADCRUMBS
// ============================================

/**
 * Breadcrumb type for categorizing user actions
 */
export type BreadcrumbType =
  | 'navigation' // Route changes
  | 'http' // API calls
  | 'ui' // Button clicks, form submissions
  | 'user' // Login, logout, profile updates
  | 'state' // State changes (Redux/signals)
  | 'console' // Console logs
  | 'error'; // Non-fatal errors

/**
 * A breadcrumb represents a user action leading up to a crash.
 * Firebase Crashlytics uses "logs" but breadcrumb is more descriptive.
 */
export interface CrashBreadcrumb {
  /** Type of breadcrumb for categorization */
  type: BreadcrumbType;

  /** Human-readable message */
  message: string;

  /** Additional data (will be JSON stringified) */
  data?: Record<string, unknown>;

  /** Timestamp (auto-generated if not provided) */
  timestamp?: string;
}

// ============================================
// EXCEPTION RECORD
// ============================================

/**
 * Structured exception for non-fatal error recording
 */
export interface CrashException {
  /** Error message (required) */
  message: string;

  /** Error code (e.g., 'AUTH_TOKEN_EXPIRED') */
  code?: string;

  /** Error name/type (e.g., 'TypeError', 'NetworkError') */
  name?: string;

  /** Stack trace (critical for debugging) */
  stacktrace?: string;

  /** Error category for filtering */
  category?: CrashCategory;

  /** Severity level */
  severity?: CrashSeverity;

  /** Additional context */
  context?: Record<string, unknown>;
}

// ============================================
// CRASHLYTICS CONFIG
// ============================================

/**
 * Configuration options for Crashlytics initialization
 */
export interface CrashlyticsConfig {
  /** Enable/disable crash collection (useful for dev/testing) */
  enabled?: boolean;

  /** Enable debug logging (verbose output) */
  debug?: boolean;

  /** Auto-collect breadcrumbs for navigation */
  collectNavigationBreadcrumbs?: boolean;

  /** Auto-collect breadcrumbs for HTTP requests */
  collectHttpBreadcrumbs?: boolean;

  /** Auto-collect console.error as breadcrumbs */
  collectConsoleBreadcrumbs?: boolean;

  /** Maximum number of breadcrumbs to retain */
  maxBreadcrumbs?: number;

  /** Custom keys to set on initialization */
  initialCustomKeys?: CrashCustomKeys;
}

/**
 * Default configuration values
 */
export const DEFAULT_CRASHLYTICS_CONFIG: Required<CrashlyticsConfig> = {
  enabled: true,
  debug: false,
  collectNavigationBreadcrumbs: true,
  collectHttpBreadcrumbs: true,
  collectConsoleBreadcrumbs: false, // Can be noisy
  maxBreadcrumbs: 100,
  initialCustomKeys: {},
};

// ============================================
// USER IDENTIFICATION
// ============================================

/**
 * User info for crash attribution
 */
export interface CrashUser {
  /** Firebase Auth UID */
  userId: string;

  /** Optional email (may be masked for privacy) */
  email?: string;

  /** Optional display name */
  displayName?: string;
}

// ============================================
// CRASH REPORT (FOR TESTING/LOGGING)
// ============================================

/**
 * Full crash report structure (for debugging/logging)
 */
export interface CrashReport {
  /** Unique crash ID */
  id: string;

  /** When the crash occurred */
  timestamp: string;

  /** Exception details */
  exception: CrashException;

  /** User info (if authenticated) */
  user?: CrashUser;

  /** Custom keys at time of crash */
  customKeys: CrashCustomKeys;

  /** Breadcrumbs leading to crash */
  breadcrumbs: CrashBreadcrumb[];

  /** Platform info */
  platform: {
    name: 'ios' | 'android' | 'web';
    version: string;
    isNative: boolean;
  };

  /** App info */
  app: {
    version: string;
    build: string;
    environment: string;
  };
}
