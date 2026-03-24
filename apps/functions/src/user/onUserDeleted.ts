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

const db = admin.firestore();
const bucket = admin.storage().bucket();

const PRIMARY_USER_COLLECTION = 'Users';
const SHADOW_USER_COLLECTION = 'users';
const BATCH_SIZE = 250;

const SINGLETON_COLLECTIONS = [
  'user_analytics',
  'notification_preferences',
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
  'Interactions',
  'PlayerStats',
  'GameStats',
  'RankingEntries',
  'RosterEntries',
  'PostComments',
  'PostLikes',
  'notifications',
  'usageEvents',
  'paymentLogs',
  'billingContexts',
  'stripeCustomers',
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
    [
      'UserReadingProgress:docPrefix',
      db
        .collection('UserReadingProgress')
        .where(admin.firestore.FieldPath.documentId(), '>=', `${userId}_`)
        .where(admin.firestore.FieldPath.documentId(), '<=', `${userId}_\uf8ff`),
    ],
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

async function cleanupTeams(userId: string): Promise<{ updated: number; deactivated: number }> {
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

    const updateData: Record<string, unknown> = {
      memberIds: nextMemberIds,
      members: nextMembers,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (Array.isArray(data['adminIds'])) {
      updateData['adminIds'] = nextAdminIds;
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

  return { updated, deactivated };
}

async function cleanupOrganizations(
  userId: string
): Promise<{ updated: number; deactivated: number }> {
  // Query for orgs where we can match by scalar field. Firestore does not support
  // array-contains queries on nested object fields (admins[].userId), so we must
  // fetch those docs separately by scanning orgs we are already touching, then
  // additionally check any org where the admins array may contain the user.
  //
  // To avoid a full-collection scan we maintain an `adminUserIds: string[]` parallel
  // scalar array alongside `admins: AdminObject[]` on the Organizations schema —
  // identical to how Teams uses `memberIds: string[]` + `members: MemberObject[]`.
  // The `array-contains` query below relies on that scalar array.
  const [ownedSnapshot, createdSnapshot, adminSnapshot] = await Promise.all([
    db.collection('Organizations').where('ownerId', '==', userId).get(),
    db.collection('Organizations').where('createdBy', '==', userId).get(),
    // adminUserIds is the scalar index array; fall back to empty if not yet populated
    db
      .collection('Organizations')
      .where('adminUserIds', 'array-contains', userId)
      .get()
      .catch(() => null),
  ]);

  const orgDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  ownedSnapshot.docs.forEach((doc) => orgDocs.set(doc.id, doc));
  createdSnapshot.docs.forEach((doc) => orgDocs.set(doc.id, doc));
  adminSnapshot?.docs.forEach((doc) => orgDocs.set(doc.id, doc));

  let updated = 0;
  let deactivated = 0;

  for (const doc of orgDocs.values()) {
    const data = doc.data();
    const admins = Array.isArray(data['admins']) ? data['admins'] : [];
    const filteredAdmins = admins.filter((adminValue) => {
      if (!adminValue || typeof adminValue !== 'object') {
        return true;
      }

      return (adminValue as Record<string, unknown>)['userId'] !== userId;
    });

    const filteredAdminUserIds = Array.isArray(data['adminUserIds'])
      ? (data['adminUserIds'] as string[]).filter((id) => id !== userId)
      : undefined;

    const shouldUpdateAdmins = filteredAdmins.length !== admins.length;
    const ownerMatches = data['ownerId'] === userId;
    const creatorMatches = data['createdBy'] === userId;

    if (!shouldUpdateAdmins && !ownerMatches && !creatorMatches) {
      continue;
    }

    const replacementAdmin = filteredAdmins[0] as Record<string, unknown> | undefined;
    const updateData: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (shouldUpdateAdmins) {
      updateData['admins'] = filteredAdmins;
      if (filteredAdminUserIds !== undefined) {
        updateData['adminUserIds'] = filteredAdminUserIds;
      }
    }

    if (ownerMatches) {
      updateData['ownerId'] =
        typeof replacementAdmin?.['userId'] === 'string' ? replacementAdmin['userId'] : '';

      if (!updateData['ownerId']) {
        updateData['status'] = 'inactive';
        deactivated++;
      }
    }

    if (creatorMatches) {
      updateData['createdBy'] =
        typeof replacementAdmin?.['userId'] === 'string' ? replacementAdmin['userId'] : '';
    }

    await doc.ref.update(updateData);
    updated++;
  }

  return { updated, deactivated };
}

async function deleteUserStorage(userId: string): Promise<void> {
  try {
    await bucket.deleteFiles({ prefix: `users/${userId}/` });
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
  const deletedQueryCollections = await deleteQueryCollections(userId);
  const teamCleanup = await cleanupTeams(userId);
  const organizationCleanup = await cleanupOrganizations(userId);
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
export const onUserDeletedV2 = onDocumentDeleted(
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
