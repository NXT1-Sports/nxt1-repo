/**
 * @fileoverview Analytics Service - Firebase Analytics Wrapper
 * @module @nxt1/web/core/services
 *
 * Production-grade Angular service wrapping Firebase Analytics.
 * Uses the AnalyticsAdapter interface from @nxt1/core for consistency.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                     Components                              │
 * │              Inject AnalyticsService                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │            ⭐ AnalyticsService (THIS FILE) ⭐                │
 * │         Angular wrapper with DI, SSR-safety                 │
 * ├─────────────────────────────────────────────────────────────┤
 * │               @angular/fire/analytics                       │
 * │               Firebase Analytics SDK                        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Features:
 * - SSR-safe (no-ops on server)
 * - Automatic user ID sync with Firebase Auth
 * - Implements AnalyticsAdapter for portability
 * - Debug mode in development
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Analytics, logEvent, setUserId, setUserProperties } from '@angular/fire/analytics';
import type { AnalyticsAdapter, UserProperties } from '@nxt1/core/analytics';
import { APP_EVENTS, FIREBASE_EVENTS, getEventCategory } from '@nxt1/core/analytics';
import type { ILogger } from '@nxt1/core/logging';
import { LoggingService } from './logging.service';
import { environment } from '../../../environments/environment';

/**
 * Core Analytics Service
 *
 * Provides unified analytics tracking across the application.
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
  private readonly platformId = inject(PLATFORM_ID);
  private readonly analytics = inject(Analytics, { optional: true });
  private readonly logger: ILogger;

  /** Current user ID for event enrichment */
  private currentUserId: string | null = null;

  /** User properties cache */
  private userProps: UserProperties = {};

  /** Analytics collection enabled state */
  private analyticsEnabled = true;

  constructor() {
    const loggingService = inject(LoggingService);
    this.logger = loggingService.child('Analytics');
  }

  /** Whether we're in browser environment */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /** Whether analytics is available and enabled */
  private get isEnabled(): boolean {
    return this.isBrowser && !!this.analytics && this.analyticsEnabled;
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
    if (!this.isEnabled) return;

    const enrichedProps = this.enrichProperties(properties);
    const category = getEventCategory(eventName);

    this.logger.debug(`[${category}] ${eventName}`, enrichedProps);

    try {
      logEvent(this.analytics!, eventName, enrichedProps);
    } catch (error) {
      this.logger.warn('Failed to log event', { eventName, error });
    }
  }

  /**
   * Track a page view
   *
   * @param pagePath - Page path (e.g., '/profile/123')
   * @param pageTitle - Optional page title
   * @param properties - Optional additional properties
   */
  trackPageView(pagePath: string, pageTitle?: string, properties?: Record<string, unknown>): void {
    if (!this.isEnabled) return;

    const payload = {
      page_path: pagePath,
      page_title: pageTitle,
      page_location: typeof window !== 'undefined' ? window.location.href : undefined,
      ...properties,
    };

    this.logger.debug('Page View', { pagePath, ...payload });

    try {
      logEvent(this.analytics!, 'page_view', payload);
    } catch (error) {
      this.logger.warn('Failed to track page view', { pagePath, error });
    }
  }

  /**
   * Set the current user ID for analytics
   *
   * @param userId - User ID or null to clear
   */
  setUserId(userId: string | null): void {
    this.currentUserId = userId;

    if (!this.isEnabled) return;

    this.logger.debug('Set User ID', { userId });

    try {
      setUserId(this.analytics!, userId);
    } catch (error) {
      this.logger.warn('Failed to set user ID', { userId, error });
    }
  }

  /**
   * Set user properties for segmentation
   *
   * @param properties - User properties object
   */
  setUserProperties(properties: UserProperties): void {
    this.userProps = { ...this.userProps, ...properties };

    if (!this.isEnabled) return;

    this.logger.debug('Set User Properties', properties);

    try {
      // Convert all values to strings (Firebase requirement)
      const stringProps: Record<string, string> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (value !== undefined && value !== null) {
          stringProps[key] = String(value);
        }
      }
      setUserProperties(this.analytics!, stringProps);
    } catch (error) {
      this.logger.warn('Failed to set user properties', { error });
    }
  }

  /**
   * Clear user data (call on sign out)
   */
  clearUser(): void {
    this.currentUserId = null;
    this.userProps = {};

    if (!this.isEnabled) return;

    this.logger.debug('User cleared');

    try {
      setUserId(this.analytics!, null);
    } catch (error) {
      this.logger.warn('Failed to clear user', { error });
    }
  }

  /**
   * Check if analytics is initialized
   */
  isInitialized(): boolean {
    return this.isEnabled;
  }

  /**
   * Get current user ID
   */
  getUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Enable/disable analytics collection
   * @param enabled - Whether to enable collection
   */
  setEnabled(enabled: boolean): void {
    this.analyticsEnabled = enabled;
    this.logger.info(`Analytics ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Disable analytics collection (for GDPR compliance)
   * @deprecated Use setEnabled(false) instead
   */
  disable(): void {
    this.setEnabled(false);
  }

  /**
   * Enable analytics collection
   * @deprecated Use setEnabled(true) instead
   */
  enable(): void {
    this.setEnabled(true);
  }

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  /**
   * Track sign up event (Firebase recommended)
   */
  trackSignUp(method: string, additionalParams?: Record<string, unknown>): void {
    this.trackEvent(FIREBASE_EVENTS.SIGN_UP, {
      method,
      ...additionalParams,
    });
  }

  /**
   * Track login event (Firebase recommended)
   */
  trackLogin(method: string, additionalParams?: Record<string, unknown>): void {
    this.trackEvent(FIREBASE_EVENTS.LOGIN, {
      method,
      ...additionalParams,
    });
  }

  /**
   * Track share event (Firebase recommended)
   */
  trackShare(
    contentType: string,
    itemId: string,
    method: string,
    additionalParams?: Record<string, unknown>
  ): void {
    this.trackEvent(FIREBASE_EVENTS.SHARE, {
      content_type: contentType,
      item_id: itemId,
      method,
      ...additionalParams,
    });
  }

  /**
   * Track search event (Firebase recommended)
   */
  trackSearch(searchTerm: string, additionalParams?: Record<string, unknown>): void {
    this.trackEvent(FIREBASE_EVENTS.SEARCH, {
      search_term: searchTerm,
      ...additionalParams,
    });
  }

  /**
   * Track error event
   */
  trackError(
    errorType: string,
    errorMessage: string,
    additionalParams?: Record<string, unknown>
  ): void {
    this.trackEvent(APP_EVENTS.ERROR_OCCURRED, {
      error_type: errorType,
      error_message: errorMessage,
      ...additionalParams,
    });
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Enrich event properties with standard fields
   */
  private enrichProperties(properties?: Record<string, unknown>): Record<string, unknown> {
    const enriched: Record<string, unknown> = {
      ...properties,
      timestamp: new Date().toISOString(),
      platform: 'web',
      app_version: environment.appVersion || environment.version,
    };

    // Add user ID if available
    if (this.currentUserId) {
      enriched['user_id'] = this.currentUserId;
    }

    // Remove undefined values
    return Object.fromEntries(Object.entries(enriched).filter(([, v]) => v !== undefined));
  }
}
