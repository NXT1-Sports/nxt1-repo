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

interface CacheInvalidationConfig {
  pattern: RegExp;
  invalidate: readonly string[];
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
 * Configured for Agent X, Activity, and other common endpoints.
 *
 * TTL Strategy (2026 Best Practices):
 * - SHORT_TTL (1 min): Real-time data (activity, notifications, badges)
 * - MEDIUM_TTL (15 min): User data, profiles, team info
 * - LONG_TTL (1 hr): Colleges, static content
 * - EXTENDED_TTL (24 hr): Sports list, positions, rarely changing data
 */
const DEFAULT_TTL_CONFIG: CacheTTLConfig[] = [
  // Activity - Short TTL (real-time notifications)
  { pattern: /\/activity\/feed/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/activity\/badges/, ttl: 30_000 }, // 30 seconds for badges
  { pattern: /\/activity\/summary/, ttl: CACHE_CONFIG.SHORT_TTL },

  // Usage - mixed TTL by data volatility
  { pattern: /\/usage\/overview(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/usage\/dashboard(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/usage\/chart(?:\/|$)/, ttl: 5 * 60_000 },
  { pattern: /\/usage\/breakdown(?:\/|$)/, ttl: 5 * 60_000 },
  { pattern: /\/usage\/history(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/usage\/payment-methods(?:\/|$)/, ttl: 30 * 60_000 },
  { pattern: /\/usage\/budgets(?:\/|$)/, ttl: 10 * 60_000 },
  { pattern: /\/billing\/budget(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },

  // Help Center - mostly document content
  { pattern: /\/help-center\/articles\//, ttl: 30 * 60_000 },
  { pattern: /\/help-center\/categories\//, ttl: 10 * 60_000 },
  { pattern: /\/help-center\/faqs(?:\/|$)/, ttl: CACHE_CONFIG.LONG_TTL },
  { pattern: /\/help-center\/search(?:\/|$)/, ttl: 5 * 60_000 },
  { pattern: /\/help-center(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },

  // Colleges - Long TTL (static data)
  { pattern: /\/college\//, ttl: CACHE_CONFIG.LONG_TTL },

  // Profiles - timeline is SHORT TTL so Agent X posts appear immediately
  { pattern: /\/auth\/profile\/[^/]+\/timeline/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/auth\/profile/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/profile\/[^/]+\/timeline/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/profile\//, ttl: CACHE_CONFIG.MEDIUM_TTL },

  // Teams & Manage Team - Medium TTL
  { pattern: /\/teams(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },

  // Feed / Posts - Short TTL (social content refreshes frequently)
  { pattern: /\/feed\/users\//, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/feed\/teams\//, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/feed\/posts\/[^/]+$/, ttl: CACHE_CONFIG.MEDIUM_TTL }, // single post detail
  { pattern: /\/feed(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },

  // Explore - search/suggestions are SHORT, trending is slightly longer, detail pages are MEDIUM
  { pattern: /\/explore\/search(?:\/|\?|$)/, ttl: 2 * 60_000 }, // 2 min — query-sensitive
  { pattern: /\/explore\/suggestions(?:\/|\?|$)/, ttl: 2 * 60_000 },
  { pattern: /\/explore\/counts(?:\/|\?|$)/, ttl: 2 * 60_000 },
  { pattern: /\/explore\/trending(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/athletes\/[^/]+(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL }, // athlete detail
  { pattern: /\/videos\/[^/]+(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL }, // video detail
  { pattern: /\/leaderboards\//, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/explore(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },

  // Scout Reports - long-lived analytical documents
  { pattern: /\/api\/v1\/scout-reports\/search(?:\/|\?|$)/, ttl: 5 * 60_000 },
  { pattern: /\/api\/v1\/scout-reports\/summary(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/api\/v1\/scout-reports\/[^/]+(?:\/|$)/, ttl: CACHE_CONFIG.LONG_TTL }, // detail
  { pattern: /\/api\/v1\/scout-reports(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL }, // list

  // News / Pulse - article content is stable, feed refreshes regularly
  { pattern: /\/pulse\/search(?:\/|\?|$)/, ttl: 5 * 60_000 },
  { pattern: /\/pulse\/trending(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/pulse\/[^/]+(?:\/|$)/, ttl: CACHE_CONFIG.LONG_TTL }, // single article
  { pattern: /\/pulse(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL }, // news feed

  // Settings - preferences/subscription are stable, check-update is dynamic
  { pattern: /\/api\/v1\/settings\/check-update(?:\/|$)/, ttl: 60_000 }, // 1 min
  { pattern: /\/api\/v1\/settings\/billing\/history(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/api\/v1\/settings\/subscription(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/api\/v1\/settings\/usage(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/api\/v1\/settings(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },

  // Notifications list - Short TTL (user expects near-real-time)
  { pattern: /\/v1\/notifications\/settings(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/v1\/notifications(?:\/|$)/, ttl: 30_000 }, // 30 seconds

  // Messages - unread count is very short TTL; conversation list is short TTL
  // Note: thread messages are excluded (real-time), only counts/list are cached
  { pattern: /\/messages\/unread-count(?:\/|$)/, ttl: 30_000 }, // 30 seconds
  { pattern: /\/messages\/conversations(?:\/|\?|$)/, ttl: CACHE_CONFIG.SHORT_TTL },

  // Static data - Extended TTL
  { pattern: /\/sports/, ttl: CACHE_CONFIG.EXTENDED_TTL },
  { pattern: /\/positions/, ttl: CACHE_CONFIG.EXTENDED_TTL },
];

const DEFAULT_INVALIDATION_CONFIG: readonly CacheInvalidationConfig[] = [
  { pattern: /\/auth\/profile|\/profile\//, invalidate: ['*auth/profile*', '*profile*'] },
  { pattern: /\/teams(?:\/|$)/, invalidate: ['*teams*'] },
  { pattern: /\/activity\//, invalidate: ['*activity*'] },
  { pattern: /\/usage\/billing-mode/, invalidate: ['*usage*', '*billing/budget*'] },
  { pattern: /\/usage\//, invalidate: ['*usage*'] },
  { pattern: /\/billing\/budget/, invalidate: ['*billing/budget*', '*usage*'] },
  { pattern: /\/help-center\//, invalidate: ['*help-center*'] },
  { pattern: /\/invite\//, invalidate: ['*invite*'] },
  // Feed — invalidate on any write (like, share, report)
  { pattern: /\/feed\/posts\/[^/]+\/(like|share|report)/, invalidate: ['*feed*'] },
  // Scout Reports — invalidate list/summary on any mutation
  { pattern: /\/api\/v1\/scout-reports/, invalidate: ['*scout-reports*'] },
  // Settings — invalidate the whole settings cache on any write
  { pattern: /\/api\/v1\/settings/, invalidate: ['*settings*'] },
  // Notifications — invalidate on read/mark-read
  { pattern: /\/v1\/notifications\/read/, invalidate: ['*notifications*'] },
  // Messages — invalidate conversations list on send/create/read/delete
  {
    pattern: /\/messages\/(send|create|read|delete|mute|pin)/,
    invalidate: ['*messages/conversations*', '*messages/unread-count*'],
  },
];

/**
 * URLs to never cache
 * Generic patterns for auth, payments, admin, chat
 */
const DEFAULT_EXCLUDE_URLS: RegExp[] = [
  /\/auth\/(?:login|register|signup|logout|token|refresh|verify|password|connect-url|callback|google|microsoft|apple|yahoo)/,
  /\/login/,
  /\/register/,
  /\/stripe\//,
  /\/paypal\//,
  /\/admin\//,
  // Agent X — all endpoints are dynamic & user-specific, never cache
  /\/agent-x\//,
  // Messages real-time thread — individual messages are never cached
  /\/messages\/thread\//,
  // News / Pulse AI generation — always hits the backend
  /\/pulse\/generate/,
  // Feed write operations — likes, shares, reports, views never cached
  /\/feed\/posts\/[^/]+\/(like|share|report|view)/,
  // Notifications write operations
  /\/v1\/notifications\/(read|register-token|unsubscribe)/,
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

  // Explicit cache bypass — used by bustDashboardCache() and similar force-refresh calls
  if (req.headers.has('X-No-Cache')) {
    return false;
  }

  // Standard HTTP cache bypass
  const cacheControl = req.headers.get('Cache-Control');
  if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
    return false;
  }

  // Check exclude patterns
  if (shouldExclude(req.url, excludePatterns)) {
    return false;
  }

  return true;
}

function isMutationRequest(req: HttpRequest<unknown>): boolean {
  return (
    req.method === 'POST' ||
    req.method === 'PUT' ||
    req.method === 'PATCH' ||
    req.method === 'DELETE'
  );
}

async function invalidateRelatedCacheEntries(
  req: HttpRequest<unknown>,
  cache: LRUCache<HttpCacheEntry>
): Promise<void> {
  const patterns = new Set<string>();

  for (const config of DEFAULT_INVALIDATION_CONFIG) {
    if (config.pattern.test(req.url)) {
      for (const invalidatePattern of config.invalidate) {
        patterns.add(invalidatePattern);
      }
    }
  }

  if (patterns.size === 0) {
    return;
  }

  await Promise.all(Array.from(patterns, (pattern) => cache.invalidate(pattern)));
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

    const cache = getCache({ maxSize, defaultTtl });

    // Non-cacheable requests can still invalidate cache after successful mutations.
    if (!isCacheable(req, excludeUrls)) {
      if (!isMutationRequest(req)) {
        return next(req);
      }

      return next(req).pipe(
        tap((event) => {
          if (event instanceof HttpResponse && event.status >= 200 && event.status < 300) {
            void invalidateRelatedCacheEntries(req, cache);
          }
        })
      );
    }

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
