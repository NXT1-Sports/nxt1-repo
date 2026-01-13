/**
 * @fileoverview Analytics Module Barrel Export
 * @module @nxt1/core/analytics
 *
 * Production-grade, platform-agnostic analytics for NXT1.
 * Uses Firebase Analytics across all platforms for unified tracking.
 *
 * Architecture (2026 Best Practice):
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Your Application                             │
 * │  import { createAnalytics, FIREBASE_EVENTS } from '@nxt1/core/analytics'
 * │  const analytics = await createAnalytics(config);              │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                  AnalyticsAdapter Interface                     │
 * │  trackEvent() | trackPageView() | setUserId() | ...            │
 * ├───────────────┬─────────────────┬───────────────────────────────┤
 * │ Web (FB SDK)  │ iOS/Android (FB)│ Memory (SSR/Test)            │
 * │ Firebase JS   │ Capacitor Plugin│ No-op for SSR                │
 * └───────────────┴─────────────────┴───────────────────────────────┘
 * ```
 *
 * ⭐ RECOMMENDED: Use FIREBASE_EVENTS for standard tracking ⭐
 * ⭐ Use APP_EVENTS for NXT1-specific custom tracking ⭐
 *
 * @example Firebase Recommended Events (Best Practice)
 * ```typescript
 * import {
 *   createAnalytics,
 *   FIREBASE_EVENTS,
 *   USER_PROPERTIES,
 * } from '@nxt1/core/analytics';
 *
 * const analytics = await createAnalytics({
 *   firebaseConfig: environment.firebase,
 *   debug: !environment.production,
 * });
 *
 * // ✅ Use Firebase recommended events for pre-built GA4 reports
 * analytics.trackEvent(FIREBASE_EVENTS.SIGN_UP, { method: 'email' });
 * analytics.trackEvent(FIREBASE_EVENTS.LOGIN, { method: 'google' });
 * analytics.trackEvent(FIREBASE_EVENTS.PURCHASE, {
 *   transaction_id: 'T_12345',
 *   value: 9.99,
 *   currency: 'USD',
 * });
 *
 * // Set user properties for segmentation
 * analytics.setUserProperties({
 *   [USER_PROPERTIES.USER_TYPE]: 'athlete',
 *   [USER_PROPERTIES.SPORT]: 'football',
 *   [USER_PROPERTIES.SUBSCRIPTION_TIER]: 'pro',
 * });
 * ```
 *
 * @example Custom NXT1 Events
 * ```typescript
 * import { createAnalytics, APP_EVENTS } from '@nxt1/core/analytics';
 *
 * // Use custom events for NXT1-specific features
 * analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED, {
 *   profile_id: 'abc123',
 *   viewer_type: 'coach',
 * });
 *
 * analytics.trackEvent(APP_EVENTS.VIDEO_UPLOADED, {
 *   video_type: 'highlight',
 *   duration_seconds: 45,
 * });
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// ⭐ UNIVERSAL ANALYTICS (RECOMMENDED) ⭐
// Auto-detects platform and uses correct adapter
// ============================================
export {
  createAnalytics,
  createAnalyticsSync,
  detectPlatform,
  isNativeApp,
  type Platform,
  type UniversalAnalyticsConfig,
} from './universal-analytics';

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
  // ⭐ Firebase Recommended Events (use these first!)
  FIREBASE_EVENTS,
  type FirebaseEventName,

  // Firebase Event Parameter Types
  type SignUpEventParams,
  type LoginEventParams,
  type ShareEventParams,
  type SearchEventParams,
  type SelectContentEventParams,
  type JoinGroupEventParams,
  type AnalyticsItem,
  type PurchaseEventParams,
  type BeginCheckoutEventParams,
  type GenerateLeadEventParams,
  type ViewItemEventParams,
  type ExceptionEventParams,

  // Custom NXT1 Event Constants
  APP_EVENTS,
  type AppEventName,

  // ⭐ User Properties (for segmentation & audiences)
  USER_PROPERTIES,
  type UserPropertyName,
  type UserPropertiesMap,

  // Event categories
  EVENT_CATEGORIES,
  type EventCategory,

  // Common types
  type TrafficSource,
  type UserRole,
  type DeviceType,
  type ContentType,
  type AuthMethod,
  type PlanType,

  // Base event properties
  type BaseEventProperties,

  // Helper functions
  getEventCategory,
  isFirebaseEvent,
  getFirebaseEquivalent,
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
// ⭐ FIREBASE ANALYTICS (RECOMMENDED) ⭐
// Production-grade adapter using Firebase JS SDK
// Same backend as mobile - unified analytics
// ============================================
export {
  createFirebaseAnalyticsAdapter,
  createFirebaseAnalyticsAdapterSync,
  updateConsent,
  type FirebaseConfig,
  type FirebaseAnalyticsConfig,
  type ConsentSettings,
} from './firebase-analytics';

// ============================================
// WEB ADAPTER (gtag.js / GA4) - LEGACY
// Consider using createFirebaseAnalyticsAdapter instead
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
