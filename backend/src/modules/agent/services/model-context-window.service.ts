import type { ModelTier } from '@nxt1/core';
import {
  getCachedAgentAppConfig,
  type AgentAppConfig,
  resolveModelForTier,
  resolveModelFallbackChain,
} from '../config/agent-app-config.js';
import { logger } from '../../../utils/logger.js';

const CONTEXT_WINDOW_SAFETY_RATIO = 0.75;
const MIN_PROMPT_TOKENS = 2_048;
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const MODEL_CONTEXT_WINDOW_CACHE_TTL_MS = 60 * 60 * 1000;

type OpenRouterModelSummary = {
  readonly id?: string;
  readonly context_length?: number;
};

type OpenRouterModelsResponse = {
  readonly data?: readonly OpenRouterModelSummary[];
};

type ModelContextWindowCache = {
  readonly windows: Readonly<Record<string, number>>;
  readonly fetchedAtMs: number;
};

/**
 * OpenRouter model context windows (input + output) used for conservative
 * prompt-budget sizing. Values are intentionally conservative so the fallback
 * chain can always accept the prompt payload.
 */
const FALLBACK_MODEL_CONTEXT_WINDOWS: Readonly<Record<string, number>> = {
  'anthropic/claude-haiku-4.5': 200_000,
  'anthropic/claude-sonnet-4': 200_000,
  'anthropic/claude-sonnet-4.5': 200_000,
  'anthropic/claude-opus-4.5': 200_000,
  'anthropic/claude-opus-4.7': 200_000,
  'anthropic/claude-opus-latest': 200_000,
  'openai/gpt-4o': 128_000,
  'openai/gpt-4o-mini': 128_000,
  'openai/o1': 200_000,
  'openai/o3-deep-research': 200_000,
  'openai/gpt-chat-latest': 128_000,
  'openai/gpt-5.5': 200_000,
  'openai/gpt-5.5-pro': 200_000,
  'mistralai/mistral-medium-3-5': 128_000,
  'qwen/qwen3.6-plus': 128_000,
  'x-ai/grok-4.3': 128_000,
  'moonshotai/kimi-latest': 128_000,
  'deepseek/deepseek-v3.2': 128_000,
  'deepseek/deepseek-v4-pro': 128_000,
  'google/gemini-2.5-flash': 1_000_000,
  'google/gemini-2.5-pro': 1_000_000,
  'google/gemini-3.1-pro-preview': 1_000_000,
} as const;

let modelContextWindowCache: ModelContextWindowCache | null = null;
let modelContextWindowRefreshPromise: Promise<Readonly<Record<string, number>>> | null = null;

function normalizeModelSlug(model: string | null | undefined): string {
  return (typeof model === 'string' ? model : '')
    .trim()
    .replace(/^~/, '')
    .replace(/:free$/, '');
}

function buildModelWindowMap(
  models: readonly OpenRouterModelSummary[]
): Readonly<Record<string, number>> {
  const entries = models
    .map((model) => {
      const id = typeof model.id === 'string' ? normalizeModelSlug(model.id) : '';
      const contextLength = model.context_length;
      if (!id || typeof contextLength !== 'number' || !Number.isFinite(contextLength)) {
        return null;
      }

      const normalizedContextLength = Math.floor(contextLength);
      if (normalizedContextLength < MIN_PROMPT_TOKENS) {
        return null;
      }

      return [id, normalizedContextLength] as const;
    })
    .filter((entry): entry is readonly [string, number] => entry !== null);

  return Object.freeze(Object.fromEntries(entries));
}

function getCachedModelWindowMap(nowMs = Date.now()): Readonly<Record<string, number>> {
  if (!modelContextWindowCache) {
    return FALLBACK_MODEL_CONTEXT_WINDOWS;
  }

  if (nowMs - modelContextWindowCache.fetchedAtMs >= MODEL_CONTEXT_WINDOW_CACHE_TTL_MS) {
    void refreshModelContextWindows().catch((error) => {
      logger.warn('OpenRouter model window background refresh failed; keeping cached values', {
        error,
      });
    });
  }

  return modelContextWindowCache.windows;
}

function resolveKnownWindowTokens(
  model: string,
  windows: Readonly<Record<string, number>>
): number | undefined {
  return windows[model] ?? FALLBACK_MODEL_CONTEXT_WINDOWS[model];
}

export async function refreshModelContextWindows(
  fetchImpl: typeof fetch = fetch
): Promise<Readonly<Record<string, number>>> {
  if (modelContextWindowRefreshPromise) {
    return modelContextWindowRefreshPromise;
  }

  const apiKey = process.env['OPENROUTER_API_KEY']?.trim();
  if (!apiKey) {
    logger.info('OpenRouter model window refresh skipped; OPENROUTER_API_KEY missing');
    return getCachedModelWindowMap();
  }

  modelContextWindowRefreshPromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetchImpl(OPENROUTER_MODELS_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenRouter model catalogue request failed: ${response.status}`);
      }

      const payload = (await response.json()) as OpenRouterModelsResponse;
      const windows = buildModelWindowMap(payload.data ?? []);
      if (Object.keys(windows).length === 0) {
        throw new Error('OpenRouter model catalogue did not return any valid context windows.');
      }

      modelContextWindowCache = {
        windows,
        fetchedAtMs: Date.now(),
      };

      logger.info('OpenRouter model window cache refreshed', {
        modelCount: Object.keys(windows).length,
        cacheTtlMs: MODEL_CONTEXT_WINDOW_CACHE_TTL_MS,
      });

      return windows;
    } finally {
      clearTimeout(timeout);
      modelContextWindowRefreshPromise = null;
    }
  })().catch((error) => {
    logger.warn('OpenRouter model window refresh failed; falling back to static map', {
      error,
    });
    throw error;
  });

  return modelContextWindowRefreshPromise;
}

export function primeModelContextWindowsCache(windows: Record<string, number> | null): void {
  modelContextWindowCache = windows
    ? {
        windows: Object.freeze({
          ...windows,
        }),
        fetchedAtMs: Date.now(),
      }
    : null;
}

export interface ResolvedPromptBudget {
  readonly maxPromptTokens: number;
  readonly maxMessageChars: number;
  readonly maxToolResultChars: number;
  readonly source: 'configured' | 'model_aware';
  readonly modelWindowTokens?: number;
  readonly safetyRatio?: number;
  readonly consideredModels: readonly string[];
}

export interface PromptBudgetPolicy {
  readonly primaryModel: string;
  readonly primaryBudget: ResolvedPromptBudget;
  readonly fallbackSafeBudget: ResolvedPromptBudget;
}

export function normalizeModelSlugForBudget(model: string | null | undefined): string {
  return normalizeModelSlug(model);
}

function buildBudget(
  configured: AgentAppConfig['primary'],
  consideredModels: readonly string[],
  knownWindowTokens: number | undefined
): ResolvedPromptBudget {
  if (!knownWindowTokens) {
    return {
      maxPromptTokens: configured.maxPromptTokens,
      maxMessageChars: configured.maxMessageChars,
      maxToolResultChars: configured.maxToolResultChars,
      source: 'configured',
      consideredModels,
    };
  }

  const modelAwareCeiling = Math.max(
    MIN_PROMPT_TOKENS,
    Math.floor(knownWindowTokens * CONTEXT_WINDOW_SAFETY_RATIO)
  );
  const maxPromptTokens = Math.min(configured.maxPromptTokens, modelAwareCeiling);

  return {
    maxPromptTokens,
    maxMessageChars: configured.maxMessageChars,
    maxToolResultChars: configured.maxToolResultChars,
    source: maxPromptTokens < configured.maxPromptTokens ? 'model_aware' : 'configured',
    modelWindowTokens: knownWindowTokens,
    safetyRatio: CONTEXT_WINDOW_SAFETY_RATIO,
    consideredModels,
  };
}

export function resolvePromptBudgetPolicyForTier(
  tier: ModelTier,
  config: AgentAppConfig = getCachedAgentAppConfig()
): PromptBudgetPolicy {
  const configured = config.primary;
  const primaryModel = normalizeModelSlug(resolveModelForTier(tier, config));
  const fallbackChain = resolveModelFallbackChain(tier, config) ?? [];
  const consideredModels = (fallbackChain.length > 0 ? fallbackChain : [primaryModel])
    .map((model) => normalizeModelSlug(model))
    .filter((model) => model.length > 0);
  const modelWindows = getCachedModelWindowMap();

  const primaryWindowTokens = resolveKnownWindowTokens(primaryModel, modelWindows);
  const knownWindows = consideredModels
    .map((model) => resolveKnownWindowTokens(model, modelWindows))
    .filter((tokens): tokens is number => typeof tokens === 'number' && tokens > 0);
  const fallbackSafeWindow = knownWindows.length > 0 ? Math.min(...knownWindows) : undefined;

  return {
    primaryModel,
    primaryBudget: buildBudget(configured, [primaryModel], primaryWindowTokens),
    fallbackSafeBudget: buildBudget(configured, consideredModels, fallbackSafeWindow),
  };
}

export function resolvePromptBudgetForTier(
  tier: ModelTier,
  config: AgentAppConfig = getCachedAgentAppConfig()
): ResolvedPromptBudget {
  return resolvePromptBudgetPolicyForTier(tier, config).fallbackSafeBudget;
}
