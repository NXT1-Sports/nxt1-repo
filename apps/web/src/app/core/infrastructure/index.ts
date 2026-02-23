/**
 * Core Infrastructure Barrel Export
 *
 * Re-exports all infrastructure services for clean imports:
 * - HTTP adapters
 * - HTTP caching
 * - HTTP error handling (from @nxt1/ui)
 * - Global error handling (from @nxt1/ui)
 * - Auth interceptor
 *
 * @module @nxt1/web/core/infrastructure
 */

// HTTP
export { AngularHttpAdapter } from './http/angular-http-adapter.service';

// HTTP File Upload (extends AngularHttpAdapter with FormData support)
export { AngularFileUploadAdapter } from './http/angular-file-upload-adapter.service';

// HTTP Cache (app-specific)
export {
  httpCacheInterceptor,
  clearHttpCache,
  getHttpCacheStats,
  preloadHttpCache,
  type HttpCacheInterceptorOptions,
} from './http/cache.interceptor';

// Auth Interceptor - adds Firebase token to API requests
export { authInterceptor } from './interceptors/auth.interceptor';

// HTTP Error Interceptor - re-export from @nxt1/ui
export { httpErrorInterceptor, type HttpErrorInterceptorOptions } from '@nxt1/ui/infrastructure';

// Global Error Handling - re-export from @nxt1/ui
export { GlobalErrorHandler, type ErrorSeverity, ERROR_MESSAGES } from '@nxt1/ui/infrastructure';
