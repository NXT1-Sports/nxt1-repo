/**
 * @fileoverview Agent X FAB Service — State Management
 * @module @nxt1/ui/agent-x/fab
 * @version 1.0.0
 *
 * Signal-based state management for the floating Agent X chat widget.
 * Controls panel open/close, minimized state, and FAB visibility.
 *
 * SSR-safe: all browser APIs are guarded with platform checks.
 */

import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Panel display state */
export type FabPanelState = 'closed' | 'open' | 'minimized';

/**
 * Agent X FAB widget state management.
 *
 * Controls the lifecycle of the floating chat widget:
 * - FAB button visibility
 * - Chat panel open/close/minimize
 * - Unread indicator badge
 * - Keyboard-aware positioning
 */
@Injectable({ providedIn: 'root' })
export class AgentXFabService {
  private readonly platformId = inject(PLATFORM_ID);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _panelState = signal<FabPanelState>('closed');
  private readonly _unreadCount = signal(0);
  private readonly _fabVisible = signal(true);
  private readonly _hasInteracted = signal(false);
  private readonly _pendingMessage = signal<{ content: string; imageUrl?: string } | null>(null);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current panel state */
  readonly panelState = computed(() => this._panelState());

  /** Whether the chat panel is open (fully expanded) */
  readonly isOpen = computed(() => this._panelState() === 'open');

  /** Whether the chat panel is minimized (collapsed header only) */
  readonly isMinimized = computed(() => this._panelState() === 'minimized');

  /** Whether the panel is closed (FAB visible) */
  readonly isClosed = computed(() => this._panelState() === 'closed');

  /** Unread message count for badge */
  readonly unreadCount = computed(() => this._unreadCount());

  /** Whether to show the unread badge */
  readonly hasUnread = computed(() => this._unreadCount() > 0);

  /** Whether the FAB button should be visible */
  readonly fabVisible = computed(() => this._fabVisible() && this._panelState() === 'closed');

  /** Whether user has ever interacted with the FAB */
  readonly hasInteracted = computed(() => this._hasInteracted());

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  /**
   * Open the chat panel (full view).
   */
  open(): void {
    this._panelState.set('open');
    this._unreadCount.set(0);
    this._hasInteracted.set(true);
  }

  /**
   * Close the chat panel completely (show FAB).
   */
  close(): void {
    this._panelState.set('closed');
  }

  /**
   * Minimize the chat panel (show collapsed header bar).
   */
  minimize(): void {
    this._panelState.set('minimized');
  }

  /**
   * Toggle between open and closed states.
   */
  toggle(): void {
    if (this._panelState() === 'closed') {
      this.open();
    } else {
      this.close();
    }
  }

  /**
   * Restore from minimized to open.
   */
  restore(): void {
    if (this._panelState() === 'minimized') {
      this._panelState.set('open');
    }
  }

  /**
   * Set unread message count (e.g., when a new AI response arrives while minimized).
   */
  setUnreadCount(count: number): void {
    this._unreadCount.set(Math.max(0, count));
  }

  /**
   * Increment unread count by one.
   */
  incrementUnread(): void {
    if (this._panelState() !== 'open') {
      this._unreadCount.update((c) => c + 1);
    }
  }

  /**
   * Show or hide the FAB button programmatically.
   * Useful for hiding during onboarding flows or fullscreen modals.
   */
  setFabVisible(visible: boolean): void {
    this._fabVisible.set(visible);
  }

  /**
   * Whether the current platform supports the FAB widget.
   * Only show on browser (not SSR).
   */
  get isPlatformSupported(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /**
   * Open the chat panel and inject a message via the AgentXService.
   * Used when a background agent task completes and the result
   * should be shown immediately in the chat.
   */
  openWithMessage(message: { content: string; imageUrl?: string }): void {
    this.open();
    this._pendingMessage.set(message);
  }

  /**
   * Consume and clear the pending message (called by the chat panel
   * after it renders).
   */
  consumePendingMessage(): { content: string; imageUrl?: string } | null {
    const msg = this._pendingMessage();
    if (msg) this._pendingMessage.set(null);
    return msg;
  }
}
