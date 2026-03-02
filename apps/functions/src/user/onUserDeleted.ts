/**
 * @fileoverview On User Deleted - Cleanup related data
 * @module @nxt1/functions/user/onUserDeleted
 *
 * Firestore trigger for user deletion.
 * - Releases unicode for reuse
 * - Deletes user_analytics
 * - Deletes notification_preferences
 * - Deletes user posts
 */

import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { releaseUnicode } from './generateUnicode';

const db = admin.firestore();

/**
 * On user deleted - cleanup related data
 */
export const onUserDeletedV2 = onDocumentDeleted('users/{userId}', async (event) => {
  const userId = event.params.userId;
  const userData = event.data?.data();

  logger.info('User deleted, cleaning up data', { userId });

  try {
    const batch = db.batch();

    // Release unicode for reuse
    if (userData?.['unicode']) {
      await releaseUnicode(userData['unicode'] as string);
      logger.info('Unicode released', { userId, unicode: userData['unicode'] });
    }

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
