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
 * - Swipe-to-dismiss using Ionic GestureController (2026 best practice)
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
import { ToastController, GestureController, Gesture } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, alertCircle, warning, informationCircle, close } from 'ionicons/icons';

import { NxtPlatformService } from '../platform';
import { HapticsService } from '../haptics';
import {
  ToastType,
  ToastPosition,
  ToastOptions,
  QueuedToast,
  DEFAULT_DURATIONS,
  DEFAULT_ICONS,
  SWIPE_CONFIG,
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
  private readonly gestureCtrl = inject(GestureController);
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

  /** Active swipe gesture instance */
  private swipeGesture: Gesture | null = null;

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
        // Clean up gesture
        this.destroySwipeGesture();

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

      // Setup swipe-to-dismiss if enabled (using Ionic GestureController)
      if (nextToast.swipeToDismiss && this.activeToast) {
        this.setupSwipeGesture(this.activeToast, nextToast.position);
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
   * Setup swipe-to-dismiss using Ionic GestureController (2026 best practice)
   *
   * Benefits over raw touch events:
   * - Built-in velocity tracking
   * - Proper gesture priority handling
   * - Better integration with Ionic's animation system
   * - Handles edge cases automatically
   */
  private setupSwipeGesture(toastEl: HTMLIonToastElement, position: ToastPosition): void {
    // Wait for toast to be fully rendered
    requestAnimationFrame(() => {
      // Find the toast wrapper within shadow DOM
      const wrapper = toastEl.shadowRoot?.querySelector('.toast-wrapper') as HTMLElement | null;
      if (!wrapper) return;

      // Determine swipe direction based on position
      // Bottom toast: swipe down to dismiss
      // Top toast: swipe up to dismiss
      const dismissDirection = position === 'top' ? -1 : 1;

      let startTranslateY = 0;
      let currentTranslateY = 0;

      this.swipeGesture = this.gestureCtrl.create({
        el: wrapper,
        gestureName: 'toast-swipe-dismiss',
        gesturePriority: 100, // High priority to capture gesture
        threshold: 0, // Start tracking immediately for responsiveness
        direction: 'y', // Vertical swipe only

        onStart: () => {
          // Add swiping class for CSS
          toastEl.classList.add('nxt-toast-swiping');
          startTranslateY = currentTranslateY;

          // Disable toast auto-dismiss timer during gesture
          wrapper.style.transition = 'none';
        },

        onMove: (detail) => {
          const deltaY = detail.deltaY;

          // Check if swiping in valid direction
          const isValidDirection =
            (dismissDirection > 0 && deltaY > 0) ||
            (dismissDirection < 0 && deltaY < 0) ||
            position === 'middle';

          if (isValidDirection) {
            // Natural movement in dismiss direction
            currentTranslateY = startTranslateY + deltaY;
          } else {
            // Apply strong resistance when swiping wrong way
            currentTranslateY = startTranslateY + deltaY * SWIPE_CONFIG.RESISTANCE;
          }

          // Apply transform
          wrapper.style.transform = `translateY(${currentTranslateY}px)`;

          // Calculate opacity based on progress (fade out as user swipes)
          const progress = Math.abs(currentTranslateY) / SWIPE_CONFIG.DISMISS_THRESHOLD;
          const opacity = Math.max(0.3, 1 - progress * 0.7);
          wrapper.style.opacity = String(opacity);
        },

        onEnd: (detail) => {
          toastEl.classList.remove('nxt-toast-swiping');

          const deltaY = detail.deltaY;
          const velocityY = detail.velocityY;
          const absVelocity = Math.abs(velocityY);

          // Check if should dismiss based on distance OR velocity
          const isValidDirection =
            (dismissDirection > 0 && deltaY > 0) ||
            (dismissDirection < 0 && deltaY < 0) ||
            position === 'middle';

          const passedThreshold = Math.abs(deltaY) > SWIPE_CONFIG.DISMISS_THRESHOLD;
          const hasFlickVelocity =
            absVelocity > SWIPE_CONFIG.VELOCITY_THRESHOLD && isValidDirection;

          if ((passedThreshold && isValidDirection) || hasFlickVelocity) {
            // Dismiss with animation
            this.ngZone.run(() => {
              this.animateAndDismiss(wrapper, position, velocityY);
            });
          } else {
            // Snap back to original position with spring animation
            wrapper.style.transition =
              'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out';
            wrapper.style.transform = 'translateY(0)';
            wrapper.style.opacity = '1';
            currentTranslateY = 0;

            // Light haptic to indicate snap back
            this.haptics.impact('light');

            // Clean up transition after animation
            setTimeout(() => {
              if (wrapper) wrapper.style.transition = '';
            }, 300);
          }
        },
      });

      // Enable the gesture
      this.swipeGesture.enable(true);
    });
  }

  /**
   * Animate toast off-screen and dismiss
   */
  private async animateAndDismiss(
    wrapper: HTMLElement,
    position: ToastPosition,
    velocityY: number
  ): Promise<void> {
    if (this.isDismissing) return;
    this.isDismissing = true;

    // Add dismissing class
    this.activeToast?.classList.add('nxt-toast-dismissing');

    // Calculate animation duration based on velocity (faster swipe = faster dismiss)
    const baseDuration = 200;
    const velocityFactor = Math.min(1, Math.abs(velocityY) / 2);
    const duration = Math.max(100, baseDuration * (1 - velocityFactor * 0.5));

    // Calculate final position (off-screen)
    const finalY = position === 'top' ? -200 : 200;

    // Animate out with easing
    wrapper.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
    wrapper.style.transform = `translateY(${finalY}px)`;
    wrapper.style.opacity = '0';

    // Haptic feedback on successful dismiss
    this.haptics.impact('medium');

    // Wait for animation then dismiss
    await new Promise((resolve) => setTimeout(resolve, duration));

    // Dismiss the toast
    await this.dismiss();
  }

  /**
   * Clean up and destroy swipe gesture
   */
  private destroySwipeGesture(): void {
    if (this.swipeGesture) {
      this.swipeGesture.destroy();
      this.swipeGesture = null;
    }
  }

  /**
   * Generate unique toast ID
   */
  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
