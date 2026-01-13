/**
 * @fileoverview Analytics Service for Web
 * @module @nxt1/web/core/services
 *
 * Angular service wrapper for @nxt1/core analytics.
 * Provides reactive analytics tracking with SSR safety.
 *
 * Features:
 * - SSR-safe (uses memory adapter on server)
 * - Auto-detects platform
 * - Debug mode in development
 * - User ID and properties tracking
 * - Page view tracking integration
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
  createWebAnalyticsAdapter,
  createMemoryAnalyticsAdapter,
  NXT1_MEASUREMENT_ID,
} from '@nxt1/core/analytics';

import { environment } from '../../../environments/environment';

/**
 * Analytics Service
 *
 * Manages analytics tracking for the web application.
 * Uses gtag.js adapter on browser, memory adapter on server.
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

  constructor() {
    // Create appropriate adapter based on platform
    if (isPlatformBrowser(this.platformId)) {
      // Browser: Use gtag.js adapter
      this.adapter = createWebAnalyticsAdapter({
        measurementId: NXT1_MEASUREMENT_ID,
        debug: !environment.production,
        platform: 'web',
        appVersion: environment.appVersion,
      });

      // Set up automatic page view tracking
      this.setupPageViewTracking();
    } else {
      // Server (SSR): Use memory adapter (no-op)
      this.adapter = createMemoryAnalyticsAdapter({
        enabled: false, // Don't track on server
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
   *   method: 'google',
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
   * Track a page view
   *
   * @param path - Page path
   * @param title - Page title (optional)
   * @param properties - Additional properties
   */
  trackPageView(
    path: string,
    title?: string,
    properties?: Record<string, unknown>
  ): void {
    this.adapter.trackPageView(path, title, properties);
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
   * Set up automatic page view tracking on navigation
   */
  private setupPageViewTracking(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }
}

// Re-export for convenience
export { APP_EVENTS } from '@nxt1/core/analytics';
