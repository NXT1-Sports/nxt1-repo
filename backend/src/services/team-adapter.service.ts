/**
 * @fileoverview Team Service Adapter
 * @module @nxt1/backend/services/team-adapter
 *
 * Unified API layer for Teams + RosterEntries architecture.
 *
 * @version 4.0.0
 */

import type { Firestore } from 'firebase-admin/firestore';
import { Team, TeamCode, RosterEntry, RosterEntryStatus, RosterRole } from '@nxt1/core/models';
import { createRosterEntryService } from './roster-entry.service.js';
import { logger } from '../utils/logger.js';

export class TeamServiceAdapter {
  private db: Firestore;
  private rosterService: ReturnType<typeof createRosterEntryService>;

  constructor(db: Firestore) {
    this.db = db;
    this.rosterService = createRosterEntryService(db);
  }

  /**
   * Get team by ID with its roster.
   */
  async getTeamWithMembers(teamId: string): Promise<TeamCode & { roster: RosterEntry[] }> {
    logger.debug('[TeamAdapter] Getting team with members', { teamId });

    const teamDoc = await this.db.collection('Teams').doc(teamId).get();

    if (!teamDoc.exists) {
      throw new Error(`Team ${teamId} not found`);
    }

    const team = teamDoc.data() as Team;
    const roster = await this.rosterService.getTeamRoster({
      teamId,
      status: [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING],
    });

    logger.debug('[TeamAdapter] Loaded team', { teamId, memberCount: roster.length });

    return {
      ...team,
      id: teamId,
      sport:
        ((team as unknown as Record<string, unknown>)['sport'] as string) ?? team.sportName ?? '',
      memberIds: roster.map((e) => e.userId),
      roster,
    } as TeamCode & { roster: RosterEntry[] };
  }

  /**
   * Get user's teams (uses RosterEntries structure)
   */
  async getUserTeams(userId: string): Promise<Team[]> {
    logger.debug('[TeamAdapter] Getting user teams', { userId });

    // Query RosterEntries — include PENDING so coaches who just onboarded
    // (status defaults to PENDING until org admin approves) still resolve.
    const rosterEntries = await this.rosterService.getUserTeams({
      userId,
      status: [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING],
    });

    logger.debug('[TeamAdapter] Found user teams', {
      userId,
      teamCount: rosterEntries.length,
    });

    // Get team details for each entry
    const teams: Team[] = [];
    for (const entry of rosterEntries) {
      const teamDoc = await this.db.collection('Teams').doc(entry.teamId).get();
      if (teamDoc.exists) {
        teams.push({
          ...(teamDoc.data() as Team),
          id: teamDoc.id,
        });
      }
    }
    return teams;
  }

  /**
   * Check if user is on team (uses RosterEntries structure)
   */
  async isUserOnTeam(userId: string, teamId: string): Promise<boolean> {
    const rosterEntry = await this.db
      .collection('RosterEntries')
      .where('userId', '==', userId)
      .where('teamId', '==', teamId)
      .where('status', 'in', ['active', 'pending'])
      .limit(1)
      .get();

    return !rosterEntry.empty;
  }

  /**
   * User joins team (writes to NEW structure)
   * This always uses the new RosterEntry approach
   */
  async joinTeam(params: {
    userId: string;
    teamCode: string;
    userProfile: {
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber?: string;
    };
  }): Promise<RosterEntry> {
    logger.info('[TeamAdapter] User joining team', {
      userId: params.userId,
      teamCode: params.teamCode,
    });

    // Find team by code
    const teamsSnapshot = await this.db
      .collection('Teams')
      .where('teamCode', '==', params.teamCode)
      .limit(1)
      .get();

    if (teamsSnapshot.empty) {
      throw new Error(`Team with code ${params.teamCode} not found`);
    }

    const teamDoc = teamsSnapshot.docs[0];
    const team = teamDoc.data() as Team;

    if (!team.organizationId) {
      throw new Error('Team missing organizationId - needs migration');
    }

    // Create RosterEntry (new structure)
    const entry = await this.rosterService.createRosterEntry({
      userId: params.userId,
      teamId: teamDoc.id,
      organizationId: team.organizationId,
      role: RosterRole.ATHLETE,
      status: RosterEntryStatus.PENDING,
      firstName: params.userProfile.firstName,
      lastName: params.userProfile.lastName,
      email: params.userProfile.email,
      phoneNumber: params.userProfile.phoneNumber,
    });

    logger.info('[TeamAdapter] User joined team successfully', {
      userId: params.userId,
      teamId: teamDoc.id,
      entryId: entry.id,
    });

    return entry;
  }

  /**
   * Get member count for team (uses RosterEntries structure)
   */
  async getTeamMemberCount(teamId: string): Promise<{ athletes: number; coaches: number }> {
    const teamDoc = await this.db.collection('Teams').doc(teamId).get();

    if (!teamDoc.exists) {
      return { athletes: 0, coaches: 0 };
    }

    const team = teamDoc.data() as Team;

    // Return cached counts if available
    if (team.athleteMember !== undefined && team.panelMember !== undefined) {
      return {
        athletes: team.athleteMember,
        coaches: team.panelMember,
      };
    }

    // Calculate from RosterEntries
    const roster = await this.rosterService.getTeamRoster({
      teamId,
      status: [RosterEntryStatus.ACTIVE],
    });

    const athletes = roster.filter((e) =>
      ['athlete', 'starter', 'bench', 'jv'].includes(e.role as string)
    ).length;
    const coaches = roster.filter((e) =>
      ['owner', 'head-coach', 'assistant-coach', 'staff'].includes(e.role as string)
    ).length;

    return { athletes, coaches };
  }

  /**
   * Get team by unicode (uses Teams + RosterEntries structure)
   * Returns team with members in TeamCode format for compatibility
   */
  async getTeamByUnicode(unicode: string): Promise<TeamCode | null> {
    logger.debug('[TeamAdapter] Getting team by unicode', { unicode });

    const teamsSnapshot = await this.db
      .collection('Teams')
      .where('unicode', '==', unicode)
      .limit(1)
      .get();

    if (teamsSnapshot.empty) {
      logger.debug('[TeamAdapter] Team not found', { unicode });
      return null;
    }

    const teamDoc = teamsSnapshot.docs[0];
    const team = teamDoc.data() as Team;

    const roster = await this.rosterService.getTeamRoster({
      teamId: teamDoc.id,
      status: [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING],
    });

    logger.debug('[TeamAdapter] Found team', {
      unicode,
      teamId: teamDoc.id,
      memberCount: roster.length,
    });

    return {
      ...team,
      id: teamDoc.id,
      sport:
        ((team as unknown as Record<string, unknown>)['sport'] as string) ?? team.sportName ?? '',
      memberIds: roster.map((e) => e.userId),
      roster,
    } as TeamCode & { roster: RosterEntry[] };
  }

  /**
   * Get team by slug (uses Teams structure)
   * Queries by slug field directly
   */
  async getTeamBySlug(slug: string): Promise<TeamCode | null> {
    // Normalize: trim and lowercase so URL slugs always match the lowercase
    // values stored by buildTeamSlug/generateUniqueTeamSlug.
    const normalized = slug.trim().toLowerCase();
    logger.debug('[TeamAdapter] Getting team by slug', { slug, normalized });

    // Primary: exact match on the `slug` field (stored lowercase)
    const teamsSnapshot = await this.db
      .collection('Teams')
      .where('slug', '==', normalized)
      .limit(1)
      .get();

    if (!teamsSnapshot.empty) {
      const teamDoc = teamsSnapshot.docs[0];
      return await this.getTeamWithMembers(teamDoc.id);
    }

    // Legacy fallback: match on `unicode` field.
    // Older team docs have no `slug` — coach.managedTeamCodes may still hold the
    // raw unicode string (e.g. "299266") for those teams.
    const unicodeSnapshot = await this.db
      .collection('Teams')
      .where('unicode', '==', slug.trim()) // unicode is digits, preserve original value
      .limit(1)
      .get();

    if (!unicodeSnapshot.empty) {
      logger.debug('[TeamAdapter] Team found via unicode fallback', { slug });
      const teamDoc = unicodeSnapshot.docs[0];
      return await this.getTeamWithMembers(teamDoc.id);
    }

    logger.debug('[TeamAdapter] Team not found', { slug });
    return null;
  }
}

/**
 * Create team adapter instance
 */
export function createTeamAdapter(db: Firestore): TeamServiceAdapter {
  return new TeamServiceAdapter(db);
}

type RequestWithDb = {
  db?: Firestore;
};

/**
 * Helper: Get team adapter from request (for Express middleware)
 */
export function getTeamAdapter(req: RequestWithDb): TeamServiceAdapter {
  if (!req.db) {
    throw new Error('Database not available in request');
  }
  return createTeamAdapter(req.db);
}
