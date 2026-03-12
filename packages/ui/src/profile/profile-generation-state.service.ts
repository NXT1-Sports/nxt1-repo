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
 * 3. Profile page calls `pollUntilDone()` which polls `/agent-x/status/:id`
 * 4. When job completes/fails/times out, `isGenerating` → false, overlay dismissed
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

/** Max poll duration before auto-dismissing (2 minutes) */
const MAX_POLL_DURATION_MS = 120_000;

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
    this.setPhase('connecting');
  }

  /**
   * Poll the Agent X job status until completion, failure, or timeout.
   * Called by the profile page when it detects `isGenerating()`.
   * Resolves when the job is done (success or failure).
   */
  async pollUntilDone(): Promise<'completed' | 'failed' | 'timeout'> {
    const jobId = this._jobId();
    if (!jobId) return 'failed';

    this.pollStartTime = Date.now();
    this.logger.info('Starting status polling', { jobId });
    this.breadcrumb.trackStateChange('profile-generation:polling', { jobId });

    // Start with a connecting → scraping phase transition after a brief delay
    this.setPhase('connecting');
    await this.delay(1500);
    if (!this._isGenerating()) return 'completed';
    this.setPhase('scraping');

    return new Promise((resolve) => {
      const poll = async (): Promise<void> => {
        if (!this._isGenerating()) {
          resolve('completed');
          return;
        }

        // Timeout check
        if (Date.now() - this.pollStartTime > MAX_POLL_DURATION_MS) {
          this.logger.warn('Profile generation polling timed out', { jobId });
          this.finishGeneration('timeout');
          resolve('timeout');
          return;
        }

        const status = await this.agentXJobService.getStatus(jobId);

        if (!status) {
          // Network error — keep polling, don't fail immediately
          this.pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
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
          resolve('completed');
          return;
        }

        if (status.status === 'failed') {
          this.logger.warn('Profile generation job failed', {
            jobId,
            error: status.error,
          });
          this.finishGeneration('failed');
          resolve('failed');
          return;
        }

        // Still in progress — poll again
        this.pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      };

      void poll();
    });
  }

  /**
   * Reset all state. Called when the overlay is dismissed or component destroys.
   */
  reset(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this._jobId.set(null);
    this._platforms.set('');
    this._phase.set('connecting');
    this._progress.set(0);
    this._message.set('');
    this._isGenerating.set(false);
  }

  // ── Private helpers ──────────────────────────────────────────────────

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
