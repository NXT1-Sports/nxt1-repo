/**
 * @fileoverview Crashlytics Constants
 * @module @nxt1/core/crashlytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Standard constants for crash reporting across all platforms.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// CUSTOM KEY NAMES (Standardized)
// ============================================

/**
 * Standardized custom key names for Crashlytics.
 * Use these constants to ensure consistent naming across platforms.
 *
 * @example
 * ```typescript
 * crashlytics.setCustomKey(CRASH_KEYS.USER_ROLE, 'athlete');
 * crashlytics.setCustomKey(CRASH_KEYS.SCREEN_NAME, 'profile/123');
 * ```
 */
export const CRASH_KEYS = {
  // User context
  USER_ROLE: 'user_role',
  USER_ID: 'user_id',

  // App context
  APP_VERSION: 'app_version',
  BUILD_NUMBER: 'build_number',
  ENVIRONMENT: 'environment',

  // Session context
  SCREEN_NAME: 'screen_name',
  PREVIOUS_SCREEN: 'previous_screen',
  SESSION_DURATION_MS: 'session_duration_ms',

  // Network context
  CONNECTION_TYPE: 'connection_type',
  IS_OFFLINE: 'is_offline',
  LAST_API_SUCCESS: 'last_api_success',

  // Device context
  DEVICE_MEMORY_MB: 'device_memory_mb',
  DEVICE_STORAGE_FREE_MB: 'device_storage_free_mb',

  // Feature flags
  FEATURE_FLAGS: 'feature_flags',

  // NXT1 specific
  ACTIVE_SPORT: 'active_sport',
  ACTIVE_TEAM_ID: 'active_team_id',
  ONBOARDING_STEP: 'onboarding_step',
} as const;

export type CrashKeyName = (typeof CRASH_KEYS)[keyof typeof CRASH_KEYS];

// ============================================
// ERROR CATEGORIES
// ============================================

/**
 * Error category mapping for consistent categorization.
 * Maps error codes/patterns to categories.
 */
export const ERROR_CATEGORIES = {
  // Network errors
  NETWORK_TIMEOUT: 'network',
  NETWORK_OFFLINE: 'network',
  NETWORK_SERVER_ERROR: 'network',
  NETWORK_CONNECTION_FAILED: 'network',

  // Auth errors
  AUTH_TOKEN_EXPIRED: 'authentication',
  AUTH_INVALID_CREDENTIALS: 'authentication',
  AUTH_SESSION_INVALID: 'authentication',
  AUTH_UNAUTHORIZED: 'authentication',

  // Navigation errors
  ROUTE_NOT_FOUND: 'navigation',
  GUARD_REJECTED: 'navigation',
  LAZY_LOAD_FAILED: 'navigation',

  // UI errors
  RENDER_ERROR: 'ui',
  TEMPLATE_ERROR: 'ui',
  CHANGE_DETECTION_ERROR: 'ui',

  // Storage errors
  STORAGE_QUOTA_EXCEEDED: 'storage',
  STORAGE_ACCESS_DENIED: 'storage',
  CACHE_CORRUPTED: 'storage',

  // Payment errors
  PAYMENT_FAILED: 'payment',
  PAYMENT_CANCELLED: 'payment',
  SUBSCRIPTION_ERROR: 'payment',

  // Media errors
  IMAGE_LOAD_FAILED: 'media',
  VIDEO_PLAYBACK_ERROR: 'media',
  UPLOAD_FAILED: 'media',
} as const;

// ============================================
// SEVERITY THRESHOLDS
// ============================================

/**
 * HTTP status code to severity mapping
 */
export const HTTP_SEVERITY_MAP: Record<number, 'error' | 'warning' | 'info'> = {
  400: 'warning', // Bad request (user error)
  401: 'warning', // Unauthorized (expected flow)
  403: 'warning', // Forbidden (expected flow)
  404: 'info', // Not found (may be expected)
  408: 'warning', // Timeout
  429: 'warning', // Rate limited
  500: 'error', // Server error
  502: 'error', // Bad gateway
  503: 'error', // Service unavailable
  504: 'error', // Gateway timeout
};

/**
 * Get severity for an HTTP status code
 */
export function getSeverityForStatus(status: number): 'error' | 'warning' | 'info' {
  if (status in HTTP_SEVERITY_MAP) {
    return HTTP_SEVERITY_MAP[status];
  }
  if (status >= 500) return 'error';
  if (status >= 400) return 'warning';
  return 'info';
}

// ============================================
// BREADCRUMB LIMITS
// ============================================

/**
 * Maximum lengths for breadcrumb content
 */
export const BREADCRUMB_LIMITS = {
  /** Maximum message length */
  MAX_MESSAGE_LENGTH: 500,

  /** Maximum data JSON size (bytes) */
  MAX_DATA_SIZE: 4096,

  /** Maximum breadcrumbs to retain */
  MAX_BREADCRUMBS: 100,

  /** Maximum custom key value length */
  MAX_CUSTOM_KEY_VALUE_LENGTH: 1024,
} as const;

// ============================================
// MASKED/FILTERED KEYS
// ============================================

/**
 * Keys that should be masked/filtered from crash reports
 * for privacy and security.
 */
export const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'api_key',
  'apiKey',
  'authorization',
  'auth',
  'credit_card',
  'creditCard',
  'ssn',
  'social_security',
  'bank_account',
  'bankAccount',
] as const;

/**
 * Check if a key should be masked for privacy
 */
export function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive.toLowerCase()));
}

/**
 * Mask sensitive values in an object
 */
export function maskSensitiveData<T extends Record<string, unknown>>(data: T): T {
  const masked = { ...data };

  for (const key of Object.keys(masked)) {
    if (isSensitiveKey(key)) {
      masked[key as keyof T] = '[REDACTED]' as T[keyof T];
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key as keyof T] = maskSensitiveData(
        masked[key] as Record<string, unknown>
      ) as T[keyof T];
    }
  }

  return masked;
}

// ============================================
// GOOGLE ANALYTICS 4 EVENT NAMES
// ============================================

/**
 * GA4 event names for web crashlytics fallback.
 * Firebase recommends using 'exception' event for errors.
 */
export const GA4_EVENTS = {
  /** Standard GA4 exception event */
  EXCEPTION: 'exception',

  /** Custom event for non-fatal errors */
  APP_ERROR: 'app_error',

  /** Custom event for warnings */
  APP_WARNING: 'app_warning',
} as const;
