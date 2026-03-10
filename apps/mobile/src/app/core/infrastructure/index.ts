/**
 * Core Infrastructure Barrel Export
 *
 * Re-exports all infrastructure services for clean imports:
 * - HTTP adapters (Capacitor/Fetch)
 * - Error handling (shared with web)
 * - Storage adapters (native)
 * - Firebase services
 *
 * @module @nxt1/mobile/core/infrastructure
 */

// HTTP
export { CapacitorHttpAdapter, type TokenProvider } from './http/capacitor-http-adapter.service';

// Storage (native - uses static Capacitor imports)
export { createNativeStorageAdapter } from './native-storage.adapter';

// Error Handling (shared with web via re-exports)
export {
  GlobalErrorHandler,
  type ErrorSeverity,
  ERROR_MESSAGES,
} from './error-handling/global-error-handler';

export {
  httpErrorInterceptor,
  type HttpErrorInterceptorOptions,
} from './interceptors/error.interceptor';

// Auth (mobile-specific — adds Firebase token to HttpClient requests)
export { mobileAuthInterceptor } from './interceptors/auth.interceptor';
