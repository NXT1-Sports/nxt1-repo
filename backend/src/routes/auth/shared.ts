/**
 * @fileoverview Auth Routes — Shared Types and Helpers
 * @module @nxt1/backend/routes/auth
 *
 * Types, interfaces, and pure helper functions shared across the auth sub-route
 * modules. No router instances or Express middleware here.
 */

import { FieldValue } from 'firebase-admin/firestore';
import type {
  UserRole,
  SportProfile,
  Location,
  UserContact,
  ConnectedEmail,
  PortableTimestamp,
} from '@nxt1/core';
import {
  USER_SCHEMA_VERSION,
  normalizeName,
  SPORT_POSITIONS,
  normalizeSportKey,
  isTeamRole,
} from '@nxt1/core';

// ── Re-export for consumers that import from this file ───────────────────────
export type { UserRole, SportProfile, Location, UserContact, ConnectedEmail };
export { USER_SCHEMA_VERSION, normalizeName, isTeamRole };

// ============================================================================
// V2 USER MODEL TYPES
// ============================================================================

/**
 * V2 User document structure for Firestore
 *
 * Design Principles:
 * - User document = Identity + Profile ONLY
 * - Credits/limits → Metered usage billing (no storage needed)
 *
 * @see @nxt1/core User model
 */
export interface UserV2Document {
  // Core identity
  email: string;
  firstName?: string;
  lastName?: string;
  profileImgs?: string[];
  aboutMe?: string;
  gender?: string;

  // V2: Single role field
  role?: UserRole;
  lastLoginAt?: PortableTimestamp;

  // V2: Sports array
  sports?: SportProfile[];
  activeSportIndex?: number;

  // V2: Nested objects
  location?: Location;
  contact?: UserContact;

  // Connected sources (all platforms - social, film, stats, recruiting)
  connectedSources?: ConnectedSourceRecord[];

  classOf?: number;

  // Coach-specific
  coach?: {
    title?: string;
    organization?: string;
    /** Unicode slugs of teams this coach/director manages */
    managedTeamCodes?: string[];
  };

  // Onboarding
  onboardingCompleted: boolean;
  onboardingCompletedAt?: PortableTimestamp;
  onboardingProgress?: Record<string, { completed: boolean; completedAt: PortableTimestamp }>;
  /** Original document ID from the legacy NXT1 system — set by migration script. */
  _legacyId?: string;
  /** Whether a legacy-migrated user has completed the 3-step intro onboarding. */
  legacyOnboardingCompleted?: boolean;

  // Team association (for team-based access)
  teamCode?: {
    teamCode: string;
    teamName: string;
    teamId: string;
  };

  // Referral tracking
  referralId?: string;
  referralSource?: string;
  referralDetails?: string | null;

  // Connected email accounts for campaigns/outreach.
  // SECURITY: Only metadata (ConnectedEmail) is stored here.
  // OAuth tokens live in: Users/{uid}/oauthTokens/{provider} (subcollection).
  // Firestore rules restrict that subcollection to backend/Functions only.
  connectedEmails?: ConnectedEmail[];

  // User preferences (notifications, tracking, theme, etc.)
  preferences?: Record<string, unknown>;

  // Timestamps
  createdAt: PortableTimestamp;
  updatedAt: PortableTimestamp;

  // Schema version for migrations
  _schemaVersion: number;

  // ============================================
  // MINIMAL LEGACY FIELDS (being phased out)
  // ============================================
  highSchool?: string; // For backward compat only
  state?: string; // For backward compat only
  city?: string; // For backward compat only
  organization?: string; // For coaches backward compat
}

export interface ConnectedSourceRecord {
  platform: string;
  profileUrl: string;
  faviconUrl?: string;
  syncStatus: 'idle';
  scopeType?: string;
  scopeId?: string;
  displayOrder?: number;
  /** Display name of the person who added this link */
  addedBy?: string;
  /** User ID of the person who added this link */
  addedById?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map frontend userType to V2 role (3 core roles).
 * Handles legacy role strings from existing Firestore documents.
 */
export function mapUserTypeToRole(userType: string): UserRole {
  const roleMap: Record<string, UserRole> = {
    athlete: 'athlete',
    coach: 'coach',
    director: 'director' as UserRole,
    // Legacy aliases → 3 core roles
    recruiter: 'coach' as UserRole,
    parent: 'athlete',
    'college-coach': 'coach' as UserRole,
    'recruiting-service': 'coach' as UserRole,
    scout: 'coach' as UserRole,
    media: 'coach' as UserRole,
    fan: 'athlete',
    service: 'coach' as UserRole,
  };
  return roleMap[userType as keyof typeof roleMap] ?? 'athlete';
}

export function clearLegacyLocationFields(target: Record<string, unknown>): void {
  target['city'] = FieldValue.delete();
  target['state'] = FieldValue.delete();
}

export function sanitizeStoredTeam(team?: SportProfile['team']): SportProfile['team'] | undefined {
  const hasTeamAffiliation = Boolean(team?.name?.trim() || team?.organizationId || team?.teamId);
  if (!team?.type || !hasTeamAffiliation) return undefined;

  return {
    type: team.type,
    ...(team.name ? { name: team.name } : {}),
    ...(team.title ? { title: team.title } : {}),
    ...(team.organizationId ? { organizationId: team.organizationId } : {}),
    ...(team.teamId ? { teamId: team.teamId } : {}),
    ...(team.city ? { city: team.city } : {}),
    ...(team.state ? { state: team.state } : {}),
  };
}

export function getLegacyCoachTitle(user?: UserV2Document): string | undefined {
  const rootCoachTitle = (user as Record<string, unknown> | undefined)?.['coachTitle'];
  if (typeof rootCoachTitle === 'string' && rootCoachTitle.trim().length > 0) {
    return rootCoachTitle.trim();
  }

  const nestedCoachTitle = user?.coach?.title;
  if (typeof nestedCoachTitle === 'string' && nestedCoachTitle.trim().length > 0) {
    return nestedCoachTitle.trim();
  }

  const existingSportTitle = user?.sports?.find((sport) => sport.team?.title)?.team?.title;
  if (typeof existingSportTitle === 'string' && existingSportTitle.trim().length > 0) {
    return existingSportTitle.trim();
  }

  return undefined;
}

export function sanitizeSportsForStorage(sports?: SportProfile[]): SportProfile[] | undefined {
  if (!Array.isArray(sports)) return undefined;

  return sports.map((sport) => {
    const { team: _team, ...sportWithoutTeam } = sport;
    const sanitizedTeam = sport.team ? sanitizeStoredTeam(sport.team) : undefined;

    return {
      ...sportWithoutTeam,
      ...(sanitizedTeam ? { team: sanitizedTeam } : {}),
    };
  });
}

/**
 * Normalize positions to Title Case using SPORT_POSITIONS as the canonical source.
 * Looks up each position (case-insensitive) in SPORT_POSITIONS for the given sport.
 * Falls back to regex title-casing if no canonical match is found.
 */
export function normalizePositions(positions: readonly string[], sport: string): string[] {
  if (!positions || positions.length === 0) return [];

  const sportKey = normalizeSportKey(sport);
  const canonical = SPORT_POSITIONS[sportKey] ?? [];

  // Build lowercase → Title Case lookup from SPORT_POSITIONS
  const canonicalMap = new Map<string, string>();
  for (const p of canonical) {
    canonicalMap.set(p.toLowerCase(), p);
  }

  const normalized = new Set<string>();
  for (const p of positions) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const match = canonicalMap.get(trimmed.toLowerCase());
    normalized.add(match ?? trimmed.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  return Array.from(normalized);
}

export function createSportProfile(
  sport: string,
  order: number,
  options?: {
    readonly positions?: string[];
    readonly teamName?: string;
    readonly title?: string;
    readonly teamType?: string;
    readonly city?: string;
    readonly state?: string;
    readonly teamId?: string;
    readonly organizationId?: string;
  }
): SportProfile {
  const VALID_TEAM_TYPES = [
    'high-school',
    'club',
    'college',
    'middle-school',
    'juco',
    'organization',
  ] as const;
  type ValidTeamType = (typeof VALID_TEAM_TYPES)[number];

  const teamType: ValidTeamType =
    options?.teamType && VALID_TEAM_TYPES.includes(options.teamType as ValidTeamType)
      ? (options.teamType as ValidTeamType)
      : 'high-school';

  const normalizedPositions = options?.positions
    ? normalizePositions(options.positions, sport)
    : [];

  const profile: SportProfile = {
    sport,
    order,
    team: {
      type: teamType,
      name: '',
    },
  };

  if (normalizedPositions.length > 0) {
    profile.positions = normalizedPositions;
  }

  if (options?.teamName || options?.teamType) {
    profile.team = {
      type: teamType,
      name: options?.teamName || '',
      ...(options?.title ? { title: options.title } : {}),
      ...(options?.teamId ? { teamId: options.teamId } : {}),
      ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
    };
  } else if (options?.teamId || options?.organizationId || options?.title) {
    profile.team = {
      ...profile.team!,
      ...(options?.teamId ? { teamId: options.teamId } : {}),
      ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
      ...(options?.title ? { title: options.title } : {}),
    };
  }
  return profile;
}

export function getPrimarySport(sports?: SportProfile[]): string | undefined {
  if (!sports?.length) return undefined;
  const primary = sports.find((s) => s.order === 0) ?? sports[0];
  return primary?.sport;
}

// ── OAuth Helpers ────────────────────────────────────────────────────────────

/** Known mobile app URI schemes allowed as OAuth callback targets */
export const ALLOWED_MOBILE_SCHEMES = new Set(['nxt1sports', 'nxt1app', 'nxt1']);

/**
 * Returns allowed frontend origins for the current environment.
 */
export function getAllowedOrigins(isStaging: boolean): string[] {
  const key = isStaging ? 'STAGING_ALLOWED_FRONTEND_ORIGINS' : 'ALLOWED_FRONTEND_ORIGINS';
  return (
    process.env[key]
      ?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? ['http://localhost:4200', 'http://localhost:4201']
  );
}

export function isAllowedOrigin(origin: string, isStaging: boolean): boolean {
  return getAllowedOrigins(isStaging).includes(origin);
}

export function getDefaultFrontendUrl(isStaging: boolean): string {
  return getAllowedOrigins(isStaging)[0] ?? 'http://localhost:4200';
}

/** Encode state payload as base64url JSON: { uid, origin?, mobileScheme? } */
export function encodeOAuthState(uid: string, origin: string, mobileScheme?: string): string {
  return Buffer.from(
    JSON.stringify({ uid, origin, ...(mobileScheme && { mobileScheme }) })
  ).toString('base64url');
}

/** Decode state — supports both legacy plain-uid and new base64url JSON. */
export function decodeOAuthState(state: string): {
  uid: string;
  origin?: string;
  mobileScheme?: string;
} {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
      uid?: string;
      origin?: string;
      mobileScheme?: string;
    };
    if (decoded.uid)
      return { uid: decoded.uid, origin: decoded.origin, mobileScheme: decoded.mobileScheme };
  } catch {
    // legacy: state was just the uid string
  }
  return { uid: state };
}
