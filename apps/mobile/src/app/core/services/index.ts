/**
 * Core Services Barrel Export
 *
 * Re-exports all core services for clean imports.
 *
 * @module @nxt1/mobile/core/services
 */

// Profile Service (Business logic root)
export { ProfileService } from './state/profile.service';

// API Adapters
export { ActivityApiService } from './api/activity-api.service';
export { FeedEngagementApiService } from './api/feed-engagement-api.service';
export { HelpCenterApiService } from './api/help-center-api.service';
export { EditProfileApiService } from './api/edit-profile-api.service';
export { MobileEmailConnectionService } from './api/email-connection.service';
export { SettingsApiService } from './api/settings-api.service';

// Native Services
export { DeepLinkService } from './native/deep-link.service';
export { FcmRegistrationService } from './native/fcm-registration.service';
export { IapService } from './native/iap.service';
export { NativeAppService } from './native/native-app.service';
export { LiveUpdateService } from './native/live-update.service';
export { NativeBadgeService } from './native/native-badge.service';
export { PushHandlerService } from './native/push-handler.service';

// Infrastructure Services
export { AnalyticsService } from './infrastructure/analytics.service';
export { CrashlyticsService } from './infrastructure/crashlytics.service';
export { NetworkService } from './infrastructure/network.service';
export { PerformanceService } from './infrastructure/performance.service';
