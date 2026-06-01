/**
 * @fileoverview Web Analytics Adapter (gtag.js / GA4)
 * @module @nxt1/core/analytics
 *
 * Google Analytics 4 implementation using gtag.js.
 * Use this in web applications where gtag.js is loaded via index.html.
 *
 * Prerequisites:
 * - Add gtag.js script to index.html
 * - Initialize gtag with your Measurement ID
 *
 * @example index.html
 * ```html
 * <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
 * <script>
 *   window.dataLayer = window.dataLayer || [];
 *   function gtag(){dataLayer.push(arguments);}
 *   gtag('js', new Date());
 *   gtag('config', 'G-XXXXXXXXXX');
 * </script>
 * ```
 *
 * @example Usage
 * ```typescript
 * import { createWebAnalyticsAdapter, APP_EVENTS } from '@nxt1/core/analytics';
 *
 * const analytics = createWebAnalyticsAdapter({
 *   measurementId: 'G-XXXXXXXXXX',
 *   debug: false,
 * });
 *
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
 *   method: 'email',
 *   user_type: 'athlete',
 * });
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { AnalyticsAdapter, AnalyticsConfig, UserProperties } from './analytics-adapter';
import { DEFAULT_ANALYTICS_CONFIG } from './analytics-adapter';
import type { AppEventName, BaseEventProperties } from './events';
import { getEventCategory } from './events';

// Declare gtag for TypeScript
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Create a web analytics adapter using gtag.js (GA4)
 *
 * @param config - Analytics configuration
 * @returns AnalyticsAdapter implementation
 */
export function createWebAnalyticsAdapter(config: AnalyticsConfig = {}): AnalyticsAdapter {
  const mergedConfig = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
  let userId: string | null = null;
  let userProperties: UserProperties = {};
  let enabled = mergedConfig.enabled ?? true;

  /**
   * Check if gtag is available
   */
  function isGtagAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.gtag === 'function';
  }

  /**
   * Safely call gtag
   */
  function gtag(...args: unknown[]): void {
    if (!enabled) return;

    if (isGtagAvailable()) {
      window.gtag!(...args);
    } else if (mergedConfig.debug) {
      console.warn('[WebAnalytics] gtag not available');
    }
  }

  /**
   * Enrich event properties with defaults
   */
  function enrichProperties(properties: BaseEventProperties = {}): BaseEventProperties {
    return {
      ...properties,
      timestamp: properties.timestamp || new Date().toISOString(),
      user_id: properties.user_id || userId || undefined,
      platform: mergedConfig.platform || 'web',
      app_version: mergedConfig.appVersion,
      ...mergedConfig.defaultParams,
    };
  }

  return {
    trackEvent<T extends BaseEventProperties = BaseEventProperties>(
      eventName: AppEventName | string,
      properties?: T
    ): void {
      if (!enabled) return;

      const enrichedProps = enrichProperties(properties);
      const category = getEventCategory(eventName);

      if (mergedConfig.debug) {
        console.log(`[WebAnalytics] 📊 [${category}]`, eventName, enrichedProps);
      }

      gtag('event', eventName, enrichedProps);
    },

    trackPageView(
      pagePath: string,
      pageTitle?: string,
      properties?: Record<string, unknown>
    ): void {
      if (!enabled) return;

      const payload = {
        page_path: pagePath,
        page_title: pageTitle,
        page_location: typeof window !== 'undefined' ? window.location.href : undefined,
        ...properties,
      };

      if (mergedConfig.debug) {
        console.log('[WebAnalytics] 📄 Page View:', pagePath, payload);
      }

      gtag('event', 'page_view', payload);
    },

    setUserId(newUserId: string | null): void {
      userId = newUserId;

      if (mergedConfig.debug) {
        console.log('[WebAnalytics] 👤 Set User ID:', userId);
      }

      if (mergedConfig.measurementId) {
        gtag('config', mergedConfig.measurementId, {
          user_id: userId,
        });
      }
    },

    setUserProperties(properties: UserProperties): void {
      userProperties = { ...userProperties, ...properties };

      if (mergedConfig.debug) {
        console.log('[WebAnalytics] 👤 Set User Properties:', userProperties);
      }

      gtag('set', 'user_properties', userProperties);
    },

    clearUser(): void {
      userId = null;
      userProperties = {};

      if (mergedConfig.debug) {
        console.log('[WebAnalytics] 🚪 Clear User');
      }

      if (mergedConfig.measurementId) {
        gtag('config', mergedConfig.measurementId, {
          user_id: null,
        });
      }
      gtag('set', 'user_properties', {});
    },

    isInitialized(): boolean {
      return isGtagAvailable();
    },

    getUserId(): string | null {
      return userId;
    },

    setEnabled(isEnabled: boolean): void {
      enabled = isEnabled;

      if (mergedConfig.debug) {
        console.log('[WebAnalytics]', enabled ? '✅ Enabled' : '❌ Disabled');
      }
    },

    setDefaultEventParams(params: Record<string, unknown>): void {
      mergedConfig.defaultParams = { ...mergedConfig.defaultParams, ...params };

      if (mergedConfig.debug) {
        console.log('[WebAnalytics] Set Default Params:', params);
      }
    },

    trackTiming(category: string, name: string, value: number): void {
      if (!enabled) return;

      if (mergedConfig.debug) {
        console.log('[WebAnalytics] ⏱️ Timing:', category, name, `${value}ms`);
      }

      gtag('event', 'timing_complete', {
        name,
        value,
        event_category: category,
      });
    },

    trackException(description: string, fatal = false): void {
      if (!enabled) return;

      if (mergedConfig.debug) {
        console.log('[WebAnalytics] ⚠️ Exception:', description, fatal ? '(FATAL)' : '');
      }

      gtag('event', 'exception', {
        description,
        fatal,
      });
    },
  };
}

/**
 * Pre-configured web analytics adapter
 * Uses default configuration - call setMeasurementId() to configure
 */
export const webAnalytics = createWebAnalyticsAdapter();

/**
 * NXT1's GA4 Measurement ID
 */
export const NXT1_MEASUREMENT_ID = 'G-13NF238EE7';

/**
 * Create pre-configured NXT1 analytics adapter
 */
export function createNxt1WebAnalytics(debug = false): AnalyticsAdapter {
  return createWebAnalyticsAdapter({
    measurementId: NXT1_MEASUREMENT_ID,
    debug,
    platform: 'web',
  });
}
