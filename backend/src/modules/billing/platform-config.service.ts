/**
 * @fileoverview Platform Config Service
 * @module @nxt1/backend/modules/billing
 *
 * Dynamically cached platform configuration stored in Firestore.
 * Allows changing pricing, multipliers, thresholds, and model mappings
 * without deploying code changes.
 *
 * Config is read from the `platformConfig/billing` document and cached
 * in memory with a configurable TTL (default 5 minutes).
 */

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Platform billing configuration — stored in Firestore `platformConfig/billing`.
 * Every field has a hardcoded fallback so the system works even if the
 * Firestore document doesn't exist yet.
 */
export interface PlatformBillingConfig {
  /**
   * Business margin applied to raw AI provider costs.
   * e.g. 3.0 means NXT1 charges 3× what OpenRouter charges us.
   */
  aiMarginMultiplier: number;

  /**
   * Minimum cost floor in cents. Even the cheapest prompt costs at least this.
   */
  minCostCents: number;

  /**
   * Wallet balance threshold (in cents) for low-balance notifications.
   */
  lowBalanceThresholdCents: number;

  /**
   * Model tier → model slug mapping for cost estimation.
   * Keys: 'fast', 'balanced', 'reasoning', 'creative'
   * Values: OpenRouter model slugs (e.g. 'anthropic/claude-3.5-haiku')
   */
  modelTierMap: Record<string, string>;

  /**
   * Default conservative per-million-token rates for unknown models.
   * Used as fallback when model pricing is not available.
   */
  fallbackInputRatePerMillion: number;
  fallbackOutputRatePerMillion: number;

  /**
   * Default monthly budgets in cents.
   */
  defaultIndividualBudget: number;
  defaultTeamBudget: number;
  defaultOrganizationBudget: number;

  /**
   * Wallet hold expiry in milliseconds.
   */
  holdExpiryMs: number;

  /**
   * Net 30 days until due for B2B invoices.
   */
  b2bDaysUntilDue: number;
}

// ─── Hardcoded Fallbacks ────────────────────────────────────────────────────

const FALLBACK_CONFIG: PlatformBillingConfig = {
  aiMarginMultiplier: 3.0,
  minCostCents: 1,
  lowBalanceThresholdCents: 200, // $2.00
  modelTierMap: {
    fast: 'anthropic/claude-3.5-haiku',
    balanced: 'anthropic/claude-3.5-sonnet',
    reasoning: 'anthropic/claude-3.5-sonnet',
    creative: 'anthropic/claude-3.5-sonnet',
  },
  fallbackInputRatePerMillion: 3.0,
  fallbackOutputRatePerMillion: 15.0,
  defaultIndividualBudget: 2000, // $20
  defaultTeamBudget: 20000, // $200
  defaultOrganizationBudget: 50000, // $500
  holdExpiryMs: 10 * 60 * 1000, // 10 minutes
  b2bDaysUntilDue: 30,
};

// ─── In-Memory Cache ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedConfig: PlatformBillingConfig | null = null;
let cacheTimestamp = 0;

/**
 * Get the platform billing configuration.
 *
 * Reads from Firestore `platformConfig/billing` and caches in memory.
 * Falls back to hardcoded defaults if the document doesn't exist or
 * Firestore is unavailable.
 *
 * @param db Firestore instance
 * @returns Platform billing configuration
 */
export async function getPlatformConfig(db: Firestore): Promise<PlatformBillingConfig> {
  const now = Date.now();

  // Return cached config if still fresh
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const doc = await db.collection('platformConfig').doc('billing').get();

    if (!doc.exists) {
      logger.info('[platform-config] No Firestore config found, using hardcoded fallbacks');
      cachedConfig = { ...FALLBACK_CONFIG };
      cacheTimestamp = now;
      return cachedConfig;
    }

    const data = doc.data()!;

    // Merge with fallbacks — any missing field uses the default
    cachedConfig = {
      aiMarginMultiplier:
        typeof data['aiMarginMultiplier'] === 'number' && data['aiMarginMultiplier'] > 0
          ? data['aiMarginMultiplier']
          : FALLBACK_CONFIG.aiMarginMultiplier,
      minCostCents:
        typeof data['minCostCents'] === 'number' && data['minCostCents'] >= 0
          ? data['minCostCents']
          : FALLBACK_CONFIG.minCostCents,
      lowBalanceThresholdCents:
        typeof data['lowBalanceThresholdCents'] === 'number' &&
        data['lowBalanceThresholdCents'] >= 0
          ? data['lowBalanceThresholdCents']
          : FALLBACK_CONFIG.lowBalanceThresholdCents,
      modelTierMap:
        typeof data['modelTierMap'] === 'object' && data['modelTierMap'] !== null
          ? { ...FALLBACK_CONFIG.modelTierMap, ...(data['modelTierMap'] as Record<string, string>) }
          : FALLBACK_CONFIG.modelTierMap,
      fallbackInputRatePerMillion:
        typeof data['fallbackInputRatePerMillion'] === 'number'
          ? data['fallbackInputRatePerMillion']
          : FALLBACK_CONFIG.fallbackInputRatePerMillion,
      fallbackOutputRatePerMillion:
        typeof data['fallbackOutputRatePerMillion'] === 'number'
          ? data['fallbackOutputRatePerMillion']
          : FALLBACK_CONFIG.fallbackOutputRatePerMillion,
      defaultIndividualBudget:
        typeof data['defaultIndividualBudget'] === 'number'
          ? data['defaultIndividualBudget']
          : FALLBACK_CONFIG.defaultIndividualBudget,
      defaultTeamBudget:
        typeof data['defaultTeamBudget'] === 'number'
          ? data['defaultTeamBudget']
          : FALLBACK_CONFIG.defaultTeamBudget,
      defaultOrganizationBudget:
        typeof data['defaultOrganizationBudget'] === 'number'
          ? data['defaultOrganizationBudget']
          : FALLBACK_CONFIG.defaultOrganizationBudget,
      holdExpiryMs:
        typeof data['holdExpiryMs'] === 'number' && data['holdExpiryMs'] > 0
          ? data['holdExpiryMs']
          : FALLBACK_CONFIG.holdExpiryMs,
      b2bDaysUntilDue:
        typeof data['b2bDaysUntilDue'] === 'number' && data['b2bDaysUntilDue'] > 0
          ? data['b2bDaysUntilDue']
          : FALLBACK_CONFIG.b2bDaysUntilDue,
    };

    cacheTimestamp = now;

    logger.info('[platform-config] Config loaded from Firestore', {
      aiMarginMultiplier: cachedConfig.aiMarginMultiplier,
      minCostCents: cachedConfig.minCostCents,
      lowBalanceThresholdCents: cachedConfig.lowBalanceThresholdCents,
    });

    return cachedConfig;
  } catch (error) {
    logger.error('[platform-config] Failed to load config, using fallbacks', { error });

    // Use fallbacks if Firestore read fails
    if (!cachedConfig) {
      cachedConfig = { ...FALLBACK_CONFIG };
    }
    cacheTimestamp = now;
    return cachedConfig;
  }
}

/**
 * Invalidate the cached config. Call after an admin updates the Firestore document.
 */
export function invalidatePlatformConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
  logger.info('[platform-config] Cache invalidated');
}

/**
 * Get the hardcoded fallback config (useful for environments without Firestore).
 */
export function getFallbackConfig(): PlatformBillingConfig {
  return { ...FALLBACK_CONFIG };
}
