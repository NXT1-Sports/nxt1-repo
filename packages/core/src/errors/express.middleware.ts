/**
 * @fileoverview Express Error Handling Middleware
 * @module @nxt1/core/errors
 *
 * ⭐ THIS FILE IS FOR NODE.JS/EXPRESS ONLY ⭐
 *
 * Production-grade Express middleware for error handling.
 * Integrates with NXT1's unified error system.
 *
 * Features:
 * - Automatic error parsing and formatting
 * - Request ID tracking
 * - Error logging with context
 * - Development vs production error responses
 * - Async error wrapper
 *
 * @example
 * ```typescript
 * // In Express app setup
 * import {
 *   errorHandler,
 *   notFoundHandler,
 *   asyncHandler,
 * } from '@nxt1/core/errors/express';
 *
 * // Wrap async routes
 * router.get('/users/:id', asyncHandler(async (req, res) => {
 *   const user = await getUserById(req.params.id);
 *   if (!user) throw notFoundError('user', req.params.id);
 *   res.json(successResponse(user));
 * }));
 *
 * // Add error handlers (must be last)
 * app.use(notFoundHandler);
 * app.use(errorHandler);
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  NxtApiError,
  type ApiErrorResponse,
  type ApiErrorDetail,
  parseApiError,
  createApiError,
  generateTraceId,
} from './index';

// ============================================
// TYPES
// ============================================

/**
 * Extended Express Request with trace ID
 */
export interface TracedRequest extends Request {
  traceId?: string;
  startTime?: number;
}

/**
 * Error handler options
 */
export interface ErrorHandlerOptions {
  /** Include stack traces in development */
  includeStackTrace?: boolean;
  /** Log errors to console */
  logErrors?: boolean;
  /** Custom logger function */
  logger?: (error: ApiErrorDetail, req: TracedRequest, originalError: unknown) => void;
  /** Include internal details in response (development only) */
  exposeInternals?: boolean;
}

// ============================================
// REQUEST TRACKING MIDDLEWARE
// ============================================

/**
 * Middleware to add trace ID and timing to requests
 *
 * Add this early in your middleware chain:
 * ```typescript
 * app.use(requestTracker);
 * ```
 */
export function requestTracker(req: TracedRequest, res: Response, next: NextFunction): void {
  // Generate or extract trace ID
  req.traceId = (req.headers['x-trace-id'] as string) || generateTraceId();
  req.startTime = Date.now();

  // Add trace ID to response headers
  res.setHeader('x-trace-id', req.traceId);

  next();
}

// ============================================
// ASYNC HANDLER WRAPPER
// ============================================

/**
 * Wrapper for async route handlers
 *
 * Catches async errors and forwards to error middleware.
 * Eliminates need for try/catch in every route.
 *
 * @example
 * ```typescript
 * router.get('/users/:id', asyncHandler(async (req, res) => {
 *   const user = await getUserById(req.params.id);
 *   if (!user) throw notFoundError('user');
 *   res.json(successResponse(user));
 * }));
 * ```
 */
export function asyncHandler(
  fn: (req: TracedRequest, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as TracedRequest, res, next)).catch(next);
  };
}

// ============================================
// NOT FOUND HANDLER
// ============================================

/**
 * 404 Not Found handler for unmatched routes
 *
 * Add this after all your routes:
 * ```typescript
 * app.use(notFoundHandler);
 * ```
 */
export function notFoundHandler(req: TracedRequest, res: Response, _next: NextFunction): void {
  const error = createApiError('RES_NOT_FOUND', {
    message: `Route not found: ${req.method} ${req.path}`,
    traceId: req.traceId,
    details: {
      method: req.method,
      path: req.path,
      url: req.originalUrl,
    },
  });

  res.status(404).json(error.toResponse());
}

// ============================================
// ERROR HANDLER MIDDLEWARE
// ============================================

/**
 * Create error handling middleware with options
 *
 * @example
 * ```typescript
 * // Basic usage
 * app.use(createErrorHandler());
 *
 * // With custom options
 * app.use(createErrorHandler({
 *   logErrors: true,
 *   logger: (error, req, originalError) => {
 *     myLogger.error('API Error', { error, originalError });
 *   },
 *   includeStackTrace: process.env.NODE_ENV === 'development',
 * }));
 * ```
 */
export function createErrorHandler(
  options: ErrorHandlerOptions = {}
): (err: unknown, req: TracedRequest, res: Response, next: NextFunction) => void {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  const {
    includeStackTrace = isDevelopment,
    logErrors = true,
    logger,
    exposeInternals = isDevelopment,
  } = options;

  return (err: unknown, req: TracedRequest, res: Response, _next: NextFunction): void => {
    // Parse error into standard format
    let errorDetail: ApiErrorDetail;
    let originalError: unknown = err;

    if (err instanceof NxtApiError) {
      errorDetail = err.toJSON();
      // Add trace ID from request if not set
      if (!errorDetail.traceId && req.traceId) {
        errorDetail.traceId = req.traceId;
      }
    } else {
      const parsed = parseApiError(err);
      errorDetail = {
        ...parsed,
        traceId: req.traceId ?? parsed.traceId,
      };
    }

    // Add request context
    const responseTime = req.startTime ? Date.now() - req.startTime : undefined;

    // Log error
    if (logErrors) {
      if (logger) {
        logger(errorDetail, req, originalError);
      } else {
        console.error('[API Error]', {
          traceId: errorDetail.traceId,
          code: errorDetail.code,
          message: errorDetail.message,
          statusCode: errorDetail.statusCode,
          severity: errorDetail.severity,
          method: req.method,
          path: req.path,
          responseTime,
          ...(includeStackTrace && err instanceof Error ? { stack: err.stack } : {}),
        });
      }
    }

    // Build response
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: errorDetail.code,
        message: errorDetail.message,
        category: errorDetail.category,
        statusCode: errorDetail.statusCode,
        severity: errorDetail.severity,
        fields: errorDetail.fields,
        action: errorDetail.action,
        retry: errorDetail.retry,
        traceId: errorDetail.traceId,
        timestamp: errorDetail.timestamp,
        // Only include details in development
        ...(exposeInternals && errorDetail.details ? { details: errorDetail.details } : {}),
      },
    };

    // Send response
    res.status(errorDetail.statusCode).json(response);
  };
}

/**
 * Default error handler (convenience export)
 *
 * Uses sensible defaults based on NODE_ENV.
 */
export const errorHandler = createErrorHandler();

// ============================================
// VALIDATION MIDDLEWARE
// ============================================

/**
 * Create a validation middleware using a validator function
 *
 * @param validator - Validation function that returns success/errors
 * @returns Express middleware that validates request body
 *
 * @example
 * ```typescript
 * import { validateRegistration } from '@nxt1/core/validation';
 *
 * router.post('/register',
 *   validateBody(validateRegistration),
 *   asyncHandler(async (req, res) => {
 *     // req.body is validated
 *     const user = await createUser(req.body);
 *     res.json(successResponse(user));
 *   })
 * );
 * ```
 */
export function validateBody<T>(
  validator: (data: T) => {
    success: boolean;
    errors: Array<{ field: string; message: string; code: string }>;
  }
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = validator(req.body as T);

    if (!result.success) {
      const error = createApiError('VAL_INVALID_INPUT', {
        fields: result.errors.map((e) => ({
          field: e.field,
          message: e.message,
          rule: e.code,
        })),
      });
      res.status(400).json(error.toResponse());
      return;
    }

    next();
  };
}

// ============================================
// RESPONSE HELPERS
// ============================================

/**
 * Send a success response
 *
 * @example
 * ```typescript
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await getUsers();
 *   sendSuccess(res, users, { pagination: { page: 1, total: 100 } });
 * }));
 * ```
 */
export function sendSuccess<T>(res: Response, data: T, meta?: Record<string, unknown>): void {
  res.json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

/**
 * Send a paginated success response
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  }
): void {
  sendSuccess(res, data, {
    pagination: {
      ...pagination,
      hasMore: pagination.page * pagination.pageSize < pagination.total,
    },
  });
}

/**
 * Send an error response (for manual error handling)
 *
 * @example
 * ```typescript
 * if (!user) {
 *   return sendError(res, notFoundError('user'));
 * }
 * ```
 */
export function sendError(res: Response, error: NxtApiError | ApiErrorResponse): void {
  if (error instanceof NxtApiError) {
    res.status(error.statusCode).json(error.toResponse());
  } else {
    res.status(error.error.statusCode).json(error);
  }
}
