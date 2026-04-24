/**
 * @fileoverview Organization cleanup helpers for account deletion
 * @module @nxt1/functions/user/organizationCleanup
 */

export function extractOrganizationAdminUserIds(admins: unknown): string[] {
  if (!Array.isArray(admins)) {
    return [];
  }

  return admins
    .map((adminValue) => {
      if (!adminValue || typeof adminValue !== 'object') {
        return '';
      }

      const userId = (adminValue as Record<string, unknown>)['userId'];
      return typeof userId === 'string' ? userId.trim() : '';
    })
    .filter((adminUserId): adminUserId is string => adminUserId.length > 0);
}

export interface OrganizationCleanupPlan {
  readonly shouldUpdate: boolean;
  readonly deactivated: boolean;
  readonly nextAdmins?: unknown[];
  readonly nextOwnerId?: string;
  readonly nextCreatedBy?: string;
  readonly clearOwnerId: boolean;
  readonly clearCreatedBy: boolean;
  readonly clearBillingOwnerUid: boolean;
  readonly clearAdminUserIds: boolean;
}

export function buildOrganizationCleanupPlan(
  userId: string,
  data: Record<string, unknown>
): OrganizationCleanupPlan {
  const admins = Array.isArray(data['admins']) ? data['admins'] : [];
  const filteredAdmins = admins.filter((adminValue) => {
    if (!adminValue || typeof adminValue !== 'object') {
      return true;
    }

    return (adminValue as Record<string, unknown>)['userId'] !== userId;
  });

  const ownerMatches = data['ownerId'] === userId;
  const creatorMatches = data['createdBy'] === userId;
  const billingOwnerMatches = data['billingOwnerUid'] === userId;
  const shouldUpdateAdmins = filteredAdmins.length !== admins.length;
  const hasLegacyAdminUserIds = Array.isArray(data['adminUserIds']);

  if (
    !shouldUpdateAdmins &&
    !ownerMatches &&
    !creatorMatches &&
    !billingOwnerMatches &&
    !hasLegacyAdminUserIds
  ) {
    return {
      shouldUpdate: false,
      deactivated: false,
      clearOwnerId: false,
      clearCreatedBy: false,
      clearBillingOwnerUid: false,
      clearAdminUserIds: false,
    };
  }

  const replacementAdmin = filteredAdmins[0] as Record<string, unknown> | undefined;
  const replacementAdminUserId =
    typeof replacementAdmin?.['userId'] === 'string' ? replacementAdmin['userId'] : undefined;
  const nextOwnerId = ownerMatches ? replacementAdminUserId : undefined;
  const nextCreatedBy = creatorMatches ? replacementAdminUserId : undefined;

  return {
    shouldUpdate: true,
    deactivated: ownerMatches && !nextOwnerId,
    nextAdmins: shouldUpdateAdmins ? filteredAdmins : undefined,
    nextOwnerId,
    nextCreatedBy,
    clearOwnerId: ownerMatches && !nextOwnerId,
    clearCreatedBy: creatorMatches && !nextCreatedBy,
    clearBillingOwnerUid: billingOwnerMatches,
    clearAdminUserIds: hasLegacyAdminUserIds,
  };
}
