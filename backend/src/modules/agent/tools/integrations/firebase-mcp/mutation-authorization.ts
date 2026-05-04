import type { Firestore } from 'firebase-admin/firestore';

import { canManageTeamMutationWithResolvedRole } from '../../../../../services/team/team-intel-permissions.js';

function extractOrganizationAdminIds(admins: unknown): string[] {
  if (!Array.isArray(admins)) {
    return [];
  }

  return Array.from(
    new Set(
      admins
        .map((admin) =>
          typeof admin === 'object' && admin !== null && 'userId' in admin
            ? (admin['userId'] as string | undefined)
            : undefined
        )
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
    )
  );
}

export async function canManageOrganizationMutation(
  firestore: Firestore,
  userId: string,
  organizationId: string,
  organizationData: Record<string, unknown>
): Promise<boolean> {
  if (organizationData['ownerId'] === userId) {
    return true;
  }

  if (extractOrganizationAdminIds(organizationData['admins']).includes(userId)) {
    return true;
  }

  const teamSnapshot = await firestore
    .collection('Teams')
    .where('organizationId', '==', organizationId)
    .get();

  return teamSnapshot.docs.some((teamDoc) =>
    canManageTeamMutationWithResolvedRole({
      userId,
      teamData: teamDoc.data() as Record<string, unknown>,
      rosterRole: undefined,
    })
  );
}
