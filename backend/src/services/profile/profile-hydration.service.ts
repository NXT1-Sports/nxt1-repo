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

    // Build teamId → { sport, organizationId, teamType } map
    const teamMap = new Map<
      string,
      {
        sport: string;
        organizationId: string;
        teamType: string;
        teamName: string;
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
   * Matching strategy: Case-insensitive match of Team.sport → User.sports[].sport.
   * If multiple teams match the same sport, the first match becomes the sport's
   * embedded team affiliation. Additional affiliations are resolved relationally.
   *
   * Returns a new User object (does not mutate the original).
   */
  private overlayTeamData(user: User, resolvedTeams: ResolvedTeamData[]): User {
    const existingSports: SportProfile[] = user.sports ?? [];

    // Group resolved teams by sport name (lowercased)
    const bySport = new Map<string, ResolvedTeamData[]>();
    for (const rt of resolvedTeams) {
      const key = rt.sport.toLowerCase();
      if (!bySport.has(key)) bySport.set(key, []);
      bySport.get(key)!.push(rt);
    }

    // Track which sports were matched to physical entries
    const matchedSportKeys = new Set<string>();

    const hydratedSports: SportProfile[] = existingSports.map((sport) => {
      const sportKey = (sport.sport ?? '').toLowerCase();
      const matches = bySport.get(sportKey);

      if (!matches?.length) return sport;

      matchedSportKeys.add(sportKey);

      // Primary team: first match (usually school/org team)
      const primaryMatch = matches[0]!;
      const hydratedTeam = {
        ...(sport.team ?? {}),
        name: primaryMatch.org.name,
        type: primaryMatch.teamType as TeamType,
        isOrganizationClaimed: primaryMatch.isOrganizationClaimed,
        isUserOrganizationAdmin: primaryMatch.isUserOrganizationAdmin,
        logoUrl: primaryMatch.org.logoUrl,
        primaryColor: primaryMatch.org.primaryColor,
        secondaryColor: primaryMatch.org.secondaryColor,
        mascot: primaryMatch.org.mascot,
        organizationId: primaryMatch.organizationId,
        teamId: primaryMatch.teamId,
      };

      const result: SportProfile = { ...sport, team: hydratedTeam };

      return result;
    });

    // Synthesize SportProfiles for roster associations with no physical sport entry.
    // This is the key architecture shift: Coaches/Directors do NOT store physical
    // sports[] in the database — their sport dropdown is built purely from RosterEntries.
    for (const [sportKey, matches] of bySport) {
      if (matchedSportKeys.has(sportKey)) continue;

      const primaryMatch = matches[0]!;
      const synthesized: SportProfile = {
        sport: primaryMatch.sport,
        order: hydratedSports.length,
        team: {
          name: primaryMatch.org.name,
          type: primaryMatch.teamType as TeamType,
          isOrganizationClaimed: primaryMatch.isOrganizationClaimed,
          isUserOrganizationAdmin: primaryMatch.isUserOrganizationAdmin,
          logoUrl: primaryMatch.org.logoUrl,
          primaryColor: primaryMatch.org.primaryColor,
          secondaryColor: primaryMatch.org.secondaryColor,
          mascot: primaryMatch.org.mascot,
          organizationId: primaryMatch.organizationId,
          teamId: primaryMatch.teamId,
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
