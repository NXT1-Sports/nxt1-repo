/**
 * @fileoverview Billing Configuration
 * @module @nxt1/backend/modules/billing
 *
 * Configuration for Stripe and billing features
 */

import type { StripeConfig } from './types/index.js';
import { UsageFeature } from './types/index.js';
import { getUnitCostByFeature, type UsageFeatureId } from '@nxt1/core';
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

  const webhookSecret =
    environment === 'staging'
      ? process.env['STRIPE_TEST_WEBHOOK_SECRET']
      : process.env['STRIPE_WEBHOOK_SECRET'];
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
      // Media
      [UsageFeature.HIGHLIGHTS]: process.env[`STRIPE_PRICE_ID_${pricePrefix}_HIGHLIGHTS`] || '',
      [UsageFeature.MOTION_GRAPHICS]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_MOTION_GRAPHICS`] || '',
      [UsageFeature.GRAPHICS]: process.env[`STRIPE_PRICE_ID_${pricePrefix}_GRAPHICS`] || '',
      [UsageFeature.WRITE_UP_GRAPHIC]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_WRITE_UP_GRAPHIC`] || '',
      [UsageFeature.MEDIA_BUNDLES]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_MEDIA_BUNDLES`] || '',

      // Recruiting
      [UsageFeature.SCOUT_REPORT_BUNDLE]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_SCOUT_REPORT_BUNDLE`] || '',
      [UsageFeature.MATCH_COLLEGES]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_MATCH_COLLEGES`] || '',
      [UsageFeature.RECRUIT_STRATEGY]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_RECRUIT_STRATEGY`] || '',
      [UsageFeature.COLLEGE_VIEWS]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_COLLEGE_VIEWS`] || '',

      // AI
      [UsageFeature.ACTIVITY_USAGE]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_ACTIVITY_USAGE`] || '',

      // Communication
      [UsageFeature.EMAIL_CAMPAIGN]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_EMAIL_CAMPAIGN`] || '',
      [UsageFeature.FOLLOW_UPS]: process.env[`STRIPE_PRICE_ID_${pricePrefix}_FOLLOW_UPS`] || '',

      // Profile
      [UsageFeature.PROFILE_BANNERS]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_PROFILE_BANNERS`] || '',

      // Teams
      [UsageFeature.TEAM_PAGE_URL]:
        process.env[`STRIPE_PRICE_ID_${pricePrefix}_TEAM_PAGE_URL`] || '',
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
 * Get unit cost for a feature in cents (for snapshot in usage events).
 * Delegates to @nxt1/core — single source of truth for pricing.
 *
 * NOTE: This is the **static fallback** used when no dynamic cost is provided.
 * For AI-driven features, prefer passing `dynamicCostCents` from
 * `resolveAICost()` in cost-resolver.service.ts so the billed amount
 * reflects actual token usage instead of a fixed per-feature price.
 */
export function getUnitCost(feature: UsageFeature): number {
  return getUnitCostByFeature(feature as UsageFeatureId);
}

/**
 * Firestore collection names
 */
export const COLLECTIONS = {
  USAGE_EVENTS: 'usageEvents',
  STRIPE_CUSTOMERS: 'stripeCustomers',
  PAYMENT_LOGS: 'paymentLogs',
  BILLING_CONTEXTS: 'billingContexts',
  TEAM_BUDGET_ALLOCATIONS: 'teamBudgetAllocations',
  WALLET_HOLDS: 'walletHolds',
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
