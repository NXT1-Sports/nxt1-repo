import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_APP_CONFIG_CACHE_TTL_MS,
  DEFAULT_AGENT_APP_CONFIG,
  getCachedAgentAppConfig,
  getAgentAppConfig,
  isToolDisabled,
  parseAgentAppConfig,
  resetCachedAgentAppConfig,
  resolveAgentSystemPrompt,
  resolveModelFallbackChain,
  resolveModelForTier,
  resolveRolePersona,
  resolveSeasonInfo,
  setCachedAgentAppConfig,
} from '../agent-app-config.js';

describe('agent-app-config', () => {
  afterEach(() => {
    resetCachedAgentAppConfig();
    setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);
  });

  it('ignores legacy flat operational limit fields for /agent runtime config', () => {
    const config = parseAgentAppConfig({
      maxAgenticTurns: 9,
      maxDelegationDepth: 4,
      maxJobAttempts: 3,
      retryBackoffMs: 2500,
      taskMaxRetries: 5,
    });

    expect(config.operationalLimits).toEqual(DEFAULT_AGENT_APP_CONFIG.operationalLimits);
  });

  it('uses grouped operational limits only', () => {
    const config = parseAgentAppConfig({
      maxAgenticTurns: 99,
      operationalLimits: {
        maxAgenticTurns: 9,
        maxDelegationDepth: 4,
        maxJobAttempts: 3,
        retryBackoffMs: 2500,
        taskMaxRetries: 5,
      },
    });

    expect(config.operationalLimits).toEqual({
      maxAgenticTurns: 9,
      maxDelegationDepth: 4,
      maxJobAttempts: 3,
      retryBackoffMs: 2500,
      taskMaxRetries: 5,
    });
  });

  it('parses grouped domain knowledge and resolves from the cache', () => {
    const config = parseAgentAppConfig({
      domainKnowledge: {
        rolePersonas: {
          athlete: 'Custom athlete persona.',
          coach: 'Custom coach persona.',
        },
        sportAliases: {
          hoops: 'basketball',
        },
        sportSeasons: {
          basketball: Array.from({ length: 12 }, (_, month) => ({
            phase: `Phase ${month + 1}`,
            focus: `Focus ${month + 1}`,
          })),
        },
      },
    });

    setCachedAgentAppConfig(config);

    expect(resolveRolePersona('athlete')).toBe('Custom athlete persona.');
    expect(resolveSeasonInfo('hoops', new Date('2026-03-10T00:00:00Z'))).toEqual({
      phase: 'Phase 3',
      focus: 'Focus 3',
    });
  });

  it('falls back to defaults when grouped values are invalid', () => {
    const config = parseAgentAppConfig({
      domainKnowledge: {
        sportSeasons: {
          football: [{ phase: 'Only one month', focus: 'Invalid shape' }],
        },
      },
    });

    expect(config).toEqual(DEFAULT_AGENT_APP_CONFIG);
  });

  it('exposes a safe cached default before firestore hydration', () => {
    setCachedAgentAppConfig(DEFAULT_AGENT_APP_CONFIG);

    expect(getCachedAgentAppConfig()).toEqual(DEFAULT_AGENT_APP_CONFIG);
    expect(resolveRolePersona('unknown-role')).toBe(
      DEFAULT_AGENT_APP_CONFIG.domainKnowledge.rolePersonas.athlete
    );
  });

  it('normalizes model routing overrides so the configured primary is always first', () => {
    const config = parseAgentAppConfig({
      modelRouting: {
        catalogue: {
          chat: 'openai/gpt-4o-mini',
        },
        fallbackChains: {
          chat: ['anthropic/claude-haiku-4-5', 'openai/gpt-4o-mini', 'qwen/qwen3.6-plus'],
        },
      },
    });

    setCachedAgentAppConfig(config);

    expect(resolveModelForTier('chat')).toBe('openai/gpt-4o-mini');
    expect(resolveModelFallbackChain('chat')).toEqual([
      'openai/gpt-4o-mini',
      'anthropic/claude-haiku-4-5',
      'qwen/qwen3.6-plus',
    ]);
  });

  it('parses prompt overrides and interpolates template placeholders', () => {
    const config = parseAgentAppConfig({
      prompts: {
        plannerSystemPrompt: 'Plan for {{today}}.',
        agentSystemPrompts: {
          admin_coordinator: 'Compliance snapshot for {{today}}.',
        },
      },
    });

    setCachedAgentAppConfig(config);

    expect(resolveAgentSystemPrompt('router', 'fallback', { today: 'Tuesday' })).toBe(
      'Plan for Tuesday.'
    );
    expect(resolveAgentSystemPrompt('admin_coordinator', 'fallback', { today: 'Tuesday' })).toBe(
      'Compliance snapshot for Tuesday.'
    );
  });

  it('supports runtime tool kill switches', () => {
    const config = parseAgentAppConfig({
      featureFlags: {
        disabledTools: ['query_nxt1_platform_data'],
        disableEmailSending: true,
        disableImageGeneration: true,
      },
    });

    setCachedAgentAppConfig(config);

    expect(isToolDisabled('query_nxt1_platform_data')).toBe(true);
    expect(isToolDisabled('send_email')).toBe(true);
    expect(isToolDisabled('generate_graphic')).toBe(true);
    expect(isToolDisabled('search_web')).toBe(false);
  });

  it('reads AppConfig/agentConfig once and reuses the cached config within the TTL', async () => {
    resetCachedAgentAppConfig();

    const get = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        domainKnowledge: {
          rolePersonas: {
            athlete: 'Firestore athlete persona.',
          },
        },
      }),
    });

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ get })),
      })),
    } as never;

    const first = await getAgentAppConfig(db, { maxAgeMs: AGENT_APP_CONFIG_CACHE_TTL_MS });
    const second = await getAgentAppConfig(db, { maxAgeMs: AGENT_APP_CONFIG_CACHE_TTL_MS });

    expect(get).toHaveBeenCalledTimes(1);
    expect(first.domainKnowledge.rolePersonas.athlete).toBe('Firestore athlete persona.');
    expect(second.domainKnowledge.rolePersonas.athlete).toBe('Firestore athlete persona.');
  });
});
