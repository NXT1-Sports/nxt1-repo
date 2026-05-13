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

import { Injectable, inject, signal, computed, NgZone, InjectionToken } from '@angular/core';
import {
  ToastController,
  type ToastButton,
  type ToastOptions as IonicToastOptions,
} from '@ionic/angular/standalone';
import { NxtPlatformService } from '../platform';
import { HapticsService } from '../haptics';
import { NxtLoggingService } from '../logging';
import { ToastType, ToastOptions, QueuedToast, DEFAULT_DURATIONS } from './toast.types';

// Re-export types for consumers
export type { ToastType, ToastPosition, ToastAction, ToastOptions } from './toast.types';

export const NXT_USE_IONIC_TOASTS = new InjectionToken<boolean>('NXT_USE_IONIC_TOASTS', {
  providedIn: 'root',
  factory: () => false,
});

// Register icons used by toast service
@Injectable({ providedIn: 'root' })
export class NxtToastService {
  private readonly platform = inject(NxtPlatformService);
  private readonly toastController = inject(ToastController, { optional: true });
  private readonly useIonicToasts = inject(NXT_USE_IONIC_TOASTS);
  private readonly haptics = inject(HapticsService);
  private readonly ngZone = inject(NgZone);
  private readonly logger = inject(NxtLoggingService).child('ToastService');

  // ============================================
  // STATE
  // ============================================

  /** Queue of pending toasts */
  private readonly _queue = signal<QueuedToast[]>([]);

  /** Currently displayed toast */
  private readonly _currentToast = signal<QueuedToast | null>(null);

  /** Active DOM toast element */
  private activeDomToast: HTMLElement | null = null;

  /** Active Ionic toast overlay */
  private activeIonicToast: HTMLIonToastElement | null = null;

  /** Current toast auto-dismiss timer */
  private activeToastTimer: ReturnType<typeof setTimeout> | null = null;

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
      this.logger.debug('Toast suppressed (SSR)', { type: options.type, message: options.message });
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
      icon: options.icon,
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
    if (this.isDismissing) {
      return;
    }

    if (this.activeIonicToast) {
      this.isDismissing = true;
      this.destroyTapDismissListener();

      if (this.activeToastTimer) {
        clearTimeout(this.activeToastTimer);
        this.activeToastTimer = null;
      }

      await this.activeIonicToast.dismiss();
      return;
    }

    if (!this.activeDomToast) {
      return;
    }

    this.isDismissing = true;
    this.destroyTapDismissListener();

    if (this.activeToastTimer) {
      clearTimeout(this.activeToastTimer);
      this.activeToastTimer = null;
    }

    const toastEl = this.activeDomToast;
    toastEl.classList.add('nxt-toast--dismissing');

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        toastEl.remove();
        this.finalizeDismiss(toastEl);

        resolve();
      }, 160);
    });
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
      const buttons: ToastButton[] = [];

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
          text: '✕',
          role: 'cancel',
        });
      }

      if (this.shouldUseIonicToast()) {
        try {
          await this.presentIonicToast(nextToast, buttons);
        } catch (error) {
          this.logger.error('Ionic toast presentation failed, falling back to DOM toast', error, {
            type: nextToast.type,
            position: nextToast.position,
          });
          this.activeIonicToast = null;
          this.presentDomToast(nextToast, buttons);
        }
      } else {
        this.presentDomToast(nextToast, buttons);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private shouldUseIonicToast(): boolean {
    return this.useIonicToasts && this.toastController !== null;
  }

  private async presentIonicToast(toast: QueuedToast, buttons: ToastButton[]): Promise<void> {
    if (!this.toastController) {
      return;
    }

    const ionicToast = await this.toastController.create(
      this.buildIonicToastOptions(toast, buttons)
    );
    this.activeIonicToast = ionicToast;

    ionicToast.onDidDismiss().then(() => {
      this.finalizeDismiss(ionicToast);
    });

    await ionicToast.present();

    if (toast.hapticFeedback) {
      this.provideHapticFeedback(toast.type);
    }
  }

  private presentDomToast(
    toast: QueuedToast,
    buttons: Array<{ text?: string; icon?: string; role?: string; handler?: () => void }>
  ): void {
    this.activeDomToast = this.createToastElement(toast, buttons);
    document.body.appendChild(this.activeDomToast);

    requestAnimationFrame(() => {
      this.activeDomToast?.classList.add('nxt-toast-shell--visible');
    });

    if (toast.duration > 0) {
      this.activeToastTimer = setTimeout(() => {
        void this.dismiss();
      }, toast.duration);
    }

    if (toast.hapticFeedback) {
      this.provideHapticFeedback(toast.type);
    }

    if (this.activeDomToast) {
      this.setupTapToDismiss(this.activeDomToast);
    }
  }

  private buildIonicToastOptions(toast: QueuedToast, buttons: ToastButton[]): IonicToastOptions {
    const cssClasses = ['nxt-toast', `nxt-toast-${toast.type}`];

    if (toast.cssClass) {
      cssClasses.push(toast.cssClass);
    }

    return {
      message: toast.message,
      header: toast.header,
      duration: toast.duration,
      position: toast.position,
      buttons,
      cssClass: cssClasses,
      swipeGesture: toast.swipeToDismiss ? 'vertical' : undefined,
      icon: toast.icon,
    };
  }

  private finalizeDismiss(toast: HTMLElement | HTMLIonToastElement): void {
    if (this.activeDomToast !== toast && this.activeIonicToast !== toast) {
      return;
    }

    if (this.activeToastTimer) {
      clearTimeout(this.activeToastTimer);
      this.activeToastTimer = null;
    }

    this._currentToast.set(null);
    this.activeDomToast = null;
    this.activeIonicToast = null;
    this.isDismissing = false;

    setTimeout(() => {
      this.processQueue();
    }, 200);
  }

  private createToastElement(
    toast: QueuedToast,
    buttons: Array<{ text?: string; icon?: string; role?: string; handler?: () => void }>
  ): HTMLElement {
    const toastEl = document.createElement('div');
    toastEl.setAttribute('role', toast.type === 'error' ? 'alert' : 'status');
    toastEl.setAttribute('aria-live', toast.type === 'error' ? 'assertive' : 'polite');
    toastEl.className =
      `nxt-toast-shell nxt-toast-shell--${toast.type} nxt-toast-shell--${toast.position} ${toast.cssClass ?? ''}`.trim();

    const content = document.createElement('div');
    content.className = 'nxt-toast-shell__content';

    if (toast.header) {
      const header = document.createElement('strong');
      header.className = 'nxt-toast-shell__header';
      header.textContent = toast.header;
      content.appendChild(header);
    }

    const message = document.createElement('span');
    message.className = 'nxt-toast-shell__message';
    message.textContent = toast.message;
    content.appendChild(message);
    toastEl.appendChild(content);

    if (buttons.length > 0) {
      const actions = document.createElement('div');
      actions.className = 'nxt-toast-shell__actions';

      for (const buttonConfig of buttons) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'nxt-toast-shell__button';
        button.textContent = buttonConfig.text ?? buttonConfig.icon ?? 'Close';
        button.addEventListener('click', () => {
          buttonConfig.handler?.();
          void this.dismiss();
        });
        actions.appendChild(button);
      }

      toastEl.appendChild(actions);
    }

    return toastEl;
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
  private setupTapToDismiss(toastEl: HTMLElement): void {
    const onTap = (event: MouseEvent) => {
      if (this.isDismissing) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest('button')) {
        return;
      }

      this.ngZone.run(() => {
        void this.dismiss();
      });
    };

    toastEl.addEventListener('click', onTap, { passive: true });
    this.tapDismissCleanup = () => {
      toastEl.removeEventListener('click', onTap);
      this.tapDismissCleanup = null;
    };
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
