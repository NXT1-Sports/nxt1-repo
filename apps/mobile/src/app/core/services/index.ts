/**
 * Core Services Barrel Export
 *
 * Re-exports all core services for clean imports.
 *
 * @module @nxt1/mobile/core/services
 */

// Profile Service (Business logic root)
export {
  ProfileService,
  type IProfileService,
  type ProfileLoadingState,
} from './state/profile.service';

// API Adapters
export { ActivityApiService } from './api/activity-api.service';
export { HelpCenterApiService } from './api/help-center-api.service';
export { EditProfileApiService } from './api/edit-profile-api.service';
export { MobileEmailConnectionService } from './api/email-connection.service';
export { ProfileApiService } from './api/profile-api.service';
export { SettingsApiService } from './api/settings-api.service';
export { TeamProfileApiService } from './api/team-profile-api.service';

// Native Services
export { DeepLinkService, type DeepLinkEvent } from './native/deep-link.service';
export { FcmRegistrationService } from './native/fcm-registration.service';
export {
  IapService,
  IAP_PRODUCT_IDS,
  IAP_CREDIT_MAP,
  type IapProductId,
  type IapProductDisplay,
} from './native/iap.service';
export {
  NativeAppService,
  type StatusBarStyle,
  type StatusBarConfig,
  type NativeAppConfig,
  type AppLifecycleEvent,
  type AppLifecycleHandler,
} from './native/native-app.service';
export { NativeBadgeService } from './native/native-badge.service';
export { PushHandlerService } from './native/push-handler.service';
export {
  ShareService,
  type ShareResultData,
  type ShareContentOptions,
} from './native/share.service';

// Infrastructure Services
export { AnalyticsService } from './infrastructure/analytics.service';
export { MobileCacheService } from './infrastructure/cache.service';
export { CrashlyticsService } from './infrastructure/crashlytics.service';
export { NetworkService } from './infrastructure/network.service';
export { PerformanceService } from './infrastructure/performance.service';
