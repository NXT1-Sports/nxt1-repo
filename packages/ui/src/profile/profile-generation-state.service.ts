/**
 * @fileoverview Profile Generation State Service
 * @module @nxt1/ui/profile
 *
 * Tracks the Agent X profile generation job triggered during onboarding.
 * Provides reactive signals for the profile page to display a generation
 * overlay while Agent X scrapes linked accounts and enriches the profile.
 *
 * Lifecycle:
 * 1. Onboarding `handleCompletion()` calls `startGeneration(jobId, platforms)`
 * 2. Profile page detects `isGenerating()` and shows overlay
 * 3. Overlay calls `pollUntilDone()` which attaches to the live background
 *    operation event stream in Firestore
 * 4. When job completes/fails/times out, overlay dismisses and calls `reset()`
 * 5. If user navigates away and returns, overlay re-mounts and resumes polling
 *    from current backend progress (no phase reset)
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import type { JobEvent } from '@nxt1/core/ai';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import {
  AgentXOperationEventService,
  FIRESTORE_ADAPTER,
  type FirestoreAdapter,
  type OperationEventSubscription,
} from '../agent-x/agent-x-operation-event.service';
import { APP_EVENTS } from '@nxt1/core/analytics';

/** Generation status phases for UI messaging */
export type GenerationPhase =
  | 'connecting'
  | 'scraping'
  | 'analyzing'
  | 'building'
  | 'finalizing'
  | 'complete'
  | 'error';

/** Immutable snapshot of the generation state */
export interface GenerationSnapshot {
  readonly jobId: string;
  readonly platforms: string;
  readonly phase: GenerationPhase;
  readonly progress: number;
  readonly message: string;
}

/** Phase config: message + progress range */
const PHASE_CONFIG: Record<GenerationPhase, { message: string; progress: number }> = {
  connecting: { message: 'Connecting to your accounts...', progress: 5 },
  scraping: { message: 'Scraping profile data...', progress: 25 },
  analyzing: { message: 'Analyzing your stats & highlights...', progress: 55 },
  building: { message: 'Building your profile...', progress: 80 },
  finalizing: { message: 'Finalizing...', progress: 95 },
  complete: { message: 'Profile ready!', progress: 100 },
  error: { message: 'Generation encountered an issue', progress: 0 },
};

/** Max tracking duration before auto-dismissing (5 minutes — scraping + AI analysis takes time) */
const MAX_TRACK_DURATION_MS = 300_000;

const PHASE_ORDER: Record<GenerationPhase, number> = {
  connecting: 0,
  scraping: 1,
  analyzing: 2,
  building: 3,
  finalizing: 4,
  complete: 5,
  error: 6,
};

@Injectable({ providedIn: 'root' })
export class ProfileGenerationStateService {
  private readonly logger = inject(NxtLoggingService).child('ProfileGenerationState');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly operationEvents = inject(AgentXOperationEventService);
  private readonly firestoreAdapter = inject(FIRESTORE_ADAPTER, { optional: true });

  // ── Private writeable signals ─────────────────────────────────────────
  private readonly _jobId = signal<string | null>(null);
  private readonly _platforms = signal('');
  private readonly _phase = signal<GenerationPhase>('connecting');
  private readonly _progress = signal(0);
  private readonly _message = signal('');
  private readonly _isGenerating = signal(false);

  // ── Public readonly computed signals ──────────────────────────────────
  readonly isGenerating = computed(() => this._isGenerating());
  readonly phase = computed(() => this._phase());
  readonly progress = computed(() => this._progress());
  readonly message = computed(() => this._message());
  readonly platforms = computed(() => this._platforms());
  /** The jobId of the active or most recently completed generation */
  readonly jobId = computed(() => this._jobId());

  readonly snapshot = computed<GenerationSnapshot | null>(() => {
    const jobId = this._jobId();
    if (!jobId) return null;
    return {
      jobId,
      platforms: this._platforms(),
      phase: this._phase(),
      progress: this._progress(),
      message: this._message(),
    };
  });

  // ── Live tracking state ──────────────────────────────────────────────
  private trackingTimeout: ReturnType<typeof setTimeout> | null = null;
  private trackingStartTime = 0;
  /** Guards against concurrent `pollUntilDone()` calls */
  private isPolling = false;
  /** Tracks whether backend progress has been received at least once */
  private hasReceivedBackendProgress = false;
  private activeOperationSubscription: OperationEventSubscription | null = null;

  /**
   * Called by onboarding `handleCompletion()` after the Agent X job is enqueued.
   * Activates the generation overlay state.
   */
  startGeneration(jobId: string, platforms: string): void {
    this.logger.info('Profile generation started', { jobId, platforms });
    this.breadcrumb.trackStateChange('profile-generation:started', { jobId });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_GENERATION_STARTED, {
      jobId,
      platforms,
    });

    this._jobId.set(jobId);
    this._platforms.set(platforms);
    this._isGenerating.set(true);
    this.hasReceivedBackendProgress = false;
    this.setPhase('connecting');
  }

  /**
   * Track the Agent X job until completion, failure, or timeout.
   * Called by the overlay component in `ngOnInit()`.
   *
   * Idempotent — if polling is already active, the call returns a promise
   * that resolves with the same result (prevents duplicate poll loops when
   * the overlay re-mounts after navigation).
   */
  async pollUntilDone(): Promise<'completed' | 'failed' | 'timeout'> {
    const jobId = this._jobId();
    if (!jobId) return 'failed';

    // Guard: prevent duplicate polling loops
    if (this.isPolling) {
      this.logger.info('Poll already active, attaching to existing loop', { jobId });
      return this.awaitCurrentPoll();
    }

    this.isPolling = true;
    this.trackingStartTime = Date.now();
    this.logger.info('Starting live profile generation tracking', { jobId });
    this.breadcrumb.trackStateChange('profile-generation:tracking', { jobId });

    if (!this.firestoreAdapter) {
      this.logger.warn('Profile generation tracking unavailable without Firestore adapter', {
        jobId,
      });
      this.resolvePoll('timeout');
      return 'timeout';
    }

    // Only show the connecting → scraping intro sequence on first poll.
    // On re-mount (navigate away and back), skip the intro and immediately
    // start polling with whatever phase/progress the backend reports.
    if (!this.hasReceivedBackendProgress) {
      this.setPhase('connecting');
      await this.delay(1500);
      if (!this._isGenerating()) {
        this.isPolling = false;
        return 'completed';
      }
      this.setPhase('scraping');
    }

    return new Promise((resolve) => {
      this.activePollResolve = resolve;
      this.subscribeToOperation(jobId);
    });
  }

  /**
   * Stop active polling without resetting state.
   * Called by the overlay's `ngOnDestroy` when the user navigates away
   * mid-generation. The `isGenerating` flag stays true so the overlay
   * re-appears on return and resumes polling from current progress.
   */
  stopPolling(): void {
    if (this.trackingTimeout) {
      clearTimeout(this.trackingTimeout);
      this.trackingTimeout = null;
    }
    this.activeOperationSubscription?.unsubscribe();
    this.activeOperationSubscription = null;
    this.isPolling = false;
    this.activePollResolve = null;
    this.logger.info('Profile generation tracking stopped (overlay unmounted)', {
      jobId: this._jobId(),
    });
  }

  /**
   * Reset all state. Called when the overlay is dismissed (completed or skipped).
   */
  reset(): void {
    this.stopPolling();
    this._jobId.set(null);
    this._platforms.set('');
    this._phase.set('connecting');
    this._progress.set(0);
    this._message.set('');
    this._isGenerating.set(false);
    this.hasReceivedBackendProgress = false;
  }

  /**
   * One-shot status check for a known jobId.
   * Used by the profile page on init to detect if a background generation
   * completed while the user was away. Returns the backend-derived status
   * ('completed' | 'failed' | 'processing' | 'pending' | null).
   */
  async checkJobStatus(jobId: string): Promise<string | null> {
    if (this._jobId() === jobId) {
      const phase = this._phase();
      if (phase === 'complete') return 'completed';
      if (phase === 'error') return 'failed';
      if (this._isGenerating()) return 'processing';
    }

    return this.readOperationStatus(jobId, this.firestoreAdapter);
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /** Resolve function for the current `pollUntilDone()` promise */
  private activePollResolve: ((result: 'completed' | 'failed' | 'timeout') => void) | null = null;

  /**
   * Returns a promise that resolves when the current active poll finishes.
   * Used by concurrent `pollUntilDone()` calls to piggyback on the active loop.
   */
  private awaitCurrentPoll(): Promise<'completed' | 'failed' | 'timeout'> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (!this.isPolling) {
          const phase = this._phase();
          resolve(phase === 'complete' ? 'completed' : phase === 'error' ? 'failed' : 'timeout');
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  private subscribeToOperation(jobId: string): void {
    this.clearTrackingTimeout();
    this.trackingTimeout = setTimeout(() => {
      this.logger.warn('Profile generation tracking timed out', { jobId });
      this.finishGeneration('timeout');
      this.resolvePoll('timeout');
    }, MAX_TRACK_DURATION_MS);

    this.activeOperationSubscription?.unsubscribe();
    this.activeOperationSubscription = this.operationEvents.subscribe(jobId, {
      onDelta: () => {
        this.hasReceivedBackendProgress = true;
        if (PHASE_ORDER[this._phase()] < PHASE_ORDER.analyzing) {
          this.promotePhase('analyzing');
        }
      },
      onStep: (step) => {
        this.hasReceivedBackendProgress = true;
        this.promotePhase(this.resolvePhaseFromStep(step.label, step.detail));
      },
      onDone: ({ success, error }) => {
        if (!this.isPolling) return;

        if (success) {
          this.logger.info('Profile generation completed', { jobId });
          this.setPhase('complete');
          void this.delay(1200).then(() => {
            this.finishGeneration('completed');
            this.resolvePoll('completed');
          });
          return;
        }

        this.logger.warn('Profile generation job failed', { jobId, error });
        this.setPhase('error');
        this.finishGeneration('failed');
        this.resolvePoll('failed');
      },
      onError: (message) => {
        this.logger.error('Profile generation live tracking failed', new Error(message), {
          jobId,
        });
      },
    });
  }

  /** Resolve the active poll promise and clear the polling flag. */
  private resolvePoll(result: 'completed' | 'failed' | 'timeout'): void {
    this.clearTrackingTimeout();
    this.activeOperationSubscription?.unsubscribe();
    this.activeOperationSubscription = null;
    this.isPolling = false;
    this.activePollResolve?.(result);
    this.activePollResolve = null;
  }

  private setPhase(phase: GenerationPhase): void {
    const config = PHASE_CONFIG[phase];
    this._phase.set(phase);
    this._progress.set(config.progress);
    this._message.set(config.message);
  }

  private promotePhase(nextPhase: GenerationPhase): void {
    const currentPhase = this._phase();
    if (PHASE_ORDER[nextPhase] > PHASE_ORDER[currentPhase]) {
      this.setPhase(nextPhase);
      return;
    }

    const nextProgress = PHASE_CONFIG[nextPhase].progress;
    if (this._progress() < nextProgress) {
      this._progress.set(nextProgress);
    }
  }

  private resolvePhaseFromStep(label?: string, detail?: string): GenerationPhase {
    const stepText = `${label ?? ''} ${detail ?? ''}`.toLowerCase();

    if (/final|complete|done|persist|save|sync|publish|write back|finish|ready/.test(stepText)) {
      return 'finalizing';
    }

    if (/build|compose|generate|merge|update profile|enrich|draft|create|assemble/.test(stepText)) {
      return 'building';
    }

    if (/analy|review|score|classif|extract|parse|rank|intel|reason/.test(stepText)) {
      return 'analyzing';
    }

    if (/connect|auth|login|session|open|scrap|crawl|fetch|pull|collect|source/.test(stepText)) {
      return 'scraping';
    }

    const currentPhase = this._phase();
    if (currentPhase === 'connecting') return 'scraping';
    if (currentPhase === 'scraping') return 'analyzing';
    if (currentPhase === 'analyzing') return 'building';
    return 'finalizing';
  }

  private clearTrackingTimeout(): void {
    if (this.trackingTimeout) {
      clearTimeout(this.trackingTimeout);
      this.trackingTimeout = null;
    }
  }

  private readOperationStatus(
    jobId: string,
    firestoreAdapter: FirestoreAdapter | null
  ): Promise<string | null> {
    if (!firestoreAdapter) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      let settled = false;
      const settle = (status: string | null): void => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(status);
      };

      const timeout = setTimeout(() => settle(null), 2_000);

      const unsubscribe = firestoreAdapter.onSnapshot(
        `agentJobs/${jobId}/events`,
        'seq',
        (docs) => {
          clearTimeout(timeout);
          const events = docs as unknown as readonly JobEvent[];
          const doneEvent = [...events]
            .reverse()
            .find((event) => event.type === 'done' && typeof event.success === 'boolean');

          if (doneEvent) {
            settle(doneEvent.success ? 'completed' : 'failed');
            return;
          }

          settle(events.length > 0 ? 'processing' : 'pending');
        },
        () => {
          clearTimeout(timeout);
          settle(null);
        }
      );
    });
  }

  private finishGeneration(result: 'completed' | 'failed' | 'timeout'): void {
    const jobId = this._jobId();
    this.logger.info('Profile generation finished', { jobId, result });
    this.breadcrumb.trackStateChange('profile-generation:finished', { jobId, result });
    this.analytics?.trackEvent(
      result === 'completed'
        ? APP_EVENTS.PROFILE_GENERATION_COMPLETED
        : APP_EVENTS.PROFILE_GENERATION_FAILED,
      { jobId, result }
    );

    this.clearTrackingTimeout();
    // NOTE: Do NOT set _isGenerating to false here.
    // The overlay's dismiss() → reset() handles that after the fade-out animation
    // completes and the dismissed event is emitted. Setting it here would destroy
    // the overlay via @if before it can emit its output (NG0953).
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
