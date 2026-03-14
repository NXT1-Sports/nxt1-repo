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
    // Release unicode for reuse
    if (userData?.['unicode']) {
      await releaseUnicode(userData['unicode'] as string);
      logger.info('Unicode released', { userId, unicode: userData['unicode'] });
    }

    // Delete user_analytics and notification_preferences
    const batch = db.batch();
    batch.delete(db.collection('user_analytics').doc(userId));
    batch.delete(db.collection('notification_preferences').doc(userId));
    batch.delete(db.collection('FcmTokens').doc(userId));
    await batch.commit();

    // Delete all posts in batches (handle > 500 posts)
    let deletedPostsCount = 0;
    let hasMorePosts = true;

    while (hasMorePosts) {
      const postsSnap = await db.collection('Posts').where('userId', '==', userId).limit(500).get();

      if (postsSnap.empty) {
        hasMorePosts = false;
        break;
      }

      const postsBatch = db.batch();
      postsSnap.docs.forEach((doc) => postsBatch.delete(doc.ref));
      await postsBatch.commit();

      deletedPostsCount += postsSnap.size;
      hasMorePosts = postsSnap.size === 500; // Continue if we hit the limit
    }

    logger.info('User cleanup complete', { userId, postsDeleted: deletedPostsCount });
  } catch (error) {
    logger.error('Error cleaning up user data', { userId, error });
  }
});
