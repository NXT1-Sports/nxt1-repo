/**
 * @fileoverview Unified AppError Contract
 * @module @nxt1/core/crashlytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Provides a standardized error contract for crash reporting across all platforms.
 * This unified structure ensures consistent error handling, context preservation,
 * and Crashlytics integration.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { CrashCategory, CrashSeverity } from './crashlytics.types';

// ============================================
// APP ERROR INTERFACE
// ============================================

/**
 * Unified error contract for NXT1 applications.
 *
 * This interface provides a standardized structure for all errors
 * that should be reported to Crashlytics, ensuring consistent
 * context and metadata across platforms.
 *
 * @example
 * ```typescript
 * // Create from a caught error
 * const appError = createAppError(error, {
 *   context: { userId: 'abc123', screen: 'profile' },
 *   isFatal: false,
 * });
 *
 * // Report to crashlytics
 * await crashlytics.recordAppError(appError);
 * ```
 */
export interface AppError {
  /** Unique error identifier for tracking */
  id: string;

  /** User-friendly error message (PII-scrubbed) */
  message: string;

  /** Machine-readable error code */
  code: string;

  /** Error category for filtering/grouping */
  category: CrashCategory;

  /** Severity level for prioritization */
  severity: CrashSeverity;

  /** Whether this error crashed the app */
  isFatal: boolean;

  /** Original error object (for stack trace) */
  originalError?: Error;

  /** Stack trace string (PII-scrubbed) */
  stacktrace?: string;

  /** Contextual metadata (PII-scrubbed) */
  context: AppErrorContext;

  /** ISO timestamp when error occurred */
  timestamp: string;

  /** Source of the error */
  source: AppErrorSource;
}

/**
 * Contextual metadata attached to errors
 */
export interface AppErrorContext {
  /** Current user ID (if authenticated) */
  userId?: string;

  /** User's role (athlete, coach, etc.) */
  userRole?: string;

  /** Current screen/route name */
  screenName?: string;

  /** Previous screen (for navigation context) */
  previousScreen?: string;

  /** Workspace/team ID */
  workspaceId?: string;

  /** Active sport being viewed */
  activeSport?: string;

  /** HTTP request details (for API errors) */
  request?: {
    method: string;
    url: string;
    status?: number;
    duration?: number;
  };

  /** Component that threw the error */
  component?: string;

  /** Action user was performing */
  userAction?: string;

  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Source classification of the error
 */
export type AppErrorSource =
  | 'component' // Angular component error
  | 'service' // Service/business logic error
  | 'http' // HTTP/API error
  | 'navigation' // Router/navigation error
  | 'guard' // Route guard error
  | 'resolver' // Route resolver error
  | 'interceptor' // HTTP interceptor error
  | 'global' // Global uncaught error
  | 'native' // Native platform error
  | 'unknown'; // Unknown source

// ============================================
// APP ERROR CREATION OPTIONS
// ============================================

/**
 * Options for creating an AppError
 */
export interface CreateAppErrorOptions {
  /** Error code override */
  code?: string;

  /** Category override */
  category?: CrashCategory;

  /** Severity override */
  severity?: CrashSeverity;

  /** Whether the error is fatal */
  isFatal?: boolean;

  /** Contextual metadata */
  context?: Partial<AppErrorContext>;

  /** Error source */
  source?: AppErrorSource;
}

// ============================================
// APP ERROR FACTORY
// ============================================

/**
 * Generate a unique error ID
 */
function generateErrorId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `err_${timestamp}_${random}`;
}

/**
 * Extract error code from various error types
 */
function extractErrorCode(error: unknown): string {
  if (error instanceof Error) {
    // Check for custom code property
    const anyError = error as Error & { code?: string };
    if (anyError.code) return anyError.code;

    // Check for HTTP status in name
    if (error.name === 'HttpErrorResponse') return 'HTTP_ERROR';
    if (error.name === 'TimeoutError') return 'TIMEOUT';
    if (error.name === 'AbortError') return 'ABORTED';

    // Use error name as fallback
    return error.name.toUpperCase().replace(/ERROR$/, '_ERROR');
  }

  return 'UNKNOWN_ERROR';
}

/**
 * Determine error category from error type
 */
function determineCategory(error: unknown, code: string): CrashCategory {
  const lowerCode = code.toLowerCase();
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  // Auth errors
  if (
    lowerCode.includes('auth') ||
    lowerCode.includes('unauthorized') ||
    lowerCode.includes('forbidden') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return 'authentication';
  }

  // Network errors
  if (
    lowerCode.includes('network') ||
    lowerCode.includes('fetch') ||
    lowerCode.includes('http') ||
    lowerCode.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch')
  ) {
    return 'network';
  }

  // Navigation errors
  if (
    lowerCode.includes('route') ||
    lowerCode.includes('navigate') ||
    lowerCode.includes('chunk') ||
    message.includes('chunk')
  ) {
    return 'navigation';
  }

  // Storage errors
  if (
    lowerCode.includes('storage') ||
    lowerCode.includes('quota') ||
    message.includes('storage') ||
    message.includes('indexeddb')
  ) {
    return 'storage';
  }

  // Payment errors
  if (
    lowerCode.includes('payment') ||
    lowerCode.includes('stripe') ||
    message.includes('payment')
  ) {
    return 'payment';
  }

  // Media errors
  if (lowerCode.includes('media') || lowerCode.includes('image') || lowerCode.includes('video')) {
    return 'media';
  }

  // UI errors
  if (
    lowerCode.includes('render') ||
    lowerCode.includes('template') ||
    message.includes('expressionchanged')
  ) {
    return 'ui';
  }

  return 'javascript';
}

/**
 * Determine severity from error characteristics
 */
function determineSeverity(error: unknown, isFatal: boolean): CrashSeverity {
  if (isFatal) return 'fatal';

  const message = error instanceof Error ? error.message.toLowerCase() : '';

  // Warnings (expected/recoverable)
  if (
    message.includes('aborted') ||
    message.includes('cancelled') ||
    message.includes('timeout') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('404')
  ) {
    return 'warning';
  }

  return 'error';
}

/**
 * Create a unified AppError from any error type
 *
 * @param error - The original error (Error object, string, or unknown)
 * @param options - Optional configuration
 * @returns A standardized AppError object
 *
 * @example
 * ```typescript
 * try {
 *   await api.fetchProfile();
 * } catch (error) {
 *   const appError = createAppError(error, {
 *     context: { userId: user.uid, screenName: 'profile' },
 *     source: 'service',
 *   });
 *   await crashlytics.recordAppError(appError);
 * }
 * ```
 */
export function createAppError(error: unknown, options: CreateAppErrorOptions = {}): AppError {
  const {
    code: codeOverride,
    category: categoryOverride,
    severity: severityOverride,
    isFatal = false,
    context = {},
    source = 'unknown',
  } = options;

  // Extract base error info
  const originalError = error instanceof Error ? error : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred';

  const code = codeOverride ?? extractErrorCode(error);
  const category = categoryOverride ?? determineCategory(error, code);
  const severity = severityOverride ?? determineSeverity(error, isFatal);

  return {
    id: generateErrorId(),
    message,
    code,
    category,
    severity,
    isFatal,
    originalError,
    stacktrace: originalError?.stack,
    context: context as AppErrorContext,
    timestamp: new Date().toISOString(),
    source,
  };
}

/**
 * Create an AppError from an HTTP error response
 */
export function createHttpAppError(
  error: unknown,
  request: { method: string; url: string; status?: number; duration?: number },
  options: Omit<CreateAppErrorOptions, 'source'> = {}
): AppError {
  return createAppError(error, {
    ...options,
    source: 'http',
    context: {
      ...options.context,
      request,
    },
  });
}

/**
 * Create an AppError from a navigation error
 */
export function createNavigationAppError(
  error: unknown,
  from: string,
  to: string,
  options: Omit<CreateAppErrorOptions, 'source' | 'category'> = {}
): AppError {
  return createAppError(error, {
    ...options,
    source: 'navigation',
    category: 'navigation',
    context: {
      ...options.context,
      previousScreen: from,
      screenName: to,
    },
  });
}

/**
 * Create an AppError from a component error
 */
export function createComponentAppError(
  error: unknown,
  componentName: string,
  userAction?: string,
  options: Omit<CreateAppErrorOptions, 'source'> = {}
): AppError {
  return createAppError(error, {
    ...options,
    source: 'component',
    context: {
      ...options.context,
      component: componentName,
      userAction,
    },
  });
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if an object is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'id' in error &&
    'message' in error &&
    'code' in error &&
    'category' in error &&
    'severity' in error &&
    'isFatal' in error &&
    'timestamp' in error
  );
}
