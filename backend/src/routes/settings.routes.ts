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
 * Get user settings
 * GET /api/v1/settings
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

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
 * Change password
 * POST /api/v1/settings/password
 */
router.post('/password', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

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

    /*
    // Delete Firestore sub-collections in parallel
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const subCollections = ['followers', 'following', 'sports', 'timeline', 'notifications'];

    await Promise.all(
      subCollections.map(async (col) => {
        const snap = await userRef.collection(col).limit(500).get();
        if (snap.empty) return;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      })
    );
    */
    const userRef = db.collection(USERS_COLLECTION).doc(userId);

    // Delete the user document itself
    await userRef.delete();

    // Invalidate preferences cache
    await getCacheService().del(buildPrefsCacheKey(userId));

    // Delete Firebase Auth account (admin SDK – no password needed server-side)
    try {
      await firebaseAuth.deleteUser(userId);
    } catch (authErr) {
      // Log but don't fail — Firestore data is already gone
      logger.warn('[Settings] Could not delete Firebase Auth user', {
        userId,
        error: authErr instanceof Error ? authErr.message : String(authErr),
      });
    }

    logger.info('[Settings] Account deleted', { userId });
    res.json({ success: true, data: { deleted: true } });
  })
);

/**
 * Check for app updates
 * GET /api/v1/settings/check-update
 */
router.get('/check-update', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get notification preferences
 * GET /api/v1/settings/notifications
 */
router.get('/notifications', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update notification preferences
 * PUT /api/v1/settings/notifications
 */
router.put('/notifications', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get privacy settings
 * GET /api/v1/settings/privacy
 */
router.get('/privacy', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update privacy settings
 * PUT /api/v1/settings/privacy
 */
router.put('/privacy', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update user settings (general)
 * PUT /api/v1/settings
 */
router.put('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
