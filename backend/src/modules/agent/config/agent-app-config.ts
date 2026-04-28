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
  type AgentXSelectedActionSurface,
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

/** Primary Agent (single-agent native tool-calling loop) defaults. */
const FALLBACK_USE_PRIMARY_AGENT = true;
const FALLBACK_PRIMARY_THREAD_HISTORY_WINDOW = 20;
const FALLBACK_PRIMARY_THREAD_HISTORY_SUMMARIZE_BEYOND = 20;
const FALLBACK_PRIMARY_TOOL_CONCURRENCY = 3;
const FALLBACK_PRIMARY_MODEL_TIER = 'routing';
const FALLBACK_PRIMARY_MAX_PROMPT_TOKENS = 150_000;
const FALLBACK_PRIMARY_MAX_MESSAGE_CHARS = 4_000;
const FALLBACK_PRIMARY_MAX_TOOL_RESULT_CHARS = 8_000;
const FALLBACK_PRIMARY_TOOL_LOOP_ENABLED = true;
const FALLBACK_PRIMARY_TOOL_LOOP_WINDOW = 5;
const FALLBACK_PRIMARY_TOOL_LOOP_THRESHOLD = 3;
const FALLBACK_THREAD_SUPERSEDE_ON_YIELD = true;
const FALLBACK_CAPABILITY_REFRESH_MS = 300_000;
const FALLBACK_CAPABILITY_USE_COMPACT = true;

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
type ConfiguredCoordinatorActionChip = ShellActionChip & {
  readonly executionPrompt?: string;
};
type CoordinatorRoleUiOverride = {
  readonly description?: string;
  readonly commands?: readonly ConfiguredCoordinatorActionChip[];
  readonly scheduledActions?: readonly ConfiguredCoordinatorActionChip[];
};

const DASHBOARD_ATHLETE_ROLES = ['athlete'] as const;
const DASHBOARD_TEAM_ROLES = ['coach', 'director'] as const;
const DASHBOARD_ALL_ROLES = [...DASHBOARD_ATHLETE_ROLES, ...DASHBOARD_TEAM_ROLES] as const;

const actionChipSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  subLabel: z.string().trim().min(1).optional(),
  promptText: z.string().trim().min(1).optional(),
  icon: z.string().trim().min(1),
  executionPrompt: z.string().trim().min(1).optional(),
});

const coordinatorRoleUiOverrideSchema = z.object({
  description: z.string().trim().min(1).optional(),
  commands: z.array(actionChipSchema).optional(),
  scheduledActions: z.array(actionChipSchema).optional(),
});

function command(
  id: string,
  label: string,
  icon: string,
  subLabel?: string,
  executionPrompt?: string
): ConfiguredCoordinatorActionChip {
  return {
    id,
    label,
    icon,
    ...(subLabel ? { subLabel } : {}),
    ...(executionPrompt ? { executionPrompt } : {}),
  };
}

function toSentence(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildFallbackVisiblePromptText(params: {
  readonly coordinatorName: string;
  readonly coordinatorDescription: string;
  readonly action: Pick<ConfiguredCoordinatorActionChip, 'label' | 'subLabel'>;
  readonly surface: AgentXSelectedActionSurface;
}): string {
  const opening =
    params.surface === 'scheduled'
      ? `Please handle ${params.action.label} with the ${params.coordinatorName} and frame it as a recurring workflow for me.`
      : `Please handle ${params.action.label} with the ${params.coordinatorName}.`;
  const detail =
    toSentence(params.action.subLabel) || toSentence(params.coordinatorDescription) || undefined;
  const closing =
    params.surface === 'scheduled'
      ? 'Give me the execution plan, timing, checkpoints, and follow-up actions I should run with.'
      : 'Give me the clearest deliverable, priorities, and next steps to act on immediately.';

  return [opening, detail, closing]
    .filter((part): part is string => !!part && part.length > 0)
    .join(' ');
}

function ensureActionPromptText(
  action: ConfiguredCoordinatorActionChip,
  params: {
    readonly coordinatorName: string;
    readonly coordinatorDescription: string;
    readonly surface: AgentXSelectedActionSurface;
  }
): ConfiguredCoordinatorActionChip {
  const promptText = action.promptText?.trim();
  if (promptText && promptText.length > 0) {
    return {
      ...action,
      promptText,
    };
  }

  return {
    ...action,
    promptText: buildFallbackVisiblePromptText({
      coordinatorName: params.coordinatorName,
      coordinatorDescription: params.coordinatorDescription,
      action,
      surface: params.surface,
    }),
  };
}

function applyCoordinatorPromptTextConfig(
  baseConfig: Readonly<
    Record<
      CoordinatorIdentifier,
      {
        readonly description: string;
        readonly availableForRoles: readonly DashboardRole[];
        readonly commands: readonly ConfiguredCoordinatorActionChip[];
        readonly scheduledActions: readonly ConfiguredCoordinatorActionChip[];
        readonly roleUiOverrides: Readonly<
          Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>
        >;
      }
    >
  >
): Readonly<
  Record<
    CoordinatorIdentifier,
    {
      readonly description: string;
      readonly availableForRoles: readonly DashboardRole[];
      readonly commands: readonly ConfiguredCoordinatorActionChip[];
      readonly scheduledActions: readonly ConfiguredCoordinatorActionChip[];
      readonly roleUiOverrides: Readonly<Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>>;
    }
  >
> {
  const nextConfig = {} as Record<
    CoordinatorIdentifier,
    (typeof baseConfig)[CoordinatorIdentifier]
  >;

  for (const coordinatorId of coordinatorIds) {
    const coordinator = baseConfig[coordinatorId];

    const roleUiOverrides = {} as Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>;
    for (const role of DASHBOARD_ALL_ROLES) {
      const override = coordinator.roleUiOverrides[role];
      if (!override) {
        continue;
      }

      const roleDescription = override.description ?? coordinator.description;
      roleUiOverrides[role] = {
        ...override,
        ...(override.commands
          ? {
              commands: Object.freeze(
                override.commands.map((action) =>
                  ensureActionPromptText(action, {
                    coordinatorName: coordinatorIdToDescriptorName(coordinatorId),
                    coordinatorDescription: roleDescription,
                    surface: 'command',
                  })
                )
              ),
            }
          : {}),
        ...(override.scheduledActions
          ? {
              scheduledActions: Object.freeze(
                override.scheduledActions.map((action) =>
                  ensureActionPromptText(action, {
                    coordinatorName: coordinatorIdToDescriptorName(coordinatorId),
                    coordinatorDescription: roleDescription,
                    surface: 'scheduled',
                  })
                )
              ),
            }
          : {}),
      };
    }

    nextConfig[coordinatorId] = {
      ...coordinator,
      commands: Object.freeze(
        coordinator.commands.map((action) =>
          ensureActionPromptText(action, {
            coordinatorName: coordinatorIdToDescriptorName(coordinatorId),
            coordinatorDescription: coordinator.description,
            surface: 'command',
          })
        )
      ),
      scheduledActions: Object.freeze(
        coordinator.scheduledActions.map((action) =>
          ensureActionPromptText(action, {
            coordinatorName: coordinatorIdToDescriptorName(coordinatorId),
            coordinatorDescription: coordinator.description,
            surface: 'scheduled',
          })
        )
      ),
      roleUiOverrides: normalizeRoleUiOverrides(roleUiOverrides),
    };
  }

  return Object.freeze(nextConfig);
}

function coordinatorIdToDescriptorName(coordinatorId: CoordinatorIdentifier): string {
  return (
    AGENT_DESCRIPTORS[coordinatorId as AgentIdentifier]?.name ??
    humanizeCoordinatorActionId(coordinatorId)
  );
}

function roleOverride(
  description: string,
  commands: readonly ConfiguredCoordinatorActionChip[],
  scheduledActions: readonly ConfiguredCoordinatorActionChip[] = []
): CoordinatorRoleUiOverride {
  return {
    description,
    commands,
    scheduledActions,
  };
}

function normalizeCoordinatorActionLookupKey(value: string | undefined): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      ?.trim() ?? ''
  );
}

function humanizeCoordinatorActionId(actionId: string): string {
  const normalized = normalizeCoordinatorActionLookupKey(actionId);
  if (!normalized) {
    return 'Coordinator Action';
  }

  return normalized.replace(/\b\w/g, (token) => token.toUpperCase());
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

type CoordinatorUiEnhancement = {
  readonly availableForRoles?: readonly DashboardRole[];
  readonly roleUiOverrides?: Readonly<Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>>;
};

function mergeConfiguredActionChips(
  base: readonly ConfiguredCoordinatorActionChip[],
  additions?: readonly ConfiguredCoordinatorActionChip[]
): readonly ConfiguredCoordinatorActionChip[] {
  if (!additions?.length) {
    return Object.freeze([...base]);
  }

  const merged = new Map(base.map((action) => [action.id, action] as const));
  for (const action of additions) {
    merged.set(action.id, action);
  }

  return Object.freeze(Array.from(merged.values()));
}

function buildRoleOverrideFromBase(
  base: {
    readonly description: string;
    readonly commands: readonly ConfiguredCoordinatorActionChip[];
    readonly scheduledActions: readonly ConfiguredCoordinatorActionChip[];
  },
  existing: CoordinatorRoleUiOverride | undefined,
  addition: CoordinatorRoleUiOverride | undefined
): CoordinatorRoleUiOverride {
  return {
    description: addition?.description ?? existing?.description ?? base.description,
    commands: mergeConfiguredActionChips(existing?.commands ?? base.commands, addition?.commands),
    scheduledActions: mergeConfiguredActionChips(
      existing?.scheduledActions ?? base.scheduledActions,
      addition?.scheduledActions
    ),
  };
}

function applyEliteCoordinatorUiConfig(
  baseConfig: Readonly<
    Record<
      CoordinatorIdentifier,
      {
        readonly description: string;
        readonly availableForRoles: readonly DashboardRole[];
        readonly commands: readonly ConfiguredCoordinatorActionChip[];
        readonly scheduledActions: readonly ConfiguredCoordinatorActionChip[];
        readonly roleUiOverrides: Readonly<
          Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>
        >;
      }
    >
  >
): Readonly<
  Record<
    CoordinatorIdentifier,
    {
      readonly description: string;
      readonly availableForRoles: readonly DashboardRole[];
      readonly commands: readonly ConfiguredCoordinatorActionChip[];
      readonly scheduledActions: readonly ConfiguredCoordinatorActionChip[];
      readonly roleUiOverrides: Readonly<Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>>;
    }
  >
> {
  const nextConfig = {} as Record<
    CoordinatorIdentifier,
    (typeof baseConfig)[CoordinatorIdentifier]
  >;

  for (const coordinatorId of coordinatorIds) {
    const coordinator = baseConfig[coordinatorId];
    const enhancement = ELITE_COORDINATOR_ROLE_ENHANCEMENTS[coordinatorId];

    if (!enhancement) {
      nextConfig[coordinatorId] = coordinator;
      continue;
    }

    const mergedRoleUiOverrides = {} as Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>;
    for (const role of DASHBOARD_ALL_ROLES) {
      const existingOverride = coordinator.roleUiOverrides[role];
      const nextOverride = enhancement.roleUiOverrides?.[role];
      if (!existingOverride && !nextOverride) {
        continue;
      }

      mergedRoleUiOverrides[role] = buildRoleOverrideFromBase(
        {
          description: coordinator.description,
          commands: coordinator.commands,
          scheduledActions: coordinator.scheduledActions,
        },
        existingOverride,
        nextOverride
      );
    }

    nextConfig[coordinatorId] = {
      ...coordinator,
      availableForRoles: Object.freeze([
        ...(enhancement.availableForRoles ?? coordinator.availableForRoles),
      ]),
      roleUiOverrides: normalizeRoleUiOverrides(mergedRoleUiOverrides),
    };
  }

  return Object.freeze(nextConfig);
}

const ELITE_COORDINATOR_ROLE_ENHANCEMENTS: Readonly<
  Partial<Record<CoordinatorIdentifier, CoordinatorUiEnhancement>>
> = {
  admin_coordinator: {
    availableForRoles: DASHBOARD_ALL_ROLES,
    roleUiOverrides: {
      athlete: {
        description:
          'Own your eligibility, paperwork, visit readiness, and recruiting deadlines with athlete-specific admin support.',
        commands: [
          command(
            'admin-compliance',
            'Eligibility Checklist',
            'shieldCheck',
            'Track NCAA, academic, and roster requirements'
          ),
          command(
            'admin-eligibility',
            'Academic Readiness Review',
            'clipboard',
            'Spot transcript and core-course gaps'
          ),
          command(
            'admin-schedule',
            'Recruiting Timeline Plan',
            'calendar',
            'Map visits, outreach, and deadlines'
          ),
          command('admin-docs', 'Document Packet Review', 'clipboard', 'Audit forms and uploads'),
          command('admin-deadlines', 'Deadline Radar', 'calendar', 'Surface the next admin dates'),
          command(
            'admin-visit',
            'Visit Prep Checklist',
            'list',
            'Prepare camp and visit paperwork'
          ),
        ],
        scheduledActions: [
          command('admin-weekly-compliance', 'Weekly Eligibility Check-In', 'shieldCheck'),
          command('admin-grade-watch', 'Academic Progress Watch', 'clipboard'),
          command('admin-deadline-digest', 'Weekly Deadline Digest', 'calendar'),
          command('admin-doc-refresh', 'Monthly Document Refresh', 'sync'),
        ],
      },
      coach: {
        commands: [
          command(
            'admin-docs',
            'Roster Document Audit',
            'clipboard',
            'Review waivers and roster files'
          ),
          command(
            'admin-deadlines',
            'Deadline Radar',
            'calendar',
            'Surface staff-critical admin dates'
          ),
          command(
            'admin-visit',
            'Visit Logistics Checklist',
            'list',
            'Prepare visit approvals and ops'
          ),
        ],
        scheduledActions: [
          command('admin-grade-watch', 'Weekly Eligibility Watchlist', 'clipboard'),
          command('admin-deadline-digest', 'Staff Deadline Digest', 'calendar'),
          command('admin-doc-refresh', 'Monthly Roster Docs Refresh', 'sync'),
        ],
      },
      director: {
        commands: [
          command(
            'admin-docs',
            'Governance Packet Audit',
            'clipboard',
            'Review audits, waivers, and policy docs'
          ),
          command(
            'admin-deadlines',
            'Executive Deadline Radar',
            'calendar',
            'Track program-critical dates'
          ),
          command(
            'admin-visit',
            'Event Approval Checklist',
            'list',
            'Coordinate compliance for events and visits'
          ),
        ],
        scheduledActions: [
          command('admin-grade-watch', 'Weekly Risk Watchlist', 'clipboard'),
          command('admin-deadline-digest', 'Executive Deadline Digest', 'calendar'),
          command('admin-doc-refresh', 'Monthly Governance Refresh', 'sync'),
        ],
      },
    },
  },
  brand_coordinator: {
    roleUiOverrides: {
      athlete: {
        commands: [
          command('brand-bio', 'Rewrite My Bio', 'sparkles', 'Refresh your athlete positioning'),
          command('brand-media-kit', 'Build Media Kit', 'rocket', 'Package your story and stats'),
          command(
            'brand-series',
            'Content Series Plan',
            'list',
            'Map a repeatable personal brand series'
          ),
        ],
        scheduledActions: [
          command('brand-social-audit', 'Weekly Social Audit', 'analytics'),
          command('brand-asset-refresh', 'Highlight Refresh Reminder', 'videocam'),
          command('brand-campaign-review', 'Monthly Campaign Review', 'calendar'),
        ],
      },
      coach: {
        commands: [
          command(
            'brand-bio',
            'Refresh Team Bio',
            'sparkles',
            'Sharpen your team or coach positioning'
          ),
          command(
            'brand-media-kit',
            'Build Recruiting Media Kit',
            'rocket',
            'Package culture, staff, and facilities'
          ),
          command(
            'brand-series',
            'Recruiting Storyline Plan',
            'list',
            'Create a recurring content series for recruits'
          ),
        ],
        scheduledActions: [
          command('brand-social-audit', 'Weekly Program Social Audit', 'analytics'),
          command('brand-asset-refresh', 'Media Day Asset Refresh', 'videocam'),
          command('brand-campaign-review', 'Monthly Recruiting Campaign Review', 'calendar'),
        ],
      },
      director: {
        commands: [
          command(
            'brand-bio',
            'Executive Messaging Refresh',
            'sparkles',
            'Update department voice and positioning'
          ),
          command(
            'brand-media-kit',
            'Build Department Media Kit',
            'rocket',
            'Package facilities, culture, and outcomes'
          ),
          command(
            'brand-series',
            'Season Narrative Plan',
            'list',
            'Plan institution-level storytelling arcs'
          ),
        ],
        scheduledActions: [
          command('brand-social-audit', 'Weekly Brand Health Audit', 'analytics'),
          command('brand-asset-refresh', 'Executive Asset Refresh', 'videocam'),
          command('brand-campaign-review', 'Monthly Department Campaign Review', 'calendar'),
        ],
      },
    },
  },
  data_coordinator: {
    roleUiOverrides: {
      athlete: {
        commands: [
          command(
            'data-dashboard',
            'Profile Data Snapshot',
            'analytics',
            'Summarize your current profile completeness'
          ),
          command(
            'data-benchmark',
            'Stat Benchmark Check',
            'pulse',
            'Compare your latest numbers to targets'
          ),
          command(
            'data-source-audit',
            'Source Audit',
            'sync',
            'Verify every connected data source is current'
          ),
        ],
        scheduledActions: [
          command('data-integrity-scan', 'Weekly Integrity Scan', 'analytics'),
          command('data-profile-refresh', 'Profile Refresh Reminder', 'sync'),
          command('data-stat-qa', 'Monthly Stat QA', 'clipboard'),
        ],
      },
      coach: {
        commands: [
          command(
            'data-dashboard',
            'Roster Data Snapshot',
            'analytics',
            'Summarize roster completeness and gaps'
          ),
          command(
            'data-benchmark',
            'Team Benchmark Check',
            'pulse',
            'Compare team metrics to targets'
          ),
          command(
            'data-source-audit',
            'Platform Source Audit',
            'sync',
            'Verify every roster data feed is current'
          ),
        ],
        scheduledActions: [
          command('data-integrity-scan', 'Weekly Roster Integrity Scan', 'analytics'),
          command('data-profile-refresh', 'Roster Refresh Reminder', 'sync'),
          command('data-stat-qa', 'Monthly Team Stat QA', 'clipboard'),
        ],
      },
      director: {
        commands: [
          command(
            'data-dashboard',
            'Program Data Snapshot',
            'analytics',
            'Summarize department reporting readiness'
          ),
          command(
            'data-benchmark',
            'Department Benchmark Check',
            'pulse',
            'Compare program metrics to targets'
          ),
          command(
            'data-source-audit',
            'Systems Audit',
            'sync',
            'Verify reporting systems and source health'
          ),
        ],
        scheduledActions: [
          command('data-integrity-scan', 'Weekly Program Integrity Scan', 'analytics'),
          command('data-profile-refresh', 'Department Refresh Reminder', 'sync'),
          command('data-stat-qa', 'Monthly Reporting QA', 'clipboard'),
        ],
      },
    },
  },
  strategy_coordinator: {
    roleUiOverrides: {
      athlete: {
        commands: [
          command(
            'strategy-decision-brief',
            'Decision Brief',
            'list',
            'Clarify the next big athlete decision'
          ),
          command(
            'strategy-risk-map',
            'Risk Map',
            'compass',
            'Expose blockers to your current plan'
          ),
          command(
            'strategy-30-day-plan',
            '30-Day Action Plan',
            'rocket',
            'Map the next month of execution'
          ),
        ],
        scheduledActions: [
          command('strategy-monday-plan', 'Monday Priority Reset', 'calendar'),
          command('strategy-midweek-adjust', 'Midweek Adjustment Brief', 'analytics'),
          command('strategy-weekend-review', 'Weekend Progress Review', 'clipboard'),
        ],
      },
      coach: {
        commands: [
          command(
            'strategy-decision-brief',
            'Staff Decision Brief',
            'list',
            'Clarify the next key team decision'
          ),
          command(
            'strategy-risk-map',
            'Program Risk Map',
            'compass',
            'Expose blockers across staff execution'
          ),
          command(
            'strategy-30-day-plan',
            '30-Day Staff Plan',
            'rocket',
            'Map the next month of priorities'
          ),
        ],
        scheduledActions: [
          command('strategy-monday-plan', 'Monday Staff Priority Reset', 'calendar'),
          command('strategy-midweek-adjust', 'Midweek Staff Adjustment Brief', 'analytics'),
          command('strategy-weekend-review', 'Weekend Staff Review', 'clipboard'),
        ],
      },
      director: {
        commands: [
          command(
            'strategy-decision-brief',
            'Executive Decision Brief',
            'list',
            'Clarify the next leadership decision'
          ),
          command(
            'strategy-risk-map',
            'Program Risk Map',
            'compass',
            'Expose blockers across the department'
          ),
          command(
            'strategy-30-day-plan',
            '30-Day Executive Plan',
            'rocket',
            'Map the next month of institutional priorities'
          ),
        ],
        scheduledActions: [
          command('strategy-monday-plan', 'Monday Executive Reset', 'calendar'),
          command('strategy-midweek-adjust', 'Midweek Executive Brief', 'analytics'),
          command('strategy-weekend-review', 'Weekend Leadership Review', 'clipboard'),
        ],
      },
    },
  },
  recruiting_coordinator: {
    roleUiOverrides: {
      athlete: {
        commands: [
          command(
            'recruiting-visit-plan',
            'Visit Prep Plan',
            'calendar',
            'Prepare conversations, logistics, and goals'
          ),
          command(
            'recruiting-relationship-map',
            'Coach Relationship Map',
            'mail',
            'Track who to contact and when'
          ),
          command(
            'recruiting-board-audit',
            'Target Board Audit',
            'search',
            'Stress-test your school list and priorities'
          ),
        ],
        scheduledActions: [
          command('recruiting-relationship-checkin', 'Weekly Relationship Check-In', 'mail'),
          command('recruiting-followup-reminders', 'Follow-Up Reminder Queue', 'send'),
          command('recruiting-board-refresh', 'Monthly Target Board Refresh', 'calendar'),
        ],
      },
      coach: {
        commands: [
          command(
            'recruiting-visit-plan',
            'Official Visit Plan',
            'calendar',
            'Prepare visit flow, touchpoints, and logistics'
          ),
          command(
            'recruiting-relationship-map',
            'Recruiter Relationship Map',
            'mail',
            'Track decision-makers and key relationships'
          ),
          command(
            'recruiting-board-audit',
            'Board Audit',
            'search',
            'Pressure-test your recruiting board and gaps'
          ),
        ],
        scheduledActions: [
          command('recruiting-relationship-checkin', 'Weekly Recruiter Check-In', 'mail'),
          command('recruiting-followup-reminders', 'Follow-Up Reminder Queue', 'send'),
          command('recruiting-board-refresh', 'Monthly Board Refresh', 'calendar'),
        ],
      },
      director: {
        commands: [
          command(
            'recruiting-visit-plan',
            'Executive Visit Plan',
            'calendar',
            'Coordinate premium visit experiences and approvals'
          ),
          command(
            'recruiting-relationship-map',
            'Stakeholder Relationship Map',
            'mail',
            'Track high-value relationships across the pipeline'
          ),
          command(
            'recruiting-board-audit',
            'Pipeline Audit',
            'search',
            'Pressure-test the board against program priorities'
          ),
        ],
        scheduledActions: [
          command('recruiting-relationship-checkin', 'Weekly Pipeline Check-In', 'mail'),
          command('recruiting-followup-reminders', 'Executive Follow-Up Queue', 'send'),
          command('recruiting-board-refresh', 'Monthly Pipeline Refresh', 'calendar'),
        ],
      },
    },
  },
  performance_coordinator: {
    roleUiOverrides: {
      athlete: {
        commands: [
          command(
            'performance-development-plan',
            'Development Plan',
            'list',
            'Turn insights into a clear improvement plan'
          ),
          command(
            'performance-workload-review',
            'Workload Review',
            'analytics',
            'Assess training balance and fatigue risk'
          ),
          command(
            'performance-readiness-scan',
            'Readiness Scan',
            'pulse',
            'Summarize what you are ready for next'
          ),
        ],
        scheduledActions: [
          command('performance-film-review', 'Weekly Film Review', 'videocam'),
          command('performance-benchmark-refresh', 'Benchmark Refresh', 'analytics'),
          command('performance-readiness-check', 'Weekly Readiness Check', 'pulse'),
        ],
      },
      coach: {
        commands: [
          command(
            'performance-development-plan',
            'Player Development Plan',
            'list',
            'Turn performance signals into staff action'
          ),
          command(
            'performance-workload-review',
            'Roster Workload Review',
            'analytics',
            'Assess fatigue risk and training balance'
          ),
          command(
            'performance-readiness-scan',
            'Readiness Scan',
            'pulse',
            'Summarize roster readiness for the week'
          ),
        ],
        scheduledActions: [
          command('performance-film-review', 'Weekly Team Film Review', 'videocam'),
          command('performance-benchmark-refresh', 'Roster Benchmark Refresh', 'analytics'),
          command('performance-readiness-check', 'Weekly Roster Readiness Check', 'pulse'),
        ],
      },
      director: {
        commands: [
          command(
            'performance-development-plan',
            'Program Development Plan',
            'list',
            'Turn insights into department-wide priorities'
          ),
          command(
            'performance-workload-review',
            'Department Workload Review',
            'analytics',
            'Assess readiness and fatigue across units'
          ),
          command(
            'performance-readiness-scan',
            'Program Readiness Scan',
            'pulse',
            'Summarize readiness for key competition windows'
          ),
        ],
        scheduledActions: [
          command('performance-film-review', 'Weekly Program Film Review', 'videocam'),
          command('performance-benchmark-refresh', 'Program Benchmark Refresh', 'analytics'),
          command('performance-readiness-check', 'Weekly Program Readiness Check', 'pulse'),
        ],
      },
    },
  },
};

export const DEFAULT_COORDINATOR_UI_CONFIG: Readonly<
  Record<
    CoordinatorIdentifier,
    {
      readonly description: string;
      readonly availableForRoles: readonly DashboardRole[];
      readonly commands: readonly ShellActionChip[];
      readonly scheduledActions: readonly ShellActionChip[];
      readonly roleUiOverrides: Readonly<Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>>;
    }
  >
> = applyCoordinatorPromptTextConfig(
  applyEliteCoordinatorUiConfig({
    admin_coordinator: {
      description:
        'Manage compliance, eligibility, scheduling, and operational readiness for athletes, staff, and programs.',
      availableForRoles: DASHBOARD_TEAM_ROLES,
      commands: [
        command('admin-compliance', 'Compliance Check', 'shieldCheck', 'NCAA and policy checks'),
        command(
          'admin-eligibility',
          'Eligibility Review',
          'clipboard',
          'Verify eligibility status'
        ),
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
      description:
        'Create brand content, highlights, and campaign-ready creative for athletes, teams, and departments.',
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
      description:
        'Sync, import, and clean profile, roster, and reporting data so every decision runs on current information.',
      availableForRoles: DASHBOARD_ALL_ROLES,
      commands: [
        command(
          'data-sync',
          'Sync External Profiles',
          'sync',
          'Refresh Hudl/MaxPreps style sources'
        ),
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
            command(
              'data-clean',
              'Resolve Roster Data Gaps',
              'server',
              'Fix missing roster fields'
            ),
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
      description:
        'Build game plans, playbook priorities, opponent responses, and weekly execution frameworks for athletes, staffs, and programs.',
      availableForRoles: DASHBOARD_ALL_ROLES,
      commands: [
        command(
          'strategy-priority',
          'Game Plan',
          'compass',
          'Build the clearest plan for the next phase'
        ),
        command(
          'strategy-goals',
          'Strategy Breakdown',
          'list',
          'Turn a goal into a step-by-step plan'
        ),
        command(
          'strategy-qa',
          'Scenario Planner',
          'chatbubble',
          'Work through options, risks, and counters'
        ),
      ],
      scheduledActions: [command('strategy-weekly-brief', 'Weekly Game Plan Brief', 'calendar')],
      roleUiOverrides: {
        athlete: roleOverride(
          'Build personal game plans, film-study priorities, and weekly execution plans for training, competition, and game-time decisions.',
          [
            command(
              'strategy-priority',
              'Athlete Game Plan',
              'compass',
              'Map the next set of athlete priorities'
            ),
            command(
              'strategy-goals',
              'Break Down My Strategy',
              'list',
              'Turn a target into daily execution steps'
            ),
            command(
              'strategy-qa',
              'Scenario Planner',
              'chatbubble',
              'Work through choices, counters, and risks'
            ),
          ],
          [command('strategy-weekly-brief', 'Weekly Athlete Game Plan', 'calendar')]
        ),
        coach: roleOverride(
          'Create team game plans, playbook priorities, opponent prep, and weekly execution strategy for game time.',
          [
            command(
              'strategy-priority',
              'Team Game Plan',
              'compass',
              'Set the clearest plan for the next competition window'
            ),
            command(
              'strategy-goals',
              'Strategy Breakdown',
              'list',
              'Turn a team objective into coordinated staff action'
            ),
            command(
              'strategy-qa',
              'Scenario Planner',
              'chatbubble',
              'Model counters, contingencies, and adjustments'
            ),
          ],
          [command('strategy-weekly-brief', 'Weekly Team Game Plan', 'calendar')]
        ),
        director: roleOverride(
          'Set program-wide game-planning priorities, playbook standards, opponent-prep workflows, and weekly execution frameworks across teams and staffs.',
          [
            command(
              'strategy-priority',
              'Program Game Plan',
              'compass',
              'Set the clearest game-planning priorities across the program'
            ),
            command(
              'strategy-goals',
              'Strategy Breakdown',
              'list',
              'Turn playbook priorities into accountable workstreams'
            ),
            command(
              'strategy-qa',
              'Scenario Planner',
              'chatbubble',
              'Model game-time options, risks, and pivots'
            ),
          ],
          [command('strategy-weekly-brief', 'Weekly Program Game Plan', 'calendar')]
        ),
      },
    },
    recruiting_coordinator: {
      description:
        'Run outreach, target lists, recruiting follow-up, and pipeline planning across athlete and program workflows.',
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
      description:
        'Own scouting reports, film breakdowns, analysis, and performance intelligence so every decision is grounded in evidence.',
      availableForRoles: DASHBOARD_ALL_ROLES,
      commands: [
        command(
          'performance-intel',
          'Scouting & Intel Report',
          'pulse',
          'Generate a scouting-driven performance report'
        ),
        command(
          'performance-film',
          'Film & Analysis Review',
          'videocam',
          'Break down clips, tendencies, and takeaways'
        ),
        command(
          'performance-compare',
          'Player Comparison',
          'gitCompare',
          'Compare prospects, matchups, and metrics'
        ),
      ],
      scheduledActions: [
        command('performance-weekly-review', 'Weekly Scouting Review', 'analytics'),
      ],
      roleUiOverrides: {
        athlete: roleOverride(
          'Review self-scouting, film analysis, and performance priorities in one place.',
          [
            command(
              'performance-intel',
              'Self-Scouting Report',
              'pulse',
              'Summarize performance signals and scout feedback'
            ),
            command(
              'performance-film',
              'Film Analysis Review',
              'videocam',
              'Break down your clips for actionable next steps'
            ),
            command(
              'performance-compare',
              'Benchmark Comparison',
              'gitCompare',
              'Compare yourself against peers and standards'
            ),
          ],
          [command('performance-weekly-review', 'Weekly Athlete Scouting Review', 'analytics')]
        ),
        coach: roleOverride(
          'Turn scouting, film study, and roster metrics into sharper coaching and development decisions.',
          [
            command(
              'performance-intel',
              'Scouting Report',
              'pulse',
              'Summarize roster scouting and performance signals'
            ),
            command(
              'performance-film',
              'Opponent Film Review',
              'videocam',
              'Break down tendencies, matchups, and adjustments'
            ),
            command(
              'performance-compare',
              'Player Comparison',
              'gitCompare',
              'Stack athletes, matchups, and roles by metrics'
            ),
          ],
          [command('performance-weekly-review', 'Weekly Team Scouting Review', 'analytics')]
        ),
        director: roleOverride(
          'Monitor scouting trends, film insights, and readiness across the full program.',
          [
            command(
              'performance-intel',
              'Program Scouting Report',
              'pulse',
              'Summarize scouting and performance signals program-wide'
            ),
            command(
              'performance-film',
              'Film Intelligence Review',
              'videocam',
              'Review film trends, tendencies, and risk signals'
            ),
            command(
              'performance-compare',
              'Unit Comparison',
              'gitCompare',
              'Compare units, groups, and benchmarks by metrics'
            ),
          ],
          [command('performance-weekly-review', 'Weekly Program Scouting Review', 'analytics')]
        ),
      },
    },
  })
);

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
    classifierSystemPrompt: z.string().trim().min(1).optional(),
    conversationSystemPrompt: z.string().trim().min(1).optional(),
    plannerSystemPrompt: z.string().trim().min(1).optional(),
    /** Optional override for the Primary Agent's system prompt (default lives in code). */
    primarySystemPrompt: z.string().trim().min(1).optional(),
    agentSystemPrompts: z.record(z.string(), z.string().trim().min(1)).default({}),
  })
  .default({
    agentSystemPrompts: {},
  });

const primarySchema = z
  .object({
    threadHistoryWindow: z
      .number()
      .int()
      .positive()
      .default(FALLBACK_PRIMARY_THREAD_HISTORY_WINDOW),
    threadHistorySummarizeBeyond: z
      .number()
      .int()
      .positive()
      .default(FALLBACK_PRIMARY_THREAD_HISTORY_SUMMARIZE_BEYOND),
    toolConcurrency: z.number().int().positive().default(FALLBACK_PRIMARY_TOOL_CONCURRENCY),
    modelTier: z.string().trim().min(1).default(FALLBACK_PRIMARY_MODEL_TIER),
    maxPromptTokens: z.number().int().positive().default(FALLBACK_PRIMARY_MAX_PROMPT_TOKENS),
    maxMessageChars: z.number().int().positive().default(FALLBACK_PRIMARY_MAX_MESSAGE_CHARS),
    maxToolResultChars: z.number().int().positive().default(FALLBACK_PRIMARY_MAX_TOOL_RESULT_CHARS),
    toolLoopDetector: z
      .object({
        enabled: z.boolean().default(FALLBACK_PRIMARY_TOOL_LOOP_ENABLED),
        windowSize: z.number().int().positive().default(FALLBACK_PRIMARY_TOOL_LOOP_WINDOW),
        threshold: z.number().int().positive().default(FALLBACK_PRIMARY_TOOL_LOOP_THRESHOLD),
      })
      .default({
        enabled: FALLBACK_PRIMARY_TOOL_LOOP_ENABLED,
        windowSize: FALLBACK_PRIMARY_TOOL_LOOP_WINDOW,
        threshold: FALLBACK_PRIMARY_TOOL_LOOP_THRESHOLD,
      }),
  })
  .default({
    threadHistoryWindow: FALLBACK_PRIMARY_THREAD_HISTORY_WINDOW,
    threadHistorySummarizeBeyond: FALLBACK_PRIMARY_THREAD_HISTORY_SUMMARIZE_BEYOND,
    toolConcurrency: FALLBACK_PRIMARY_TOOL_CONCURRENCY,
    modelTier: FALLBACK_PRIMARY_MODEL_TIER,
    maxPromptTokens: FALLBACK_PRIMARY_MAX_PROMPT_TOKENS,
    maxMessageChars: FALLBACK_PRIMARY_MAX_MESSAGE_CHARS,
    maxToolResultChars: FALLBACK_PRIMARY_MAX_TOOL_RESULT_CHARS,
    toolLoopDetector: {
      enabled: FALLBACK_PRIMARY_TOOL_LOOP_ENABLED,
      windowSize: FALLBACK_PRIMARY_TOOL_LOOP_WINDOW,
      threshold: FALLBACK_PRIMARY_TOOL_LOOP_THRESHOLD,
    },
  });

const concurrencySchema = z
  .object({
    threadSupersedeOnYield: z.boolean().default(FALLBACK_THREAD_SUPERSEDE_ON_YIELD),
  })
  .default({
    threadSupersedeOnYield: FALLBACK_THREAD_SUPERSEDE_ON_YIELD,
  });

const capabilityCardSchema = z
  .object({
    refreshIntervalMs: z.number().int().positive().default(FALLBACK_CAPABILITY_REFRESH_MS),
    useCompactInPrompt: z.boolean().default(FALLBACK_CAPABILITY_USE_COMPACT),
  })
  .default({
    refreshIntervalMs: FALLBACK_CAPABILITY_REFRESH_MS,
    useCompactInPrompt: FALLBACK_CAPABILITY_USE_COMPACT,
  });

const featureFlagsSchema = z
  .object({
    disabledTools: z.array(z.string().trim().min(1)).default([]),
    disableImageGeneration: z.boolean().default(false),
    disableEmailSending: z.boolean().default(false),
    strictZodToolSchemas: z.boolean().default(false),
    strictEntityToolGovernance: z.boolean().default(false),
    /**
     * @deprecated Always-on as of the 2026 enterprise migration. The Primary
     * Agent is the only conversational path; this flag is no longer read by
     * the router. Field is retained in the schema for back-compat with
     * existing Firestore documents and may be removed in a future release.
     */
    useprimaryAgent: z.boolean().default(FALLBACK_USE_PRIMARY_AGENT),
  })
  .default({
    disabledTools: [],
    disableImageGeneration: false,
    disableEmailSending: false,
    strictZodToolSchemas: false,
    strictEntityToolGovernance: false,
    useprimaryAgent: FALLBACK_USE_PRIMARY_AGENT,
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
    primary: primarySchema.optional(),
    concurrency: concurrencySchema.optional(),
    capabilityCard: capabilityCardSchema.optional(),
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
      primary: primarySchema.parse(data.primary ?? {}),
      concurrency: concurrencySchema.parse(data.concurrency ?? {}),
      capabilityCard: capabilityCardSchema.parse(data.capabilityCard ?? {}),
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
  readonly primary: AgentPrimaryConfig;
  readonly concurrency: AgentConcurrencyConfig;
  readonly capabilityCard: AgentCapabilityCardConfig;
}

export interface ConfiguredCoordinatorDescriptor extends AgentDescriptor {
  readonly availableForRoles: readonly string[];
  readonly commands: readonly ConfiguredCoordinatorActionChip[];
  readonly scheduledActions: readonly ConfiguredCoordinatorActionChip[];
  readonly roleUiOverrides: Readonly<Partial<Record<DashboardRole, CoordinatorRoleUiOverride>>>;
}

export interface ResolvedCoordinatorAction extends ShellActionChip {
  readonly executionPrompt: string;
}

function toShellActionChip(action: ConfiguredCoordinatorActionChip): ShellActionChip {
  return {
    id: action.id,
    label: action.label,
    icon: action.icon,
    ...(action.subLabel ? { subLabel: action.subLabel } : {}),
    ...(action.promptText ? { promptText: action.promptText } : {}),
  };
}

function buildFallbackExecutionPrompt(params: {
  readonly coordinatorName: string;
  readonly coordinatorDescription: string;
  readonly action: ConfiguredCoordinatorActionChip;
  readonly surface: AgentXSelectedActionSurface;
  readonly role: DashboardRole;
}): string {
  const surfaceInstruction =
    params.surface === 'scheduled'
      ? 'Treat this as a repeatable scheduled workflow. Build a concrete cadence, execution checklist, timing recommendations, and follow-up checkpoints.'
      : 'Treat this as an immediate coordinator request. Execute the task directly and return the strongest practical deliverable you can produce now.';

  return [
    `You are ${params.coordinatorName} operating for the ${params.role} dashboard experience.`,
    `Coordinator mandate: ${params.coordinatorDescription}`,
    `Selected action: ${params.action.label}.`,
    params.action.subLabel ? `Action context: ${params.action.subLabel}.` : null,
    surfaceInstruction,
    'Execution requirements:',
    '1. Infer the highest-probability user outcome behind this coordinator action and complete that work proactively.',
    '2. Produce a concrete deliverable in a polished, professional format instead of generic commentary.',
    '3. Use structure when it helps: sections, bullet lists, timelines, scenario plans, or decision frameworks.',
    '4. Ask follow-up questions only when information is truly blocking the deliverable.',
    '5. Tailor the response to the user role, sports workflow, and likely operational context.',
    '6. End with the clearest next action or decision the user should take.',
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n');
}

function getCoordinatorActionsForRole(
  coordinator: ConfiguredCoordinatorDescriptor,
  role: DashboardRole
): {
  readonly description: string;
  readonly commands: readonly ConfiguredCoordinatorActionChip[];
  readonly scheduledActions: readonly ConfiguredCoordinatorActionChip[];
} {
  const roleUiOverride = coordinator.roleUiOverrides[role];

  return {
    description: roleUiOverride?.description ?? coordinator.description,
    commands: Object.freeze(
      (roleUiOverride?.commands ?? coordinator.commands).map((action) =>
        ensureActionPromptText(action, {
          coordinatorName: coordinator.name,
          coordinatorDescription: roleUiOverride?.description ?? coordinator.description,
          surface: 'command',
        })
      )
    ),
    scheduledActions: Object.freeze(
      (roleUiOverride?.scheduledActions ?? coordinator.scheduledActions).map((action) =>
        ensureActionPromptText(action, {
          coordinatorName: coordinator.name,
          coordinatorDescription: roleUiOverride?.description ?? coordinator.description,
          surface: 'scheduled',
        })
      )
    ),
  };
}

export interface AgentModelRoutingConfig {
  readonly catalogue: Readonly<Record<ModelTier, string>>;
  readonly fallbackChains: Readonly<Record<ModelTier, readonly string[]>>;
}

export interface AgentPromptConfig {
  readonly classifierSystemPrompt?: string;
  readonly conversationSystemPrompt?: string;
  readonly plannerSystemPrompt?: string;
  readonly primarySystemPrompt?: string;
  readonly agentSystemPrompts: Readonly<Partial<Record<AgentIdentifier, string>>>;
}

export interface AgentFeatureFlagsConfig {
  readonly disabledTools: readonly string[];
  readonly disableImageGeneration: boolean;
  readonly disableEmailSending: boolean;
  readonly strictZodToolSchemas: boolean;
  readonly strictEntityToolGovernance: boolean;
  /** When true, every chat is routed through the Primary Agent (single-agent native tool-calling loop). */
  readonly useprimaryAgent: boolean;
}

export interface AgentPrimaryConfig {
  /** Tier A working-memory verbatim window of recent thread turns. */
  readonly threadHistoryWindow: number;
  /** Turns older than this are folded into a single `[Earlier in this thread]` summary. */
  readonly threadHistorySummarizeBeyond: number;
  /** Max parallel tool calls in a single Primary turn (e.g., lazy-context fetches). */
  readonly toolConcurrency: number;
  /** Default model tier for the Primary Agent. */
  readonly modelTier: string;
  /** Per-LLM-turn prompt ceiling (tokens) before degradation kicks in. */
  readonly maxPromptTokens: number;
  /** Per-message verbatim cap when injecting Tier A history. */
  readonly maxMessageChars: number;
  /** Tool-result observation truncation cap. */
  readonly maxToolResultChars: number;
  readonly toolLoopDetector: {
    readonly enabled: boolean;
    readonly windowSize: number;
    readonly threshold: number;
  };
}

export interface AgentConcurrencyConfig {
  /** New message in same thread cancels prior op when awaiting approval/input; queues otherwise. */
  readonly threadSupersedeOnYield: boolean;
}

export interface AgentCapabilityCardConfig {
  /** How often the capability card snapshot is refreshed in process. */
  readonly refreshIntervalMs: number;
  /** Whether the system prompt uses the compact card (recommended). */
  readonly useCompactInPrompt: boolean;
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
    useprimaryAgent: FALLBACK_USE_PRIMARY_AGENT,
  },
  coordinators: DEFAULT_COORDINATOR_DESCRIPTORS,
  primary: {
    threadHistoryWindow: FALLBACK_PRIMARY_THREAD_HISTORY_WINDOW,
    threadHistorySummarizeBeyond: FALLBACK_PRIMARY_THREAD_HISTORY_SUMMARIZE_BEYOND,
    toolConcurrency: FALLBACK_PRIMARY_TOOL_CONCURRENCY,
    modelTier: FALLBACK_PRIMARY_MODEL_TIER,
    maxPromptTokens: FALLBACK_PRIMARY_MAX_PROMPT_TOKENS,
    maxMessageChars: FALLBACK_PRIMARY_MAX_MESSAGE_CHARS,
    maxToolResultChars: FALLBACK_PRIMARY_MAX_TOOL_RESULT_CHARS,
    toolLoopDetector: {
      enabled: FALLBACK_PRIMARY_TOOL_LOOP_ENABLED,
      windowSize: FALLBACK_PRIMARY_TOOL_LOOP_WINDOW,
      threshold: FALLBACK_PRIMARY_TOOL_LOOP_THRESHOLD,
    },
  },
  concurrency: {
    threadSupersedeOnYield: FALLBACK_THREAD_SUPERSEDE_ON_YIELD,
  },
  capabilityCard: {
    refreshIntervalMs: FALLBACK_CAPABILITY_REFRESH_MS,
    useCompactInPrompt: FALLBACK_CAPABILITY_USE_COMPACT,
  },
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
      classifierSystemPrompt: prompts.classifierSystemPrompt?.trim() || undefined,
      conversationSystemPrompt: prompts.conversationSystemPrompt?.trim() || undefined,
      plannerSystemPrompt: prompts.plannerSystemPrompt?.trim() || undefined,
      primarySystemPrompt: prompts.primarySystemPrompt?.trim() || undefined,
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
      useprimaryAgent: featureFlags.useprimaryAgent ?? FALLBACK_USE_PRIMARY_AGENT,
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
    primary: parsed.data.primary,
    concurrency: parsed.data.concurrency,
    capabilityCard: parsed.data.capabilityCard,
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

export function resolveClassifierSystemPrompt(
  fallbackPrompt: string,
  templateValues?: Readonly<Record<string, string | undefined>>,
  config: AgentAppConfig = getCachedAgentAppConfig()
): string {
  const configuredPrompt = config.prompts.classifierSystemPrompt;
  return interpolatePromptTemplate(configuredPrompt ?? fallbackPrompt, templateValues);
}

export function resolveConversationSystemPrompt(
  fallbackPrompt: string,
  templateValues?: Readonly<Record<string, string | undefined>>,
  config: AgentAppConfig = getCachedAgentAppConfig()
): string {
  const configuredPrompt = config.prompts.conversationSystemPrompt;
  return interpolatePromptTemplate(configuredPrompt ?? fallbackPrompt, templateValues);
}

/**
 * Resolves the Primary Agent system prompt. Default lives in code
 * (`AGENT_X_IDENTITY` from @nxt1/core/ai) and is composed with capability
 * card / user summary / mode addendum at runtime. This resolver only
 * applies an optional Firestore override for emergency tuning.
 */
export function resolvePrimarySystemPrompt(
  fallbackPrompt: string,
  templateValues?: Readonly<Record<string, string | undefined>>,
  config: AgentAppConfig = getCachedAgentAppConfig()
): string {
  const configuredPrompt = config.prompts.primarySystemPrompt;
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

  if (
    config.featureFlags.disableEmailSending &&
    (normalizedToolName === 'send_email' || normalizedToolName === 'batch_send_email')
  ) {
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
      const roleUi = getCoordinatorActionsForRole(coordinator, normalizedRole);

      return {
        id: coordinator.id,
        label: coordinator.name,
        icon: coordinator.icon ?? 'sparkles',
        description: roleUi.description,
        commands: roleUi.commands.map(toShellActionChip),
        scheduledActions: roleUi.scheduledActions.map(toShellActionChip),
      };
    });
}

export function resolveConfiguredCoordinatorActionForRole(
  role: string,
  coordinatorId: string,
  actionId: string,
  surface: AgentXSelectedActionSurface,
  actionLabel?: string,
  config: AgentAppConfig = getCachedAgentAppConfig()
): ResolvedCoordinatorAction | null {
  const normalizedRole = normalizeDashboardRole(role) ?? 'athlete';
  const coordinator = config.coordinators.find((item) => item.id === coordinatorId);
  if (!coordinator) {
    return null;
  }

  const availableRoles = normalizeAvailableRoles(coordinator.availableForRoles);
  if (availableRoles.length > 0 && !availableRoles.includes(normalizedRole)) {
    return null;
  }

  const roleUi = getCoordinatorActionsForRole(coordinator, normalizedRole);
  const actions = surface === 'scheduled' ? roleUi.scheduledActions : roleUi.commands;
  const normalizedActionId = normalizeCoordinatorActionLookupKey(actionId);
  const normalizedActionLabel = normalizeCoordinatorActionLookupKey(actionLabel);
  const action = actions.find((item) => {
    const itemId = normalizeCoordinatorActionLookupKey(item.id);
    const itemLabel = normalizeCoordinatorActionLookupKey(item.label);

    return (
      item.id === actionId ||
      (normalizedActionId.length > 0 && itemId === normalizedActionId) ||
      (normalizedActionLabel.length > 0 && itemLabel === normalizedActionLabel)
    );
  });
  if (!action) {
    const fallbackLabel = actionLabel?.trim() || humanizeCoordinatorActionId(actionId);
    const fallbackAction = command(actionId, fallbackLabel, coordinator.icon ?? 'sparkles');

    return {
      ...toShellActionChip(fallbackAction),
      executionPrompt: buildFallbackExecutionPrompt({
        coordinatorName: coordinator.name,
        coordinatorDescription: roleUi.description,
        action: fallbackAction,
        surface,
        role: normalizedRole,
      }),
    };
  }

  return {
    ...toShellActionChip(action),
    executionPrompt:
      action.executionPrompt ??
      buildFallbackExecutionPrompt({
        coordinatorName: coordinator.name,
        coordinatorDescription: roleUi.description,
        action,
        surface,
        role: normalizedRole,
      }),
  };
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
