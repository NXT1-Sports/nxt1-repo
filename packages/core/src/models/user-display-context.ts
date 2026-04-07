/**
 * @fileoverview User Display Context — Single Source of Truth
 * @module @nxt1/core/models/user-display-context
 *
 * Centralized mapper that builds the display context for user menus,
 * sidebars, and headers across Web and Mobile apps.
 *
 * This replaces 5 separate mapping functions that were duplicated across:
 * - web-shell.component.ts (headerUserData, sidebarUserData, mobileSidebarUserData, mobileHeaderUserData)
 * - mobile-shell.component.ts (sidenavUser)
 *
 * 100% portable — pure TypeScript, zero framework dependencies.
 */

import { isTeamRole } from '../constants/user.constants';
import { formatSportDisplayName } from '../constants/sport.constants';
import type { SidenavSportProfile } from './navigation.model';

// ============================================
// INPUT TYPE — What the auth layer provides
// ============================================

/**
 * Raw user data from the auth layer. This is the union of all fields
 * that any display context might need. Consumers pass their auth user
 * (or a cast of it) directly.
 */
export interface UserDisplayInput {
  readonly displayName?: string;
  readonly email?: string;
  readonly profileImg?: string;
  readonly unicode?: string;
  readonly role?: string | null;
  readonly isPremium?: boolean;
  readonly teamCode?: {
    readonly slug?: string;
    readonly teamName?: string;
    readonly sport?: string;
    readonly logoUrl?: string | null;
    readonly teamLogoImg?: string | null;
  } | null;
  readonly managedTeamCodes?: string[] | null;
  readonly sports?: ReadonlyArray<{
    readonly sport: string;
    readonly positions?: string[];
    readonly isPrimary?: boolean;
    readonly order?: number;
  }>;
  readonly primarySport?: string;
}

/**
 * Minimal Firebase user info used as fallback when backend profile
 * hasn't loaded yet.
 */
export interface UserDisplayFallback {
  readonly displayName?: string | null;
  readonly email?: string | null;
}

// ============================================
// OUTPUT TYPE — What UI components consume
// ============================================

/**
 * Unified user display context. Every UI surface (top-nav dropdown,
 * mobile sidebar, desktop sidebar, mobile header, native sidenav)
 * renders from this single shape.
 */
export interface UserDisplayContext {
  /** Display name — team name for coaches/directors, personal name for athletes */
  readonly name: string;

  /** Email address */
  readonly email?: string;

  /** Avatar URL — team logo for coaches/directors, profile photo for athletes */
  readonly profileImg?: string;

  /** Initials fallback for avatar (derived from name) */
  readonly initials: string;

  /** User handle (e.g. @username) */
  readonly handle?: string;

  /** Whether the user has a premium subscription */
  readonly isPremium: boolean;

  /** Whether the user is verified */
  readonly verified: boolean;

  // ── Role Context ──

  /** Whether this user is a team-management role (coach/director) */
  readonly isTeamRole: boolean;

  /** Whether this user belongs to a team/org (athletes with teamCode, or any team role) */
  readonly isOnTeam: boolean;

  // ── Sport/Team Switcher ──

  /** Section title above the profile row: "Teams" for coaches, "Sports" for athletes */
  readonly switcherTitle: string;

  /** Label shown below the name: "Football", "Football · QB", etc. */
  readonly sportLabel?: string;

  /** CTA button text: "Add Team" for coaches, "Add Sport" for athletes */
  readonly actionLabel: string;

  /** Profiles for the expandable switcher list */
  readonly sportProfiles: readonly SidenavSportProfile[];

  // ── Navigation ──

  /** Route to navigate when the user info row is clicked */
  readonly profileRoute: string;
}

// ============================================
// BUILDER FUNCTION — The Single Source of Truth
// ============================================

/**
 * Build a unified display context from raw auth user data.
 *
 * This is the ONE function that decides:
 * - What name to show (team name vs personal name)
 * - What avatar to show (team logo vs personal photo — NEVER Google photo for team roles)
 * - What the switcher title is ("Teams" vs "Sports")
 * - What the action button says ("Add Team" vs "Add Sport")
 * - What sport label appears below the name
 * - What the switcher profiles list contains
 * - Where clicking the user info navigates to
 *
 * @param user - Auth user data (or null)
 * @param fallback - Firebase user info (fallback when backend profile not loaded)
 * @returns UserDisplayContext or null if no user data available
 */
export function buildUserDisplayContext(
  user: UserDisplayInput | null | undefined,
  fallback?: UserDisplayFallback | null
): UserDisplayContext | null {
  if (!user && !fallback) return null;

  // ── Resolve Personal Name (always needed as fallback) ──
  const personalName =
    user?.displayName ||
    user?.email?.split('@')[0] ||
    fallback?.displayName ||
    fallback?.email?.split('@')[0] ||
    'User';

  // ── Determine Role Context ──
  const isTeam = user?.role ? isTeamRole(user.role) : false;

  // ── Premium Status ──
  const isPremium = !!user?.isPremium;

  if (isTeam) {
    return buildTeamContext(user!, personalName, isPremium);
  }
  return buildAthleteContext(user, fallback, personalName, isPremium);
}

// ============================================
// PRIVATE BUILDERS
// ============================================

function buildTeamContext(
  user: UserDisplayInput,
  personalName: string,
  isPremium: boolean
): UserDisplayContext {
  const teamCode = user.teamCode;
  const slug = teamCode?.slug ?? user.managedTeamCodes?.[0];
  const teamName = teamCode?.teamName;
  const sport = teamCode?.sport;
  const logoUrl = teamCode?.logoUrl ?? teamCode?.teamLogoImg ?? null;

  // Name: ALWAYS the team name for team roles. If no team name set, show explicit fallback.
  const name = teamName || personalName;

  // Avatar: ONLY the team logo. Never the user's personal/Google photo.
  const profileImg = logoUrl || undefined;

  // Sport label below name
  const sportLabel = sport ? formatSportDisplayName(sport) : undefined;

  // Build sport profiles for the Teams switcher.
  // Primary sport comes from teamCode; additional sports (added via add-sport wizard)
  // come from user.sports[]. Both share the same team logo as the avatar fallback.
  // For team roles, sport profiles use: sport → team name, position → sport label.
  const primaryProfile: SidenavSportProfile | null = sport
    ? {
        id: 'team-primary',
        sport: name,
        position: formatSportDisplayName(sport),
        isActive: true,
        profileImg,
      }
    : null;

  // Exclude any sport that matches the primary teamCode sport to avoid duplicates
  const primarySportNorm = sport?.trim().toLowerCase();
  const additionalProfiles: SidenavSportProfile[] =
    user.sports
      ?.filter((s) => s.sport?.trim().toLowerCase() !== primarySportNorm)
      .map((s, i) => ({
        id: `team-sport-${i}`,
        sport: name,
        position: formatSportDisplayName(s.sport),
        isActive: false,
        profileImg,
      })) ?? [];

  const sportProfiles: SidenavSportProfile[] = [
    ...(primaryProfile ? [primaryProfile] : []),
    ...additionalProfiles,
  ];

  return {
    name,
    email: user.email,
    profileImg,
    initials: getInitials(name),
    handle: user.unicode ? `@${user.unicode}` : undefined,
    isPremium,
    verified: false,
    isTeamRole: true,
    isOnTeam: true,
    switcherTitle: 'Teams',
    sportLabel,
    actionLabel: 'Add Team',
    sportProfiles,
    profileRoute: slug ? `/team/${slug}` : '/profile',
  };
}

function buildAthleteContext(
  user: UserDisplayInput | null | undefined,
  fallback: UserDisplayFallback | null | undefined,
  personalName: string,
  isPremium: boolean
): UserDisplayContext {
  const profileImg = user?.profileImg || undefined;

  // Resolve sport label from the primary sport + position
  let sportLabel: string | undefined;
  const activeSport = user?.sports?.find((s) => s.isPrimary || s.order === 0);
  const firstSport = user?.sports?.[0];
  const profile = activeSport ?? firstSport;

  if (profile?.sport && profile.positions?.[0]) {
    sportLabel = `${formatSportDisplayName(profile.sport)} · ${profile.positions[0]}`;
  } else if (profile?.sport) {
    sportLabel = formatSportDisplayName(profile.sport);
  }

  // Build sport profiles from user's sports array
  const sportProfiles: SidenavSportProfile[] =
    user?.sports?.map((s, i) => ({
      id: `sport-${i}`,
      sport: s.sport,
      position: s.positions?.[0],
      isActive: !!(s.isPrimary || i === 0),
      profileImg: user.profileImg || undefined,
    })) ?? [];

  return {
    name: personalName,
    email: user?.email || fallback?.email || undefined,
    profileImg,
    initials: getInitials(personalName),
    handle: user?.unicode ? `@${user.unicode}` : undefined,
    isPremium,
    verified: false,
    isTeamRole: false,
    isOnTeam: !!(user?.teamCode?.slug || user?.teamCode?.teamName),
    switcherTitle: 'Sports',
    sportLabel,
    actionLabel: 'Add Sport',
    sportProfiles,
    profileRoute: '/profile',
  };
}

// ============================================
// UTILITIES
// ============================================

/**
 * Derive initials from a display name.
 * "John Doe" → "JD", "Basketball Team" → "BT", "J" → "J"
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
