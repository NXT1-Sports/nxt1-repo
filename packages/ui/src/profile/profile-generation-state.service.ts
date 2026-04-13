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
 * 3. Overlay calls `pollUntilDone()` which polls the current background job state
 * 4. When job completes/fails/times out, overlay dismisses and calls `reset()`
 * 5. If user navigates away and returns, overlay re-mounts and resumes polling
 *    from current backend progress (no phase reset)
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { AgentXJobService } from '../agent-x/agent-x-job.service';
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

/** Max poll duration before auto-dismissing (5 minutes — scraping + AI analysis takes time) */
const MAX_POLL_DURATION_MS = 300_000;

/** Poll interval (3 seconds) */
const POLL_INTERVAL_MS = 3_000;

@Injectable({ providedIn: 'root' })
export class ProfileGenerationStateService {
  private readonly logger = inject(NxtLoggingService).child('ProfileGenerationState');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly agentXJobService = inject(AgentXJobService);

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

  // ── Polling state ────────────────────────────────────────────────────
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollStartTime = 0;
  /** Guards against concurrent `pollUntilDone()` calls */
  private isPolling = false;
  /** Tracks whether backend progress has been received at least once */
  private hasReceivedBackendProgress = false;

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
   * Poll the Agent X job status until completion, failure, or timeout.
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
    this.pollStartTime = Date.now();
    this.logger.info('Starting status polling', { jobId });
    this.breadcrumb.trackStateChange('profile-generation:polling', { jobId });

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
      void this.poll(jobId);
    });
  }

  /**
   * Stop active polling without resetting state.
   * Called by the overlay's `ngOnDestroy` when the user navigates away
   * mid-generation. The `isGenerating` flag stays true so the overlay
   * re-appears on return and resumes polling from current progress.
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
    this.activePollResolve = null;
    this.logger.info('Polling stopped (overlay unmounted)', { jobId: this._jobId() });
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
   * completed while the user was away. Returns the backend-reported status
   * ('completed' | 'failed' | 'processing' | 'pending' | null).
   */
  async checkJobStatus(jobId: string): Promise<string | null> {
    const status = await this.agentXJobService.getStatus(jobId);
    return status?.status ?? null;
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

  /**
   * Core polling loop — recursively polls until the job reaches a terminal state.
   */
  private async poll(jobId: string): Promise<void> {
    if (!this._isGenerating() || !this.isPolling) {
      this.resolvePoll('completed');
      return;
    }

    // Timeout check
    if (Date.now() - this.pollStartTime > MAX_POLL_DURATION_MS) {
      this.logger.warn('Profile generation polling timed out', { jobId });
      this.finishGeneration('timeout');
      this.resolvePoll('timeout');
      return;
    }

    const status = await this.agentXJobService.getStatus(jobId);

    if (!status) {
      // Network error — keep polling, don't fail immediately
      this.pollTimer = setTimeout(() => void this.poll(jobId), POLL_INTERVAL_MS);
      return;
    }

    // Map backend status to UI phase
    this.mapStatusToPhase(status);

    if (status.status === 'completed') {
      this.logger.info('Profile generation completed', { jobId });
      this.setPhase('complete');
      // Brief pause to show "Profile ready!" message
      await this.delay(1200);
      this.finishGeneration('completed');
      this.resolvePoll('completed');
      return;
    }

    if (status.status === 'failed') {
      this.logger.warn('Profile generation job failed', {
        jobId,
        error: status.error,
      });
      this.finishGeneration('failed');
      this.resolvePoll('failed');
      return;
    }

    // Still in progress — poll again
    this.pollTimer = setTimeout(() => void this.poll(jobId), POLL_INTERVAL_MS);
  }

  /** Resolve the active poll promise and clear the polling flag. */
  private resolvePoll(result: 'completed' | 'failed' | 'timeout'): void {
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

  private mapStatusToPhase(
    status: NonNullable<Awaited<ReturnType<AgentXJobService['getStatus']>>>
  ): void {
    const percent = status.progress?.percent ?? 0;
    const message = status.progress?.message;

    // Track that we've received real progress from the backend
    if (percent > 0 || message) {
      this.hasReceivedBackendProgress = true;
    }

    if (percent < 20) {
      this.setPhase('scraping');
    } else if (percent < 50) {
      this.setPhase('analyzing');
    } else if (percent < 85) {
      this.setPhase('building');
    } else {
      this.setPhase('finalizing');
    }

    // Override message if backend provides one
    if (message) {
      this._message.set(message);
    }
    // Always update progress to the real value
    if (percent > 0) {
      this._progress.set(percent);
    }
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

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    // NOTE: Do NOT set _isGenerating to false here.
    // The overlay's dismiss() → reset() handles that after the fade-out animation
    // completes and the dismissed event is emitted. Setting it here would destroy
    // the overlay via @if before it can emit its output (NG0953).
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
