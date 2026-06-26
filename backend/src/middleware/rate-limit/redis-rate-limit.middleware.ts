/**
 * @fileoverview Redis-based Rate Limiting Middleware
 * @module @nxt1/backend/middleware/redis-rate-limit
 *
 * Implements Redis-based rate limiting with automatic fallback to in-memory
 * for distributed environments. Provides shared state across multiple server instances.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore, { type RedisReply, type SendCommandFn } from 'rate-limit-redis';
import type { Request } from 'express';
import { getCache } from '@nxt1/cache';
import { rateLimitError } from '@nxt1/core/errors';
import { logger } from '../../utils/logger.js';

interface RedisCommandClient {
  isReady?: boolean;
  sendCommand: (args: string[]) => Promise<RedisReply>;
}

interface CacheWithRedisClient {
  client?: RedisCommandClient;
}

function redisRateLimitBaseKey(req: Request): string {
  const userId = (req as { user?: { uid?: string } }).user?.uid;

  if (userId) {
    return `user:${userId}`;
  }

  return `ip:${ipKeyGenerator(req.ip ?? 'anonymous')}`;
}

// ============================================
// REDIS STORE MANAGEMENT
// ============================================

/**
 * Get Redis store for rate limiting with fallback to in-memory
 */
async function getRedisStore(): Promise<RedisStore | undefined> {
  try {
    const cache = await getCache();

    // Check if we have a Redis connection
    if (cache && typeof cache === 'object' && 'client' in cache) {
      const redisClient = (cache as CacheWithRedisClient).client;
      if (redisClient && redisClient.isReady) {
        const sendCommand: SendCommandFn = (...args) => redisClient.sendCommand(args);
        return new RedisStore({
          sendCommand,
          prefix: 'nxt1:rate-limit:',
        });
      }
    }
  } catch (error) {
    logger.warn('[Rate Limit] Redis not available, falling back to in-memory', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info('[Rate Limit] Using in-memory store');
  return undefined; // Will use default in-memory store
}

// ============================================
// RATE LIMIT TYPES
// ============================================

/**
 * Rate limit types with their configurations
 */
const RATE_LIMIT_CONFIGS = {
  // Authentication endpoints - strict limits
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    retryAfterSeconds: 900, // 15 minutes
  },

  // Billing and payment endpoints - moderate limits
  billing: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 requests per window
    retryAfterSeconds: 300, // 5 minutes
  },

  // Email sending - very strict
  email: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 emails per hour
    retryAfterSeconds: 3600, // 1 hour
  },

  // File upload endpoints
  upload: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 uploads per window
    retryAfterSeconds: 900, // 15 minutes
  },

  // Search and query endpoints
  search: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 searches per window
    retryAfterSeconds: 900, // 15 minutes
  },

  // Standard API endpoints sized for SPA burst traffic
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 150, // 150 requests per minute
    retryAfterSeconds: 60, // 1 minute
  },

  // Lenient rate limit for less sensitive or high-volume endpoints
  lenient: {
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute
    retryAfterSeconds: 60, // 1 minute
  },
} as const;

interface RateLimitCacheWithGet {
  get: (key: string) => Promise<unknown>;
}

interface RateLimitCacheWithDelete {
  delete: (key: string) => Promise<unknown>;
}

interface RateLimitCacheEntry {
  hits?: number;
}

export type RateLimitType = keyof typeof RATE_LIMIT_CONFIGS;

// ============================================
// REDIS RATE LIMITER FACTORY
// ============================================

/**
 * Create Redis-based rate limiter with specific configuration
 */
export async function createRedisRateLimit(type: RateLimitType = 'api') {
  const config = RATE_LIMIT_CONFIGS[type];
  const store = await getRedisStore();

  // Development override - much higher limits for local dev
  const isDev = process.env['NODE_ENV'] !== 'production';
  const maxRequests = isDev ? 10000 : config.max;

  return rateLimit({
    windowMs: config.windowMs,
    max: maxRequests,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    store, // Use Redis store if available, otherwise default in-memory

    // Custom skip function for health checks
    skip: (req: Request): boolean => {
      return req.path === '/health' || req.path === '/staging/health';
    },

    // Enhanced error handling with logging
    handler: (req: Request, res): void => {
      const logData = {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        type,
        store: store ? 'Redis' : 'Memory',
      };

      logger.warn(`[Rate Limit] ${type} limit exceeded`, logData);

      // Use consistent error format with mapping to supported types
      const supportedErrorType = (() => {
        switch (type) {
          case 'auth':
            return 'login' as const;
          case 'billing':
          case 'upload':
          case 'search':
          case 'lenient':
            return 'api' as const;
          case 'email':
            return 'email' as const;
          default:
            return 'api' as const;
        }
      })();
      const error = rateLimitError(config.retryAfterSeconds, supportedErrorType);
      res.status(429).json(error);
    },

    // Key generator for better tracking
    keyGenerator: (req: Request): string => `${type}:${redisRateLimitBaseKey(req)}`,
  });
}

// ============================================
// PRE-CONFIGURED LIMITERS
// ============================================

/**
 * Get rate limiter by type - async version that uses Redis
 */
export async function getRedisRateLimiter(type: RateLimitType = 'api') {
  try {
    return await createRedisRateLimit(type);
  } catch (error) {
    logger.error('[Rate Limit] Failed to create Redis rate limiter', {
      type,
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback to basic rate limiter if Redis setup fails
    return rateLimit({
      windowMs: RATE_LIMIT_CONFIGS[type].windowMs,
      max: RATE_LIMIT_CONFIGS[type].max,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req: Request): boolean => {
        return req.path === '/health' || req.path === '/staging/health';
      },
    });
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Reset rate limit for a specific key (useful for testing or admin override)
 */
export async function resetRateLimit(type: RateLimitType, identifier: string): Promise<boolean> {
  try {
    const cache = await getCache();
    if (cache && typeof cache === 'object' && 'delete' in cache) {
      const key = `nxt1:rate-limit:${type}:${identifier}`;
      const cacheWithDelete = cache as unknown as RateLimitCacheWithDelete;
      await cacheWithDelete.delete(key);
      logger.info('[Rate Limit] Reset rate limit', { type, identifier, key });
      return true;
    }
  } catch (error) {
    logger.error('[Rate Limit] Failed to reset rate limit', {
      type,
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return false;
}

/**
 * Get current rate limit status for identifier
 */
export async function getRateLimitStatus(
  type: RateLimitType,
  identifier: string
): Promise<{
  remaining: number;
  resetTime: Date;
  total: number;
} | null> {
  try {
    const cache = await getCache();
    if (cache && typeof cache === 'object' && 'get' in cache) {
      const key = `nxt1:rate-limit:${type}:${identifier}`;
      const cacheWithGet = cache as unknown as RateLimitCacheWithGet;
      const data = await cacheWithGet.get(key);

      if (data && typeof data === 'object') {
        const config = RATE_LIMIT_CONFIGS[type];
        const entry = data as RateLimitCacheEntry;

        return {
          remaining: Math.max(0, config.max - (entry.hits ?? 0)),
          resetTime: new Date(Date.now() + config.windowMs),
          total: config.max,
        };
      }
    }
  } catch (error) {
    logger.error('[Rate Limit] Failed to get rate limit status', {
      type,
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}
