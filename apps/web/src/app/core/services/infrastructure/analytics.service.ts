/**
 * @fileoverview Analytics Service - Firebase Analytics for Web
 * @module @nxt1/web/core/services
 *
 * Web product telemetry is sent to Firebase Analytics / GA4. Agent-facing
 * Mongo analytics should only be populated by dedicated backend engagement
 * endpoints, not generic browser telemetry.
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  APP_EVENTS,
  FIREBASE_EVENTS,
  createFirebaseAnalyticsAdapter,
  getEventCategory,
  type AnalyticsAdapter,
  type UserProperties,
} from '@nxt1/core/analytics';
import type { ILogger } from '@nxt1/core/logging';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
  setUserId,
  setUserProperties,
} from 'firebase/analytics';
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
  private adapter: AnalyticsAdapter | null = null;
  private readonly pendingOperations: Array<(adapter: AnalyticsAdapter) => void> = [];
  private readonly initPromise: Promise<void>;
  private initialized = false;

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
    this.initPromise = this.initializeAdapter();
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
    this.runWhenReady((adapter) => {
      adapter.trackEvent(eventName, enrichedProps);
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
    this.runWhenReady((adapter) => {
      adapter.trackPageView(pagePath, pageTitle, payload);
    });
  }

  /**
   * Set the current user ID for analytics
   *
   * @param userId - User ID or null to clear
   */
  setUserId(userId: string | null): void {
    this.currentUserId = userId;

    this.logger.debug('Set User ID', { userId });
    this.runWhenReady((adapter) => {
      adapter.setUserId(userId);
    }, false);
  }

  /**
   * Set user properties for segmentation
   *
   * @param properties - User properties object
   */
  setUserProperties(properties: UserProperties): void {
    this.userProps = { ...this.userProps, ...properties };

    this.logger.debug('Set User Properties', properties);
    this.runWhenReady((adapter) => {
      adapter.setUserProperties(this.normalizeUserProperties(properties));
    }, false);
  }

  /**
   * Clear user data (call on sign out)
   */
  clearUser(): void {
    this.currentUserId = null;
    this.userProps = {};

    this.logger.debug('User cleared');
    this.runWhenReady((adapter) => {
      adapter.clearUser();
    }, false);
  }

  /**
   * Check if analytics is initialized
   */
  isInitialized(): boolean {
    return this.isEnabled && this.initialized && this.adapter?.isInitialized() === true;
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
    this.runWhenReady((adapter) => {
      adapter.setEnabled(enabled);
    }, false);
  }

  setDefaultEventParams(params: Record<string, unknown>): void {
    this.defaultEventParams = { ...this.defaultEventParams, ...params };
    this.runWhenReady((adapter) => {
      adapter.setDefaultEventParams?.(params);
    }, false);
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

  private async initializeAdapter(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    try {
      this.adapter = await createFirebaseAnalyticsAdapter({
        firebaseConfig: environment.firebase,
        debug: !environment.production,
        enabled: this.analyticsEnabled,
        platform: 'web',
        appVersion: environment.appVersion || environment.version,
        firebaseSdk: {
          initializeApp,
          getApps,
          getApp,
          getAnalytics,
          logEvent,
          setUserId,
          setUserProperties,
          setAnalyticsCollectionEnabled,
          isSupported,
        },
      });

      this.adapter.setDefaultEventParams?.(this.defaultEventParams);
      this.adapter.setEnabled(this.analyticsEnabled);

      if (this.currentUserId) {
        this.adapter.setUserId(this.currentUserId);
      }

      const normalizedUserProps = this.normalizeUserProperties(this.userProps);
      if (Object.keys(normalizedUserProps).length > 0) {
        this.adapter.setUserProperties(normalizedUserProps);
      }

      this.initialized = this.adapter.isInitialized();
      this.flushPendingOperations();
      this.logger.info('Firebase Analytics initialized', {
        initialized: this.initialized,
      });
    } catch (error) {
      this.pendingOperations.length = 0;
      this.logger.warn('Firebase Analytics initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private flushPendingOperations(): void {
    if (!this.adapter) {
      this.pendingOperations.length = 0;
      return;
    }

    const operations = this.pendingOperations.splice(0, this.pendingOperations.length);
    for (const operation of operations) {
      operation(this.adapter);
    }
  }

  private runWhenReady(
    operation: (adapter: AnalyticsAdapter) => void,
    requireEnabled = true
  ): void {
    if (!this.isBrowser) {
      return;
    }

    if (requireEnabled && !this.analyticsEnabled) {
      return;
    }

    if (this.adapter) {
      operation(this.adapter);
      return;
    }

    this.pendingOperations.push(operation);
    void this.initPromise;
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
}
