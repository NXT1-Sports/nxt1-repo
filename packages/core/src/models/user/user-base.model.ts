/**
 * @fileoverview User Base Types
 * @module @nxt1/core/models/user
 *
 * Shared base types used across user model.
 * Location, social links, connected sources, verification, etc.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { TeamType } from '../../constants/user.constants';

// ============================================
// SCHEMA VERSION
// ============================================

/** Current schema version for migration tracking */
export const USER_SCHEMA_VERSION = 2;

// ============================================
// LOCATION
// ============================================

/** Geographic location data */
export interface Location {
  address?: string;
  city: string;
  state: string;
  zipCode?: string;
  country: string;
}

// ============================================
// SOCIAL & CONTACT (legacy — still used by team-code.model & auth.routes)
// ============================================

/**
 * @deprecated Use SocialLink[] (agnostic array) instead.
 * Kept temporarily — team-code.model.ts and auth.routes.ts still reference this.
 */
export interface SocialLinks {
  twitter?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  hudl?: string | null;
  youtube?: string | null;
  maxPreps?: string | null;
  linkedin?: string | null;
}

/**
 * @deprecated Use a dedicated contact fields approach.
 * Kept temporarily — team-code.model.ts and auth.routes.ts still reference this.
 */
export interface ContactInfo {
  email: string;
  phone?: string | null;
}

// ============================================
// SOCIAL LINK (agnostic, array-based)
// ============================================

/**
 * Platform-agnostic social link.
 * Replaces hardcoded SocialLinks interface.
 * Stored as an array on User.social.
 */
export interface SocialLink {
  /** Platform identifier (e.g., 'twitter', 'instagram', 'hudl', 'maxpreps') */
  platform: string;
  /** Full URL to the social profile */
  url: string;
  /** Display username/handle (without @) */
  username?: string;
  /** Display order (lower = first) */
  displayOrder?: number;
  /** Whether this link has been verified by the platform or Agent X */
  verified?: boolean;
  /**
   * Scope of this link:
   * - 'global' — applies across all sports/teams (social media, personal brand)
   * - 'sport'  — specific to one sport (e.g., Hudl for Football vs Basketball)
   * - 'team'   — specific to one team (coaches managing multiple programs)
   * Omitted or undefined = 'global' (backward compatible)
   */
  scopeType?: 'global' | 'sport' | 'team';
  /**
   * Context key when scoped:
   * - When scopeType='sport': sport key (e.g., 'football', 'basketball')
   * - When scopeType='team': team identifier
   * Omitted when scopeType='global' or undefined
   */
  scopeId?: string;
}

// ============================================
// CONNECTED SOURCES (Agent X sync)
// ============================================

/**
 * Agnostic connected source for Agent X AI sync.
 * Represents any external profile that is linked and scraped.
 * Platform is NOT hardcoded — supports any source.
 */
export interface ConnectedSource {
  /** Platform identifier (e.g., 'maxpreps', 'hudl', 'perfect-game') */
  platform: string;
  /** URL of the external profile */
  profileUrl: string;
  /** When Agent X last synced data from this source */
  lastSyncedAt?: Date | string;
  /** Current sync status */
  syncStatus?: 'idle' | 'syncing' | 'error' | 'success';
  /** Fields that were synced from this source (for auditability) */
  syncedFields?: string[];
  /** Error message if sync failed */
  lastError?: string;
  /** Scope: 'global' | 'sport' | 'team' (default: 'global') */
  scopeType?: 'global' | 'sport' | 'team';
  /** Sport key or team ID when scoped */
  scopeId?: string;
}

// ============================================
// CONNECTED EMAIL (metadata only — tokens live in sub-collection)
// ============================================

// EmailProvider is defined in campaigns.model.ts ('gmail' | 'microsoft' | 'yahoo' | 'system')
export type { EmailProvider } from '../campaigns.model';

/**
 * Connected email account metadata (stored on User doc).
 * Tokens are NEVER stored here — they live in:
 *   users/{uid}/emailTokens/{provider}
 *
 * This is the 2026 security best practice: User doc is readable by
 * many services; tokens should only be accessible to backend email services.
 */
export interface ConnectedEmail {
  /** Email address */
  email: string;
  /** Provider identifier */
  provider: import('../campaigns.model').EmailProvider;
  /** Whether this connection is currently active */
  isActive: boolean;
  /** When the account was connected */
  connectedAt: Date | string;
  /** Last time email was sent through this account */
  lastUsedAt?: Date | string;
  /** Last error (if any) — no sensitive details */
  lastError?: string;
  /** When last error occurred */
  lastErrorAt?: Date | string;
}

/**
 * OAuth token data for a connected email account.
 * Stored in Firestore sub-collection: users/{uid}/emailTokens/{provider}
 * NEVER stored on the User document.
 */
export interface EmailTokenData {
  /** Provider identifier */
  provider: import('../campaigns.model').EmailProvider;
  /** OAuth access token (encrypted at rest) */
  accessToken: string;
  /** OAuth refresh token (encrypted at rest) */
  refreshToken?: string;
  /** When the access token expires */
  tokenExpiresAt?: Date | string;
  /** When tokens were last refreshed */
  lastRefreshedAt?: Date | string;
}

// ============================================
// VERIFICATION
// ============================================

/** User verification status */
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'premium';

/**
 * Verification scope — which section of a profile is verified.
 * Open union supports known scopes + any future custom scope string.
 */
export type VerificationScope =
  | 'measurables'
  | 'stats'
  | 'recruiting'
  | 'schedule'
  | 'academics'
  | 'film'
  | (string & Record<never, never>);

/**
 * Agnostic section-level verification entry.
 * Any profile section (measurables, stats, recruiting, academics, film, etc.)
 * can be verified by any source.
 *
 * @example
 * { scope: 'measurables', verifiedBy: 'Rivals', sourceLogoUrl: '...', sourceUrl: '...' }
 * { scope: 'stats', verifiedBy: 'MaxPreps', sourceLogoUrl: '...', sourceUrl: '...' }
 */
export interface DataVerification {
  /** Which section this verification applies to */
  scope: VerificationScope;
  /** Who verified the data (e.g., 'Rivals', 'MaxPreps', '247Sports') */
  verifiedBy: string;
  /** Logo URL for the verification source (dynamic, not hardcoded) */
  sourceLogoUrl?: string;
  /** URL to the verification source page */
  sourceUrl?: string;
  /** When the verification was performed */
  verifiedAt?: Date | string;
  /** When this verification expires (optional) */
  expiresAt?: Date | string;
}

/**
 * @deprecated Use `DataVerification[]` with `VerificationScope` instead.
 * Verification info for a sport profile's data.
 */
export interface SportVerification {
  /** Who verified measurables (e.g., 'NXT1 Verified', 'Combine Results') */
  measurablesVerifiedBy?: string;
  /** URL to verification source */
  measurablesVerifiedUrl?: string;
  /** Who verified stats */
  statsVerifiedBy?: string;
  /** URL to stats verification source */
  statsVerifiedUrl?: string;
  /** When the verification occurred */
  verifiedAt?: Date | string;
}

// ============================================
// TEAM HISTORY
// ============================================

/**
 * A team affiliation entry (past or current)
 *
 * NEW in v3.0:
 * - For active memberships, query RosterEntries collection (source of truth)
 * - teamHistory is for display/historical purposes only
 * - rosterEntryId links to the RosterEntry document for this affiliation
 */
export interface TeamHistoryEntry {
  /** Team/school/club name */
  name: string;
  /** Team type */
  type: TeamType;
  /** Team logo URL */
  logoUrl?: string;
  /** Sport this team is for */
  sport?: string;
  /** Location */
  location?: Pick<Location, 'city' | 'state'>;
  /** Season record with this team */
  record?: {
    wins?: number;
    losses?: number;
    ties?: number;
  };
  /** When the athlete joined */
  startDate?: Date | string;
  /** When the athlete left (undefined = still active) */
  endDate?: Date | string;
  /** Whether this is the current team */
  isCurrent?: boolean;
  /**
   * NEW (v3.0): Reference to RosterEntry document ID
   * Use this to query for detailed team-specific data
   */
  rosterEntryId?: string;
  /**
   * NEW (v3.0): Reference to Team document ID
   */
  teamId?: string;
  /**
   * NEW (v3.0): Reference to Organization document ID
   */
  organizationId?: string;
}

// ============================================
// AWARDS
// ============================================

/** A user award/honor */
export interface UserAward {
  /** Award title (e.g., 'All-Conference First Team') */
  title: string;
  /** Category of the award (optional, free-form) */
  category?: string;
  /** Sport (if athletic award) */
  sport?: string;
  /** Season or year */
  season?: string;
  /** Issuing organization */
  issuer?: string;
  /** Date received */
  date?: Date | string;
}

// ============================================
// ACADEMIC INFO
// ============================================

/** Academic information for athletes */
export interface AcademicInfo {
  gpa?: number;
  weightedGpa?: number;
  satScore?: number;
  actScore?: number;
  classRank?: number;
  classSize?: number;
  ncaaEligibilityCenter?: string;
  intendedMajor?: string;
}

// ============================================
// TEAM INFO
// ============================================

/** Team information (school/club) */
export interface TeamInfo {
  /** Team name (optional - user may not know it initially) */
  name?: string;
  type: TeamType;
  logo?: string | null;
  mascot?: string;
  colors?: string[];
  conference?: string;
  division?: string;
}

/** Coach contact for a sport */
export interface CoachContact {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
}

// ============================================
// DATA SOURCE (shared across all verified data)
// ============================================

/**
 * Where a data point originated.
 * Fully agnostic for 2026+ integrations.
 *
 * Examples: 'maxpreps', 'hudl', 'agent-x', 'ncaa', custom partner IDs,
 * internal pipelines, and future providers not known at compile time.
 */
export type DataSource = string;
