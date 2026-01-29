/**
 * Core Services Barrel Export
 *
 * Re-exports all core services for clean imports.
 *
 * @module @nxt1/mobile/core/services
 */

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

// Two-tier caching (memory + persistent)
export { MobileCacheService } from './cache.service';

// Theme management - use NxtThemeService from @nxt1/ui instead
// (Theme service was consolidated to shared package)

// Share service for native social sharing
export { ShareService, type ShareResultData, type ShareContentOptions } from './share.service';

// Keyboard management for iOS/Android
export { KeyboardService } from './keyboard.service';
