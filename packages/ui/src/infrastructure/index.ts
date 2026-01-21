/**
 * @fileoverview Infrastructure Module Exports
 * @module @nxt1/ui/infrastructure
 *
 * This module provides Angular infrastructure services and interceptors
 * that are shared across web and mobile applications.
 *
 * @example
 * ```typescript
 * import {
 *   GlobalErrorHandler,
 *   httpErrorInterceptor
 * } from '@nxt1/ui/infrastructure';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     { provide: ErrorHandler, useClass: GlobalErrorHandler },
 *     provideHttpClient(
 *       withInterceptors([httpErrorInterceptor()])
 *     ),
 *   ],
 * };
 * ```
 */

// Error Handling
export * from './error-handling';

// HTTP Interceptors
export * from './interceptors';
