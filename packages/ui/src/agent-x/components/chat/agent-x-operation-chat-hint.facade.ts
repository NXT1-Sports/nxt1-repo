import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { type AgentXHintDockItem } from './agent-x-operation-chat-hint-dock.component';

/**
 * @fileoverview Agent X Operation Chat Hint Facade
 * @module @nxt1/ui/agent-x
 *
 * Manages hint lifecycle, dismissal, and display logic.
 * Currently supports:
 * - LIVE_VIEW_DISMISS: Hint to dismiss the live view panel when user has had session open > N seconds
 */

const LIVE_VIEW_HINT_MIN_DURATION_MS = 20_000; // Show hint after 20 seconds
const LIVE_VIEW_HINT_AUTO_DISMISS_MS = 15_000; // Auto-dismiss after 15 seconds

@Injectable()
export class AgentXOperationChatHintFacade {
  private readonly destroyRef = inject(DestroyRef);

  // ─── Signals ────────────────────────────────────────────────────────────────
  private readonly _dismissedHints = signal<Set<string>>(new Set());
  private readonly _liveViewSessionStartTime = signal<number | null>(null);
  private readonly _liveViewActive = signal(false);
  private readonly _nowMs = signal(Date.now());
  private readonly _hintShownTime = signal<number | null>(null);

  private liveViewHintTimer: ReturnType<typeof setInterval> | null = null;
  private liveViewHintAutoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopLiveViewHintTimer();
    });
  }

  // ─── Computed ───────────────────────────────────────────────────────────────

  /**
   * All hints to display, filtered by dismissal state.
   * Ordered: live view hints first.
   */
  readonly hints = computed((): readonly AgentXHintDockItem[] => {
    const dismissed = this._dismissedHints();
    const hintList: AgentXHintDockItem[] = [];

    // Live view hint: show after 20 seconds of active live view
    if (
      this._liveViewActive() &&
      this._liveViewSessionStartTime() !== null &&
      !dismissed.has('LIVE_VIEW_DISMISS')
    ) {
      const elapsed = this._nowMs() - (this._liveViewSessionStartTime() ?? 0);
      if (elapsed >= LIVE_VIEW_HINT_MIN_DURATION_MS) {
        // Track when hint was first shown so we can auto-dismiss
        if (this._hintShownTime() === null) {
          this._hintShownTime.set(this._nowMs());
          this.scheduleHintAutoDismiss();
        }

        hintList.push({
          hintKey: 'LIVE_VIEW_DISMISS',
          icon: 'close-circle',
          title: 'You can close the panel anytime',
          description:
            'Agent X will keep this browser session open and can continue analyzing the page for up to 1 hour.',
          actionLabel: undefined,
        });
      }
    }

    return hintList;
  });

  /**
   * Whether to render the hint dock at all.
   */
  readonly shouldRenderDock = computed(() => this.hints().length > 0);

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Mark the live view session as active and start timer for hint.
   */
  markLiveViewActive(startTime?: number): void {
    this._liveViewActive.set(true);
    this._liveViewSessionStartTime.set(startTime ?? Date.now());
    this._nowMs.set(Date.now());
    this.startLiveViewHintTimer();
  }

  /**
   * Mark the live view session as inactive (panel closed).
   */
  markLiveViewInactive(): void {
    this._liveViewActive.set(false);
    this._liveViewSessionStartTime.set(null);
    this.stopLiveViewHintTimer();
  }

  /**
   * Dismiss a hint permanently for this session.
   */
  dismissHint(hintKey: string): void {
    this._dismissedHints.update((dismissed) => new Set([...dismissed, hintKey]));
  }

  /**
   * Reset all hints (for testing or session reset).
   */
  resetHints(): void {
    this._dismissedHints.set(new Set());
    this._liveViewActive.set(false);
    this._liveViewSessionStartTime.set(null);
    this._hintShownTime.set(null);
    this.stopLiveViewHintTimer();
    this.cancelHintAutoDismiss();
    this._nowMs.set(Date.now());
  }

  private startLiveViewHintTimer(): void {
    if (this.liveViewHintTimer !== null) return;

    // Keep hint timing reactive while live view is active.
    this.liveViewHintTimer = setInterval(() => {
      this._nowMs.set(Date.now());
    }, 1_000);
  }

  private stopLiveViewHintTimer(): void {
    if (this.liveViewHintTimer === null) return;
    clearInterval(this.liveViewHintTimer);
    this.liveViewHintTimer = null;
  }

  private scheduleHintAutoDismiss(): void {
    this.cancelHintAutoDismiss();
    this.liveViewHintAutoDismissTimer = setTimeout(() => {
      this.dismissHint('LIVE_VIEW_DISMISS');
      this.liveViewHintAutoDismissTimer = null;
    }, LIVE_VIEW_HINT_AUTO_DISMISS_MS);
  }

  private cancelHintAutoDismiss(): void {
    if (this.liveViewHintAutoDismissTimer === null) return;
    clearTimeout(this.liveViewHintAutoDismissTimer);
    this.liveViewHintAutoDismissTimer = null;
  }
}
