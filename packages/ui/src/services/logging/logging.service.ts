/**
 * @fileoverview Shared Logging Service
 * @module @nxt1/ui/services
 *
 * Enterprise-grade Angular logging service for web and mobile applications.
 * Wraps @nxt1/core/logging with Angular DI and platform detection.
 *
 * Features:
 * - Structured logging with namespaces
 * - Console transport (always enabled)
 * - Remote transport (production only, if endpoint configured)
 * - Automatic platform detection (web/mobile/server)
 * - Sensitive field redaction
 * - Child loggers for service-specific logging
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class AuthService {
 *   private readonly logger = inject(NxtLoggingService).child('AuthService');
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
 *
 * @version 1.0.0
 */

import { Injectable, inject, InjectionToken, PLATFORM_ID, isDevMode } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
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
import { NxtPlatformService } from '../platform';

// ============================================
// CONFIGURATION INJECTION TOKEN
// ============================================

/**
 * Injection token for logging configuration.
 * Apps can provide custom configuration:
 *
 * ```typescript
 * providers: [
 *   {
 *     provide: LOGGING_CONFIG,
 *     useValue: {
 *       appVersion: '1.0.0',
 *       environment: 'production',
 *       remoteEndpoint: 'https://logs.example.com/v1/logs',
 *     }
 *   }
 * ]
 * ```
 */
export interface LoggingConfig {
  /** Application version for log context */
  appVersion?: string;
  /** Environment name (auto-detected if not provided) */
  environment?: 'development' | 'staging' | 'production';
  /** Remote logging endpoint (enables remote transport if provided) */
  remoteEndpoint?: string;
  /** Minimum log level (auto-detected based on environment if not provided) */
  minLevel?: LogLevel;
  /** Whether logging is enabled (default: true) */
  enabled?: boolean;
}

export const LOGGING_CONFIG = new InjectionToken<LoggingConfig>('LOGGING_CONFIG');

// ============================================
// LOGGING SERVICE
// ============================================

/**
 * Shared Angular Logging Service
 *
 * Provides centralized, structured logging throughout the application.
 * Works identically on web and mobile platforms.
 */
@Injectable({ providedIn: 'root' })
export class NxtLoggingService implements ILogger {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly platform = inject(NxtPlatformService);
  private readonly config = inject(LOGGING_CONFIG, { optional: true });

  private readonly logger: ILogger;
  private readonly childLoggers = new Map<string, ILogger>();

  constructor() {
    const isBrowser = isPlatformBrowser(this.platformId);
    const isServer = isPlatformServer(this.platformId);

    // Determine environment
    const environment = this.config?.environment ?? this.detectEnvironment();

    // Determine minimum log level based on environment
    const minLevel = this.config?.minLevel ?? this.getMinLevel(environment);

    // Determine platform string
    let platformStr: 'web' | 'ios' | 'android' | 'server' = 'web';
    if (isServer) {
      platformStr = 'server';
    } else if (isBrowser && this.platform.isNative()) {
      // Detect iOS vs Android
      platformStr = this.platform.isIOS() ? 'ios' : 'android';
    }

    // Build transports
    const transports = this.buildTransports(isBrowser, environment);

    // Create logger configuration
    const loggerConfig: LoggerConfig = {
      environment,
      minLevel,
      enabled: this.config?.enabled ?? true,
      platform: platformStr,
      appVersion: this.config?.appVersion ?? '0.0.0',
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
        'ssn',
      ],
    };

    this.logger = createLogger(loggerConfig, 'NXT1');

    // Log initialization (debug only)
    this.logger.debug('NxtLoggingService initialized', {
      environment,
      minLevel,
      platform: platformStr,
      transportsCount: transports.length,
    });
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private detectEnvironment(): 'development' | 'staging' | 'production' {
    if (isDevMode()) return 'development';
    // In production builds, isDevMode() is false
    // Could check URL or other signals for staging vs production
    return 'production';
  }

  private getMinLevel(environment: string): LogLevel {
    switch (environment) {
      case 'development':
        return 'debug';
      case 'staging':
        return 'info';
      case 'production':
        return 'warn';
      default:
        return 'info';
    }
  }

  private buildTransports(isBrowser: boolean, environment: string) {
    const transports = [];

    // Always add console transport
    transports.push(
      consoleTransport({
        colors: !isBrowser, // ANSI colors only in Node (server/CLI)
        includeTimestamp: true,
        includeNamespace: true,
        prettyPrint: environment === 'development',
      })
    );

    // Add remote transport in production if endpoint configured
    if (environment === 'production' && isBrowser && this.config?.remoteEndpoint) {
      transports.push(
        remoteTransport({
          endpoint: this.config.remoteEndpoint,
          batchSize: LOGGING_DEFAULTS.REMOTE_BATCH_SIZE,
          flushInterval: LOGGING_DEFAULTS.REMOTE_FLUSH_INTERVAL,
          maxRetries: LOGGING_DEFAULTS.REMOTE_MAX_RETRIES,
        })
      );
    }

    return transports;
  }

  // ============================================
  // PUBLIC API (ILogger implementation)
  // ============================================

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
   * Create a child logger with a specific namespace.
   * Useful for service-specific logging.
   *
   * @example
   * ```typescript
   * private readonly logger = inject(NxtLoggingService).child('AuthService');
   * ```
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
   * Set global context that will be included in all log entries
   */
  setContext(context: LogContext): void {
    this.logger.setContext(context);
  }

  /**
   * Clear global context
   */
  clearContext(): void {
    this.logger.clearContext();
  }

  /**
   * Flush any pending log entries (for remote transport)
   */
  async flush(): Promise<void> {
    await this.logger.flush();
  }

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  /**
   * Set user context for all subsequent logs.
   * Call this after user authentication.
   */
  setUser(userId: string, email?: string): void {
    this.setContext({
      userId,
      ...(email && { userEmail: email }),
    });
  }

  /**
   * Clear user context (call on logout)
   */
  clearUser(): void {
    this.clearContext();
  }
}
