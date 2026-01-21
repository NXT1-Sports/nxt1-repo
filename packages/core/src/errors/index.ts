/**
 * @fileoverview Error Module Barrel Export
 * @module @nxt1/core/errors
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Enterprise-grade error handling system for NXT1 platform.
 * Provides consistent error handling across Web, Mobile, Backend, and Functions.
 *
 * @example
 * ```typescript
 * // Import everything from the errors module
 * import {
 *   createApiError,
 *   validationError,
 *   parseApiError,
 *   API_ERROR_CODES,
 *   NxtApiError,
 * } from '@nxt1/core/errors';
 *
 * // Backend: Create and throw errors
 * throw createApiError('AUTH_TOKEN_EXPIRED');
 * throw validationError([{ field: 'email', message: 'Invalid', rule: 'email' }]);
 *
 * // Frontend: Parse and handle errors
 * const error = parseApiError(response);
 * if (requiresAuth(error)) {
 *   redirectToLogin();
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// TYPES
// ============================================

export type {
  // Core error types
  ErrorSeverity,
  ErrorCategory,
  ErrorAction,
  RetryInfo,
  FieldError,
  ApiErrorDetail,
  // Response types
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  ResponseMeta,
} from './error.types';

// ============================================
// CLASSES
// ============================================

export { NxtApiError, generateTraceId } from './error.types';

// ============================================
// TYPE GUARDS
// ============================================

export {
  isApiErrorResponse,
  isApiSuccessResponse,
  isNxtApiError,
  hasErrorCode,
} from './error.types';

// ============================================
// CONSTANTS
// ============================================

export {
  // Error codes enum
  API_ERROR_CODES,
  type ApiErrorCode,
  // Configuration
  ERROR_CONFIG,
  type ErrorCodeConfig,
  // Utility functions
  getErrorConfig,
  getHttpStatus,
  getDefaultMessage,
  isRetryable,
  getRetryDelay as getRetryDelayFromCode,
} from './error.constants';

// ============================================
// FACTORY FUNCTIONS
// ============================================

export {
  // Main factory
  createApiError,
  type CreateApiErrorOptions,
  // Specialized factories
  validationError,
  fieldError,
  notFoundError,
  conflictError,
  unauthorizedError,
  forbiddenError,
  rateLimitError,
  internalError,
  externalServiceError,
  // Response wrappers
  successResponse,
  errorResponse,
} from './error.factory';

// ============================================
// PARSING & HANDLING
// ============================================

export {
  // Parsing
  parseApiError,
  getErrorMessage,
  getErrorCode,
  // Retry handling
  shouldRetry,
  getRetryDelay,
  // Auth checks
  requiresAuth,
  requiresUpgrade,
  // Validation helpers
  isValidationError,
  getFieldErrors,
  getApiFieldError,
} from './error.factory';
