/**
 * Core Infrastructure Barrel Export
 *
 * Re-exports all infrastructure services for clean imports:
 * - HTTP adapters (Capacitor/Fetch)
 * - Error handling (shared with web)
 * - Firebase services
 *
 * @module @nxt1/mobile/core/infrastructure
 */

// HTTP
export { CapacitorHttpAdapter } from './http/capacitor-http-adapter.service';

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
