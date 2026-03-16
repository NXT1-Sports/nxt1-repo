/**
 * @fileoverview Profile Hydration Service
 * @module @nxt1/backend/services/profile-hydration
 *
 * Enriches raw User documents with LIVE Organization data fetched at
 * request time, eliminating stale denormalized team snapshots.
 *
 * Architecture:
 * 1. User doc contains sports[].team with a snapshot from signup (potentially stale)
 * 2. RosterEntries link Users → Teams → Organizations relationally
 * 3. This service overlays LIVE Organization branding (logo, colors, name)
 *    onto the User's sport team data before returning to the frontend
 *
 * Data flow:
 *   User.sports[i].sport (e.g. "Football")
 *        ↓ match via Team.sportName
 *   RosterEntry.teamId → Team.sportName, Team.organizationId
 *        ↓
 *   Organization.logoUrl, primaryColor, secondaryColor, name, location, mascot
 *        ↓
 *   User.sports[i].team = { ...snapshot, ...liveOrgData }
 *
 * @version 3.0.0
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { User, SportProfile } from '@nxt1/core';
import type { TeamType } from '@nxt1/core';
import { type Organization, RosterEntryStatus } from '@nxt1/core/models';
import { RosterEntryService } from './roster-entry.service.js';
import { OrganizationService } from './organization.service.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

/** Resolved team data from Team + Organization docs */
interface ResolvedTeamData {
  /** Sport name on the Team doc (matches User.sports[].sport) */
  sportName: string;
  /** Team document ID */
  teamId: string;
  /** Organization document ID */
  organizationId: string;
  /** Team type from the Team doc */
  teamType: string;
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
   * 3. Overlays live data onto User.sports[].team (matched by sportName)
   *
   * Returns a new User object — the original is not mutated.
   */
  async hydrateUser(user: User): Promise<User> {
    if (!user.id || !user.sports?.length) {
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

    // 2. Fetch Team docs to get sportName (parallel)
    //    Also collect unique org IDs to batch-fetch Organizations
    const teamIds = [...new Set(rosterEntries.map((e) => e.teamId))];
    const teamDocs = await Promise.all(
      teamIds.map((id) => this.db.collection(this.TEAMS_COLLECTION).doc(id).get())
    );

    // Build teamId → { sportName, organizationId, teamType } map
    const teamMap = new Map<
      string,
      { sportName: string; organizationId: string; teamType: string }
    >();
    for (const doc of teamDocs) {
      if (doc.exists) {
        const data = doc.data()!;
        teamMap.set(doc.id, {
          sportName: (data['sportName'] as string) ?? '',
          organizationId: (data['organizationId'] as string) ?? '',
          teamType: (data['teamType'] as string) ?? 'high-school',
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

    // 4. Assemble resolved team data
    const resolved: ResolvedTeamData[] = [];
    for (const entry of rosterEntries) {
      const team = teamMap.get(entry.teamId);
      if (!team || !team.sportName) continue;

      const org = orgMap.get(team.organizationId);
      if (!org) continue;

      resolved.push({
        sportName: team.sportName,
        teamId: entry.teamId,
        organizationId: team.organizationId,
        teamType: team.teamType,
        org: {
          name: org.name,
          logoUrl: org.logoUrl,
          primaryColor: org.primaryColor,
          secondaryColor: org.secondaryColor,
          mascot: org.mascot,
          location: org.location
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
   * Matching strategy: Case-insensitive match of Team.sportName → User.sports[].sport.
   * If multiple teams match the same sport (e.g. school + club), the first match
   * applies to sports[].team and the second to sports[].clubTeam.
   *
   * Returns a new User object (does not mutate the original).
   */
  private overlayTeamData(user: User, resolvedTeams: ResolvedTeamData[]): User {
    if (!user.sports?.length) return user;

    // Group resolved teams by sport name (lowercased)
    const bySport = new Map<string, ResolvedTeamData[]>();
    for (const rt of resolvedTeams) {
      const key = rt.sportName.toLowerCase();
      if (!bySport.has(key)) bySport.set(key, []);
      bySport.get(key)!.push(rt);
    }

    const hydratedSports: SportProfile[] = user.sports.map((sport) => {
      const sportKey = (sport.sport ?? '').toLowerCase();
      const matches = bySport.get(sportKey);

      if (!matches?.length) return sport;

      // Primary team: first match (usually school/org team)
      const primaryMatch = matches[0]!;
      const hydratedTeam = {
        ...(sport.team ?? {}),
        name: primaryMatch.org.name,
        type: primaryMatch.teamType as TeamType,
        logoUrl: primaryMatch.org.logoUrl,
        primaryColor: primaryMatch.org.primaryColor,
        secondaryColor: primaryMatch.org.secondaryColor,
        organizationId: primaryMatch.organizationId,
        teamId: primaryMatch.teamId,
      };

      const result: SportProfile = { ...sport, team: hydratedTeam };

      // Secondary team (club): if 2nd match exists, overlay onto clubTeam
      if (matches.length > 1) {
        const clubMatch = matches[1]!;
        result.clubTeam = {
          ...(sport.clubTeam ?? {}),
          name: clubMatch.org.name,
          type: clubMatch.teamType as TeamType,
          logoUrl: clubMatch.org.logoUrl,
          primaryColor: clubMatch.org.primaryColor,
          secondaryColor: clubMatch.org.secondaryColor,
          organizationId: clubMatch.organizationId,
          teamId: clubMatch.teamId,
        };
      }

      return result;
    });

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
