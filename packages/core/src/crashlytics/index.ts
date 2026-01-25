/**
 * @fileoverview Crashlytics Module Barrel Export
 * @module @nxt1/core/crashlytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Enterprise-grade crash reporting for NXT1 monorepo.
 * Uses Firebase Crashlytics on native platforms and
 * Google Analytics 4 exception events on web.
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Your Application                             │
 * │  import { CrashlyticsAdapter, CRASH_KEYS } from '@nxt1/core/crashlytics'
 * ├─────────────────────────────────────────────────────────────────┤
 * │                  CrashlyticsAdapter Interface                   │
 * │  recordException() | addBreadcrumb() | setCustomKey() | ...    │
 * ├───────────────┬─────────────────┬───────────────────────────────┤
 * │ Mobile (Native)│ Web (GA4)      │ SSR/Test (No-op/Memory)      │
 * │ @capacitor-    │ gtag exception │ In-memory or silent          │
 * │ firebase/      │ events         │                              │
 * │ crashlytics    │                │                              │
 * └───────────────┴─────────────────┴───────────────────────────────┘
 * ```
 *
 * @example Mobile (Capacitor)
 * ```typescript
 * // apps/mobile/src/app/services/crashlytics.service.ts
 * import { CrashlyticsAdapter } from '@nxt1/core/crashlytics';
 * import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
 *
 * @Injectable({ providedIn: 'root' })
 * export class CrashlyticsService implements CrashlyticsAdapter {
 *   async recordException(exception) {
 *     await FirebaseCrashlytics.recordException({
 *       message: exception.message,
 *       stacktrace: exception.stacktrace,
 *     });
 *   }
 * }
 * ```
 *
 * @example Web (GA4 Fallback)
 * ```typescript
 * // apps/web/src/app/core/services/crashlytics.service.ts
 * import { CrashlyticsAdapter, GA4_EVENTS } from '@nxt1/core/crashlytics';
 *
 * @Injectable({ providedIn: 'root' })
 * export class CrashlyticsService implements CrashlyticsAdapter {
 *   async recordException(exception) {
 *     gtag('event', GA4_EVENTS.EXCEPTION, {
 *       description: exception.message,
 *       fatal: exception.severity === 'fatal',
 *     });
 *   }
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// TYPES
// ============================================
export type {
  CrashBreadcrumb,
  CrashCategory,
  CrashCustomKeys,
  CrashException,
  CrashlyticsConfig,
  CrashReport,
  CrashSeverity,
  CrashUser,
  BreadcrumbType,
} from './crashlytics.types';

export { DEFAULT_CRASHLYTICS_CONFIG } from './crashlytics.types';

// ============================================
// ADAPTER INTERFACE & IMPLEMENTATIONS
// ============================================
export type { CrashlyticsAdapter, MemoryCrashlyticsAdapter } from './crashlytics-adapter';

export {
  createNoOpCrashlyticsAdapter,
  createMemoryCrashlyticsAdapter,
} from './crashlytics-adapter';

// ============================================
// CONSTANTS & UTILITIES
// ============================================
export {
  CRASH_KEYS,
  type CrashKeyName,
  ERROR_CATEGORIES,
  HTTP_SEVERITY_MAP,
  getSeverityForStatus,
  BREADCRUMB_LIMITS,
  SENSITIVE_KEYS,
  isSensitiveKey,
  maskSensitiveData,
  GA4_EVENTS,
} from './crashlytics.constants';

// ============================================
// UNIFIED APP ERROR CONTRACT
// ============================================
export type { AppError, AppErrorContext, AppErrorSource, CreateAppErrorOptions } from './app-error';

export {
  createAppError,
  createHttpAppError,
  createNavigationAppError,
  createComponentAppError,
  isAppError,
} from './app-error';

// ============================================
// PII SCRUBBER (GDPR/CCPA COMPLIANCE)
// ============================================
export {
  PII_PATTERNS,
  SENSITIVE_KEY_PATTERNS,
  PARTIAL_MASK_KEYS,
  isSensitiveKeyName,
  shouldPartialMask,
  maskEmail,
  maskPhone,
  scrubString,
  scrubObject,
  scrubError,
  scrubStackTrace,
  scrubAppErrorContext,
  createScrubber,
  type ScrubberConfig,
} from './pii-scrubber';
