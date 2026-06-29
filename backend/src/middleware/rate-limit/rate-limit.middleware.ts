/**
 * @fileoverview Rate Limiting Middleware
 * @module @nxt1/backend/middleware/rate-limit
 *
 * Implements comprehensive rate limiting using express-rate-limit with different
 * limits for different endpoint types (auth, API, billing, etc.)
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { rateLimitError } from '@nxt1/core/errors';
import { logger } from '../../utils/logger.js';
import { RATE_LIMIT_CONFIGS, type RateLimitType } from './rate-limit.config.js';

function userOrIpRateLimitKey(req: Request): string {
  const uid = (req as unknown as { user?: { uid?: string } }).user?.uid;

  if (uid) {
    return `uid:${uid}`;
  }

  return `ip:${ipKeyGenerator(req.ip ?? 'anonymous')}`;
}

function createRateLimitExceededHandler(
  label: string,
  retryAfterSeconds: number,
  type: 'api' | 'login' | 'email' | 'password'
) {
  return (req: Request, res: Response): void => {
    logger.warn(`[Rate Limit] ${label} limit exceeded`, {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    const error = rateLimitError(retryAfterSeconds, type);
    res.status(error.statusCode).json(error.toResponse());
  };
}

// ============================================
// RATE LIMIT CONFIGURATIONS
// ============================================

/**
 * Standard API rate limit sized for ordinary SPA burst traffic.
 * Keys on authenticated userId when available (from auth middleware),
 * falls back to IP so anonymous endpoints are still protected.
 * This prevents one power user's rapid navigation from exhausting a shared
 * IP quota (NAT, corporate WiFi, test sessions).
 */
export const apiRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.api.windowMs,
  max: RATE_LIMIT_CONFIGS.api.max,
  keyGenerator: userOrIpRateLimitKey,
  handler: createRateLimitExceededHandler('API', RATE_LIMIT_CONFIGS.api.retryAfterSeconds, 'api'),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req: Request): boolean => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/staging/health';
  },
});

/**
 * Strict auth rate limit for direct auth-attempt endpoints.
 */
export const authRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.auth.windowMs,
  max: RATE_LIMIT_CONFIGS.auth.max,
  handler: createRateLimitExceededHandler(
    'Auth',
    RATE_LIMIT_CONFIGS.auth.retryAfterSeconds,
    'login'
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Billing/payment rate limit.
 */
export const billingRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.billing.windowMs,
  max: RATE_LIMIT_CONFIGS.billing.max,
  handler: createRateLimitExceededHandler(
    'Billing',
    RATE_LIMIT_CONFIGS.billing.retryAfterSeconds,
    'api'
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Email/contact rate limit.
 */
export const emailRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.email.windowMs,
  max: RATE_LIMIT_CONFIGS.email.max,
  handler: createRateLimitExceededHandler(
    'Email',
    RATE_LIMIT_CONFIGS.email.retryAfterSeconds,
    'email'
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * AI route admission limit per user.
 * Applied to chat/enqueue/generation routes, including stream re-attachment.
 * Budget checks and queue controls still gate actual paid work.
 */
export const aiRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.ai.windowMs,
  max: RATE_LIMIT_CONFIGS.ai.max,
  keyGenerator: userOrIpRateLimitKey,
  handler: createRateLimitExceededHandler(
    'AI route',
    RATE_LIMIT_CONFIGS.ai.retryAfterSeconds,
    'api'
  ),
  standardHeaders: true,
  legacyHeaders: false,
  // Consistent with getRateLimiter() — relax limits outside production so test
  // suites and local development are not blocked by production AI caps.
  skip: () => process.env['NODE_ENV'] !== 'production',
});

/**
 * Password reset rate limit.
 */
export const passwordResetRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.password.windowMs,
  max: RATE_LIMIT_CONFIGS.password.max,
  handler: createRateLimitExceededHandler(
    'Password reset',
    RATE_LIMIT_CONFIGS.password.retryAfterSeconds,
    'password'
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Upload rate limit per user.
 * Keys on authenticated userId when available, falls back to IP so
 * shared/proxy IPs don't collapse all users into one bucket.
 */
export const uploadRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.upload.windowMs,
  max: RATE_LIMIT_CONFIGS.upload.max,
  keyGenerator: userOrIpRateLimitKey,
  handler: createRateLimitExceededHandler(
    'Upload',
    RATE_LIMIT_CONFIGS.upload.retryAfterSeconds,
    'api'
  ),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env['NODE_ENV'] !== 'production',
});

/**
 * Search rate limit.
 */
export const searchRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.search.windowMs,
  max: RATE_LIMIT_CONFIGS.search.max,
  handler: createRateLimitExceededHandler(
    'Search',
    RATE_LIMIT_CONFIGS.search.retryAfterSeconds,
    'api'
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Lenient rate limit.
 */
export const lenientRateLimit = rateLimit({
  windowMs: RATE_LIMIT_CONFIGS.lenient.windowMs,
  max: RATE_LIMIT_CONFIGS.lenient.max,
  handler: createRateLimitExceededHandler(
    'Lenient',
    RATE_LIMIT_CONFIGS.lenient.retryAfterSeconds,
    'api'
  ),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request): boolean => {
    return req.path === '/health' || req.path === '/staging/health';
  },
});

// ============================================
// DEVELOPMENT OVERRIDES
// ============================================

/**
 * Create development-friendly rate limiter
 * Much higher limits for local development
 */
function createDevRateLimit(maxRequests: number = 1000) {
  if (process.env['NODE_ENV'] === 'production') {
    // Production should use strict limits
    throw new Error('Development rate limiter should not be used in production');
  }

  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: maxRequests, // Very high limit for development
    handler: createRateLimitExceededHandler('Dev', 60, 'api'),
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Get appropriate rate limiter based on environment
 */
export function getRateLimiter(type: RateLimitType) {
  // Use relaxed limits in development
  if (process.env['NODE_ENV'] !== 'production') {
    return createDevRateLimit();
  }

  // Production rate limits
  switch (type) {
    case 'auth':
      return authRateLimit;
    case 'billing':
      return billingRateLimit;
    case 'email':
      return emailRateLimit;
    case 'upload':
      return uploadRateLimit;
    case 'search':
      return searchRateLimit;
    case 'lenient':
      return lenientRateLimit;
    case 'password':
      return passwordResetRateLimit;
    case 'ai':
      return aiRateLimit;
    case 'api':
    default:
      return apiRateLimit;
  }
}
