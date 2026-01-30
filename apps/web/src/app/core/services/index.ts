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
