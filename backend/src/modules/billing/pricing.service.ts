/**
 * @fileoverview Pricing Service — Cost-Based Multiplier Pricing
 * @module @nxt1/backend/modules/billing
 *
 * Calculates the amount to charge a user based on actual AI cost (from Helicone)
 * multiplied by a configurable margin multiplier stored in Firestore.
 *
 * Config stored in Firestore collection `AppConfig` doc `pricingConfig`:
 * {
 *   defaultMultiplier: 3.0,
 *   featureOverrides: {
 *     "brand_coordinator": 4.0,
 *     "recruiting_coordinator": 3.5,
 *     "playbook-generation": 2.5
 *   }
 * }
 *
 * `featureOverrides` is coordinator-first for open-ended agent execution.
 * Explicit feature overrides are still supported for fixed product flows.
 */

import { FieldValue, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface PricingConfig {
  defaultMultiplier: number;
  featureOverrides: Record<string, number>;
  updatedAt?: Timestamp | string;
}

export interface ChargeCalculation {
  actualCostUsd: number;
  multiplier: number;
  chargeAmountUsd: number;
  chargeAmountCents: number;
  feature: string;
  coordinatorId?: string;
  overrideSource: 'coordinator' | 'feature' | 'default';
}

const PRICING_CONFIG_COLLECTION = 'AppConfig';
const PRICING_CONFIG_DOC = 'pricingConfig';

// In-memory cache to avoid reading Firestore on every request
let configCache: { config: PricingConfig; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// CONFIG MANAGEMENT
// ============================================

/**
 * Fetch pricing config from Firestore (with in-memory cache).
 * Falls back to safe defaults if document doesn't exist.
 */
export async function getPricingConfig(db: Firestore): Promise<PricingConfig> {
  const now = Date.now();
  if (configCache && now - configCache.fetchedAt < CACHE_TTL_MS) {
    return configCache.config;
  }

  try {
    const snap = await db.collection(PRICING_CONFIG_COLLECTION).doc(PRICING_CONFIG_DOC).get();

    if (!snap.exists) {
      const defaults = getDefaultPricingConfig();
      configCache = { config: defaults, fetchedAt: now };
      return defaults;
    }

    const config = snap.data() as PricingConfig;
    configCache = { config, fetchedAt: now };
    return config;
  } catch (error) {
    logger.error('[pricing] Failed to fetch pricing config, using defaults', { error });
    return getDefaultPricingConfig();
  }
}

/**
 * Update pricing config in Firestore.
 * Used by admin APIs to update multiplier without a deploy.
 */
export async function updatePricingConfig(
  db: Firestore,
  updates: Partial<Pick<PricingConfig, 'defaultMultiplier' | 'featureOverrides'>>
): Promise<void> {
  await db
    .collection(PRICING_CONFIG_COLLECTION)
    .doc(PRICING_CONFIG_DOC)
    .set(
      {
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  // Invalidate cache
  configCache = null;

  logger.info('[pricing] Pricing config updated', { updates });
}

function getDefaultPricingConfig(): PricingConfig {
  return {
    defaultMultiplier: 3.0,
    featureOverrides: {},
  };
}

function resolveMultiplier(
  config: PricingConfig,
  feature: string,
  coordinatorId?: string
): { multiplier: number; overrideSource: ChargeCalculation['overrideSource'] } {
  if (coordinatorId) {
    const coordinatorMultiplier = config.featureOverrides[coordinatorId];
    if (typeof coordinatorMultiplier === 'number') {
      return { multiplier: coordinatorMultiplier, overrideSource: 'coordinator' };
    }
  }

  const featureMultiplier = config.featureOverrides[feature];
  if (typeof featureMultiplier === 'number') {
    return { multiplier: featureMultiplier, overrideSource: 'feature' };
  }

  return { multiplier: config.defaultMultiplier, overrideSource: 'default' };
}

// ============================================
// CHARGE CALCULATION
// ============================================

/**
 * Calculate the amount to charge a user for a given feature.
 *
 * charge = actualCostUsd × multiplier (feature-specific or default)
 *
 * @param db Firestore instance
 * @param actualCostUsd Actual AI cost from Helicone in USD
 * @param feature Feature identifier (e.g. 'scout-report', 'highlights')
 */
export async function calculateChargeAmount(
  db: Firestore,
  actualCostUsd: number,
  feature: string,
  coordinatorId?: string
): Promise<ChargeCalculation> {
  const config = await getPricingConfig(db);
  const { multiplier, overrideSource } = resolveMultiplier(config, feature, coordinatorId);

  const chargeAmountUsd = actualCostUsd * multiplier;
  const chargeAmountCents = Math.ceil(chargeAmountUsd * 100); // round up to protect margin

  logger.info('[pricing] Charge calculated', {
    feature,
    coordinatorId,
    overrideSource,
    actualCostUsd,
    multiplier,
    chargeAmountUsd,
    chargeAmountCents,
  });

  return {
    actualCostUsd,
    multiplier,
    chargeAmountUsd,
    chargeAmountCents,
    feature,
    ...(coordinatorId ? { coordinatorId } : {}),
    overrideSource,
  };
}

/**
 * Quick synchronous estimate using default multiplier (3×).
 * Use this only for pre-task budget gates where DB latency is unacceptable
 * and actual Helicone data is not yet available.
 *
 * @param estimatedCostUsd Estimated AI cost in USD
 * @param multiplier Multiplier to apply (defaults to 3.0)
 */
export function estimateChargeAmountSync(
  estimatedCostUsd: number,
  multiplier = 3.0
): { chargeAmountUsd: number; chargeAmountCents: number } {
  const chargeAmountUsd = estimatedCostUsd * multiplier;
  const chargeAmountCents = Math.ceil(chargeAmountUsd * 100);
  return { chargeAmountUsd, chargeAmountCents };
}
