/**
 * @fileoverview Billing Configuration
 * @module @nxt1/backend/modules/billing
 *
 * Configuration for Stripe and billing features
 */

import type { StripeConfig } from './types/index.js';
import { getUsageProductConfig } from '@nxt1/core/usage';
import { logger } from '../../utils/logger.js';

function getPricePrefix(environment: 'staging' | 'production'): 'STAGING' | 'PRODUCTION' {
  return environment === 'staging' ? 'STAGING' : 'PRODUCTION';
}

function normalizeFeatureEnvSuffix(feature: string): string {
  return feature
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

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

  // Safety check: live key must not be used for the staging billing environment.
  // We intentionally check `environment` (the Stripe target), not NODE_ENV, because
  // the backend may run without NODE_ENV set in local/container dev while still
  // legitimately connecting to the production Stripe account.
  if (secretKey && environment === 'staging' && secretKey.includes('live')) {
    throw new Error(
      '❌ STRIPE SAFETY: Live Stripe key detected for staging billing environment. ' +
        'Use STRIPE_TEST_SECRET_KEY for staging/development.'
    );
  }

  // Warning: test key in production billing environment
  if (secretKey && environment === 'production' && secretKey.includes('test')) {
    logger.warn(
      '⚠️  STRIPE SAFETY: Test Stripe key detected in production billing environment. Verify this is intentional.'
    );
  }

  // Get price IDs based on environment
  return {
    secretKey: secretKey || '',
    webhookSecret: webhookSecret || '',
    enabled: enabled && !!secretKey,
    prices: {},
  };
}

/**
 * Get Stripe Price ID for a feature
 */
export function getStripePriceId(feature: string, environment: 'staging' | 'production'): string {
  const pricePrefix = getPricePrefix(environment);
  const envKey = `STRIPE_PRICE_ID_${pricePrefix}_${normalizeFeatureEnvSuffix(feature)}`;
  const priceId = process.env[envKey] || '';

  // Dynamic-cost features (e.g. chat-conversation) may not have a Stripe
  // price mapping. Return empty string so usage events are still written
  // for dashboard aggregation — Stripe reporting skips events with no priceId.
  if (!priceId) {
    logger.warn('[getStripePriceId] No Stripe Price ID configured — dynamic pricing assumed', {
      feature,
      environment,
      envKey,
    });
  }
  return priceId || '';
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
export function getUnitCost(feature: string): number {
  const config = getUsageProductConfig(feature);
  if (!config) {
    logger.warn('[getUnitCost] Unknown dynamic feature — defaulting static fallback to 0', {
      feature,
    });
    return 0;
  }

  return config.unitPrice;
}

/**
 * Firestore collection names (MongoDB-backed collections removed after migration)
 */
export const COLLECTIONS = {
  STRIPE_CUSTOMERS: 'StripeCustomers',
  WALLETS: 'Wallets',
  BILLING_PREFERENCES: 'BillingPreferences',
  PERIOD_LEDGERS: 'PeriodLedgers',
  CHECKOUT_SESSION_FINALIZATIONS: 'StripeCheckoutFinalizations',
  ORGANIZATION_BUDGETS: 'OrganizationBudgets',
  TEAM_BUDGET_ALLOCATIONS: 'teamBudgetAllocations',
  WALLET_HOLDS: 'WalletHolds',
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
