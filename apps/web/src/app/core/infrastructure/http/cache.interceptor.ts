/**
 * @fileoverview HTTP Cache Interceptor
 * @module @nxt1/web/core/infrastructure/http
 *
 * Production-grade HTTP response caching interceptor.
 *
 * Features:
 * - LRU cache for GET requests
 * - Configurable TTL per URL pattern
 * - Stale-while-revalidate support
 * - Cache bypass headers
 * - Statistics tracking
 * - SSR-safe (no-op on server)
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * provideHttpClient(
 *   withInterceptors([httpCacheInterceptor()])
 * )
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
  HttpHandlerFn,
  HttpEvent,
} from '@angular/common/http';
import { Observable, tap, shareReplay, finalize } from 'rxjs';

import {
  createLRUCache,
  CACHE_CONFIG,
  CACHE_KEYS,
  generateCacheKey,
  type LRUCache,
} from '@nxt1/core/cache';

/**
 * Cache entry with response
 */
interface HttpCacheEntry {
  response: HttpResponse<unknown>;
  timestamp: number;
}

/**
 * URL pattern to TTL mapping
 */
interface CacheTTLConfig {
  pattern: RegExp;
  ttl: number;
}

/**
 * HTTP cache interceptor options
 */
export interface HttpCacheInterceptorOptions {
  /** Maximum cache entries */
  maxSize?: number;
  /** Default TTL in ms */
  defaultTtl?: number;
  /** URL patterns with custom TTLs */
  ttlConfig?: CacheTTLConfig[];
  /** URLs to exclude from caching */
  excludeUrls?: RegExp[];
  /** Enable stale-while-revalidate */
  staleWhileRevalidate?: boolean;
}

// Module-level cache instance (singleton)
let cacheInstance: LRUCache<HttpCacheEntry> | null = null;

// In-flight requests (for deduplication)
const inFlightRequests = new Map<string, Observable<HttpEvent<unknown>>>();

/**
 * Default URL patterns with TTLs
 * Configured for Agent X, Activity, Explore, and other common endpoints.
 *
 * TTL Strategy (2026 Best Practices):
 * - SHORT_TTL (1 min): Real-time data (activity, notifications, badges)
 * - MEDIUM_TTL (15 min): User data, profiles, team info
 * - LONG_TTL (1 hr): Colleges, static content
 * - EXTENDED_TTL (24 hr): Sports list, positions, rarely changing data
 */
const DEFAULT_TTL_CONFIG: CacheTTLConfig[] = [
  // Activity - Short TTL (real-time notifications)
  { pattern: /\/api\/v1\/activity\/feed/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/api\/v1\/activity\/badges/, ttl: 30_000 }, // 30 seconds for badges
  { pattern: /\/api\/v1\/activity\/summary/, ttl: CACHE_CONFIG.SHORT_TTL },

  // Agent X - Short TTL (tasks rarely change, history is user-specific)
  { pattern: /\/api\/v1\/agent-x\/tasks/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/api\/v1\/agent-x\/history/, ttl: CACHE_CONFIG.SHORT_TTL },

  // Explore - Medium TTL (search results, trending)
  { pattern: /\/api\/v1\/explore\/search/, ttl: 5 * 60_000 }, // 5 minutes
  { pattern: /\/api\/v1\/explore\/trending/, ttl: 30 * 60_000 }, // 30 minutes
  { pattern: /\/api\/v1\/explore\/suggestions/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/api\/v1\/explore\/counts/, ttl: CACHE_CONFIG.SHORT_TTL },

  // Colleges - Long TTL (static data)
  { pattern: /\/api\/v1\/college/, ttl: CACHE_CONFIG.LONG_TTL },

  // Profiles - Medium TTL
  // Note: core profile API routes to /auth/profile/:id (not /api/v1/profile)
  { pattern: /\/auth\/profile/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/api\/v1\/profile/, ttl: CACHE_CONFIG.MEDIUM_TTL },

  // Teams - Medium TTL
  { pattern: /\/api\/v1\/team/, ttl: CACHE_CONFIG.MEDIUM_TTL },

  // Static data - Extended TTL
  { pattern: /\/api\/v1\/sports/, ttl: CACHE_CONFIG.EXTENDED_TTL },
  { pattern: /\/api\/v1\/positions/, ttl: CACHE_CONFIG.EXTENDED_TTL },
];

/**
 * URLs to never cache
 * Generic patterns for auth, payments, admin, chat
 */
const DEFAULT_EXCLUDE_URLS: RegExp[] = [
  /\/auth\//,
  /\/login/,
  /\/register/,
  /\/stripe\//,
  /\/paypal\//,
  /\/admin\//,
  // Agent X chat is never cached (user messages)
  /\/api\/v1\/agent-x\/chat/,
  /\/api\/v1\/agent-x\/clear/,
];

/**
 * Get or create the cache instance
 */
function getCache(options: HttpCacheInterceptorOptions): LRUCache<HttpCacheEntry> {
  if (!cacheInstance) {
    cacheInstance = createLRUCache<HttpCacheEntry>({
      maxSize: options.maxSize ?? CACHE_CONFIG.DEFAULT_MAX_SIZE,
      ttl: options.defaultTtl ?? CACHE_CONFIG.DEFAULT_TTL,
      namespace: CACHE_KEYS.API_RESPONSE,
    });
  }
  return cacheInstance;
}

/**
 * Get TTL for a URL
 */
function getTtlForUrl(url: string, config: CacheTTLConfig[], defaultTtl: number): number {
  for (const { pattern, ttl } of config) {
    if (pattern.test(url)) {
      return ttl;
    }
  }
  return defaultTtl;
}

/**
 * Check if URL should be excluded from caching
 */
function shouldExclude(url: string, excludePatterns: RegExp[]): boolean {
  return excludePatterns.some((pattern) => pattern.test(url));
}

/**
 * Check if request should be cached
 */
function isCacheable(req: HttpRequest<unknown>, excludePatterns: RegExp[]): boolean {
  // Only cache GET requests
  if (req.method !== 'GET') return false;

  // Check for cache bypass header
  if (req.headers.has('X-No-Cache') || req.headers.has('Cache-Control')) {
    const cacheControl = req.headers.get('Cache-Control');
    if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
      return false;
    }
  }

  // Check exclude patterns
  if (shouldExclude(req.url, excludePatterns)) {
    return false;
  }

  return true;
}

/**
 * Create HTTP cache interceptor
 * @param options - Interceptor configuration
 * @returns HTTP interceptor function
 */
export function httpCacheInterceptor(options: HttpCacheInterceptorOptions = {}): HttpInterceptorFn {
  const {
    maxSize = CACHE_CONFIG.DEFAULT_MAX_SIZE,
    defaultTtl = CACHE_CONFIG.DEFAULT_TTL,
    ttlConfig = DEFAULT_TTL_CONFIG,
    excludeUrls = DEFAULT_EXCLUDE_URLS,
    staleWhileRevalidate = true,
  } = options;

  return (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
    // SSR safety - skip caching on server
    const platformId = inject(PLATFORM_ID);
    if (!isPlatformBrowser(platformId)) {
      return next(req);
    }

    // Check if request is cacheable
    if (!isCacheable(req, excludeUrls)) {
      return next(req);
    }

    const cache = getCache({ maxSize, defaultTtl });
    const cacheKey = generateCacheKey(req.urlWithParams);

    // Check for in-flight request (deduplication)
    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    // Try to get from cache
    const cachedPromise = cache.get(cacheKey);

    return new Observable<HttpEvent<unknown>>((observer) => {
      cachedPromise.then((cached) => {
        const now = Date.now();
        const ttl = getTtlForUrl(req.url, ttlConfig, defaultTtl);

        if (cached) {
          const age = now - cached.timestamp;
          const isExpired = age > ttl;
          const isStale = isExpired && age < ttl + CACHE_CONFIG.STALE_WHILE_REVALIDATE;

          // Return cached response
          if (!isExpired || (staleWhileRevalidate && isStale)) {
            observer.next(cached.response.clone());

            // If stale, revalidate in background
            if (isStale) {
              next(req).subscribe({
                next: (event) => {
                  if (event instanceof HttpResponse) {
                    cache.set(cacheKey, { response: event.clone(), timestamp: now }, ttl);
                  }
                },
                error: () => {
                  // Silent fail - we already returned cached response
                },
              });
            }

            observer.complete();
            return;
          }
        }

        // Fetch from network
        const request$ = next(req).pipe(
          tap((event) => {
            if (event instanceof HttpResponse && event.status === 200) {
              // Cache successful responses
              cache.set(cacheKey, { response: event.clone(), timestamp: now }, ttl);
            }
          }),
          finalize(() => {
            // Remove from in-flight tracking
            inFlightRequests.delete(cacheKey);
          }),
          shareReplay(1)
        );

        // Track in-flight request
        inFlightRequests.set(cacheKey, request$);

        request$.subscribe({
          next: (event) => observer.next(event),
          error: (err) => observer.error(err),
          complete: () => observer.complete(),
        });
      });
    });
  };
}

/**
 * Clear the HTTP cache
 * Useful after user actions that invalidate cached data
 */
export async function clearHttpCache(pattern?: string): Promise<void> {
  if (cacheInstance) {
    if (pattern) {
      await cacheInstance.invalidate(pattern);
    } else {
      await cacheInstance.clear();
    }
  }
}

/**
 * Get HTTP cache statistics
 */
export function getHttpCacheStats() {
  return cacheInstance?.getStats() ?? null;
}

/**
 * Preload a URL into the cache
 * @param url - URL to preload
 * @param response - Response to cache
 * @param ttl - Optional custom TTL
 */
export async function preloadHttpCache(
  url: string,
  response: HttpResponse<unknown>,
  ttl?: number
): Promise<void> {
  if (cacheInstance) {
    const cacheKey = generateCacheKey(url);
    await cacheInstance.set(
      cacheKey,
      { response, timestamp: Date.now() },
      ttl ?? CACHE_CONFIG.DEFAULT_TTL
    );
  }
}
