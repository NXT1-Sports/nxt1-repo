/**
 * @fileoverview HTTP Error Interceptor
 * @module @nxt1/ui/infrastructure
 *
 * Functional HTTP interceptor for centralized error handling.
 * Uses @nxt1/core/errors for consistent error parsing across platforms.
 *
 * Features:
 * - Automatic 401 handling with redirect to login
 * - Rate limit detection with retry-after support
 * - Network error detection
 * - Error transformation to NxtApiError
 * - Toast notifications via NxtToastService
 *
 * @author NXT1 Engineering
 * @version 1.1.0
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
import {
  parseApiError,
  API_ERROR_CODES,
  shouldRetry,
  getRetryDelay,
  type ApiErrorDetail,
} from '@nxt1/core/errors';
import { NxtToastService } from '../../services/toast';

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
    const toast = inject(NxtToastService);

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
        logHttpError(req, error, apiError);

        // Handle 401 Unauthorized
        if (error.status === 401 && config.redirectOnUnauthorized) {
          handleUnauthorized(router, platformId, config.unauthorizedRedirectPath);
        }

        // Handle 429 Rate Limit
        if (error.status === 429) {
          handleRateLimit(error, apiError);
        }

        // Handle network errors
        if (error.status === 0) {
          handleNetworkError(platformId);
        }

        // Show notification if enabled
        if (config.showNotifications && isPlatformBrowser(platformId)) {
          showErrorNotification(toast, apiError, error.status);
        }

        // Re-throw as parsed error for consumers
        return throwError(() => apiError);
      })
    );
  };
}

/**
 * Log HTTP error with structured format
 */
function logHttpError(
  req: HttpRequest<unknown>,
  error: HttpErrorResponse,
  apiError: ApiErrorDetail
): void {
  console.error('[HTTP Error]', {
    url: req.url,
    method: req.method,
    status: error.status,
    statusText: error.statusText,
    code: apiError.code,
    message: apiError.message,
    timestamp: new Date().toISOString(),
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
function handleRateLimit(error: HttpErrorResponse, apiError: ApiErrorDetail): void {
  const retryAfter = error.headers.get('Retry-After');
  const retryDelay = getRetryDelay(apiError);

  console.warn('[HTTP Error] Rate limited', {
    retryAfter,
    retryDelay,
    shouldRetry: shouldRetry(apiError),
  });
}

/**
 * Handle network errors (status 0)
 */
function handleNetworkError(platformId: object): void {
  if (!isPlatformBrowser(platformId)) return;

  // Check if actually offline
  if (!navigator.onLine) {
    console.warn('[HTTP Error] Device is offline');
  } else {
    console.error('[HTTP Error] Network error - server may be unreachable');
  }
}

/**
 * Show error notification to user via NxtToastService
 */
function showErrorNotification(
  toast: NxtToastService,
  apiError: ApiErrorDetail,
  status: number
): void {
  // Skip showing notifications for expected auth errors (handled by auth flow)
  if (
    apiError.code === API_ERROR_CODES.AUTH_INVALID_CREDENTIALS ||
    apiError.code === API_ERROR_CODES.AUTH_TOKEN_EXPIRED
  ) {
    return;
  }

  // Skip validation errors (handled by form validation UI)
  if (apiError.code === API_ERROR_CODES.VAL_INVALID_INPUT) {
    return;
  }

  // Skip 404 errors for API calls that handle their own errors
  // (e.g., team code validation returns valid: false instead of throwing)
  if (status === 404) {
    return;
  }

  // Get user-friendly message
  const message = getUserFriendlyMessage(apiError, status);

  // Show toast notification
  if (status === 0) {
    // Network error - warning (might be temporary)
    toast.warning(message);
  } else if (status >= 500) {
    // Server error
    toast.error(message);
  } else if (status === 429) {
    // Rate limited - warning
    toast.warning(message);
  } else {
    // Other client errors
    toast.error(message);
  }
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
