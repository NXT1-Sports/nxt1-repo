import { describe, expect, it } from 'vitest';
import { parseAgentAppConfig } from '../../config/agent-app-config.js';
import {
  normalizeModelSlugForBudget,
  resolvePromptBudgetForTier,
  resolvePromptBudgetPolicyForTier,
} from '../model-context-window.service.js';

describe('resolvePromptBudgetForTier', () => {
  it('uses model-aware ceiling when configured max exceeds fallback-safe model window budget', () => {
    const config = parseAgentAppConfig({
      primary: {
        maxPromptTokens: 300_000,
      },
      modelRouting: {
        catalogue: {
          chat: 'google/gemini-2.5-flash',
        },
        fallbackChains: {
          chat: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
        },
      },
    });

    const result = resolvePromptBudgetForTier('chat', config);

    // fallback-safe window = min(1,000,000, 128,000) = 128,000
    // model-aware ceiling = floor(128,000 * 0.75) = 96,000
    expect(result.maxPromptTokens).toBe(96_000);
    expect(result.source).toBe('model_aware');
    expect(result.modelWindowTokens).toBe(128_000);
    expect(result.consideredModels).toEqual(['google/gemini-2.5-flash', 'openai/gpt-4o-mini']);
  });

  it('keeps configured ceiling when it is already lower than model-aware cap', () => {
    const config = parseAgentAppConfig({
      primary: {
        maxPromptTokens: 40_000,
      },
      modelRouting: {
        catalogue: {
          chat: 'anthropic/claude-haiku-4.5',
        },
        fallbackChains: {
          chat: ['anthropic/claude-haiku-4.5'],
        },
      },
    });

    const result = resolvePromptBudgetForTier('chat', config);

    expect(result.maxPromptTokens).toBe(40_000);
    expect(result.source).toBe('configured');
    expect(result.modelWindowTokens).toBe(200_000);
  });

  it('falls back to configured ceiling when model windows are unknown', () => {
    const config = parseAgentAppConfig({
      primary: {
        maxPromptTokens: 55_000,
      },
      modelRouting: {
        catalogue: {
          chat: 'acme/unknown-model',
        },
        fallbackChains: {
          chat: ['acme/unknown-model', 'acme/unknown-model-2'],
        },
      },
    });

    const result = resolvePromptBudgetForTier('chat', config);

    expect(result.maxPromptTokens).toBe(55_000);
    expect(result.source).toBe('configured');
    expect(result.modelWindowTokens).toBeUndefined();
    expect(result.consideredModels).toEqual(['acme/unknown-model', 'acme/unknown-model-2']);
  });

  it('normalizes OpenRouter slug aliases before lookup', () => {
    const config = parseAgentAppConfig({
      primary: {
        maxPromptTokens: 300_000,
      },
      modelRouting: {
        catalogue: {
          chat: '~anthropic/claude-sonnet-latest',
        },
        fallbackChains: {
          chat: ['~anthropic/claude-sonnet-latest', 'openai/gpt-4o-mini:free'],
        },
      },
    });

    const result = resolvePromptBudgetForTier('chat', config);

    expect(result.consideredModels).toEqual([
      'anthropic/claude-sonnet-latest',
      'openai/gpt-4o-mini',
    ]);
    expect(result.maxPromptTokens).toBe(96_000);
    expect(result.source).toBe('model_aware');
  });

  it('returns primary budget larger than fallback-safe budget when primary model supports more context', () => {
    const config = parseAgentAppConfig({
      primary: {
        maxPromptTokens: 300_000,
      },
      modelRouting: {
        catalogue: {
          chat: 'google/gemini-2.5-flash',
        },
        fallbackChains: {
          chat: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
        },
      },
    });

    const policy = resolvePromptBudgetPolicyForTier('chat', config);

    expect(policy.primaryModel).toBe('google/gemini-2.5-flash');
    expect(policy.primaryBudget.maxPromptTokens).toBe(300_000);
    expect(policy.fallbackSafeBudget.maxPromptTokens).toBe(96_000);
    expect(policy.primaryBudget.maxPromptTokens).toBeGreaterThan(
      policy.fallbackSafeBudget.maxPromptTokens
    );
  });

  it('normalizes model slugs for budget comparison', () => {
    expect(normalizeModelSlugForBudget('~anthropic/claude-sonnet-latest')).toBe(
      'anthropic/claude-sonnet-latest'
    );
    expect(normalizeModelSlugForBudget('openai/gpt-4o-mini:free')).toBe('openai/gpt-4o-mini');
  });
});
