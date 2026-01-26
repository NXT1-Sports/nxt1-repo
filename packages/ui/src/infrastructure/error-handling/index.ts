/**
 * @fileoverview Error Handling Module Exports
 * @module @nxt1/ui/infrastructure/error-handling
 *
 * Provides GlobalErrorHandler with optional Crashlytics integration.
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * import {
 *   GlobalErrorHandler,
 *   GLOBAL_ERROR_LOGGER,
 *   GLOBAL_CRASHLYTICS,
 * } from '@nxt1/ui';
 * import { CrashlyticsService } from './services/crashlytics.service';
 *
 * providers: [
 *   { provide: GLOBAL_ERROR_LOGGER, useExisting: NxtLoggingService },
 *   { provide: GLOBAL_CRASHLYTICS, useExisting: CrashlyticsService },
 *   { provide: ErrorHandler, useClass: GlobalErrorHandler },
 * ]
 * ```
 */

export * from './global-error-handler';
