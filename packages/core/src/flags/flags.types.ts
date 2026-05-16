/**
 * @fileoverview Feature Flags Type Definitions
 * @module @nxt1/core/flags
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Type-safe, discriminated-union feature flag definitions.
 * Each flag is typed by its scope and value.
 *
 * Usage:
 * ```typescript
 * import { FeatureFlag, FeatureFlagValue } from '@nxt1/core/flags';
 *
 * // Backend: Check a flag
 * const value = await flagsService.getFlagValue('team.intel.enabled');
 * if (value) { ... }
 *
 * // Frontend: With API adapter
 * const flagApi = createFlagsApi(httpAdapter, baseUrl);
 * const value = await flagApi.getFlagValue('team.intel.enabled');
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// SCOPE UNIONS
// ============================================

/** Feature flag scopes: grouping related flags by domain */
export type FlagScope =
  | 'team'
  | 'athlete'
  | 'scout'
  | 'content'
  | 'agent'
  | 'ai'
  | 'ui'
  | 'billing'
  | 'experimental';

/** Team-scoped flags */
export type TeamFlagKey =
  | 'team.intel.enabled'
  | 'team.profiles.enabled'
  | 'team.roster.advanced.enabled'
  | 'team.analytics.premium.enabled';

/** Athlete-scoped flags */
export type AthleteFlagKey =
  | 'athlete.highlights.ai.enabled'
  | 'athlete.profile.video.enabled'
  | 'athlete.recruiting.premium.enabled';

/** Scout-scoped flags */
export type ScoutFlagKey =
  | 'scout.reports.ai.enabled'
  | 'scout.board.collaborative.enabled'
  | 'scout.search.advanced.enabled';

/** Content creation flags */
export type ContentFlagKey =
  | 'content.graphics.ai.enabled'
  | 'content.video.editor.enabled'
  | 'content.templates.premium.enabled';

/** Agent X flags */
export type AgentFlagKey =
  | 'agent.primary.enabled'
  | 'agent.coordinator.scout.enabled'
  | 'agent.coordinator.brand.enabled'
  | 'agent.tools.disabled'
  | 'agent.image.generation.disabled'
  | 'agent.email.sending.disabled'
  | 'agent.gameplans.enabled';

/** AI integration flags */
export type AiFlagKey =
  | 'ai.play.diagram.extended.sports.enabled'
  | 'ai.content.generation.batch.enabled';

/** UI/Frontend flags */
export type UiFlagKey =
  | 'ui.mobile.new.nav.enabled'
  | 'ui.web.redesign.phase2.enabled'
  | 'ui.animations.reduced.motion.default.enabled';

/** Billing flags */
export type BillingFlagKey = 'billing.stripe.enabled';

/** Experimental/beta features */
export type ExperimentalFlagKey =
  | 'experimental.thread.as.truth.enabled'
  | 'experimental.mongodb.replay.enabled'
  | 'experimental.realtime.sync.enabled'
  | 'experimental.typed.deltas.enabled'
  | 'experimental.agent.engine.enabled'
  | 'experimental.semantic.cache.enabled';

/** AI runtime behavior flags */
export type AiRuntimeFlagKey = 'ai.distiller.enabled' | 'ai.model.prod.catalog.in.dev.enabled';

/** Union of all feature flag keys */
export type FeatureFlagKey =
  | TeamFlagKey
  | AthleteFlagKey
  | ScoutFlagKey
  | ContentFlagKey
  | AgentFlagKey
  | AiFlagKey
  | AiRuntimeFlagKey
  | UiFlagKey
  | BillingFlagKey
  | ExperimentalFlagKey;

// ============================================
// FLAG VALUE UNIONS
// ============================================

/** Boolean flags (on/off) */
export type BooleanFlag = boolean;

/** String enum flags (restricted values) */
export type EnumFlag = string;

/** Numeric flags (percentages, limits) */
export type NumericFlag = number;

/** JSON object flags (complex configs) */
export type JsonFlag = Readonly<Record<string, unknown>>;

/** All possible flag value types */
export type FlagValue = BooleanFlag | EnumFlag | NumericFlag | JsonFlag | null;

// ============================================
// FLAG REGISTRY
// ============================================

/**
 * Type-safe definition of a single feature flag.
 * Includes metadata for observability and UI display.
 */
export interface FeatureFlagDefinition<T extends FlagValue = FlagValue> {
  /** Unique flag key (dot-notation scope.domain.name) */
  readonly key: FeatureFlagKey;

  /** Human-readable title */
  readonly title: string;

  /** Detailed description of what this flag controls */
  readonly description: string;

  /** Flag scope for grouping */
  readonly scope: FlagScope;

  /** Default value when flag is not set */
  readonly defaultValue: T;

  /** Value type: 'boolean', 'enum', 'numeric', 'json' */
  readonly type: 'boolean' | 'enum' | 'numeric' | 'json';

  /** When true, changing this flag requires a backend restart */
  readonly requiresRestart?: boolean;

  /** When true, flag changes should be logged for audit trail */
  readonly requiresAudit?: boolean;

  /** Allowed values if type is 'enum' */
  readonly allowedValues?: readonly string[];

  /** Min/max bounds if type is 'numeric' */
  readonly bounds?: {
    readonly min?: number;
    readonly max?: number;
  };

  /** Tags for filtering (e.g., 'beta', 'high-impact', 'performance') */
  readonly tags?: readonly string[];
}

/**
 * Type-safe registry of all feature flags.
 * Ensures compile-time validation of flag definitions.
 */
export interface FeatureFlagRegistry {
  readonly flags: Readonly<Record<FeatureFlagKey, FeatureFlagDefinition>>;

  /** Get flag definition by key */
  getFlag(key: FeatureFlagKey): FeatureFlagDefinition | undefined;

  /** Get all flags for a scope */
  getFlagsByScope(scope: FlagScope): readonly FeatureFlagDefinition[];

  /** Get all flags with a specific tag */
  getFlagsByTag(tag: string): readonly FeatureFlagDefinition[];

  /** Validate flag key and value */
  validate(key: string, value: unknown): { valid: boolean; error?: string };
}

// ============================================
// API INTERFACE
// ============================================

/**
 * Feature Flags API Adapter — 100% portable.
 * Implemented by backend (Node.js) and frontend (HTTP).
 */
export interface FlagsApi {
  /** Get a single flag value */
  getFlagValue(key: FeatureFlagKey): Promise<FlagValue>;

  /** Get multiple flag values (batch) */
  getFlagValues(
    keys: readonly FeatureFlagKey[]
  ): Promise<Readonly<Record<FeatureFlagKey, FlagValue>>>;

  /** Get ALL flags (admin only) */
  getAllFlags(): Promise<Readonly<Record<FeatureFlagKey, FlagValue>>>;

  /** Check if a flag is enabled (boolean flags only) */
  isEnabled(key: FeatureFlagKey): Promise<boolean>;
}

/**
 * Feature Flags Admin API — For control plane operations.
 */
export interface FlagsAdminApi extends FlagsApi {
  /** Set flag value (admin only) */
  setFlagValue(key: FeatureFlagKey, value: FlagValue): Promise<void>;

  /** Delete flag (revert to default) */
  deleteFlagValue(key: FeatureFlagKey): Promise<void>;

  /** Batch update flags */
  setFlagValues(updates: Readonly<Record<FeatureFlagKey, FlagValue>>): Promise<void>;

  /** Get audit trail for a flag */
  getFlagAuditTrail(key: FeatureFlagKey, limit?: number): Promise<readonly FlagAuditEntry[]>;
}

/**
 * Audit trail entry for flag changes.
 */
export interface FlagAuditEntry {
  readonly timestamp: string;
  readonly userId: string;
  readonly userName: string;
  readonly action: 'set' | 'delete' | 'enable' | 'disable';
  readonly key: FeatureFlagKey;
  readonly previousValue: FlagValue;
  readonly newValue: FlagValue;
  readonly reason?: string;
}

// ============================================
// ERROR TYPES
// ============================================

/** Flag not found error */
export class FlagNotFoundError extends Error {
  constructor(key: FeatureFlagKey) {
    super(`Feature flag not found: ${key}`);
    this.name = 'FlagNotFoundError';
  }
}

/** Invalid flag value error */
export class InvalidFlagValueError extends Error {
  constructor(key: FeatureFlagKey, value: unknown, reason: string) {
    super(`Invalid value for flag ${key}: ${reason} (got ${JSON.stringify(value)})`);
    this.name = 'InvalidFlagValueError';
  }
}
