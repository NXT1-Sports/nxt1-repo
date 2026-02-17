/**
 * @fileoverview Cache Status Middleware
 * @module @nxt1/backend/middleware/cache-status
 *
 * Adds cache status information to all API responses.
 * Tracks whether response was served from cache or computed fresh.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// Cache status tracking
interface CacheableRequest extends Request {
  cacheHit?: boolean;
  cacheKey?: string;
  cacheSource?: 'redis' | 'memory' | 'none';
}

/**
 * Middleware to track and add cache status to responses
 */
export function cacheStatusMiddleware(
  req: CacheableRequest,
  res: Response,
  next: NextFunction
): void {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override res.json to add cache status
  res.json = function (body: Record<string, unknown>) {
    // Determine cache status
    const cached = req.cacheHit || false;
    const cacheSource = req.cacheSource || 'none';
    const cacheKey = req.cacheKey;

    // Add cache information to response body if it's an object
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      // For success responses
      if (body['success'] !== false) {
        body['cached'] = cached;
        body['cacheSource'] = cacheSource;

        // Add cache key in development mode
        if (process.env['NODE_ENV'] !== 'production' && cacheKey) {
          body['cacheKey'] = cacheKey;
        }
      }
      // For error responses, still add cache info but less verbose
      else if (body['error']) {
        body['cached'] = cached;
      }
    }

    // Log cache performance for debugging
    if (cached) {
      logger.debug('[Cache] Hit', {
        path: req.path,
        method: req.method,
        source: cacheSource,
        key: cacheKey,
      });
    }

    // Call original json method with modified body
    return originalJson(body);
  };

  next();
}

/**
 * Helper function to mark request as cache hit
 */
export function markCacheHit(
  req: CacheableRequest,
  source: 'redis' | 'memory',
  key?: string
): void {
  req.cacheHit = true;
  req.cacheSource = source;
  if (key) {
    req.cacheKey = key;
  }
}

/**
 * Helper function to mark request as cache miss
 */
export function markCacheMiss(req: CacheableRequest): void {
  req.cacheHit = false;
  req.cacheSource = 'none';
}

/**
 * Decorator for route handlers to automatically track cache status
 * @deprecated - Use markCacheHit/markCacheMiss manually in routes instead
 */
export function withCacheStatus(_cacheKey?: string, _source: 'redis' | 'memory' = 'redis') {
  return function (_target: object, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (req: CacheableRequest, res: Response, ...args: unknown[]) {
      // You can implement cache check logic here
      // This is just a template - actual cache checking happens in services

      try {
        // Call original method
        const result = await originalMethod.call(this, req, res, ...args);

        // If no cache status was set explicitly, mark as fresh
        if (req.cacheHit === undefined) {
          markCacheMiss(req);
        }

        return result;
      } catch (error) {
        // Ensure cache status is set even on errors
        if (req.cacheHit === undefined) {
          markCacheMiss(req);
        }
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Express middleware factory for specific cache configurations
 */
export function createCacheMiddleware(defaultSource: 'redis' | 'memory' = 'redis') {
  return (req: CacheableRequest, _res: Response, next: NextFunction): void => {
    // Initialize cache status
    req.cacheHit = false;
    req.cacheSource = 'none';

    // Add helper methods to request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).markCacheHit = (source?: 'redis' | 'memory', key?: string) => {
      markCacheHit(req, source || defaultSource, key);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).markCacheMiss = () => {
      markCacheMiss(req);
    };

    next();
  };
}
