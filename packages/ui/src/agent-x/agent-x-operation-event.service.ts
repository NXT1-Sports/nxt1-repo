/**
 * @fileoverview Agent X Operation Event Service — Firestore Live Event Bridge
 * @module @nxt1/ui/agent-x
 *
 * Subscribes to the `agentJobs/{operationId}/events` Firestore subcollection
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
 * (agentJobs/{id}/events)    (converts JobEvent)       (_messages, tool steps)
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

import { Injectable, inject, InjectionToken } from '@angular/core';
import type { JobEvent, AgentXToolStep, AgentXToolStepStatus } from '@nxt1/core/ai';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';

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

  /** Active subscriptions by operationId. */
  private readonly activeSubs = new Map<string, () => void>();

  /**
   * Subscribe to live events for a background operation.
   *
   * Establishes a Firestore `onSnapshot` listener on
   * `agentJobs/{operationId}/events` ordered by `seq`.
   * Incoming events are translated into the same callbacks
   * that the SSE streaming path uses.
   *
   * @returns A subscription handle. Call `.unsubscribe()` to stop listening.
   */
  subscribe(operationId: string, callbacks: OperationEventCallbacks): OperationEventSubscription {
    if (!this.firestoreAdapter) {
      this.logger.warn('No FIRESTORE_ADAPTER provided — live events unavailable');
      callbacks.onError('Live event streaming is not available');
      return { operationId, unsubscribe: () => {} };
    }

    // Don't double-subscribe to the same operation
    if (this.activeSubs.has(operationId)) {
      this.logger.warn('Already subscribed to operation', { operationId });
      return {
        operationId,
        unsubscribe: () => this.unsubscribe(operationId),
      };
    }

    this.logger.info('Subscribing to operation events', { operationId });
    this.breadcrumb.trackStateChange('operation-events:subscribing', { operationId });

    // Track the highest seq we've processed to avoid re-processing on snapshot updates
    let lastProcessedSeq = -1;

    const collectionPath = `agentJobs/${operationId}/events`;

    const unsubscribeFn = this.firestoreAdapter.onSnapshot(
      collectionPath,
      'seq',
      (docs) => {
        // Process only events we haven't seen yet
        for (const doc of docs) {
          const event = doc as unknown as JobEvent;
          if (typeof event.seq !== 'number' || event.seq <= lastProcessedSeq) continue;
          lastProcessedSeq = event.seq;

          this.processEvent(event, callbacks, operationId);
        }
      },
      (error) => {
        this.logger.error('Firestore listener error', error, { operationId });
        callbacks.onError(error.message);
      }
    );

    this.activeSubs.set(operationId, unsubscribeFn);

    return {
      operationId,
      unsubscribe: () => this.unsubscribe(operationId),
    };
  }

  /**
   * Stop listening to a specific operation's events.
   */
  unsubscribe(operationId: string): void {
    const unsub = this.activeSubs.get(operationId);
    if (unsub) {
      unsub();
      this.activeSubs.delete(operationId);
      this.logger.info('Unsubscribed from operation events', { operationId });
    }
  }

  /**
   * Stop all active subscriptions. Call on service destroy or logout.
   */
  unsubscribeAll(): void {
    for (const [operationId, unsub] of this.activeSubs) {
      unsub();
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

  // ─── Internal Event Processing ──────────────────────────────────────────

  private processEvent(
    event: JobEvent,
    callbacks: OperationEventCallbacks,
    operationId: string
  ): void {
    switch (event.type) {
      case 'delta':
        if (event.text) {
          callbacks.onDelta(event.text, event.agentId);
        }
        break;

      case 'step_active':
        callbacks.onStep({
          id: event.toolName ?? `step-${event.seq}`,
          label: event.message ?? event.toolName ?? 'Processing...',
          status: 'active' as AgentXToolStepStatus,
        });
        break;

      case 'tool_call':
        callbacks.onStep({
          id: event.toolName ?? `tool-${event.seq}`,
          label: `Running ${event.toolName ?? 'tool'}...`,
          status: 'active' as AgentXToolStepStatus,
        });
        break;

      case 'tool_result':
        callbacks.onStep({
          id: event.toolName ?? `tool-${event.seq}`,
          label:
            event.message ??
            `${event.toolName ?? 'Tool'} ${event.toolSuccess ? 'completed' : 'failed'}`,
          status: event.toolSuccess ? 'success' : 'error',
          detail: event.toolResult ? this.summarizeToolResult(event.toolResult) : undefined,
        });
        break;

      case 'step_done':
        callbacks.onStep({
          id: event.toolName ?? `step-${event.seq}`,
          label: event.message ?? 'Step completed',
          status: 'success' as AgentXToolStepStatus,
        });
        break;

      case 'step_error':
        callbacks.onStep({
          id: event.toolName ?? `step-${event.seq}`,
          label: event.message ?? event.error ?? 'Step failed',
          status: 'error' as AgentXToolStepStatus,
        });
        break;

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
}
