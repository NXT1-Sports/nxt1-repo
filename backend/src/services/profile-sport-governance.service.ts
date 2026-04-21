import type { Firestore } from 'firebase-admin/firestore';
import { forbiddenError } from '@nxt1/core/errors';
import { RosterEntryStatus } from '@nxt1/core/models';
import { createRosterEntryService } from './roster-entry.service.js';
import { logger } from '../utils/logger.js';

function extractGovernedOrganizationAdminIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const userId = (entry as Record<string, unknown>)['userId'];
      return typeof userId === 'string' ? userId.trim() : '';
    })
    .filter((userId): userId is string => userId.length > 0);
}

export async function assertCanMutateOwnSports(db: Firestore, userId: string): Promise<void> {
  const rosterEntryService = createRosterEntryService(db);
  const rosterEntries = await rosterEntryService.getUserTeams({
    userId,
    status: [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING],
  });

  const organizationIds = Array.from(
    new Set(
      rosterEntries
        .map((entry) =>
          typeof entry.organizationId === 'string' ? entry.organizationId.trim() : ''
        )
        .filter((organizationId): organizationId is string => organizationId.length > 0)
    )
  );

  if (organizationIds.length === 0) {
    return;
  }

  const organizationDocs = await Promise.all(
    organizationIds.map((organizationId) =>
      db.collection('Organizations').doc(organizationId).get()
    )
  );

  for (const organizationDoc of organizationDocs) {
    if (!organizationDoc.exists) {
      continue;
    }

    const organizationData = organizationDoc.data() ?? {};
    const ownerId =
      typeof organizationData['ownerId'] === 'string' ? organizationData['ownerId'].trim() : '';
    const billingOwnerUid =
      typeof organizationData['billingOwnerUid'] === 'string'
        ? organizationData['billingOwnerUid'].trim()
        : '';
    const adminIds = extractGovernedOrganizationAdminIds(organizationData['admins']);
    const hasOrganizationAdmins =
      ownerId.length > 0 || billingOwnerUid.length > 0 || adminIds.length > 0;
    const isGovernedOrganization = organizationData['isClaimed'] === true && hasOrganizationAdmins;

    if (!isGovernedOrganization) {
      continue;
    }

    const isOrganizationAdmin =
      ownerId === userId || billingOwnerUid === userId || adminIds.includes(userId);

    if (!isOrganizationAdmin) {
      logger.warn('[Profile] Governed organization blocked sport mutation', {
        userId,
        organizationId: organizationDoc.id,
      });
      throw forbiddenError('admin');
    }
  }
}
