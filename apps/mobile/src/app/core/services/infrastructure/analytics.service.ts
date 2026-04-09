/**
 * @fileoverview Analytics Service - Firebase Analytics for Mobile
 * @module @nxt1/mobile/core/services
 *
 * Production-grade Angular service wrapping Firebase Analytics for Capacitor.
 * Uses the AnalyticsAdapter interface from @nxt1/core for consistency.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                     Components                              │
 * │              Inject AnalyticsService                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │            ⭐ AnalyticsService (THIS FILE) ⭐                │
 * │       Angular wrapper - uses mobile adapter from core       │
 * ├─────────────────────────────────────────────────────────────┤
 * │         createMobileAnalyticsAdapter (@nxt1/core)           │
 * │         @capacitor-firebase/analytics                       │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Features:
 * - Uses Capacitor Firebase Analytics plugin
 * - Implements AnalyticsAdapter interface for portability
 * - Automatic user ID sync with Firebase Auth
 * - Debug mode in development
 * - Matches web AnalyticsService API 100%
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject } from '@angular/core';
import { Device } from '@capacitor/device';
import {
  createMobileAnalyticsAdapter,
  type AnalyticsAdapter,
  type UserProperties,
  type BaseEventProperties,
  getEventCategory,
} from '@nxt1/core/analytics';
import type { ILogger } from '@nxt1/core/logging';
import { NxtLoggingService } from '@nxt1/ui';
import { environment } from '../../../../environments/environment';

/** Mobile-specific platform type */
type MobilePlatform = 'ios' | 'android';

/**
 * Core Analytics Service for Mobile
 *
 * Provides unified analytics tracking across the mobile application.
 * Implements AnalyticsAdapter interface for compatibility with @nxt1/core APIs.
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class MyComponent {
 *   private readonly analytics = inject(AnalyticsService);
 *
 *   trackAction() {
 *     this.analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED, {
 *       profile_id: '123',
 *     });
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService implements AnalyticsAdapter {
  /** Logger instance for this service */
  private readonly logger: ILogger;

  /** The underlying analytics adapter from @nxt1/core */
  private adapter: AnalyticsAdapter | null = null;

  /** Current user ID for event enrichment */
  private currentUserId: string | null = null;

  /** User properties cache */
  private userProps: UserProperties = {};

  /** Analytics collection enabled state */
  private analyticsEnabled = true;

  /** Whether initialization is complete */
  private initialized = false;

  /** Detected platform (ios/android) */
  private detectedPlatform: MobilePlatform = 'ios';

  /** Promise that resolves when adapter is ready */
  private readonly initPromise: Promise<void>;

  constructor() {
    // Initialize logger with namespace
    const loggingService = inject(NxtLoggingService);
    this.logger = loggingService.child('Analytics');

    // Initialize the mobile adapter asynchronously
    this.initPromise = this.initializeAdapter();
  }

  /**
   * Initialize the mobile analytics adapter with platform detection
   */
  private async initializeAdapter(): Promise<void> {
    try {
      // Detect platform dynamically using Capacitor Device plugin
      const deviceInfo = await Device.getInfo();
      this.detectedPlatform = deviceInfo.platform === 'android' ? 'android' : 'ios';

      this.adapter = await createMobileAnalyticsAdapter({
        debug: !environment.production,
        enabled: true,
        platform: this.detectedPlatform,
        appVersion: environment.appVersion,
      });
      this.initialized = true;

      this.logger.debug('Mobile adapter initialized', { platform: this.detectedPlatform });
    } catch (error) {
      this.logger.error('Failed to initialize mobile adapter', error);
      // Continue without analytics - don't break the app
      this.initialized = false;
    }
  }

  /**
   * Wait for adapter to be ready
   */
  async ready(): Promise<boolean> {
    await this.initPromise;
    return this.initialized && !!this.adapter;
  }

  // ============================================
  // ANALYTICS ADAPTER IMPLEMENTATION
  // ============================================

  /**
   * Track a custom event
   *
   * @param eventName - Event name (use APP_EVENTS or FIREBASE_EVENTS constants)
   * @param properties - Optional event properties
   */
  trackEvent(eventName: string, properties?: Record<string, unknown>): void {
    if (!this.adapter || !this.analyticsEnabled) return;

    // Enrich properties with default context
    const enrichedProps: BaseEventProperties & Record<string, unknown> = {
      ...properties,
      platform: this.detectedPlatform,
      app_version: environment.appVersion,
      timestamp: new Date().toISOString(),
    };

    // Log via structured logger
    const category = getEventCategory(eventName);
    this.logger.debug(`📊 [${category}] ${eventName}`, { event: eventName, ...enrichedProps });

    this.adapter.trackEvent(eventName, enrichedProps);
  }

  /**
   * Track page/screen view
   *
   * @param pagePath - Page path (e.g., '/profile/123')
   * @param pageTitle - Page title (optional)
   * @param properties - Additional properties
   */
  trackPageView(pagePath: string, pageTitle?: string, properties?: Record<string, unknown>): void {
    if (!this.adapter || !this.analyticsEnabled) return;

    this.adapter.trackPageView(pagePath, pageTitle, {
      ...properties,
      platform: 'mobile',
    });
  }

  /**
   * Set user ID for tracking
   *
   * @param userId - User's unique ID (or null to clear)
   */
  setUserId(userId: string | null): void {
    this.currentUserId = userId;

    if (!this.adapter) return;

    this.adapter.setUserId(userId);

    this.logger.debug('User ID set', { userId: userId ? `${userId.substring(0, 8)}...` : null });
  }

  /**
   * Set user properties for segmentation
   *
   * @param properties - User properties to set
   */
  setUserProperties(properties: UserProperties): void {
    // Cache properties
    this.userProps = { ...this.userProps, ...properties };

    if (!this.adapter) return;

    this.adapter.setUserProperties(properties);

    this.logger.debug('User properties set', { properties });
  }

  /**
   * Clear all user data (call on sign out)
   */
  clearUser(): void {
    this.currentUserId = null;
    this.userProps = {};

    if (!this.adapter) return;

    this.adapter.clearUser();

    this.logger.debug('User cleared');
  }

  /**
   * Check if analytics is initialized
   */
  isInitialized(): boolean {
    return this.initialized && !!this.adapter;
  }

  /**
   * Get current user ID
   */
  getUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Enable/disable analytics collection
   */
  setEnabled(enabled: boolean): void {
    this.analyticsEnabled = enabled;

    if (this.adapter) {
      this.adapter.setEnabled(enabled);
    }
  }

  /**
   * Track timing event (for performance monitoring)
   */
  trackTiming(category: string, name: string, value: number): void {
    if (!this.adapter?.trackTiming) return;

    this.adapter.trackTiming(category, name, value);
  }

  /**
   * Track exception/error
   */
  trackException(description: string, fatal = false): void {
    if (!this.adapter?.trackException) return;

    this.adapter.trackException(description, fatal);
  }
}
