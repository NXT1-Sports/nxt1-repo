import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_APP_CONFIG_CACHE_TTL_MS,
  DEFAULT_AGENT_APP_CONFIG,
  getCachedAgentAppConfig,
  getAgentAppConfig,
  isToolDisabled,
  parseAgentAppConfig,
  resetCachedAgentAppConfig,
  resolveConfiguredCoordinatorActionForRole,
  resolveAgentSystemPrompt,
  resolvePlannerSystemPrompt,
  resolveEffortProfile,
  resolveModelRoutingForEffort,
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
          text: '~moonshotai/kimi-latest',
        },
        fallbackChains: {
          text: ['~moonshotai/kimi-latest', 'openai/gpt-chat-latest', '~google/gemini-pro-latest'],
        },
      },
    });

    setCachedAgentAppConfig(config);

    expect(resolveModelForTier('text')).toBe('~moonshotai/kimi-latest');
    expect(resolveModelFallbackChain('text')).toEqual([
      '~moonshotai/kimi-latest',
      'openai/gpt-chat-latest',
      '~google/gemini-pro-latest',
    ]);
  });

  it('parses Firestore effort profiles and resolves model routing for effort levels', () => {
    const config = parseAgentAppConfig({
      modelRouting: {
        defaultEffortLevel: 'high',
        effortProfiles: {
          high: {
            model: '~anthropic/claude-sonnet-latest',
            reasoningEffort: 'high',
            maxTokens: 16000,
            temperature: 0.4,
            thinkingBudgetTokens: 8000,
          },
          medium: {
            model: 'deepseek/deepseek-v4-pro',
            reasoningEffort: 'medium',
            maxTokens: 8192,
            temperature: 0.4,
            thinkingBudgetTokens: 4000,
          },
          low: {
            model: 'google/gemini-3.6-flash',
            reasoningEffort: 'low',
            maxTokens: 4096,
            temperature: 0.5,
            thinkingBudgetTokens: 2048,
          },
        },
      },
    });

    setCachedAgentAppConfig(config);

    const expectedCandidateModels = [
      'google/gemini-3.6-flash',
      ...resolveModelFallbackChain('text', config).filter(
        (slug) => slug !== 'google/gemini-3.6-flash'
      ),
    ];

    expect(resolveEffortProfile('medium').model).toBe('deepseek/deepseek-v4-pro');
    expect(resolveModelRoutingForEffort({ tier: 'text', temperature: 0 }, 'low')).toMatchObject({
      candidateModels: expectedCandidateModels,
      reasoningEffort: 'low',
      enableThinking: true,
      maxTokens: 4096,
    });
  });

  it('ignores Firestore prompt fields and keeps system prompts code-defined', () => {
    const config = parseAgentAppConfig({
      prompts: {
        plannerSystemPrompt: 'Plan for {{today}}.',
        primarySystemPrompt: 'Primary prompt injection for {{today}}.',
        classifierSystemPrompt: 'Classifier prompt injection.',
        conversationSystemPrompt: 'Conversation prompt injection.',
        agentSystemPrompts: {
          router: 'Chief of Staff briefing for {{today}}.',
          admin_coordinator: 'Compliance snapshot for {{today}}.',
        },
      },
    });

    setCachedAgentAppConfig(config);

    expect(config.prompts.agentSystemPrompts).toEqual({});
    expect(resolvePlannerSystemPrompt('planner fallback', { today: 'Tuesday' })).toBe(
      'planner fallback'
    );
    expect(
      resolveAgentSystemPrompt('router', 'hardcoded router fallback', { today: 'Tuesday' })
    ).toBe('hardcoded router fallback');
    expect(
      resolveAgentSystemPrompt('admin_coordinator', 'Base admin prompt for {{today}}.', {
        today: 'Tuesday',
      })
    ).toBe('Base admin prompt for Tuesday.');
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
    expect(isToolDisabled('batch_send_email')).toBe(true);
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
          roleUiOverrides: {
            athlete: {
              description: 'Athlete recruiting workflows',
              commands: [
                {
                  id: 'recruiting-athlete-email',
                  label: 'Draft My Outreach',
                  icon: 'mail',
                },
              ],
            },
          },
        },
      ],
    });

    const recruiting = config.coordinators.find((item) => item.id === 'recruiting_coordinator');
    expect(recruiting?.name).toBe('Recruiting Command');
    expect(recruiting?.availableForRoles).toEqual(['athlete', 'coach']);
    expect(recruiting?.commands[0]?.label).toBe('Draft Coach Outreach');
    expect(recruiting?.scheduledActions[0]?.id).toBe('recruiting-weekly');
    expect(recruiting?.roleUiOverrides.athlete?.commands?.[0]?.id).toBe('recruiting-athlete-email');
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

  it('keeps configured coordinator packs authoritative when commands are intentionally empty', () => {
    const config = parseAgentAppConfig({
      coordinators: [
        {
          id: 'strategy_coordinator',
          name: 'Strategy Coordinator',
          description: 'Manual strategy config',
          icon: 'compass',
          capabilities: [],
          availableForRoles: ['athlete'],
          commands: [],
          scheduledActions: [],
          roleUiOverrides: {},
        },
      ],
    });

    const coordinator = config.coordinators.find((item) => item.id === 'strategy_coordinator');

    expect(coordinator?.commands).toEqual([]);
    expect(coordinator?.scheduledActions).toEqual([]);
    expect(coordinator?.availableForRoles).toEqual(['athlete']);
  });

  it('ships role-aware default coordinator visibility', () => {
    const config = parseAgentAppConfig({});
    const strategy = config.coordinators.find((item) => item.id === 'strategy_coordinator');
    const admin = config.coordinators.find((item) => item.id === 'admin_coordinator');

    expect(strategy?.commands.length).toBeGreaterThan(0);
    expect(strategy?.availableForRoles).toEqual(['athlete', 'coach', 'director']);
    expect(admin?.availableForRoles).toEqual(['athlete', 'coach', 'director']);
  });

  it('expands default dashboard coordinator packs to six commands and four scheduled actions per role', () => {
    const config = parseAgentAppConfig({});
    const athleteAdmin = resolveConfiguredCoordinatorsForRole('athlete', config).find(
      (item) => item.id === 'admin_coordinator'
    );
    const coachBrand = resolveConfiguredCoordinatorsForRole('coach', config).find(
      (item) => item.id === 'brand_coordinator'
    );
    const directorPerformance = resolveConfiguredCoordinatorsForRole('director', config).find(
      (item) => item.id === 'performance_coordinator'
    );

    expect(athleteAdmin?.commands).toHaveLength(6);
    expect(athleteAdmin?.scheduledActions).toHaveLength(4);
    expect(coachBrand?.commands).toHaveLength(6);
    expect(coachBrand?.scheduledActions).toHaveLength(4);
    expect(directorPerformance?.commands).toHaveLength(6);
    expect(directorPerformance?.scheduledActions).toHaveLength(4);
  });

  it('applies role-specific coordinator UI overrides during dashboard resolution', () => {
    const config = parseAgentAppConfig({
      coordinators: [
        {
          id: 'recruiting_coordinator',
          name: 'Recruiting Coordinator',
          description: 'Base recruiting description',
          icon: 'mail',
          capabilities: ['coach_outreach'],
          availableForRoles: ['athlete', 'coach'],
          commands: [{ id: 'recruiting-base', label: 'Base Outreach', icon: 'mail' }],
          scheduledActions: [],
          roleUiOverrides: {
            athlete: {
              description: 'Athlete recruiting view',
              commands: [{ id: 'recruiting-athlete', label: 'My Outreach', icon: 'mail' }],
            },
            coach: {
              description: 'Coach recruiting view',
              commands: [{ id: 'recruiting-coach', label: 'Recruit Outreach', icon: 'mail' }],
            },
          },
        },
      ],
    });

    const athleteCoordinator = resolveConfiguredCoordinatorsForRole('athlete', config).find(
      (item) => item.id === 'recruiting_coordinator'
    );
    const coachCoordinator = resolveConfiguredCoordinatorsForRole('coach', config).find(
      (item) => item.id === 'recruiting_coordinator'
    );

    expect(athleteCoordinator?.description).toBe('Athlete recruiting view');
    expect(athleteCoordinator?.commands[0]?.id).toBe('recruiting-athlete');
    expect(coachCoordinator?.description).toBe('Coach recruiting view');
    expect(coachCoordinator?.commands[0]?.id).toBe('recruiting-coach');
  });

  it('strips hidden execution prompts from dashboard coordinator payloads', () => {
    const config = parseAgentAppConfig({
      coordinators: [
        {
          id: 'recruiting_coordinator',
          name: 'Recruiting Coordinator',
          description: 'Base recruiting description',
          icon: 'mail',
          capabilities: ['coach_outreach'],
          availableForRoles: ['athlete'],
          commands: [
            {
              id: 'recruiting-athlete',
              label: 'My Outreach',
              icon: 'mail',
              promptText: 'Please handle my recruiting outreach with a detailed action plan.',
              executionPrompt: 'Hidden execution prompt',
            },
          ],
          scheduledActions: [],
        },
      ],
    });

    const coordinator = resolveConfiguredCoordinatorsForRole('athlete', config).find(
      (item) => item.id === 'recruiting_coordinator'
    );

    expect(coordinator?.commands[0]).toEqual({
      id: 'recruiting-athlete',
      label: 'My Outreach',
      icon: 'mail',
      promptText: 'Please handle my recruiting outreach with a detailed action plan.',
    });
    expect('executionPrompt' in (coordinator?.commands[0] ?? {})).toBe(false);
  });

  it('resolves role-specific coordinator action prompts for backend execution', () => {
    const config = parseAgentAppConfig({
      coordinators: [
        {
          id: 'recruiting_coordinator',
          name: 'Recruiting Coordinator',
          description: 'Base recruiting description',
          icon: 'mail',
          capabilities: ['coach_outreach'],
          availableForRoles: ['athlete', 'coach'],
          commands: [
            {
              id: 'recruiting-base',
              label: 'Base Outreach',
              icon: 'mail',
              executionPrompt: 'Base hidden prompt',
            },
          ],
          scheduledActions: [],
          roleUiOverrides: {
            athlete: {
              description: 'Athlete recruiting view',
              commands: [
                {
                  id: 'recruiting-athlete',
                  label: 'My Outreach',
                  icon: 'mail',
                  executionPrompt: 'Athlete hidden prompt',
                },
              ],
            },
          },
        },
      ],
    });

    const athleteAction = resolveConfiguredCoordinatorActionForRole(
      'athlete',
      'recruiting_coordinator',
      'recruiting-athlete',
      'command',
      undefined,
      config
    );
    const coachAction = resolveConfiguredCoordinatorActionForRole(
      'coach',
      'recruiting_coordinator',
      'recruiting-base',
      'command',
      undefined,
      config
    );

    expect(athleteAction?.executionPrompt).toBe('Athlete hidden prompt');
    expect(coachAction?.executionPrompt).toBe('Base hidden prompt');
  });

  it('keeps highlight reel execution prompts action-first and full-window by default', () => {
    const action = resolveConfiguredCoordinatorActionForRole(
      'athlete',
      'brand_coordinator',
      'brand-highlight',
      'command',
      undefined,
      DEFAULT_AGENT_APP_CONFIG
    );

    expect(action?.executionPrompt).toContain('do not ask for A/B/C options');
    expect(action?.executionPrompt).toContain('preserve the full clip or full play window');
    expect(action?.executionPrompt).toContain('Use tight 3-7 second best-moment cuts only');
    expect(action?.executionPrompt).toContain('do not stop for confirmation');
    expect(action?.executionPrompt).toContain(
      'strongest branded, cinematic, coach-ready, or recruiting-ready highlight reel'
    );
    expect(action?.executionPrompt).toContain('animate that still with runway_generate_video');
    expect(action?.executionPrompt).toContain(
      'does not ask for a raw/simple cut, a clean merge only, or no intro'
    );
    expect(action?.executionPrompt).toContain(
      'did not explicitly ask for no intro or a plain merge, do not silently drop it'
    );
  });

  it('builds a detailed fallback execution prompt when an action label is sent but the action id misses', () => {
    const config = parseAgentAppConfig({
      coordinators: [
        {
          id: 'strategy_coordinator',
          name: 'Strategy Coordinator',
          description: 'Build game plans and execution strategy.',
          icon: 'compass',
          capabilities: [],
          availableForRoles: ['athlete'],
          commands: [{ id: 'strategy-game-plan', label: 'Game Plan', icon: 'compass' }],
          scheduledActions: [],
        },
      ],
    });

    const action = resolveConfiguredCoordinatorActionForRole(
      'athlete',
      'strategy_coordinator',
      'strategy-plan-v2',
      'command',
      'Game Plan',
      config
    );

    expect(action?.label).toBe('Game Plan');
    expect(action?.executionPrompt).toContain('Selected action: Game Plan.');
    expect(action?.executionPrompt).toContain('Execution requirements:');
    expect(action?.executionPrompt).toContain('Produce a concrete deliverable');
  });

  it('uses concept-first prompt text for brand creative dashboard actions', () => {
    const config = parseAgentAppConfig({
      coordinators: [
        {
          id: 'brand_coordinator',
          name: 'Brand Coordinator',
          description: 'Owns creative assets and brand media.',
          icon: 'sparkles',
          capabilities: ['creative_media'],
          availableForRoles: ['coach'],
          commands: [
            {
              id: 'brand-program-graphic',
              label: 'Program Overview Graphic',
              icon: 'sparkles',
              subLabel: 'Create a recruiting-ready program graphic',
            },
          ],
          scheduledActions: [],
        },
      ],
    });

    const coordinator = resolveConfiguredCoordinatorsForRole('coach', config).find(
      (item) => item.id === 'brand_coordinator'
    );

    expect(coordinator?.commands[0]?.promptText).toContain(
      'Start by proposing 3 creative directions'
    );
    expect(coordinator?.commands[0]?.promptText).not.toContain(
      'Give me the clearest deliverable, priorities, and next steps to act on immediately.'
    );
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
