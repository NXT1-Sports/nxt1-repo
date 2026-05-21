import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { type AgentXHintDockItem } from './agent-x-operation-chat-hint-dock.component';

/**
 * @fileoverview Agent X Operation Chat Hint Facade
 * @module @nxt1/ui/agent-x
 *
 * Manages short-lived, first-open panel hints for the operation chat dock.
 */

export type AgentXPanelHintKind = 'gameplans' | 'playbooks' | 'film-review';

const PANEL_HINT_AUTO_DISMISS_MS = 8_000;

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

  private panelHintAutoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.cancelPanelHintAutoDismiss();
    });
  }

  // ─── Computed ───────────────────────────────────────────────────────────────

  /**
   * All hints to display, filtered by dismissal state.
   */
  readonly hints = computed((): readonly AgentXHintDockItem[] => {
    const dismissed = this._dismissedHints();
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

  markLiveViewActive(_startTime?: number): void {}

  markLiveViewInactive(): void {}

  /**
   * Dismiss a hint permanently for this session.
   */
  dismissHint(hintKey: string): void {
    this._dismissedHints.update((dismissed) => new Set([...dismissed, hintKey]));
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
    this.cancelPanelHintAutoDismiss();
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
}
