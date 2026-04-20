/**
 * @fileoverview Platform Types — Shared sports platform metadata
 * @module @nxt1/core/platforms
 *
 * Pure TypeScript types for the NXT1 connected-platform system.
 * These types describe every platform a user can link to their profile
 * (social, film, stats, recruiting, academic, schedule, contact, sign-in).
 *
 * ⭐ PURE TYPES — No framework dependencies, no side effects.
 */

// ============================================
// PLATFORM TYPES
// ============================================

/** Connection method: 'link' = paste URL/username, 'signin' = OAuth sign-in */
export type PlatformConnectionType = 'link' | 'signin';

/**
 * Platform scope — determines whether a platform's links are global
 * or scoped to a specific sport/team.
 *
 * - 'global' — One link applies everywhere (Instagram, Twitter, YouTube)
 * - 'sport'  — Per-sport profiles (Hudl, MaxPreps, Perfect Game)
 * - 'team'   — Per-team profiles (mostly for coaches managing multiple programs)
 */
export type PlatformScope = 'global' | 'sport' | 'team';

/** Platform category for grouping in the UI */
export type PlatformCategory =
  | 'social'
  | 'film'
  | 'recruiting'
  | 'metrics'
  | 'stats'
  | 'academic'
  | 'schedule'
  | 'contact'
  | 'signin';

/** Platform definition for connected accounts */
export interface PlatformDefinition {
  /** Unique platform identifier */
  readonly platform: string;
  /** Display label */
  readonly label: string;
  /** Icon name from icon registry */
  readonly icon: string;
  /** How the user connects: paste link/username or sign in */
  readonly connectionType: PlatformConnectionType;
  /** Category for section grouping */
  readonly category: PlatformCategory;
  /**
   * Whether this platform's links are global or per-sport/team.
   * - 'global' — One link across all sports (social media)
   * - 'sport'  — User links separately per sport (film, stats, recruiting)
   * - 'team'   — User links separately per team (coach programs)
   */
  readonly scope: PlatformScope;
  /** Sports this platform is relevant for (empty = all sports) */
  readonly sports: readonly string[];
  /** Input placeholder text */
  readonly placeholder: string;
  /**
   * Login URL for Firecrawl-based sign-in platforms.
   * When present, Agent X opens an interactive browser session at this URL
   * so the user can authenticate. The session is persisted via Firecrawl
   * Persistent Profiles for future autonomous access.
   *
   * Only used when `connectionType === 'signin'`.
   */
  readonly loginUrl?: string;
}
