/**
 * @fileoverview HTTP Error Interceptor
 * @module @nxt1/web/core/infrastructure/interceptors
 *
 * Functional HTTP interceptor for centralized error handling.
 * Uses @nxt1/core/errors for consistent error parsing across platforms.
 *
 * Features:
 * - Automatic 401 handling with redirect to login
 * - Rate limit detection with retry-after support
 * - Network error detection
 * - Error transformation to NxtApiError
 * - Optional toast notifications
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import {
  HttpInterceptorFn,
  HttpErrorResponse,
  HttpRequest,
  HttpHandlerFn,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { NxtLoggingService } from '@nxt1/ui/services';
import type { ILogger } from '@nxt1/core/logging';
import {
  parseApiError,
  API_ERROR_CODES,
  shouldRetry,
  getRetryDelay,
  type ApiErrorDetail,
} from '@nxt1/core/errors';

/**
 * HTTP Error Interceptor Configuration
 */
export interface HttpErrorInterceptorOptions {
  /** Show toast notifications for errors (default: true) */
  showNotifications?: boolean;
  /** Redirect to login on 401 (default: true) */
  redirectOnUnauthorized?: boolean;
  /** Custom unauthorized redirect path (default: '/auth') */
  unauthorizedRedirectPath?: string;
  /** Skip interception for specific URL patterns */
  skipPatterns?: RegExp[];
}

/**
 * Default interceptor options
 */
const DEFAULT_OPTIONS: Required<HttpErrorInterceptorOptions> = {
  showNotifications: true,
  redirectOnUnauthorized: true,
  unauthorizedRedirectPath: '/auth',
  skipPatterns: [],
};

/**
 * Create HTTP error interceptor with optional configuration
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * provideHttpClient(
 *   withInterceptors([
 *     httpErrorInterceptor({
 *       showNotifications: true,
 *       redirectOnUnauthorized: true,
 *     })
 *   ])
 * )
 * ```
 */
export function httpErrorInterceptor(options: HttpErrorInterceptorOptions = {}): HttpInterceptorFn {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
    const router = inject(Router);
    const platformId = inject(PLATFORM_ID);
    const logger = inject(NxtLoggingService).child('HttpErrorInterceptor');

    // Check if request should be skipped
    const shouldSkip = config.skipPatterns.some((pattern) => pattern.test(req.url));
    if (shouldSkip) {
      return next(req);
    }

    return next(req).pipe(
      catchError((error: HttpErrorResponse) => {
        // Parse error using @nxt1/core/errors
        const apiError = parseApiError(error);

        // Log error for debugging
        logHttpError(req, error, apiError, logger);

        // Handle 401 Unauthorized
        if (error.status === 401 && config.redirectOnUnauthorized) {
          handleUnauthorized(router, platformId, config.unauthorizedRedirectPath);
        }

        // Handle 429 Rate Limit
        if (error.status === 429) {
          handleRateLimit(error, apiError, logger);
        }

        // Handle network errors
        if (error.status === 0) {
          handleNetworkError(platformId, logger);
        }

        // Show notification if enabled
        if (config.showNotifications && isPlatformBrowser(platformId)) {
          showErrorNotification(apiError, error.status, logger);
        }

        // Re-throw as parsed error for consumers
        return throwError(() => apiError);
      })
    );
  };
}

function logHttpError(
  req: HttpRequest<unknown>,
  error: HttpErrorResponse,
  apiError: ApiErrorDetail,
  logger: ILogger
): void {
  logger.error('HTTP error', error, {
    url: req.url,
    method: req.method,
    status: error.status,
    statusText: error.statusText,
    code: apiError.code,
    message: apiError.message,
  });
}

/**
 * Handle 401 Unauthorized - redirect to login
 */
function handleUnauthorized(router: Router, platformId: object, redirectPath: string): void {
  if (!isPlatformBrowser(platformId)) return;

  // Store current URL for redirect after login
  const currentUrl = window.location.pathname + window.location.search;
  if (currentUrl !== redirectPath && !currentUrl.startsWith('/auth')) {
    sessionStorage.setItem('redirectAfterLogin', currentUrl);
  }

  // Navigate to login
  router.navigate([redirectPath], {
    queryParams: { reason: 'session_expired' },
  });
}

/**
 * Handle 429 Rate Limit - log retry-after if available
 */
function handleRateLimit(
  error: HttpErrorResponse,
  apiError: ApiErrorDetail,
  logger: ILogger
): void {
  const retryAfter = error.headers.get('Retry-After');
  const retryDelay = getRetryDelay(apiError);

  logger.warn('Rate limited', { retryAfter, retryDelay, shouldRetry: shouldRetry(apiError) });
}

/**
 * Handle network errors (status 0)
 */
function handleNetworkError(platformId: object, logger: ILogger): void {
  if (!isPlatformBrowser(platformId)) return;

  // Check if actually offline
  if (!navigator.onLine) {
    logger.warn('Device is offline');
  } else {
    logger.error('Network error - server may be unreachable');
  }
}

/**
 * Show error notification to user
 * TODO: Integrate with toast service
 */
function showErrorNotification(apiError: ApiErrorDetail, status: number, logger: ILogger): void {
  // Skip showing notifications for expected auth errors
  if (
    apiError.code === API_ERROR_CODES.AUTH_INVALID_CREDENTIALS ||
    apiError.code === API_ERROR_CODES.AUTH_TOKEN_EXPIRED
  ) {
    return;
  }

  // Skip validation errors (handled by form)
  if (apiError.code === API_ERROR_CODES.VAL_INVALID_INPUT) {
    return;
  }

  // Get user-friendly message
  const message = getUserFriendlyMessage(apiError, status);

  // TODO: Use toast service
  // toastService.error(message);
  logger.info('Would show notification', { message });
}

/**
 * Get user-friendly error message
 */
function getUserFriendlyMessage(apiError: ApiErrorDetail, status: number): string {
  // Network error
  if (status === 0) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }

  // Rate limited
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Server error
  if (status >= 500) {
    return 'A server error occurred. Please try again later.';
  }

  // Use API error message if available, otherwise generic
  return apiError.message || 'An unexpected error occurred. Please try again.';
}

/**
 * Default HTTP error interceptor (convenience export)
 */
export const defaultHttpErrorInterceptor = httpErrorInterceptor();
