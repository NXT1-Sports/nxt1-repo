/**
 * @fileoverview Auth User Cache
 * @module @nxt1/core/auth
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * LRU cache for auth user profiles with automatic TTL management.
 * Prevents redundant backend API calls when user data is already fresh.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │             AuthFlowService                                │
 * │         (calls syncUserProfile)                            │
 * ├────────────────────────────────────────────────────────────┤
 * │         ⭐ AuthUserCache (THIS FILE) ⭐                     │
 * │    Returns cached profile or fetches from backend          │
 * ├────────────────────────────────────────────────────────────┤
 * │           AuthApiService (Backend HTTP)                    │
 * └────────────────────────────────────────────────────────────┘
 *
 * @example
 * ```typescript
 * import { createAuthUserCache } from '@nxt1/core/auth';
 *
 * const userCache = createAuthUserCache();
 *
 * // Get user with automatic caching
 * const user = await userCache.getOrFetch(userId, async () => {
 *   return await authApi.getUserProfile(userId);
 * });
 *
 * // Invalidate on sign-out
 * userCache.clear();
 *
 * // Invalidate specific user
 * userCache.invalidate(userId);
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { createLRUCache, CACHE_KEYS } from '../cache';

// ============================================
// TYPES
// ============================================

/**
 * Sports data in cached profile
 */
export interface CachedSportData {
  readonly sport: string;
  readonly positions?: readonly string[];
  readonly isPrimary?: boolean;
}

/**
 * Merged user profile - combines auth state + backend profile.
 * This is the SINGLE source of truth for UI components.
 *
 * Professional pattern: Components should use this type for all user display,
 * rather than accessing separate auth/profile signals.
 */
export interface MergedUserProfile {
  // Identity (from Firebase Auth)
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly profileImg?: string | null;
  readonly emailVerified: boolean;

  // Status (computed from backend)
  readonly role: string | null;
  readonly hasCompletedOnboarding: boolean;

  // Extended profile (from backend)
  readonly firstName?: string;
  readonly lastName?: string;
  readonly primarySport?: string;
  readonly sports: readonly CachedSportData[];

  // Timestamps
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/**
 * Cached user profile data.
 * Matches the backend API response structure.
 */
export interface CachedUserProfile {
  // Core identity
  readonly uid: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly profileImg?: string | null;
  readonly displayName?: string;

  // Role & status
  readonly role?: string | null;

  // Onboarding status (V2 + legacy)
  readonly onboardingCompleted?: boolean;
  readonly completeSignUp?: boolean;

  // Legacy boolean flags (for backwards compatibility)
  readonly isCollegeCoach?: boolean | null;
  readonly isRecruit?: boolean | null;

  // Sports data
  readonly primarySport?: string;
  readonly sports?: readonly CachedSportData[];

  // Any additional fields from backend
  readonly [key: string]: unknown;
}

/** Default TTL: 15 minutes */
const DEFAULT_AUTH_CACHE_TTL = 15 * 60 * 1000;
/** Default max cached users */
const DEFAULT_AUTH_CACHE_MAX_SIZE = 50;

/**
 * Auth cache options
 */
export interface AuthUserCacheOptions {
  /** Time-to-live in milliseconds (default: 15 minutes) */
  readonly ttl?: number;
  /** Maximum cached users (default: 50) */
  readonly maxSize?: number;
  /** Enable debug logging */
  readonly debug?: boolean;
}

/**
 * Auth user cache interface
 */
export interface AuthUserCache {
  /**
   * Get cached user profile or fetch from backend
   *
   * @param userId - User ID
   * @param fetcher - Async function to fetch user if not cached
   * @returns Cached or freshly fetched user profile
   */
  getOrFetch<T extends CachedUserProfile>(userId: string, fetcher: () => Promise<T>): Promise<T>;

  /**
   * Get cached user profile (returns null if not cached)
   *
   * @param userId - User ID
   * @returns Cached user profile or null
   */
  get(userId: string): Promise<CachedUserProfile | null>;

  /**
   * Cache a user profile
   *
   * @param userId - User ID
   * @param profile - User profile to cache
   */
  set(userId: string, profile: CachedUserProfile): Promise<void>;

  /**
   * Invalidate cached user profile
   *
   * @param userId - User ID to invalidate
   */
  invalidate(userId: string): Promise<void>;

  /**
   * Invalidate all cached profiles (call on sign-out)
   */
  clear(): Promise<void>;

  /**
   * Check if user is cached and not expired
   *
   * @param userId - User ID
   * @returns true if valid cache exists
   */
  has(userId: string): Promise<boolean>;

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    hits: number;
    misses: number;
  };
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create an auth user cache instance
 *
 * Uses LRU eviction strategy with TTL to ensure:
 * - Fast profile lookups during session
 * - Bounded memory usage
 * - Automatic stale data expiration
 *
 * @param options - Cache configuration options
 * @returns AuthUserCache instance
 *
 * @example
 * ```typescript
 * // Default configuration (15 min TTL, 50 users max)
 * const cache = createAuthUserCache();
 *
 * // Custom configuration
 * const cache = createAuthUserCache({
 *   ttl: 10 * 60 * 1000, // 10 minutes
 *   maxSize: 100,
 *   debug: true,
 * });
 * ```
 */
export function createAuthUserCache(options: AuthUserCacheOptions = {}): AuthUserCache {
  const {
    ttl = DEFAULT_AUTH_CACHE_TTL,
    maxSize = DEFAULT_AUTH_CACHE_MAX_SIZE,
    debug = false,
  } = options;

  // Internal LRU cache
  const cache = createLRUCache<CachedUserProfile>({
    maxSize,
    ttl,
  });

  // Statistics tracking
  let hits = 0;
  let misses = 0;

  const log = (message: string, data?: unknown) => {
    if (debug) {
      console.debug(`[AuthUserCache] ${message}`, data ?? '');
    }
  };

  return {
    async getOrFetch<T extends CachedUserProfile>(
      userId: string,
      fetcher: () => Promise<T>
    ): Promise<T> {
      const cacheKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;

      // Check cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        hits++;
        log('Cache HIT', { userId, cacheKey });
        return cached as T;
      }

      // Cache miss - fetch from backend
      misses++;
      log('Cache MISS, fetching', { userId, cacheKey });

      const profile = await fetcher();
      await cache.set(cacheKey, profile);

      log('Cached user profile', { userId, ttl });
      return profile;
    },

    /**
     * Get a cached profile directly (async).
     * Use getOrFetch for most cases - this is for checking cache without fetching.
     */
    async get(userId: string): Promise<CachedUserProfile | null> {
      const cacheKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;
      const result = await cache.get(cacheKey);
      if (result) {
        hits++;
        log('Cache HIT (direct get)', { userId });
      } else {
        log('Cache MISS (direct get)', { userId });
      }
      return result;
    },

    /**
     * Manually set a user profile in the cache.
     */
    async set(userId: string, profile: CachedUserProfile): Promise<void> {
      const cacheKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;
      await cache.set(cacheKey, profile);
      log('Manually cached user', { userId });
    },

    /**
     * Invalidate/remove a user's cached profile.
     */
    async invalidate(userId: string): Promise<void> {
      const cacheKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;
      await cache.delete(cacheKey);
      log('Invalidated user cache', { userId });
    },

    /**
     * Clear all cached user profiles.
     */
    async clear(): Promise<void> {
      await cache.clear();
      hits = 0;
      misses = 0;
      log('Cleared all user caches');
    },

    /**
     * Check if a user profile is cached.
     */
    async has(userId: string): Promise<boolean> {
      const cacheKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;
      return cache.has(cacheKey);
    },

    /**
     * Get cache statistics for monitoring and debugging.
     */
    getStats(): {
      size: number;
      maxSize: number;
      hitRate: number;
      hits: number;
      misses: number;
    } {
      const total = hits + misses;
      const cacheStats = cache.getStats();
      return {
        size: cacheStats.size,
        maxSize,
        hitRate: total > 0 ? hits / total : 0,
        hits,
        misses,
      };
    },
  };
}

// ============================================
// SINGLETON INSTANCE
// ============================================

/**
 * Global auth user cache instance.
 *
 * Use this for shared caching across services in the same app.
 * Each app (web/mobile) gets its own instance when bundled.
 *
 * @example
 * ```typescript
 * import { globalAuthUserCache } from '@nxt1/core/auth';
 *
 * // In AuthFlowService
 * const profile = await globalAuthUserCache.getOrFetch(userId, () =>
 *   this.authApi.getUserProfile(userId)
 * );
 * ```
 */
export const globalAuthUserCache: AuthUserCache = createAuthUserCache();
