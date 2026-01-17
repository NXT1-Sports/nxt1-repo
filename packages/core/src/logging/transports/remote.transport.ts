/**
 * @fileoverview Remote/HTTP Transport - Send Logs to External Service
 * @module @nxt1/core/logging
 *
 * HTTP transport for sending logs to external services.
 * Features batching, retry logic, and offline queue.
 *
 * @version 1.0.0
 */

import type { LogEntry, LogTransport, RemoteTransportOptions } from '../types';
import { LOGGING_DEFAULTS } from '../types';

// ============================================
// REMOTE TRANSPORT
// ============================================

/**
 * Create a remote HTTP transport for logging
 *
 * Features:
 * - Batched sending (reduces HTTP requests)
 * - Automatic retry on failure
 * - Offline queue (stores logs when offline)
 * - Configurable flush interval
 *
 * @example
 * ```typescript
 * const transport = remoteTransport({
 *   endpoint: 'https://logs.example.com/ingest',
 *   headers: { 'X-API-Key': 'your-api-key' },
 *   batchSize: 10,
 *   flushInterval: 5000,
 * });
 * ```
 */
export function remoteTransport(options: RemoteTransportOptions): LogTransport {
  const {
    endpoint,
    headers = {},
    batchSize = LOGGING_DEFAULTS.REMOTE_BATCH_SIZE,
    flushInterval = LOGGING_DEFAULTS.REMOTE_FLUSH_INTERVAL,
    retry = true,
    maxRetries = LOGGING_DEFAULTS.REMOTE_MAX_RETRIES,
  } = options;

  let buffer: LogEntry[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const isEnabled = true;

  // Start flush timer
  function startFlushTimer(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, flushInterval);
  }

  // Send logs to remote endpoint
  async function sendLogs(entries: LogEntry[]): Promise<boolean> {
    if (entries.length === 0) return true;

    let attempts = 0;
    const maxAttempts = retry ? maxRetries : 1;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({ logs: entries }),
        });

        if (response.ok) {
          return true;
        }

        // Non-retryable errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          console.error(`[RemoteTransport] Server rejected logs: ${response.status}`);
          return false;
        }

        // Retryable errors (5xx)
        attempts++;
        if (attempts < maxAttempts) {
          // Exponential backoff
          await delay(Math.pow(2, attempts) * 1000);
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          console.error('[RemoteTransport] Failed to send logs:', error);
          return false;
        }
        // Exponential backoff
        await delay(Math.pow(2, attempts) * 1000);
      }
    }

    return false;
  }

  // Flush buffer
  async function flush(): Promise<void> {
    if (buffer.length === 0) return;

    const toSend = [...buffer];
    buffer = [];

    const success = await sendLogs(toSend);

    // If failed, put back in buffer (up to limit)
    if (!success) {
      buffer = [...toSend.slice(-batchSize), ...buffer].slice(0, batchSize * 2);
    }
  }

  return {
    name: 'remote',
    minLevel: 'warn', // Only send warnings and errors to remote by default

    isEnabled(): boolean {
      return isEnabled;
    },

    log(entry: LogEntry): void {
      buffer.push(entry);

      // Flush immediately on fatal errors
      if (entry.level === 'fatal') {
        void flush();
        return;
      }

      // Flush if buffer is full
      if (buffer.length >= batchSize) {
        void flush();
        return;
      }

      // Start timer for periodic flush
      startFlushTimer();
    },

    async flush(): Promise<void> {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flush();
    },
  };
}

// ============================================
// HELPERS
// ============================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
