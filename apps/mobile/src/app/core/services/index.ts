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
  type KeyboardConfig,
  type KeyboardResizeMode,
  type NativeAppConfig,
  type AppLifecycleEvent,
  type AppLifecycleHandler,
} from './native-app.service';

// Two-tier caching (memory + persistent)
export { MobileCacheService } from './cache.service';

// Theme management
export { ThemeService } from './theme.service';

// Share service for native social sharing
export { ShareService, type ShareResultData, type ShareContentOptions } from './share.service';
