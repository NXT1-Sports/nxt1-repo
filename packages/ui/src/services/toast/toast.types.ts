/**
 * @fileoverview Toast Service Types
 * @module @nxt1/ui/services/toast
 *
 * Type definitions for the NxtToastService.
 * Separated for clean imports and better tree-shaking.
 */

// ============================================
// PUBLIC TYPES
// ============================================

/** Toast notification types - determines color and icon */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Toast position on screen */
export type ToastPosition = 'top' | 'middle' | 'bottom';

/** Action button configuration for toast */
export interface ToastAction {
  /** Button text */
  readonly text: string;
  /** Click handler */
  readonly handler: () => void | Promise<void>;
  /** Button role (cancel closes toast without calling handler) */
  readonly role?: 'cancel';
}

/** Toast configuration options */
export interface ToastOptions {
  /** Message to display */
  readonly message: string;
  /** Toast type (determines color/icon) - default: 'info' */
  readonly type?: ToastType;
  /** Duration in milliseconds (0 = persistent) - default: varies by type */
  readonly duration?: number;
  /** Position on screen - default: 'bottom' */
  readonly position?: ToastPosition;
  /** Optional action button */
  readonly action?: ToastAction;
  /** Optional header/title */
  readonly header?: string;
  /** Custom icon name (design token icon via NxtIconComponent, if used in custom toast UI) */
  readonly icon?: string;
  /** Custom CSS class (e.g., 'nxt-toast-soft' for subtle variant) */
  readonly cssClass?: string;
  /** Enable swipe-to-dismiss - default: true */
  readonly swipeToDismiss?: boolean;
  /** Provide haptic feedback - default: true on mobile */
  readonly hapticFeedback?: boolean;
}

// ============================================
// INTERNAL TYPES (not exported from barrel)
// ============================================

/** Internal toast queue item with all required fields */
export interface QueuedToast extends Required<
  Omit<ToastOptions, 'action' | 'header' | 'cssClass' | 'icon'>
> {
  readonly id: string;
  readonly action?: ToastAction;
  readonly header?: string;
  readonly cssClass?: string;
  readonly icon?: string;
  readonly timestamp: number;
  readonly swipeToDismiss: boolean;
  readonly hapticFeedback: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/** Default duration per toast type (ms) */
export const DEFAULT_DURATIONS: Readonly<Record<ToastType, number>> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
} as const;

/** Swipe gesture configuration */
export const SWIPE_CONFIG = {
  /** Distance to trigger dismiss (px) */
  DISMISS_THRESHOLD: 40,
  /** Velocity threshold for quick flick dismiss (px/ms) */
  VELOCITY_THRESHOLD: 0.3,
  /** Resistance factor when swiping wrong direction (0-1) */
  RESISTANCE: 0.2,
} as const;
