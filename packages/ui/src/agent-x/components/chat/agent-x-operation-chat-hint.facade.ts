import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { type AgentXHintDockItem } from './agent-x-operation-chat-hint-dock.component';

/**
 * @fileoverview Agent X Operation Chat Hint Facade
 * @module @nxt1/ui/agent-x
 *
 * Manages short-lived, first-open panel hints for the operation chat dock.
 */

export type AgentXPanelHintKind = 'gameplans' | 'playbooks' | 'film-review';

const PANEL_HINT_AUTO_DISMISS_MS = 25_000;
const FIRST_USER_RUN_HINT_DELAY_MS = 10_000;
const FIRST_USER_RUN_HINT_AUTO_DISMISS_MS = 30_000;
const FIRST_USER_RUN_HINT_KEY = 'FIRST_USER_RUN:leave-thread';

const FIRST_USER_RUN_HINT: AgentXHintDockItem = {
  hintKey: FIRST_USER_RUN_HINT_KEY,
  icon: 'clock',
  title: 'Keep working while Agent X runs',
  description:
    'You can leave this thread and keep working anywhere in NXT1. Agent X will notify you here when this run finishes.',
  tone: 'brand',
};

const PANEL_HINTS: Record<AgentXPanelHintKind, Omit<AgentXHintDockItem, 'hintKey'>> = {
  gameplans: {
    icon: 'clipboard-list',
    title: 'Game Plans',
    description: 'Drag a game plan or tactical item into the composer to attach it as context.',
  },
  playbooks: {
    icon: 'book-open',
    title: 'Playbooks',
    description: 'Drag plays, callsheets, or install cards into the composer to brief Agent X.',
  },
  'film-review': {
    icon: 'film',
    title: 'Film Review',
    description: 'Drag clips or marked-up plays into the composer to include the review context.',
    tone: 'brand',
  },
};

@Injectable()
export class AgentXOperationChatHintFacade {
  private readonly destroyRef = inject(DestroyRef);

  // ─── Signals ────────────────────────────────────────────────────────────────
  private readonly _dismissedHints = signal<Set<string>>(new Set());
  private readonly _shownPanelHints = signal<Set<AgentXPanelHintKind>>(new Set());
  private readonly _activePanelHint = signal<AgentXHintDockItem | null>(null);
  private readonly _activeRuntimeHint = signal<AgentXHintDockItem | null>(null);
  private readonly _firstUserRunHintArmed = signal(false);
  private readonly _firstUserRunHintShown = signal(false);
  private readonly _isFirstUserRunActive = signal(false);

  private panelHintAutoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private firstUserRunHintTimer: ReturnType<typeof setTimeout> | null = null;
  private firstUserRunAutoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.cancelPanelHintAutoDismiss();
      this.cancelFirstUserRunHintTimer();
      this.cancelFirstUserRunAutoDismissTimer();
    });
  }

  // ─── Computed ───────────────────────────────────────────────────────────────

  /**
   * All hints to display, filtered by dismissal state.
   */
  readonly hints = computed((): readonly AgentXHintDockItem[] => {
    const dismissed = this._dismissedHints();
    const runtimeHint = this._activeRuntimeHint();
    if (runtimeHint && !dismissed.has(runtimeHint.hintKey)) {
      return [runtimeHint];
    }
    const activeHint = this._activePanelHint();
    return activeHint && !dismissed.has(activeHint.hintKey) ? [activeHint] : [];
  });

  /**
   * Whether to render the hint dock at all.
   */
  readonly shouldRenderDock = computed(() => this.hints().length > 0);

  // ─── Public API ──────────────────────────────────────────────────────────────

  showPanelHint(panel: AgentXPanelHintKind): void {
    if (this._shownPanelHints().has(panel)) return;

    const hintKey = this.panelHintKey(panel);
    this._shownPanelHints.update((shown) => new Set([...shown, panel]));
    this._activePanelHint.set({ hintKey, ...PANEL_HINTS[panel] });
    this.schedulePanelHintAutoDismiss(hintKey);
  }

  armFirstUserRunHint(): void {
    if (this._firstUserRunHintArmed() || this._firstUserRunHintShown()) return;
    if (this._dismissedHints().has(FIRST_USER_RUN_HINT_KEY)) return;
    this._firstUserRunHintArmed.set(true);
    this.scheduleFirstUserRunHintIfEligible();
  }

  setFirstUserRunActive(isActive: boolean): void {
    this._isFirstUserRunActive.set(isActive);
    if (!this._firstUserRunHintArmed() || this._firstUserRunHintShown()) return;

    if (isActive) {
      this.scheduleFirstUserRunHintIfEligible();
      return;
    }

    this.cancelFirstUserRunHintTimer();
  }

  markLiveViewActive(_startTime?: number): void {}

  markLiveViewInactive(): void {}

  /**
   * Dismiss a hint permanently for this session.
   */
  dismissHint(hintKey: string): void {
    this._dismissedHints.update((dismissed) => new Set([...dismissed, hintKey]));
    if (this._activeRuntimeHint()?.hintKey === hintKey) {
      this._activeRuntimeHint.set(null);
      this.cancelFirstUserRunHintTimer();
      this.cancelFirstUserRunAutoDismissTimer();
    }
    if (this._activePanelHint()?.hintKey === hintKey) {
      this._activePanelHint.set(null);
      this.cancelPanelHintAutoDismiss();
    }
  }

  /**
   * Reset all hints (for testing or session reset).
   */
  resetHints(): void {
    this._dismissedHints.set(new Set());
    this._shownPanelHints.set(new Set());
    this._activePanelHint.set(null);
    this._activeRuntimeHint.set(null);
    this._firstUserRunHintArmed.set(false);
    this._firstUserRunHintShown.set(false);
    this._isFirstUserRunActive.set(false);
    this.cancelPanelHintAutoDismiss();
    this.cancelFirstUserRunHintTimer();
    this.cancelFirstUserRunAutoDismissTimer();
  }

  private panelHintKey(panel: AgentXPanelHintKind): string {
    return `PANEL_HINT:${panel}`;
  }

  private schedulePanelHintAutoDismiss(hintKey: string): void {
    this.cancelPanelHintAutoDismiss();
    this.panelHintAutoDismissTimer = setTimeout(() => {
      if (this._activePanelHint()?.hintKey === hintKey) {
        this._activePanelHint.set(null);
      }
      this.panelHintAutoDismissTimer = null;
    }, PANEL_HINT_AUTO_DISMISS_MS);
  }

  private cancelPanelHintAutoDismiss(): void {
    if (this.panelHintAutoDismissTimer === null) return;
    clearTimeout(this.panelHintAutoDismissTimer);
    this.panelHintAutoDismissTimer = null;
  }

  private scheduleFirstUserRunHintIfEligible(): void {
    if (this.firstUserRunHintTimer !== null) return;
    if (!this._firstUserRunHintArmed() || this._firstUserRunHintShown()) return;
    if (!this._isFirstUserRunActive()) return;

    this.firstUserRunHintTimer = setTimeout(() => {
      this.firstUserRunHintTimer = null;
      if (!this._firstUserRunHintArmed()) return;
      if (this._firstUserRunHintShown()) return;
      if (!this._isFirstUserRunActive()) return;
      if (this._dismissedHints().has(FIRST_USER_RUN_HINT_KEY)) return;

      this._activeRuntimeHint.set(FIRST_USER_RUN_HINT);
      this._firstUserRunHintShown.set(true);
      this.scheduleFirstUserRunAutoDismiss();
    }, FIRST_USER_RUN_HINT_DELAY_MS);
  }

  private scheduleFirstUserRunAutoDismiss(): void {
    this.cancelFirstUserRunAutoDismissTimer();
    this.firstUserRunAutoDismissTimer = setTimeout(() => {
      if (this._activeRuntimeHint()?.hintKey === FIRST_USER_RUN_HINT_KEY) {
        this._activeRuntimeHint.set(null);
      }
      this.firstUserRunAutoDismissTimer = null;
    }, FIRST_USER_RUN_HINT_AUTO_DISMISS_MS);
  }

  private cancelFirstUserRunHintTimer(): void {
    if (this.firstUserRunHintTimer === null) return;
    clearTimeout(this.firstUserRunHintTimer);
    this.firstUserRunHintTimer = null;
  }

  private cancelFirstUserRunAutoDismissTimer(): void {
    if (this.firstUserRunAutoDismissTimer === null) return;
    clearTimeout(this.firstUserRunAutoDismissTimer);
    this.firstUserRunAutoDismissTimer = null;
  }
}
