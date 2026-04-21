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

import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { AgentXToolStep, JobEvent } from '@nxt1/core/ai';
import { createAgentXApi } from '@nxt1/core/ai';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { APP_EVENTS } from '@nxt1/core/analytics';
import {
  AgentXStreamRegistryService,
  type OperationObserver,
} from '../agent-x/agent-x-stream-registry.service';
import { AGENT_X_API_BASE_URL, AGENT_X_AUTH_TOKEN_FACTORY } from '../agent-x/agent-x-job.service';
import {
  FIRESTORE_ADAPTER,
  type FirestoreAdapter,
} from '../agent-x/agent-x-operation-event.service';

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
  scraping: { message: 'Retrieving profile info...', progress: 25 },
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

const PROFILE_WRITE_TOOL_NAMES = new Set([
  'write_core_identity',
  'write_connected_source',
  'write_athlete_videos',
  'write_schedule',
  'write_season_stats',
  'write_combine_metrics',
  'write_rankings',
  'write_awards',
  'write_recruiting_activity',
  'write_intel',
  'update_intel',
  'write_team_stats',
  'write_roster_entries',
]);

@Injectable({ providedIn: 'root' })
export class ProfileGenerationStateService {
  private readonly logger = inject(NxtLoggingService).child('ProfileGenerationState');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly streamRegistry = inject(AgentXStreamRegistryService);
  private readonly firestoreAdapter = inject(FIRESTORE_ADAPTER, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiBaseUrl = inject(AGENT_X_API_BASE_URL, { optional: true });
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });

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
  /** Guards against concurrent `pollUntilDone()` calls */
  private isPolling = false;
  /** Tracks whether backend progress has been received at least once */
  private hasReceivedBackendProgress = false;
  /** AbortController for the SSE resume stream opened by `attachToOperation()`. */
  private resumeStream: AbortController | null = null;
  /**
   * Per-operation registry observer handles.
   * Keyed by operationId — allows clean unregistration on reset.
   */
  private readonly operationHandles = new Map<string, symbol>();
  /** Platforms string stored per-watched-operation until the banner starts */
  private readonly watchedPlatforms = new Map<string, string>();

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
   * Register an operation to watch for profile writes from SSE.
   * When the operation emits a profile-write tool step, the generation
   * banner is auto-started. Registers a per-operation observer on
   * `AgentXStreamRegistryService` so events are received even after the
   * chat component unmounts (singleton registry survives navigation).
   *
   * Called by AgentXJobService after dispatching a background task.
   */
  watchForProfileWrites(operationId: string, platforms = ''): void {
    if (!operationId) return;
    if (this.operationHandles.has(operationId)) return;

    this.watchedPlatforms.set(operationId, platforms);

    const observer: OperationObserver = {
      onStep: (step) => this._onRegistryStep(operationId, step),
      onDone: (_metadata) => this._onRegistryDone(operationId, true),
      onError: (error) => this._onRegistryDone(operationId, false, error),
    };

    const handle = this.streamRegistry.watchOperation(operationId, observer);
    this.operationHandles.set(operationId, handle);

    this.logger.info('Watching operation for profile writes via stream registry', {
      operationId,
      platforms: platforms || undefined,
    });
  }

  /**
   * Called by onboarding `handleCompletion()` when the backend returns both
   * `scrapeJobId` (operationId) and `scrapeThreadId`.
   *
   * 1. Registers the registry observer (via `watchForProfileWrites`)
   * 2. Activates the generation banner (via `startGeneration`)
   * 3. Opens a headless SSE resume stream so the `onThread` event fires
   *    `streamRegistry.linkOperation(operationId, threadId)`, which fans out
   *    step/done events to the registered observer — advancing the banner.
   *
   * Browser-only: no-ops on SSR or when the auth token is unavailable.
   */
  attachToOperation(operationId: string, threadId: string | undefined, platforms: string): void {
    if (!operationId) return;

    // Register observer and activate banner
    this.watchForProfileWrites(operationId, platforms);
    this.startGeneration(operationId, platforms);

    if (!isPlatformBrowser(this.platformId) || !this.apiBaseUrl) {
      this.logger.info('Skipping SSE resume attach (SSR or no base URL)', { operationId });
      return;
    }

    // Open the SSE resume stream asynchronously — do not block the caller.
    void this._openResumeStream(operationId, threadId);
  }

  private async _openResumeStream(
    operationId: string,
    threadId: string | undefined
  ): Promise<void> {
    const authToken = await this.getAuthToken?.().catch(() => null);
    if (!authToken) {
      this.logger.warn('Cannot open SSE resume stream — no auth token', { operationId });
      return;
    }

    // Cancel any previous resume stream (e.g. double-call on hot-reload).
    this.resumeStream?.abort();

    const api = createAgentXApi(
      {
        // Stub adapter — only `streamMessage` (raw fetch) is used here.
        get: () => Promise.reject(new Error('not used')),
        post: () => Promise.reject(new Error('not used')),
        put: () => Promise.reject(new Error('not used')),
        patch: () => Promise.reject(new Error('not used')),
        delete: () => Promise.reject(new Error('not used')),
      },
      this.apiBaseUrl!
    );

    this.resumeStream = api.streamMessage(
      {
        message: '',
        resumeOperationId: operationId,
        ...(threadId ? { threadId } : {}),
      },
      {
        onThread: (evt) => {
          // Wire the operationId ↔ threadId mapping in the registry so all
          // registered observers receive subsequent step/done/error events.
          this.streamRegistry.linkOperation(operationId, evt.threadId);
          if (this.resumeStream) {
            this.streamRegistry.register(evt.threadId, this.resumeStream);
          }
          this.logger.info('SSE resume stream thread resolved', {
            operationId,
            threadId: evt.threadId,
          });
        },
        onStep: (step) => this._onRegistryStep(operationId, step),
        onDone: (_meta) => this._onRegistryDone(operationId, true),
        onError: (err) => {
          this.logger.warn('SSE resume stream error', { operationId, error: err.error });
          this._onRegistryDone(operationId, false, err.error);
        },
        // No-op for delta/card/media/panel — this is a headless tracking stream.
        onDelta: () => undefined,
        onCard: () => undefined,
        onMedia: () => undefined,
        onPanel: () => undefined,
      },
      authToken,
      this.apiBaseUrl!
    );

    this.logger.info('SSE resume stream opened for profile generation', { operationId, threadId });
  }

  // ─── Internal observer callbacks (called from registry) ─────────────

  private _onRegistryStep(operationId: string, step: AgentXToolStep): void {
    // Auto-start banner when we see a profile-write tool for a watched operation.
    if (!this._isGenerating() || this._jobId() !== operationId) {
      if (!this.isProfileWriteStep(step)) return;
      const platforms = this.watchedPlatforms.get(operationId) ?? '';
      this.startGeneration(operationId, platforms);
    }
    this.hasReceivedBackendProgress = true;
    this.promotePhase(this.resolvePhaseFromStep(step.label, step.detail));
  }

  private _onRegistryDone(operationId: string, success: boolean, error?: string): void {
    if (this._jobId() !== operationId || !this._isGenerating()) return;
    if (!this.isPolling && this.activePollResolve === null) return;

    if (success) {
      this.logger.info('Profile generation completed via stream registry', { operationId });
      this.setPhase('complete');
      void this.delay(1200).then(() => {
        this.finishGeneration('completed');
        this.resolvePoll('completed');
      });
    } else {
      this.logger.warn('Profile generation job failed via stream registry', { operationId, error });
      this.setPhase('error');
      this.finishGeneration('failed');
      this.resolvePoll('failed');
    }

    // Unregister once we've received the terminal event
    this._unwatchOperation(operationId);
  }

  private _unwatchOperation(operationId: string): void {
    const handle = this.operationHandles.get(operationId);
    if (handle !== undefined) {
      this.streamRegistry.unwatchOperation(operationId, handle);
      this.operationHandles.delete(operationId);
    }
    this.watchedPlatforms.delete(operationId);
  }

  /**
   * @deprecated Use watchForProfileWrites() — the registry observer pattern
   * is now the canonical way to receive SSE events for profile generation.
   * These two methods are kept for backward compat with any callers that
   * were wired in the previous session and will be removed in the next cleanup.
   */
  receiveStep(operationId: string, step: AgentXToolStep): void {
    this._onRegistryStep(operationId, step);
  }

  /** @deprecated See receiveStep() */
  receiveJobDone(operationId: string, success: boolean, error?: string): void {
    this._onRegistryDone(operationId, success, error);
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
    this.logger.info('Starting live profile generation tracking via SSE bridge', { jobId });
    this.breadcrumb.trackStateChange('profile-generation:tracking', { jobId });

    // Only show the connecting → scraping intro sequence on first poll.
    if (!this.hasReceivedBackendProgress) {
      this.setPhase('connecting');
      await this.delay(1500);
      if (!this._isGenerating()) {
        this.isPolling = false;
        return 'completed';
      }
      if (!this.hasReceivedBackendProgress) {
        this.setPhase('scraping');
      }
    }

    // Start a max-duration timeout so the banner self-dismisses if the SSE
    // bridge never delivers a done event (e.g. user opened profile tab directly
    // without going through Agent X chat).
    return new Promise((resolve) => {
      this.activePollResolve = resolve;
      this.clearTrackingTimeout();
      this.trackingTimeout = setTimeout(() => {
        this.logger.warn('Profile generation tracking timed out', { jobId });
        this.finishGeneration('timeout');
        this.resolvePoll('timeout');
      }, MAX_TRACK_DURATION_MS);
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
    const currentJobId = this._jobId();
    this.stopPolling();
    this.resumeStream?.abort();
    this.resumeStream = null;
    if (currentJobId) {
      this._unwatchOperation(currentJobId);
    }
    // Clean up any remaining watchers (e.g. watched but never started)
    for (const [opId] of this.operationHandles) {
      this._unwatchOperation(opId);
    }
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

  // subscribeToOperation() removed — events are bridged from AgentXOperationChatComponent
  // via receiveStep() / receiveJobDone() instead of being read from Firestore.

  /** Resolve the active poll promise and clear the polling flag. */
  private resolvePoll(result: 'completed' | 'failed' | 'timeout'): void {
    this.clearTrackingTimeout();
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

  /** Returns true if the step label references a profile-write tool name. */
  private isProfileWriteStep(step: AgentXToolStep): boolean {
    const label = (step.label ?? '').toLowerCase();
    for (const toolName of PROFILE_WRITE_TOOL_NAMES) {
      if (label.includes(toolName.toLowerCase())) return true;
    }
    return false;
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
        `AgentJobs/${jobId}/events`,
        'seq',
        (docs: ReadonlyArray<Record<string, unknown>>) => {
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
