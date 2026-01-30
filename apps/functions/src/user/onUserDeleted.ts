/**
 * @fileoverview On User Deleted - Cleanup related data
 * @module @nxt1/functions/user/onUserDeleted
 *
 * Firestore trigger for user deletion.
 * - Deletes user_analytics
 * - Deletes notification_preferences
 * - Deletes user posts
 */

import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();

/**
 * On user deleted - cleanup related data
 */
export const onUserDeletedV2 = onDocumentDeleted('users/{userId}', async (event) => {
  const userId = event.params.userId;

  logger.info('User deleted, cleaning up data', { userId });

  try {
    const batch = db.batch();

    batch.delete(db.collection('user_analytics').doc(userId));
    batch.delete(db.collection('notification_preferences').doc(userId));

    const posts = await db.collection('posts').where('userId', '==', userId).limit(500).get();

    posts.docs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();

    logger.info('User cleanup complete', { userId, postsDeleted: posts.size });
  } catch (error) {
    logger.error('Error cleaning up user data', { userId, error });
  }
});
