/**
 * Shared production rate-limit thresholds.
 *
 * Keep this as the single source of truth for Redis, in-memory fallback, and
 * audit/reporting code so deployed limits cannot drift between implementations.
 */
export const RATE_LIMIT_CONFIGS = {
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    retryAfterSeconds: 900,
    auditWindow: '15min',
    description: 'Authentication attempt endpoints',
  },
  billing: {
    windowMs: 5 * 60 * 1000,
    max: 60,
    retryAfterSeconds: 300,
    auditWindow: '5min',
    description: 'Payment processing, subscription changes, and billing webhooks',
  },
  email: {
    windowMs: 60 * 60 * 1000,
    max: 10,
    retryAfterSeconds: 3600,
    auditWindow: '1hour',
    description: 'Email sending and contact flows',
  },
  upload: {
    windowMs: 15 * 60 * 1000,
    max: 60,
    retryAfterSeconds: 900,
    auditWindow: '15min',
    description: 'File uploads and video processing',
  },
  search: {
    windowMs: 15 * 60 * 1000,
    max: 180,
    retryAfterSeconds: 900,
    auditWindow: '15min',
    description: 'Search, typeahead, and discovery endpoints',
  },
  api: {
    windowMs: 60 * 1000,
    max: 300,
    retryAfterSeconds: 60,
    auditWindow: '1min',
    description: 'Standard API endpoints and SPA burst traffic',
  },
  lenient: {
    windowMs: 60 * 1000,
    max: 600,
    retryAfterSeconds: 60,
    auditWindow: '1min',
    description: 'Less sensitive or high-volume endpoints',
  },
  ai: {
    windowMs: 60 * 1000,
    max: 60,
    retryAfterSeconds: 60,
    auditWindow: '1min',
    description: 'AI operation admission and stream attachment endpoints',
  },
  password: {
    windowMs: 60 * 60 * 1000,
    max: 5,
    retryAfterSeconds: 3600,
    auditWindow: '1hour',
    description: 'Password reset flows',
  },
} as const;

export type RateLimitType = keyof typeof RATE_LIMIT_CONFIGS;
