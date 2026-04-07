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
 *   5. Stream completes → entry kept for 60s (rehydration window) → auto-pruned
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { NxtLoggingService } from '../services/logging/logging.service';
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
  /** Whether the stream has completed (done or error). */
  done: boolean;
  /** Error message if the stream errored. */
  error: string | null;
  /** Metadata from the done event. */
  doneMetadata: Record<string, unknown> | null;
  /** Timestamp when the stream completed (for auto-prune). */
  completedAt: number | null;
  /** Callback for the currently-attached component to receive live updates. */
  listener: StreamListener | null;
}

/** Live update callbacks — set by the component that "owns" the UI for this thread. */
export interface StreamListener {
  onDelta(content: string): void;
  onStep(step: AgentXToolStep): void;
  onCard(card: AgentXRichCard): void;
  onDone(metadata: Record<string, unknown> | null): void;
  onError(error: string): void;
}

/** Snapshot returned to a remounting component. */
export interface StreamSnapshot {
  content: string;
  steps: readonly AgentXToolStep[];
  cards: readonly AgentXRichCard[];
  parts: readonly AgentXMessagePart[];
  done: boolean;
  error: string | null;
  doneMetadata: Record<string, unknown> | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** How long to keep a completed stream entry for rehydration (ms). */
const COMPLETED_ENTRY_TTL_MS = 60_000; // 60 seconds

/** How often to run the prune sweep (ms). */
const PRUNE_INTERVAL_MS = 30_000; // 30 seconds

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AgentXStreamRegistryService {
  private readonly logger = inject(NxtLoggingService).child('AgentXStreamRegistry');

  /** Active and recently-completed streams, keyed by threadId. */
  private readonly entries = new Map<string, StreamEntry>();

  /** Periodic prune timer. */
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  // ─── Registration (called when a stream starts) ──────────────────────

  /**
   * Register a new stream. If one already exists for this threadId,
   * the old one is aborted and replaced.
   */
  register(threadId: string, abort: AbortController): void {
    const existing = this.entries.get(threadId);
    if (existing && !existing.done) {
      existing.abort.abort();
      this.logger.info('Replaced existing stream', { threadId });
    }

    this.entries.set(threadId, {
      threadId,
      abort,
      content: '',
      steps: [],
      cards: [],
      parts: [],
      done: false,
      error: null,
      doneMetadata: null,
      completedAt: null,
      listener: null,
    });

    this.ensurePruneTimer();
    this.logger.info('Stream registered', { threadId });
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
      entry.parts.push({ type: 'text', content: text });
    }

    entry.listener?.onDelta(text);
  }

  upsertStep(threadId: string, step: AgentXToolStep): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    const idx = entry.steps.findIndex((s) => s.id === step.id);
    if (idx >= 0) {
      entry.steps[idx] = step;
    } else {
      entry.steps.push(step);
    }

    // Build interleaved parts: upsert into last tool-steps group or start new one
    const last = entry.parts[entry.parts.length - 1];
    if (last?.type === 'tool-steps') {
      const prevSteps = [...last.steps];
      const si = prevSteps.findIndex((s) => s.id === step.id);
      if (si >= 0) {
        prevSteps[si] = step;
      } else {
        prevSteps.push(step);
      }
      entry.parts[entry.parts.length - 1] = { type: 'tool-steps', steps: prevSteps };
    } else {
      entry.parts.push({ type: 'tool-steps', steps: [step] });
    }

    entry.listener?.onStep(step);
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
    entry.done = true;
    entry.doneMetadata = metadata;
    entry.completedAt = Date.now();
    entry.listener?.onDone(metadata);
    this.logger.info('Stream completed', { threadId });
  }

  markError(threadId: string, error: string): void {
    const entry = this.entries.get(threadId);
    if (!entry) return;
    entry.done = true;
    entry.error = error;
    entry.completedAt = Date.now();
    entry.listener?.onError(error);
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
      if (entry.completedAt && now - entry.completedAt > COMPLETED_ENTRY_TTL_MS) {
        this.entries.delete(threadId);
      }
    }
    if (this.entries.size === 0 && this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }
}
