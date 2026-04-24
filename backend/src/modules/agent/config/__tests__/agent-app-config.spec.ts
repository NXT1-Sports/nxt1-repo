import { afterEach, describe, expect, it, vi } from 'vitest';
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
  resolveConfiguredCoordinatorsForRole,
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

  it('parses coordinator UI metadata for dynamic dashboard rendering', () => {
    const config = parseAgentAppConfig({
      coordinators: [
        {
          id: 'recruiting_coordinator',
          name: 'Recruiting Command',
          description: 'Custom recruiting coordinator',
          icon: 'mail',
          capabilities: ['coach_outreach'],
          availableForRoles: ['athlete', 'coach'],
          commands: [
            {
              id: 'recruiting-email',
              label: 'Draft Coach Outreach',
              subLabel: 'Custom template',
              icon: 'mail',
            },
          ],
          scheduledActions: [
            {
              id: 'recruiting-weekly',
              label: 'Weekly Outreach',
              icon: 'calendar',
            },
          ],
        },
      ],
    });

    const recruiting = config.coordinators.find((item) => item.id === 'recruiting_coordinator');
    expect(recruiting?.name).toBe('Recruiting Command');
    expect(recruiting?.availableForRoles).toEqual(['athlete', 'coach']);
    expect(recruiting?.commands[0]?.label).toBe('Draft Coach Outreach');
    expect(recruiting?.scheduledActions[0]?.id).toBe('recruiting-weekly');
  });

  it('filters configured coordinators by role visibility', () => {
    const config = parseAgentAppConfig({
      coordinators: [
        {
          id: 'admin_coordinator',
          name: 'Admin Coordinator',
          description: 'Admin tasks',
          icon: 'shield-checkmark',
          capabilities: ['operations_governance'],
          availableForRoles: ['coach'],
          commands: [{ id: 'admin-check', label: 'Compliance Check', icon: 'shieldCheck' }],
          scheduledActions: [],
        },
        {
          id: 'recruiting_coordinator',
          name: 'Recruiting Coordinator',
          description: 'Recruiting tasks',
          icon: 'mail',
          capabilities: ['coach_outreach'],
          availableForRoles: ['athlete'],
          commands: [{ id: 'recruiting-email', label: 'Draft Outreach', icon: 'mail' }],
          scheduledActions: [],
        },
      ],
    });

    const athleteCoordinators = resolveConfiguredCoordinatorsForRole('athlete', config);
    const coachCoordinators = resolveConfiguredCoordinatorsForRole('coach', config);

    expect(athleteCoordinators.map((item) => item.id)).toContain('recruiting_coordinator');
    expect(athleteCoordinators.map((item) => item.id)).not.toContain('admin_coordinator');
    expect(coachCoordinators.map((item) => item.id)).toContain('admin_coordinator');
    expect(coachCoordinators.map((item) => item.id)).not.toContain('recruiting_coordinator');
  });

  it('hydrates default coordinator command packs when config omits coordinator UI details', () => {
    const config = parseAgentAppConfig({});
    const coordinator = config.coordinators.find((item) => item.id === 'strategy_coordinator');

    expect(coordinator?.commands.length).toBeGreaterThan(0);
    expect(coordinator?.availableForRoles).toContain('athlete');
    expect(coordinator?.availableForRoles).toContain('coach');
    expect(coordinator?.availableForRoles).toContain('director');
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

  it('reuses the cached AppConfig across 50 reads within the TTL window', async () => {
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

    const reads = await Promise.all(
      Array.from({ length: 50 }, () =>
        getAgentAppConfig(db, { maxAgeMs: AGENT_APP_CONFIG_CACHE_TTL_MS })
      )
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(reads).toHaveLength(50);
    expect(
      reads.every(
        (config) => config.domainKnowledge.rolePersonas.athlete === 'Firestore athlete persona.'
      )
    ).toBe(true);
  });

  it('reloads AppConfig after the TTL expires', async () => {
    resetCachedAgentAppConfig();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'));

    let readCount = 0;
    const get = vi.fn().mockImplementation(async () => {
      readCount += 1;
      const athletePersona =
        readCount === 1 ? 'Firestore athlete persona v1.' : 'Firestore athlete persona v2.';

      return {
        exists: true,
        data: () => ({
          domainKnowledge: {
            rolePersonas: {
              athlete: athletePersona,
            },
          },
        }),
      };
    });

    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ get })),
      })),
    } as never;

    const first = await getAgentAppConfig(db, { maxAgeMs: AGENT_APP_CONFIG_CACHE_TTL_MS });
    vi.advanceTimersByTime(AGENT_APP_CONFIG_CACHE_TTL_MS + 1);
    const second = await getAgentAppConfig(db, { maxAgeMs: AGENT_APP_CONFIG_CACHE_TTL_MS });

    expect(get).toHaveBeenCalledTimes(2);
    expect(first.domainKnowledge.rolePersonas.athlete).toBe('Firestore athlete persona v1.');
    expect(second.domainKnowledge.rolePersonas.athlete).toBe('Firestore athlete persona v2.');

    vi.useRealTimers();
  });
});
