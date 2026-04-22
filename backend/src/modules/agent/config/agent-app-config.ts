/**
 * @fileoverview Agent Run Configuration — Firestore-backed tuning knobs.
 *
 * All agent task-running limits are read at runtime from:
 *   Firestore → `AppConfig/agentConfig`
 *
 * Field reference:
 * ┌──────────────────────┬───────┬──────────────────────────────────────────────┐
 * │ Field                │ Type  │ Description                                  │
 * ├──────────────────────┼───────┼──────────────────────────────────────────────┤
 * │ taskMaxRetries       │ int64 │ Per-task self-correction retries in the DAG  │
 * │ maxDelegationDepth   │ int64 │ Max agent delegation hops before giving up   │
 * │ maxAgenticTurns      │ int64 │ Max agentic loop turns per SSE chat request  │
 * │ maxJobAttempts       │ int64 │ BullMQ job-level retry attempts              │
 * │ retryBackoffMs       │ int64 │ BullMQ exponential backoff seed (ms)         │
 * └──────────────────────┴───────┴──────────────────────────────────────────────┘
 *
 * All fields are optional — missing or invalid values fall back to built-in defaults.
 * No code deploy is needed to change these values.
 *
 * Speed-tuning notes:
 * - `retryBackoffMs` is the safest first lever for reducing retry idle time.
 * - `taskMaxRetries` should stay conservative so faster retries do not multiply load.
 * - `maxJobAttempts` controls BullMQ replays for entire jobs and should be changed only
 *   after validating queue pressure in staging.
 */

import {
  AGENT_DESCRIPTORS,
  type AgentDescriptor,
  type AgentIdentifier,
  type ModelTier,
} from '@nxt1/core';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  MODEL_CATALOGUE as DEFAULT_MODEL_CATALOGUE,
  MODEL_FALLBACK_CHAIN as DEFAULT_MODEL_FALLBACK_CHAIN,
} from '../llm/llm.types.js';
import { logger } from '../../../utils/logger.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const APP_CONFIG_COLLECTION = 'AppConfig';
export const AGENT_CONFIG_DOC_ID = 'agentConfig';
export const AGENT_APP_CONFIG_CACHE_TTL_MS = 60_000;

/** Fallback values — used when the Firestore doc is missing or a field is invalid. */
const FALLBACK_TASK_MAX_RETRIES = 2;
const FALLBACK_MAX_DELEGATION_DEPTH = 2;
const FALLBACK_MAX_AGENTIC_TURNS = 6;
const FALLBACK_MAX_JOB_ATTEMPTS = 2;
const FALLBACK_RETRY_BACKOFF_MS = 5_000;

const FALLBACK_ROLE_PERSONAS = {
  athlete: [
    `Adopt an encouraging, urgent, and mentorship-driven tone.`,
    `Speak like a trusted advisor who genuinely cares about this athlete's development, brand, and future.`,
    `Use motivating language that makes them want to take action immediately.`,
  ].join(' '),
  coach: [
    `Adopt a strategic, peer-to-peer, and professional tone.`,
    `Speak like a fellow coach - data-driven, practical, and focused on winning,`,
    `team culture, and player development. Be concise and actionable.`,
  ].join(' '),
  director: [
    `Adopt an executive, strategic, and organizational tone.`,
    `Think like a program administrator managing budgets, compliance, staff, and the big picture.`,
    `Prioritize efficiency and institutional goals.`,
  ].join(' '),
  recruiter: [
    `Adopt a sharp, evaluative, and professional tone.`,
    `Think like a talent evaluator on the road - focused on prospect identification,`,
    `relationship building, and competitive intel.`,
  ].join(' '),
  parent: [
    `Adopt a supportive, informative, and guiding tone.`,
    `Speak like a knowledgeable family advisor helping a parent navigate the sports landscape,`,
    `finances, scheduling, and their child's wellbeing. Be reassuring and clear.`,
  ].join(' '),
} as const;

const FALLBACK_SPORT_ALIASES = {
  track_field: 'track',
  swimming_diving: 'swimming',
  hockey: 'ice_hockey',
} as const;

const seasonInfoSchema = z.object({
  phase: z.string().min(1),
  focus: z.string().min(1),
});

const rolePersonasSchema = z.record(z.string(), z.string().min(1));
const sportAliasesSchema = z.record(z.string(), z.string().min(1));
const sportSeasonsSchema = z.record(z.string(), z.array(seasonInfoSchema).length(12));
const modelCatalogueSchema = z.record(z.string(), z.string().min(1));
const modelFallbackChainSchema = z.record(z.string(), z.array(z.string().min(1)));
const coordinatorIds = [
  'admin_coordinator',
  'brand_coordinator',
  'data_coordinator',
  'strategy_coordinator',
  'recruiting_coordinator',
  'performance_coordinator',
] as const;

type CoordinatorIdentifier = (typeof coordinatorIds)[number];

const coordinatorDescriptorSchema = z.object({
  id: z.enum(coordinatorIds),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
});

const operationalLimitsSchema = z
  .object({
    taskMaxRetries: z.number().int().nonnegative().default(FALLBACK_TASK_MAX_RETRIES),
    maxDelegationDepth: z.number().int().nonnegative().default(FALLBACK_MAX_DELEGATION_DEPTH),
    maxAgenticTurns: z.number().int().nonnegative().default(FALLBACK_MAX_AGENTIC_TURNS),
    maxJobAttempts: z.number().int().nonnegative().default(FALLBACK_MAX_JOB_ATTEMPTS),
    retryBackoffMs: z.number().int().nonnegative().default(FALLBACK_RETRY_BACKOFF_MS),
  })
  .default({
    taskMaxRetries: FALLBACK_TASK_MAX_RETRIES,
    maxDelegationDepth: FALLBACK_MAX_DELEGATION_DEPTH,
    maxAgenticTurns: FALLBACK_MAX_AGENTIC_TURNS,
    maxJobAttempts: FALLBACK_MAX_JOB_ATTEMPTS,
    retryBackoffMs: FALLBACK_RETRY_BACKOFF_MS,
  });

const domainKnowledgeSchema = z
  .object({
    rolePersonas: rolePersonasSchema.default(FALLBACK_ROLE_PERSONAS),
    sportAliases: sportAliasesSchema.default(FALLBACK_SPORT_ALIASES),
    sportSeasons: sportSeasonsSchema.default({}),
  })
  .default({
    rolePersonas: FALLBACK_ROLE_PERSONAS,
    sportAliases: FALLBACK_SPORT_ALIASES,
    sportSeasons: {},
  });

const modelRoutingSchema = z
  .object({
    catalogue: modelCatalogueSchema.default({}),
    fallbackChains: modelFallbackChainSchema.default({}),
  })
  .default({
    catalogue: {},
    fallbackChains: {},
  });

const promptsSchema = z
  .object({
    plannerSystemPrompt: z.string().trim().min(1).optional(),
    agentSystemPrompts: z.record(z.string(), z.string().trim().min(1)).default({}),
  })
  .default({
    agentSystemPrompts: {},
  });

const featureFlagsSchema = z
  .object({
    disabledTools: z.array(z.string().trim().min(1)).default([]),
    disableImageGeneration: z.boolean().default(false),
    disableEmailSending: z.boolean().default(false),
  })
  .default({
    disabledTools: [],
    disableImageGeneration: false,
    disableEmailSending: false,
  });

const coordinatorsSchema = z.array(coordinatorDescriptorSchema).default([]);

export const agentAppConfigSchema = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    updatedAt: z.string().trim().min(1).optional(),
    operationalLimits: operationalLimitsSchema.optional(),
    domainKnowledge: domainKnowledgeSchema.optional(),
    modelRouting: modelRoutingSchema.optional(),
    prompts: promptsSchema.optional(),
    featureFlags: featureFlagsSchema.optional(),
    coordinators: coordinatorsSchema.optional(),
  })
  .transform((data) => {
    return {
      operationalLimits: operationalLimitsSchema.parse(data.operationalLimits ?? {}),
      domainKnowledge: domainKnowledgeSchema.parse(data.domainKnowledge ?? {}),
      modelRouting: modelRoutingSchema.parse(data.modelRouting ?? {}),
      prompts: promptsSchema.parse(data.prompts ?? {}),
      featureFlags: featureFlagsSchema.parse(data.featureFlags ?? {}),
      coordinators: coordinatorsSchema.parse(data.coordinators ?? []),
    };
  });

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentRunConfig {
  /** Per-task self-correction retries inside the DAG runner. */
  readonly taskMaxRetries: number;
  /** Maximum agent delegation hops before the router aborts. */
  readonly maxDelegationDepth: number;
  /** Maximum agentic loop turns per SSE chat request. */
  readonly maxAgenticTurns: number;
  /** BullMQ job-level retry attempts. */
  readonly maxJobAttempts: number;
  /** BullMQ exponential backoff seed in milliseconds. */
  readonly retryBackoffMs: number;
}

export interface AgentSeasonInfo {
  readonly phase: string;
  readonly focus: string;
}

export interface AgentDomainKnowledgeConfig {
  readonly rolePersonas: Readonly<Record<string, string>>;
  readonly sportAliases: Readonly<Record<string, string>>;
  readonly sportSeasons: Readonly<Record<string, readonly AgentSeasonInfo[]>>;
}

export interface AgentAppConfig {
  readonly operationalLimits: AgentRunConfig;
  readonly domainKnowledge: AgentDomainKnowledgeConfig;
  readonly modelRouting: AgentModelRoutingConfig;
  readonly prompts: AgentPromptConfig;
  readonly featureFlags: AgentFeatureFlagsConfig;
  readonly coordinators: readonly AgentDescriptor[];
}

export interface AgentModelRoutingConfig {
  readonly catalogue: Readonly<Record<ModelTier, string>>;
  readonly fallbackChains: Readonly<Record<ModelTier, readonly string[]>>;
}

export interface AgentPromptConfig {
  readonly plannerSystemPrompt?: string;
  readonly agentSystemPrompts: Readonly<Partial<Record<AgentIdentifier, string>>>;
}

export interface AgentFeatureFlagsConfig {
  readonly disabledTools: readonly string[];
  readonly disableImageGeneration: boolean;
  readonly disableEmailSending: boolean;
}

const DEFAULT_COORDINATOR_DESCRIPTORS = coordinatorIds.map(
  (id) => AGENT_DESCRIPTORS[id as AgentIdentifier]
) as readonly AgentDescriptor[];

/** Built-in defaults used when the Firestore doc is absent or a field is invalid. */
export const DEFAULT_AGENT_RUN_CONFIG: AgentRunConfig = {
  taskMaxRetries: FALLBACK_TASK_MAX_RETRIES,
  maxDelegationDepth: FALLBACK_MAX_DELEGATION_DEPTH,
  maxAgenticTurns: FALLBACK_MAX_AGENTIC_TURNS,
  maxJobAttempts: FALLBACK_MAX_JOB_ATTEMPTS,
  retryBackoffMs: FALLBACK_RETRY_BACKOFF_MS,
};

const off = (focus?: string): AgentSeasonInfo => ({
  phase: 'Off-Season',
  focus: focus ?? 'Recovery, skill development, and strength training',
});

const pre = (focus?: string): AgentSeasonInfo => ({
  phase: 'Pre-Season',
  focus: focus ?? 'Conditioning, team building, and scheme installation',
});

const ins = (focus?: string): AgentSeasonInfo => ({
  phase: 'In-Season',
  focus: focus ?? 'Competition, game prep, film review, and peak performance',
});

const post = (focus?: string): AgentSeasonInfo => ({
  phase: 'Post-Season / Playoffs',
  focus: focus ?? 'Playoff preparation, recovery management, and championship pursuit',
});

export const DEFAULT_AGENT_APP_CONFIG: AgentAppConfig = {
  operationalLimits: DEFAULT_AGENT_RUN_CONFIG,
  domainKnowledge: {
    rolePersonas: FALLBACK_ROLE_PERSONAS,
    sportAliases: FALLBACK_SPORT_ALIASES,
    sportSeasons: {
      football: [
        off(),
        off(),
        off('Spring practice and 7-on-7 prep'),
        off('Spring practice and 7-on-7 prep'),
        off('Camps, combines, and 7-on-7 tournaments'),
        off('Camps, combines, and 7-on-7 tournaments'),
        pre(),
        pre('Fall camp and final prep'),
        ins(),
        ins(),
        ins(),
        post(),
      ],
      basketball: [
        ins(),
        ins(),
        ins(),
        post(),
        off(),
        off('AAU/club season, camps, and skill work'),
        off('AAU/club season, camps, and skill work'),
        off('AAU/club season, open gyms'),
        off('Fall leagues and team tryouts'),
        pre(),
        ins(),
        ins(),
      ],
      baseball: [
        pre(),
        pre('Spring training and scrimmages'),
        ins(),
        ins(),
        ins(),
        ins('Summer showcases and travel ball'),
        off('Summer showcases and travel ball'),
        off('Fall workouts and showcases'),
        off('Fall ball and showcases'),
        off(),
        off(),
        off(),
      ],
      softball: [
        pre(),
        pre('Spring training and scrimmages'),
        ins(),
        ins(),
        ins(),
        off('Summer travel ball and showcases'),
        off('Summer travel ball and showcases'),
        off('Fall workouts'),
        off('Fall ball'),
        off(),
        off(),
        off(),
      ],
      soccer: [
        off(),
        off(),
        pre('Spring season / club season'),
        ins('Spring season / club season'),
        ins('Spring season / club season'),
        off('Summer camps and club tournaments'),
        off('Summer camps and club tournaments'),
        pre(),
        ins(),
        ins(),
        ins(),
        post(),
      ],
      lacrosse: [
        off('Winter training and indoor leagues'),
        pre(),
        ins(),
        ins(),
        ins(),
        off('Summer leagues and camps'),
        off('Summer leagues and camps'),
        off(),
        off('Fall ball'),
        off('Fall ball'),
        off(),
        off(),
      ],
      volleyball: [
        off(),
        off(),
        off('Club season and training'),
        off('Club season and training'),
        off('Club season and tournaments'),
        off('Club season and camps'),
        off('Camps and open gyms'),
        pre(),
        ins(),
        ins(),
        ins(),
        post(),
      ],
      wrestling: [
        ins(),
        ins(),
        post(),
        off(),
        off(),
        off('Freestyle/Greco season and camps'),
        off('Freestyle/Greco season and camps'),
        off('Freestyle/Greco season and camps'),
        off('Fall conditioning'),
        pre(),
        ins(),
        ins(),
      ],
      track: [
        off('Winter conditioning and indoor meets'),
        ins('Indoor season'),
        ins('Indoor/outdoor transition'),
        ins(),
        ins('Championship season'),
        off(),
        off('Summer training and camps'),
        off(),
        pre('Cross country / fall conditioning'),
        ins('Cross country season'),
        ins('Cross country season / regionals'),
        off(),
      ],
      swimming: [
        ins(),
        ins(),
        ins('Championship meets'),
        off(),
        off(),
        off('Summer club season'),
        off('Summer club season'),
        off('Summer club season'),
        pre(),
        ins(),
        ins(),
        ins(),
      ],
      golf: [
        off(),
        off(),
        ins('Spring season'),
        ins('Spring season'),
        ins('Spring season / championships'),
        off('Summer tournaments'),
        off('Summer tournaments'),
        off('Summer tournaments'),
        ins('Fall season'),
        ins('Fall season'),
        off(),
        off(),
      ],
      ice_hockey: [
        ins(),
        ins(),
        ins(),
        post(),
        off(),
        off(),
        off('Summer camps and development'),
        off('Summer camps and development'),
        pre(),
        ins(),
        ins(),
        ins(),
      ],
      tennis: [
        off('Winter training / indoor'),
        off('Winter training / indoor'),
        ins('Spring season'),
        ins('Spring season'),
        ins('Spring season / championships'),
        off('Summer tournaments and camps'),
        off('Summer tournaments and camps'),
        off(),
        ins('Fall season'),
        ins('Fall season'),
        off(),
        off(),
      ],
      rowing: [
        off('Winter erg training'),
        off('Winter erg training'),
        pre('Spring training'),
        ins('Spring racing season'),
        ins('Championship regattas'),
        off(),
        off(),
        off(),
        pre('Fall training'),
        ins('Fall racing / Head races'),
        ins('Fall racing'),
        off(),
      ],
      gymnastics: [
        ins(),
        ins(),
        ins(),
        ins('Championship season'),
        off(),
        off('Summer camps and development'),
        off('Summer camps and development'),
        off(),
        pre(),
        ins(),
        ins(),
        ins(),
      ],
      water_polo: [
        off(),
        off(),
        ins('Spring season'),
        ins('Spring season'),
        ins('Spring season'),
        off('Summer club season'),
        off('Summer club season'),
        off(),
        pre(),
        ins('Fall season'),
        ins('Fall season'),
        post(),
      ],
      bowling: [
        ins(),
        ins(),
        ins('Championship season'),
        off(),
        off(),
        off(),
        off(),
        off(),
        off(),
        pre(),
        ins(),
        ins(),
      ],
      cross_country: [
        off(),
        off(),
        off(),
        off('Spring distance training'),
        off('Summer base building'),
        off('Summer base building'),
        off('Summer mileage peak'),
        pre(),
        ins(),
        ins(),
        ins('Championship meets'),
        off(),
      ],
      field_hockey: [
        off(),
        off(),
        off('Spring leagues'),
        off('Spring leagues'),
        off(),
        off('Summer camps'),
        off('Summer camps'),
        pre(),
        ins(),
        ins(),
        post(),
        off(),
      ],
    },
  },
  modelRouting: {
    catalogue: DEFAULT_MODEL_CATALOGUE,
    fallbackChains: DEFAULT_MODEL_FALLBACK_CHAIN,
  },
  prompts: {
    agentSystemPrompts: {},
  },
  featureFlags: {
    disabledTools: [],
    disableImageGeneration: false,
    disableEmailSending: false,
  },
  coordinators: DEFAULT_COORDINATOR_DESCRIPTORS,
};

let cachedAgentAppConfig: AgentAppConfig = DEFAULT_AGENT_APP_CONFIG;
let cachedAgentAppConfigLoadedAt = 0;
let cachedAgentAppConfigPromise: Promise<AgentAppConfig> | null = null;

const MODEL_TIER_KEYS = Object.keys(DEFAULT_MODEL_CATALOGUE) as ModelTier[];

function normaliseSport(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, '_')
    .replace(/_?(mens|womens|men|women)$/i, '')
    .replace(/_+$/, '')
    .trim();
}

export function parseAgentAppConfig(
  data: unknown,
  onInvalid?: (issues: readonly z.ZodIssue[]) => void
): AgentAppConfig {
  const parsed = agentAppConfigSchema.safeParse(data ?? {});
  if (!parsed.success) {
    onInvalid?.(parsed.error.issues);
    return DEFAULT_AGENT_APP_CONFIG;
  }

  const operationalLimits = parsed.data.operationalLimits;
  const domainKnowledge = parsed.data.domainKnowledge;
  const modelRouting = parsed.data.modelRouting;
  const prompts = parsed.data.prompts;
  const featureFlags = parsed.data.featureFlags;
  const configuredCoordinatorMap = new Map<CoordinatorIdentifier, AgentDescriptor>(
    parsed.data.coordinators.map((descriptor) => [descriptor.id, descriptor as AgentDescriptor])
  );

  const mergedModelCatalogue = Object.freeze(
    MODEL_TIER_KEYS.reduce<Record<ModelTier, string>>(
      (acc, tier) => {
        acc[tier] =
          modelRouting.catalogue[tier] ?? DEFAULT_AGENT_APP_CONFIG.modelRouting.catalogue[tier];
        return acc;
      },
      {} as Record<ModelTier, string>
    )
  );

  const mergedFallbackChains = Object.freeze(
    MODEL_TIER_KEYS.reduce<Record<ModelTier, readonly string[]>>(
      (acc, tier) => {
        const primary = mergedModelCatalogue[tier];
        const configured = modelRouting.fallbackChains[tier];
        const fallback =
          configured && configured.length > 0
            ? configured
            : DEFAULT_AGENT_APP_CONFIG.modelRouting.fallbackChains[tier];
        acc[tier] = Object.freeze([primary, ...fallback.filter((slug) => slug !== primary)]);
        return acc;
      },
      {} as Record<ModelTier, readonly string[]>
    )
  );

  return {
    operationalLimits,
    domainKnowledge: {
      rolePersonas:
        Object.keys(domainKnowledge.rolePersonas).length > 0
          ? domainKnowledge.rolePersonas
          : DEFAULT_AGENT_APP_CONFIG.domainKnowledge.rolePersonas,
      sportAliases: {
        ...DEFAULT_AGENT_APP_CONFIG.domainKnowledge.sportAliases,
        ...domainKnowledge.sportAliases,
      },
      sportSeasons:
        Object.keys(domainKnowledge.sportSeasons).length > 0
          ? domainKnowledge.sportSeasons
          : DEFAULT_AGENT_APP_CONFIG.domainKnowledge.sportSeasons,
    },
    modelRouting: {
      catalogue: mergedModelCatalogue,
      fallbackChains: mergedFallbackChains,
    },
    prompts: {
      plannerSystemPrompt: prompts.plannerSystemPrompt?.trim() || undefined,
      agentSystemPrompts: Object.freeze(
        Object.fromEntries(
          Object.entries(prompts.agentSystemPrompts)
            .filter(
              ([agentId, prompt]) =>
                coordinatorIds.includes(agentId as CoordinatorIdentifier) &&
                prompt.trim().length > 0
            )
            .map(([agentId, prompt]) => [agentId, prompt.trim()])
        ) as Partial<Record<AgentIdentifier, string>>
      ),
    },
    featureFlags: {
      disabledTools: Object.freeze(
        Array.from(
          new Set(
            featureFlags.disabledTools
              .map((toolName) => toolName.trim())
              .filter((toolName) => toolName.length > 0)
          )
        )
      ),
      disableImageGeneration: featureFlags.disableImageGeneration,
      disableEmailSending: featureFlags.disableEmailSending,
    },
    coordinators: coordinatorIds.map((id) => {
      const configured = configuredCoordinatorMap.get(id);
      const fallback = AGENT_DESCRIPTORS[id as AgentIdentifier];
      return configured
        ? {
            ...fallback,
            ...configured,
            capabilities:
              configured.capabilities.length > 0 ? configured.capabilities : fallback.capabilities,
          }
        : fallback;
    }),
  };
}

export function getCachedAgentAppConfig(): AgentAppConfig {
  return cachedAgentAppConfig;
}

export function setCachedAgentAppConfig(config: AgentAppConfig): void {
  cachedAgentAppConfig = config;
  cachedAgentAppConfigLoadedAt = Date.now();
}

export function resetCachedAgentAppConfig(): void {
  cachedAgentAppConfig = DEFAULT_AGENT_APP_CONFIG;
  cachedAgentAppConfigLoadedAt = 0;
  cachedAgentAppConfigPromise = null;
}

export function resolveRolePersona(
  role: string,
  config: AgentAppConfig = getCachedAgentAppConfig()
): string {
  return (
    config.domainKnowledge.rolePersonas[role] ??
    config.domainKnowledge.rolePersonas['athlete'] ??
    DEFAULT_AGENT_APP_CONFIG.domainKnowledge.rolePersonas['athlete']
  );
}

export function resolveSeasonInfo(
  sportRaw: string,
  now: Date = new Date(),
  config: AgentAppConfig = getCachedAgentAppConfig()
): AgentSeasonInfo | null {
  const key = normaliseSport(sportRaw);
  const resolved = config.domainKnowledge.sportAliases[key] ?? key;
  const calendar = config.domainKnowledge.sportSeasons[resolved];
  if (!calendar) return null;
  return calendar[now.getMonth()] ?? null;
}

export function resolveModelForTier(
  tier: ModelTier,
  config: AgentAppConfig = getCachedAgentAppConfig()
): string {
  return config.modelRouting.catalogue[tier];
}

export function resolveModelFallbackChain(
  tier: ModelTier,
  config: AgentAppConfig = getCachedAgentAppConfig()
): readonly string[] {
  return config.modelRouting.fallbackChains[tier];
}

function interpolatePromptTemplate(
  prompt: string,
  templateValues?: Readonly<Record<string, string | undefined>>
): string {
  if (!templateValues) {
    return prompt;
  }

  return prompt.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = templateValues[key];
    return typeof value === 'string' ? value : '';
  });
}

export function resolveAgentSystemPrompt(
  agentId: AgentIdentifier,
  fallbackPrompt: string,
  templateValues?: Readonly<Record<string, string | undefined>>,
  config: AgentAppConfig = getCachedAgentAppConfig()
): string {
  const configuredPrompt =
    agentId === 'router'
      ? config.prompts.plannerSystemPrompt
      : config.prompts.agentSystemPrompts[agentId];

  return interpolatePromptTemplate(configuredPrompt ?? fallbackPrompt, templateValues);
}

export function isToolDisabled(
  toolName: string,
  config: AgentAppConfig = getCachedAgentAppConfig()
): boolean {
  const normalizedToolName = toolName.trim();
  if (!normalizedToolName) {
    return false;
  }

  if (config.featureFlags.disabledTools.includes(normalizedToolName)) {
    return true;
  }

  if (config.featureFlags.disableImageGeneration && normalizedToolName === 'generate_graphic') {
    return true;
  }

  if (config.featureFlags.disableEmailSending && normalizedToolName === 'send_email') {
    return true;
  }

  return false;
}

export function getConfiguredCoordinatorDescriptors(
  config: AgentAppConfig = getCachedAgentAppConfig()
): readonly AgentDescriptor[] {
  return config.coordinators;
}

// ─── Reader ──────────────────────────────────────────────────────────────────

/**
 * Read agent task-running configuration from Firestore (`AppConfig/agentConfig`).
 * Falls back to `DEFAULT_AGENT_RUN_CONFIG` if the document is absent or a field
 * is not a valid non-negative integer.
 */
export async function getAgentRunConfig(db: Firestore): Promise<AgentRunConfig> {
  try {
    const config = await getAgentAppConfig(db);
    return config.operationalLimits;
  } catch {
    return DEFAULT_AGENT_RUN_CONFIG;
  }
}

export async function getAgentAppConfig(
  db: Firestore,
  options?: {
    readonly forceRefresh?: boolean;
    readonly maxAgeMs?: number;
  }
): Promise<AgentAppConfig> {
  const maxAgeMs = options?.maxAgeMs ?? AGENT_APP_CONFIG_CACHE_TTL_MS;
  const cacheIsFresh =
    !options?.forceRefresh &&
    cachedAgentAppConfigLoadedAt > 0 &&
    Date.now() - cachedAgentAppConfigLoadedAt < maxAgeMs;

  if (cacheIsFresh) {
    return cachedAgentAppConfig;
  }

  if (cachedAgentAppConfigPromise) {
    return cachedAgentAppConfigPromise;
  }

  cachedAgentAppConfigPromise = (async () => {
    try {
      const snap = await db.collection(APP_CONFIG_COLLECTION).doc(AGENT_CONFIG_DOC_ID).get();
      const config = parseAgentAppConfig(snap.data(), (issues) => {
        logger.warn('[AgentConfig] Invalid AppConfig/agentConfig payload, using defaults', {
          issueCount: issues.length,
          issues: issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      });

      setCachedAgentAppConfig(config);
      logger.debug('[AgentConfig] Loaded AppConfig/agentConfig', {
        source: snap.exists ? 'firestore' : 'defaults',
      });
      return config;
    } catch (error) {
      logger.warn('[AgentConfig] Failed to load AppConfig/agentConfig, using cached config', {
        error: error instanceof Error ? error.message : String(error),
      });
      return getCachedAgentAppConfig();
    } finally {
      cachedAgentAppConfigPromise = null;
    }
  })();

  return cachedAgentAppConfigPromise;
}
