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

// Agent X Background Job Service (enqueue AI jobs via BullMQ)

// ============================================
// PERFORMANCE MONITORING
// ============================================

/**
 * Performance monitoring service for Firebase Performance.
 * Use the `trace()` method to wrap any async operation for automatic tracing.
 *
 * @example Basic Usage
 * ```typescript
 * import { PerformanceService } from '@nxt1/web/core/services';
 * import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';
 *
 * @Injectable()
 * export class PostService {
 *   private readonly performance = inject(PerformanceService);
 *   private readonly api = inject(CreatePostApiService);
 *
 *   async createPost(data: CreatePostRequest) {
 *     return this.performance.trace(
 *       TRACE_NAMES.POST_CREATE,
 *       () => this.api.createPost(data),
 *       {
 *         attributes: {
 *           [ATTRIBUTE_NAMES.FEATURE_NAME]: 'create_post',
 *           post_type: data.type,
 *         },
 *         onSuccess: async (result, trace) => {
 *           await trace.putMetric('xp_earned', result.xpEarned?.totalXp || 0);
 *         }
 *       }
 *     );
 *   }
 * }
 * ```
 *
 * @example Component Usage
 * ```typescript
 * export class CreatePostComponent {
 *   private readonly performance = inject(PerformanceService);
 *   private readonly api = inject(CreatePostApiService);
 *
 *   async handleSubmit(data: CreatePostRequest) {
 *     // Trace the operation
 *     const result = await this.performance.trace(
 *       'post_create',
 *       () => this.api.createPost(data)
 *     );
 *     return result;
 *   }
 * }
 * ```
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
