/**
 * @fileoverview Core Logger Implementation
 * @module @nxt1/core/logging
 *
 * Enterprise-grade centralized logger with:
 * - Multiple transport support (console, Sentry, analytics, remote)
 * - Structured logging with context
 * - Sensitive data redaction
 * - Environment-aware configuration
 * - Async transport handling
 *
 * Pure TypeScript - Zero framework dependencies.
 *
 * @example
 * ```typescript
 * import { createLogger, consoleTransport } from '@nxt1/core/logging';
 *
 * const logger = createLogger({
 *   environment: 'development',
 *   minLevel: 'debug',
 *   enabled: true,
 *   transports: [consoleTransport({ colors: true })],
 * });
 *
 * logger.info('Application started', { version: '1.0.0' });
 * logger.error('Failed to connect', error, { endpoint: '/api/users' });
 * ```
 *
 * @version 1.0.0
 */

import type { LogLevel, LogEntry, LoggerConfig, LogContext, ILogger } from './types';
import { LOG_LEVEL_PRIORITY, LOGGING_DEFAULTS } from './types';

// ============================================
// CONSTANTS
// ============================================

/** Default fields to redact from log data */
const DEFAULT_REDACT_FIELDS: string[] = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'creditCard',
  'ssn',
  'cardNumber',
  'cvv',
  'pin',
];

/** Redaction placeholder */
const REDACTED = '[REDACTED]';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a unique correlation ID
 */
function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Deep clone and redact sensitive fields from an object
 */
function redactSensitiveData(
  data: Record<string, unknown>,
  fieldsToRedact: string[]
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  const lowerCaseFields = fieldsToRedact.map((f) => f.toLowerCase());

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // Check if field should be redacted
    if (lowerCaseFields.some((field) => lowerKey.includes(field))) {
      redacted[key] = REDACTED;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveData(value as Record<string, unknown>, fieldsToRedact);
    } else if (Array.isArray(value)) {
      // Handle arrays
      redacted[key] = value.map((item) =>
        item && typeof item === 'object'
          ? redactSensitiveData(item as Record<string, unknown>, fieldsToRedact)
          : item
      );
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Truncate data if it exceeds max size
 */
function truncateData(
  data: Record<string, unknown>,
  maxSize: number = LOGGING_DEFAULTS.MAX_DATA_SIZE
): Record<string, unknown> {
  const serialized = JSON.stringify(data);
  if (serialized.length <= maxSize) {
    return data;
  }

  return {
    _truncated: true,
    _originalSize: serialized.length,
    _maxSize: maxSize,
    message: 'Data truncated due to size limit',
  };
}

/**
 * Extract error details from unknown error type
 */
function extractErrorDetails(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as Error & { code?: string }).code,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    };
  }

  if (typeof error === 'object') {
    const err = error as Record<string, unknown>;
    return {
      name: (err['name'] as string) || 'Error',
      message: (err['message'] as string) || String(error),
      code: err['code'] as string | undefined,
    };
  }

  return {
    name: 'Error',
    message: String(error),
  };
}

/**
 * Check if log level should be processed
 */
function shouldLog(entryLevel: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[entryLevel] >= LOG_LEVEL_PRIORITY[minLevel];
}

// ============================================
// LOGGER CLASS
// ============================================

/**
 * Core Logger Implementation
 *
 * Thread-safe, async-aware logger with multiple transport support.
 */
class Logger implements ILogger {
  private context: LogContext = {};
  private correlationId: string;

  constructor(
    private readonly namespace: string,
    private readonly config: LoggerConfig
  ) {
    this.correlationId = generateCorrelationId();
  }

  // ----------------------------------------
  // PUBLIC API
  // ----------------------------------------

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, undefined, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, undefined, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, undefined, data);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    this.log('error', message, error, data);
  }

  fatal(message: string, error?: unknown, data?: Record<string, unknown>): void {
    this.log('fatal', message, error, data);
  }

  child(childNamespace: string): ILogger {
    const fullNamespace = this.namespace ? `${this.namespace}:${childNamespace}` : childNamespace;
    const childLogger = new Logger(fullNamespace, this.config);
    childLogger.context = { ...this.context };
    childLogger.correlationId = this.correlationId;
    return childLogger;
  }

  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  async flush(): Promise<void> {
    const flushPromises = this.config.transports
      .filter((t) => t.flush)
      .map((t) => {
        try {
          return t.flush!();
        } catch (err) {
          this.handleTransportError(t.name, err);
          return Promise.resolve();
        }
      });

    await Promise.all(flushPromises);
  }

  // ----------------------------------------
  // PRIVATE METHODS
  // ----------------------------------------

  private log(
    level: LogLevel,
    message: string,
    error?: unknown,
    data?: Record<string, unknown>
  ): void {
    // Check if logging is enabled
    if (!this.config.enabled) return;

    // Check minimum log level
    if (!shouldLog(level, this.config.minLevel)) return;

    // Apply debug sampling in production
    if (
      level === 'debug' &&
      this.config.debugSampleRate !== undefined &&
      Math.random() > this.config.debugSampleRate
    ) {
      return;
    }

    // Build log entry
    const entry = this.buildLogEntry(level, message, error, data);

    // Send to all transports
    this.dispatchToTransports(entry);
  }

  private buildLogEntry(
    level: LogLevel,
    message: string,
    error?: unknown,
    data?: Record<string, unknown>
  ): LogEntry {
    const redactFields = this.config.redactFields || DEFAULT_REDACT_FIELDS;
    const maxDataSize = this.config.maxDataSize || LOGGING_DEFAULTS.MAX_DATA_SIZE;

    // Process data
    let processedData = data ? redactSensitiveData(data, redactFields) : undefined;
    if (processedData) {
      processedData = truncateData(processedData, maxDataSize);
    }

    const entry: LogEntry = {
      level,
      message,
      namespace: this.namespace,
      timestamp: new Date().toISOString(),
      data: processedData,
      error: extractErrorDetails(error),
      tags: this.config.defaultTags,
      correlationId: this.context.correlationId || this.correlationId,
      userId: this.context.userId,
      sessionId: this.context.sessionId,
    };

    // Add platform info if available
    if (this.config.platform || this.config.appVersion) {
      entry.platform = {
        type: this.config.platform || 'web',
        version: this.config.appVersion,
      };
    }

    return entry;
  }

  private dispatchToTransports(entry: LogEntry): void {
    for (const transport of this.config.transports) {
      // Check if transport is enabled and accepts this log level
      if (!transport.isEnabled()) continue;
      if (!shouldLog(entry.level, transport.minLevel)) continue;

      try {
        const result = transport.log(entry);

        // Handle async transports
        if (result instanceof Promise) {
          result.catch((err) => this.handleTransportError(transport.name, err));
        }
      } catch (err) {
        this.handleTransportError(transport.name, err);
      }
    }
  }

  private handleTransportError(transportName: string, error: unknown): void {
    // Avoid infinite loops - use console directly
    console.error(`[Logger] Transport "${transportName}" error:`, error);

    // Call custom error handler if provided
    if (this.config.onTransportError) {
      try {
        this.config.onTransportError(transportName, error);
      } catch {
        // Ignore errors in error handler
      }
    }
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a new logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   environment: 'production',
 *   minLevel: 'warn',
 *   enabled: true,
 *   platform: 'web',
 *   appVersion: '1.0.0',
 *   transports: [
 *     consoleTransport({ colors: true }),
 *     sentryTransport({ dsn: 'https://...' }),
 *   ],
 * });
 * ```
 */
export function createLogger(
  config: LoggerConfig,
  namespace: string = LOGGING_DEFAULTS.DEFAULT_NAMESPACE
): ILogger {
  return new Logger(namespace, config);
}

/**
 * Create a child logger with a specific namespace
 *
 * @example
 * ```typescript
 * // In a service
 * const logger = createNamespacedLogger(rootLogger, 'AuthService');
 * logger.info('User logged in', { userId: '123' });
 * // Output: [AuthService] User logged in { userId: '123' }
 * ```
 */
export function createNamespacedLogger(parent: ILogger, namespace: string): ILogger {
  return parent.child(namespace);
}

// ============================================
// NULL LOGGER (for testing/disabled logging)
// ============================================

/**
 * No-op logger for testing or when logging is disabled
 */
export const nullLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => nullLogger,
  setContext: () => {},
  clearContext: () => {},
  flush: () => Promise.resolve(),
};
