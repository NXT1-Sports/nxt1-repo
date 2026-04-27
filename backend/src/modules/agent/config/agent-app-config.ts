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
  COORDINATOR_AGENT_IDS,
  normalizeRole,
  type AgentDescriptor,
  type AgentIdentifier,
  type ModelTier,
  type ShellCommandCategory,
  type ShellActionChip,
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
const coordinatorIds = COORDINATOR_AGENT_IDS;

type CoordinatorIdentifier = (typeof coordinatorIds)[number];
type DashboardRole = 'athlete' | 'coach' | 'director';
type CoordinatorRoleUiOverride = {
  readonly description?: string;
  readonly commands?: readonly ShellActionChip[];
  readonly scheduledActions?: readonly ShellActionChip[];
};

const DASHBOARD_ATHLETE_ROLES = ['athlete'] as const;
const DASHBOARD_TEAM_ROLES = ['coach', 'director'] as const;
const DASHBOARD_ALL_ROLES = [...DASHBOARD_ATHLETE_ROLES, ...DASHBOARD_TEAM_ROLES] as const;

const actionChipSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  subLabel: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1),
});

const coordinatorRoleUiOverrideSchema = z.object({
  description: z.string().trim().min(1).optional(),
  commands: z.array(actionChipSchema).optional(),
  scheduledActions: z.array(actionChipSchema).optional(),
});

function command(id: string, label: string, icon: string, subLabel?: string): ShellActionChip {
  return {
    id,
    label,
    icon,
    ...(subLabel ? { subLabel } : {}),
  };
}

function roleOverride(
  description: string,
  commands: readonly ShellActionChip[],
  scheduledActions: readonly ShellActionChip[] = []
): CoordinatorRoleUiOverride {
  return {
    description,
    commands,
    scheduledActions,
  };
}

function normalizeDashboardRole(role: string): DashboardRole | undefined {
  const normalized = normalizeRole(role).trim().toLowerCase();
  if (normalized === 'athlete' || normalized === 'coach' || normalized === 'director') {
    return normalized;
  }

  return undefined;
}

function normalizeAvailableRoles(roles: readonly string[]): readonly DashboardRole[] {
  return Object.freeze(
    Array.from(
      new Set(
        roles
          .map((rawRole) => normalizeDashboardRole(rawRole))
          .filter((role): role is DashboardRole => role !== undefined)
      )
    )
  );
}

function normalizeRoleUiOverrides(
  roleUiOverrides: Readonly<Record<string, CoordinatorRoleUiOverride>>
): Readonly<Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>> {
  const normalizedEntries = Object.entries(roleUiOverrides).flatMap(([rawRole, override]) => {
    const normalizedRole = normalizeDashboardRole(rawRole);
    if (!normalizedRole) {
      return [];
    }

    return [
      [
        normalizedRole,
        {
          ...(override.description ? { description: override.description.trim() } : {}),
          ...(override.commands ? { commands: Object.freeze([...override.commands]) } : {}),
          ...(override.scheduledActions
            ? { scheduledActions: Object.freeze([...override.scheduledActions]) }
            : {}),
        } satisfies CoordinatorRoleUiOverride,
      ] as const,
    ];
  });

  return Object.freeze(Object.fromEntries(normalizedEntries)) as Readonly<
    Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>
  >;
}

export const DEFAULT_COORDINATOR_UI_CONFIG: Readonly<
  Record<
    CoordinatorIdentifier,
    {
      readonly availableForRoles: readonly DashboardRole[];
      readonly commands: readonly ShellActionChip[];
      readonly scheduledActions: readonly ShellActionChip[];
      readonly roleUiOverrides: Readonly<Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>>;
    }
  >
> = {
  admin_coordinator: {
    availableForRoles: DASHBOARD_TEAM_ROLES,
    commands: [
      command('admin-compliance', 'Compliance Check', 'shieldCheck', 'NCAA and policy checks'),
      command('admin-eligibility', 'Eligibility Review', 'clipboard', 'Verify eligibility status'),
      command('admin-schedule', 'Scheduling Plan', 'calendar', 'Build practice and visit timing'),
    ],
    scheduledActions: [
      command('admin-weekly-compliance', 'Weekly Compliance Audit', 'shieldCheck'),
    ],
    roleUiOverrides: {
      coach: roleOverride(
        'Coordinate compliance, eligibility, and calendar operations for your roster.',
        [
          command(
            'admin-compliance',
            'Roster Compliance Check',
            'shieldCheck',
            'Review roster rules and gaps'
          ),
          command(
            'admin-eligibility',
            'Eligibility Review',
            'clipboard',
            'Flag athlete status issues'
          ),
          command(
            'admin-schedule',
            'Practice Scheduling Plan',
            'calendar',
            'Sequence practice and visit timing'
          ),
        ],
        [command('admin-weekly-compliance', 'Weekly Team Compliance Audit', 'shieldCheck')]
      ),
      director: roleOverride(
        'Run program-level governance, eligibility oversight, and operational planning.',
        [
          command(
            'admin-compliance',
            'Program Compliance Audit',
            'shieldCheck',
            'Audit policy and NCAA exposure'
          ),
          command(
            'admin-eligibility',
            'Eligibility Risk Review',
            'clipboard',
            'Check institution-wide readiness'
          ),
          command(
            'admin-schedule',
            'Department Scheduling Plan',
            'calendar',
            'Coordinate staff and key dates'
          ),
        ],
        [command('admin-weekly-compliance', 'Weekly Program Compliance Audit', 'shieldCheck')]
      ),
    },
  },
  brand_coordinator: {
    availableForRoles: DASHBOARD_ALL_ROLES,
    commands: [
      command('brand-post', 'Create Brand Post', 'sparkles', 'Generate social-ready creative'),
      command(
        'brand-highlight',
        'Build Highlight Concept',
        'videocam',
        'Storyboard your next reel'
      ),
      command('brand-campaign', 'Launch Campaign Plan', 'rocket', 'Plan content by timeline'),
    ],
    scheduledActions: [command('brand-weekly-content', 'Weekly Content Plan', 'calendar')],
    roleUiOverrides: {
      athlete: roleOverride(
        'Build your athlete brand with content ideas, highlight packaging, and weekly posting guidance.',
        [
          command(
            'brand-post',
            'Create Athlete Post',
            'sparkles',
            'Generate social-ready athlete content'
          ),
          command(
            'brand-highlight',
            'Build Highlight Concept',
            'videocam',
            'Storyboard your next reel'
          ),
          command(
            'brand-campaign',
            'Personal Brand Campaign',
            'rocket',
            'Plan your weekly content arc'
          ),
        ],
        [command('brand-weekly-content', 'Weekly Athlete Content Plan', 'calendar')]
      ),
      coach: roleOverride(
        'Shape your team or staff brand with recruiting content, facility storytelling, and program voice.',
        [
          command('brand-post', 'Create Team Post', 'sparkles', 'Generate team-facing creative'),
          command(
            'brand-highlight',
            'Build Program Highlight Concept',
            'videocam',
            'Showcase your culture and results'
          ),
          command(
            'brand-campaign',
            'Program Campaign Plan',
            'rocket',
            'Sequence content across your calendar'
          ),
        ],
        [command('brand-weekly-content', 'Weekly Program Content Plan', 'calendar')]
      ),
      director: roleOverride(
        'Coordinate brand, storytelling, and executive communications for the full program.',
        [
          command(
            'brand-post',
            'Create Department Post',
            'sparkles',
            'Generate executive-level creative'
          ),
          command(
            'brand-highlight',
            'Build Facilities Showcase',
            'videocam',
            'Package a premium program story'
          ),
          command(
            'brand-campaign',
            'Department Campaign Plan',
            'rocket',
            'Align brand work to major dates'
          ),
        ],
        [command('brand-weekly-content', 'Weekly Department Content Plan', 'calendar')]
      ),
    },
  },
  data_coordinator: {
    availableForRoles: DASHBOARD_ALL_ROLES,
    commands: [
      command('data-sync', 'Sync External Profiles', 'sync', 'Refresh Hudl/MaxPreps style sources'),
      command('data-import', 'Import Stats', 'analytics', 'Parse and normalize stat data'),
      command('data-clean', 'Clean Data Gaps', 'server', 'Resolve missing fields quickly'),
    ],
    scheduledActions: [command('data-weekly-sync', 'Weekly Data Sync', 'sync')],
    roleUiOverrides: {
      athlete: roleOverride(
        'Keep your profile, stats, and recruiting data accurate across every connected source.',
        [
          command('data-sync', 'Sync Athlete Profiles', 'sync', 'Refresh linked athlete sources'),
          command(
            'data-import',
            'Import Athlete Stats',
            'analytics',
            'Normalize your latest stat line'
          ),
          command(
            'data-clean',
            'Clean Profile Gaps',
            'server',
            'Fix missing profile details quickly'
          ),
        ],
        [command('data-weekly-sync', 'Weekly Athlete Data Sync', 'sync')]
      ),
      coach: roleOverride(
        'Audit roster data, connected sources, and stat integrity so staff decisions stay current.',
        [
          command(
            'data-sync',
            'Sync Team Data Sources',
            'sync',
            'Refresh roster-connected platforms'
          ),
          command('data-import', 'Import Team Stats', 'analytics', 'Normalize team stat feeds'),
          command('data-clean', 'Resolve Roster Data Gaps', 'server', 'Fix missing roster fields'),
        ],
        [command('data-weekly-sync', 'Weekly Team Data Sync', 'sync')]
      ),
      director: roleOverride(
        'Maintain decision-ready program data across staff, rosters, and reporting systems.',
        [
          command(
            'data-sync',
            'Sync Program Data Sources',
            'sync',
            'Refresh department-wide sources'
          ),
          command(
            'data-import',
            'Import Department Metrics',
            'analytics',
            'Normalize reporting inputs'
          ),
          command(
            'data-clean',
            'Clean Program Data Gaps',
            'server',
            'Resolve missing reporting fields'
          ),
        ],
        [command('data-weekly-sync', 'Weekly Program Data Sync', 'sync')]
      ),
    },
  },
  strategy_coordinator: {
    availableForRoles: DASHBOARD_ALL_ROLES,
    commands: [
      command('strategy-priority', 'Priority Plan', 'compass', "Set this week's top moves"),
      command('strategy-goals', 'Goal Breakdown', 'list', 'Turn goals into executable steps'),
      command('strategy-qa', 'Ask Agent X', 'chatbubble', 'Get strategic guidance'),
    ],
    scheduledActions: [command('strategy-weekly-brief', 'Weekly Strategy Brief', 'calendar')],
    roleUiOverrides: {
      athlete: roleOverride(
        'Turn your recruiting, performance, and brand goals into a focused weekly athlete plan.',
        [
          command(
            'strategy-priority',
            'Athlete Priority Plan',
            'compass',
            "Set this week's top athlete moves"
          ),
          command(
            'strategy-goals',
            'Break Down My Goals',
            'list',
            'Turn your goals into daily steps'
          ),
          command(
            'strategy-qa',
            'Ask Agent X',
            'chatbubble',
            'Get athlete-specific strategy guidance'
          ),
        ],
        [command('strategy-weekly-brief', 'Weekly Athlete Strategy Brief', 'calendar')]
      ),
      coach: roleOverride(
        'Prioritize staff execution across recruiting, player development, and team operations.',
        [
          command(
            'strategy-priority',
            'Team Priority Plan',
            'compass',
            "Set this week's team priorities"
          ),
          command(
            'strategy-goals',
            'Break Down Staff Goals',
            'list',
            'Convert goals into staff actions'
          ),
          command('strategy-qa', 'Ask Agent X', 'chatbubble', 'Get coach-level strategic guidance'),
        ],
        [command('strategy-weekly-brief', 'Weekly Team Strategy Brief', 'calendar')]
      ),
      director: roleOverride(
        'Coordinate executive priorities across staffing, budget, recruiting, and program growth.',
        [
          command(
            'strategy-priority',
            'Program Priority Plan',
            'compass',
            'Set department-level priorities'
          ),
          command(
            'strategy-goals',
            'Break Down Program Goals',
            'list',
            'Turn leadership goals into workstreams'
          ),
          command('strategy-qa', 'Ask Agent X', 'chatbubble', 'Get executive strategy guidance'),
        ],
        [command('strategy-weekly-brief', 'Weekly Program Strategy Brief', 'calendar')]
      ),
    },
  },
  recruiting_coordinator: {
    availableForRoles: DASHBOARD_ALL_ROLES,
    commands: [
      command('recruiting-targets', 'Build Target List', 'search', 'Match schools by fit'),
      command('recruiting-email', 'Draft Coach Outreach', 'mail', 'Generate personalized email'),
      command('recruiting-followup', 'Follow-Up Sequence', 'send', 'Plan next outreach steps'),
    ],
    scheduledActions: [command('recruiting-weekly-outreach', 'Weekly Outreach', 'mail')],
    roleUiOverrides: {
      athlete: roleOverride(
        'Map your school targets, outreach, and follow-up plan around your athlete profile.',
        [
          command(
            'recruiting-targets',
            'Build My Target List',
            'search',
            'Match schools to your fit'
          ),
          command(
            'recruiting-email',
            'Draft Coach Outreach',
            'mail',
            'Generate athlete-specific emails'
          ),
          command(
            'recruiting-followup',
            'Follow-Up Sequence',
            'send',
            'Plan your next recruiting touches'
          ),
        ],
        [command('recruiting-weekly-outreach', 'Weekly Athlete Outreach', 'mail')]
      ),
      coach: roleOverride(
        'Coordinate prospect evaluation, outreach timing, and staff follow-up across your board.',
        [
          command(
            'recruiting-targets',
            'Build Prospect Target List',
            'search',
            'Match prospects by fit'
          ),
          command(
            'recruiting-email',
            'Draft Recruit Outreach',
            'mail',
            'Generate personalized outreach'
          ),
          command(
            'recruiting-followup',
            'Staff Follow-Up Sequence',
            'send',
            'Plan next recruiting actions'
          ),
        ],
        [command('recruiting-weekly-outreach', 'Weekly Recruiting Outreach', 'mail')]
      ),
      director: roleOverride(
        'Manage recruiting pipeline strategy, outreach cadence, and institutional fit at scale.',
        [
          command(
            'recruiting-targets',
            'Build Program Target List',
            'search',
            'Align targets to program strategy'
          ),
          command(
            'recruiting-email',
            'Draft Executive Outreach',
            'mail',
            'Generate high-level recruiting comms'
          ),
          command(
            'recruiting-followup',
            'Pipeline Follow-Up Sequence',
            'send',
            'Sequence department outreach'
          ),
        ],
        [command('recruiting-weekly-outreach', 'Weekly Program Outreach', 'mail')]
      ),
    },
  },
  performance_coordinator: {
    availableForRoles: DASHBOARD_ALL_ROLES,
    commands: [
      command('performance-intel', 'Generate Intel Report', 'pulse', 'Write athlete/team intel'),
      command('performance-film', 'Film Breakdown', 'videocam', 'Analyze clips for insights'),
      command(
        'performance-compare',
        'Prospect Comparison',
        'gitCompare',
        'Stack players by metrics'
      ),
    ],
    scheduledActions: [
      command('performance-weekly-review', 'Weekly Performance Review', 'analytics'),
    ],
    roleUiOverrides: {
      athlete: roleOverride(
        'Review your film, performance signals, and development priorities in one place.',
        [
          command(
            'performance-intel',
            'Generate Athlete Intel Report',
            'pulse',
            'Summarize your development signals'
          ),
          command(
            'performance-film',
            'Athlete Film Breakdown',
            'videocam',
            'Analyze your clips for next steps'
          ),
          command(
            'performance-compare',
            'Prospect Comparison',
            'gitCompare',
            'Compare yourself against peers'
          ),
        ],
        [command('performance-weekly-review', 'Weekly Athlete Performance Review', 'analytics')]
      ),
      coach: roleOverride(
        'Turn film, training, and roster metrics into decisions for your team and player development.',
        [
          command(
            'performance-intel',
            'Generate Team Intel Report',
            'pulse',
            'Summarize roster performance signals'
          ),
          command(
            'performance-film',
            'Team Film Breakdown',
            'videocam',
            'Analyze clips for staff takeaways'
          ),
          command(
            'performance-compare',
            'Player Comparison',
            'gitCompare',
            'Stack athletes by metrics'
          ),
        ],
        [command('performance-weekly-review', 'Weekly Team Performance Review', 'analytics')]
      ),
      director: roleOverride(
        'Monitor department performance trends, film insights, and development readiness across the program.',
        [
          command(
            'performance-intel',
            'Generate Program Intel Report',
            'pulse',
            'Summarize program-wide signals'
          ),
          command(
            'performance-film',
            'Program Film Review',
            'videocam',
            'Analyze clips for executive insights'
          ),
          command(
            'performance-compare',
            'Program Comparison',
            'gitCompare',
            'Compare units by metrics'
          ),
        ],
        [command('performance-weekly-review', 'Weekly Program Performance Review', 'analytics')]
      ),
    },
  },
};

const coordinatorDescriptorSchema = z.object({
  id: z.enum(coordinatorIds),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  availableForRoles: z.array(z.string().trim().min(1)).default([]),
  commands: z.array(actionChipSchema).default([]),
  scheduledActions: z.array(actionChipSchema).default([]),
  roleUiOverrides: z.record(z.string().trim().min(1), coordinatorRoleUiOverrideSchema).default({}),
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
    strictZodToolSchemas: z.boolean().default(false),
    strictEntityToolGovernance: z.boolean().default(false),
  })
  .default({
    disabledTools: [],
    disableImageGeneration: false,
    disableEmailSending: false,
    strictZodToolSchemas: false,
    strictEntityToolGovernance: false,
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
      schemaVersion: data.schemaVersion,
      updatedAt: data.updatedAt,
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
  readonly schemaVersion?: number;
  readonly updatedAt?: string;
  readonly operationalLimits: AgentRunConfig;
  readonly domainKnowledge: AgentDomainKnowledgeConfig;
  readonly modelRouting: AgentModelRoutingConfig;
  readonly prompts: AgentPromptConfig;
  readonly featureFlags: AgentFeatureFlagsConfig;
  readonly coordinators: readonly ConfiguredCoordinatorDescriptor[];
}

export interface ConfiguredCoordinatorDescriptor extends AgentDescriptor {
  readonly availableForRoles: readonly string[];
  readonly commands: readonly ShellActionChip[];
  readonly scheduledActions: readonly ShellActionChip[];
  readonly roleUiOverrides: Readonly<Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>>;
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
  readonly strictZodToolSchemas: boolean;
  readonly strictEntityToolGovernance: boolean;
}

const DEFAULT_COORDINATOR_DESCRIPTORS = coordinatorIds.map((id) => {
  const descriptor = AGENT_DESCRIPTORS[id as AgentIdentifier];
  const ui = DEFAULT_COORDINATOR_UI_CONFIG[id];
  return {
    ...descriptor,
    availableForRoles: Object.freeze([...ui.availableForRoles]),
    commands: Object.freeze([...ui.commands]),
    scheduledActions: Object.freeze([...ui.scheduledActions]),
    roleUiOverrides: normalizeRoleUiOverrides(ui.roleUiOverrides),
  };
}) as readonly ConfiguredCoordinatorDescriptor[];

const DEFAULT_COORDINATOR_DESCRIPTOR_MAP = new Map<
  CoordinatorIdentifier,
  ConfiguredCoordinatorDescriptor
>(
  DEFAULT_COORDINATOR_DESCRIPTORS.map((descriptor) => [
    descriptor.id as CoordinatorIdentifier,
    descriptor,
  ])
);

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
  schemaVersion: 1,
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
    strictZodToolSchemas: false,
    strictEntityToolGovernance: false,
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
  const configuredCoordinatorMap = new Map<
    CoordinatorIdentifier,
    z.infer<typeof coordinatorDescriptorSchema>
  >(parsed.data.coordinators.map((descriptor) => [descriptor.id, descriptor]));

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
    schemaVersion: parsed.data.schemaVersion,
    updatedAt: parsed.data.updatedAt,
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
                (agentId === 'router' ||
                  coordinatorIds.includes(agentId as CoordinatorIdentifier)) &&
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
      strictZodToolSchemas: featureFlags.strictZodToolSchemas,
      strictEntityToolGovernance: featureFlags.strictEntityToolGovernance,
    },
    coordinators: coordinatorIds.map((id): ConfiguredCoordinatorDescriptor => {
      const configured = configuredCoordinatorMap.get(id);
      const fallback =
        DEFAULT_COORDINATOR_DESCRIPTOR_MAP.get(id) ??
        ({
          ...AGENT_DESCRIPTORS[id as AgentIdentifier],
          availableForRoles: [] as const,
          commands: [] as const,
          scheduledActions: [] as const,
          roleUiOverrides: Object.freeze({}) as Readonly<
            Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>
          >,
        } as ConfiguredCoordinatorDescriptor);
      return configured
        ? {
            ...fallback,
            ...configured,
            capabilities:
              configured.capabilities.length > 0 ? configured.capabilities : fallback.capabilities,
            availableForRoles: normalizeAvailableRoles(configured.availableForRoles),
            commands: Object.freeze([...configured.commands]),
            scheduledActions: Object.freeze([...configured.scheduledActions]),
            roleUiOverrides: normalizeRoleUiOverrides(configured.roleUiOverrides),
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

export function resolvePlannerSystemPrompt(
  fallbackPrompt: string,
  templateValues?: Readonly<Record<string, string | undefined>>,
  config: AgentAppConfig = getCachedAgentAppConfig()
): string {
  const configuredPrompt = config.prompts.plannerSystemPrompt;
  return interpolatePromptTemplate(configuredPrompt ?? fallbackPrompt, templateValues);
}

export function resolveAgentSystemPrompt(
  agentId: AgentIdentifier,
  fallbackPrompt: string,
  templateValues?: Readonly<Record<string, string | undefined>>,
  config: AgentAppConfig = getCachedAgentAppConfig()
): string {
  const configuredPrompt =
    agentId === 'router'
      ? config.prompts.agentSystemPrompts['router']
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

export function isStrictZodToolSchemasEnabled(
  config: AgentAppConfig = getCachedAgentAppConfig()
): boolean {
  return config.featureFlags.strictZodToolSchemas;
}

export function isStrictEntityToolGovernanceEnabled(
  config: AgentAppConfig = getCachedAgentAppConfig()
): boolean {
  return config.featureFlags.strictEntityToolGovernance;
}

export function getConfiguredCoordinatorDescriptors(
  config: AgentAppConfig = getCachedAgentAppConfig()
): readonly ConfiguredCoordinatorDescriptor[] {
  return config.coordinators;
}

export function resolveConfiguredCoordinatorsForRole(
  role: string,
  config: AgentAppConfig = getCachedAgentAppConfig()
): readonly ShellCommandCategory[] {
  const normalizedRole = normalizeDashboardRole(role) ?? 'athlete';

  return config.coordinators
    .filter((coordinator) => {
      if (coordinator.availableForRoles.length === 0) {
        return true;
      }

      return coordinator.availableForRoles.includes(normalizedRole);
    })
    .map((coordinator) => {
      const roleUiOverride = coordinator.roleUiOverrides[normalizedRole];

      return {
        id: coordinator.id,
        label: coordinator.name,
        icon: coordinator.icon ?? 'sparkles',
        description: roleUiOverride?.description ?? coordinator.description,
        commands: roleUiOverride?.commands ?? coordinator.commands,
        scheduledActions: roleUiOverride?.scheduledActions ?? coordinator.scheduledActions,
      };
    });
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
