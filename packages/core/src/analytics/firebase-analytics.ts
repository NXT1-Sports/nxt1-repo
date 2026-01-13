/**
 * @fileoverview Firebase Analytics Adapter (Web)
 * @module @nxt1/core/analytics
 *
 * Production-grade Firebase Analytics implementation for web applications.
 * Uses the official @firebase/analytics SDK for better integration with
 * the Firebase ecosystem (Auth, Crashlytics, etc.)
 *
 * ⭐ BEST PRACTICE FOR 2026 ⭐
 * - Same Firebase project as mobile app
 * - Better cross-platform user stitching
 * - No external script dependencies (gtag.js)
 * - Tree-shakeable - only imports what's used
 * - SSR-safe with proper server-side handling
 * - GDPR/consent management friendly
 *
 * @example Basic Usage
 * ```typescript
 * import { createFirebaseAnalyticsAdapter, APP_EVENTS } from '@nxt1/core/analytics';
 *
 * const analytics = await createFirebaseAnalyticsAdapter({
 *   firebaseConfig: environment.firebase,
 *   debug: !environment.production,
 * });
 *
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
 *   method: 'email',
 *   user_type: 'athlete',
 * });
 * ```
 *
 * @example With Consent Management
 * ```typescript
 * const analytics = await createFirebaseAnalyticsAdapter({
 *   firebaseConfig: environment.firebase,
 *   consentMode: {
 *     analytics_storage: 'granted',
 *     ad_storage: 'denied',
 *   },
 * });
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { AnalyticsAdapter, AnalyticsConfig, UserProperties } from './analytics-adapter';
import { DEFAULT_ANALYTICS_CONFIG } from './analytics-adapter';
import type { AppEventName, BaseEventProperties } from './events';
import { getEventCategory } from './events';

// ============================================
// TYPES
// ============================================

/**
 * Firebase configuration object
 * Matches the structure from Firebase Console
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

/**
 * Google Consent Mode settings
 * https://developers.google.com/tag-platform/security/guides/consent
 */
export interface ConsentSettings {
  /** Analytics cookies consent */
  analytics_storage?: 'granted' | 'denied';
  /** Advertising cookies consent */
  ad_storage?: 'granted' | 'denied';
  /** Advertising personalization consent */
  ad_personalization?: 'granted' | 'denied';
  /** User data consent for ads */
  ad_user_data?: 'granted' | 'denied';
  /** Functionality cookies consent */
  functionality_storage?: 'granted' | 'denied';
  /** Personalization cookies consent */
  personalization_storage?: 'granted' | 'denied';
  /** Security cookies consent */
  security_storage?: 'granted' | 'denied';
}

/**
 * Extended configuration for Firebase Analytics
 */
export interface FirebaseAnalyticsConfig extends AnalyticsConfig {
  /** Firebase project configuration */
  firebaseConfig: FirebaseConfig;
  /** Google Consent Mode settings */
  consentMode?: ConsentSettings;
  /** Custom Firebase app name (for multiple Firebase apps) */
  appName?: string;
}

// ============================================
// FIREBASE SDK - RUNTIME LOADED
// ============================================

// Use unknown types since Firebase SDK is dynamically imported
// This avoids type conflicts between different Firebase versions

/** Lazy-loaded Firebase app instance */
let firebaseApp: unknown = null;

/** Lazy-loaded Analytics instance */
let analyticsInstance: unknown = null;

/** Firebase SDK functions - loaded at runtime */
let logEventFn:
  | ((analytics: unknown, eventName: string, eventParams?: Record<string, unknown>) => void)
  | null = null;
let setUserIdFn: ((analytics: unknown, id: string | null) => void) | null = null;
let setUserPropertiesFn:
  | ((analytics: unknown, properties: Record<string, unknown>) => void)
  | null = null;
let setAnalyticsCollectionEnabledFn: ((analytics: unknown, enabled: boolean) => void) | null = null;
let setConsentFn: ((consentSettings: Record<string, string>) => void) | null = null;

/**
 * Initialize Firebase and Analytics SDK
 * Lazy loads the Firebase modules to support tree-shaking
 */
async function initializeFirebase(config: FirebaseAnalyticsConfig): Promise<boolean> {
  // Skip on server (SSR)
  if (typeof window === 'undefined') {
    return false;
  }

  // Already initialized
  if (analyticsInstance && firebaseApp) {
    return true;
  }

  try {
    // Dynamic imports for tree-shaking
    // These modules are loaded at runtime from the host app's node_modules
    // Using string variables to bypass TypeScript module resolution
    const firebaseAppPath = 'firebase/app';
    const firebaseAnalyticsPath = 'firebase/analytics';

    const firebaseAppModule = await import(/* webpackIgnore: true */ firebaseAppPath);
    const firebaseAnalyticsModule = await import(/* webpackIgnore: true */ firebaseAnalyticsPath);

    const { initializeApp, getApps, getApp } = firebaseAppModule;
    const {
      getAnalytics,
      logEvent,
      setUserId,
      setUserProperties,
      setAnalyticsCollectionEnabled,
      setConsent,
      isSupported,
    } = firebaseAnalyticsModule;

    // Check if analytics is supported in this environment
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FirebaseAnalytics] Analytics not supported in this environment');
      return false;
    }

    // Store function references (cast to our simplified types)
    logEventFn = logEvent as typeof logEventFn;
    setUserIdFn = setUserId as typeof setUserIdFn;
    setUserPropertiesFn = setUserProperties as typeof setUserPropertiesFn;
    setAnalyticsCollectionEnabledFn =
      setAnalyticsCollectionEnabled as typeof setAnalyticsCollectionEnabledFn;
    setConsentFn = setConsent as typeof setConsentFn;

    // Initialize or get existing Firebase app
    const appName = config.appName || '[DEFAULT]';
    const existingApps = getApps();

    if (existingApps.length > 0) {
      // Use existing app
      firebaseApp = getApp(appName);
    } else {
      // Initialize new app
      firebaseApp = initializeApp(config.firebaseConfig, appName);
    }

    // Set consent before initializing analytics (GDPR compliance)
    if (config.consentMode && setConsentFn) {
      setConsentFn(config.consentMode as Record<string, string>);
    }

    // Initialize Analytics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    analyticsInstance = getAnalytics(firebaseApp as any);

    return true;
  } catch (error) {
    console.error('[FirebaseAnalytics] Failed to initialize:', error);
    return false;
  }
}

/**
 * Create a production-grade Firebase Analytics adapter
 *
 * Uses the official Firebase JS SDK for:
 * - Better Firebase ecosystem integration
 * - Cross-platform user identity
 * - No external script dependencies
 * - GDPR consent management
 *
 * @param config - Firebase Analytics configuration
 * @returns Promise resolving to AnalyticsAdapter
 *
 * @example
 * ```typescript
 * const analytics = await createFirebaseAnalyticsAdapter({
 *   firebaseConfig: environment.firebase,
 *   debug: !environment.production,
 * });
 *
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: 'google' });
 * ```
 */
export async function createFirebaseAnalyticsAdapter(
  config: FirebaseAnalyticsConfig
): Promise<AnalyticsAdapter> {
  const mergedConfig = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
  let userId: string | null = null;
  let userProperties: UserProperties = {};
  let enabled = mergedConfig.enabled ?? true;
  let initialized = false;

  // Initialize Firebase
  initialized = await initializeFirebase(config);

  /**
   * Enrich event properties with standard fields
   */
  function enrichProperties(properties: BaseEventProperties = {}): Record<string, unknown> {
    const enriched: Record<string, unknown> = {
      ...properties,
      timestamp: properties.timestamp || new Date().toISOString(),
      user_id: properties.user_id || userId || undefined,
      platform: mergedConfig.platform || 'web',
      app_version: mergedConfig.appVersion,
      ...mergedConfig.defaultParams,
    };

    // Remove undefined values (Firebase doesn't like them)
    return Object.fromEntries(Object.entries(enriched).filter(([, v]) => v !== undefined));
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
        console.log(`[FirebaseAnalytics] 📊 [${category}]`, eventName, enrichedProps);
      }

      if (initialized && analyticsInstance && logEventFn) {
        try {
          logEventFn(analyticsInstance, eventName, enrichedProps);
        } catch (error) {
          console.warn('[FirebaseAnalytics] Failed to log event:', error);
        }
      }
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
        console.log('[FirebaseAnalytics] 📄 Page View:', pagePath, payload);
      }

      if (initialized && analyticsInstance && logEventFn) {
        try {
          logEventFn(analyticsInstance, 'page_view', payload);
        } catch (error) {
          console.warn('[FirebaseAnalytics] Failed to track page view:', error);
        }
      }
    },

    setUserId(newUserId: string | null): void {
      userId = newUserId;

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] 👤 Set User ID:', userId);
      }

      if (initialized && analyticsInstance && setUserIdFn) {
        try {
          setUserIdFn(analyticsInstance, userId);
        } catch (error) {
          console.warn('[FirebaseAnalytics] Failed to set user ID:', error);
        }
      }
    },

    setUserProperties(properties: UserProperties): void {
      userProperties = { ...userProperties, ...properties };

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] 👤 Set User Properties:', userProperties);
      }

      if (initialized && analyticsInstance && setUserPropertiesFn) {
        try {
          // Convert all values to strings (Firebase requirement)
          const stringProps: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(properties)) {
            if (value !== undefined && value !== null) {
              stringProps[key] = typeof value === 'boolean' ? value : String(value);
            }
          }
          setUserPropertiesFn(analyticsInstance, stringProps);
        } catch (error) {
          console.warn('[FirebaseAnalytics] Failed to set user properties:', error);
        }
      }
    },

    clearUser(): void {
      userId = null;
      userProperties = {};

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] 🚪 Clear User');
      }

      if (initialized && analyticsInstance && setUserIdFn) {
        try {
          setUserIdFn(analyticsInstance, null);
        } catch (error) {
          console.warn('[FirebaseAnalytics] Failed to clear user:', error);
        }
      }
    },

    isInitialized(): boolean {
      return initialized && enabled;
    },

    getUserId(): string | null {
      return userId;
    },

    setEnabled(isEnabled: boolean): void {
      enabled = isEnabled;

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics]', enabled ? '✅ Enabled' : '❌ Disabled');
      }

      if (initialized && analyticsInstance && setAnalyticsCollectionEnabledFn) {
        try {
          setAnalyticsCollectionEnabledFn(analyticsInstance, enabled);
        } catch (error) {
          console.warn('[FirebaseAnalytics] Failed to set enabled:', error);
        }
      }
    },

    setDefaultEventParams(params: Record<string, unknown>): void {
      mergedConfig.defaultParams = { ...mergedConfig.defaultParams, ...params };

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] Set Default Params:', params);
      }
    },

    trackTiming(category: string, name: string, value: number): void {
      if (!enabled) return;

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] ⏱️ Timing:', category, name, `${value}ms`);
      }

      if (initialized && analyticsInstance && logEventFn) {
        try {
          logEventFn(analyticsInstance, 'timing_complete', {
            name,
            value,
            event_category: category,
          });
        } catch (error) {
          console.warn('[FirebaseAnalytics] Failed to track timing:', error);
        }
      }
    },

    trackException(description: string, fatal = false): void {
      if (!enabled) return;

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] ⚠️ Exception:', description, fatal ? '(FATAL)' : '');
      }

      if (initialized && analyticsInstance && logEventFn) {
        try {
          logEventFn(analyticsInstance, 'exception', {
            description: description.substring(0, 150), // Firebase limit
            fatal,
          });
        } catch (error) {
          console.warn('[FirebaseAnalytics] Failed to track exception:', error);
        }
      }
    },
  };
}

/**
 * Create Firebase Analytics adapter synchronously
 * Initialization happens lazily on first use
 *
 * Use this when you need an adapter immediately (e.g., in service constructors)
 *
 * @param config - Firebase Analytics configuration
 * @returns AnalyticsAdapter (initializes lazily)
 */
export function createFirebaseAnalyticsAdapterSync(
  config: FirebaseAnalyticsConfig
): AnalyticsAdapter {
  const mergedConfig = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
  let userId: string | null = null;
  let enabled = mergedConfig.enabled ?? true;
  let initPromise: Promise<boolean> | null = null;
  let initialized = false;

  /**
   * Ensure Firebase is initialized
   */
  async function ensureInitialized(): Promise<boolean> {
    if (initialized) return true;
    if (!initPromise) {
      initPromise = initializeFirebase(config).then((result) => {
        initialized = result;
        return result;
      });
    }
    return initPromise;
  }

  return {
    trackEvent(eventName, properties): void {
      if (!enabled) return;

      const category = getEventCategory(eventName);
      if (mergedConfig.debug) {
        console.log(`[FirebaseAnalytics] 📊 [${category}]`, eventName, properties);
      }

      ensureInitialized().then(() => {
        if (initialized && analyticsInstance && logEventFn) {
          logEventFn(analyticsInstance, eventName, {
            ...properties,
            user_id: userId || undefined,
            platform: mergedConfig.platform || 'web',
          });
        }
      });
    },

    trackPageView(pagePath, pageTitle, properties): void {
      if (!enabled) return;

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] 📄 Page View:', pagePath);
      }

      ensureInitialized().then(() => {
        if (initialized && analyticsInstance && logEventFn) {
          logEventFn(analyticsInstance, 'page_view', {
            page_path: pagePath,
            page_title: pageTitle,
            page_location: typeof window !== 'undefined' ? window.location.href : undefined,
            ...properties,
          });
        }
      });
    },

    setUserId(newUserId): void {
      userId = newUserId;

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] 👤 Set User ID:', userId);
      }

      ensureInitialized().then(() => {
        if (initialized && analyticsInstance && setUserIdFn) {
          setUserIdFn(analyticsInstance, userId);
        }
      });
    },

    setUserProperties(properties): void {
      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] 👤 Set User Properties:', properties);
      }

      ensureInitialized().then(() => {
        if (initialized && analyticsInstance && setUserPropertiesFn) {
          const stringProps: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(properties)) {
            if (value !== undefined && value !== null) {
              stringProps[key] = typeof value === 'boolean' ? value : String(value);
            }
          }
          setUserPropertiesFn(analyticsInstance, stringProps);
        }
      });
    },

    clearUser(): void {
      userId = null;

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics] 🚪 Clear User');
      }

      ensureInitialized().then(() => {
        if (initialized && analyticsInstance && setUserIdFn) {
          setUserIdFn(analyticsInstance, null);
        }
      });
    },

    isInitialized(): boolean {
      return initialized && enabled;
    },

    getUserId(): string | null {
      return userId;
    },

    setEnabled(isEnabled): void {
      enabled = isEnabled;

      if (mergedConfig.debug) {
        console.log('[FirebaseAnalytics]', enabled ? '✅ Enabled' : '❌ Disabled');
      }

      ensureInitialized().then(() => {
        if (initialized && analyticsInstance && setAnalyticsCollectionEnabledFn) {
          setAnalyticsCollectionEnabledFn(analyticsInstance, enabled);
        }
      });
    },
  };
}

/**
 * Update consent settings at runtime
 * Call this when user updates their privacy preferences
 *
 * @param consent - New consent settings
 *
 * @example
 * ```typescript
 * // User accepted analytics cookies
 * updateConsent({ analytics_storage: 'granted' });
 *
 * // User rejected all
 * updateConsent({
 *   analytics_storage: 'denied',
 *   ad_storage: 'denied',
 * });
 * ```
 */
export function updateConsent(consent: ConsentSettings): void {
  if (setConsentFn) {
    setConsentFn(consent as Record<string, string>);
  }
}
