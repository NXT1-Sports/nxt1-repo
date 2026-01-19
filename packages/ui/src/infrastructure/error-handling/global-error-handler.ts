/**
 * @fileoverview Global Error Handler
 * @module @nxt1/ui/infrastructure
 *
 * Enterprise-grade global error handler for Angular applications.
 * Catches all unhandled errors and provides:
 * - Centralized error logging (via optional ILogger injection)
 * - User-friendly toast notifications
 * - Error tracking/analytics integration
 * - Chunk load error recovery (lazy loading failures)
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import {
  ErrorHandler,
  Injectable,
  inject,
  NgZone,
  PLATFORM_ID,
  InjectionToken,
  Optional,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { parseApiError, isNxtApiError, API_ERROR_CODES } from '@nxt1/core/errors';
import type { ILogger } from '@nxt1/core/logging';
import { NxtToastService } from '../../services/toast';

// ============================================
// LOGGER INJECTION TOKEN
// ============================================

/**
 * Injection token for providing a structured logger to GlobalErrorHandler.
 *
 * Apps can provide their own ILogger implementation:
 * ```typescript
 * // In app.config.ts
 * providers: [
 *   { provide: GLOBAL_ERROR_LOGGER, useExisting: LoggingService },
 *   { provide: ErrorHandler, useClass: GlobalErrorHandler },
 * ]
 * ```
 *
 * If not provided, falls back to console logging.
 */
export const GLOBAL_ERROR_LOGGER = new InjectionToken<ILogger>('GLOBAL_ERROR_LOGGER');

// ============================================
// EXPORTED TYPES & CONSTANTS
// ============================================

/**
 * Error severity levels for tracking/reporting
 *
 * - fatal: Application-breaking errors
 * - error: Recoverable errors that should be tracked
 * - warning: Expected errors (auth failures, validation)
 * - info: Informational errors for debugging
 */
export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

/**
 * User-friendly error messages for common scenarios
 */
export const ERROR_MESSAGES = {
  NETWORK: 'Unable to connect to the server. Please check your internet connection.',
  TIMEOUT: 'The request timed out. Please try again.',
  CHUNK_LOAD: 'Failed to load application resources. Please clear your browser cache and reload.',
  GENERIC: 'Something went wrong. Please try again or contact support if the problem persists.',
} as const;

// ============================================
// INTERNAL TYPES
// ============================================

/**
 * Error details extracted from various error types
 */
interface ErrorDetails {
  message: string;
  code?: string;
  name?: string;
  stack?: string;
  timestamp: string;
  url?: string;
  userAgent?: string;
  raw?: unknown;
}

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

/**
 * Global Error Handler
 *
 * Implements Angular's ErrorHandler interface to catch all unhandled errors.
 * Provides enterprise-grade error handling with:
 * - Automatic chunk load error recovery (lazy loading failures)
 * - User-friendly notifications (rate-limited to prevent spam)
 * - Error tracking integration (Sentry, Firebase Analytics)
 * - SSR-safe implementation with platform checks
 * - Severity classification for intelligent error routing
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * providers: [
 *   { provide: ErrorHandler, useClass: GlobalErrorHandler }
 * ]
 * ```
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly zone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly toast = inject(NxtToastService);

  /** Optional structured logger - falls back to console if not provided */
  private readonly injectedLogger = inject(GLOBAL_ERROR_LOGGER, { optional: true });

  /** Track chunk errors to prevent infinite reload loops */
  private chunkErrorCount = 0;
  private readonly MAX_CHUNK_RETRIES = 2;

  /** Rate limit error notifications */
  private lastNotificationTime = 0;
  private readonly NOTIFICATION_COOLDOWN = 5000; // 5 seconds

  /**
   * Get logger instance - uses injected logger or falls back to console
   */
  private get logger(): ILogger {
    if (this.injectedLogger) {
      return this.injectedLogger;
    }

    // Fallback to console-based logger
    return {
      debug: (msg: string, data?: Record<string, unknown>) =>
        console.debug('[GlobalErrorHandler]', msg, data),
      info: (msg: string, data?: Record<string, unknown>) =>
        console.info('[GlobalErrorHandler]', msg, data),
      warn: (msg: string, data?: Record<string, unknown>) =>
        console.warn('[GlobalErrorHandler]', msg, data),
      error: (msg: string, err?: unknown, data?: Record<string, unknown>) =>
        console.error('[GlobalErrorHandler]', msg, err, data),
      fatal: (msg: string, err?: unknown, data?: Record<string, unknown>) =>
        console.error('[GlobalErrorHandler][FATAL]', msg, err, data),
      child: () => this.logger,
      setContext: () => {},
      clearContext: () => {},
      flush: async () => {},
    };
  }

  /**
   * Handle all unhandled errors in the application
   */
  handleError(error: unknown): void {
    // Run error handling outside Angular to prevent digest loops
    this.zone.runOutsideAngular(() => {
      // Extract error details
      const errorDetails = this.extractErrorDetails(error);
      const severity = this.determineSeverity(error);

      // Log error
      this.logError(errorDetails, severity);

      // Check for chunk load errors (lazy loading failures)
      if (this.isChunkLoadError(error)) {
        this.handleChunkLoadError();
        return;
      }

      // Report to external monitoring (Sentry, etc.)
      this.reportError(errorDetails, severity);

      // Show user notification (rate-limited)
      this.zone.run(() => {
        this.showErrorNotification(errorDetails, severity);
      });
    });
  }

  /**
   * Extract meaningful details from any error type
   */
  private extractErrorDetails(error: unknown): ErrorDetails {
    const timestamp = new Date().toISOString();
    const baseDetails: ErrorDetails = {
      message: 'An unexpected error occurred',
      timestamp,
    };

    // Add browser context if available
    if (isPlatformBrowser(this.platformId)) {
      baseDetails.url = window.location.href;
      baseDetails.userAgent = navigator.userAgent;
    }

    // Handle NxtApiError from @nxt1/core
    if (isNxtApiError(error)) {
      return {
        ...baseDetails,
        message: error.message,
        code: error.code,
        name: 'NxtApiError',
        stack: error.stack,
      };
    }

    // Handle standard Error objects
    if (error instanceof Error) {
      return {
        ...baseDetails,
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    }

    // Handle string errors
    if (typeof error === 'string') {
      return {
        ...baseDetails,
        message: error,
      };
    }

    // Handle HTTP error responses
    if (this.isHttpErrorResponse(error)) {
      const parsed = parseApiError(error);
      return {
        ...baseDetails,
        message: parsed.message,
        code: parsed.code,
        raw: error,
      };
    }

    // Handle unknown error types
    return {
      ...baseDetails,
      raw: error,
    };
  }

  /**
   * Determine error severity for tracking/reporting
   */
  private determineSeverity(error: unknown): ErrorSeverity {
    // Chunk load errors are warnings (recoverable)
    if (this.isChunkLoadError(error)) {
      return 'warning';
    }

    // NxtApiError with specific codes
    if (isNxtApiError(error)) {
      const code = error.code;

      // Auth errors are warnings (expected user flow)
      if (
        code === API_ERROR_CODES.AUTH_INVALID_CREDENTIALS ||
        code === API_ERROR_CODES.RES_EMAIL_EXISTS ||
        code === API_ERROR_CODES.AUTH_TOKEN_EXPIRED
      ) {
        return 'warning';
      }

      // Rate limiting is a warning
      if (code === API_ERROR_CODES.RATE_LIMIT_EXCEEDED) {
        return 'warning';
      }

      // Server errors are errors
      if (code === API_ERROR_CODES.SRV_INTERNAL_ERROR) {
        return 'error';
      }
    }

    // Default to error
    return 'error';
  }

  /**
   * Check if error is a chunk load error (lazy loading failure)
   */
  private isChunkLoadError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('loading chunk') ||
        message.includes('chunkloaderror') ||
        message.includes('failed to fetch dynamically imported module')
      );
    }
    return false;
  }

  /**
   * Handle chunk load errors by reloading the page
   */
  private handleChunkLoadError(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.chunkErrorCount++;

    if (this.chunkErrorCount <= this.MAX_CHUNK_RETRIES) {
      this.logger.warn(
        `Chunk load error detected. Reloading page (attempt ${this.chunkErrorCount}/${this.MAX_CHUNK_RETRIES})...`
      );

      // Store retry count in session storage to track across reloads
      sessionStorage.setItem('chunk_error_count', String(this.chunkErrorCount));

      // Reload the page to get fresh chunks
      window.location.reload();
    } else {
      this.logger.error('Max chunk reload attempts reached. Showing error to user.');
      this.zone.run(() => {
        this.showErrorNotification(
          {
            message:
              'Failed to load application resources. Please clear your browser cache and reload.',
            timestamp: new Date().toISOString(),
          },
          'error'
        );
      });
    }
  }

  /**
   * Check if error is an HTTP error response
   */
  private isHttpErrorResponse(
    error: unknown
  ): error is { status: number; error?: unknown; message?: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status: unknown }).status === 'number'
    );
  }

  /**
   * Log error using structured logger (or console fallback)
   */
  private logError(details: ErrorDetails, severity: ErrorSeverity): void {
    const logData = {
      code: details.code,
      name: details.name,
      timestamp: details.timestamp,
      url: details.url,
      stack: details.stack,
    };

    switch (severity) {
      case 'fatal':
        this.logger.fatal(details.message, details.raw, logData);
        break;
      case 'error':
        this.logger.error(details.message, details.raw, logData);
        break;
      case 'warning':
        this.logger.warn(details.message, logData);
        break;
      case 'info':
        this.logger.info(details.message, logData);
        break;
    }
  }

  /**
   * Report error to external monitoring service
   * TODO: Integrate with Sentry, Datadog, or similar
   */
  private reportError(_details: ErrorDetails, severity: ErrorSeverity): void {
    // Skip reporting for warnings
    if (severity === 'warning' || severity === 'info') return;

    // TODO: Integrate with error monitoring service
    // Example Sentry integration:
    // Sentry.captureException(new Error(_details.message), {
    //   level: severity,
    //   tags: { code: _details.code },
    //   extra: _details,
    // });

    // For now, we can track via Firebase Analytics if needed
    if (isPlatformBrowser(this.platformId)) {
      // gtag('event', 'exception', {
      //   description: _details.message,
      //   fatal: severity === 'fatal',
      // });
    }
  }

  /**
   * Show user-friendly error notification via NxtToastService (rate-limited)
   */
  private showErrorNotification(details: ErrorDetails, severity: ErrorSeverity): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Rate limit notifications
    const now = Date.now();
    if (now - this.lastNotificationTime < this.NOTIFICATION_COOLDOWN) {
      return;
    }
    this.lastNotificationTime = now;

    // Only show notifications for errors (not warnings)
    if (severity !== 'error' && severity !== 'fatal') return;

    // Get user-friendly message
    const userMessage = this.getUserFriendlyMessage(details);

    // Show toast notification
    this.toast.error(userMessage);
  }

  /**
   * Convert technical error details to user-friendly message
   */
  private getUserFriendlyMessage(details: ErrorDetails): string {
    // Network errors
    if (
      details.message.toLowerCase().includes('network') ||
      details.message.toLowerCase().includes('fetch')
    ) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }

    // Timeout errors
    if (details.message.toLowerCase().includes('timeout')) {
      return 'The request timed out. Please try again.';
    }

    // Default message
    return 'Something went wrong. Please try again or contact support if the problem persists.';
  }
}
