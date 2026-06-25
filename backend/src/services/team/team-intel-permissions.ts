import type { Firestore } from 'firebase-admin/firestore';
import type { TeamFileFolderDoc } from '@nxt1/core';

import { RosterEntryService } from './roster-entry.service.js';

type AgentFileAcl = NonNullable<TeamFileFolderDoc['acl']>;

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

const ACL_KEY_PREFIX = {
  user: 'u:',
  team: 't:',
  teamManager: 'tm:',
  organization: 'o:',
  organizationManager: 'om:',
} as const;

export interface TeamScopedAccessContext {
  readonly readKeys: readonly string[];
  readonly manageKeys: readonly string[];
  readonly organizationId: string | null;
}

export function buildAclUserKey(userId: string): string {
  return `${ACL_KEY_PREFIX.user}${userId}`;
}

export function buildAclTeamKey(teamId: string): string {
  return `${ACL_KEY_PREFIX.team}${teamId}`;
}

export function buildAclTeamManagerKey(teamId: string): string {
  return `${ACL_KEY_PREFIX.teamManager}${teamId}`;
}

export function buildAclOrganizationKey(organizationId: string): string {
  return `${ACL_KEY_PREFIX.organization}${organizationId}`;
}

export function buildAclOrganizationManagerKey(organizationId: string): string {
  return `${ACL_KEY_PREFIX.organizationManager}${organizationId}`;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueKeys(keys: readonly string[]): readonly string[] {
  return [...new Set(keys.filter((key) => key.trim().length > 0))];
}

export function hasAnyAclKey(
  grantedKeys: readonly string[] | undefined,
  candidateKeys: readonly string[]
): boolean {
  if (!Array.isArray(grantedKeys) || grantedKeys.length === 0 || candidateKeys.length === 0) {
    return false;
  }

  const grantedSet = new Set(grantedKeys);
  return candidateKeys.some((key) => grantedSet.has(key));
}

export function canReadTeamScopedResourceWithAcl(
  acl: AgentFileAcl | null | undefined,
  access: TeamScopedAccessContext
): boolean {
  return !!acl && hasAnyAclKey(acl.readKeys, access.readKeys);
}

export function canManageTeamScopedResourceWithAcl(
  acl: AgentFileAcl | null | undefined,
  access: TeamScopedAccessContext
): boolean {
  return !!acl && hasAnyAclKey(acl.manageKeys, access.manageKeys);
}

export function buildDefaultTeamScopedAcl(params: {
  readonly teamId: string;
  readonly ownerUserId: string;
  readonly grantedByUserId?: string;
  readonly organizationId?: string | null;
  readonly sourceFolderId?: string;
  readonly mode?: AgentFileAcl['mode'];
  readonly grantedAt?: string;
}): AgentFileAcl {
  const grantedAt = params.grantedAt ?? new Date().toISOString();
  const grants = [
    {
      principalType: 'user',
      principalId: params.ownerUserId,
      role: 'owner',
      grantedByUserId: params.grantedByUserId ?? params.ownerUserId,
      grantedAt,
    },
    {
      principalType: 'team',
      principalId: params.teamId,
      role: 'viewer',
      grantedByUserId: params.grantedByUserId ?? params.ownerUserId,
      grantedAt,
    },
  ] as const;

  const readKeys = [buildAclUserKey(params.ownerUserId), buildAclTeamKey(params.teamId)];
  const manageKeys = [buildAclUserKey(params.ownerUserId), buildAclTeamManagerKey(params.teamId)];
  const organizationId = normalizeOptionalString(params.organizationId);

  if (organizationId) {
    manageKeys.push(buildAclOrganizationManagerKey(organizationId));
  }

  return {
    version: 1,
    mode: params.mode ?? 'explicit',
    ...(params.sourceFolderId ? { sourceFolderId: params.sourceFolderId } : {}),
    grants,
    readKeys: uniqueKeys(readKeys),
    manageKeys: uniqueKeys(manageKeys),
  };
}

export function copyAgentFileAclFromFolder(
  acl: AgentFileAcl,
  sourceFolderId: string
): AgentFileAcl {
  return {
    ...acl,
    mode: 'copied_from_folder',
    sourceFolderId,
    grants: [...acl.grants],
    readKeys: [...acl.readKeys],
    manageKeys: [...acl.manageKeys],
  };
}

export async function resolveTeamScopedAccessContext(
  db: Firestore,
  userId: string,
  teamId: string,
  teamData: Record<string, unknown>
): Promise<TeamScopedAccessContext> {
  const rosterService = new RosterEntryService(db);
  const entry = await rosterService.getActiveOrPendingRosterEntry(userId, teamId);
  const canManage = canManageTeamMutationWithResolvedRole({
    userId,
    teamData,
    rosterRole: entry?.role,
  });
  const organizationId =
    normalizeOptionalString(entry?.organizationId) ??
    normalizeOptionalString(teamData['organizationId']);
  const readKeys = [buildAclUserKey(userId)];
  const manageKeys = [buildAclUserKey(userId)];

  if (entry !== null) {
    readKeys.push(buildAclTeamKey(teamId));
  }

  if (canManage) {
    readKeys.push(buildAclTeamManagerKey(teamId));
    manageKeys.push(buildAclTeamManagerKey(teamId));
  }

  if (organizationId) {
    readKeys.push(buildAclOrganizationKey(organizationId));
    if (canManage) {
      readKeys.push(buildAclOrganizationManagerKey(organizationId));
      manageKeys.push(buildAclOrganizationManagerKey(organizationId));
    }
  }

  return {
    readKeys: uniqueKeys(readKeys),
    manageKeys: uniqueKeys(manageKeys),
    organizationId,
  };
}

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

/**
 * Read permission for team-scoped intel surfaces (e.g., Film Review list/detail).
 *
 * Rules:
 * - Managers/admins/coaches always allowed.
 * - Any user with active/pending roster membership on the team is allowed read access.
 */
export async function canReadTeamIntelForUser(
  db: Firestore,
  userId: string,
  teamId: string,
  teamData: Record<string, unknown>
): Promise<boolean> {
  if (
    teamData['ownerId'] === userId ||
    teamData['coachId'] === userId ||
    teamData['createdBy'] === userId ||
    extractTeamAdminIds(teamData).includes(userId)
  ) {
    return true;
  }

  const rosterService = new RosterEntryService(db);
  const entry = await rosterService.getActiveOrPendingRosterEntry(userId, teamId);
  return entry !== null;
}
