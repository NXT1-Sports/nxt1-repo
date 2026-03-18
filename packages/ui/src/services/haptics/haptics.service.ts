/**
 * @fileoverview Haptics Service - Cross-Platform Tactile Feedback
 * @module @nxt1/ui/services
 *
 * Enterprise-grade haptic feedback service using Capacitor Haptics API.
 * Provides platform-appropriate tactile feedback for user interactions.
 *
 * Features:
 * - Auto-detection: Only runs on native platforms
 * - Error-safe: Gracefully handles web/unsupported platforms
 * - Type-safe: Full TypeScript support
 * - Performance: Debounced to prevent haptic spam
 * - Accessible: Respects reduced motion preferences
 *
 * Usage:
 * ```typescript
 * import { HapticsService } from '@nxt1/ui/services';
 *
 * constructor(private haptics = inject(HapticsService)) {}
 *
 * async onClick() {
 *   await this.haptics.impact('medium');
 * }
 * ```
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// Type-only imports to avoid runtime errors on web
import type {
  HapticsPlugin,
  ImpactStyle as CapacitorImpactStyle,
  NotificationType as CapacitorNotificationType,
} from '@capacitor/haptics';

/**
 * Haptic impact intensity levels
 */
export type HapticImpact = 'light' | 'medium' | 'heavy';

/**
 * Haptic notification types for semantic feedback
 */
export type HapticNotification = 'success' | 'warning' | 'error';

/**
 * Haptics Service
 *
 * Provides tactile feedback for user interactions on native platforms.
 * Automatically disabled on web and respects accessibility preferences.
 *
 * @example
 * ```typescript
 * // Button tap
 * await this.haptics.impact('light');
 *
 * // Form submission success
 * await this.haptics.notification('success');
 *
 * // Selection change
 * await this.haptics.selection();
 *
 * // Haptic pattern for game/animation
 * await this.haptics.vibrate(200); // 200ms
 * ```
 */
@Injectable({ providedIn: 'root' })
export class HapticsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private hapticsPlugin: HapticsPlugin | null = null;
  private isNativePlatform = false;
  private isInitialized = false;
  private lastHapticTime = 0;
  private readonly DEBOUNCE_MS = 50; // Prevent haptic spam

  /**
   * Lazy-load Capacitor Haptics plugin
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.isBrowser) {
      this.isInitialized = true;
      return;
    }

    try {
      // Dynamic import to avoid SSR errors
      const { Haptics } = await import('@capacitor/haptics');
      const { Capacitor } = await import('@capacitor/core');
      this.hapticsPlugin = Haptics;
      this.isNativePlatform = Capacitor.isNativePlatform();
    } catch {
      // Expected on web platform - Capacitor Haptics not available
    }

    this.isInitialized = true;
  }

  /**
   * Check if haptics should run
   */
  private async shouldRunHaptic(): Promise<boolean> {
    await this.initialize();

    if (!this.hapticsPlugin || !this.isNativePlatform) {
      return false;
    }

    // Respect reduced motion preference
    if (this.prefersReducedMotion()) {
      return false;
    }

    // Debounce to prevent haptic spam
    const now = Date.now();
    if (now - this.lastHapticTime < this.DEBOUNCE_MS) {
      return false;
    }

    this.lastHapticTime = now;
    return true;
  }

  /**
   * Check if user prefers reduced motion
   */
  private prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Trigger impact haptic feedback
   *
   * Use for:
   * - Button taps (light)
   * - Toggle switches (medium)
   * - Destructive actions (heavy)
   *
   * @param style - Impact intensity: 'light' | 'medium' | 'heavy'
   */
  async impact(style: HapticImpact = 'medium'): Promise<void> {
    if (!(await this.shouldRunHaptic())) return;

    try {
      const { ImpactStyle } = await import('@capacitor/haptics');
      const styleMap: Record<HapticImpact, CapacitorImpactStyle> = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };

      await this.hapticsPlugin!.impact({ style: styleMap[style] });
    } catch {
      // Haptic feedback failures are non-critical
    }
  }

  /**
   * Trigger notification haptic feedback
   *
   * Use for:
   * - Form submission results
   * - Task completion
   * - Error states
   *
   * @param type - Notification type: 'success' | 'warning' | 'error'
   */
  async notification(type: HapticNotification): Promise<void> {
    if (!(await this.shouldRunHaptic())) return;

    try {
      const { NotificationType } = await import('@capacitor/haptics');
      const typeMap: Record<HapticNotification, CapacitorNotificationType> = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      };

      await this.hapticsPlugin!.notification({ type: typeMap[type] });
    } catch {
      // Haptic feedback failures are non-critical
    }
  }

  /**
   * Trigger selection haptic feedback
   *
   * Use for:
   * - Picker/wheel scrolling
   * - Segmented control changes
   * - Slider dragging
   */
  async selection(): Promise<void> {
    if (!(await this.shouldRunHaptic())) return;

    try {
      await this.hapticsPlugin!.selectionStart();
      // Note: selectionEnd() should be called when selection completes
    } catch {
      // Haptic feedback failures are non-critical
    }
  }

  /**
   * Trigger custom vibration pattern
   *
   * Use for:
   * - Custom haptic patterns
   * - Game feedback
   * - Animation synchronization
   *
   * @param duration - Vibration duration in milliseconds
   */
  async vibrate(duration: number = 200): Promise<void> {
    if (!(await this.shouldRunHaptic())) return;

    try {
      await this.hapticsPlugin!.vibrate({ duration });
    } catch {
      // Haptic feedback failures are non-critical
    }
  }

  /**
   * Trigger light tap haptic (convenience method)
   */
  async tap(): Promise<void> {
    await this.impact('light');
  }

  /**
   * Trigger medium button press haptic (convenience method)
   */
  async press(): Promise<void> {
    await this.impact('medium');
  }

  /**
   * Trigger heavy action haptic (convenience method)
   */
  async action(): Promise<void> {
    await this.impact('heavy');
  }
}
