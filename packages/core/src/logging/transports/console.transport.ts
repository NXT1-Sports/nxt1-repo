/**
 * @fileoverview Console Transport - Pretty-printed Console Output
 * @module @nxt1/core/logging
 *
 * Console transport with color support, formatting, and filtering.
 * Ideal for development and debugging.
 *
 * @version 1.0.0
 */

import type { LogEntry, LogLevel, LogTransport, ConsoleTransportOptions } from '../types';

// ============================================
// COLORS (ANSI Escape Codes)
// ============================================

const COLORS = {
  reset: '\x1b[0m',
  // Levels
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  fatal: '\x1b[35m', // Magenta
  // Extras
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  namespace: '\x1b[34m', // Blue
} as const;

/** Level icons for visual distinction */
const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️ ',
  warn: '⚠️ ',
  error: '❌',
  fatal: '💀',
};

/** Level labels */
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
  fatal: 'FATAL',
};

// ============================================
// CONSOLE TRANSPORT
// ============================================

/**
 * Create a console transport for logging
 *
 * @example
 * ```typescript
 * const transport = consoleTransport({
 *   colors: true,
 *   includeTimestamp: true,
 *   prettyPrint: true,
 * });
 * ```
 */
export function consoleTransport(options: ConsoleTransportOptions = {}): LogTransport {
  const {
    colors = true,
    includeTimestamp = true,
    includeNamespace = true,
    prettyPrint = true,
  } = options;

  // Detect if running in browser (no color support in standard console)
  const isBrowser = typeof window !== 'undefined';
  const useColors = colors && !isBrowser;

  return {
    name: 'console',
    minLevel: 'debug',

    isEnabled(): boolean {
      return true;
    },

    log(entry: LogEntry): void {
      const output = formatLogEntry(entry, {
        useColors,
        includeTimestamp,
        includeNamespace,
        prettyPrint,
        isBrowser,
      });

      // Use appropriate console method
      const consoleFn = getConsoleMethod(entry.level);

      if (isBrowser) {
        // Browser: Use styled console output
        consoleFn(...output);
      } else {
        // Node: Use plain string
        consoleFn(output);
      }
    },
  };
}

// ============================================
// FORMATTING HELPERS
// ============================================

interface FormatOptions {
  useColors: boolean;
  includeTimestamp: boolean;
  includeNamespace: boolean;
  prettyPrint: boolean;
  isBrowser: boolean;
}

function formatLogEntry(entry: LogEntry, options: FormatOptions): unknown[] | string {
  const { useColors, includeTimestamp, includeNamespace, prettyPrint, isBrowser } = options;

  if (isBrowser) {
    return formatForBrowser(entry, { includeTimestamp, includeNamespace, prettyPrint });
  }

  return formatForNode(entry, { useColors, includeTimestamp, includeNamespace, prettyPrint });
}

/**
 * Format log entry for browser console (with CSS styles)
 */
function formatForBrowser(
  entry: LogEntry,
  options: Pick<FormatOptions, 'includeTimestamp' | 'includeNamespace' | 'prettyPrint'>
): unknown[] {
  const { includeTimestamp, includeNamespace, prettyPrint } = options;

  const parts: string[] = [];
  const styles: string[] = [];
  const args: unknown[] = [];

  // Icon
  parts.push(`%c${LEVEL_ICONS[entry.level]}`);
  styles.push('');

  // Level
  parts.push(`%c[${LEVEL_LABELS[entry.level]}]`);
  styles.push(getLevelStyle(entry.level));

  // Timestamp
  if (includeTimestamp) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    parts.push(`%c${time}`);
    styles.push('color: gray; font-size: 10px;');
  }

  // Namespace
  if (includeNamespace && entry.namespace) {
    parts.push(`%c[${entry.namespace}]`);
    styles.push('color: #6366f1; font-weight: bold;');
  }

  // Message
  parts.push(`%c${entry.message}`);
  styles.push('color: inherit;');

  // Build format string
  const formatString = parts.join(' ');
  args.push(formatString, ...styles);

  // Add data
  if (entry.data && Object.keys(entry.data).length > 0) {
    if (prettyPrint) {
      args.push('\n', entry.data);
    } else {
      args.push(entry.data);
    }
  }

  // Add error
  if (entry.error) {
    args.push('\n', {
      error: entry.error.name,
      message: entry.error.message,
      ...(entry.error.stack && { stack: entry.error.stack }),
    });
  }

  return args;
}

/**
 * Format log entry for Node.js terminal (with ANSI colors)
 */
function formatForNode(
  entry: LogEntry,
  options: Pick<
    FormatOptions,
    'useColors' | 'includeTimestamp' | 'includeNamespace' | 'prettyPrint'
  >
): string {
  const { useColors, includeTimestamp, includeNamespace, prettyPrint } = options;

  const parts: string[] = [];
  const c = useColors
    ? COLORS
    : {
        reset: '',
        debug: '',
        info: '',
        warn: '',
        error: '',
        fatal: '',
        dim: '',
        bold: '',
        namespace: '',
      };

  // Icon and Level
  parts.push(
    `${LEVEL_ICONS[entry.level]} ${c[entry.level]}[${LEVEL_LABELS[entry.level]}]${c.reset}`
  );

  // Timestamp
  if (includeTimestamp) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    parts.push(`${c.dim}${time}${c.reset}`);
  }

  // Namespace
  if (includeNamespace && entry.namespace) {
    parts.push(`${c.namespace}[${entry.namespace}]${c.reset}`);
  }

  // Message
  parts.push(entry.message);

  let output = parts.join(' ');

  // Add data
  if (entry.data && Object.keys(entry.data).length > 0) {
    const dataStr = prettyPrint ? JSON.stringify(entry.data, null, 2) : JSON.stringify(entry.data);
    output += `\n${c.dim}${dataStr}${c.reset}`;
  }

  // Add error
  if (entry.error) {
    output += `\n${c.error}${entry.error.name}: ${entry.error.message}${c.reset}`;
    if (entry.error.stack) {
      output += `\n${c.dim}${entry.error.stack}${c.reset}`;
    }
  }

  return output;
}

/**
 * Get browser CSS style for log level
 */
function getLevelStyle(level: LogLevel): string {
  const styles: Record<LogLevel, string> = {
    debug: 'color: #06b6d4; font-weight: bold;', // Cyan
    info: 'color: #22c55e; font-weight: bold;', // Green
    warn: 'color: #eab308; font-weight: bold;', // Yellow
    error: 'color: #ef4444; font-weight: bold;', // Red
    fatal: 'color: #a855f7; font-weight: bold;', // Purple
  };
  return styles[level];
}

/**
 * Get appropriate console method for log level
 */
function getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
  switch (level) {
    case 'debug':
      return console.debug.bind(console);
    case 'info':
      return console.info.bind(console);
    case 'warn':
      return console.warn.bind(console);
    case 'error':
    case 'fatal':
      return console.error.bind(console);
    default:
      return console.log.bind(console);
  }
}
