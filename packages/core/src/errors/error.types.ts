/**
 * @fileoverview API Error Types - Platform Agnostic
 * @module @nxt1/core/errors
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Enterprise-grade error type definitions for consistent error handling
 * across all platforms: Web, Mobile, Backend, Functions.
 *
 * Design Philosophy:
 * - Machine-readable error codes for programmatic handling
 * - Human-readable messages for UI display
 * - Structured metadata for debugging and logging
 * - Type-safe error discrimination
 *
 * @example
 * ```typescript
 * // Backend creates error
 * throw createApiError('AUTH_TOKEN_EXPIRED', 'Your session has expired');
 *
 * // Frontend handles error
 * const result = await api.fetchData();
 * if (!result.success) {
 *   if (result.error.code === 'AUTH_TOKEN_EXPIRED') {
 *     redirectToLogin();
 *   }
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { ApiErrorCode } from './error.constants';

// ============================================
// ERROR SEVERITY LEVELS
// ============================================

/**
 * Error severity for logging and monitoring
 * - critical: System down, immediate attention required
 * - error: Operation failed, user impacted
 * - warning: Degraded experience, but recoverable
 * - info: Informational, expected errors (e.g., validation)
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

// ============================================
// ERROR CATEGORIES
// ============================================

/**
 * High-level error categories for routing and handling
 */
export type ErrorCategory =
  | 'authentication' // Auth/session issues
  | 'authorization' // Permission issues
  | 'validation' // Input validation failures
  | 'resource' // Resource not found, conflicts
  | 'rate_limit' // Throttling
  | 'payment' // Payment/subscription issues
  | 'external' // Third-party service failures
  | 'server' // Internal server errors
  | 'network' // Network/connectivity issues
  | 'client'; // Client-side errors

// ============================================
// VALIDATION ERROR DETAIL
// ============================================

/**
 * Detailed validation error for a specific field
 */
export interface FieldError {
  /** Field name (supports nested paths: 'profile.firstName') */
  field: string;
  /** User-friendly error message */
  message: string;
  /** Machine-readable validation rule that failed */
  rule: string;
  /** The invalid value (sanitized for logging) */
  value?: unknown;
}

// ============================================
// API ERROR STRUCTURE
// ============================================

/**
 * Standardized API error object
 *
 * This structure is returned by all API endpoints when an error occurs.
 * Frontend code can rely on this consistent shape for error handling.
 */
export interface ApiErrorDetail {
  /** Machine-readable error code (e.g., 'AUTH_TOKEN_EXPIRED') */
  code: ApiErrorCode;

  /** User-friendly error message (safe to display in UI) */
  message: string;

  /** Error category for routing to appropriate handler */
  category: ErrorCategory;

  /** HTTP status code */
  statusCode: number;

  /** Severity level for logging/monitoring */
  severity: ErrorSeverity;

  /** Field-level validation errors (for validation failures) */
  fields?: FieldError[];

  /** Additional context for debugging (not shown to users) */
  details?: Record<string, unknown>;

  /** Unique error instance ID for support/debugging */
  traceId?: string;

  /** ISO timestamp when error occurred */
  timestamp: string;

  /** Suggested action for the client */
  action?: ErrorAction;

  /** Retry information for transient errors */
  retry?: RetryInfo;
}

/**
 * Suggested client action for error recovery
 */
export type ErrorAction =
  | 'retry' // Retry the request
  | 'refresh_auth' // Refresh authentication
  | 'login' // Redirect to login
  | 'contact_support' // Show support contact
  | 'upgrade' // Prompt for upgrade
  | 'wait' // Rate limited, wait
  | 'fix_input' // Fix validation errors
  | 'none'; // No action needed

/**
 * Retry information for transient errors
 */
export interface RetryInfo {
  /** Whether the error is retryable */
  retryable: boolean;
  /** Suggested delay before retry (ms) */
  retryAfter?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Successful API response
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

/**
 * Error API response
 */
export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Response metadata (pagination, timing, etc.)
 */
export interface ResponseMeta {
  /** Request ID for tracing */
  requestId?: string;
  /** Response time in ms */
  responseTime?: number;
  /** Pagination info */
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

// ============================================
// ERROR CLASS
// ============================================

/**
 * Custom error class for API errors
 *
 * Extends native Error with structured error information.
 * Use this to throw typed errors that can be caught and converted
 * to ApiErrorResponse.
 *
 * @example
 * ```typescript
 * throw new NxtApiError('AUTH_TOKEN_EXPIRED', 'Your session has expired');
 *
 * // In error handler
 * if (error instanceof NxtApiError) {
 *   return res.status(error.statusCode).json(error.toResponse());
 * }
 * ```
 */
export class NxtApiError extends Error {
  readonly code: ApiErrorCode;
  readonly category: ErrorCategory;
  readonly statusCode: number;
  readonly severity: ErrorSeverity;
  readonly fields?: FieldError[];
  readonly details?: Record<string, unknown>;
  readonly action?: ErrorAction;
  readonly retry?: RetryInfo;
  readonly traceId: string;
  readonly timestamp: string;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: Partial<{
      category: ErrorCategory;
      statusCode: number;
      severity: ErrorSeverity;
      fields: FieldError[];
      details: Record<string, unknown>;
      action: ErrorAction;
      retry: RetryInfo;
      traceId: string;
    }> = {}
  ) {
    super(message);
    this.name = 'NxtApiError';
    this.code = code;
    this.category = options.category ?? 'server';
    this.statusCode = options.statusCode ?? 500;
    this.severity = options.severity ?? 'error';
    this.fields = options.fields;
    this.details = options.details;
    this.action = options.action;
    this.retry = options.retry;
    this.traceId = options.traceId ?? generateTraceId();
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where error was thrown (V8 engines only)
    const ErrorCtor = Error as {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      captureStackTrace?: (error: Error, constructor: Function) => void;
    };
    if (typeof ErrorCtor.captureStackTrace === 'function') {
      ErrorCtor.captureStackTrace(this, NxtApiError);
    }
  }

  /**
   * Convert to API error response format
   */
  toResponse(): ApiErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        category: this.category,
        statusCode: this.statusCode,
        severity: this.severity,
        fields: this.fields,
        details: this.details,
        action: this.action,
        retry: this.retry,
        traceId: this.traceId,
        timestamp: this.timestamp,
      },
    };
  }

  /**
   * Create a JSON-serializable object
   */
  toJSON(): ApiErrorDetail {
    return this.toResponse().error;
  }
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a value is an ApiErrorResponse
 */
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (obj['success'] !== false) return false;
  const error = obj['error'];
  if (!error || typeof error !== 'object') return false;
  const errorObj = error as Record<string, unknown>;
  return typeof errorObj['code'] === 'string' && typeof errorObj['message'] === 'string';
}

/**
 * Check if a value is an ApiSuccessResponse
 */
export function isApiSuccessResponse<T>(value: unknown): value is ApiSuccessResponse<T> {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return obj['success'] === true && 'data' in obj;
}

/**
 * Check if an error is an NxtApiError instance
 */
export function isNxtApiError(error: unknown): error is NxtApiError {
  return error instanceof NxtApiError;
}

/**
 * Check if an error has a specific code
 */
export function hasErrorCode(error: unknown, code: ApiErrorCode): boolean {
  if (isNxtApiError(error)) {
    return error.code === code;
  }
  if (isApiErrorResponse(error)) {
    return error.error.code === code;
  }
  return false;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a unique trace ID for error tracking
 * Format: nxt_[timestamp]_[random]
 */
function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `nxt_${timestamp}_${random}`;
}

/**
 * Extract trace ID from a trace ID string (exported for testing)
 */
export { generateTraceId };
