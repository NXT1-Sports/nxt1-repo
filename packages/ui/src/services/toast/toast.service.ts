/**
 * @fileoverview ToastService - Cross-Platform Notification Service
 * @module @nxt1/ui/services
 *
 * Enterprise-grade toast notification service for Angular + Ionic applications.
 * Works seamlessly on both web and mobile (Capacitor) platforms.
 *
 * Features:
 * - Multiple toast types: success, error, warning, info
 * - Queue system for multiple notifications
 * - Configurable duration and position
 * - Action buttons support
 * - Automatic dismissal
 * - SSR-safe implementation
 *
 * @example
 * ```typescript
 * const toast = inject(NxtToastService);
 *
 * // Simple usage
 * toast.success('Profile saved successfully!');
 * toast.error('Failed to save changes');
 *
 * // With options
 * toast.show({
 *   message: 'Item deleted',
 *   type: 'warning',
 *   action: {
 *     text: 'Undo',
 *     handler: () => restoreItem()
 *   }
 * });
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, alertCircle, warning, informationCircle } from 'ionicons/icons';
import { NxtPlatformService } from '../platform';

// Register icons used by toast service
addIcons({
  'checkmark-circle': checkmarkCircle,
  'alert-circle': alertCircle,
  warning: warning,
  'information-circle': informationCircle,
});

// ============================================
// TYPES
// ============================================

/** Toast notification types */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Toast position on screen */
export type ToastPosition = 'top' | 'middle' | 'bottom';

/** Action button configuration */
export interface ToastAction {
  /** Button text */
  text: string;
  /** Click handler */
  handler: () => void | Promise<void>;
  /** Button role (cancel closes toast without calling handler) */
  role?: 'cancel';
}

/** Toast configuration options */
export interface ToastOptions {
  /** Message to display */
  message: string;
  /** Toast type (determines color/icon) */
  type?: ToastType;
  /** Duration in milliseconds (0 = persistent) */
  duration?: number;
  /** Position on screen */
  position?: ToastPosition;
  /** Optional action button */
  action?: ToastAction;
  /** Optional header/title */
  header?: string;
  /** Custom icon name (Ionicon) */
  icon?: string;
  /** Custom CSS class */
  cssClass?: string;
}

/** Internal toast queue item */
interface QueuedToast extends Required<Omit<ToastOptions, 'action' | 'header' | 'cssClass'>> {
  id: string;
  action?: ToastAction;
  header?: string;
  cssClass?: string;
  timestamp: number;
}

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

/** Default duration per toast type (ms) */
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

/** Default icons per toast type */
const DEFAULT_ICONS: Record<ToastType, string> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  warning: 'warning',
  info: 'information-circle',
};

/** Ionic color mapping per toast type */
const TYPE_COLORS: Record<ToastType, string> = {
  success: 'success',
  error: 'danger',
  warning: 'warning',
  info: 'primary',
};

@Injectable({ providedIn: 'root' })
export class NxtToastService {
  private readonly toastController = inject(ToastController);
  private readonly platform = inject(NxtPlatformService);

  // ============================================
  // STATE
  // ============================================

  /** Queue of pending toasts */
  private readonly _queue = signal<QueuedToast[]>([]);

  /** Currently displayed toast */
  private readonly _currentToast = signal<QueuedToast | null>(null);

  /** Active Ionic toast element */
  private activeToast: HTMLIonToastElement | null = null;

  /** Processing flag to prevent race conditions */
  private isProcessing = false;

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  /** Number of toasts in queue */
  readonly queueLength = computed(() => this._queue().length);

  /** Whether a toast is currently displayed */
  readonly isVisible = computed(() => this._currentToast() !== null);

  /** Current toast info (for custom UI if needed) */
  readonly currentToast = computed(() => this._currentToast());

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  /**
   * Show a success toast
   * @param message - Success message
   * @param options - Additional options
   */
  success(message: string, options?: Partial<Omit<ToastOptions, 'message' | 'type'>>): void {
    this.show({ message, type: 'success', ...options });
  }

  /**
   * Show an error toast
   * @param message - Error message
   * @param options - Additional options
   */
  error(message: string, options?: Partial<Omit<ToastOptions, 'message' | 'type'>>): void {
    this.show({ message, type: 'error', ...options });
  }

  /**
   * Show a warning toast
   * @param message - Warning message
   * @param options - Additional options
   */
  warning(message: string, options?: Partial<Omit<ToastOptions, 'message' | 'type'>>): void {
    this.show({ message, type: 'warning', ...options });
  }

  /**
   * Show an info toast
   * @param message - Info message
   * @param options - Additional options
   */
  info(message: string, options?: Partial<Omit<ToastOptions, 'message' | 'type'>>): void {
    this.show({ message, type: 'info', ...options });
  }

  // ============================================
  // CORE METHODS
  // ============================================

  /**
   * Show a toast notification
   * @param options - Toast configuration
   */
  show(options: ToastOptions): void {
    if (!this.platform.isBrowser()) {
      // SSR: log but don't queue
      console.log(`[Toast] ${options.type ?? 'info'}: ${options.message}`);
      return;
    }

    const type = options.type ?? 'info';

    const toast: QueuedToast = {
      id: this.generateId(),
      message: options.message,
      type,
      duration: options.duration ?? DEFAULT_DURATIONS[type],
      position: options.position ?? 'bottom',
      icon: options.icon ?? DEFAULT_ICONS[type],
      action: options.action,
      header: options.header,
      cssClass: options.cssClass,
      timestamp: Date.now(),
    };

    // Add to queue
    this._queue.update((queue) => [...queue, toast]);

    // Process queue
    this.processQueue();
  }

  /**
   * Dismiss the current toast
   */
  async dismiss(): Promise<void> {
    if (this.activeToast) {
      await this.activeToast.dismiss();
    }
  }

  /**
   * Clear all queued toasts
   */
  clearQueue(): void {
    this._queue.set([]);
  }

  /**
   * Dismiss current toast and clear queue
   */
  async dismissAll(): Promise<void> {
    this.clearQueue();
    await this.dismiss();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Process the toast queue
   */
  private async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessing || this._currentToast()) {
      return;
    }

    const queue = this._queue();
    if (queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get next toast from queue
      const nextToast = queue[0];
      this._queue.update((q) => q.slice(1));
      this._currentToast.set(nextToast);

      // Build toast buttons
      const buttons: any[] = [];

      if (nextToast.action) {
        buttons.push({
          text: nextToast.action.text,
          role: nextToast.action.role,
          handler: () => {
            nextToast.action?.handler();
          },
        });
      }

      // Always add close button for longer toasts
      if (nextToast.duration >= 4000 || nextToast.duration === 0) {
        buttons.push({
          icon: 'close',
          role: 'cancel',
        });
      }

      // Create and present toast
      // Note: We don't pass 'color' to let CSS handle theming via nxt-toast-* classes
      this.activeToast = await this.toastController.create({
        message: nextToast.message,
        header: nextToast.header,
        duration: nextToast.duration,
        position: nextToast.position,
        icon: nextToast.icon,
        cssClass: `nxt-toast nxt-toast-${nextToast.type} ${nextToast.cssClass ?? ''}`.trim(),
        buttons: buttons.length > 0 ? buttons : undefined,
      });

      // Handle dismiss
      this.activeToast.onDidDismiss().then(() => {
        this._currentToast.set(null);
        this.activeToast = null;

        // Process next toast in queue
        setTimeout(() => {
          this.processQueue();
        }, 200); // Small delay between toasts
      });

      await this.activeToast.present();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Generate unique toast ID
   */
  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
