/**
 * Core Infrastructure Barrel Export
 *
 * Re-exports all infrastructure services for clean imports:
 * - HTTP adapters
 * - HTTP caching
 * - HTTP error handling (from @nxt1/ui)
 * - Global error handling (from @nxt1/ui)
 *
 * @module @nxt1/web/core/infrastructure
 */

// HTTP
export { AngularHttpAdapter } from './http/angular-http-adapter.service';

// HTTP Cache (app-specific)
export {
  httpCacheInterceptor,
  clearHttpCache,
  getHttpCacheStats,
  preloadHttpCache,
  type HttpCacheInterceptorOptions,
} from './http/cache.interceptor';

// HTTP Error Interceptor - re-export from @nxt1/ui
export { httpErrorInterceptor, type HttpErrorInterceptorOptions } from '@nxt1/ui';

// Global Error Handling - re-export from @nxt1/ui
export { GlobalErrorHandler, type ErrorSeverity, ERROR_MESSAGES } from '@nxt1/ui';
