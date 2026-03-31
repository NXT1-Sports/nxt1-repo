/**
 * Core Services Barrel Export
 *
 * @module @nxt1/web/core/services
 *
 * Analytics has been moved to @nxt1/core/analytics for cross-platform consistency.
 *
 * @example Analytics Usage
 * ```typescript
 * import { createAnalyticsSync, APP_EVENTS } from '@nxt1/core/analytics';
 * import { environment } from '../environments/environment';
 *
 * const analytics = createAnalyticsSync({
 *   firebaseConfig: environment.firebase,
 *   debug: !environment.production,
 * });
 *
 * analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, { method: 'google' });
 * ```
 */

// Re-export analytics constants for backward compatibility
export { APP_EVENTS } from '@nxt1/core/analytics';

// Core Analytics Service (Firebase Analytics wrapper)
export { AnalyticsService } from './analytics.service';

// SEO Service for dynamic meta tag management
export { SeoService } from './seo.service';

// Network Service for connectivity monitoring
export { NetworkService } from './network.service';

// File Upload Service (backend-first pattern via @nxt1/core API)
export { FileUploadService, type UploadStatus, type UploadState } from './file-upload.service';

// Crashlytics Service for crash reporting (web uses GA4 fallback)
export { CrashlyticsService } from './crashlytics.service';

// Share Service for centralized web sharing + analytics
export { ShareService } from './share.service';

// Edit Profile API Service for persisting user profile data
export { EditProfileApiService } from './edit-profile-api.service';

// Profile Page Actions Bus (lets web-shell top-nav buttons trigger profile actions)
export { ProfilePageActionsService } from './profile-page-actions.service';

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
export { PerformanceService } from './performance.service';

// ============================================
// BADGE COUNT SERVICE
// ============================================

/**
 * Lightweight badge count service for the app shell.
 * Used by WebShellComponent instead of importing ActivityService directly.
 * Feature services (ActivityService, MessagesService) write to this via the badge bridge.
 *
 * @see {@link ./badge-count.service.ts}
 * @see {@link ./badge-bridge.initializer.ts}
 */
export { BadgeCountService } from './badge-count.service';

/**
 * Badge bridge initializer — connects ActivityService (from @nxt1/ui) → BadgeCountService.
 * Register in app.config.ts: `provideBadgeBridge()`
 */
export { provideBadgeBridge } from './badge-bridge.initializer';

// ============================================
// FEED API SERVICE
// ============================================

/**
 * Angular adapter for the pure TypeScript Feed API factory.
 * Wraps createFeedApi with HttpClient and Firebase Performance tracing.
 *
 * Wired at root via `{ provide: FEED_API, useExisting: FeedApiService }`
 * so the shared FeedService (from @nxt1/ui/feed) resolves it.
 *
 * @see {@link ./feed-api.service.ts}
 */
export { FeedApiService, FEED_API_BASE_URL } from './feed-api.service';
