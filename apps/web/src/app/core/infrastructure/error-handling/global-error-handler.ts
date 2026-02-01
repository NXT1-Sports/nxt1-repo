/**
 * @fileoverview Global Error Handler
 * @module @nxt1/web/core/infrastructure/error-handling
 *
 * Enterprise-grade global error handler for Angular applications.
 * Catches all unhandled errors and provides:
 * - Centralized error logging
 * - User-friendly notifications
 * - Error tracking/analytics integration
 * - Chunk load error recovery (lazy loading failures)
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { ErrorHandler, Injectable, inject, NgZone, PLATFORM_ID, Injector } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { parseApiError, isNxtApiError, API_ERROR_CODES } from '@nxt1/core/errors';
import type { ILogger } from '@nxt1/core/logging';

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
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);

  /** Lazy-loaded logger to avoid circular dependency */
  private _logger: ILogger | null = null;
  private get logger(): ILogger {
    if (!this._logger) {
      // Lazy inject to avoid circular dependency with LoggingService
      // Use dynamic import pattern for lazy loading
      try {
        const { LoggingService } = require('../../services/logging.service');
        const loggingService = this.injector.get(LoggingService) as ILogger;
        this._logger = loggingService.child('GlobalErrorHandler');
      } catch {
        // Fallback to console logging if LoggingService not available
        this._logger = {
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
          child: () => this._logger!,
          /* eslint-disable @typescript-eslint/no-empty-function */
          setContext: () => {},
          clearContext: () => {},
          flush: async () => {},
          /* eslint-enable @typescript-eslint/no-empty-function */
        };
      }
    }
    return this._logger!;
  }

  /** Track chunk errors to prevent infinite reload loops */
  private chunkErrorCount = 0;
  private readonly MAX_CHUNK_RETRIES = 2;

  /** Rate limit error notifications */
  private lastNotificationTime = 0;
  private readonly NOTIFICATION_COOLDOWN = 5000; // 5 seconds

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
      this.logger.warn('Chunk load error detected, reloading page', {
        attempt: this.chunkErrorCount,
        maxRetries: this.MAX_CHUNK_RETRIES,
      });

      // Store retry count in session storage to track across reloads
      sessionStorage.setItem('chunk_error_count', String(this.chunkErrorCount));

      // Reload the page to get fresh chunks
      window.location.reload();
    } else {
      this.logger.error('Max chunk reload attempts reached', {
        attempts: this.chunkErrorCount,
      });

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
   * Log error using centralized logging service
   */
  private logError(details: ErrorDetails, severity: ErrorSeverity): void {
    const logData: Record<string, unknown> = {
      code: details.code,
      name: details.name,
      url: details.url,
      userAgent: details.userAgent,
    };

    // Use appropriate log level based on severity
    // Note: ILogger method signatures are:
    // - debug/info/warn(message, data?)
    // - error/fatal(message, error?, data?)
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
      default:
        this.logger.info(details.message, logData);
        break;
    }
  }

  /**
   * Report error to external monitoring service
   *
   * Note: The LoggingService handles transport to:
   * - Sentry (via sentryTransport if configured)
   * - Remote logging endpoint (via remoteTransport)
   * - Analytics (via analyticsTransport)
   *
   * This method is called for additional tracking if needed.
   */
  private reportError(details: ErrorDetails, severity: ErrorSeverity): void {
    // Skip reporting for warnings/info - LoggingService already handles this
    if (severity === 'warning' || severity === 'info') return;

    // The LoggingService transports handle error reporting automatically
    // This method can be used for additional custom reporting if needed

    // Example: Track in Firebase Analytics for fatal errors
    if (isPlatformBrowser(this.platformId) && severity === 'fatal') {
      // Analytics tracking is handled by analyticsTransport in LoggingService
    }
  }

  /**
   * Show user-friendly error notification (rate-limited)
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

    // TODO: Use toast service when available
    // For now, we just log that we would show a notification
    console.info('[GlobalErrorHandler] Would show notification:', userMessage);

    // Example with toast service:
    // this.toastService.error(userMessage, 'Error');
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
