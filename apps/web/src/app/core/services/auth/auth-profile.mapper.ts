/**
 * @fileoverview Auth Profile Mapper
 * @module @nxt1/web/core/services/auth
 *
 * Pure mapping helpers for translating backend user profiles into the
 * cached auth shape consumed by the web shell and shared display context.
 *
 * This keeps the route-critical team identity data intact across refreshes,
 * especially for coach/director avatar and sidebar navigation.
 */

import { buildTeamSlug, type ConnectedEmail, type ConnectedSource } from '@nxt1/core';
import { resolveCanonicalTeamRoute } from '@nxt1/core/helpers';
import type { CachedUserProfile } from '@nxt1/core/auth';

interface BackendSportLike {
  readonly sport?: string;
  readonly order?: number;
  readonly positions?: string[];
  readonly team?: {
    readonly name?: string;
    readonly logoUrl?: string | null;
    readonly logo?: string | null;
    readonly teamId?: string;
    readonly id?: string;
    readonly teamCode?: string;
    readonly code?: string;
    readonly slug?: string;
    readonly unicode?: string;
  };
}

interface BackendTeamCodeLike {
  readonly teamCode?: string;
  readonly code?: string;
  readonly teamId?: string;
  readonly id?: string;
  readonly slug?: string;
  readonly unicode?: string;
  readonly teamName?: string;
  readonly sport?: string;
  readonly logoUrl?: string | null;
  readonly teamLogoImg?: string | null;
}

export interface BackendProfileLike {
  readonly id: string;
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly profileImgs?: readonly string[] | null;
  readonly role?: string | null;
  readonly onboardingCompleted?: boolean;
  readonly completeSignUp?: boolean;
  readonly isCollegeCoach?: boolean | null;
  readonly isRecruit?: boolean | null;
  readonly connectedEmails?: readonly ConnectedEmail[];
  readonly connectedSources?: readonly ConnectedSource[];
  readonly teamCode?: BackendTeamCodeLike | string | null;
  readonly sports?: readonly BackendSportLike[] | Record<string, BackendSportLike>;
  readonly coach?: {
    readonly managedTeamCodes?: readonly string[] | null;
  } | null;
  readonly team?: {
    readonly name?: string;
    readonly logoUrl?: string;
    readonly logo?: string | null;
    readonly teamId?: string;
    readonly id?: string;
    readonly teamCode?: string;
    readonly code?: string;
    readonly slug?: string;
    readonly unicode?: string;
  } | null;
}

/**
 * Convert backend profile payload into the cached auth user profile while
 * preserving the canonical team identifier needed for team-role routing.
 */
export function mapBackendProfileToCachedUserProfile(user: BackendProfileLike): CachedUserProfile {
  const sports = normalizeSports(user.sports);
  const primarySport = sports.find((sport) => sport.order === 0)?.sport;
  const sportTeam = sports.find((sport) => sport.team?.name)?.team;
  const rawTopTeam = user.team ?? undefined;
  const rawTeamCode = user.teamCode;
  const normalizedTeamCode = rawTeamCode && typeof rawTeamCode === 'object' ? rawTeamCode : null;
  const rawTeamReference = typeof rawTeamCode === 'string' ? rawTeamCode.trim() : '';

  const teamName =
    normalizedTeamCode?.teamName?.trim() ||
    sportTeam?.name?.trim() ||
    rawTopTeam?.name?.trim() ||
    '';

  const explicitSlug = normalizedTeamCode?.slug?.trim() || '';
  const derivedSlug = teamName ? buildTeamSlug(teamName) : '';
  const slugFromLegacyString =
    rawTeamReference && isLikelySlugValue(rawTeamReference) ? buildTeamSlug(rawTeamReference) : '';

  const fallbackDocumentIdentifier =
    normalizedTeamCode?.teamId?.trim() ||
    normalizedTeamCode?.id?.trim() ||
    sportTeam?.teamId?.trim() ||
    sportTeam?.id?.trim() ||
    rawTopTeam?.teamId?.trim() ||
    rawTopTeam?.id?.trim() ||
    undefined;

  const unicode =
    normalizedTeamCode?.unicode?.trim() ||
    sportTeam?.unicode?.trim() ||
    rawTopTeam?.unicode?.trim() ||
    undefined;

  const resolvedTeamRoute = resolveCanonicalTeamRoute({
    slug:
      explicitSlug || sportTeam?.slug?.trim() || rawTopTeam?.slug?.trim() || slugFromLegacyString,
    teamName,
    teamCode:
      normalizedTeamCode?.teamCode?.trim() ||
      sportTeam?.teamCode?.trim() ||
      rawTopTeam?.teamCode?.trim() ||
      rawTeamReference,
    code: normalizedTeamCode?.code?.trim() || sportTeam?.code?.trim() || rawTopTeam?.code?.trim(),
    teamId:
      normalizedTeamCode?.teamId?.trim() || sportTeam?.teamId?.trim() || rawTopTeam?.teamId?.trim(),
    id: normalizedTeamCode?.id?.trim() || sportTeam?.id?.trim() || rawTopTeam?.id?.trim(),
    unicode,
    managedTeamCodes: user.coach?.managedTeamCodes,
  });

  const slug = resolvedTeamRoute?.slug || explicitSlug || derivedSlug || slugFromLegacyString || '';
  const canonicalTeamIdentifier = resolvedTeamRoute?.teamIdentifier ?? fallbackDocumentIdentifier;

  return {
    uid: user.id,
    email: user.email ?? '',
    firstName: user.firstName,
    lastName: user.lastName,
    profileImg: user.profileImgs?.[0] ?? null,
    displayName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
    role: user.role ?? null,
    onboardingCompleted: user.onboardingCompleted,
    completeSignUp: user.completeSignUp,
    isCollegeCoach: user.isCollegeCoach ?? null,
    isRecruit: user.isRecruit ?? null,
    teamCode:
      teamName || slug || canonicalTeamIdentifier || unicode
        ? {
            teamCode: canonicalTeamIdentifier,
            teamId:
              normalizedTeamCode?.teamId?.trim() ||
              normalizedTeamCode?.id?.trim() ||
              sportTeam?.teamId?.trim() ||
              sportTeam?.id?.trim() ||
              rawTopTeam?.teamId?.trim() ||
              rawTopTeam?.id?.trim() ||
              undefined,
            slug: slug || undefined,
            unicode: unicode,
            teamName: teamName || undefined,
            sport: normalizedTeamCode?.sport?.trim() || primarySport,
            logoUrl:
              normalizedTeamCode?.logoUrl ??
              normalizedTeamCode?.teamLogoImg ??
              sportTeam?.logoUrl ??
              sportTeam?.logo ??
              rawTopTeam?.logoUrl ??
              null,
          }
        : null,
    managedTeamCodes: user.coach?.managedTeamCodes ?? null,
    primarySport,
    selectedSports: sports.map((sport) => sport.sport),
    connectedEmails: Array.isArray(user.connectedEmails) ? [...user.connectedEmails] : undefined,
    sports: sports.map((sport) => ({
      sport: sport.sport,
      positions: sport.positions,
      isPrimary: sport.order === 0,
      team: sport.team,
    })),
    connectedSources: Array.isArray(user.connectedSources) ? [...user.connectedSources] : undefined,
  };
}

function isLikelySlugValue(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim());
}

function normalizeSports(
  sports: BackendProfileLike['sports']
): ReadonlyArray<BackendSportLike & { readonly sport: string }> {
  const rawSports = Array.isArray(sports)
    ? sports
    : sports && typeof sports === 'object'
      ? Object.values(sports)
      : [];

  return rawSports.flatMap((sport) => {
    const sportName = sport.sport?.trim();
    if (!sportName) {
      return [];
    }

    return [
      {
        ...sport,
        sport: sportName,
        positions: sport.positions?.filter((position: string) => position.trim().length > 0),
      },
    ];
  });
}
