/**
 * @fileoverview Billing Configuration
 * @module @nxt1/backend/modules/billing
 *
 * Configuration for Stripe and billing features
 */

import type { StripeConfig } from './types/index.js';
import { UsageFeature } from './types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Get Stripe configuration for current environment
 */
export function getStripeConfig(environment: 'staging' | 'production'): StripeConfig {
  // Use STRIPE_TEST_SECRET_KEY for staging, STRIPE_SECRET_KEY for production
  const secretKey =
    environment === 'staging'
      ? process.env['STRIPE_TEST_SECRET_KEY']
      : process.env['STRIPE_SECRET_KEY'];

  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  const enabled = process.env['STRIPE_ENABLED'] !== 'false';

  if (!secretKey && enabled) {
    logger.warn(`⚠️  Stripe secret key not configured for ${environment} - billing disabled`);
  }

  // Safety check: prevent using live key outside production
  if (secretKey && process.env['NODE_ENV'] !== 'production' && secretKey.includes('live')) {
    throw new Error(
      `❌ STRIPE SAFETY: Live Stripe key detected in non-production environment (${process.env['NODE_ENV']}). ` +
        'Use STRIPE_TEST_SECRET_KEY for staging/development.'
    );
  }

  // Warning: using test key in production
  if (secretKey && process.env['NODE_ENV'] === 'production' && secretKey.includes('test')) {
    logger.warn(
      '⚠️  STRIPE SAFETY: Test Stripe key detected in production environment. Verify this is intentional.'
    );
  }

  // Get price IDs based on environment
  const pricePrefix = environment === 'staging' ? 'STAGING' : 'PRODUCTION';

  return {
    secretKey: secretKey || '',
    webhookSecret: webhookSecret || '',
    enabled: enabled && !!secretKey,
    prices: {
      [UsageFeature.AI_CONTENT]: process.env[`STRIPE_PRICE_ID_${pricePrefix}_AI_CONTENT`] || '',
      [UsageFeature.AI_IMAGE]: process.env[`STRIPE_PRICE_ID_${pricePrefix}_AI_IMAGE`] || '',
      [UsageFeature.AI_VIDEO]: process.env[`STRIPE_PRICE_ID_${pricePrefix}_AI_VIDEO`] || '',
    },
  };
}

/**
 * Get Stripe Price ID for a feature
 */
export function getStripePriceId(
  feature: UsageFeature,
  environment: 'staging' | 'production'
): string {
  const config = getStripeConfig(environment);
  const priceId = config.prices[feature];

  if (!priceId) {
    throw new Error(`No Stripe Price ID configured for feature: ${feature}`);
  }

  return priceId;
}

/**
 * Get unit cost for a feature (for snapshot in usage events)
 * This should match the Stripe Price configuration
 */
export function getUnitCost(feature: UsageFeature): number {
  // These values should match your Stripe Price configuration
  const costs: Record<UsageFeature, number> = {
    [UsageFeature.AI_CONTENT]: 0.01, // $0.01 per content generation
    [UsageFeature.AI_IMAGE]: 0.05, // $0.05 per image generation
    [UsageFeature.AI_VIDEO]: 0.2, // $0.20 per video generation
  };

  return costs[feature];
}

/**
 * Firestore collection names
 */
export const COLLECTIONS = {
  USAGE_EVENTS: 'usageEvents',
  STRIPE_CUSTOMERS: 'stripeCustomers',
  PAYMENT_LOGS: 'paymentLogs',
} as const;

/**
 * Pub/Sub topic names
 */
export const TOPICS = {
  USAGE_EVENTS: 'usage-events',
} as const;

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  MAX_RETRIES: 5,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 60000,
  BACKOFF_MULTIPLIER: 2,
} as const;
