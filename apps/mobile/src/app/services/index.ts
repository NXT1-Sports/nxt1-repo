/**
 * Mobile app services barrel export
 * @module @nxt1/mobile/services
 *
 * @deprecated This folder is deprecated. Import from core/services instead.
 * Re-exports from core/services for backwards compatibility.
 *
 * Will be removed in v3.0.0 - update imports to:
 * - Core services: import from '../core/services'
 * - Auth services: import from '../features/auth/services'
 */

// Core services - re-export for backwards compatibility
export {
  NativeAppService,
  type StatusBarStyle,
  type StatusBarConfig,
  type NativeAppConfig,
  type AppLifecycleEvent,
  type AppLifecycleHandler,
  NetworkService,
  CrashlyticsService,
} from '../core/services';

// Auth services - re-export for backwards compatibility
export { BiometricService, type BiometricType } from '../features/auth/services';
