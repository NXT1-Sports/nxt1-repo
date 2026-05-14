/**
 * @fileoverview Feature Flags Module Barrel Export
 * @module @nxt1/core/flags
 *
 * ⭐ THIS MODULE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Single source of truth for all feature flag definitions, types, and APIs.
 * Use this module across backend, web, and mobile.
 *
 * @example
 * ```typescript
 * // Import everything
 * import {
 *   FEATURE_FLAG_REGISTRY,
 *   createFlagsApi,
 *   type FeatureFlagKey,
 *   type FlagsApi,
 * } from '@nxt1/core/flags';
 *
 * // Import by scope
 * import { AGENT_FLAGS, TEAM_FLAGS } from '@nxt1/core/flags';
 *
 * // Backend: Get a flag value
 * const enabled = await flagsService.isEnabled('team.intel.enabled');
 *
 * // Frontend: Call the API
 * const api = createFlagsApi(httpAdapter, environment.apiUrl);
 * const teamFlags = await api.getFlagValues([
 *   'team.intel.enabled',
 *   'team.profiles.enabled',
 * ]);
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// TYPES
// ============================================

export type {
  // Scope unions
  FlagScope,
  TeamFlagKey,
  AthleteFlagKey,
  ScoutFlagKey,
  ContentFlagKey,
  AgentFlagKey,
  AiFlagKey,
  AiRuntimeFlagKey,
  UiFlagKey,
  BillingFlagKey,
  ExperimentalFlagKey,
  FeatureFlagKey,
  // Value unions
  BooleanFlag,
  EnumFlag,
  NumericFlag,
  JsonFlag,
  FlagValue,
  // Registry & definitions
  FeatureFlagDefinition,
  FeatureFlagRegistry,
  // API
  FlagsApi,
  FlagsAdminApi,
  FlagAuditEntry,
} from './flags.types';

// ============================================
// ERROR CLASSES
// ============================================

export { FlagNotFoundError, InvalidFlagValueError } from './flags.types';

// ============================================
// CONSTANTS & REGISTRY
// ============================================

export { FEATURE_FLAG_REGISTRY } from './flags.constants';

// Flag definitions grouped by scope (convenience exports)
export {
  TEAM_FLAGS,
  ATHLETE_FLAGS,
  SCOUT_FLAGS,
  CONTENT_FLAGS,
  AGENT_FLAGS,
  AI_FLAGS,
  UI_FLAGS,
  BILLING_FLAGS,
  EXPERIMENTAL_FLAGS,
} from './flags.constants';

// ============================================
// API FACTORIES
// ============================================

export { createFlagsApi, type FlagsApiType } from './flags.api';
