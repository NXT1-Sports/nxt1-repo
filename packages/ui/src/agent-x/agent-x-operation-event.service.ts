/**
 * @fileoverview Agent X Operation Event Service — Firestore Live Event Bridge
 * @module @nxt1/ui/agent-x
 *
 * Subscribes to the `AgentJobs/{operationId}/events` Firestore subcollection
 * via `onSnapshot` and converts backend `JobEvent` documents into the same
 * signal updates that the SSE streaming path uses (`AgentXToolStep`, content
 * deltas, and rich cards).
 *
 * This gives the user a real-time "watch it work" experience for background
 * BullMQ jobs without holding open an SSE/HTTP connection.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Architecture:
 * ```
 * Firestore onSnapshot  →  OperationEventService  →  AgentXService signals
 * (AgentJobs/{id}/events)    (converts JobEvent)       (_messages, tool steps)
 * ```
 *
 * @example
 * ```typescript
 * const sub = this.operationEventService.subscribe(operationId, {
 *   onDelta: (text) => appendToMessage(text),
 *   onStep:  (step) => upsertToolStep(step),
 *   onDone:  (evt)  => finalizeMessage(evt),
 *   onError: (msg)  => showError(msg),
 * });
 *
 * // Later: unsubscribe
 * sub.unsubscribe();
 * ```
 */

import { Injectable, inject, InjectionToken, NgZone } from '@angular/core';
import type {
  JobEvent,
  AgentXToolStep,
  AgentXToolStepStatus,
  AgentXStreamCardEvent,
} from '@nxt1/core/ai';
import type { OperationLogStatus } from '@nxt1/core';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { Subject } from 'rxjs';
import {
  getToolStepDisplayLabel,
  normalizeAgentIdentifier,
  normalizeToolStepIcon,
} from './agent-x-agent-presentation';

// ─── Title Updated Event ────────────────────────────────────────────────────

/** Emitted when the backend auto-generates a title for a new conversation thread. */
export interface ThreadTitleUpdatedEvent {
  readonly threadId: string;
  readonly title: string;
}

/** Emitted when an operation's status changes during the /chat SSE stream. */
export interface OperationStatusUpdatedEvent {
  readonly threadId: string;
  readonly status: OperationLogStatus;
  readonly timestamp: string;
}

// ─── Firestore Adapter (Injection Token) ────────────────────────────────────

/**
 * Minimal Firestore interface needed by this service.
 * Decouples from `@angular/fire/firestore` so the service stays portable
 * between web (@angular/fire) and mobile (Capacitor Firebase plugin).
 *
 * Each app provides an implementation via the `FIRESTORE_ADAPTER` token.
 */
export interface FirestoreAdapter {
  /**
   * Subscribe to a Firestore subcollection ordered by a field.
   * @returns An unsubscribe function.
   */
  onSnapshot(
    collectionPath: string,
    orderByField: string,
    onNext: (docs: ReadonlyArray<Record<string, unknown>>) => void,
    onError: (error: Error) => void
  ): () => void;

  /**
   * One-time fetch of a Firestore subcollection ordered by a field.
   * Used to read the current max event seq before attaching a live listener
   * so that reconnects can resume from the last seen position.
   */
  getDocs(
    collectionPath: string,
    orderByField: string
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
}

/**
 * Injection token for the Firestore adapter.
 *
 * Web app provides:
 * ```typescript
 * {
 *   provide: FIRESTORE_ADAPTER,
 *   useFactory: (firestore: Firestore) => ({
 *     onSnapshot: (path, orderBy, onNext, onError) => {
 *       const ref = collection(firestore, path);
 *       const q = query(ref, firestoreOrderBy(orderBy));
 *       return firestoreOnSnapshot(q, snap => {
 *         onNext(snap.docs.map(d => d.data()));
 *       }, onError);
 *     }
 *   }),
 *   deps: [Firestore],
 * }
 * ```
 */
export const FIRESTORE_ADAPTER = new InjectionToken<FirestoreAdapter>('FIRESTORE_ADAPTER');

// ─── Subscription Types ─────────────────────────────────────────────────────

/** Callbacks for live operation event streaming. */
export interface OperationEventCallbacks {
  /** Called when new LLM text arrives (accumulated delta). */
  onDelta: (text: string, agentId?: string) => void;
  /** Called when a tool step starts, succeeds, or fails. */
  onStep: (step: AgentXToolStep) => void;
  /** Called when a rich card (planner, data-table, etc.) should be rendered. */
  onCard?: (card: AgentXStreamCardEvent) => void;
  /** Called when the entire job finishes (success or failure). */
  onDone: (event: { success: boolean; message?: string; error?: string }) => void;
  /** Called if the Firestore listener encounters an error. */
  onError: (message: string) => void;
}

/** Handle returned by `subscribe()` — call `.unsubscribe()` when done. */
export interface OperationEventSubscription {
  readonly operationId: string;
  unsubscribe(): void;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AgentXOperationEventService {
  private readonly logger = inject(NxtLoggingService).child('OperationEventService');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly firestoreAdapter = inject(FIRESTORE_ADAPTER, { optional: true });
  private readonly ngZone = inject(NgZone);

  /**
   * Fanout map: one Firestore listener per operationId, N callback sets.
   * Multiple subscribers (e.g. Agent X chat shell + profile generation banner)
   * can attach to the same operation without opening duplicate Firestore connections.
   */
  private readonly activeSubs = new Map<
    string,
    {
      /** Firestore onSnapshot unsubscribe handle */
      unsub: () => void;
      /** Per-subscriber callback sets, keyed by unique symbol */
      listeners: Map<symbol, OperationEventCallbacks>;
      /** Shared seq tracker — guards against re-processing on snapshot updates */
      lastProcessedSeq: number;
      /** Shared FIFO tool step queues */
      pendingStepIds: Map<string, string[]>;
    }
  >();

  /**
   * Observable that emits when a thread's title is auto-generated by the backend.
   * The operations log component subscribes to this to update its entries in real-time.
   */
  private readonly _titleUpdated$ = new Subject<ThreadTitleUpdatedEvent>();
  readonly titleUpdated$ = this._titleUpdated$.asObservable();

  /**
   * Observable that emits when an operation's status changes during the /chat SSE stream.
   * The operations log component subscribes to this to update entry statuses in real-time
   * without polling or Firestore listeners.
   */
  private readonly _operationStatusUpdated$ = new Subject<OperationStatusUpdatedEvent>();
  readonly operationStatusUpdated$ = this._operationStatusUpdated$.asObservable();

  /**
   * Emit a title-updated event so listeners (operations log, shell) can
   * update the thread title in real-time without a full API refetch.
   */
  emitTitleUpdated(threadId: string, title: string): void {
    this.logger.debug('Emitting thread title update', { threadId, title });
    // Run inside NgZone so change detection fires — the SSE ReadableStream
    // reader.read() callback executes outside the Angular zone (native
    // promise not patched by zone.js), so without this, signal writes in
    // the subscriber never trigger a CD tick.
    this.ngZone.run(() => this._titleUpdated$.next({ threadId, title }));
  }

  /**
   * Emit an operation status change so the operations log sidebar
   * can update in real-time purely from the /chat SSE stream.
   */
  emitOperationStatusUpdated(
    threadId: string,
    status: OperationLogStatus,
    timestamp: string
  ): void {
    this.logger.debug('Emitting operation status update', { threadId, status });
    // Run inside NgZone — same reason as emitTitleUpdated above.
    this.ngZone.run(() => this._operationStatusUpdated$.next({ threadId, status, timestamp }));
  }

  /**
   * One-time reconstruction of all stored events for a mid-stream operation.
   *
   * Reads the events subcollection once and returns:
   * - `content`     — concatenated delta text stored so far (the partial response)
   * - `steps`       — reconstructed tool steps at their final known state
   * - `isDone`      — whether a `done` event is already stored
   * - `doneSuccess` — value of the `done` event's `success` field
   * - `maxSeq`      — highest seq seen (use as `startAfterSeq` for live subscribe)
   *
   * Use when re-opening a chat mid-stream after a page refresh:
   * show stored partial content immediately, then subscribe from `maxSeq`
   * so only genuinely new tokens get appended — no duplication, no gaps.
   */
  async getStoredEventState(operationId: string): Promise<{
    content: string;
    steps: AgentXToolStep[];
    isDone: boolean;
    doneSuccess: boolean;
    maxSeq: number;
  }> {
    if (!this.firestoreAdapter) {
      return { content: '', steps: [], isDone: false, doneSuccess: false, maxSeq: -1 };
    }
    try {
      const docs = await this.firestoreAdapter.getDocs(`AgentJobs/${operationId}/events`, 'seq');
      if (docs.length === 0) {
        return { content: '', steps: [], isDone: false, doneSuccess: false, maxSeq: -1 };
      }

      let content = '';
      let isDone = false;
      let doneSuccess = false;
      const steps: AgentXToolStep[] = [];
      const pendingStepIds = new Map<string, string[]>();
      let maxSeq = -1;

      for (const doc of docs) {
        const event = doc as unknown as JobEvent;
        if (typeof event.seq !== 'number') continue;
        if (event.seq > maxSeq) maxSeq = event.seq;

        switch (event.type) {
          case 'delta':
            if (event.text) content += event.text;
            break;

          case 'step_active':
          case 'tool_call': {
            const stepId = `${event.toolName ?? 'step'}-${event.seq}`;
            if (event.toolName) {
              const q = pendingStepIds.get(event.toolName) ?? [];
              q.push(stepId);
              pendingStepIds.set(event.toolName, q);
            }
            steps.push(
              this.buildToolStep(
                event,
                stepId,
                'active',
                event.type === 'tool_call'
                  ? `Running ${event.toolName ?? 'tool'}...`
                  : (event.message ?? event.toolName ?? 'Processing...')
              )
            );
            break;
          }

          case 'tool_result':
          case 'step_done': {
            const q = event.toolName ? pendingStepIds.get(event.toolName) : undefined;
            const stepId = q?.shift() ?? `${event.toolName ?? 'step'}-${event.seq}`;
            const idx = steps.findIndex((s) => s.id === stepId);
            const resolved = this.buildToolStep(
              event,
              stepId,
              event.toolSuccess === false ? 'error' : 'success',
              event.message ?? `${event.toolName ?? 'Step'} completed`,
              event.type === 'tool_result' && event.toolResult
                ? this.summarizeToolResult(event.toolResult)
                : undefined
            );
            if (idx >= 0) steps[idx] = resolved;
            else steps.push(resolved);
            break;
          }

          case 'step_error': {
            const q = event.toolName ? pendingStepIds.get(event.toolName) : undefined;
            const stepId = q?.shift() ?? `${event.toolName ?? 'step'}-${event.seq}`;
            const idx = steps.findIndex((s) => s.id === stepId);
            const errored = this.buildToolStep(
              event,
              stepId,
              'error',
              event.message ?? event.error ?? 'Step failed'
            );
            if (idx >= 0) steps[idx] = errored;
            else steps.push(errored);
            break;
          }

          case 'done':
            isDone = true;
            doneSuccess = event.success ?? false;
            break;
        }
      }

      this.logger.debug('Reconstructed stored event state', {
        operationId,
        contentLength: content.length,
        stepCount: steps.length,
        isDone,
        maxSeq,
      });
      return { content, steps, isDone, doneSuccess, maxSeq };
    } catch (err) {
      this.logger.warn('Failed to reconstruct stored event state — starting fresh', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { content: '', steps: [], isDone: false, doneSuccess: false, maxSeq: -1 };
    }
  }

  /**
   * Subscribe to live events for a background operation.
   *
   * Establishes a Firestore `onSnapshot` listener on
   * `AgentJobs/{operationId}/events` ordered by `seq`.
   * Incoming events are translated into the same callbacks
   * that the SSE streaming path uses.
   *
   * @param startAfterSeq  When provided, events with seq ≤ this value are
   *                       silently skipped. Pass the result of `getMaxEventSeq()`
   *                       when reconnecting after chat history is already loaded.
   * @returns A subscription handle. Call `.unsubscribe()` to stop listening.
   */
  subscribe(
    operationId: string,
    callbacks: OperationEventCallbacks,
    options?: { startAfterSeq?: number }
  ): OperationEventSubscription {
    if (!this.firestoreAdapter) {
      this.logger.warn('No FIRESTORE_ADAPTER provided — live events unavailable');
      callbacks.onError('Live event streaming is not available');
      return { operationId, unsubscribe: () => undefined };
    }

    // If a Firestore listener is already open for this operation, attach the new
    // callbacks to the existing fanout set — no second Firestore connection needed.
    const existing = this.activeSubs.get(operationId);
    if (existing) {
      const listenerId = Symbol('listener');
      existing.listeners.set(listenerId, callbacks);
      this.logger.info('Attaching additional listener to existing operation subscription', {
        operationId,
        listenerCount: existing.listeners.size,
        incomingStartAfterSeq: options?.startAfterSeq,
        currentLastProcessedSeq: existing.lastProcessedSeq,
      });
      // CRITICAL: If the caller provides a resume cursor (startAfterSeq), advance
      // the shared lastProcessedSeq so that events the caller already has from
      // another source (SSE, MongoDB) are not replayed via Firestore and
      // duplicated in the UI. Only advance — never retreat.
      if (
        options?.startAfterSeq !== undefined &&
        options.startAfterSeq > existing.lastProcessedSeq
      ) {
        existing.lastProcessedSeq = options.startAfterSeq;
        this.logger.debug('Advanced shared lastProcessedSeq to startAfterSeq', {
          operationId,
          lastProcessedSeq: existing.lastProcessedSeq,
        });
      }
      return {
        operationId,
        unsubscribe: () => this.removeListener(operationId, listenerId),
      };
    }

    this.logger.info('Subscribing to operation events', { operationId });
    this.breadcrumb.trackStateChange('operation-events:subscribing', { operationId });

    const listenerId = Symbol('listener');
    const listeners = new Map<symbol, OperationEventCallbacks>([[listenerId, callbacks]]);
    // Shared seq tracker and FIFO tool step queues — owned by the entry, not a closure.
    const entry = {
      unsub: (() => undefined) as () => void,
      listeners,
      // If startAfterSeq is provided, pre-seed the tracker so the first
      // onSnapshot batch (which contains all existing docs) is filtered
      // and only new events get forwarded to callbacks.
      lastProcessedSeq: options?.startAfterSeq ?? -1,
      pendingStepIds: new Map<string, string[]>(),
    };
    this.activeSubs.set(operationId, entry);

    const collectionPath = `AgentJobs/${operationId}/events`;

    entry.unsub = this.firestoreAdapter.onSnapshot(
      collectionPath,
      'seq',
      (docs) => {
        // Run inside NgZone — Firestore onSnapshot callbacks execute outside the
        // Angular zone. Signal writes from processEvent must be zone-aware so
        // OnPush change detection fires correctly and token rendering is ordered.
        this.ngZone.run(() => {
          const current = this.activeSubs.get(operationId);
          if (!current) return;
          for (const doc of docs) {
            const event = doc as unknown as JobEvent;
            if (typeof event.seq !== 'number' || event.seq <= current.lastProcessedSeq) continue;
            current.lastProcessedSeq = event.seq;
            // Fan out to every registered listener callback set.
            for (const cb of current.listeners.values()) {
              this.processEvent(event, cb, operationId, current.pendingStepIds);
            }
          }
        });
      },
      (error) => {
        this.logger.error('Firestore listener error', error, {
          operationId,
          errorCode: (error as unknown as Record<string, unknown>)['code'],
          errorMessage: error.message,
          collectionPath: `AgentJobs/${operationId}/events`,
        });
        const current = this.activeSubs.get(operationId);
        if (current) {
          for (const cb of current.listeners.values()) {
            cb.onError(error.message);
          }
        }
      }
    );

    return {
      operationId,
      unsubscribe: () => this.removeListener(operationId, listenerId),
    };
  }

  /**
   * Remove a single callback set from the fanout for this operation.
   * Closes the Firestore connection only when the last listener is removed.
   */
  private removeListener(operationId: string, listenerId: symbol): void {
    const entry = this.activeSubs.get(operationId);
    if (!entry) return;
    entry.listeners.delete(listenerId);
    this.logger.debug('Listener removed from operation', {
      operationId,
      remainingListeners: entry.listeners.size,
    });
    if (entry.listeners.size === 0) {
      entry.unsub();
      this.activeSubs.delete(operationId);
      this.logger.info('All listeners removed — Firestore subscription closed', { operationId });
    }
  }

  /**
   * Force-close all listeners for an operation regardless of listener count.
   * Used for cleanup on logout or explicit cancellation.
   */
  unsubscribe(operationId: string): void {
    const entry = this.activeSubs.get(operationId);
    if (entry) {
      entry.unsub();
      this.activeSubs.delete(operationId);
      this.logger.info('Force-unsubscribed all listeners from operation', { operationId });
    }
  }

  /**
   * Stop all active subscriptions. Call on service destroy or logout.
   */
  unsubscribeAll(): void {
    for (const [operationId, entry] of this.activeSubs) {
      entry.unsub();
      this.logger.debug('Unsubscribed from operation', { operationId });
    }
    this.activeSubs.clear();
  }

  /**
   * Check if we're currently subscribed to an operation.
   */
  isSubscribed(operationId: string): boolean {
    return this.activeSubs.has(operationId);
  }

  /** Number of active listeners for an operation (for diagnostics/testing). */
  listenerCount(operationId: string): number {
    return this.activeSubs.get(operationId)?.listeners.size ?? 0;
  }

  // ─── Internal Event Processing ──────────────────────────────────────────

  private processEvent(
    event: JobEvent,
    callbacks: OperationEventCallbacks,
    operationId: string,
    pendingStepIds: Map<string, string[]>
  ): void {
    switch (event.type) {
      case 'delta':
        if (event.text) {
          callbacks.onDelta(event.text, event.agentId);
        }
        break;

      case 'step_active': {
        const stepId = `${event.toolName ?? 'step'}-${event.seq}`;
        if (event.toolName) {
          const queue = pendingStepIds.get(event.toolName) ?? [];
          queue.push(stepId);
          pendingStepIds.set(event.toolName, queue);
        }
        callbacks.onStep(
          this.buildToolStep(
            event,
            stepId,
            'active',
            event.message ?? event.toolName ?? 'Processing...'
          )
        );
        break;
      }

      case 'tool_call': {
        const stepId = `${event.toolName ?? 'tool'}-${event.seq}`;
        if (event.toolName) {
          const queue = pendingStepIds.get(event.toolName) ?? [];
          queue.push(stepId);
          pendingStepIds.set(event.toolName, queue);
        }
        callbacks.onStep(
          this.buildToolStep(event, stepId, 'active', `Running ${event.toolName ?? 'tool'}...`)
        );
        break;
      }

      case 'tool_result': {
        // Pair with the earliest pending step_active/tool_call for this tool
        const queue = event.toolName ? pendingStepIds.get(event.toolName) : undefined;
        const stepId = queue?.shift() ?? `${event.toolName ?? 'tool'}-${event.seq}`;
        callbacks.onStep(
          this.buildToolStep(
            event,
            stepId,
            event.toolSuccess ? 'success' : 'error',
            event.message ??
              `${event.toolName ?? 'Tool'} ${event.toolSuccess ? 'completed' : 'failed'}`,
            event.toolResult ? this.summarizeToolResult(event.toolResult) : undefined
          )
        );
        break;
      }

      case 'step_done': {
        const queue = event.toolName ? pendingStepIds.get(event.toolName) : undefined;
        const stepId = queue?.shift() ?? `${event.toolName ?? 'step'}-${event.seq}`;
        callbacks.onStep(
          this.buildToolStep(event, stepId, 'success', event.message ?? 'Step completed')
        );
        break;
      }

      case 'step_error': {
        const queue = event.toolName ? pendingStepIds.get(event.toolName) : undefined;
        const stepId = queue?.shift() ?? `${event.toolName ?? 'step'}-${event.seq}`;
        callbacks.onStep(
          this.buildToolStep(event, stepId, 'error', event.message ?? event.error ?? 'Step failed')
        );
        break;
      }

      case 'card': {
        const cardData = event.cardData;
        if (
          cardData &&
          typeof cardData['type'] === 'string' &&
          typeof cardData['title'] === 'string' &&
          cardData['payload'] != null
        ) {
          callbacks.onCard?.(cardData as unknown as AgentXStreamCardEvent);
        }
        break;
      }

      case 'done':
        this.logger.info('Operation completed', {
          operationId,
          success: event.success,
        });
        this.breadcrumb.trackStateChange('operation-events:done', {
          operationId,
          success: event.success,
        });
        callbacks.onDone({
          success: event.success ?? false,
          message: event.message,
          error: event.error,
        });
        // Auto-unsubscribe when the operation is terminal
        this.unsubscribe(operationId);
        break;

      default:
        this.logger.debug('Unknown event type', {
          operationId,
          type: (event as { type: string }).type,
          seq: event.seq,
        });
    }
  }

  /**
   * Convert a tool result object into a short human-readable string
   * for the tool step detail accordion.
   */
  private summarizeToolResult(result: Record<string, unknown>): string {
    // Common patterns: { items: [...] }, { count: N }, { url: '...' }
    if (Array.isArray(result['items'])) {
      return `Found ${result['items'].length} result(s)`;
    }
    if (Array.isArray(result['views'])) {
      return `Found ${result['views'].length} data view(s)`;
    }
    if (typeof result['count'] === 'number') {
      return `${result['count']} result(s)`;
    }
    if (typeof result['url'] === 'string') {
      return 'Generated successfully';
    }
    if (typeof result['imageUrl'] === 'string') {
      return 'Image generated';
    }
    // Fallback: show key count
    const keys = Object.keys(result);
    return keys.length > 0 ? `Returned ${keys.length} field(s)` : 'Completed';
  }

  private buildToolStep(
    event: JobEvent,
    id: string,
    status: AgentXToolStepStatus,
    label: string,
    detail?: string
  ): AgentXToolStep {
    const step: AgentXToolStep = {
      id,
      label,
      agentId: normalizeAgentIdentifier(event.agentId),
      stageType: event.stageType,
      stage: event.stage,
      outcomeCode: event.outcomeCode,
      metadata: event.metadata,
      status,
      icon: normalizeToolStepIcon(event.icon),
      ...(detail ? { detail } : {}),
    };

    return {
      ...step,
      label: getToolStepDisplayLabel(step),
    };
  }
}
