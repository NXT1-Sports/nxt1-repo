/**
 * @fileoverview Universal Analytics Factory
 * @module @nxt1/core/analytics
 *
 * Production-grade factory for creating the appropriate analytics adapter
 * based on the runtime environment. Handles all platform detection automatically.
 *
 * ⭐ SINGLE ENTRY POINT FOR ALL ANALYTICS ⭐
 *
 * @example
 * ```typescript
 * import { createAnalytics, APP_EVENTS } from '@nxt1/core/analytics';
 * import { environment } from './environments/environment';
 *
 * // Automatically picks the right adapter
 * const analytics = await createAnalytics({
 *   firebaseConfig: environment.firebase,
 *   debug: !environment.production,
 * });
 *
 * // Same API everywhere
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: 'google' });
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { AnalyticsAdapter, AnalyticsConfig } from './analytics-adapter';
import type { FirebaseConfig, ConsentSettings } from './firebase-analytics';
import {
  createFirebaseAnalyticsAdapter,
  createFirebaseAnalyticsAdapterSync,
} from './firebase-analytics';
import { createMobileAnalyticsAdapter, createMobileAnalyticsAdapterSync } from './mobile-analytics';
import { createMemoryAnalyticsAdapter } from './memory-analytics';

// ============================================
// PLATFORM DETECTION
// ============================================

/**
 * Detected runtime platform
 */
export type Platform = 'web' | 'ios' | 'android' | 'server' | 'unknown';

/**
 * Detect current runtime platform
 */
export function detectPlatform(): Platform {
  // Server-side (SSR)
  if (typeof window === 'undefined') {
    return 'server';
  }

  // Capacitor native app
  // @ts-expect-error Capacitor global
  if (typeof window.Capacitor !== 'undefined') {
    // @ts-expect-error Capacitor global
    const platform = window.Capacitor?.getPlatform?.();
    if (platform === 'ios') return 'ios';
    if (platform === 'android') return 'android';
    // Capacitor web (browser testing)
    return 'web';
  }

  // Standard web browser
  return 'web';
}

/**
 * Check if running in a Capacitor native app
 */
export function isNativeApp(): boolean {
  const platform = detectPlatform();
  return platform === 'ios' || platform === 'android';
}

// ============================================
// UNIVERSAL ANALYTICS CONFIG
// ============================================

/**
 * Universal analytics configuration
 * Works across all platforms
 */
export interface UniversalAnalyticsConfig extends AnalyticsConfig {
  /** Firebase configuration (required for web and helps mobile auto-config) */
  firebaseConfig: FirebaseConfig;
  /** Consent settings for GDPR compliance */
  consentMode?: ConsentSettings;
}

// ============================================
// UNIVERSAL ANALYTICS FACTORY
// ============================================

/**
 * Create the appropriate analytics adapter for the current platform
 *
 * Automatically detects:
 * - Server (SSR) → Memory adapter (no-op)
 * - iOS/Android native → Capacitor Firebase Analytics
 * - Web browser → Firebase JS SDK
 *
 * @param config - Universal analytics configuration
 * @returns Promise<AnalyticsAdapter>
 *
 * @example
 * ```typescript
 * const analytics = await createAnalytics({
 *   firebaseConfig: environment.firebase,
 *   debug: !environment.production,
 * });
 *
 * // Works the same on all platforms
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: 'email' });
 * analytics.setUserId(user.uid);
 * ```
 */
export async function createAnalytics(config: UniversalAnalyticsConfig): Promise<AnalyticsAdapter> {
  const platform = detectPlatform();

  switch (platform) {
    case 'server':
      // SSR - use memory adapter (no-op)
      return createMemoryAnalyticsAdapter({ enabled: false });

    case 'ios':
    case 'android':
      // Native mobile - use Capacitor Firebase Analytics
      return createMobileAnalyticsAdapter({
        ...config,
        platform,
      });

    case 'web':
    default:
      // Web browser - use Firebase JS SDK
      return createFirebaseAnalyticsAdapter({
        ...config,
        platform: 'web',
      });
  }
}

/**
 * Create analytics adapter synchronously (lazy initialization)
 *
 * Use this when you need an adapter immediately (e.g., in constructors)
 * The actual Firebase initialization happens lazily on first use.
 *
 * @param config - Universal analytics configuration
 * @returns AnalyticsAdapter (initializes lazily)
 *
 * @example
 * ```typescript
 * // In a service constructor
 * private analytics = createAnalyticsSync({
 *   firebaseConfig: environment.firebase,
 * });
 * ```
 */
export function createAnalyticsSync(config: UniversalAnalyticsConfig): AnalyticsAdapter {
  const platform = detectPlatform();

  switch (platform) {
    case 'server':
      return createMemoryAnalyticsAdapter({ enabled: false });

    case 'ios':
    case 'android':
      return createMobileAnalyticsAdapterSync({
        ...config,
        platform,
      });

    case 'web':
    default:
      return createFirebaseAnalyticsAdapterSync({
        ...config,
        platform: 'web',
      });
  }
}

// ============================================
// CONVENIENCE RE-EXPORTS
// ============================================

// Re-export everything needed for analytics
export { APP_EVENTS, type AppEventName } from './events';
export type { AnalyticsAdapter, UserProperties } from './analytics-adapter';
export type { FirebaseConfig, ConsentSettings } from './firebase-analytics';
export { updateConsent } from './firebase-analytics';
