/**
 * @fileoverview Backend Logger Utility
 * @module @nxt1/backend/utils/logger
 *
 * Environment-aware logging for Node.js backend.
 * Filters logs based on NODE_ENV:
 * - production: Only errors and critical info
 * - staging/development: All logs including debug/trace
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Determine if a log level should be visible based on environment
 */
function shouldLog(level: LogLevel, environment: string): boolean {
  if (environment === 'production') {
    return ['error', 'warn'].includes(level);
  }
  // In staging/development, log everything
  return true;
}

/**
 * Format and log a message with context
 */
function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toLocaleTimeString();
  const levelEmoji = {
    error: '❌',
    warn: '⚠️ ',
    info: 'ℹ️ ',
    debug: '🔍',
    trace: '📍',
  }[level];

  let output = `${levelEmoji} [${level.toUpperCase()}] ${timestamp} ${message}`;

  if (context && Object.keys(context).length > 0) {
    output += `\n${JSON.stringify(context, null, 2)}`;
  }

  return output;
}

/**
 * Backend logger instance
 */
export const logger = {
  error(message: string, context?: LogContext): void {
    if (shouldLog('error', process.env['NODE_ENV'] || 'development')) {
      console.error(formatLog('error', message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    if (shouldLog('warn', process.env['NODE_ENV'] || 'development')) {
      console.warn(formatLog('warn', message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (shouldLog('info', process.env['NODE_ENV'] || 'development')) {
      console.log(formatLog('info', message, context));
    }
  },

  debug(message: string, context?: LogContext): void {
    if (shouldLog('debug', process.env['NODE_ENV'] || 'development')) {
      console.log(formatLog('debug', message, context));
    }
  },

  trace(message: string, context?: LogContext): void {
    if (shouldLog('trace', process.env['NODE_ENV'] || 'development')) {
      console.log(formatLog('trace', message, context));
    }
  },
};

/**
 * HTTP Context Logger - For request/response logging
 */
export const httpLogger = {
  request(method: string, path: string, context?: LogContext): void {
    if (shouldLog('debug', process.env['NODE_ENV'] || 'development')) {
      console.log(formatLog('debug', `→ ${method} ${path}`, context));
    }
  },

  response(method: string, path: string, status: number, context?: LogContext): void {
    if (shouldLog('debug', process.env['NODE_ENV'] || 'development')) {
      const statusEmoji = status >= 400 ? '❌' : status >= 300 ? '🟡' : '✅';
      console.log(formatLog('debug', `${statusEmoji} ${method} ${path} → ${status}`, context));
    }
  },

  error(method: string, path: string, error: Error | string, context?: LogContext): void {
    if (shouldLog('error', process.env['NODE_ENV'] || 'development')) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(formatLog('error', `❌ ${method} ${path} → ${errorMsg}`, context));
    }
  },
};
