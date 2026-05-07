/**
 * @fileoverview Debounced Event Writer — Batched Firestore Subcollection Writes
 * @module @nxt1/backend/modules/agent/queue
 *
 * Accumulates high-frequency LLM token deltas and flushes them to the
 * `AgentJobs/{operationId}/events` subcollection at configurable intervals
 * (default 300ms). This keeps the "live typing" feel while capping Firestore
 * writes to ~3-4/sec instead of hundreds.
 *
 * Non-delta events (step_active, tool_call, done, etc.) are written
 * immediately — they're low-frequency and the UI needs them instantly.
 */

import {
  sanitizeForFirestore,
  type AgentJobRepository,
  type JobEvent,
  type JobEventType,
} from './job.repository.js';
import type {
  AgentIdentifier,
  AgentProgressMetadata,
  AgentProgressStage,
  AgentProgressStageType,
  AgentYieldState,
  AgentXRichCard,
  AgentXToolStepIcon,
  OperationOutcomeCode,
} from '@nxt1/core';
import {
  sanitizeAgentOutputText,
  sanitizeAgentPayload,
} from '../utils/platform-identifier-sanitizer.js';
import { sanitizeStorageUrlsFromText } from '@nxt1/core';
import { logger } from '../../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Callback signature matching what the Router/BaseAgent emit. */
export interface StreamEvent {
  /** Persisted event sequence number (attached by writer post-persist). */
  readonly seq?: number;
  readonly type: JobEventType;
  readonly agentId?: AgentIdentifier;
  /** Stable step identity for UI reconciliation across live + replay paths. */
  readonly stepId?: string;
  readonly messageKey?: string;
  readonly stageType?: AgentProgressStageType;
  readonly stage?: AgentProgressStage;
  readonly outcomeCode?: OperationOutcomeCode;
  readonly metadata?: AgentProgressMetadata;
  readonly message?: string;
  readonly text?: string;
  /**
   * Extended thinking text fragment for `thinking` events (Claude 3.7+ / Gemini 2.5).
   * Debounced and batched to Firestore the same way delta text is.
   */
  readonly thinkingText?: string;
  /**
   * When true for delta events, bypass debounced coalescing and persist
   * this delta as its own event record.
   */
  readonly noBatch?: boolean;
  readonly toolName?: string;
  readonly toolArgs?: string;
  readonly toolResult?: Record<string, unknown>;
  readonly toolSuccess?: boolean;
  readonly success?: boolean;
  readonly error?: string;
  readonly errorCode?: string;
  readonly icon?: AgentXToolStepIcon;
  /** Rich card payload for `card` events (planner, data-table, etc.). */
  readonly cardData?: AgentXRichCard;
  /** Updated thread title emitted by worker after auto-title generation. */
  readonly title?: string;
  /** Thread ID associated with operation/title events. */
  readonly threadId?: string;
  /** Canonical persisted assistant message ID for terminal done events. */
  readonly messageId?: string;
  /** Canonical operation status transitions for sidebar/session state. */
  readonly status?:
    | 'queued'
    | 'running'
    | 'paused'
    | 'awaiting_input'
    | 'awaiting_approval'
    | 'complete'
    | 'failed'
    | 'cancelled';
  /** Serialized yield context for awaiting_input / awaiting_approval transitions. */
  readonly yieldState?: AgentYieldState;
  /** Operation id for operation lifecycle events. */
  readonly operationId?: string;
  /** ISO timestamp for operation/title transitions. */
  readonly timestamp?: string;
}

export type OnStreamEvent = (event: StreamEvent) => void;

export interface EventWriterHooks {
  /**
   * Called for each delta as it's buffered, immediately (not batched).
   * Used for real-time SSE publish without waiting for Firestore persistence.
   * Live deltas do NOT have a seq number yet.
   */
  readonly onLiveEvent?: OnStreamEvent;
  /**
   * Called after event is persisted to Firestore, with final seq number.
   * For terminal events and final persistence metrics.
   */
  readonly onPersistedEvent?: OnStreamEvent;
  readonly onPersistedEventMetrics?: (payload: {
    type: JobEventType;
    durationMs: number;
    seq: number;
  }) => void;
}

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
  private pendingDeltaText = '';
  private pendingDeltaAgentId: string | undefined;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingThinkingText = '';
  private pendingThinkingAgentId: string | undefined;
  private thinkingFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly flushIntervalMs: number;

  constructor(
    private readonly repo: AgentJobRepository,
    private readonly operationId: string,
    private readonly userId: string,
    flushIntervalMs?: number,
    private readonly hooks?: EventWriterHooks
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
    } else if (event.type === 'thinking') {
      this.bufferThinking(event);
    } else {
      this.queueWrite(async () => {
        await this.flushThinkingPendingIfNeeded();
        await this.flushDeltaPendingIfNeeded();
        await this.writeImmediate(event);
      }).catch((err) => {
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
    if (this.thinkingFlushTimer) {
      clearTimeout(this.thinkingFlushTimer);
      this.thinkingFlushTimer = null;
    }
    if (this.pendingThinkingText.length > 0) {
      await this.writePendingThinkingEvent();
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pendingDeltaText.length > 0) {
      await this.writeDeltaEvent();
    }
    await this.writeChain;
  }

  /**
   * Flush any remaining deltas and clean up timers.
   * Safe to call multiple times. Callers no longer need to call flush()
   * before dispose() — dispose handles it.
   */
  async dispose(): Promise<void> {
    if (this.thinkingFlushTimer) {
      clearTimeout(this.thinkingFlushTimer);
      this.thinkingFlushTimer = null;
    }
    if (this.pendingThinkingText.length > 0) {
      await this.writePendingThinkingEvent().catch(() => undefined);
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Best-effort flush of any leftover buffered text
    if (this.pendingDeltaText.length > 0) {
      await this.writeDeltaEvent().catch(() => undefined);
    }
    await this.writeChain.catch(() => undefined);
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private bufferDelta(event: StreamEvent): void {
    const sanitizedDeltaText = event.text
      ? sanitizeStorageUrlsFromText(sanitizeAgentOutputText(event.text), {
          normalizeWhitespace: false,
        })
      : '';

    if (sanitizedDeltaText.length === 0) {
      return;
    }

    this.pendingDeltaText += sanitizedDeltaText;
    this.pendingDeltaAgentId = event.agentId ?? this.pendingDeltaAgentId;

    // ╔════════════════════════════════════════════════════════════════════╗
    // ║  LIVE DELTA PUBLISH (Token-by-Token Real-Time Streaming)          ║
    // ╠════════════════════════════════════════════════════════════════════╣
    // ║  Publish this delta IMMEDIATELY to SSE for professional UX.       ║
    // ║  Note: No seq yet; live events don't have sequence numbers.        ║
    // ║  Firestore persists coalesced deltas separately (still 300ms).     ║
    // ╚════════════════════════════════════════════════════════════════════╝
    this.hooks?.onLiveEvent?.({
      type: 'delta',
      agentId: event.agentId,
      text: sanitizedDeltaText,
      noBatch: event.noBatch,
    });

    if (event.noBatch) {
      this.queueWrite(async () => {
        this.pendingDeltaText = this.pendingDeltaText.slice(0, -sanitizedDeltaText.length);
        if (this.pendingDeltaText.length === 0) {
          this.pendingDeltaAgentId = undefined;
        }
        await this.flushDeltaPendingIfNeeded();
        await this.writeImmediate({
          ...event,
          type: 'delta',
          text: sanitizedDeltaText,
        });
      }).catch((err) => {
        logger.warn('[event-writer] Non-batched delta write failed', {
          operationId: this.operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }

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
    return this.persistPendingDelta();
  }

  private async writeDeltaEvent(): Promise<void> {
    if (this.pendingDeltaText.length === 0) return;

    await this.queueWrite(async () => {
      await this.persistPendingDelta();
    });
  }

  private async persistPendingDelta(): Promise<void> {
    if (this.pendingDeltaText.length === 0) return;

    // Final pass: strip any storage URLs that may have arrived across
    // multiple delta chunks and were only detectable in the accumulated text.
    const text = sanitizeStorageUrlsFromText(this.pendingDeltaText);
    if (text.length === 0) {
      this.pendingDeltaText = '';
      this.pendingDeltaAgentId = undefined;
      return;
    }
    this.pendingDeltaText = text;
    const agentId = this.pendingDeltaAgentId;
    this.pendingDeltaText = '';
    this.pendingDeltaAgentId = undefined;

    const jobEvent: Omit<JobEvent, 'createdAt' | 'seq'> = {
      type: 'delta',
      userId: this.userId,
      agentId,
      text,
    };

    await this.persistEvent(jobEvent, {
      type: 'delta',
      agentId: typeof agentId === 'string' ? (agentId as AgentIdentifier) : undefined,
      text,
    });
  }

  // ─── Thinking buffer (mirrors delta buffer for thinking tokens) ──────────────

  private bufferThinking(event: StreamEvent): void {
    const sanitizedText = event.thinkingText ? sanitizeAgentOutputText(event.thinkingText) : '';
    if (sanitizedText.length === 0) return;

    this.pendingThinkingText += sanitizedText;
    this.pendingThinkingAgentId = event.agentId ?? this.pendingThinkingAgentId;

    // Publish immediately to SSE so the UI can show real-time thinking
    this.hooks?.onLiveEvent?.({
      type: 'thinking',
      agentId: event.agentId,
      thinkingText: sanitizedText,
    });

    if (!this.thinkingFlushTimer) {
      this.thinkingFlushTimer = setTimeout(() => {
        this.thinkingFlushTimer = null;
        this.writePendingThinkingEvent().catch((err) => {
          logger.warn('[event-writer] Failed to flush thinking', {
            operationId: this.operationId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }, this.flushIntervalMs);
    }
  }

  private flushThinkingPendingIfNeeded(): Promise<void> {
    if (this.pendingThinkingText.length === 0) return Promise.resolve();
    if (this.thinkingFlushTimer) {
      clearTimeout(this.thinkingFlushTimer);
      this.thinkingFlushTimer = null;
    }
    return this.persistPendingThinking();
  }

  private async writePendingThinkingEvent(): Promise<void> {
    if (this.pendingThinkingText.length === 0) return;
    await this.queueWrite(async () => {
      await this.persistPendingThinking();
    });
  }

  private async persistPendingThinking(): Promise<void> {
    if (this.pendingThinkingText.length === 0) return;

    const thinkingText = this.pendingThinkingText;
    const agentId = this.pendingThinkingAgentId;
    this.pendingThinkingText = '';
    this.pendingThinkingAgentId = undefined;

    const jobEvent: Omit<JobEvent, 'createdAt' | 'seq'> = {
      type: 'thinking',
      userId: this.userId,
      agentId,
      thinkingText,
    };

    await this.persistEvent(jobEvent, {
      type: 'thinking',
      agentId: typeof agentId === 'string' ? (agentId as AgentIdentifier) : undefined,
      thinkingText,
    });
  }

  private async writeImmediate(event: StreamEvent): Promise<void> {
    // Build event object, stripping undefined fields so Firestore writes
    // are self-contained and don't rely on ignoreUndefinedProperties.
    const jobEvent: Omit<JobEvent, 'createdAt' | 'seq'> = stripUndefined({
      type: event.type,
      userId: this.userId,
      agentId: event.agentId,
      stepId: event.stepId,
      messageKey: event.messageKey,
      stageType: event.stageType,
      stage: event.stage,
      outcomeCode: event.outcomeCode,
      metadata: event.metadata ? sanitizeAgentPayload(event.metadata) : undefined,
      message: event.message ? sanitizeAgentOutputText(event.message) : undefined,
      text: event.text ? sanitizeAgentOutputText(event.text) : undefined,
      thinkingText: event.thinkingText ? sanitizeAgentOutputText(event.thinkingText) : undefined,
      toolName: event.toolName,
      toolArgs: event.toolArgs ? sanitizeAgentOutputText(event.toolArgs) : undefined,
      toolResult: event.toolResult ? sanitizeAgentPayload(event.toolResult) : undefined,
      toolSuccess: event.toolSuccess,
      success: event.success,
      error: event.error ? sanitizeAgentOutputText(event.error) : undefined,
      errorCode: event.errorCode,
      icon: event.icon,
      // Firestore operation replay is an internal, owner-scoped transport.
      // Preserve identifiers like approvalId / toolCallId so the frontend can
      // collapse approval cards/yields by identity on hard refresh.
      cardData: event.cardData
        ? sanitizeForFirestore(event.cardData as unknown as Record<string, unknown>)
        : undefined,
      title: event.title ? sanitizeAgentOutputText(event.title) : undefined,
      threadId: event.threadId,
      messageId: event.messageId,
      status: event.status,
      // Do NOT run yieldState through sanitizeAgentPayload — it strips keys
      // like approvalId / operationId / toolCallId as "sensitive", which
      // breaks frontend identity collapse and causes duplicate approval cards
      // on refresh. sanitizeForFirestore only removes Firestore-invalid values.
      yieldState: event.yieldState
        ? (sanitizeForFirestore(
            event.yieldState as unknown as Record<string, unknown>
          ) as unknown as AgentYieldState)
        : undefined,
      operationId: event.operationId,
      timestamp: event.timestamp,
    });

    await this.persistEvent(jobEvent, event);
  }

  private queueWrite(task: () => Promise<void>): Promise<void> {
    const run = this.writeChain.then(task, task);
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  private async persistEvent(
    jobEvent: Omit<JobEvent, 'createdAt' | 'seq'>,
    sourceEvent: StreamEvent
  ) {
    const startedAt = Date.now();
    const seq = await this.repo
      .writeJobEventWithAutoSeq(this.operationId, jobEvent)
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[event-writer] Persist failed', {
          operationId: this.operationId,
          type: sourceEvent.type,
          category: this.classifyWriteFailure(err),
          error: message,
        });
        throw err;
      });

    const durationMs = Date.now() - startedAt;
    this.hooks?.onPersistedEventMetrics?.({
      type: sourceEvent.type,
      durationMs,
      seq,
    });

    this.hooks?.onPersistedEvent?.({
      ...sourceEvent,
      seq,
    });
  }

  private classifyWriteFailure(err: unknown): 'quota' | 'auth' | 'network' | 'unknown' {
    const message = String(err instanceof Error ? err.message : err).toLowerCase();
    if (message.includes('permission') || message.includes('unauth')) return 'auth';
    if (message.includes('quota') || message.includes('resource_exhausted')) return 'quota';
    if (
      message.includes('deadline') ||
      message.includes('unavailable') ||
      message.includes('network') ||
      message.includes('socket')
    ) {
      return 'network';
    }
    return 'unknown';
  }
}
