/**
 * @fileoverview Agent X Stream Registry — Survives Component Lifecycle
 * @module @nxt1/ui/agent-x
 *
 * Singleton service that owns active SSE stream connections and their buffered
 * state. When a user switches between desktop sessions, the component hosting
 * the chat is destroyed, but the stream keeps running here. When the component
 * remounts for the same threadId, it rehydrates from the buffer instead of
 * showing a dead UI.
 *
 * This solves the "switch session → come back → stream is dead" bug.
 *
 * Lifecycle:
 *   1. Component calls `register(threadId, abortController)` when starting a stream
 *   2. Stream callbacks call `appendDelta()`, `upsertStep()`, `appendCard()`, `markDone()`
 *   3. Component destroy does NOT abort — stream continues here
 *   4. Remounting component calls `claim(threadId)` → gets buffered state + live updates
 *   5. Stream completes → entry kept by retention profile (standard vs long-running)
 *      → auto-pruned
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { NxtLoggingService } from '../../services/logging/logging.service';
import type { AgentXToolStep, AgentXRichCard, AgentXMessagePart } from '@nxt1/core/ai';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Buffered state for a single stream. */
export interface StreamEntry {
  /** Thread ID this stream belongs to. */
  readonly threadId: string;
  /** Abort controller for the SSE connection. */
  readonly abort: AbortController;
  /** Accumulated assistant response text. */
  content: string;
  /** Tool steps (ordered, deduplicated by id). */
  steps: AgentXToolStep[];
  /** Rich cards appended during the stream. */
  cards: AgentXRichCard[];
  /** Ordered message parts for Copilot-style interleaved rendering. */
  parts: AgentXMessagePart[];
  /**
   * Accumulated extended thinking content (Claude 3.7+ / Gemini 2.5).
   * Mirrors the `thinking` parts in `parts` but kept separately for
   * quick access by the UI without traversing the parts array.
   */
  thinking: string;
  /** Whether the stream has completed (done or error). */
  done: boolean;
  /** Error message if the stream errored. */
  error: string | null;
  /** Metadata from the done event. */
  doneMetadata: Record<string, unknown> | null;
  /** Timestamp when the stream completed (for auto-prune). */
  completedAt: number | null;
  /** Per-stream completed-entry TTL, used by prune(). */
  completedEntryTtlMs: number;
  /** Callback for the currently-attached component to receive live updates. */
  listener: StreamListener | null;
}

/** Retention profile for completed stream entries. */
export type StreamRetentionHint = 'standard' | 'long-running';

/** Optional registration options for per-operation stream behavior. */
export interface StreamRegisterOptions {
  /**
   * Retention profile for completed entries.
   * - standard: short rehydration window
   * - long-running: 24h rehydration window
   */
  readonly retentionHint?: StreamRetentionHint;
  /**
   * Explicit completed-entry TTL override for this stream.
   * When provided, takes precedence over retentionHint.
   */
  readonly completedEntryTtlMs?: number;
}

/** Live update callbacks — set by the component that "owns" the UI for this thread. */
export interface StreamListener {
  onDelta(content: string): void;
  /** Called with each extended thinking fragment (Claude 3.7+ / Gemini 2.5). */
  onThinking(content: string): void;
  onStep(step: AgentXToolStep): void;
  onCard(card: AgentXRichCard): void;
  onDone(metadata: Record<string, unknown> | null): void;
  onError(error: string): void;
}

/**
 * Callbacks for a per-operation observer registered via `watchOperation()`.
 * Unlike `StreamListener`, there can be many observers for the same operation
 * and they survive component unmount (since they're registered on the singleton).
 */
export interface OperationObserver {
  onStep(step: AgentXToolStep): void;
  onDone(metadata: Record<string, unknown> | null): void;
  onError(error: string): void;
}

/** Snapshot returned to a remounting component. */
export interface StreamSnapshot {
  content: string;
  steps: readonly AgentXToolStep[];
  cards: readonly AgentXRichCard[];
  parts: readonly AgentXMessagePart[];
  /** Accumulated extended thinking content for cold-path rehydration. */
  thinking: string;
  done: boolean;
  error: string | null;
  doneMetadata: Record<string, unknown> | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** How long to keep a completed stream entry for standard rehydration (ms). */
const COMPLETED_ENTRY_TTL_STANDARD_MS = 60_000; // 60 seconds

/** Default completed-entry TTL for long-running operations (ms). */
const COMPLETED_ENTRY_TTL_LONG_RUNNING_MS = 24 * 60 * 60 * 1000; // 24 hours

/** How often to run the prune sweep (ms). */
const PRUNE_INTERVAL_MS = 30_000; // 30 seconds

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AgentXStreamRegistryService {
  private readonly logger = inject(NxtLoggingService).child('AgentXStreamRegistry');

  /** Active and recently-completed streams, keyed by threadId. */
  private readonly entries = new Map<string, StreamEntry>();

  /**
   * Per-operation observers registered via `watchOperation()`.
   * Keyed by operationId → Map<symbol (handle), observer>.
   * Survives component unmount — unregister explicitly via the returned handle.
   */
  private readonly operationObservers = new Map<string, Map<symbol, OperationObserver>>();

  /**
   * Maps operationId → threadId once the SSE `onThread` event fires.
   * Used to route registry step/done/error calls to the right observers.
   */
  private readonly operationToThread = new Map<string, string>();
  private readonly threadToOperation = new Map<string, string>();

  /** Periodic prune timer. */
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  // ─── Registration (called when a stream starts) ──────────────────────

  /**
   * Register a per-operation observer that receives step/done/error callbacks
   * for the given operationId regardless of which component is mounted.
   *
   * Returns an opaque handle — pass it to `unwatchOperation()` to unregister.
   *
   * If the stream has already completed (buffered entry exists and is done),
   * `onDone` / `onError` is called synchronously before returning.
   */
  watchOperation(operationId: string, observer: OperationObserver): symbol {
    if (!this.operationObservers.has(operationId)) {
      this.operationObservers.set(operationId, new Map());
    }
    const handle = Symbol('op-observer');
    this.operationObservers.get(operationId)!.set(handle, observer);

    // Replay completion state if the stream already finished
    const threadId = this.operationToThread.get(operationId);
    if (threadId) {
      const entry = this.entries.get(threadId);
      if (entry?.done) {
        if (entry.error) {
          observer.onError(entry.error);
        } else {
          observer.onDone(entry.doneMetadata);
        }
      }
    }

    return handle;
  }

  /** Unregister a per-operation observer by its handle. */
  unwatchOperation(operationId: string, handle: symbol): void {
    this.operationObservers.get(operationId)?.delete(handle);
    if (this.operationObservers.get(operationId)?.size === 0) {
      this.operationObservers.delete(operationId);
    }
  }

  /**
   * Associate an operationId with a threadId.
   * Called from the SSE `onThread` handler so step/done/error can be
   * routed to the right operation observers.
   */
  linkOperation(operationId: string, threadId: string): void {
    this.operationToThread.set(operationId, threadId);
    this.threadToOperation.set(threadId, operationId);
  }

  /**
   * Look up the in-flight operationId for a thread (if any). Used by chat
   * rehydration to suppress persisted `assistant_partial` rows for the
   * operation that is currently streaming live into the typing bubble.
   */
  getOperationIdForThread(threadId: string): string | undefined {
    return this.threadToOperation.get(threadId);
  }

  /**
   * Register a new stream. If one already exists for this threadId,
   * the old one is aborted and replaced.
   */
  register(threadId: string, abort: AbortController, options?: StreamRegisterOptions): void {
    const existing = this.entries.get(threadId);
    if (existing && !existing.done) {
      existing.abort.abort();
      this.logger.info('Replaced existing stream', { threadId });
    }

    const completedEntryTtlMs = this.resolveCompletedEntryTtlMs(options);

    this.entries.set(threadId, {
      threadId,
      abort,
      content: '',
      steps: [],
      cards: [],
      parts: [],
      thinking: '',
      done: false,
      error: null,
      doneMetadata: null,
      completedAt: null,
      completedEntryTtlMs,
      listener: null,
    });

    this.ensurePruneTimer();
    this.logger.info('Stream registered', {
      threadId,
      retentionHint: options?.retentionHint ?? 'standard',
      completedEntryTtlMs,
    });
  }

  // ─── Stream callbacks (called from _sendViaStream) ───────────────────

  appendDelta(threadId: string, text: string): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    entry.content += text;

    // Build interleaved parts
    const last = entry.parts[entry.parts.length - 1];
    if (last?.type === 'text') {
      entry.parts[entry.parts.length - 1] = { type: 'text', content: last.content + text };
    } else {
      // First text delta after a non-text part — mark any open thinking blocks as done
      // so they collapse immediately in the UI rather than waiting for the whole stream.
      for (let i = 0; i < entry.parts.length; i++) {
        const p = entry.parts[i];
        if (p.type === 'thinking' && !p.done) {
          entry.parts[i] = { type: 'thinking', content: p.content, done: true };
        }
      }
      entry.parts.push({ type: 'text', content: text });
    }

    entry.listener?.onDelta(text);
  }

  /**
   * Append extended thinking text (Claude 3.7+ / Gemini 2.5).
   * Accumulates into a `thinking` part and notifies the active listener.
   * Thinking always arrives before content tokens so the part is prepended.
   */
  appendThinking(threadId: string, content: string): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    entry.thinking += content;

    const last = entry.parts[entry.parts.length - 1];
    if (last?.type === 'thinking') {
      entry.parts[entry.parts.length - 1] = { type: 'thinking', content: last.content + content };
    } else {
      entry.parts.push({ type: 'thinking', content });
    }

    entry.listener?.onThinking(content);
  }

  upsertStep(threadId: string, step: AgentXToolStep): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    // Only real tool invocations become visible rows. Router-stage chatter
    // (Reviewing, Routing, Planning, etc.) is internal telemetry and is
    // hidden from the chat — the streaming prose IS the thinking indicator.
    if (step.stageType !== 'tool') {
      entry.listener?.onStep(step);
      const operationId = this.threadToOperation.get(threadId);
      if (operationId) {
        this.operationObservers.get(operationId)?.forEach((obs) => obs.onStep(step));
      }
      return;
    }
    const idx = entry.steps.findIndex((s) => s.id === step.id);
    const existing = idx >= 0 ? entry.steps[idx] : null;
    const mergedStep: AgentXToolStep = {
      ...(existing ?? {}),
      ...step,
      // Preserve previously captured metadata (e.g. sourceUrl for favicons)
      // when incremental updates do not include metadata.
      metadata: step.metadata ?? existing?.metadata,
    };
    if (idx >= 0) {
      entry.steps[idx] = mergedStep;
    } else {
      entry.steps.push(mergedStep);
    }

    // Build interleaved parts. Search ALL existing tool-steps groups for this step id
    // first — when a tool_result arrives after intervening text deltas, we must update
    // the original step in place rather than spawn a duplicate group. Only when the id
    // is brand-new do we either extend the trailing group or start a new one.
    let updatedExisting = false;
    for (let i = 0; i < entry.parts.length; i++) {
      const part = entry.parts[i];
      if (part.type !== 'tool-steps') continue;
      const si = part.steps.findIndex((s) => s.id === mergedStep.id);
      if (si < 0) continue;
      const nextSteps = [...part.steps];
      nextSteps[si] = mergedStep;
      entry.parts[i] = { type: 'tool-steps', steps: nextSteps };
      updatedExisting = true;
      break;
    }

    if (!updatedExisting) {
      const last = entry.parts[entry.parts.length - 1];
      if (last?.type === 'tool-steps') {
        entry.parts[entry.parts.length - 1] = {
          type: 'tool-steps',
          steps: [...last.steps, mergedStep],
        };
      } else {
        entry.parts.push({ type: 'tool-steps', steps: [mergedStep] });
      }
    }

    entry.listener?.onStep(mergedStep);

    // Notify per-operation observers
    const operationId = this.threadToOperation.get(threadId);
    if (operationId) {
      this.operationObservers.get(operationId)?.forEach((obs) => obs.onStep(mergedStep));
    }
  }

  appendCard(threadId: string, card: AgentXRichCard): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    entry.cards.push(card);

    // Each card is its own part in the sequence
    entry.parts.push({ type: 'card', card });

    entry.listener?.onCard(card);
  }

  markDone(threadId: string, metadata: Record<string, unknown> | null): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    if (entry.done) {
      this.logger.debug('Duplicate stream done suppressed', { threadId });
      return;
    }
    entry.done = true;
    entry.doneMetadata = metadata;
    entry.completedAt = Date.now();
    entry.listener?.onDone(metadata);

    // Notify per-operation observers
    const operationId = this.threadToOperation.get(threadId);
    if (operationId) {
      this.operationObservers.get(operationId)?.forEach((obs) => obs.onDone(metadata));
    }

    this.logger.info('Stream completed', { threadId });
  }

  markError(threadId: string, error: string): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    if (entry.done) {
      this.logger.debug('Duplicate stream error suppressed after terminal state', {
        threadId,
      });
      return;
    }
    entry.done = true;
    entry.error = error;
    entry.completedAt = Date.now();
    entry.listener?.onError(error);

    // Notify per-operation observers
    const operationId = this.threadToOperation.get(threadId);
    if (operationId) {
      this.operationObservers.get(operationId)?.forEach((obs) => obs.onError(error));
    }

    this.logger.info('Stream errored', { threadId, error });
  }

  // ─── Claim (called when a component mounts/remounts) ─────────────────

  /**
   * Check if there's an active or recently-completed stream for this threadId.
   * Returns a snapshot of buffered state + attaches a live listener.
   * Returns null if no stream exists.
   */
  claim(threadId: string, listener: StreamListener): StreamSnapshot | null {
    const entry = this.entries.get(threadId);
    if (!entry) return null;

    // Attach the new component as the listener for live updates
    entry.listener = listener;

    this.logger.info('Stream claimed', {
      threadId,
      contentLength: entry.content.length,
      steps: entry.steps.length,
      done: entry.done,
    });

    return {
      content: entry.content,
      steps: [...entry.steps],
      cards: [...entry.cards],
      parts: [...entry.parts],
      thinking: entry.thinking,
      done: entry.done,
      error: entry.error,
      doneMetadata: entry.doneMetadata,
    };
  }

  /**
   * Read a fresh snapshot of the stream's current state WITHOUT attaching
   * a listener. Use after an async operation (e.g. loadThreadMessages) to
   * get the most up-to-date buffer — avoids stale data from a snapshot
   * captured before the async call.
   */
  getSnapshot(threadId: string): StreamSnapshot | null {
    const entry = this.entries.get(threadId);
    if (!entry) return null;
    return {
      content: entry.content,
      steps: [...entry.steps],
      cards: [...entry.cards],
      parts: [...entry.parts],
      thinking: entry.thinking,
      done: entry.done,
      error: entry.error,
      doneMetadata: entry.doneMetadata,
    };
  }

  /**
   * Detach the listener without aborting the stream.
   * Called when the component unmounts (session switch).
   */
  detach(threadId: string): void {
    const entry = this.entries.get(threadId);
    if (entry) {
      entry.listener = null;
    }
  }

  /**
   * Check if a thread has an active (non-completed) stream.
   */
  hasActiveStream(threadId: string): boolean {
    const entry = this.entries.get(threadId);
    return !!entry && !entry.done;
  }

  /**
   * Explicitly abort and remove a stream (e.g. user clicks stop).
   */
  abort(threadId: string): void {
    const entry = this.entries.get(threadId);
    if (entry) {
      entry.abort.abort();
      this.entries.delete(threadId);
      this.logger.info('Stream aborted by user', { threadId });
    }
  }

  // ─── Prune completed entries ─────────────────────────────────────────

  private ensurePruneTimer(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => this.prune(), PRUNE_INTERVAL_MS);
  }

  private prune(): void {
    const now = Date.now();
    for (const [threadId, entry] of this.entries) {
      if (entry.completedAt && now - entry.completedAt > entry.completedEntryTtlMs) {
        this.entries.delete(threadId);
      }
    }
    if (this.entries.size === 0 && this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  private resolveCompletedEntryTtlMs(options?: StreamRegisterOptions): number {
    if (typeof options?.completedEntryTtlMs === 'number' && options.completedEntryTtlMs > 0) {
      return options.completedEntryTtlMs;
    }

    if (options?.retentionHint === 'long-running') {
      return COMPLETED_ENTRY_TTL_LONG_RUNNING_MS;
    }

    return COMPLETED_ENTRY_TTL_STANDARD_MS;
  }
}
