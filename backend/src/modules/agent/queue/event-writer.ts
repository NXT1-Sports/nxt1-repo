/**
 * @fileoverview Debounced Event Writer — Batched Firestore Subcollection Writes
 * @module @nxt1/backend/modules/agent/queue
 *
 * Accumulates high-frequency LLM token deltas and flushes them to the
 * `agentJobs/{operationId}/events` subcollection at configurable intervals
 * (default 300ms). This keeps the "live typing" feel while capping Firestore
 * writes to ~3-4/sec instead of hundreds.
 *
 * Non-delta events (step_active, tool_call, done, etc.) are written
 * immediately — they're low-frequency and the UI needs them instantly.
 */

import type { AgentJobRepository, JobEvent, JobEventType } from './job.repository.js';
import { logger } from '../../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Callback signature matching what the Router/BaseAgent emit. */
export interface StreamEvent {
  readonly type: JobEventType;
  readonly agentId?: string;
  readonly message?: string;
  readonly text?: string;
  readonly toolName?: string;
  readonly toolArgs?: string;
  readonly toolResult?: Record<string, unknown>;
  readonly toolSuccess?: boolean;
  readonly success?: boolean;
  readonly error?: string;
  /** Rich card payload for `card` events (planner, data-table, etc.). */
  readonly cardData?: Record<string, unknown>;
}

export type OnStreamEvent = (event: StreamEvent) => void;

// ─── Constants ──────────────────────────────────────────────────────────────

/** How often to flush accumulated delta text to Firestore (ms). */
const DEFAULT_FLUSH_INTERVAL_MS = 300;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Remove keys with `undefined` values so Firestore writes are self-contained. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const cleaned = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned as T;
}

// ─── Debounced Event Writer ─────────────────────────────────────────────────

/**
 * Manages event lifecycle for a single agent job.
 *
 * Usage:
 * ```ts
 * const writer = new DebouncedEventWriter(repo, operationId);
 * writer.emit({ type: 'step_active', message: 'Analyzing...' });
 * writer.emit({ type: 'delta', text: 'Hello ' });
 * writer.emit({ type: 'delta', text: 'world!' });
 * // 300ms later → single Firestore write: { type: 'delta', text: 'Hello world!' }
 * await writer.flush(); // Force-flush remaining buffer
 * ```
 */
export class DebouncedEventWriter {
  private seq = 0;
  private pendingDeltaText = '';
  private pendingDeltaAgentId: string | undefined;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs: number;

  constructor(
    private readonly repo: AgentJobRepository,
    private readonly operationId: string,
    flushIntervalMs?: number
  ) {
    this.flushIntervalMs = flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  }

  /**
   * Emit a stream event. Delta events are buffered; all others write immediately.
   *
   * Non-delta events trigger a synchronous flush of pending deltas first
   * to preserve ordering. Both writes are fire-and-forget (never block the
   * agent pipeline) but sequenced internally via a promise chain.
   */
  emit(event: StreamEvent): void {
    if (event.type === 'delta') {
      this.bufferDelta(event);
    } else {
      // Non-delta events: flush any pending delta first, then write immediately.
      // Chain them so the delta write completes before the immediate write starts,
      // preventing Firestore onSnapshot from briefly showing events out of seq order.
      const deltaPromise = this.flushDeltaPendingIfNeeded();
      deltaPromise
        .then(() => this.writeImmediate(event))
        .catch((err) => {
          logger.warn('[event-writer] Chained write failed', {
            operationId: this.operationId,
            type: event.type,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  }

  /**
   * Force-flush any buffered delta text. Call this when the job completes
   * or before writing a terminal event (`done`).
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pendingDeltaText.length > 0) {
      await this.writeDeltaEvent();
    }
  }

  /**
   * Flush any remaining deltas and clean up timers.
   * Safe to call multiple times. Callers no longer need to call flush()
   * before dispose() — dispose handles it.
   */
  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Best-effort flush of any leftover buffered text
    if (this.pendingDeltaText.length > 0) {
      await this.writeDeltaEvent().catch(() => {});
    }
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private bufferDelta(event: StreamEvent): void {
    this.pendingDeltaText += event.text ?? '';
    this.pendingDeltaAgentId = event.agentId ?? this.pendingDeltaAgentId;

    // Schedule a flush if one isn't already pending
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.writeDeltaEvent().catch((err) => {
          logger.warn('[event-writer] Failed to flush delta', {
            operationId: this.operationId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }, this.flushIntervalMs);
    }
  }

  /**
   * Flush pending delta text and return a promise that resolves when the
   * write completes. Returns a resolved promise if nothing is pending.
   */
  private flushDeltaPendingIfNeeded(): Promise<void> {
    if (this.pendingDeltaText.length === 0) return Promise.resolve();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    return this.writeDeltaEvent();
  }

  private async writeDeltaEvent(): Promise<void> {
    if (this.pendingDeltaText.length === 0) return;

    const text = this.pendingDeltaText;
    const agentId = this.pendingDeltaAgentId;
    this.pendingDeltaText = '';
    this.pendingDeltaAgentId = undefined;

    const jobEvent: Omit<JobEvent, 'createdAt'> = {
      seq: this.seq++,
      type: 'delta',
      agentId,
      text,
    };

    await this.repo.writeJobEvent(this.operationId, jobEvent).catch((err) => {
      logger.warn('[event-writer] Delta write failed', {
        operationId: this.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private writeImmediate(event: StreamEvent): void {
    // Build event object, stripping undefined fields so Firestore writes
    // are self-contained and don't rely on ignoreUndefinedProperties.
    const jobEvent: Omit<JobEvent, 'createdAt'> = stripUndefined({
      seq: this.seq++,
      type: event.type,
      agentId: event.agentId,
      message: event.message,
      text: event.text,
      toolName: event.toolName,
      toolArgs: event.toolArgs,
      toolResult: event.toolResult,
      toolSuccess: event.toolSuccess,
      success: event.success,
      error: event.error,
      cardData: event.cardData,
    });

    // Fire-and-forget — never block the agent pipeline on Firestore writes
    this.repo.writeJobEvent(this.operationId, jobEvent).catch((err) => {
      logger.warn('[event-writer] Immediate write failed', {
        operationId: this.operationId,
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
