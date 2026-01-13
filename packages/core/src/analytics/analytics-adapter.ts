/**
 * @fileoverview Analytics Adapter Interface
 * @module @nxt1/core/analytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Platform-agnostic analytics interface that can be implemented by:
 * - Google Analytics 4 (gtag.js) for Web
 * - Firebase Analytics SDK for Capacitor/Native
 * - Mixpanel, Amplitude, or any other analytics provider
 * - Memory adapter for SSR and testing
 *
 * This abstraction enables the same tracking code to work
 * across all platforms without modification.
 *
 * @example Web (gtag.js)
 * ```typescript
 * const analytics = createWebAnalyticsAdapter('G-XXXXXXXXXX');
 * analytics.trackEvent('button_clicked', { button_id: 'signup' });
 * ```
 *
 * @example Capacitor (Firebase Analytics)
 * ```typescript
 * const analytics = await createCapacitorAnalyticsAdapter();
 * analytics.trackEvent('button_clicked', { button_id: 'signup' });
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { AppEventName, BaseEventProperties } from './events';

// ============================================
// ANALYTICS ADAPTER INTERFACE
// ============================================

/**
 * User properties for segmentation
 */
export interface UserProperties {
  /** User's unique ID */
  user_id?: string;
  /** User type/role */
  user_type?: string;
  /** Primary sport */
  sport?: string;
  /** Subscription plan */
  plan?: string;
  /** Whether user is premium */
  is_premium?: boolean;
  /** User's state/region */
  state?: string;
  /** Graduation year */
  class_year?: number;
  /** Team code if associated */
  team_code?: string;
  /** Account creation date */
  signup_date?: string;
  /** Custom properties */
  [key: string]: string | number | boolean | undefined;
}

/**
 * Analytics adapter interface - implemented differently per platform
 */
export interface AnalyticsAdapter {
  /**
   * Track a custom event
   * @param eventName - Event name (use APP_EVENTS constants)
   * @param properties - Event properties
   */
  trackEvent<T extends BaseEventProperties = BaseEventProperties>(
    eventName: AppEventName | string,
    properties?: T
  ): void;

  /**
   * Track a page/screen view
   * @param pagePath - Page path (e.g., '/profile/123')
   * @param pageTitle - Page title (optional)
   * @param properties - Additional properties
   */
  trackPageView(pagePath: string, pageTitle?: string, properties?: Record<string, unknown>): void;

  /**
   * Set user ID for tracking
   * @param userId - User's unique ID (or null to clear)
   */
  setUserId(userId: string | null): void;

  /**
   * Set user properties for segmentation
   * @param properties - User properties to set
   */
  setUserProperties(properties: UserProperties): void;

  /**
   * Clear all user data (call on sign out)
   */
  clearUser(): void;

  /**
   * Check if analytics is initialized
   */
  isInitialized(): boolean;

  /**
   * Get current user ID
   */
  getUserId(): string | null;

  /**
   * Enable/disable analytics collection
   * @param enabled - Whether to enable collection
   */
  setEnabled(enabled: boolean): void;

  /**
   * Set default event parameters (included in all events)
   * @param params - Default parameters
   */
  setDefaultEventParams?(params: Record<string, unknown>): void;

  /**
   * Track timing event (for performance monitoring)
   * @param category - Timing category
   * @param name - Timing name
   * @param value - Time in milliseconds
   */
  trackTiming?(category: string, name: string, value: number): void;

  /**
   * Track exception/error
   * @param description - Error description
   * @param fatal - Whether the error was fatal
   */
  trackException?(description: string, fatal?: boolean): void;
}

// ============================================
// ANALYTICS CONFIGURATION
// ============================================

/**
 * Configuration for analytics adapters
 */
export interface AnalyticsConfig {
  /** GA4 Measurement ID (e.g., 'G-XXXXXXXXXX') */
  measurementId?: string;
  /** Debug mode - logs events instead of sending */
  debug?: boolean;
  /** Whether analytics is enabled */
  enabled?: boolean;
  /** Default event parameters */
  defaultParams?: Record<string, unknown>;
  /** App version */
  appVersion?: string;
  /** Platform identifier */
  platform?: 'web' | 'ios' | 'android';
}

/**
 * Default analytics configuration
 */
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  debug: false,
  enabled: true,
  platform: 'web',
};

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if analytics adapter is initialized
 */
export function isAnalyticsReady(
  adapter: AnalyticsAdapter | null | undefined
): adapter is AnalyticsAdapter {
  return adapter != null && adapter.isInitialized();
}
