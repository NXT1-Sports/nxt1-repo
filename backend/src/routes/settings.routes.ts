/**
 * @fileoverview Settings Routes
 * @module @nxt1/backend/routes/settings
 *
 * Document-based settings feature routes.
 * Matches SETTINGS_API_ENDPOINTS from @nxt1/core/settings/constants.
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { appGuard } from '../middleware/auth.middleware.js';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { notFoundError, validationError } from '@nxt1/core/errors';
import { getCacheService } from '../services/cache.service.js';
import { logger } from '../utils/logger.js';
import type { UserPreferences, NotificationPreferences } from '@nxt1/core';
import { auth as prodAuth } from '../utils/firebase.js';
import { cancelActiveSubscriptionsForUser } from '../modules/billing/index.js';
import { invalidateProfileCaches } from './profile.routes.js';

const router: ExpressRouter = Router();

// ============================================
// CONSTANTS
// ============================================

const USERS_COLLECTION = 'Users';
const PREFS_CACHE_TTL = 300; // 5 min
const buildPrefsCacheKey = (uid: string) => `user:prefs:${uid}`;

// ============================================
// DEFAULT PREFERENCES
// ============================================

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  push: true,
  email: true,
  sms: false,
  marketing: false,
};

const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: DEFAULT_NOTIFICATION_PREFS,
  activityTracking: true,
  analyticsTracking: true,
  biometricLogin: false,
  dismissedPrompts: [],
  defaultSportIndex: 0,
};

/**
 * Get user preferences
 * GET /api/v1/settings/preferences
 */
router.get(
  '/preferences',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.uid;
    const cacheKey = buildPrefsCacheKey(userId);
    const cache = getCacheService();

    // Cache hit
    const cached = await cache.get<UserPreferences>(cacheKey);
    if (cached) {
      logger.debug('[Settings] preferences cache hit', { userId });
      res.json({ success: true, data: cached });
      return;
    }

    const db = req.firebase!.db;
    const doc = await db.collection(USERS_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      sendError(res, notFoundError('user'));
      return;
    }

    const data = doc.data() ?? {};
    const rawPrefs = data['preferences'] as Partial<UserPreferences> | undefined;

    // Merge stored prefs with defaults (so new fields are always present)
    const preferences: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      ...rawPrefs,
      notifications: {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(rawPrefs?.notifications ?? {}),
      },
    };

    await cache.set(cacheKey, preferences, { ttl: PREFS_CACHE_TTL });
    logger.debug('[Settings] preferences fetched', { userId });

    res.json({ success: true, data: preferences });
  })
);

/**
 * Update preference (single key)
 * PATCH /api/v1/settings/preferences/:key
 */
router.patch(
  '/preferences/:key',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.uid;
    const { key } = req.params as { key: string };
    const { value } = req.body as { value: unknown };

    // Allowlist of top-level preference keys
    const ALLOWED_KEYS: Array<keyof UserPreferences> = [
      'notifications',
      'activityTracking',
      'analyticsTracking',
      'biometricLogin',
      'dismissedPrompts',
      'defaultSportIndex',
      'theme',
      'language',
    ];

    if (!ALLOWED_KEYS.includes(key as keyof UserPreferences)) {
      sendError(
        res,
        validationError([
          { field: 'key', message: `Unknown preference key: ${key}`, rule: 'invalid' },
        ])
      );
      return;
    }

    if (value === undefined) {
      sendError(
        res,
        validationError([{ field: 'value', message: 'value is required', rule: 'required' }])
      );
      return;
    }

    const db = req.firebase!.db;
    const docRef = db.collection(USERS_COLLECTION).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      sendError(res, notFoundError('user'));
      return;
    }

    const data = doc.data() ?? {};
    const rawPrefs = (data['preferences'] as Partial<UserPreferences>) ?? {};

    // For notifications, merge nested object rather than replace
    const mergedValue =
      key === 'notifications' && typeof value === 'object' && value !== null
        ? { ...DEFAULT_NOTIFICATION_PREFS, ...(rawPrefs.notifications ?? {}), ...(value as object) }
        : value;

    await docRef.update({
      [`preferences.${key}`]: mergedValue,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Build updated preferences for response
    const updatedPrefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      ...rawPrefs,
      notifications: {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(rawPrefs.notifications ?? {}),
      },
      [key]: mergedValue,
    };

    // Invalidate cache
    await getCacheService().del(buildPrefsCacheKey(userId));

    logger.info('[Settings] preference updated', { userId, key });
    res.json({ success: true, data: updatedPrefs });
  })
);

/**
 * Update preferences (bulk)
 * PATCH /api/v1/settings/preferences
 */
router.patch(
  '/preferences',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.uid;
    const body = req.body as Partial<UserPreferences>;

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      sendError(
        res,
        validationError([
          { field: 'body', message: 'Request body must be a non-empty object', rule: 'required' },
        ])
      );
      return;
    }

    const ALLOWED_KEYS: Array<keyof UserPreferences> = [
      'notifications',
      'activityTracking',
      'analyticsTracking',
      'biometricLogin',
      'dismissedPrompts',
      'defaultSportIndex',
      'theme',
      'language',
    ];

    const invalidKeys = Object.keys(body).filter(
      (k) => !ALLOWED_KEYS.includes(k as keyof UserPreferences)
    );
    if (invalidKeys.length > 0) {
      sendError(
        res,
        validationError([
          {
            field: 'body',
            message: `Unknown preference keys: ${invalidKeys.join(', ')}`,
            rule: 'invalid',
          },
        ])
      );
      return;
    }

    const db = req.firebase!.db;
    const docRef = db.collection(USERS_COLLECTION).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      sendError(res, notFoundError('user'));
      return;
    }

    const data = doc.data() ?? {};
    const rawPrefs = (data['preferences'] as Partial<UserPreferences>) ?? {};

    // Build flat Firestore update (dot-notation per key)
    const firestoreUpdate: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    const mergedPrefs: Partial<UserPreferences> = { ...rawPrefs };

    for (const key of Object.keys(body) as Array<keyof UserPreferences>) {
      const val = body[key];
      if (key === 'notifications' && typeof val === 'object' && val !== null) {
        const merged = {
          ...DEFAULT_NOTIFICATION_PREFS,
          ...(rawPrefs.notifications ?? {}),
          ...(val as object),
        };
        firestoreUpdate[`preferences.notifications`] = merged;
        (mergedPrefs as Record<string, unknown>)['notifications'] = merged;
      } else {
        firestoreUpdate[`preferences.${key}`] = val;
        (mergedPrefs as Record<string, unknown>)[key] = val;
      }
    }

    await docRef.update(firestoreUpdate);

    const updatedPrefs: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      ...mergedPrefs,
      notifications: {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(mergedPrefs.notifications ?? {}),
      },
    };

    // Invalidate cache
    await getCacheService().del(buildPrefsCacheKey(userId));

    logger.info('[Settings] preferences bulk updated', { userId, keys: Object.keys(body) });
    res.json({ success: true, data: updatedPrefs });
  })
);

/**
 * Get subscription info
 * GET /api/v1/settings/subscription
 */
router.get('/subscription', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get usage stats
 * GET /api/v1/settings/usage
 */
router.get('/usage', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get connected providers
 * GET /api/v1/settings/providers
 */
router.get('/providers', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Connect provider
 * POST /api/v1/settings/connect-provider
 * Body: { providerId: string, authCode?: string }
 */
router.post('/connect-provider', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Disconnect provider
 * POST /api/v1/settings/disconnect-provider
 * Body: { providerId: string }
 */
router.post('/disconnect-provider', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Send password reset email
 * POST /api/v1/settings/password
 *
 * Generates a Firebase password-reset link and sends it to the user's
 * registered email address via the Admin SDK. No request body required —
 * the email is read from the authenticated user record.
 */
router.post(
  '/password',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.uid;
    const firebaseAuth = req.firebase?.auth ?? prodAuth;

    // Fetch the user record to get the verified email
    const userRecord = await firebaseAuth.getUser(userId);
    const email = userRecord.email;

    if (!email) {
      sendError(
        res,
        validationError([{ field: 'email', message: 'No email address on file', rule: 'required' }])
      );
      return;
    }

    // Generate reset link and send via Firebase Auth email action
    const link = await firebaseAuth.generatePasswordResetLink(email);
    logger.info('[Settings] Password reset link generated', { userId });

    // Use the link as a direct delivery: send the pre-built link to the client
    // so the caller can open it or we can dispatch it via our own email service.
    // For now we return it in the response — the web client calls
    // Firebase client-side sendPasswordResetEmail which is simpler, so this
    // endpoint is an alternative for integrations that need server-side dispatch.
    res.json({ success: true, data: { email, link } });
  })
);

/**
 * Delete account
 * DELETE /api/v1/settings/account
 *
 * Permanently deletes all user data from Firestore and the Firebase Auth account.
 * The client must have re-authenticated recently before calling this endpoint.
 */
router.delete(
  '/account',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.uid;
    const db = req.firebase!.db;
    const firebaseAuth = req.firebase?.auth ?? prodAuth;

    logger.info('[Settings] Account deletion requested', { userId });

    const userRef = db.collection(USERS_COLLECTION).doc(userId);

    try {
      // Fetch user data before deletion so we have identifiers for cache invalidation
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? userSnap.data() : undefined;
      const username = userData?.['username'] as string | undefined;
      const unicode = userData?.['unicode'] as string | null | undefined;

      for (const environment of ['staging', 'production'] as const) {
        try {
          await cancelActiveSubscriptionsForUser(db, userId, environment);
        } catch (billingError) {
          logger.warn('[Settings] Could not cancel Stripe subscriptions', {
            userId,
            environment,
            error: billingError instanceof Error ? billingError.message : String(billingError),
          });
        }
      }

      // Delete all user files from Firebase Storage (avatars, cover photos, thumbs, etc.)
      try {
        const bucket = req.firebase!.storage.bucket();
        const [files] = await bucket.getFiles({ prefix: `users/${userId}/` });
        if (files.length > 0) {
          await Promise.all(files.map((f) => f.delete()));
          logger.debug('[Settings] User storage files deleted', { userId, count: files.length });
        }
      } catch (storageError) {
        logger.warn('[Settings] Could not delete user storage files', {
          userId,
          error: storageError instanceof Error ? storageError.message : String(storageError),
        });
      }

      // Invalidate all user-related caches
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(buildPrefsCacheKey(userId)),
          invalidateProfileCaches(userId, username, unicode),
          cache.del(`profile:sub:followers:${userId}`),
          cache.del(`profile:sub:following:${userId}`),
          cache.delByPrefix(`profile:sub:timeline:v2:${userId}:`),
          cache.delByPrefix(`profile:sub:stats:${userId}:`),
          cache.delByPrefix(`profile:sub:gamelogs:${userId}:`),
          cache.delByPrefix(`profile:sub:metrics:${userId}:`),
          cache.delByPrefix(`profile:sub:news:${userId}:`),
          cache.delByPrefix(`profile:sub:rankings:${userId}:`),
          cache.delByPrefix(`profile:sub:scout-reports:${userId}:`),
        ]);
        logger.debug('[Settings] All user caches invalidated', { userId });
      } catch (cacheError) {
        logger.warn('[Settings] Could not fully invalidate user caches', {
          userId,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
        });
      }

      // Delete all RosterEntry records for this user
      try {
        const rosterEntriesSnap = await db
          .collection('RosterEntries')
          .where('userId', '==', userId)
          .get();
        if (!rosterEntriesSnap.empty) {
          const rosterBatch = db.batch();
          for (const doc of rosterEntriesSnap.docs) {
            rosterBatch.delete(doc.ref);
          }
          await rosterBatch.commit();
          logger.debug('[Settings] Deleted roster entries', {
            userId,
            count: rosterEntriesSnap.size,
          });
        }
      } catch (rosterError) {
        logger.warn('[Settings] Could not delete roster entries', {
          userId,
          error: rosterError instanceof Error ? rosterError.message : String(rosterError),
        });
      }

      // Remove user from all Teams they are a member of
      try {
        const teamsSnap = await db
          .collection('Teams')
          .where('memberIds', 'array-contains', userId)
          .get();
        if (!teamsSnap.empty) {
          for (const teamDoc of teamsSnap.docs) {
            const teamData = teamDoc.data();
            const updatedMembers = (
              (teamData['members'] as Record<string, unknown>[]) ?? []
            ).filter((m) => m['id'] !== userId);
            await teamDoc.ref.update({
              memberIds: FieldValue.arrayRemove(userId),
              members: updatedMembers,
              updatedAt: new Date().toISOString(),
            });
          }
          logger.debug('[Settings] Removed from teams', { userId, count: teamsSnap.size });
        }
      } catch (teamsError) {
        logger.warn('[Settings] Could not remove user from teams', {
          userId,
          error: teamsError instanceof Error ? teamsError.message : String(teamsError),
        });
      }

      await userRef.delete();
      logger.debug('[Settings] Primary user document deleted', {
        userId,
        collection: USERS_COLLECTION,
      });

      try {
        await firebaseAuth.deleteUser(userId);
        logger.debug('[Settings] Firebase Auth user deleted', { userId });
      } catch (authErr) {
        logger.warn('[Settings] Could not delete Firebase Auth user', {
          userId,
          error: authErr instanceof Error ? authErr.message : String(authErr),
        });
      }

      logger.info('[Settings] Account deletion completed successfully', { userId });
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      logger.error('[Settings] Account deletion failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // Re-throw to let asyncHandler handle it
    }
  })
);

export default router;
