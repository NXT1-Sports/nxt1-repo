/**
 * @fileoverview NxtSidenavService - Programmatic Sidenav Control
 * @module @nxt1/ui/components/sidenav
 * @version 2.0.0
 *
 * Service for programmatically controlling the sidenav/drawer component.
 * Integrates with Ionic's MenuController while exposing reactive signals.
 * Uses Angular signals for reactive state management (2026 best practices).
 *
 * Features:
 * - Open/close with animation via Ionic MenuController
 * - Toggle functionality
 * - Real-time drag tracking (native gesture support)
 * - State observation via signals
 * - SSR-safe implementation
 * - Full integration with Ionic's menu system
 *
 * Usage:
 * ```typescript
 * @Component({...})
 * export class AppComponent {
 *   private readonly sidenav = inject(NxtSidenavService);
 *
 *   openMenu(): void {
 *     this.sidenav.open();
 *   }
 * }
 * ```
 */

import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MenuController } from '@ionic/angular/standalone';
import type { SidenavToggleEvent } from './sidenav.types';

@Injectable({ providedIn: 'root' })
export class NxtSidenavService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly menuController = inject(MenuController);

  // ============================================
  // PRIVATE STATE (Signals)
  // ============================================

  /** Internal state for sidenav open/closed */
  private readonly _isOpen = signal(false);

  /** Internal state for animation in progress */
  private readonly _isAnimating = signal(false);

  /** Internal state for drag in progress */
  private readonly _isDragging = signal(false);

  /** Internal state for drag progress (0-1) */
  private readonly _dragProgress = signal(0);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (Read-only)
  // ============================================

  /** Whether the sidenav is currently open */
  readonly isOpen = computed(() => this._isOpen());

  /** Whether the sidenav is currently animating */
  readonly isAnimating = computed(() => this._isAnimating());

  /** Whether the sidenav is fully closed (not open and not animating) */
  readonly isClosed = computed(() => !this._isOpen() && !this._isAnimating());

  /** Whether user is actively dragging the sidenav */
  readonly isDragging = computed(() => this._isDragging());

  /** Drag progress from 0 (closed) to 1 (open) - for real-time tracking */
  readonly dragProgress = computed(() => this._dragProgress());

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Open the sidenav via Ionic MenuController.
   * @returns Toggle event payload
   */
  async open(): Promise<SidenavToggleEvent> {
    if (this._isOpen()) {
      return this.createToggleEvent(true, 'programmatic');
    }

    if (isPlatformBrowser(this.platformId)) {
      await this.menuController.open();
    }

    this._isDragging.set(false);
    this._dragProgress.set(1);
    this._isOpen.set(true);
    return this.createToggleEvent(true, 'programmatic');
  }

  /**
   * Close the sidenav via Ionic MenuController.
   * @returns Toggle event payload
   */
  async close(): Promise<SidenavToggleEvent> {
    if (!this._isOpen()) {
      return this.createToggleEvent(false, 'programmatic');
    }

    if (isPlatformBrowser(this.platformId)) {
      await this.menuController.close();
    }

    this._isDragging.set(false);
    this._dragProgress.set(0);
    this._isOpen.set(false);
    return this.createToggleEvent(false, 'programmatic');
  }

  /**
   * Toggle the sidenav open/closed state via Ionic MenuController.
   * @returns Toggle event payload
   */
  async toggle(): Promise<SidenavToggleEvent> {
    const newState = !this._isOpen();

    if (isPlatformBrowser(this.platformId)) {
      await this.menuController.toggle();
    }

    this._isDragging.set(false);
    this._dragProgress.set(newState ? 1 : 0);
    this._isOpen.set(newState);
    return this.createToggleEvent(newState, 'programmatic');
  }

  /**
   * Start drag gesture tracking.
   * Call this when user begins dragging.
   */
  startDrag(): void {
    this._isDragging.set(true);
    this._dragProgress.set(this._isOpen() ? 1 : 0);
  }

  /**
   * Update drag progress during gesture.
   * @param progress Value from 0 (fully closed) to 1 (fully open)
   */
  updateDragProgress(progress: number): void {
    // Clamp between 0 and 1
    const clamped = Math.max(0, Math.min(1, progress));
    this._dragProgress.set(clamped);
  }

  /**
   * End drag gesture and snap to open/closed.
   * @param shouldOpen Whether sidenav should be open after drag ends
   */
  endDrag(shouldOpen: boolean): void {
    this._isDragging.set(false);
    this._dragProgress.set(shouldOpen ? 1 : 0);
    this._isOpen.set(shouldOpen);
  }

  /**
   * Set the animation state (used by component).
   * @internal
   */
  setAnimating(isAnimating: boolean): void {
    this._isAnimating.set(isAnimating);
  }

  /**
   * Set the open state directly (used by component).
   * @internal
   */
  setState(isOpen: boolean): void {
    this._isOpen.set(isOpen);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Create a toggle event payload.
   */
  private createToggleEvent(
    isOpen: boolean,
    trigger: SidenavToggleEvent['trigger']
  ): SidenavToggleEvent {
    return {
      isOpen,
      trigger,
      timestamp: Date.now(),
    };
  }
}
