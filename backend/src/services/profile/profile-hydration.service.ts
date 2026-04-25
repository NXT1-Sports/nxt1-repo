/**
 * @fileoverview Profile Hydration Service
 * @module @nxt1/backend/services/profile-hydration
 *
 * Enriches raw User documents with LIVE Organization data fetched at
 * request time, eliminating stale denormalized team snapshots.
 *
 * Architecture (v3.1 — Pure Relational):
 * 1. Athletes store physical sports[] (stats, positions, etc.) in their User doc.
 *    RosterEntries + Team + Org data are OVERLAID onto those physical entries.
 * 2. Coaches/Directors do NOT store physical sports[]. Their sport dropdown is
 *    SYNTHESIZED entirely from active RosterEntries at read-time (JIT).
 * 3. This service handles both: overlay (Athletes) and synthesis (Coaches).
 *
 * Data flow:
 *   RosterEntry.teamId → Team.sport, Team.organizationId
 *        ↓
 *   Organization.logoUrl, primaryColor, secondaryColor, name, location, mascot
 *        ↓
 *   If physical sport exists → overlay team branding onto User.sports[i].team
 *   If no physical sport   → synthesize a new SportProfile from the roster data
 *
 * @version 3.1.0
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { User, SportProfile } from '@nxt1/core';
import type { TeamType } from '@nxt1/core';
import { type Organization, RosterEntryStatus } from '@nxt1/core/models';
import { RosterEntryService } from '../team/roster-entry.service.js';
import { OrganizationService } from '../team/organization.service.js';
import { logger } from '../../utils/logger.js';

// ============================================
// TYPES
// ============================================

/** Resolved team data from Team + Organization docs */
interface ResolvedTeamData {
  /** Sport name on the Team doc (matches User.sports[].sport) */
  sport: string;
  /** Team document ID */
  teamId: string;
  /** Organization document ID */
  organizationId: string;
  /** Team type from the Team doc */
  teamType: string;
  /** Team code (short code, e.g. "D897TP") for constructing team profile URL */
  teamCode?: string;
  /** URL slug (e.g. "sotatek-football-5") for constructing team profile URL */
  slug?: string;
  /** Whether the parent organization is claimed. */
  isOrganizationClaimed: boolean;
  /** Whether this user appears in the parent organization's admins array. */
  isUserOrganizationAdmin: boolean;
  /** Live organization data */
  org: {
    name: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    mascot?: string;
    location?: { city?: string; state?: string };
  };
}

function extractOrganizationAdminIds(admins: Organization['admins'] | unknown): string[] {
  if (!Array.isArray(admins)) {
    return [];
  }

  return admins
    .map((admin) => {
      if (!admin || typeof admin !== 'object') {
        return '';
      }

      const userId = (admin as Record<string, unknown>)['userId'];
      return typeof userId === 'string' ? userId.trim() : '';
    })
    .filter((userId): userId is string => userId.length > 0);
}

function resolveOrganizationGovernance(
  organization: Organization | undefined,
  userId: string
): {
  isOrganizationClaimed: boolean;
  isUserOrganizationAdmin: boolean;
} {
  const adminIds = extractOrganizationAdminIds(organization?.admins);

  return {
    isOrganizationClaimed: organization?.isClaimed === true,
    isUserOrganizationAdmin: adminIds.includes(userId),
  };
}

// ============================================
// SERVICE CLASS
// ============================================

export class ProfileHydrationService {
  private readonly TEAMS_COLLECTION = 'Teams';

  constructor(
    private readonly db: Firestore,
    private readonly rosterEntryService: RosterEntryService,
    private readonly organizationService: OrganizationService
  ) {}

  /**
   * Hydrate a User document with LIVE Organization data.
   *
   * For each active RosterEntry the user has:
   * 1. Fetches the Team doc to get sportName + organizationId
   * 2. Fetches the Organization doc to get live branding
   * 3. For Athletes: overlays live data onto existing User.sports[].team
   * 4. For Coaches: synthesizes entirely new SportProfile entries from rosters
   *
   * Returns a new User object — the original is not mutated.
   */
  async hydrateUser(user: User): Promise<User> {
    if (!user.id) {
      return user;
    }

    try {
      const resolvedTeams = await this.resolveUserTeams(user.id);

      if (resolvedTeams.length === 0) {
        return user;
      }

      return this.overlayTeamData(user, resolvedTeams);
    } catch (err) {
      // Hydration failure should never break profile loading.
      // Return the un-hydrated user with stale snapshot data as fallback.
      logger.warn('[ProfileHydration] Failed to hydrate user, returning stale data', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return user;
    }
  }

  /**
   * Resolve all active team affiliations for a user.
   *
   * Returns resolved team data (sport name + live Organization branding) for
   * each active RosterEntry.
   */
  private async resolveUserTeams(userId: string): Promise<ResolvedTeamData[]> {
    // 1. Get all active roster entries for this user
    const rosterEntries = await this.rosterEntryService.getUserTeams({
      userId,
      status: [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING],
    });

    if (rosterEntries.length === 0) {
      return [];
    }

    // 2. Fetch Team docs to get sport (parallel)
    //    Also collect unique org IDs to batch-fetch Organizations
    const teamIds = [...new Set(rosterEntries.map((e) => e.teamId))];
    const teamDocs = await Promise.all(
      teamIds.map((id) => this.db.collection(this.TEAMS_COLLECTION).doc(id).get())
    );

    // Build teamId → { sport, organizationId, teamType, teamCode, slug, ... } map
    const teamMap = new Map<
      string,
      {
        sport: string;
        organizationId: string;
        teamType: string;
        teamName: string;
        teamCode?: string;
        slug?: string;
        logoUrl?: string;
        primaryColor?: string;
        secondaryColor?: string;
        mascot?: string;
      }
    >();
    for (const doc of teamDocs) {
      if (doc.exists) {
        const data = doc.data()!;
        teamMap.set(doc.id, {
          sport: (data['sport'] as string) ?? (data['sportName'] as string) ?? '',
          organizationId: (data['organizationId'] as string) ?? '',
          teamType: (data['teamType'] as string) ?? 'high-school',
          teamName: (data['teamName'] as string) ?? '',
          // teamCode + slug are required for building the canonical team profile URL
          teamCode: (data['teamCode'] as string) ?? undefined,
          slug: (data['slug'] as string) ?? undefined,
          logoUrl: (data['logoUrl'] as string) ?? (data['teamLogoImg'] as string) ?? undefined,
          primaryColor:
            (data['primaryColor'] as string) ?? (data['teamColor1'] as string) ?? undefined,
          secondaryColor:
            (data['secondaryColor'] as string) ?? (data['teamColor2'] as string) ?? undefined,
          mascot: (data['mascot'] as string) ?? undefined,
        });
      }
    }

    // 3. Fetch unique Organizations (parallel, deduplicated)
    const orgIds = [...new Set([...teamMap.values()].map((t) => t.organizationId).filter(Boolean))];

    const orgMap = new Map<string, Organization>();
    const orgResults = await Promise.allSettled(
      orgIds.map((id) => this.organizationService.getOrganizationById(id))
    );
    for (let i = 0; i < orgIds.length; i++) {
      const result = orgResults[i]!;
      if (result.status === 'fulfilled') {
        orgMap.set(orgIds[i]!, result.value);
      }
    }

    // 4. Assemble resolved team data (uses Org data when available, falls back to Team doc)
    const resolved: ResolvedTeamData[] = [];
    for (const entry of rosterEntries) {
      const team = teamMap.get(entry.teamId);
      if (!team || !team.sport) continue;

      const org = orgMap.get(team.organizationId);
      const governance = resolveOrganizationGovernance(org, userId);

      resolved.push({
        sport: team.sport,
        teamId: entry.teamId,
        organizationId: team.organizationId,
        teamType: team.teamType,
        teamCode: team.teamCode,
        slug: team.slug,
        isOrganizationClaimed: governance.isOrganizationClaimed,
        isUserOrganizationAdmin: governance.isUserOrganizationAdmin,
        org: {
          name: org?.name ?? team.teamName,
          logoUrl: org?.logoUrl ?? team.logoUrl,
          primaryColor: org?.primaryColor ?? team.primaryColor,
          secondaryColor: org?.secondaryColor ?? team.secondaryColor,
          mascot: org?.mascot ?? team.mascot,
          location: org?.location
            ? { city: org.location.city, state: org.location.state }
            : undefined,
        },
      });
    }

    return resolved;
  }

  /**
   * Overlay live Organization data onto User.sports[].team.
   *
   * Matching strategy (in priority order):
   *   1. Match by teamId — `sports[i].team.teamId === resolvedTeam.teamId`
   *      Direct, unique, and never ambiguous.
   *   2. Fall back to case-insensitive sport-name match for legacy entries
   *      that were written before teamId was stored.
   *
   * Any resolved team not matched to an existing sport entry is synthesized
   * as a new SportProfile (required for Coaches/Directors who have no physical
   * sports[] in Firestore — their sport list is built purely from RosterEntries).
   *
   * Returns a new User object (does not mutate the original).
   */
  private overlayTeamData(user: User, resolvedTeams: ResolvedTeamData[]): User {
    const existingSports: SportProfile[] = user.sports ?? [];

    // Index resolved teams by teamId (fast O(1) primary lookup)
    const byTeamId = new Map<string, ResolvedTeamData>();
    // Secondary index by sport name for legacy fallback
    const bySportName = new Map<string, ResolvedTeamData>();
    for (const rt of resolvedTeams) {
      byTeamId.set(rt.teamId, rt);
      // Only store the first match per sport (don't overwrite with a secondary team)
      if (!bySportName.has(rt.sport.toLowerCase())) {
        bySportName.set(rt.sport.toLowerCase(), rt);
      }
    }

    // Track which teamIds were matched to existing physical sport entries
    const matchedTeamIds = new Set<string>();

    const hydratedSports: SportProfile[] = existingSports.map((sport) => {
      // Primary lookup: by teamId stored in the sport entry
      const storedTeamId = sport.team?.teamId;
      const match =
        (storedTeamId ? byTeamId.get(storedTeamId) : undefined) ??
        bySportName.get((sport.sport ?? '').toLowerCase());

      if (!match) return sport;

      matchedTeamIds.add(match.teamId);

      const hydratedTeam = {
        ...(sport.team ?? {}),
        name: match.org.name,
        type: match.teamType as TeamType,
        isOrganizationClaimed: match.isOrganizationClaimed,
        isUserOrganizationAdmin: match.isUserOrganizationAdmin,
        logoUrl: match.org.logoUrl,
        primaryColor: match.org.primaryColor,
        secondaryColor: match.org.secondaryColor,
        mascot: match.org.mascot,
        organizationId: match.organizationId,
        teamId: match.teamId,
        // teamCode + slug are needed by the frontend mapper to build the canonical
        // team profile URL (/team/<slug>/<teamCode>). Without them the mapper
        // cannot resolve the route and falls back to /add-sport.
        ...(match.teamCode ? { teamCode: match.teamCode } : {}),
        ...(match.slug ? { slug: match.slug } : {}),
      };

      return { ...sport, team: hydratedTeam };
    });

    // Synthesize SportProfiles for roster associations with no physical sport entry.
    // This is the key architecture shift: Coaches/Directors do NOT store physical
    // sports[] in Firestore — their sport dropdown is built purely from RosterEntries.
    for (const rt of resolvedTeams) {
      if (matchedTeamIds.has(rt.teamId)) continue;

      const synthesized: SportProfile = {
        sport: rt.sport,
        order: hydratedSports.length,
        team: {
          name: rt.org.name,
          type: rt.teamType as TeamType,
          isOrganizationClaimed: rt.isOrganizationClaimed,
          isUserOrganizationAdmin: rt.isUserOrganizationAdmin,
          logoUrl: rt.org.logoUrl,
          primaryColor: rt.org.primaryColor,
          secondaryColor: rt.org.secondaryColor,
          mascot: rt.org.mascot,
          organizationId: rt.organizationId,
          teamId: rt.teamId,
          ...(rt.teamCode ? { teamCode: rt.teamCode } : {}),
          ...(rt.slug ? { slug: rt.slug } : {}),
        },
      } as SportProfile;

      hydratedSports.push(synthesized);
    }

    return { ...user, sports: hydratedSports };
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Create a ProfileHydrationService instance.
 */
export function createProfileHydrationService(
  db: Firestore,
  rosterEntryService: RosterEntryService,
  organizationService: OrganizationService
): ProfileHydrationService {
  return new ProfileHydrationService(db, rosterEntryService, organizationService);
}
