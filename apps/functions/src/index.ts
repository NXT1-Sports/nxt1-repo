/**
 * @fileoverview Firebase Cloud Functions Entry Point
 * @module @nxt1/functions
 *
 * Cloud Functions for NXT1 platform - triggers, scheduled tasks, and webhooks.
 * Uses shared @nxt1/core types for type safety across the platform.
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

// Import shared types from @nxt1/core
import type { UserV2, NotificationPayload, TeamV2 } from '@nxt1/core';
import { NOTIFICATION_TYPES, USER_ROLES } from '@nxt1/core';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

// Set default options for all functions
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
});

// ============================================================================
// USER TRIGGERS
// ============================================================================

/**
 * Handle new user creation
 * - Initialize user document with default values
 * - Send welcome notification
 */
export const onUserCreated = onDocumentCreated('Users/{userId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const userId = event.params.userId;
  const userData = snapshot.data() as Partial<UserV2>;

  console.log(`[onUserCreated] Processing new user: ${userId}`);

  try {
    // Ensure default fields are set
    const defaults = {
      credits: 0,
      featureCredits: 0,
      isPremium: false,
      isVerified: false,
      settings: {
        notifications: {
          email: true,
          push: true,
          sms: false,
        },
        privacy: {
          profileVisibility: 'public',
          showStats: true,
          showOffers: true,
        },
      },
    };

    await snapshot.ref.update({
      ...defaults,
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Send welcome notification
    const welcomeNotification: NotificationPayload = {
      userId,
      type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
      title: 'Welcome to NXT1!',
      body: 'Start building your athletic profile and connect with recruiters.',
      data: {
        action: 'complete_profile',
      },
    };

    await db.collection('Notifications').add({
      ...welcomeNotification,
      read: false,
      createdAt: new Date().toISOString(),
    });

    console.log(`[onUserCreated] User ${userId} initialized successfully`);
  } catch (error) {
    console.error(`[onUserCreated] Error processing user ${userId}:`, error);
  }
});

/**
 * Handle user profile updates
 * - Update search index
 * - Sync relevant data to denormalized locations
 */
export const onUserUpdated = onDocumentUpdated('Users/{userId}', async (event) => {
  const beforeData = event.data?.before.data() as Partial<UserV2> | undefined;
  const afterData = event.data?.after.data() as Partial<UserV2> | undefined;

  if (!beforeData || !afterData) return;

  const userId = event.params.userId;

  // Check if profile picture changed
  if (beforeData.photoURL !== afterData.photoURL) {
    console.log(`[onUserUpdated] Syncing profile picture for user ${userId}`);

    // Update all posts by this user
    const postsSnapshot = await db.collection('Posts').where('userId', '==', userId).get();
    const batch = db.batch();

    postsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { userPhotoURL: afterData.photoURL });
    });

    await batch.commit();
  }

  // Check if name changed
  if (beforeData.displayName !== afterData.displayName) {
    console.log(`[onUserUpdated] Syncing display name for user ${userId}`);

    const postsSnapshot = await db.collection('Posts').where('userId', '==', userId).get();
    const batch = db.batch();

    postsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { userName: afterData.displayName });
    });

    await batch.commit();
  }
});

// ============================================================================
// POST TRIGGERS
// ============================================================================

/**
 * Handle new post creation
 * - Send notifications to followers
 * - Update user post count
 */
export const onPostCreated = onDocumentCreated('Posts/{postId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const postId = event.params.postId;
  const postData = snapshot.data();
  const userId = postData.userId;

  console.log(`[onPostCreated] Processing new post: ${postId}`);

  try {
    // Get followers to notify
    const followersSnapshot = await db
      .collection('Followers')
      .where('followingId', '==', userId)
      .limit(100)
      .get();

    // Create notifications in batch
    const batch = db.batch();

    for (const followerDoc of followersSnapshot.docs) {
      const followerId = followerDoc.data().followerId;
      const notificationRef = db.collection('Notifications').doc();

      batch.set(notificationRef, {
        userId: followerId,
        type: NOTIFICATION_TYPES.NEW_POST,
        title: 'New Post',
        body: `${postData.userName || 'Someone you follow'} shared a new post`,
        data: {
          postId,
          userId,
        },
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    await batch.commit();

    // Update user's post count
    await db.collection('Users').doc(userId).update({
      postCount: admin.firestore.FieldValue.increment(1),
    });

    console.log(`[onPostCreated] Notified ${followersSnapshot.size} followers`);
  } catch (error) {
    console.error(`[onPostCreated] Error processing post ${postId}:`, error);
  }
});

/**
 * Handle post deletion
 * - Update user post count
 * - Clean up related data
 */
export const onPostDeleted = onDocumentDeleted('Posts/{postId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const postId = event.params.postId;
  const postData = snapshot.data();
  const userId = postData.userId;

  console.log(`[onPostDeleted] Cleaning up post: ${postId}`);

  try {
    // Update user's post count
    await db.collection('Users').doc(userId).update({
      postCount: admin.firestore.FieldValue.increment(-1),
    });

    // Delete associated likes
    const likesSnapshot = await db.collection('PostLikes').where('postId', '==', postId).get();
    const batch = db.batch();
    likesSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    // Delete associated comments
    const commentsSnapshot = await db.collection('Comments').where('postId', '==', postId).get();
    const commentBatch = db.batch();
    commentsSnapshot.docs.forEach((doc) => commentBatch.delete(doc.ref));
    await commentBatch.commit();

    console.log(`[onPostDeleted] Cleaned up post ${postId}`);
  } catch (error) {
    console.error(`[onPostDeleted] Error cleaning up post ${postId}:`, error);
  }
});

// ============================================================================
// TEAM TRIGGERS
// ============================================================================

/**
 * Handle team member added
 * - Update team member count
 * - Add to TeamCodes members array
 */
export const onTeamMemberCreated = onDocumentCreated('TeamMembers/{memberId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const memberData = snapshot.data();
  const teamId = memberData.teamId;
  const userId = memberData.userId;

  console.log(`[onTeamMemberCreated] Adding member ${userId} to team ${teamId}`);

  try {
    // Update team member count
    await db.collection('Teams').doc(teamId).update({
      memberCount: admin.firestore.FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    });

    // Add to TeamCodes members array
    const teamCodeSnapshot = await db
      .collection('TeamCodes')
      .where('teamId', '==', teamId)
      .limit(1)
      .get();

    if (!teamCodeSnapshot.empty) {
      await teamCodeSnapshot.docs[0].ref.update({
        members: admin.firestore.FieldValue.arrayUnion(userId),
      });
    }
  } catch (error) {
    console.error(`[onTeamMemberCreated] Error:`, error);
  }
});

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Daily cleanup of expired notifications
 * Runs at 3 AM UTC
 */
export const cleanupNotifications = onSchedule('0 3 * * *', async () => {
  console.log('[cleanupNotifications] Starting daily notification cleanup');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    // Delete read notifications older than 30 days
    const oldNotifications = await db
      .collection('Notifications')
      .where('read', '==', true)
      .where('createdAt', '<', thirtyDaysAgo.toISOString())
      .limit(500)
      .get();

    const batch = db.batch();
    oldNotifications.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    console.log(`[cleanupNotifications] Deleted ${oldNotifications.size} old notifications`);
  } catch (error) {
    console.error('[cleanupNotifications] Error:', error);
  }
});

/**
 * Daily subscription status check
 * Runs at 6 AM UTC
 */
export const checkSubscriptions = onSchedule('0 6 * * *', async () => {
  console.log('[checkSubscriptions] Checking subscription statuses');

  const now = new Date().toISOString();

  try {
    // Find expired subscriptions
    const expiredSnapshot = await db
      .collection('Users')
      .where('isPremium', '==', true)
      .where('subscriptionExpiresAt', '<', now)
      .where('subscriptionWillRenew', '==', false)
      .get();

    const batch = db.batch();

    for (const doc of expiredSnapshot.docs) {
      batch.update(doc.ref, {
        isPremium: false,
        subscriptionTier: 'free',
        updatedAt: now,
      });

      // Create notification about expired subscription
      const notificationRef = db.collection('Notifications').doc();
      batch.set(notificationRef, {
        userId: doc.id,
        type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
        title: 'Subscription Expired',
        body: 'Your premium subscription has expired. Renew to keep your premium features.',
        data: {
          action: 'renew_subscription',
        },
        read: false,
        createdAt: now,
      });
    }

    await batch.commit();

    console.log(`[checkSubscriptions] Processed ${expiredSnapshot.size} expired subscriptions`);
  } catch (error) {
    console.error('[checkSubscriptions] Error:', error);
  }
});

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Send push notification to user
 */
export const sendPushNotification = onCall(async (request) => {
  const { userId, title, body, data } = request.data;

  if (!userId || !title || !body) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Get user's FCM tokens
    const userDoc = await db.collection('Users').doc(userId).get();
    const fcmTokens = userDoc.data()?.fcmTokens || [];

    if (fcmTokens.length === 0) {
      return { success: false, message: 'No FCM tokens found' };
    }

    // Send to all user devices
    const response = await admin.messaging().sendEachForMulticast({
      tokens: fcmTokens,
      notification: {
        title,
        body,
      },
      data: data || {},
    });

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error('[sendPushNotification] Error:', error);
    throw new HttpsError('internal', 'Failed to send notification');
  }
});

/**
 * Generate user profile slug
 */
export const generateProfileSlug = onCall(async (request) => {
  const { firstName, lastName } = request.data;

  if (!firstName || !lastName) {
    throw new HttpsError('invalid-argument', 'First and last name required');
  }

  const baseSlug = `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');

  // Check for uniqueness
  let slug = baseSlug;
  let counter = 0;

  while (true) {
    const existing = await db
      .collection('Users')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (existing.empty) {
      break;
    }

    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  return { slug };
});
