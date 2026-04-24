/**
 * @fileoverview On User Deleted - Cleanup related data
 * @module @nxt1/functions/user/onUserDeleted
 *
 * Firestore trigger for user deletion.
 * - Releases unicode for reuse
 * - Deletes user-owned and user-linked Firestore data
 * - Removes references from teams and organizations
 * - Deletes storage assets under users/{userId}/
 */

import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { releaseUnicode } from './generateUnicode';
import {
  buildOrganizationCleanupPlan,
  extractOrganizationAdminUserIds,
} from './organizationCleanup';

const db = admin.firestore();
const bucket = admin.storage().bucket();

const PRIMARY_USER_COLLECTION = 'Users';
const SHADOW_USER_COLLECTION = 'users';
const BATCH_SIZE = 250;

const SINGLETON_COLLECTIONS = [
  'FcmTokens',
  'Subscriptions',
  'UserEntitlements',
  'UserCampaigns',
  'UserMedia',
  'UserReadingStats',
] as const;

const USER_ID_QUERY_COLLECTIONS = [
  'Posts',
  'Videos',
  'Offers',
  'ScoutReports',
  'PlayerStats',
  'GameStats',
  'RankingEntries',
  // NOTE: RosterEntries intentionally excluded — processed by cleanupTeams()
  // so we can extract team/role data for counter decrements before deletion.
  'PostComments',
  'PostLikes',
  'Notifications',
  'StripeCustomers',
] as const;

async function deleteQueryInBatches(query: FirebaseFirestore.Query): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const snapshot = await query.limit(BATCH_SIZE).get();

    if (snapshot.empty) {
      return totalDeleted;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
  }
}

async function deleteCollectionRecursively(
  collectionRef: FirebaseFirestore.CollectionReference
): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(BATCH_SIZE).get();

    if (snapshot.empty) {
      return totalDeleted;
    }

    for (const doc of snapshot.docs) {
      totalDeleted += await deleteAllSubcollections(doc.ref);
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
  }
}

async function deleteAllSubcollections(
  docRef: FirebaseFirestore.DocumentReference
): Promise<number> {
  const subcollections = await docRef.listCollections();
  if (subcollections.length === 0) return 0;

  const counts = await Promise.all(subcollections.map((sub) => deleteCollectionRecursively(sub)));

  return counts.reduce((sum, n) => sum + n, 0);
}

async function deleteSingletonDocuments(userId: string): Promise<void> {
  const batch = db.batch();

  SINGLETON_COLLECTIONS.forEach((collectionName) => {
    batch.delete(db.collection(collectionName).doc(userId));
  });

  batch.delete(db.collection(SHADOW_USER_COLLECTION).doc(userId));
  await batch.commit();
}

async function deleteQueryCollections(userId: string): Promise<Record<string, number>> {
  const queries: Array<[string, FirebaseFirestore.Query]> = [
    ...USER_ID_QUERY_COLLECTIONS.map(
      (name) =>
        [name, db.collection(name).where('userId', '==', userId)] as [
          string,
          FirebaseFirestore.Query,
        ]
    ),
    ['follows:followerId', db.collection('Follows').where('followerId', '==', userId)],
    ['follows:followingId', db.collection('Follows').where('followingId', '==', userId)],
  ];

  const results = await Promise.all(
    queries.map(([name, query]) =>
      deleteQueryInBatches(query).then((count) => [name, count] as [string, number])
    )
  );

  return Object.fromEntries(results);
}

function filterMemberObjects(value: unknown, userId: string): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((member) => {
    if (!member || typeof member !== 'object') {
      return true;
    }

    const record = member as Record<string, unknown>;
    return record['id'] !== userId && record['userId'] !== userId;
  });
}

async function cleanupTeams(
  userId: string
): Promise<{ updated: number; deactivated: number; rosterEntriesDeleted: number }> {
  // ── Step 1: Query all RosterEntries for this user to determine counter decrements ──
  const rosterSnapshot = await db.collection('RosterEntries').where('userId', '==', userId).get();

  // Aggregate counter decrements per team: { teamId -> { athlete: N, panel: N } }
  const counterDecrements = new Map<string, { athlete: number; panel: number }>();
  for (const rosterDoc of rosterSnapshot.docs) {
    const rd = rosterDoc.data();
    const teamId = rd['teamId'] as string | undefined;
    if (!teamId) continue;

    const role = rd['role'] as string | undefined;
    const current = counterDecrements.get(teamId) ?? { athlete: 0, panel: 0 };

    if (role === 'athlete') {
      current.athlete++;
    } else {
      // coach, director, or any other role -> panelMember
      current.panel++;
    }
    counterDecrements.set(teamId, current);
  }

  // ── Step 2: Collect all Team docs that reference this user ──
  const teamDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

  const [createdBySnapshot, memberIdsSnapshot, adminIdsSnapshot] = await Promise.all([
    db.collection('Teams').where('createdBy', '==', userId).get(),
    db.collection('Teams').where('memberIds', 'array-contains', userId).get(),
    db
      .collection('Teams')
      .where('adminIds', 'array-contains', userId)
      .get()
      .catch(() => null),
  ]);

  createdBySnapshot.docs.forEach((doc) => teamDocs.set(doc.id, doc));
  memberIdsSnapshot.docs.forEach((doc) => teamDocs.set(doc.id, doc));
  adminIdsSnapshot?.docs.forEach((doc) => teamDocs.set(doc.id, doc));

  // Also fetch any teams found in RosterEntries that weren't already captured
  const missingTeamIds = [...counterDecrements.keys()].filter((id) => !teamDocs.has(id));
  if (missingTeamIds.length > 0) {
    // Firestore 'in' queries limited to 30 values per query
    for (let i = 0; i < missingTeamIds.length; i += 30) {
      const chunk = missingTeamIds.slice(i, i + 30);
      const snap = await db
        .collection('Teams')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.docs.forEach((doc) => teamDocs.set(doc.id, doc));
    }
  }

  let updated = 0;
  let deactivated = 0;

  // Firestore batch max is 500 write operations
  const MAX_BATCH_OPS = 500;
  let batch = db.batch();
  let batchOps = 0;

  const flushBatch = async (): Promise<void> => {
    if (batchOps > 0) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  };

  for (const doc of teamDocs.values()) {
    const data = doc.data();
    const nextMemberIds = Array.isArray(data['memberIds'])
      ? (data['memberIds'] as string[]).filter((id) => id !== userId)
      : [];
    const nextAdminIds = Array.isArray(data['adminIds'])
      ? (data['adminIds'] as string[]).filter((id) => id !== userId)
      : [];
    const nextMembers = filterMemberObjects(data['members'], userId);
    const nextAdmins = filterMemberObjects(data['admins'], userId);

    const updateData: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (Array.isArray(data['memberIds'])) {
      updateData['memberIds'] = nextMemberIds;
    }

    if (Array.isArray(data['members'])) {
      updateData['members'] = nextMembers;
    }

    if (Array.isArray(data['adminIds'])) {
      updateData['adminIds'] = nextAdminIds;
    }

    if (Array.isArray(data['admins'])) {
      updateData['admins'] = nextAdmins;
    }

    // Apply counter decrements from RosterEntries
    const decrements = counterDecrements.get(doc.id);
    if (decrements) {
      if (decrements.athlete > 0) {
        updateData['athleteMember'] = admin.firestore.FieldValue.increment(-decrements.athlete);
      }
      if (decrements.panel > 0) {
        updateData['panelMember'] = admin.firestore.FieldValue.increment(-decrements.panel);
      }
    }

    if (data['createdBy'] === userId) {
      const replacementOwner = nextAdminIds[0] ?? nextMemberIds[0] ?? '';
      updateData['createdBy'] = replacementOwner;

      if (!replacementOwner) {
        updateData['isActive'] = false;
        deactivated++;
      }
    }

    if (batchOps >= MAX_BATCH_OPS) {
      await flushBatch();
    }

    batch.update(doc.ref, updateData);
    batchOps++;
    updated++;
  }

  await flushBatch();

  // ── Step 4: Delete all RosterEntries for this user ──
  let rosterEntriesDeleted = 0;
  let rosterBatch = db.batch();
  let rosterBatchOps = 0;

  for (const rosterDoc of rosterSnapshot.docs) {
    if (rosterBatchOps >= MAX_BATCH_OPS) {
      await rosterBatch.commit();
      rosterBatch = db.batch();
      rosterBatchOps = 0;
    }
    rosterBatch.delete(rosterDoc.ref);
    rosterBatchOps++;
    rosterEntriesDeleted++;
  }

  if (rosterBatchOps > 0) {
    await rosterBatch.commit();
  }

  logger.info('Team cleanup detail', {
    userId,
    teamsUpdated: updated,
    teamsDeactivated: deactivated,
    rosterEntriesDeleted,
    counterDecrements: Object.fromEntries([...counterDecrements.entries()].map(([k, v]) => [k, v])),
  });

  return { updated, deactivated, rosterEntriesDeleted };
}

async function cleanupOrganizations(
  userId: string
): Promise<{ updated: number; deactivated: number }> {
  const [ownedSnapshot, createdSnapshot, billingOwnerSnapshot, allOrganizations] =
    await Promise.all([
      db.collection('Organizations').where('ownerId', '==', userId).get(),
      db.collection('Organizations').where('createdBy', '==', userId).get(),
      db.collection('Organizations').where('billingOwnerUid', '==', userId).get(),
      db.collection('Organizations').get(),
    ]);

  const orgDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  ownedSnapshot.docs.forEach((doc) => orgDocs.set(doc.id, doc));
  createdSnapshot.docs.forEach((doc) => orgDocs.set(doc.id, doc));
  billingOwnerSnapshot.docs.forEach((doc) => orgDocs.set(doc.id, doc));
  allOrganizations.docs
    .filter((doc) => extractOrganizationAdminUserIds(doc.data()['admins']).includes(userId))
    .forEach((doc) => orgDocs.set(doc.id, doc));

  let updated = 0;
  let deactivated = 0;

  for (const doc of orgDocs.values()) {
    const data = doc.data();
    const cleanupPlan = buildOrganizationCleanupPlan(userId, data);

    if (!cleanupPlan.shouldUpdate) {
      continue;
    }

    const updateData: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (cleanupPlan.nextAdmins) {
      updateData['admins'] = cleanupPlan.nextAdmins;
    }

    if (cleanupPlan.clearAdminUserIds) {
      updateData['adminUserIds'] = admin.firestore.FieldValue.delete();
    }

    if (cleanupPlan.nextOwnerId !== undefined) {
      updateData['ownerId'] = cleanupPlan.nextOwnerId;

      if (cleanupPlan.deactivated) {
        updateData['status'] = 'inactive';
        deactivated++;
      }
    } else if (cleanupPlan.clearOwnerId) {
      updateData['ownerId'] = admin.firestore.FieldValue.delete();

      if (cleanupPlan.deactivated) {
        updateData['status'] = 'inactive';
        deactivated++;
      }
    }

    if (cleanupPlan.nextCreatedBy !== undefined) {
      updateData['createdBy'] = cleanupPlan.nextCreatedBy;
    } else if (cleanupPlan.clearCreatedBy) {
      updateData['createdBy'] = admin.firestore.FieldValue.delete();
    }

    if (cleanupPlan.clearBillingOwnerUid) {
      updateData['billingOwnerUid'] = admin.firestore.FieldValue.delete();
    }

    await doc.ref.update(updateData);
    updated++;
  }

  return { updated, deactivated };
}

async function deleteUserStorage(userId: string): Promise<void> {
  try {
    await bucket.deleteFiles({ prefix: `Users/${userId}/` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('No such object')) {
      return;
    }

    throw error;
  }
}

async function runUserDeletionCleanup(
  userId: string,
  userData: FirebaseFirestore.DocumentData | undefined
): Promise<void> {
  if (userData?.['unicode']) {
    await releaseUnicode(userData['unicode'] as string);
    logger.info('Unicode released', { userId, unicode: userData['unicode'] });
  }

  const primaryUserRef = db.collection(PRIMARY_USER_COLLECTION).doc(userId);
  const shadowUserRef = db.collection(SHADOW_USER_COLLECTION).doc(userId);

  const deletedPrimarySubcollections = await deleteAllSubcollections(primaryUserRef);
  const deletedShadowSubcollections = await deleteAllSubcollections(shadowUserRef);

  await deleteSingletonDocuments(userId);

  // cleanupTeams MUST run before deleteQueryCollections because it reads
  // RosterEntries to derive counter decrements before deleting them.
  const teamCleanup = await cleanupTeams(userId);
  const organizationCleanup = await cleanupOrganizations(userId);
  const deletedQueryCollections = await deleteQueryCollections(userId);
  await deleteUserStorage(userId);

  logger.info('User cleanup complete', {
    userId,
    deletedPrimarySubcollections,
    deletedShadowSubcollections,
    deletedQueryCollections,
    teamCleanup,
    organizationCleanup,
  });
}

/**
 * On user deleted - cleanup related data.
 * Triggered from the primary Users collection used by the account deletion API.
 */
export const onUserDeletedV3 = onDocumentDeleted(
  {
    document: 'Users/{userId}',
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    const userId = event.params.userId;
    const userData = event.data?.data();

    logger.info('User deleted, cleaning up data', {
      userId,
      triggerCollection: PRIMARY_USER_COLLECTION,
    });

    try {
      await runUserDeletionCleanup(userId, userData);
    } catch (error) {
      logger.error('Error cleaning up user data', {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
);
