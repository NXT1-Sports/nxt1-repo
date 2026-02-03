/**
 * Core Services Barrel Export
 *
 * Re-exports all core services for clean imports.
 *
 * @module @nxt1/mobile/core/services
 */

// ============================================
// PROFILE SERVICE (User data - Single Source of Truth)
// ============================================
export { ProfileService, type IProfileService, type ProfileLoadingState } from './profile.service';
export { ProfileApiService } from './profile-api.service';

// ============================================
// NATIVE SERVICES
// ============================================

// Native app initialization & lifecycle
export {
  NativeAppService,
  type StatusBarStyle,
  type StatusBarConfig,
  type NativeAppConfig,
  type AppLifecycleEvent,
  type AppLifecycleHandler,
} from './native-app.service';

// Analytics service
export { AnalyticsService } from './analytics.service';

// Deep link handling (Universal Links / App Links)
export { DeepLinkService, type DeepLinkEvent } from './deep-link.service';

// Two-tier caching (memory + persistent)
export { MobileCacheService } from './cache.service';

// Network connectivity monitoring (Capacitor Network plugin)
export { NetworkService } from './network.service';

// Crashlytics for native crash reporting (Capacitor Firebase)
export { CrashlyticsService } from './crashlytics.service';

// Share service for native social sharing
export { ShareService, type ShareResultData, type ShareContentOptions } from './share.service';

// Keyboard management for iOS/Android
export { KeyboardService } from './keyboard.service';
