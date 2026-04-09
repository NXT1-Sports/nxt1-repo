/**
 * @fileoverview Angular Logging Service
 * @module apps/web
 *
 * Angular service wrapper for @nxt1/core logging.
 * Provides DI-friendly logging with automatic platform and user context.
 *
 * @version 1.0.0
 */

import { Injectable, inject, isDevMode, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  createLogger,
  consoleTransport,
  remoteTransport,
  type ILogger,
  type LoggerConfig,
  type LogLevel,
  type LogContext,
  LOGGING_DEFAULTS,
} from '@nxt1/core/logging';
import { environment } from '../../../../environments/environment';

// ============================================
// CONFIGURATION
// ============================================

/** Determine environment based on Angular config */
function getEnvironment(): 'development' | 'staging' | 'production' {
  if (isDevMode()) return 'development';
  if (environment.production) return 'production';
  return 'staging';
}

/** Determine minimum log level based on environment */
function getMinLevel(): LogLevel {
  if (isDevMode()) return 'debug';
  if (environment.production) return 'warn';
  return 'info';
}

// ============================================
// LOGGING SERVICE
// ============================================

/**
 * Angular Logging Service
 *
 * Provides centralized, structured logging throughout the application.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class AuthService {
 *   private readonly logger = inject(LoggingService).child('AuthService');
 *
 *   async signIn(email: string): Promise<void> {
 *     this.logger.info('Sign in attempt', { email });
 *     try {
 *       // ... auth logic
 *       this.logger.info('Sign in successful', { email });
 *     } catch (error) {
 *       this.logger.error('Sign in failed', error, { email });
 *       throw error;
 *     }
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class LoggingService implements ILogger {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger: ILogger;

  // Store for child loggers to avoid recreating
  private readonly childLoggers = new Map<string, ILogger>();

  constructor() {
    const isBrowser = isPlatformBrowser(this.platformId);

    // Build transports based on platform
    const transports = this.buildTransports(isBrowser);

    // Create logger configuration
    const config: LoggerConfig = {
      environment: getEnvironment(),
      minLevel: getMinLevel(),
      enabled: true,
      platform: isBrowser ? 'web' : 'server',
      appVersion: environment.version || '0.0.0',
      transports,
      redactFields: [
        'password',
        'token',
        'accessToken',
        'refreshToken',
        'apiKey',
        'secret',
        'authorization',
        'creditCard',
        'cardNumber',
        'cvv',
      ],
    };

    this.logger = createLogger(config, 'NXT1');

    // Log service initialization
    this.logger.debug('LoggingService initialized', {
      environment: config.environment,
      minLevel: config.minLevel,
      platform: config.platform,
      transportsCount: transports.length,
    });
  }

  // ----------------------------------------
  // TRANSPORT BUILDERS
  // ----------------------------------------

  private buildTransports(isBrowser: boolean) {
    const transports = [];

    // Always add console transport
    transports.push(
      consoleTransport({
        colors: isBrowser ? false : true, // ANSI colors only in Node
        includeTimestamp: true,
        includeNamespace: true,
        prettyPrint: isDevMode(),
      })
    );

    // Add remote transport in production
    if (environment.production && isBrowser && environment.loggingEndpoint) {
      transports.push(
        remoteTransport({
          endpoint: environment.loggingEndpoint,
          batchSize: LOGGING_DEFAULTS.REMOTE_BATCH_SIZE,
          flushInterval: LOGGING_DEFAULTS.REMOTE_FLUSH_INTERVAL,
          maxRetries: LOGGING_DEFAULTS.REMOTE_MAX_RETRIES,
        })
      );
    }

    return transports;
  }

  // ----------------------------------------
  // PUBLIC API (ILogger implementation)
  // ----------------------------------------

  /**
   * Log debug message (development only)
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, data);
  }

  /**
   * Log warning
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(message, data);
  }

  /**
   * Log error
   */
  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    this.logger.error(message, error, data);
  }

  /**
   * Log fatal error
   */
  fatal(message: string, error?: unknown, data?: Record<string, unknown>): void {
    this.logger.fatal(message, error, data);
  }

  /**
   * Create a child logger with a specific namespace
   * Useful for service-specific logging
   */
  child(namespace: string): ILogger {
    // Return cached logger if available
    if (this.childLoggers.has(namespace)) {
      return this.childLoggers.get(namespace)!;
    }

    // Create and cache new child logger
    const childLogger = this.logger.child(namespace);
    this.childLoggers.set(namespace, childLogger);
    return childLogger;
  }

  /**
   * Set context that persists across log calls
   */
  setContext(context: Partial<LogContext>): void {
    this.logger.setContext(context);
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.logger.clearContext();
  }

  /**
   * Flush all pending logs
   */
  async flush(): Promise<void> {
    await this.logger.flush();
  }

  // ----------------------------------------
  // CONVENIENCE METHODS
  // ----------------------------------------

  /**
   * Set user context for all subsequent logs
   */
  setUser(userId: string | undefined): void {
    if (userId) {
      this.setContext({ userId });
    } else {
      this.clearContext();
    }
  }

  /**
   * Set session context
   */
  setSession(sessionId: string): void {
    this.setContext({ sessionId });
  }

  // ----------------------------------------
  // ERROR HANDLER INTEGRATION
  // ----------------------------------------

  /**
   * Handle error from GlobalErrorHandler
   * Maps to appropriate log level based on error type
   */
  handleError(error: unknown, context?: Record<string, unknown>): void {
    const data = {
      ...context,
      source: 'GlobalErrorHandler',
    };

    // Determine severity
    const isNetworkError = this.isNetworkError(error);
    const isUserError = this.isUserError(error);

    if (isUserError) {
      // User-caused errors (validation, auth) - warn level
      this.warn('User error', data);
    } else if (isNetworkError) {
      // Network errors - warn level (might be temporary)
      this.warn('Network error', data);
    } else {
      // Unknown/app errors - error level
      this.error('Application error', error, data);
    }
  }

  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.name === 'HttpErrorResponse' ||
        error.message.includes('network') ||
        error.message.includes('fetch')
      );
    }
    return false;
  }

  private isUserError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      return (
        err['code'] === 'VALIDATION_ERROR' ||
        err['code'] === 'AUTH_ERROR' ||
        err['status'] === 400 ||
        err['status'] === 401 ||
        err['status'] === 403
      );
    }
    return false;
  }
}

// ============================================
// FACTORY FUNCTION (for non-DI contexts)
// ============================================

/**
 * Create a standalone logger (for use outside Angular DI)
 */
export function createAppLogger(namespace: string): ILogger {
  const config: LoggerConfig = {
    environment: getEnvironment(),
    minLevel: getMinLevel(),
    enabled: true,
    platform: typeof window !== 'undefined' ? 'web' : 'server',
    transports: [
      consoleTransport({
        colors: typeof window === 'undefined',
        includeTimestamp: true,
        includeNamespace: true,
        prettyPrint: isDevMode(),
      }),
    ],
  };

  return createLogger(config, namespace);
}
