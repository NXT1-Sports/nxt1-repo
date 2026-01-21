/**
 * @fileoverview Logging Types - Pure TypeScript Definitions
 * @module @nxt1/core/logging
 *
 * Type definitions for the centralized logging system.
 * Zero dependencies - fully portable across all platforms.
 *
 * @version 1.0.0
 */

// ============================================
// CONFIGURATION CONSTANTS
// ============================================

/**
 * Default configuration values for logging system
 */
export const LOGGING_DEFAULTS = {
  /** Default batch size for remote transport */
  REMOTE_BATCH_SIZE: 10,

  /** Default flush interval for remote transport (5 seconds) */
  REMOTE_FLUSH_INTERVAL: 5000,

  /** Default max retries for remote transport */
  REMOTE_MAX_RETRIES: 3,

  /** Default retry delay for remote transport (1 second) */
  REMOTE_RETRY_DELAY: 1000,

  /** Maximum data size in bytes (100KB) */
  MAX_DATA_SIZE: 100 * 1024,

  /** Default namespace for logger */
  DEFAULT_NAMESPACE: 'App',
} as const;

// ============================================
// LOG LEVELS
// ============================================

/**
 * Log level hierarchy (from most to least verbose)
 *
 * debug: Development-only detailed information
 * info: General operational messages
 * warn: Warning conditions (recoverable issues)
 * error: Error conditions (requires attention)
 * fatal: Critical errors (application may crash)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Numeric priority for log levels (higher = more severe)
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
} as const;

// ============================================
// LOG ENTRY
// ============================================

/**
 * Structured log entry with full context
 */
export interface LogEntry {
  /** Log level */
  level: LogLevel;

  /** Human-readable message */
  message: string;

  /** Namespace/source of the log (e.g., "AuthService", "HttpInterceptor") */
  namespace: string;

  /** ISO timestamp */
  timestamp: string;

  /** Additional structured data */
  data?: Record<string, unknown>;

  /** Error object if applicable */
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };

  /** Contextual tags for filtering */
  tags?: string[];

  /** Correlation ID for request tracing */
  correlationId?: string;

  /** User ID (if available and permitted) */
  userId?: string;

  /** Session ID */
  sessionId?: string;

  /** Platform info */
  platform?: {
    type: 'web' | 'ios' | 'android' | 'server';
    version?: string;
    userAgent?: string;
  };
}

// ============================================
// LOG TRANSPORT
// ============================================

/**
 * Transport interface for log output destinations
 *
 * Transports are responsible for sending logs to their final destination
 * (console, Sentry, file, analytics, etc.)
 */
export interface LogTransport {
  /** Unique name for this transport */
  name: string;

  /** Minimum log level this transport handles */
  minLevel: LogLevel;

  /** Process a log entry */
  log(entry: LogEntry): void | Promise<void>;

  /** Flush any buffered logs (called on shutdown) */
  flush?(): void | Promise<void>;

  /** Check if transport is enabled */
  isEnabled(): boolean;
}

// ============================================
// LOGGER CONFIGURATION
// ============================================

/**
 * Environment types for conditional logging
 */
export type Environment = 'development' | 'staging' | 'production' | 'test';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Current environment */
  environment: Environment;

  /** Minimum log level to process */
  minLevel: LogLevel;

  /** Enable/disable all logging */
  enabled: boolean;

  /** Default tags to add to all log entries */
  defaultTags?: string[];

  /** App version for tracking */
  appVersion?: string;

  /** Platform type */
  platform?: 'web' | 'ios' | 'android' | 'server';

  /** Transports to use */
  transports: LogTransport[];

  /** Redact sensitive fields from data */
  redactFields?: string[];

  /** Maximum data payload size (bytes) */
  maxDataSize?: number;

  /** Sample rate for debug logs (0-1) */
  debugSampleRate?: number;

  /** Callback for custom error handling in transports */
  onTransportError?: (transport: string, error: unknown) => void;
}

// ============================================
// LOGGER CONTEXT
// ============================================

/**
 * Contextual data that can be set globally or per-request
 */
export interface LogContext {
  /** User ID */
  userId?: string;

  /** Session ID */
  sessionId?: string;

  /** Correlation/Request ID */
  correlationId?: string;

  /** Additional context data */
  [key: string]: unknown;
}

// ============================================
// LOGGER INTERFACE
// ============================================

/**
 * Main logger interface
 */
export interface ILogger {
  /** Log at debug level */
  debug(message: string, data?: Record<string, unknown>): void;

  /** Log at info level */
  info(message: string, data?: Record<string, unknown>): void;

  /** Log at warn level */
  warn(message: string, data?: Record<string, unknown>): void;

  /** Log at error level */
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;

  /** Log at fatal level */
  fatal(message: string, error?: unknown, data?: Record<string, unknown>): void;

  /** Create a child logger with additional namespace */
  child(namespace: string): ILogger;

  /** Set context that persists across log calls */
  setContext(context: Partial<LogContext>): void;

  /** Clear context */
  clearContext(): void;

  /** Flush all transports */
  flush(): Promise<void>;
}

// ============================================
// TRANSPORT FACTORY TYPES
// ============================================

/**
 * Console transport options
 */
export interface ConsoleTransportOptions {
  /** Use colors in output */
  colors?: boolean;

  /** Include timestamp in output */
  includeTimestamp?: boolean;

  /** Include namespace in output */
  includeNamespace?: boolean;

  /** Pretty print data objects */
  prettyPrint?: boolean;
}

/**
 * Sentry transport options
 */
export interface SentryTransportOptions {
  /** Sentry DSN */
  dsn: string;

  /** Environment name */
  environment?: Environment;

  /** Release version */
  release?: string;

  /** Sample rate for errors (0-1) */
  sampleRate?: number;

  /** Additional tags */
  tags?: Record<string, string>;
}

/**
 * Analytics transport options
 */
export interface AnalyticsTransportOptions {
  /** Analytics adapter (Firebase, Amplitude, etc.) */
  adapter: {
    trackEvent: (name: string, params?: Record<string, unknown>) => void;
  };

  /** Prefix for event names */
  eventPrefix?: string;

  /** Map log levels to event tracking */
  levelMapping?: Partial<Record<LogLevel, boolean>>;
}

/**
 * Remote/HTTP transport options
 */
export interface RemoteTransportOptions {
  /** Endpoint URL */
  endpoint: string;

  /** HTTP headers */
  headers?: Record<string, string>;

  /** Batch size before sending */
  batchSize?: number;

  /** Flush interval in ms */
  flushInterval?: number;

  /** Retry on failure */
  retry?: boolean;

  /** Max retries */
  maxRetries?: number;
}
