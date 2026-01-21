/**
 * @fileoverview Mobile Analytics Adapter (Firebase Analytics)
 * @module @nxt1/core/analytics
 *
 * Firebase Analytics implementation for native iOS/Android apps.
 * Uses @capacitor-firebase/analytics plugin under the hood.
 *
 * Prerequisites:
 * - Install: npm install @capacitor-firebase/analytics
 * - Add google-services.json (Android) and GoogleService-Info.plist (iOS)
 * - Sync: npx cap sync
 *
 * @example
 * ```typescript
 * import { createMobileAnalyticsAdapter, APP_EVENTS } from '@nxt1/core/analytics';
 *
 * // Initialize (async - waits for plugin to load)
 * const analytics = await createMobileAnalyticsAdapter({
 *   debug: true,
 *   platform: 'ios',
 * });
 *
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
 *   method: 'apple',
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

/**
 * Firebase Analytics plugin interface
 * Matches @capacitor-firebase/analytics API
 */
interface FirebaseAnalyticsPlugin {
  logEvent(options: { name: string; params?: Record<string, unknown> }): Promise<void>;
  setUserId(options: { userId: string | null }): Promise<void>;
  setUserProperty(options: { key: string; value: string | null }): Promise<void>;
  setCurrentScreen(options: { screenName: string; screenClassOverride?: string }): Promise<void>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  setSessionTimeoutDuration?(options: { duration: number }): Promise<void>;
  resetAnalyticsData?(): Promise<void>;
}

// Lazy-loaded plugin
let firebaseAnalyticsPlugin: FirebaseAnalyticsPlugin | null = null;

/**
 * Get the Firebase Analytics plugin (lazy loaded)
 * Uses dynamic import to avoid compile-time dependency
 *
 * @param debug - When true, logs warning if plugin unavailable (dev only)
 */
async function getFirebaseAnalytics(debug = false): Promise<FirebaseAnalyticsPlugin | null> {
  if (firebaseAnalyticsPlugin) return firebaseAnalyticsPlugin;

  try {
    // Dynamic import - intentionally uses variable to avoid bundler resolution
    // @vite-ignore and webpackIgnore prevent bundlers from analyzing this import
    const moduleName = '@capacitor-firebase/analytics';
    const module = (await import(/* @vite-ignore */ /* webpackIgnore: true */ moduleName)) as {
      FirebaseAnalytics: FirebaseAnalyticsPlugin;
    };
    firebaseAnalyticsPlugin = module.FirebaseAnalytics;
    return firebaseAnalyticsPlugin;
  } catch {
    // Only log in debug mode (development) - expected to fail in browser
    if (debug) {
      console.debug(
        '[MobileAnalytics] Capacitor plugin unavailable - analytics disabled in browser'
      );
    }
    return null;
  }
}

/**
 * Create a mobile analytics adapter using Firebase Analytics
 *
 * @param config - Analytics configuration
 * @returns Promise resolving to AnalyticsAdapter implementation
 */
export async function createMobileAnalyticsAdapter(
  config: AnalyticsConfig = {}
): Promise<AnalyticsAdapter> {
  const mergedConfig = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
  let userId: string | null = null;
  let userProperties: UserProperties = {};
  let enabled = mergedConfig.enabled ?? true;
  let initialized = false;

  // Try to load the plugin (pass debug flag for dev logging)
  const plugin = await getFirebaseAnalytics(mergedConfig.debug);
  initialized = plugin !== null;

  /**
   * Enrich event properties with defaults
   */
  function enrichProperties(properties: BaseEventProperties = {}): Record<string, unknown> {
    const enriched: Record<string, unknown> = {
      ...properties,
      timestamp: properties.timestamp || new Date().toISOString(),
      user_id: properties.user_id || userId || undefined,
      platform: mergedConfig.platform,
      app_version: mergedConfig.appVersion,
      ...mergedConfig.defaultParams,
    };

    // Firebase Analytics has a 100 character limit for string values
    // and doesn't support nested objects well, so flatten
    const flattened: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(enriched)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'string') {
          flattened[key] = value.substring(0, 100);
        } else if (typeof value === 'object') {
          flattened[key] = JSON.stringify(value).substring(0, 100);
        } else {
          flattened[key] = value;
        }
      }
    }

    return flattened;
  }

  return {
    async trackEvent<T extends BaseEventProperties = BaseEventProperties>(
      eventName: AppEventName | string,
      properties?: T
    ): Promise<void> {
      if (!enabled || !plugin) return;

      const enrichedProps = enrichProperties(properties);
      const category = getEventCategory(eventName);

      if (mergedConfig.debug) {
        console.log(`[CapacitorAnalytics] 📊 [${category}]`, eventName, enrichedProps);
      }

      try {
        await plugin.logEvent({
          name: eventName,
          params: enrichedProps,
        });
      } catch (error) {
        console.warn('[CapacitorAnalytics] Failed to log event:', error);
      }
    },

    async trackPageView(
      pagePath: string,
      pageTitle?: string,
      properties?: Record<string, unknown>
    ): Promise<void> {
      if (!enabled || !plugin) return;

      if (mergedConfig.debug) {
        console.log('[CapacitorAnalytics] 📄 Screen View:', pagePath, pageTitle);
      }

      try {
        // Use setCurrentScreen for native screen tracking
        await plugin.setCurrentScreen({
          screenName: pageTitle || pagePath,
          screenClassOverride: pagePath,
        });

        // Also log as event for consistency with web
        await plugin.logEvent({
          name: 'screen_view',
          params: {
            screen_name: pageTitle || pagePath,
            screen_class: pagePath,
            ...properties,
          },
        });
      } catch (error) {
        console.warn('[CapacitorAnalytics] Failed to track screen:', error);
      }
    },

    async setUserId(newUserId: string | null): Promise<void> {
      userId = newUserId;
      if (!plugin) return;

      if (mergedConfig.debug) {
        console.log('[CapacitorAnalytics] 👤 Set User ID:', userId);
      }

      try {
        await plugin.setUserId({ userId });
      } catch (error) {
        console.warn('[CapacitorAnalytics] Failed to set user ID:', error);
      }
    },

    async setUserProperties(properties: UserProperties): Promise<void> {
      userProperties = { ...userProperties, ...properties };
      if (!plugin) return;

      if (mergedConfig.debug) {
        console.log('[CapacitorAnalytics] 👤 Set User Properties:', userProperties);
      }

      try {
        // Firebase requires setting each property individually
        for (const [key, value] of Object.entries(properties)) {
          if (value !== undefined) {
            await plugin.setUserProperty({
              key,
              value: String(value),
            });
          }
        }
      } catch (error) {
        console.warn('[CapacitorAnalytics] Failed to set user properties:', error);
      }
    },

    async clearUser(): Promise<void> {
      userId = null;
      userProperties = {};
      if (!plugin) return;

      if (mergedConfig.debug) {
        console.log('[CapacitorAnalytics] 🚪 Clear User');
      }

      try {
        await plugin.setUserId({ userId: null });
        // Reset analytics data if supported
        if (plugin.resetAnalyticsData) {
          await plugin.resetAnalyticsData();
        }
      } catch (error) {
        console.warn('[CapacitorAnalytics] Failed to clear user:', error);
      }
    },

    isInitialized(): boolean {
      return initialized && enabled;
    },

    getUserId(): string | null {
      return userId;
    },

    async setEnabled(isEnabled: boolean): Promise<void> {
      enabled = isEnabled;
      if (!plugin) return;

      if (mergedConfig.debug) {
        console.log('[CapacitorAnalytics]', enabled ? '✅ Enabled' : '❌ Disabled');
      }

      try {
        await plugin.setEnabled({ enabled });
      } catch (error) {
        console.warn('[CapacitorAnalytics] Failed to set enabled:', error);
      }
    },

    setDefaultEventParams(params: Record<string, unknown>): void {
      mergedConfig.defaultParams = { ...mergedConfig.defaultParams, ...params };

      if (mergedConfig.debug) {
        console.log('[CapacitorAnalytics] Set Default Params:', params);
      }
    },

    async trackTiming(category: string, name: string, value: number): Promise<void> {
      if (!enabled || !plugin) return;

      if (mergedConfig.debug) {
        console.log('[CapacitorAnalytics] ⏱️ Timing:', category, name, `${value}ms`);
      }

      try {
        await plugin.logEvent({
          name: 'timing_complete',
          params: {
            name,
            value,
            event_category: category,
          },
        });
      } catch (error) {
        console.warn('[CapacitorAnalytics] Failed to track timing:', error);
      }
    },

    async trackException(description: string, fatal = false): Promise<void> {
      if (!enabled || !plugin) return;

      if (mergedConfig.debug) {
        console.log('[CapacitorAnalytics] ⚠️ Exception:', description, fatal ? '(FATAL)' : '');
      }

      try {
        await plugin.logEvent({
          name: 'exception',
          params: {
            description: description.substring(0, 100),
            fatal,
          },
        });
      } catch (error) {
        console.warn('[CapacitorAnalytics] Failed to track exception:', error);
      }
    },
  };
}

/**
 * Synchronous version that returns an adapter immediately
 * (plugin loads lazily on first use)
 */
export function createMobileAnalyticsAdapterSync(config: AnalyticsConfig = {}): AnalyticsAdapter {
  const mergedConfig = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
  let userId: string | null = null;
  let enabled = mergedConfig.enabled ?? true;
  let pluginPromise: Promise<FirebaseAnalyticsPlugin | null> | null = null;

  /**
   * Get plugin (lazy load with debug flag)
   */
  async function getPlugin(): Promise<FirebaseAnalyticsPlugin | null> {
    if (!pluginPromise) {
      pluginPromise = getFirebaseAnalytics(mergedConfig.debug);
    }
    return pluginPromise;
  }

  return {
    trackEvent(eventName, properties): void {
      if (!enabled) return;

      getPlugin().then((plugin) => {
        if (plugin) {
          const category = getEventCategory(eventName);
          if (mergedConfig.debug) {
            console.log(`[CapacitorAnalytics] 📊 [${category}]`, eventName, properties);
          }
          plugin.logEvent({
            name: eventName,
            params: properties as Record<string, unknown>,
          });
        }
      });
    },

    trackPageView(pagePath, pageTitle, _properties): void {
      if (!enabled) return;

      getPlugin().then((plugin) => {
        if (plugin) {
          plugin.setCurrentScreen({
            screenName: pageTitle || pagePath,
            screenClassOverride: pagePath,
          });
        }
      });
    },

    setUserId(newUserId): void {
      userId = newUserId;
      getPlugin().then((plugin) => {
        if (plugin) {
          plugin.setUserId({ userId });
        }
      });
    },

    setUserProperties(properties): void {
      getPlugin().then((plugin) => {
        if (plugin) {
          for (const [key, value] of Object.entries(properties)) {
            if (value !== undefined) {
              plugin.setUserProperty({ key, value: String(value) });
            }
          }
        }
      });
    },

    clearUser(): void {
      userId = null;
      getPlugin().then((plugin) => {
        if (plugin) {
          plugin.setUserId({ userId: null });
        }
      });
    },

    isInitialized(): boolean {
      return enabled;
    },

    getUserId(): string | null {
      return userId;
    },

    setEnabled(isEnabled): void {
      enabled = isEnabled;
      getPlugin().then((plugin) => {
        if (plugin) {
          plugin.setEnabled({ enabled });
        }
      });
    },
  };
}
