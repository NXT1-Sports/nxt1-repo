/**
 * @fileoverview Backend Logger Utility
 * @module @nxt1/backend/utils/logger
 *
 * Environment-aware, structured logging for Node.js backend.
 *
 * Production (NODE_ENV=production):
 *   Emits newline-delimited JSON understood by Google Cloud Logging / Cloud Run.
 *   Visible levels: error, warn, info  (debug/trace suppressed to reduce noise).
 *
 * Staging / Development:
 *   Emits human-readable coloured text with emoji prefixes.
 *   All levels (error → trace) are visible.
 *
 * GCP severity mapping (used when emitting JSON):
 *   error  → ERROR
 *   warn   → WARNING
 *   info   → INFO
 *   debug  → DEBUG
 *   trace  → DEBUG
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Structured log context – any serialisable key/value pairs. */
interface LogContext {
  [key: string]: unknown;
}

// ============================================
// ENVIRONMENT HELPERS
// ============================================

const ENV = process.env['NODE_ENV'] || 'development';
const IS_PRODUCTION = ENV === 'production';

/** Log-level visibility matrix. */
const VISIBLE_LEVELS: Record<string, Set<LogLevel>> = {
  production: new Set(['error', 'warn', 'info']),
  default: new Set(['error', 'warn', 'info', 'debug', 'trace']),
};

function shouldLog(level: LogLevel): boolean {
  const allowed = VISIBLE_LEVELS[ENV] ?? VISIBLE_LEVELS['default']!;
  return allowed.has(level);
}

// ============================================
// FORMATTERS
// ============================================

/** GCP Cloud Logging severity labels. */
const GCP_SEVERITY: Record<LogLevel, string> = {
  error: 'ERROR',
  warn: 'WARNING',
  info: 'INFO',
  debug: 'DEBUG',
  trace: 'DEBUG',
};

/**
 * Emit a structured JSON log entry (one line) as required by Google Cloud Logging.
 * https://cloud.google.com/logging/docs/structured-logging
 */
function emitJson(level: LogLevel, message: string, context?: LogContext): void {
  const entry: Record<string, unknown> = {
    severity: GCP_SEVERITY[level],
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/** Emoji prefix for human-readable output. */
const LEVEL_EMOJI: Record<LogLevel, string> = {
  error: '❌',
  warn: '⚠️ ',
  info: 'ℹ️ ',
  debug: '🔍',
  trace: '📍',
};

/**
 * Emit a coloured, human-readable log line for local development.
 */
function emitText(level: LogLevel, message: string, context?: LogContext): void {
  const timestamp = new Date().toLocaleTimeString();
  let output = `${LEVEL_EMOJI[level]} [${level.toUpperCase()}] ${timestamp} ${message}`;
  if (context && Object.keys(context).length > 0) {
    output += '\n' + JSON.stringify(context, null, 2);
  }
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;
  if (IS_PRODUCTION) {
    emitJson(level, message, context);
  } else {
    emitText(level, message, context);
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Backend logger instance.
 *
 * @example
 * logger.info('Server started', { port: 3000 });
 * logger.error('Database connection failed', { error: err.message });
 */
export const logger = {
  error(message: string, context?: LogContext): void {
    emit('error', message, context);
  },
  warn(message: string, context?: LogContext): void {
    emit('warn', message, context);
  },
  info(message: string, context?: LogContext): void {
    emit('info', message, context);
  },
  debug(message: string, context?: LogContext): void {
    emit('debug', message, context);
  },
  trace(message: string, context?: LogContext): void {
    emit('trace', message, context);
  },
};

/**
 * HTTP Context Logger – convenience wrapper for request/response logging.
 */
export const httpLogger = {
  request(method: string, path: string, context?: LogContext): void {
    emit('debug', `→ ${method} ${path}`, context);
  },

  response(method: string, path: string, status: number, context?: LogContext): void {
    const statusEmoji = status >= 400 ? '❌' : status >= 300 ? '🟡' : '✅';
    emit('debug', `${statusEmoji} ${method} ${path} → ${status}`, context);
  },

  error(method: string, path: string, error: Error | string, context?: LogContext): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    emit('error', `❌ ${method} ${path} → ${errorMsg}`, context);
  },
};
