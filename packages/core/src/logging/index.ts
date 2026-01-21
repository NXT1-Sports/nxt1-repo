/**
 * @fileoverview Centralized Logging Package
 * @module @nxt1/core/logging
 *
 * Enterprise-grade logging system for NXT1 monorepo.
 * Works across web, mobile, backend, and cloud functions.
 *
 * @example
 * ```typescript
 * import { createLogger, consoleTransport, LogLevel } from '@nxt1/core/logging';
 *
 * const logger = createLogger({
 *   namespace: 'auth',
 *   minLevel: LogLevel.DEBUG,
 *   transports: [consoleTransport()],
 * });
 *
 * logger.info('User signed in', { userId: '123' });
 * ```
 *
 * @version 1.0.0
 */

// ============================================
// TYPES
// ============================================

export {
  LOG_LEVEL_PRIORITY,
  LOGGING_DEFAULTS,
  type LogLevel,
  type LogEntry,
  type LogTransport,
  type LoggerConfig,
  type ILogger,
  type LogContext,
  type Environment,
  type ConsoleTransportOptions,
  type RemoteTransportOptions,
  type SentryTransportOptions,
  type AnalyticsTransportOptions,
} from './types';

// ============================================
// CORE LOGGER
// ============================================

export { createLogger, createNamespacedLogger, nullLogger } from './logger';

// ============================================
// TRANSPORTS
// ============================================

export {
  consoleTransport,
  remoteTransport,
  sentryTransport,
  analyticsTransport,
  type SentryAdapter,
  type AnalyticsAdapter,
} from './transports';
