/**
 * Core Services Barrel Export
 *
 * @module @nxt1/web/core/services
 *
 * Analytics is handled through the shared analytics abstractions and the web
 * backend relay service for cross-platform consistency.
 *
 * @example Analytics Usage
 * ```typescript
 * import { APP_EVENTS } from '@nxt1/core/analytics';
 *
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: 'google' });
 * ```
 */

// Re-export analytics constants for backward compatibility
export { APP_EVENTS } from '@nxt1/core/analytics';

// Core Analytics Service (backend relay adapter)
export { AnalyticsService } from './infrastructure/analytics.service';

// SEO Service for dynamic meta tag management
export { SeoService } from './web/seo.service';

// Web Push Service
export { WebPushService, provideWebPush } from './web/web-push.service';

// Network Service for connectivity monitoring
export { NetworkService } from './infrastructure/network.service';

// File Upload Service (backend-first pattern via @nxt1/core API)
export { FileUploadService, type UploadStatus, type UploadState } from './web/file-upload.service';

// Crashlytics Service for crash telemetry (web uses backend relay fallback)
export { CrashlyticsService } from './infrastructure/crashlytics.service';

// Share Service for centralized web sharing + analytics
export { ShareService } from './web/share.service';

// Edit Profile API Service for persisting user profile data
export { EditProfileApiService } from './api/edit-profile-api.service';

// Web Vitals service
export { WebVitalsService } from './infrastructure/web-vitals.service';

// Logging
export { LoggingService } from './infrastructure/logging.service';

// Profile Page Actions Bus (lets web-shell top-nav buttons trigger profile actions)
export { ProfilePageActionsService } from './state/profile-page-actions.service';

// Agent X Background Job Service (enqueue AI jobs via BullMQ)

// ============================================
// PERFORMANCE MONITORING
// ============================================

/**
 * Performance monitoring service for Firebase Performance.
 * Use the `trace()` method to wrap any async operation for automatic tracing.
 *
 * @see {@link https://firebase.google.com/docs/perf-mon Firebase Performance}
 * @see {@link ../../../../../../docs/FIREBASE-PERFORMANCE-USAGE-GUIDE.md Usage Guide}
 */
export { PerformanceService } from './infrastructure/performance.service';

// ============================================
// BADGE COUNT SERVICE
// ============================================

/**
 * Lightweight badge count service for the app shell.
 * Used by WebShellComponent instead of importing ActivityService directly.
 * Feature services (ActivityService, MessagesService) write to this via the badge bridge.
 *
 * @see {@link ./state/badge-count.service.ts}
 * @see {@link ./state/badge-bridge.initializer.ts}
 */
export { BadgeCountService } from './state/badge-count.service';

/**
 * Badge bridge initializer — connects ActivityService (from @nxt1/ui) → BadgeCountService.
 * Register in app.config.ts: `provideBadgeBridge()`
 */
export { provideBadgeBridge } from './state/badge-bridge.initializer';

// ============================================
// API ADAPTERS (consolidated from features/)
// ============================================

export { ActivityApiService, ACTIVITY_API_BASE_URL } from './api/activity-api.service';
export { ProfileService } from './api/profile-api.service';
export { HelpCenterApiService } from './api/help-center-api.service';
export { SettingsApiService } from './api/settings-api.service';

// ============================================
// WEB SERVICES (consolidated from features/)
// ============================================

export { WebEmailConnectionService } from './web/email-connection.service';
export { EmailTokensService } from './web/email-tokens.service';
