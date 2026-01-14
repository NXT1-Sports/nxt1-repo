/**
 * Core Infrastructure Barrel Export
 *
 * Re-exports all infrastructure services for clean imports:
 * - HTTP adapters
 * - HTTP caching
 * - Firebase services
 * - Error handling
 *
 * @module @nxt1/web/core/infrastructure
 */

// HTTP
export { AngularHttpAdapter } from './http/angular-http-adapter.service';

// HTTP Cache
export {
  httpCacheInterceptor,
  clearHttpCache,
  getHttpCacheStats,
  preloadHttpCache,
  type HttpCacheInterceptorOptions,
} from './http/cache.interceptor';
