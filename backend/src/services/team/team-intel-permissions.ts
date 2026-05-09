import type { Firestore } from 'firebase-admin/firestore';

import { RosterEntryService } from './roster-entry.service.js';

export interface TeamIntelPermissionMemberLike {
  readonly id?: string;
  readonly uid?: string;
  readonly userId?: string;
  readonly role?: string | null;
}

interface TeamIntelPermissionInput {
  readonly userId: string;
  readonly legacyMembers?: readonly TeamIntelPermissionMemberLike[];
  readonly roster?: readonly TeamIntelPermissionMemberLike[];
}

interface TeamMutationPermissionInput {
  readonly userId: string;
  readonly teamData: Record<string, unknown>;
  readonly rosterRole?: unknown;
}

const TEAM_INTEL_MANAGER_ROLES = new Set([
  'administrative',
  'admin',
  'coach',
  'director',
  'owner',
  'head-coach',
  'assistant-coach',
  'staff',
  'program-director',
]);

export function normalizeTeamIntelRole(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

export function canManageTeamMembershipForRole(role: unknown): boolean {
  return TEAM_INTEL_MANAGER_ROLES.has(normalizeTeamIntelRole(role));
}

export function canGenerateTeamIntelForUser({
  userId,
  legacyMembers = [],
  roster = [],
}: TeamIntelPermissionInput): boolean {
  const hasLegacyPermission = legacyMembers.some((member) => {
    const memberId = member.id ?? member.uid ?? member.userId;
    const role = normalizeTeamIntelRole(member.role);
    return memberId === userId && TEAM_INTEL_MANAGER_ROLES.has(role);
  });

  const hasRosterPermission = roster.some((entry) => {
    const role = normalizeTeamIntelRole(entry.role);
    return entry.userId === userId && TEAM_INTEL_MANAGER_ROLES.has(role);
  });

  return hasLegacyPermission || hasRosterPermission;
}

function extractTeamAdminIds(teamData: Record<string, unknown>): string[] {
  return Array.isArray(teamData['adminIds'])
    ? teamData['adminIds'].filter((value): value is string => typeof value === 'string')
    : [];
}

function extractLegacyMembers(teamData: Record<string, unknown>): TeamIntelPermissionMemberLike[] {
  return Array.isArray(teamData['members'])
    ? teamData['members'].filter(
        (value): value is TeamIntelPermissionMemberLike =>
          typeof value === 'object' && value !== null
      )
    : [];
}

export function canManageTeamMutationWithResolvedRole({
  userId,
  teamData,
  rosterRole,
}: TeamMutationPermissionInput): boolean {
  const adminIds = extractTeamAdminIds(teamData);

  if (
    teamData['ownerId'] === userId ||
    teamData['coachId'] === userId ||
    teamData['createdBy'] === userId ||
    adminIds.includes(userId)
  ) {
    return true;
  }

  return canGenerateTeamIntelForUser({
    userId,
    legacyMembers: extractLegacyMembers(teamData),
    roster:
      rosterRole === undefined
        ? []
        : [
            {
              userId,
              role: typeof rosterRole === 'string' ? rosterRole : null,
            },
          ],
  });
}

export async function canManageTeamMutationForUser(
  db: Firestore,
  userId: string,
  teamId: string,
  teamData: Record<string, unknown>
): Promise<boolean> {
  const rosterService = new RosterEntryService(db);
  const entry = await rosterService.getActiveOrPendingRosterEntry(userId, teamId);

  return canManageTeamMutationWithResolvedRole({
    userId,
    teamData,
    rosterRole: entry?.role,
  });
}
