/**
 * @fileoverview Analytics Transport - Track Errors in Analytics
 * @module @nxt1/core/logging
 *
 * Analytics transport for tracking error events.
 * Works with any analytics provider (Firebase, Amplitude, etc.)
 *
 * @version 1.0.0
 */

import type { LogEntry, LogTransport, AnalyticsTransportOptions } from '../types';

// ============================================
// ANALYTICS ADAPTER INTERFACE
// ============================================

/**
 * Analytics adapter interface
 *
 * Allows logger to work with any analytics provider.
 */
export interface AnalyticsAdapter {
  /** Track an event */
  trackEvent(name: string, params?: Record<string, unknown>): void;

  /** Set user property */
  setUserProperty?(key: string, value: string | number | boolean): void;

  /** Set user ID */
  setUserId?(userId: string | null): void;
}

// ============================================
// ANALYTICS TRANSPORT
// ============================================

/**
 * Create an analytics transport for error tracking
 *
 * @example
 * ```typescript
 * import { Analytics } from '@angular/fire/analytics';
 *
 * const transport = analyticsTransport({
 *   adapter: {
 *     trackEvent: (name, params) => analytics.logEvent(name, params),
 *   },
 *   eventPrefix: 'log_',
 * });
 * ```
 */
export function analyticsTransport(
  adapter: AnalyticsAdapter,
  options: Omit<AnalyticsTransportOptions, 'adapter'> = {}
): LogTransport {
  const {
    eventPrefix = 'log_',
    levelMapping = {
      debug: false, // Don't track debug
      info: false, // Don't track info
      warn: true, // Track warnings
      error: true, // Track errors
      fatal: true, // Track fatal
    },
  } = options;

  return {
    name: 'analytics',
    minLevel: 'warn',

    isEnabled(): boolean {
      return true;
    },

    log(entry: LogEntry): void {
      // Check if this level should be tracked
      if (!levelMapping[entry.level]) {
        return;
      }

      // Set user ID if available
      if (entry.userId && adapter.setUserId) {
        adapter.setUserId(entry.userId);
      }

      // Build event params
      const params: Record<string, unknown> = {
        level: entry.level,
        namespace: entry.namespace,
        message: truncate(entry.message, 100),
        timestamp: entry.timestamp,
      };

      // Add error info
      if (entry.error) {
        params['error_name'] = entry.error.name;
        params['error_message'] = truncate(entry.error.message, 100);
        if (entry.error.code) {
          params['error_code'] = entry.error.code;
        }
      }

      // Add correlation ID
      if (entry.correlationId) {
        params['correlation_id'] = entry.correlationId;
      }

      // Add selected data fields (limited for analytics)
      if (entry.data) {
        // Only include primitive values (analytics doesn't support nested objects well)
        Object.entries(entry.data).forEach(([key, value]) => {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            params[`data_${key}`] = typeof value === 'string' ? truncate(value, 50) : value;
          }
        });
      }

      // Track the event
      const eventName = `${eventPrefix}${entry.level}`;
      adapter.trackEvent(eventName, params);
    },
  };
}

// ============================================
// HELPERS
// ============================================

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
