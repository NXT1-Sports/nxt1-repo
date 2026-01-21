/**
 * @fileoverview Sentry Transport - Error Tracking Integration
 * @module @nxt1/core/logging
 *
 * Sentry transport for error tracking and performance monitoring.
 * Pure interface - Sentry SDK must be provided by the consuming app.
 *
 * @version 1.0.0
 */

import type { LogEntry, LogTransport, LogLevel, SentryTransportOptions } from '../types';

// ============================================
// SENTRY ADAPTER INTERFACE
// ============================================

/**
 * Sentry SDK adapter interface
 *
 * This allows the logger to work with any version of Sentry
 * without directly depending on the @sentry/* packages.
 */
export interface SentryAdapter {
  /** Capture an exception */
  captureException(error: Error, context?: Record<string, unknown>): string;

  /** Capture a message */
  captureMessage(message: string, level?: 'info' | 'warning' | 'error' | 'fatal'): string;

  /** Set user context */
  setUser(user: { id?: string; email?: string; username?: string } | null): void;

  /** Set extra context */
  setExtra(key: string, value: unknown): void;

  /** Set tag */
  setTag(key: string, value: string): void;

  /** Add breadcrumb */
  addBreadcrumb(breadcrumb: {
    message?: string;
    category?: string;
    level?: 'debug' | 'info' | 'warning' | 'error';
    data?: Record<string, unknown>;
  }): void;

  /** Start a span for performance monitoring */
  startSpan?(name: string, callback: () => unknown): unknown;
}

// ============================================
// SENTRY TRANSPORT
// ============================================

/**
 * Create a Sentry transport for error tracking
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/angular';
 *
 * const transport = sentryTransport({
 *   adapter: {
 *     captureException: Sentry.captureException,
 *     captureMessage: Sentry.captureMessage,
 *     setUser: Sentry.setUser,
 *     setExtra: Sentry.setExtra,
 *     setTag: Sentry.setTag,
 *     addBreadcrumb: Sentry.addBreadcrumb,
 *   },
 *   environment: 'production',
 *   release: '1.0.0',
 * });
 * ```
 */
export function sentryTransport(
  adapter: SentryAdapter,
  options: Omit<SentryTransportOptions, 'dsn'> = {}
): LogTransport {
  const { environment = 'production', release, sampleRate = 1.0, tags = {} } = options;

  const isEnabled = true;

  // Set initial tags
  if (tags) {
    for (const [key, value] of Object.entries(tags)) {
      adapter.setTag(key, value as string);
    }
  }

  if (release) {
    adapter.setTag('release', release);
  }

  adapter.setTag('environment', environment);

  return {
    name: 'sentry',
    minLevel: 'warn', // Only send warnings and above to Sentry

    isEnabled(): boolean {
      return isEnabled;
    },

    log(entry: LogEntry): void {
      // Apply sample rate
      if (sampleRate < 1 && Math.random() > sampleRate) {
        return;
      }

      // Set context
      if (entry.userId) {
        adapter.setUser({ id: entry.userId });
      }

      if (entry.correlationId) {
        adapter.setTag('correlation_id', entry.correlationId);
      }

      if (entry.namespace) {
        adapter.setTag('namespace', entry.namespace);
      }

      // Add extra data
      if (entry.data) {
        Object.entries(entry.data).forEach(([key, value]) => {
          adapter.setExtra(key, value);
        });
      }

      // Handle based on level and error presence
      if (entry.error) {
        // Create Error object if we have error details
        const error = new Error(entry.error.message);
        error.name = entry.error.name;
        if (entry.error.stack) {
          error.stack = entry.error.stack;
        }

        adapter.captureException(error, {
          level: mapLogLevelToSentry(entry.level),
          tags: {
            namespace: entry.namespace,
            ...(entry.error.code && { error_code: entry.error.code }),
          },
          extra: entry.data,
        });
      } else {
        // Add as breadcrumb for non-error logs
        if (entry.level === 'warn') {
          adapter.captureMessage(`[${entry.namespace}] ${entry.message}`, 'warning');
        } else {
          // Add breadcrumb for info logs (helps with error context)
          adapter.addBreadcrumb({
            message: entry.message,
            category: entry.namespace,
            level: mapLogLevelToSentryBreadcrumb(entry.level),
            data: entry.data,
          });
        }
      }
    },
  };
}

// ============================================
// HELPERS
// ============================================

function mapLogLevelToSentry(level: LogLevel): 'info' | 'warning' | 'error' | 'fatal' {
  switch (level) {
    case 'debug':
    case 'info':
      return 'info';
    case 'warn':
      return 'warning';
    case 'error':
      return 'error';
    case 'fatal':
      return 'fatal';
    default:
      return 'error';
  }
}

function mapLogLevelToSentryBreadcrumb(level: LogLevel): 'debug' | 'info' | 'warning' | 'error' {
  switch (level) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warning';
    case 'error':
    case 'fatal':
      return 'error';
    default:
      return 'info';
  }
}
