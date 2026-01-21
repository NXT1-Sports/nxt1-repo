/**
 * @fileoverview Error Factory Functions - Platform Agnostic
 * @module @nxt1/core/errors
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Factory functions and utilities for creating and handling API errors.
 * Used by both backend (to create errors) and frontend (to parse/handle errors).
 *
 * @example
 * ```typescript
 * // Backend: Create and throw errors
 * import { createApiError, validationError } from '@nxt1/core/errors';
 *
 * throw createApiError('AUTH_TOKEN_EXPIRED');
 * throw validationError([{ field: 'email', message: 'Invalid email', rule: 'email' }]);
 *
 * // Frontend: Parse and handle errors
 * import { parseApiError, getErrorMessage, shouldRetry } from '@nxt1/core/errors';
 *
 * const error = parseApiError(response);
 * if (shouldRetry(error)) {
 *   await delay(error.retry?.retryAfter ?? 5000);
 *   retry();
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import {
  NxtApiError,
  type ApiErrorResponse,
  type ApiErrorDetail,
  type FieldError,
  type ErrorAction,
  type RetryInfo,
  isApiErrorResponse,
  generateTraceId,
} from './error.types';

import { type ApiErrorCode, API_ERROR_CODES, getErrorConfig } from './error.constants';

// ============================================
// ERROR FACTORY FUNCTIONS
// ============================================

/**
 * Options for creating an API error
 */
export interface CreateApiErrorOptions {
  /** Custom message (overrides default) */
  message?: string;
  /** Field-level validation errors */
  fields?: FieldError[];
  /** Additional debug details */
  details?: Record<string, unknown>;
  /** Custom action override */
  action?: ErrorAction;
  /** Custom retry info */
  retry?: RetryInfo;
  /** Trace ID (auto-generated if not provided) */
  traceId?: string;
  /** Original error for logging */
  cause?: unknown;
}

/**
 * Create an NxtApiError with full configuration
 *
 * @param code - Error code from API_ERROR_CODES
 * @param options - Additional error options
 * @returns NxtApiError instance
 *
 * @example
 * ```typescript
 * // Simple error
 * throw createApiError('AUTH_TOKEN_EXPIRED');
 *
 * // With custom message
 * throw createApiError('VAL_INVALID_INPUT', {
 *   message: 'Username must be alphanumeric',
 *   fields: [{ field: 'username', message: 'Must be alphanumeric', rule: 'alphanumeric' }]
 * });
 * ```
 */
export function createApiError(
  code: ApiErrorCode,
  options: CreateApiErrorOptions = {}
): NxtApiError {
  const config = getErrorConfig(code);
  const message = options.message ?? config.defaultMessage;

  return new NxtApiError(code, message, {
    category: config.category,
    statusCode: config.statusCode,
    severity: config.severity,
    fields: options.fields,
    details: options.details,
    action: options.action ?? config.action,
    retry:
      options.retry ??
      (config.retryable
        ? { retryable: true, retryAfter: config.retryAfter, maxRetries: 3 }
        : { retryable: false }),
    traceId: options.traceId,
  });
}

/**
 * Create a validation error with field details
 *
 * @param fields - Array of field errors
 * @param message - Optional custom message
 * @returns NxtApiError for validation failure
 *
 * @example
 * ```typescript
 * throw validationError([
 *   { field: 'email', message: 'Invalid email format', rule: 'email' },
 *   { field: 'password', message: 'Password too short', rule: 'minLength' },
 * ]);
 * ```
 */
export function validationError(fields: FieldError[], message?: string): NxtApiError {
  const defaultMsg =
    fields.length === 1 ? fields[0].message : 'Please fix the errors below and try again.';

  return createApiError('VAL_INVALID_INPUT', {
    message: message ?? defaultMsg,
    fields,
  });
}

/**
 * Create a single field validation error
 *
 * @param field - Field name
 * @param message - Error message
 * @param rule - Validation rule that failed
 * @returns NxtApiError for single field validation failure
 */
export function fieldError(field: string, message: string, rule: string = 'invalid'): NxtApiError {
  return validationError([{ field, message, rule }]);
}

/**
 * Create a "not found" error for a resource type
 *
 * @param resourceType - Type of resource (e.g., 'user', 'team', 'post')
 * @param identifier - Resource identifier (for logging)
 * @returns NxtApiError for resource not found
 */
export function notFoundError(resourceType: string, identifier?: string): NxtApiError {
  // Map common resource types to specific error codes
  const codeMap: Record<string, ApiErrorCode> = {
    user: 'RES_USER_NOT_FOUND',
    profile: 'RES_PROFILE_NOT_FOUND',
    team: 'RES_TEAM_NOT_FOUND',
    post: 'RES_POST_NOT_FOUND',
    'team code': 'RES_TEAM_CODE_NOT_FOUND',
    team_code: 'RES_TEAM_CODE_NOT_FOUND',
    teamcode: 'RES_TEAM_CODE_NOT_FOUND',
    college: 'RES_COLLEGE_NOT_FOUND',
  };

  const code = codeMap[resourceType.toLowerCase()] ?? 'RES_NOT_FOUND';
  const message = code === 'RES_NOT_FOUND' ? `${capitalize(resourceType)} not found.` : undefined;

  return createApiError(code, {
    message,
    details: identifier ? { identifier } : undefined,
  });
}

/**
 * Create an "already exists" conflict error
 *
 * @param resourceType - Type of resource
 * @param field - Field that caused the conflict
 * @returns NxtApiError for resource conflict
 */
export function conflictError(resourceType: string, field?: string): NxtApiError {
  const codeMap: Record<string, ApiErrorCode> = {
    email: 'RES_EMAIL_EXISTS',
    username: 'RES_USERNAME_EXISTS',
  };

  const code = field
    ? (codeMap[field.toLowerCase()] ?? 'RES_ALREADY_EXISTS')
    : 'RES_ALREADY_EXISTS';
  const message =
    code === 'RES_ALREADY_EXISTS'
      ? `A ${resourceType} with this ${field ?? 'identifier'} already exists.`
      : undefined;

  return createApiError(code, { message });
}

/**
 * Create an unauthorized error
 *
 * @param reason - Specific reason for unauthorized access
 * @returns NxtApiError for authentication failure
 */
export function unauthorizedError(
  reason: 'missing' | 'invalid' | 'expired' | 'revoked' = 'invalid'
): NxtApiError {
  const codeMap: Record<string, ApiErrorCode> = {
    missing: 'AUTH_TOKEN_MISSING',
    invalid: 'AUTH_TOKEN_INVALID',
    expired: 'AUTH_TOKEN_EXPIRED',
    revoked: 'AUTH_TOKEN_REVOKED',
  };

  return createApiError(codeMap[reason]);
}

/**
 * Create a forbidden error
 *
 * @param reason - Specific reason for forbidden access
 * @returns NxtApiError for authorization failure
 */
export function forbiddenError(
  reason: 'permission' | 'owner' | 'premium' | 'role' | 'team' | 'admin' = 'permission'
): NxtApiError {
  const codeMap: Record<string, ApiErrorCode> = {
    permission: 'AUTHZ_FORBIDDEN',
    owner: 'AUTHZ_NOT_OWNER',
    premium: 'AUTHZ_PREMIUM_REQUIRED',
    role: 'AUTHZ_ROLE_INSUFFICIENT',
    team: 'AUTHZ_TEAM_REQUIRED',
    admin: 'AUTHZ_ADMIN_REQUIRED',
  };

  return createApiError(codeMap[reason]);
}

/**
 * Create a rate limit error
 *
 * @param retryAfter - Seconds until retry is allowed
 * @param type - Type of rate limit
 * @returns NxtApiError for rate limiting
 */
export function rateLimitError(
  retryAfter: number = 60,
  type: 'api' | 'login' | 'password' | 'email' | 'daily' = 'api'
): NxtApiError {
  const codeMap: Record<string, ApiErrorCode> = {
    api: 'RATE_API_REQUESTS',
    login: 'RATE_LOGIN_ATTEMPTS',
    password: 'RATE_PASSWORD_RESET',
    email: 'RATE_EMAIL_SENDS',
    daily: 'RATE_DAILY_LIMIT',
  };

  return createApiError(codeMap[type], {
    retry: {
      retryable: true,
      retryAfter: retryAfter * 1000,
      maxRetries: 1,
    },
  });
}

/**
 * Create an internal server error
 *
 * @param cause - Original error for logging
 * @returns NxtApiError for internal error
 */
export function internalError(cause?: unknown): NxtApiError {
  const error = createApiError('SRV_INTERNAL_ERROR', {
    details: cause ? { originalError: String(cause) } : undefined,
  });

  // Store original error for logging but don't expose to client
  if (cause) {
    (error as unknown as Record<string, unknown>)['_cause'] = cause;
  }

  return error;
}

/**
 * Create an external service error
 *
 * @param service - Name of the external service
 * @param cause - Original error
 * @returns NxtApiError for external service failure
 */
export function externalServiceError(
  service: 'firebase' | 'stripe' | 'paypal' | 'email' | 'storage' | 'ai' | 'generic' = 'generic',
  cause?: unknown
): NxtApiError {
  const codeMap: Record<string, ApiErrorCode> = {
    firebase: 'EXT_FIREBASE_ERROR',
    stripe: 'EXT_STRIPE_ERROR',
    paypal: 'EXT_PAYPAL_ERROR',
    email: 'EXT_EMAIL_ERROR',
    storage: 'EXT_STORAGE_ERROR',
    ai: 'EXT_AI_ERROR',
    generic: 'EXT_SERVICE_ERROR',
  };

  return createApiError(codeMap[service], {
    details: cause ? { service, originalError: String(cause) } : { service },
  });
}

// ============================================
// ERROR PARSING FUNCTIONS
// ============================================

/**
 * Parse an unknown error into a standardized ApiErrorDetail
 *
 * Handles:
 * - NxtApiError instances
 * - ApiErrorResponse objects
 * - HTTP response objects
 * - Native Error objects
 * - String errors
 * - Unknown errors
 *
 * @param error - Any error value
 * @returns Standardized ApiErrorDetail
 *
 * @example
 * ```typescript
 * try {
 *   await api.fetchData();
 * } catch (err) {
 *   const error = parseApiError(err);
 *   showToast(error.message);
 * }
 * ```
 */
export function parseApiError(error: unknown): ApiErrorDetail {
  // Already an NxtApiError
  if (error instanceof NxtApiError) {
    return error.toJSON();
  }

  // ApiErrorResponse object
  if (isApiErrorResponse(error)) {
    return error.error;
  }

  // Object with error property (common HTTP client format)
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;

    // Axios/fetch error response
    if (obj['response'] && typeof obj['response'] === 'object') {
      const response = obj['response'] as Record<string, unknown>;
      if (isApiErrorResponse(response['data'])) {
        return (response['data'] as ApiErrorResponse).error;
      }
    }

    // Direct error object
    if (typeof obj['code'] === 'string' && typeof obj['message'] === 'string') {
      const code = isValidErrorCode(obj['code'] as string)
        ? (obj['code'] as ApiErrorCode)
        : 'SRV_UNKNOWN';
      const config = getErrorConfig(code);
      return {
        code,
        message: obj['message'] as string,
        category: config.category,
        statusCode: config.statusCode,
        severity: config.severity,
        action: config.action,
        retry: config.retryable
          ? { retryable: true, retryAfter: config.retryAfter }
          : { retryable: false },
        traceId: generateTraceId(),
        timestamp: new Date().toISOString(),
      };
    }

    // Native Error
    if (obj instanceof Error) {
      return {
        code: 'SRV_UNKNOWN',
        message: obj.message || 'An unexpected error occurred.',
        category: 'server',
        statusCode: 500,
        severity: 'error',
        action: 'retry',
        retry: { retryable: true, retryAfter: 5000 },
        traceId: generateTraceId(),
        timestamp: new Date().toISOString(),
      };
    }
  }

  // String error
  if (typeof error === 'string') {
    return {
      code: 'SRV_UNKNOWN',
      message: error,
      category: 'server',
      statusCode: 500,
      severity: 'error',
      action: 'retry',
      retry: { retryable: true, retryAfter: 5000 },
      traceId: generateTraceId(),
      timestamp: new Date().toISOString(),
    };
  }

  // Unknown error type
  return {
    code: 'SRV_UNKNOWN',
    message: 'An unexpected error occurred. Please try again.',
    category: 'server',
    statusCode: 500,
    severity: 'error',
    action: 'retry',
    retry: { retryable: true, retryAfter: 5000 },
    traceId: generateTraceId(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get the user-friendly error message from any error
 *
 * @param error - Any error value
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  return parseApiError(error).message;
}

/**
 * Get the error code from any error
 *
 * @param error - Any error value
 * @returns Error code
 */
export function getErrorCode(error: unknown): ApiErrorCode {
  return parseApiError(error).code;
}

/**
 * Check if an error should trigger a retry
 *
 * @param error - Any error value
 * @returns True if error is retryable
 */
export function shouldRetry(error: unknown): boolean {
  const parsed = parseApiError(error);
  return parsed.retry?.retryable ?? false;
}

/**
 * Get the retry delay for an error (in ms)
 *
 * @param error - Any error value
 * @returns Retry delay in milliseconds, or 0 if not retryable
 */
export function getRetryDelay(error: unknown): number {
  const parsed = parseApiError(error);
  return parsed.retry?.retryable ? (parsed.retry.retryAfter ?? 5000) : 0;
}

/**
 * Check if error requires user to re-authenticate
 *
 * @param error - Any error value
 * @returns True if user should be redirected to login
 */
export function requiresAuth(error: unknown): boolean {
  const parsed = parseApiError(error);
  return parsed.action === 'login' || parsed.action === 'refresh_auth';
}

/**
 * Check if error requires premium upgrade
 *
 * @param error - Any error value
 * @returns True if premium upgrade is needed
 */
export function requiresUpgrade(error: unknown): boolean {
  const parsed = parseApiError(error);
  return parsed.action === 'upgrade';
}

/**
 * Check if error is a validation error
 *
 * @param error - Any error value
 * @returns True if error is validation-related
 */
export function isValidationError(error: unknown): boolean {
  const parsed = parseApiError(error);
  return parsed.category === 'validation';
}

/**
 * Get field errors from a validation error
 *
 * @param error - Any error value
 * @returns Array of field errors, or empty array if not a validation error
 */
export function getFieldErrors(error: unknown): FieldError[] {
  const parsed = parseApiError(error);
  return parsed.fields ?? [];
}

/**
 * Get error for a specific field from API error
 *
 * @param error - Any error value
 * @param field - Field name to look up
 * @returns Field error message or undefined
 */
export function getApiFieldError(error: unknown, field: string): string | undefined {
  const fields = getFieldErrors(error);
  return fields.find((f) => f.field === field)?.message;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if a string is a valid API error code
 *
 * @param code - String to check
 * @returns True if code is a valid ApiErrorCode
 * @internal
 */
function isValidErrorCode(code: string): code is ApiErrorCode {
  return Object.values(API_ERROR_CODES).includes(code as ApiErrorCode);
}

/**
 * Capitalize first letter of a string
 *
 * @param str - String to capitalize
 * @returns Capitalized string
 * @internal
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Create a standardized success response wrapper
 *
 * @param data - Response payload
 * @param meta - Optional metadata (pagination, timing, etc.)
 * @returns Formatted success response object
 *
 * @example
 * ```typescript
 * // Simple response
 * return successResponse(user);
 *
 * // With pagination metadata
 * return successResponse(users, {
 *   pagination: { page: 1, pageSize: 20, total: 100, hasMore: true }
 * });
 * ```
 */
export function successResponse<T>(
  data: T,
  meta?: Record<string, unknown>
): {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
} {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
}

/**
 * Create a standardized error response wrapper
 *
 * Useful in catch blocks to ensure consistent error format.
 *
 * @param error - Any error value (NxtApiError, Error, string, etc.)
 * @returns Formatted error response object
 *
 * @example
 * ```typescript
 * try {
 *   await processData();
 * } catch (err) {
 *   return errorResponse(err);
 * }
 * ```
 */
export function errorResponse(error: unknown): ApiErrorResponse {
  if (error instanceof NxtApiError) {
    return error.toResponse();
  }
  const parsed = parseApiError(error);
  return {
    success: false,
    error: parsed,
  };
}
