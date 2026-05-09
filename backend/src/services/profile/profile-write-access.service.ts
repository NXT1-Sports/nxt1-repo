import type { Firestore } from 'firebase-admin/firestore';
import { forbiddenError, notFoundError } from '@nxt1/core/errors';
import {
  isAthleteRole,
  isTeamRole,
  normalizeBaseSportKey,
  normalizeRole,
  type UserRole,
} from '@nxt1/core';
import { RosterEntryStatus, type RosterEntry } from '@nxt1/core/models';
import { createRosterEntryService } from '../team/roster-entry.service.js';
import { logger } from '../../utils/logger.js';

const USERS_COLLECTION = 'Users';

export interface ProfileWriteAccessGrant {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly targetRole: UserRole;
  readonly targetUserData: Record<string, unknown>;
  readonly isSelfWrite: boolean;
  readonly sharedTeamIds: string[];
  readonly sharedOrganizationIds: string[];
  readonly sharedSports: string[];
  readonly sharedMembershipScopes?: ReadonlyArray<{
    teamId: string;
    organizationId?: string;
    sport: string;
  }>;
}

type SharedMembershipScope = NonNullable<ProfileWriteAccessGrant['sharedMembershipScopes']>[number];

export interface AuthorizedTargetSportSelection {
  readonly index: number;
  readonly sportRecord: Record<string, unknown>;
  readonly sportKey: string | null;
  readonly teamId?: string;
  readonly organizationId?: string;
}

interface AssertProfileWriteAccessInput {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly action: string;
  readonly requireDelegatedAthleteTarget?: boolean;
}

function normalizeScopedSportKey(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const normalized = normalizeBaseSportKey(value);
  return normalized.length > 0 ? normalized : null;
}

function getSportSelectionContext(
  sportRecord: Record<string, unknown>,
  index: number
): AuthorizedTargetSportSelection {
  const nestedTeam =
    sportRecord['team'] && typeof sportRecord['team'] === 'object'
      ? (sportRecord['team'] as Record<string, unknown>)
      : undefined;

  return {
    index,
    sportRecord,
    sportKey:
      normalizeScopedSportKey(sportRecord['sport']) ?? normalizeScopedSportKey(sportRecord['id']),
    teamId:
      (typeof nestedTeam?.['teamId'] === 'string' ? nestedTeam['teamId'] : undefined) ??
      (sportRecord['teamId'] as string | undefined),
    organizationId:
      (typeof nestedTeam?.['organizationId'] === 'string'
        ? nestedTeam['organizationId']
        : undefined) ?? (sportRecord['organizationId'] as string | undefined),
  };
}

export function getAuthorizedTargetSportSelections(
  targetUserData: Record<string, unknown>,
  accessGrant: ProfileWriteAccessGrant
): AuthorizedTargetSportSelection[] {
  const sports = Array.isArray(targetUserData['sports'])
    ? (targetUserData['sports'] as Record<string, unknown>[])
    : [];

  const selections = sports.map((sportRecord, index) =>
    getSportSelectionContext(sportRecord, index)
  );

  if (accessGrant.isSelfWrite) {
    return selections;
  }

  if (Array.isArray(accessGrant.sharedMembershipScopes)) {
    return selections.flatMap((selection) => {
      const matchingScope = accessGrant.sharedMembershipScopes?.find((scope) =>
        Boolean(
          selection.teamId &&
          scope.teamId === selection.teamId &&
          scope.sport === selection.sportKey
        )
      );

      return matchingScope
        ? [
            {
              ...selection,
              organizationId: matchingScope.organizationId ?? selection.organizationId,
            },
          ]
        : [];
    });
  }

  return selections.filter((selection) =>
    Boolean(
      ((selection.teamId && accessGrant.sharedTeamIds.includes(selection.teamId)) ||
        (selection.organizationId &&
          accessGrant.sharedOrganizationIds.includes(selection.organizationId))) &&
      selection.sportKey &&
      accessGrant.sharedSports.includes(selection.sportKey)
    )
  );
}

export function resolveAuthorizedTargetSportSelection(
  targetUserData: Record<string, unknown>,
  targetSport: string,
  accessGrant: ProfileWriteAccessGrant
): AuthorizedTargetSportSelection | null {
  const normalizedTargetSport = normalizeScopedSportKey(targetSport);
  if (!normalizedTargetSport) {
    return null;
  }

  return (
    getAuthorizedTargetSportSelections(targetUserData, accessGrant).find(
      (selection) => selection.sportKey === normalizedTargetSport
    ) ?? null
  );
}

export class ProfileWriteAccessService {
  constructor(private readonly db: Firestore) {}

  async assertCanManageAthleteProfileTarget(
    input: AssertProfileWriteAccessInput
  ): Promise<ProfileWriteAccessGrant> {
    const grant = await this.assertCanManageProfileTarget(input);
    if (!isAthleteRole(grant.targetRole)) {
      logger.warn('[ProfileWriteAccess] Athlete-target access denied: target is not athlete', {
        action: input.action,
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        targetRole: grant.targetRole,
      });
      throw forbiddenError('owner');
    }

    return grant;
  }

  async assertCanManageProfileTarget(
    input: AssertProfileWriteAccessInput
  ): Promise<ProfileWriteAccessGrant> {
    const { actorUserId, targetUserId, action, requireDelegatedAthleteTarget = true } = input;

    const targetDoc = await this.db.collection(USERS_COLLECTION).doc(targetUserId).get();
    if (!targetDoc.exists) {
      throw notFoundError('profile');
    }

    const targetUserData = (targetDoc.data() ?? {}) as Record<string, unknown>;
    const targetRole = normalizeRole(
      typeof targetUserData['role'] === 'string' ? targetUserData['role'] : 'athlete'
    );

    if (actorUserId === targetUserId) {
      return {
        actorUserId,
        targetUserId,
        targetRole,
        targetUserData,
        isSelfWrite: true,
        sharedTeamIds: [],
        sharedOrganizationIds: [],
        sharedSports: [],
        sharedMembershipScopes: [],
      };
    }

    if (requireDelegatedAthleteTarget && !isAthleteRole(targetRole)) {
      logger.warn('[ProfileWriteAccess] Delegated access denied: target is not athlete', {
        action,
        actorUserId,
        targetUserId,
        targetRole,
      });
      throw forbiddenError('owner');
    }

    const rosterEntryService = createRosterEntryService(this.db);
    const actorEntries = await rosterEntryService.getUserTeams({
      userId: actorUserId,
      includeInactive: true,
    });

    const activeManagedTeams = actorEntries.filter(
      (entry) => entry.status === RosterEntryStatus.ACTIVE && isTeamRole(entry.role)
    );

    if (activeManagedTeams.length === 0) {
      logger.warn('[ProfileWriteAccess] Delegated access denied: actor manages no active teams', {
        action,
        actorUserId,
        targetUserId,
      });
      throw forbiddenError('owner');
    }

    const targetEntries = await Promise.all(
      activeManagedTeams.map((entry) =>
        rosterEntryService.getActiveOrPendingRosterEntry(targetUserId, entry.teamId)
      )
    );

    const sharedMemberships: Array<{ actorEntry: RosterEntry; targetEntry: RosterEntry }> = [];
    for (let index = 0; index < activeManagedTeams.length; index++) {
      const actorEntry = activeManagedTeams[index];
      const targetEntry = targetEntries[index];
      if (
        targetEntry &&
        targetEntry.status === RosterEntryStatus.ACTIVE &&
        isAthleteRole(targetEntry.role)
      ) {
        sharedMemberships.push({ actorEntry, targetEntry });
      }
    }

    if (sharedMemberships.length === 0) {
      logger.warn('[ProfileWriteAccess] Delegated access denied: no shared athlete roster scope', {
        action,
        actorUserId,
        targetUserId,
        actorTeamIds: activeManagedTeams.map((entry) => entry.teamId),
      });
      throw forbiddenError('owner');
    }

    const sharedTeamIds = Array.from(
      new Set(sharedMemberships.map(({ actorEntry }) => actorEntry.teamId))
    );
    const sharedOrganizationIds = Array.from(
      new Set(
        sharedMemberships
          .map(
            ({ actorEntry, targetEntry }) => actorEntry.organizationId || targetEntry.organizationId
          )
          .filter((organizationId): organizationId is string => Boolean(organizationId))
      )
    );
    const sharedSports = Array.from(
      new Set(
        sharedMemberships
          .map(({ actorEntry, targetEntry }) => {
            const actorSport = normalizeScopedSportKey(actorEntry.sport);
            const targetSport = normalizeScopedSportKey(targetEntry.sport);

            return actorSport && targetSport && actorSport === targetSport ? actorSport : null;
          })
          .filter((sport): sport is string => Boolean(sport))
      )
    );
    const sharedMembershipScopes = sharedMemberships
      .map<SharedMembershipScope | null>(({ actorEntry, targetEntry }) => {
        const actorSport = normalizeScopedSportKey(actorEntry.sport);
        const targetSport = normalizeScopedSportKey(targetEntry.sport);

        if (!actorSport || !targetSport || actorSport !== targetSport) {
          return null;
        }

        const organizationId = actorEntry.organizationId || targetEntry.organizationId;

        return {
          teamId: actorEntry.teamId,
          ...(organizationId ? { organizationId } : {}),
          sport: actorSport,
        };
      })
      .filter((scope): scope is SharedMembershipScope => scope !== null);

    logger.info('[ProfileWriteAccess] Delegated athlete profile access granted', {
      action,
      actorUserId,
      targetUserId,
      sharedTeamIds,
      sharedOrganizationIds,
      sharedSports,
      sharedMembershipScopes,
      targetRole,
    });

    return {
      actorUserId,
      targetUserId,
      targetRole,
      targetUserData,
      isSelfWrite: false,
      sharedTeamIds,
      sharedOrganizationIds,
      sharedSports,
      sharedMembershipScopes,
    };
  }
}

export function createProfileWriteAccessService(db: Firestore): ProfileWriteAccessService {
  return new ProfileWriteAccessService(db);
}
