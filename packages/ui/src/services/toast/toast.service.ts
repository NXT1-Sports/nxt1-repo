/**
 * @fileoverview ToastService - Cross-Platform Notification Service
 * @module @nxt1/ui/services/toast
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
 * - Tap-to-dismiss anywhere on toast
 * - Design token integration for theme-aware colors
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
 *
 * // Soft/subtle variant
 * toast.success('Content cleared', { cssClass: 'nxt-toast-soft' });
 * ```
 */

import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, alertCircle, warning, informationCircle, close } from 'ionicons/icons';

import { NxtPlatformService } from '../platform';
import { HapticsService } from '../haptics';
import {
  ToastType,
  ToastOptions,
  QueuedToast,
  DEFAULT_DURATIONS,
  DEFAULT_ICONS,
} from './toast.types';

// Re-export types for consumers
export type { ToastType, ToastPosition, ToastAction, ToastOptions } from './toast.types';

// Register icons used by toast service
addIcons({
  'checkmark-circle': checkmarkCircle,
  'alert-circle': alertCircle,
  warning: warning,
  'information-circle': informationCircle,
  close: close,
});

@Injectable({ providedIn: 'root' })
export class NxtToastService {
  private readonly toastController = inject(ToastController);
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);
  private readonly ngZone = inject(NgZone);

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

  /** Cleanup function for tap-to-dismiss listener */
  private tapDismissCleanup: (() => void) | null = null;

  /** Track if currently dismissing to prevent double-dismiss */
  private isDismissing = false;

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
    const isMobileDevice = this.platform.isNative() || this.platform.isMobile();

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
      swipeToDismiss: options.swipeToDismiss ?? true,
      hapticFeedback: options.hapticFeedback ?? isMobileDevice,
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
    this.isDismissing = false;

    try {
      // Get next toast from queue
      const nextToast = queue[0];
      this._queue.update((q) => q.slice(1));
      this._currentToast.set(nextToast);

      // Build toast buttons
      const buttons: Array<{ text?: string; icon?: string; role?: string; handler?: () => void }> =
        [];

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
        this.destroyTapDismissListener();

        this._currentToast.set(null);
        this.activeToast = null;
        this.isDismissing = false;

        // Process next toast in queue
        setTimeout(() => {
          this.processQueue();
        }, 200); // Small delay between toasts
      });

      await this.activeToast.present();

      // Provide haptic feedback on toast appear
      if (nextToast.hapticFeedback) {
        this.provideHapticFeedback(nextToast.type);
      }

      // Dismiss on tap anywhere on toast container
      if (this.activeToast) {
        this.setupTapToDismiss(this.activeToast);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Provide haptic feedback based on toast type
   */
  private provideHapticFeedback(type: ToastType): void {
    switch (type) {
      case 'success':
        this.haptics.notification('success');
        break;
      case 'error':
        this.haptics.notification('error');
        break;
      case 'warning':
        this.haptics.notification('warning');
        break;
      case 'info':
        this.haptics.impact('light');
        break;
    }
  }

  /**
   * Setup tap-to-dismiss for entire toast container
   */
  private setupTapToDismiss(toastEl: HTMLIonToastElement): void {
    requestAnimationFrame(() => {
      const wrapper = toastEl.shadowRoot?.querySelector('.toast-wrapper') as HTMLElement | null;
      if (!wrapper) return;

      const onTap = () => {
        if (this.isDismissing) return;

        this.ngZone.run(() => {
          void this.dismiss();
        });
      };

      wrapper.addEventListener('click', onTap, { passive: true });
      this.tapDismissCleanup = () => {
        wrapper.removeEventListener('click', onTap);
        this.tapDismissCleanup = null;
      };
    });
  }

  /**
   * Clean up tap-to-dismiss listener
   */
  private destroyTapDismissListener(): void {
    this.tapDismissCleanup?.();
  }

  /**
   * Generate unique toast ID
   */
  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
