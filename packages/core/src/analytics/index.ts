/**
 * @fileoverview Analytics Module Barrel Export
 * @module @nxt1/core/analytics
 *
 * Platform-agnostic analytics abstractions for web and mobile.
 * Supports Google Analytics 4 (GA4), Firebase Analytics, and custom providers.
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Your Application                             │
 * │  import { createWebAnalyticsAdapter, APP_EVENTS }              │
 * │  const analytics = createWebAnalyticsAdapter(config);          │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                  AnalyticsAdapter Interface                     │
 * │  trackEvent() | trackPageView() | setUserId() | ...            │
 * ├───────────────┬─────────────────┬───────────────────────────────┤
 * │ Web (gtag.js) │ Capacitor (FB)  │ Memory (SSR/Test)            │
 * └───────────────┴─────────────────┴───────────────────────────────┘
 * ```
 *
 * @example Web Application
 * ```typescript
 * import {
 *   createWebAnalyticsAdapter,
 *   APP_EVENTS,
 *   type AuthSignedUpEvent,
 * } from '@nxt1/core/analytics';
 *
 * const analytics = createWebAnalyticsAdapter({
 *   measurementId: 'G-XXXXXXXXXX',
 *   debug: true,
 * });
 *
 * // Type-safe event tracking
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
 *   method: 'email',
 *   user_type: 'athlete',
 * } satisfies AuthSignedUpEvent);
 * ```
 *
 * @example Mobile Application (Capacitor)
 * ```typescript
 * import {
 *   createCapacitorAnalyticsAdapter,
 *   APP_EVENTS,
 * } from '@nxt1/core/analytics';
 *
 * const analytics = await createCapacitorAnalyticsAdapter({
 *   platform: 'ios',
 *   debug: false,
 * });
 *
 * analytics.trackEvent(APP_EVENTS.APP_OPENED, {
 *   launch_type: 'cold',
 * });
 * ```
 *
 * @example Platform Detection
 * ```typescript
 * import {
 *   createWebAnalyticsAdapter,
 *   createCapacitorAnalyticsAdapter,
 *   createMemoryAnalyticsAdapter,
 *   isCapacitor,
 * } from '@nxt1/core';
 *
 * async function createAnalytics() {
 *   if (typeof window === 'undefined') {
 *     // SSR - use memory adapter
 *     return createMemoryAnalyticsAdapter();
 *   }
 *   if (isCapacitor()) {
 *     // Native mobile - use Firebase
 *     return createCapacitorAnalyticsAdapter({ platform: 'ios' });
 *   }
 *   // Web - use gtag.js
 *   return createWebAnalyticsAdapter({ measurementId: 'G-XXXXXXXXXX' });
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// ADAPTER INTERFACE
// ============================================
export {
  type AnalyticsAdapter,
  type AnalyticsConfig,
  type UserProperties,
  DEFAULT_ANALYTICS_CONFIG,
  isAnalyticsReady,
} from './analytics-adapter';

// ============================================
// EVENT CONSTANTS & TYPES
// ============================================
export {
  // Event name constants
  APP_EVENTS,
  type AppEventName,

  // Event categories
  EVENT_CATEGORIES,
  type EventCategory,

  // Common types
  type TrafficSource,
  type ViewerType,
  type DeviceType,
  type ContentType,
  type AuthMethod,
  type PlanType,

  // Base event properties
  type BaseEventProperties,

  // Helper functions
  getEventCategory,
} from './events';

// ============================================
// EVENT SCHEMAS (Type-safe payloads)
// ============================================
export {
  // Auth events
  type AuthSignedUpEvent,
  type AuthSignedInEvent,
  type AuthSignedOutEvent,
  type AuthErrorEvent,

  // Onboarding events
  type OnboardingStartedEvent,
  type OnboardingStepEvent,
  type OnboardingCompletedEvent,

  // Profile events
  type ProfileViewedEvent,
  type ProfileEditedEvent,
  type ProfileSharedEvent,

  // Video events
  type VideoViewedEvent,
  type VideoPlayedEvent,
  type VideoCompletedEvent,
  type VideoSharedEvent,

  // Post events
  type PostViewedEvent,
  type PostCreatedEvent,

  // Engagement events
  type UserFollowedEvent,
  type ReactionAddedEvent,
  type CommentAddedEvent,

  // Search events
  type SearchPerformedEvent,
  type SearchResultClickedEvent,

  // Subscription events
  type SubscriptionStartedEvent,
  type SubscriptionChangedEvent,
  type CreditsUsedEvent,

  // AI events
  type AITaskEvent,

  // Error events
  type ErrorOccurredEvent,

  // Navigation events
  type ScreenViewedEvent,

  // Lifecycle events
  type SessionEvent,
  type AppOpenedEvent,

  // Type helpers
  type EventPayloadMap,
  type EventPayload,
} from './event-schemas';

// ============================================
// WEB ADAPTER (gtag.js / GA4)
// ============================================
export {
  createWebAnalyticsAdapter,
  webAnalytics,
  createNxt1WebAnalytics,
  NXT1_MEASUREMENT_ID,
} from './web-analytics';

// ============================================
// MOBILE ADAPTER (Firebase Analytics for iOS/Android)
// ============================================
export {
  createMobileAnalyticsAdapter,
  createMobileAnalyticsAdapterSync,
  // Deprecated aliases (use mobile* instead)
  createCapacitorAnalyticsAdapter,
  createCapacitorAnalyticsAdapterSync,
} from './mobile-analytics';

// ============================================
// MEMORY ADAPTER (SSR / Testing)
// ============================================
export {
  createMemoryAnalyticsAdapter,
  memoryAnalytics,
  type MemoryAnalyticsAdapter,
  type TrackedEvent,
} from './memory-analytics';
