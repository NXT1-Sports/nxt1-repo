/**
 * @fileoverview Memory Analytics Adapter (SSR / Testing)
 * @module @nxt1/core/analytics
 *
 * In-memory analytics implementation for:
 * - Server-side rendering (SSR)
 * - Unit testing
 * - Environments without analytics
 *
 * Events are stored in memory and can be inspected for testing.
 *
 * @example Testing
 * ```typescript
 * import { createMemoryAnalyticsAdapter, APP_EVENTS } from '@nxt1/core/analytics';
 *
 * const analytics = createMemoryAnalyticsAdapter();
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, { method: 'email' });
 *
 * // Inspect tracked events
 * const events = analytics.getTrackedEvents();
 * expect(events).toHaveLength(1);
 * expect(events[0].name).toBe('auth_signed_up');
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { AnalyticsAdapter, AnalyticsConfig, UserProperties } from './analytics-adapter';
import { DEFAULT_ANALYTICS_CONFIG } from './analytics-adapter';
import type { AppEventName, BaseEventProperties } from './events';
import { getEventCategory } from './events';

/**
 * Tracked event structure (for testing inspection)
 */
export interface TrackedEvent {
  name: string;
  properties?: Record<string, unknown>;
  category?: string;
  timestamp: Date;
}

/**
 * Extended adapter interface for memory adapter (includes testing helpers)
 */
export interface MemoryAnalyticsAdapter extends AnalyticsAdapter {
  /** Get all tracked events */
  getTrackedEvents(): TrackedEvent[];
  /** Get events by name */
  getEventsByName(name: string): TrackedEvent[];
  /** Get events by category */
  getEventsByCategory(category: string): TrackedEvent[];
  /** Clear all tracked events */
  clearTrackedEvents(): void;
  /** Get page views */
  getPageViews(): Array<{ path: string; title?: string; timestamp: Date }>;
}

/**
 * Create a memory analytics adapter for SSR and testing
 *
 * @param config - Analytics configuration
 * @returns MemoryAnalyticsAdapter with testing helpers
 */
export function createMemoryAnalyticsAdapter(config: AnalyticsConfig = {}): MemoryAnalyticsAdapter {
  const mergedConfig = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
  let userId: string | null = null;
  let userProperties: UserProperties = {};
  let enabled = mergedConfig.enabled ?? true;

  // Storage for tracked events
  const trackedEvents: TrackedEvent[] = [];
  const pageViews: Array<{ path: string; title?: string; timestamp: Date }> = [];

  return {
    trackEvent<T extends BaseEventProperties = BaseEventProperties>(
      eventName: AppEventName | string,
      properties?: T
    ): void {
      if (!enabled) return;

      const category = getEventCategory(eventName);
      const event: TrackedEvent = {
        name: eventName,
        properties: properties as Record<string, unknown>,
        category,
        timestamp: new Date(),
      };

      trackedEvents.push(event);

      if (mergedConfig.debug) {
        console.log(`[MemoryAnalytics] 📊 [${category}]`, eventName, properties);
      }
    },

    trackPageView(
      pagePath: string,
      pageTitle?: string,
      _properties?: Record<string, unknown>
    ): void {
      if (!enabled) return;

      pageViews.push({
        path: pagePath,
        title: pageTitle,
        timestamp: new Date(),
      });

      if (mergedConfig.debug) {
        console.log('[MemoryAnalytics] 📄 Page View:', pagePath, pageTitle);
      }
    },

    setUserId(newUserId: string | null): void {
      userId = newUserId;

      if (mergedConfig.debug) {
        console.log('[MemoryAnalytics] 👤 Set User ID:', userId);
      }
    },

    setUserProperties(properties: UserProperties): void {
      userProperties = { ...userProperties, ...properties };

      if (mergedConfig.debug) {
        console.log('[MemoryAnalytics] 👤 Set User Properties:', userProperties);
      }
    },

    clearUser(): void {
      userId = null;
      userProperties = {};

      if (mergedConfig.debug) {
        console.log('[MemoryAnalytics] 🚪 Clear User');
      }
    },

    isInitialized(): boolean {
      return true; // Memory adapter is always initialized
    },

    getUserId(): string | null {
      return userId;
    },

    setEnabled(isEnabled: boolean): void {
      enabled = isEnabled;

      if (mergedConfig.debug) {
        console.log('[MemoryAnalytics]', enabled ? '✅ Enabled' : '❌ Disabled');
      }
    },

    setDefaultEventParams(params: Record<string, unknown>): void {
      mergedConfig.defaultParams = { ...mergedConfig.defaultParams, ...params };
    },

    trackTiming(category: string, name: string, value: number): void {
      if (!enabled) return;

      trackedEvents.push({
        name: 'timing_complete',
        properties: { category, name, value },
        category: 'performance',
        timestamp: new Date(),
      });
    },

    trackException(description: string, fatal = false): void {
      if (!enabled) return;

      trackedEvents.push({
        name: 'exception',
        properties: { description, fatal },
        category: 'error',
        timestamp: new Date(),
      });
    },

    // Testing helpers
    getTrackedEvents(): TrackedEvent[] {
      return [...trackedEvents];
    },

    getEventsByName(name: string): TrackedEvent[] {
      return trackedEvents.filter((e) => e.name === name);
    },

    getEventsByCategory(category: string): TrackedEvent[] {
      return trackedEvents.filter((e) => e.category === category);
    },

    clearTrackedEvents(): void {
      trackedEvents.length = 0;
      pageViews.length = 0;
    },

    getPageViews(): Array<{ path: string; title?: string; timestamp: Date }> {
      return [...pageViews];
    },
  };
}

/**
 * Pre-configured memory analytics adapter
 */
export const memoryAnalytics = createMemoryAnalyticsAdapter();
