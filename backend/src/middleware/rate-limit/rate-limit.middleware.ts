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
 * Standard API rate limit - 150 requests per minute.
 * Keys on authenticated userId when available (from auth middleware),
 * falls back to IP so anonymous endpoints are still protected.
 * This prevents one power user's rapid navigation from exhausting a shared
 * IP quota (NAT, corporate WiFi, test sessions).
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 150, // Limit each key to 150 requests per minute
  keyGenerator: userOrIpRateLimitKey,
  handler: createRateLimitExceededHandler('API', 60, 'api'),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req: Request): boolean => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/staging/health';
  },
});

/**
 * Strict auth rate limit - 5 attempts per 15 minutes
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Strict limit for auth endpoints
  handler: createRateLimitExceededHandler('Auth', 900, 'login'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Billing/payment rate limit - 10 requests per 5 minutes
 */
export const billingRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Conservative limit for billing operations
  handler: createRateLimitExceededHandler('Billing', 300, 'api'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Email/contact rate limit - 3 requests per hour
 */
export const emailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Very strict for email operations
  handler: createRateLimitExceededHandler('Email', 3600, 'email'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * AI inference rate limit - 20 requests per minute per user.
 * Applied to expensive LLM endpoints (chat, enqueue, playbook, briefing)
 * to prevent runaway AI spend and protect the OpenRouter budget.
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  keyGenerator: userOrIpRateLimitKey,
  handler: createRateLimitExceededHandler('AI inference', 60, 'api'),
  standardHeaders: true,
  legacyHeaders: false,
  // Consistent with getRateLimiter() — relax limits outside production so test
  // suites and local development are not blocked by the strict 20-req/min cap.
  skip: () => process.env['NODE_ENV'] !== 'production',
});

/**
 * Password reset rate limit - 3 attempts per hour
 */
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Very strict for password reset
  handler: createRateLimitExceededHandler('Password reset', 3600, 'password'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Upload rate limit - 20 uploads per 15 minutes per user.
 * Keys on authenticated userId when available, falls back to IP so
 * shared/proxy IPs don't collapse all users into one bucket.
 */
export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Reasonable limit for file uploads
  keyGenerator: userOrIpRateLimitKey,
  handler: createRateLimitExceededHandler('Upload', 900, 'api'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env['NODE_ENV'] !== 'production',
});

/**
 * Search rate limit - 50 searches per 15 minutes
 */
export const searchRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Moderate limit for search operations
  handler: createRateLimitExceededHandler('Search', 900, 'api'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Lenient rate limit - 300 requests per minute
 */
export const lenientRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // High-volume but still protected
  handler: createRateLimitExceededHandler('Lenient', 60, 'api'),
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
export function getRateLimiter(
  type: 'api' | 'auth' | 'billing' | 'email' | 'upload' | 'search' | 'password' | 'lenient' | 'ai'
) {
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
