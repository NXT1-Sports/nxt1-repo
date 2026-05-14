import type { ModelTier } from '@nxt1/core';
import {
  getCachedAgentAppConfig,
  type AgentAppConfig,
  resolveModelForTier,
  resolveModelFallbackChain,
} from '../config/agent-app-config.js';

const CONTEXT_WINDOW_SAFETY_RATIO = 0.75;
const MIN_PROMPT_TOKENS = 2_048;

/**
 * OpenRouter model context windows (input + output) used for conservative
 * prompt-budget sizing. Values are intentionally conservative so the fallback
 * chain can always accept the prompt payload.
 */
const MODEL_CONTEXT_WINDOWS: Readonly<Record<string, number>> = {
  'anthropic/claude-haiku-4.5': 200_000,
  'anthropic/claude-sonnet-4': 200_000,
  'anthropic/claude-sonnet-4.5': 200_000,
  'anthropic/claude-opus-4.5': 200_000,
  'anthropic/claude-opus-4.7': 200_000,
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
  'deepseek/deepseek-v3.2': 128_000,
  'google/gemini-2.5-flash': 1_000_000,
  'google/gemini-2.5-pro': 1_000_000,
  'google/gemini-3.1-pro-preview': 1_000_000,
} as const;

function normalizeModelSlug(model: string): string {
  return model
    .trim()
    .replace(/^~/, '')
    .replace(/:free$/, '');
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

export function normalizeModelSlugForBudget(model: string): string {
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
  const fallbackChain = resolveModelFallbackChain(tier, config);
  const consideredModels = fallbackChain.map((model) => normalizeModelSlug(model));

  const primaryWindowTokens = MODEL_CONTEXT_WINDOWS[primaryModel];
  const knownWindows = consideredModels
    .map((model) => MODEL_CONTEXT_WINDOWS[model])
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
