/**
 * @fileoverview Analytics Service for Mobile
 * @module @nxt1/mobile/services
 *
 * Angular service wrapper for @nxt1/core analytics.
 * Provides reactive analytics tracking with Capacitor/Firebase Analytics.
 *
 * Features:
 * - Uses Firebase Analytics on native (iOS/Android)
 * - Falls back to gtag.js on web (Capacitor web)
 * - Debug mode in development
 * - User ID and properties tracking
 * - Page/screen view tracking integration
 *
 * @example
 * ```typescript
 * export class LoginComponent {
 *   private analytics = inject(AnalyticsService);
 *
 *   async onLogin() {
 *     await this.auth.signIn(email, password);
 *     this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, {
 *       method: 'email',
 *     });
 *   }
 * }
 * ```
 */

import {
  Injectable,
  inject,
  PLATFORM_ID,
  signal,
  computed,
  DestroyRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import {
  type AnalyticsAdapter,
  type UserProperties,
  type AppEventName,
  type BaseEventProperties,
  APP_EVENTS,
  createMobileAnalyticsAdapterSync,
  createWebAnalyticsAdapter,
  createMemoryAnalyticsAdapter,
  NXT1_MEASUREMENT_ID,
} from '@nxt1/core/analytics';
import { isCapacitor, getPlatform } from '@nxt1/core/platform';

import { environment } from '../../environments/environment';

/**
 * Analytics Service
 *
 * Manages analytics tracking for the mobile application.
 * Uses Firebase Analytics on native platforms, gtag.js on web.
 *
 * @example Track an event
 * ```typescript
 * this.analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED, {
 *   profile_id: '123',
 *   source: 'search',
 * });
 * ```
 *
 * @example Set user after login
 * ```typescript
 * this.analytics.setUser(user.uid, {
 *   user_type: 'athlete',
 *   sport: 'basketball',
 * });
 * ```
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Analytics adapter instance */
  private adapter: AnalyticsAdapter;

  /** Current user ID signal */
  private readonly _userId = signal<string | null>(null);

  /** Public readonly userId */
  readonly userId = computed(() => this._userId());

  /** Whether analytics is ready */
  readonly isReady = computed(() => this.adapter.isInitialized());

  /** Current platform */
  readonly platform = getPlatform();

  constructor() {
    // Create appropriate adapter based on platform
    if (isPlatformBrowser(this.platformId)) {
      if (isCapacitor()) {
        // Native: Use Firebase Analytics via Capacitor
        // Using sync version to avoid async constructor issues
        this.adapter = createMobileAnalyticsAdapterSync({
          debug: !environment.production,
          platform: this.platform as 'ios' | 'android',
          appVersion: environment.appVersion,
        });
      } else {
        // Web fallback: Use gtag.js
        this.adapter = createWebAnalyticsAdapter({
          measurementId: NXT1_MEASUREMENT_ID,
          debug: !environment.production,
          platform: 'web',
          appVersion: environment.appVersion,
        });
      }

      // Set up automatic screen view tracking
      this.setupScreenViewTracking();
    } else {
      // Server (shouldn't happen in Capacitor, but safety check)
      this.adapter = createMemoryAnalyticsAdapter({
        enabled: false,
      });
    }
  }

  // ============================================
  // EVENT TRACKING
  // ============================================

  /**
   * Track a custom event
   *
   * @param eventName - Event name from APP_EVENTS
   * @param properties - Event properties
   *
   * @example
   * ```typescript
   * this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
   *   method: 'apple',
   *   user_type: 'athlete',
   * });
   * ```
   */
  trackEvent<T extends BaseEventProperties = BaseEventProperties>(
    eventName: AppEventName | string,
    properties?: T
  ): void {
    this.adapter.trackEvent(eventName, properties);
  }

  /**
   * Track a screen view (native terminology for page view)
   *
   * @param screenName - Screen name
   * @param screenClass - Screen class (optional, usually the component name)
   * @param properties - Additional properties
   */
  trackScreenView(
    screenName: string,
    screenClass?: string,
    properties?: Record<string, unknown>
  ): void {
    this.adapter.trackPageView(screenName, screenClass, properties);
  }

  // ============================================
  // USER MANAGEMENT
  // ============================================

  /**
   * Set user ID and properties after authentication
   *
   * @param userId - User's unique ID
   * @param properties - User properties for segmentation
   *
   * @example
   * ```typescript
   * this.analytics.setUser(user.uid, {
   *   user_type: 'athlete',
   *   sport: 'basketball',
   *   is_premium: true,
   *   class_year: 2026,
   * });
   * ```
   */
  setUser(userId: string, properties?: UserProperties): void {
    this._userId.set(userId);
    this.adapter.setUserId(userId);

    if (properties) {
      this.adapter.setUserProperties({
        user_id: userId,
        ...properties,
      });
    }
  }

  /**
   * Update user properties without changing user ID
   *
   * @param properties - Properties to update
   */
  setUserProperties(properties: UserProperties): void {
    this.adapter.setUserProperties(properties);
  }

  /**
   * Clear user data (call on sign out)
   */
  clearUser(): void {
    this._userId.set(null);
    this.adapter.clearUser();
  }

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  /**
   * Track authentication events
   */
  trackAuth(
    event: 'signed_up' | 'signed_in' | 'signed_out',
    method?: 'email' | 'google' | 'apple' | 'phone',
    properties?: BaseEventProperties
  ): void {
    const eventMap = {
      signed_up: APP_EVENTS.AUTH_SIGNED_UP,
      signed_in: APP_EVENTS.AUTH_SIGNED_IN,
      signed_out: APP_EVENTS.AUTH_SIGNED_OUT,
    };

    this.trackEvent(eventMap[event], {
      method,
      ...properties,
    });
  }

  /**
   * Track profile events
   */
  trackProfileView(
    profileId: string,
    isOwnProfile: boolean,
    source: string
  ): void {
    this.trackEvent(APP_EVENTS.PROFILE_VIEWED, {
      profile_id: profileId,
      is_own_profile: isOwnProfile,
      source,
    });
  }

  /**
   * Track video events
   */
  trackVideoPlay(videoId: string, videoType: string): void {
    this.trackEvent(APP_EVENTS.VIDEO_PLAYED, {
      video_id: videoId,
      video_type: videoType,
    });
  }

  /**
   * Track search events
   */
  trackSearch(query: string, resultsCount: number, filters?: string[]): void {
    this.trackEvent(APP_EVENTS.SEARCH_PERFORMED, {
      search_query: query,
      results_count: resultsCount,
      filters_applied: filters?.join(','),
    });
  }

  /**
   * Track app lifecycle events (mobile-specific)
   */
  trackAppLifecycle(event: 'opened' | 'backgrounded' | 'foregrounded'): void {
    const eventMap = {
      opened: APP_EVENTS.APP_OPENED,
      backgrounded: APP_EVENTS.APP_BACKGROUNDED,
      foregrounded: APP_EVENTS.APP_FOREGROUNDED,
    };

    this.trackEvent(eventMap[event], {
      platform: this.platform,
    });
  }

  /**
   * Track errors
   */
  trackError(error: Error | string, fatal = false): void {
    const description = error instanceof Error ? error.message : error;

    if (this.adapter.trackException) {
      this.adapter.trackException(description, fatal);
    } else {
      this.trackEvent(APP_EVENTS.ERROR_OCCURRED, {
        error_message: description,
        is_fatal: fatal,
      });
    }
  }

  // ============================================
  // CONTROL METHODS
  // ============================================

  /**
   * Enable or disable analytics collection
   * Useful for respecting user privacy preferences
   */
  setEnabled(enabled: boolean): void {
    this.adapter.setEnabled(enabled);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Set up automatic screen view tracking on navigation
   */
  private setupScreenViewTracking(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        // Convert route path to screen name
        const screenName = this.routeToScreenName(event.urlAfterRedirects);
        this.trackScreenView(screenName);
      });
  }

  /**
   * Convert a route path to a human-readable screen name
   * /profile/123 -> "Profile"
   * /home -> "Home"
   */
  private routeToScreenName(route: string): string {
    const path = route.split('?')[0]; // Remove query params
    const segments = path.split('/').filter(Boolean);

    if (segments.length === 0) return 'Home';

    // Capitalize first segment, ignore IDs
    const screenName = segments[0]
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return screenName;
  }
}

// Re-export for convenience
export { APP_EVENTS } from '@nxt1/core/analytics';
