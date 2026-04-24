/**
 * @fileoverview Dynamic Cost Resolver
 * @module @nxt1/backend/modules/billing
 *
 * Bridges AI provider costs (OpenRouter / Helicone) to NXT1 business pricing.
 *
 * The OpenRouter LLM service returns a raw `costUsd` on every response — that
 * is the platform's wholesale cost. This module applies a configurable margin
 * multiplier and converts the result to integer cents for the billing pipeline.
 *
 * Static-priced features (team pages, email campaigns) continue to use the
 * hardcoded `getUnitCost()` lookup. Dynamic features (anything involving LLM)
 * call `resolveAICost()` with the real provider cost.
 *
 * Gas-Station Pre-Auth:
 * For B2C wallet users, `estimateMaxCost()` provides a worst-case ceiling
 * before the LLM call fires, preventing over-spend on their prepaid balance.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { AGENT_MODEL_PRICING } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import { MODEL_CATALOGUE, BILLING_TIER_MAP } from '../agent/llm/llm.types.js';
import { getPlatformConfig, type PlatformBillingConfig } from './platform-config.service.js';

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Business margin applied to raw provider costs.
 * e.g. 3.0 means NXT1 charges 3× what OpenRouter charges us.
 * Override via process.env.NXT1_AI_MARGIN_MULTIPLIER.
 */
export const AI_MARGIN_MULTIPLIER: number = (() => {
  const envValue = process.env['NXT1_AI_MARGIN_MULTIPLIER'];
  if (envValue) {
    const parsed = Number(envValue);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    logger.warn('[cost-resolver] Invalid NXT1_AI_MARGIN_MULTIPLIER, using default', {
      envValue,
    });
  }
  return 3.0;
})();

/**
 * Minimum cost floor in cents. Even the cheapest prompt still costs at least
 * this amount so micro-calls don't get billed as $0.00.
 */
export const MIN_COST_CENTS = 1;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Convert a raw provider cost (USD float) into NXT1 business-priced cents.
 *
 * @param rawCostUsd - The wholesale cost from OpenRouter (e.g. 0.0023 = $0.0023).
 * @param marginMultiplier - Override the default margin. Defaults to `AI_MARGIN_MULTIPLIER`.
 * @returns Cost in integer cents (minimum `MIN_COST_CENTS`).
 *
 * @example
 * ```ts
 * const result = await llm.complete(messages, options);
 * const costCents = resolveAICost(result.costUsd);
 * // result.costUsd = 0.0023  →  costCents = 1 (Math.ceil(0.0023 * 3.0 * 100) = 1)
 * // result.costUsd = 0.15    →  costCents = 45 (Math.ceil(0.15 * 3.0 * 100) = 45)
 * ```
 */
export function resolveAICost(
  rawCostUsd: number,
  marginMultiplier: number = AI_MARGIN_MULTIPLIER
): number {
  if (!Number.isFinite(rawCostUsd) || rawCostUsd < 0) {
    logger.warn('[cost-resolver] Invalid rawCostUsd, defaulting to minimum', { rawCostUsd });
    return MIN_COST_CENTS;
  }

  const businessCostCents = Math.ceil(rawCostUsd * marginMultiplier * 100);
  return Math.max(businessCostCents, MIN_COST_CENTS);
}

/**
 * Estimate the **maximum possible cost** for an LLM call before it executes.
 * Used by the Gas-Station pre-auth pattern for B2C wallet users:
 *   1. `estimateMaxCost()` → returns worst-case cents
 *   2. Wallet balance check: balance ≥ estimate? proceed : reject 402
 *   3. Execute LLM call → get actual `costUsd`
 *   4. `resolveAICost(actual)` → deduct exact amount from wallet
 *
 * The estimate assumes max_tokens output at the model tier's output rate.
 * It will almost always overestimate, so the user is never charged more
 * than the actual resolved cost.
 *
 * @param modelTier - The tier key used by OpenRouter (e.g. 'balanced', 'fast').
 * @param maxOutputTokens - The max_tokens cap for this request (default 2048).
 * @param estimatedInputTokens - Approximate input tokens (default 500).
 * @returns Worst-case cost in integer cents with margin applied.
 */
export function estimateMaxCost(
  modelTier: string,
  maxOutputTokens: number = 2048,
  estimatedInputTokens: number = 500
): number {
  const catalogueKey = BILLING_TIER_MAP[modelTier] ?? 'routing';
  const modelSlug = MODEL_CATALOGUE[catalogueKey];
  const pricing = AGENT_MODEL_PRICING[modelSlug];

  if (!pricing) {
    // Unknown model — use conservative estimate ($15/M output = Claude Sonnet rate)
    const conservativeCostUsd = (estimatedInputTokens * 3.0 + maxOutputTokens * 15.0) / 1_000_000;
    return resolveAICost(conservativeCostUsd);
  }

  const rawCostUsd =
    (estimatedInputTokens * pricing.input + maxOutputTokens * pricing.output) / 1_000_000;

  return resolveAICost(rawCostUsd);
}

/**
 * Resolve cost for a multi-step AI operation (e.g. highlight reel generation
 * that involves multiple LLM calls). Takes an array of per-step costs and
 * sums them.
 *
 * @param stepCosts - Array of raw USD floats from each OpenRouter call.
 * @returns Total business-priced cents.
 */
export function resolveMultiStepAICost(stepCosts: readonly number[]): number {
  const totalRawUsd = stepCosts.reduce((sum, cost) => sum + cost, 0);
  return resolveAICost(totalRawUsd);
}

// ─── Dynamic Config Variants ────────────────────────────────────────────────

/**
 * Like `resolveAICost` but reads margin multiplier and min floor from Firestore
 * via `getPlatformConfig()`. Falls back to hardcoded defaults if the config
 * document is missing.
 */
export async function resolveAICostDynamic(db: Firestore, rawCostUsd: number): Promise<number> {
  const config = await getPlatformConfig(db);
  return resolveAICost(rawCostUsd, config.aiMarginMultiplier);
}

/**
 * Like `estimateMaxCost` but reads the model tier map, fallback rates, and
 * margin multiplier from Firestore via `getPlatformConfig()`.
 */
export async function estimateMaxCostDynamic(
  db: Firestore,
  modelTier: string,
  maxOutputTokens: number = 2048,
  estimatedInputTokens: number = 500
): Promise<number> {
  const config = await getPlatformConfig(db);
  return estimateMaxCostWithConfig(config, modelTier, maxOutputTokens, estimatedInputTokens);
}

/**
 * Pure helper — calculates max cost given an explicit config.
 * Used by `estimateMaxCostDynamic` and available for callers that already
 * hold a loaded config.
 */
export function estimateMaxCostWithConfig(
  config: PlatformBillingConfig,
  modelTier: string,
  maxOutputTokens: number = 2048,
  estimatedInputTokens: number = 500
): number {
  const modelSlug = config.modelTierMap[modelTier] ?? 'anthropic/claude-sonnet-4';
  const pricing = AGENT_MODEL_PRICING[modelSlug];

  if (!pricing) {
    const conservativeCostUsd =
      (estimatedInputTokens * config.fallbackInputRatePerMillion +
        maxOutputTokens * config.fallbackOutputRatePerMillion) /
      1_000_000;
    return resolveAICost(conservativeCostUsd, config.aiMarginMultiplier);
  }

  const rawCostUsd =
    (estimatedInputTokens * pricing.input + maxOutputTokens * pricing.output) / 1_000_000;

  return resolveAICost(rawCostUsd, config.aiMarginMultiplier);
}

/**
 * Like `resolveMultiStepAICost` but reads margin from Firestore.
 */
export async function resolveMultiStepAICostDynamic(
  db: Firestore,
  stepCosts: readonly number[]
): Promise<number> {
  const config = await getPlatformConfig(db);
  const totalRawUsd = stepCosts.reduce((sum, cost) => sum + cost, 0);
  return resolveAICost(totalRawUsd, config.aiMarginMultiplier);
}
