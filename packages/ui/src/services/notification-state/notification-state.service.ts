/**
 * @fileoverview NxtNotificationStateService - Global Notification Popover State
 * @module @nxt1/ui/services/notification-state
 * @version 1.0.0
 *
 * Manages the global state of the notification popover/modal.
 * Allows different components to react to notification popover visibility
 * (e.g., app download bar should hide when notifications are open).
 *
 * Features:
 * - Signal-based reactive state
 * - Simple open/close/toggle API
 * - SSR-safe implementation
 *
 * Usage:
 * ```typescript
 * const notificationState = inject(NxtNotificationStateService);
 *
 * // Open notification popover
 * notificationState.open();
 *
 * // Check if open
 * if (notificationState.isOpen()) {
 *   // React to open state
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NxtNotificationStateService {
  // ============================================
  // PRIVATE STATE
  // ============================================

  /** Internal state for notification popover open/closed */
  private readonly _isOpen = signal(false);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (Read-only)
  // ============================================

  /** Whether the notification popover/modal is currently open */
  readonly isOpen = computed(() => this._isOpen());

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Open the notification popover.
   */
  open(): void {
    this._isOpen.set(true);
  }

  /**
   * Close the notification popover.
   */
  close(): void {
    this._isOpen.set(false);
  }

  /**
   * Toggle the notification popover open/closed state.
   */
  toggle(): void {
    this._isOpen.update((open) => !open);
  }

  /**
   * Set the open state directly.
   * @param isOpen - Whether the popover should be open
   */
  setState(isOpen: boolean): void {
    this._isOpen.set(isOpen);
  }
}
