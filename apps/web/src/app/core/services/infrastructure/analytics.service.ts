/**
 * @fileoverview Analytics Service - Backend Event Relay
 * @module @nxt1/web/core/services
 *
 * Web analytics now flow through the backend-owned analytics pipeline instead of
 * direct Firebase SDK calls from the browser layer. This keeps Mongo rollups as
 * the reporting source of truth while preserving the shared AnalyticsAdapter API.
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { AnalyticsAdapter, UserProperties } from '@nxt1/core/analytics';
import { APP_EVENTS, FIREBASE_EVENTS, getEventCategory } from '@nxt1/core/analytics';
import type { ILogger } from '@nxt1/core/logging';
import { LoggingService } from './logging.service';
import { environment } from '../../../../environments/environment';

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
  private readonly logger: ILogger;
  private readonly relayEndpoint = `${environment.apiURL}/analytics/events`;
  private readonly sessionId = this.createSessionId();

  /** Current user ID for event enrichment */
  private currentUserId: string | null = null;

  /** User properties cache */
  private userProps: UserProperties = {};

  /** Default params included in every relayed event */
  private defaultEventParams: Record<string, unknown> = {};

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
    return this.isBrowser && this.analyticsEnabled;
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
    this.relayEvent({
      eventName,
      properties: enrichedProps,
      userId: this.currentUserId,
      userProperties: this.normalizeUserProperties(this.userProps),
      sessionId: this.sessionId,
      tags: [category],
    });
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

    const payload = this.enrichProperties({
      page_path: pagePath,
      page_title: pageTitle,
      page_location: typeof window !== 'undefined' ? window.location.href : undefined,
      ...properties,
    });

    this.logger.debug('Page View', { pagePath, ...payload });
    this.relayEvent({
      eventName: 'page_view',
      pagePath,
      pageTitle,
      properties: payload,
      userId: this.currentUserId,
      userProperties: this.normalizeUserProperties(this.userProps),
      sessionId: this.sessionId,
      tags: ['navigation'],
    });
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
  }

  /**
   * Clear user data (call on sign out)
   */
  clearUser(): void {
    this.currentUserId = null;
    this.userProps = {};

    if (!this.isEnabled) return;

    this.logger.debug('User cleared');
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

  setDefaultEventParams(params: Record<string, unknown>): void {
    this.defaultEventParams = { ...this.defaultEventParams, ...params };
  }

  trackTiming(category: string, name: string, value: number): void {
    this.trackEvent('timing_complete', {
      timing_category: category,
      timing_name: name,
      timing_value_ms: value,
    });
  }

  trackException(description: string, fatal = false): void {
    this.trackEvent(APP_EVENTS.ERROR_OCCURRED, {
      description,
      fatal,
    });
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
      ...this.defaultEventParams,
      ...properties,
      timestamp: new Date().toISOString(),
      platform: 'web',
      app_version: environment.appVersion || environment.version,
    };

    if (this.currentUserId) {
      enriched['user_id'] = this.currentUserId;
    }

    return Object.fromEntries(Object.entries(enriched).filter(([, value]) => value !== undefined));
  }

  private relayEvent(payload: {
    readonly eventName: string;
    readonly pagePath?: string;
    readonly pageTitle?: string;
    readonly properties?: Record<string, unknown>;
    readonly userId?: string | null;
    readonly userProperties?: Record<string, string | number | boolean>;
    readonly sessionId: string;
    readonly tags?: readonly string[];
  }): void {
    if (!this.isBrowser) return;

    const body = JSON.stringify(payload);

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const accepted = navigator.sendBeacon(
          this.relayEndpoint,
          new Blob([body], { type: 'application/json' })
        );

        if (accepted) {
          return;
        }
      }
    } catch (error) {
      this.logger.debug('Analytics beacon relay fallback engaged', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    void fetch(this.relayEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body,
    }).catch((error: unknown) => {
      this.logger.debug('Analytics relay skipped', {
        error: error instanceof Error ? error.message : String(error),
        eventName: payload.eventName,
      });
    });
  }

  private normalizeUserProperties(
    properties: UserProperties
  ): Record<string, string | number | boolean> {
    return Object.fromEntries(
      Object.entries(properties).filter(
        ([, value]) =>
          typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      )
    ) as Record<string, string | number | boolean>;
  }

  private createSessionId(): string {
    return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
