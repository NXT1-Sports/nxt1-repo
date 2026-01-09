/**
 * @fileoverview Profile Routes
 * @module @nxt1/backend
 *
 * Profile management routes using shared @nxt1/core types and validation.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type {
  ApiResponse,
  UserV2,
  ProfileSport,
  ProfileStats,
  ProfileOffer,
} from '@nxt1/core';
import { validateProfileUpdate, isValidEmail, slugify } from '@nxt1/core';

import { db } from '../utils/firebase.js';
import { appGuard } from '../middleware/auth.middleware.js';

const router = Router();

// Apply auth guard to all routes
router.use(appGuard);

/**
 * GET /profile
 * Get current user's profile
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { uid } = req.user!;

    const doc = await db.collection('Users').doc(uid).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    const data = doc.data()!;

    const profile: Partial<UserV2> = {
      uid,
      email: data.email,
      displayName: data.name || '',
      firstName: data.firstName,
      lastName: data.lastName,
      username: data.username,
      photoURL: data.photoURL,
      role: data.role || 'athlete',
      sport: data.sport,
      position: data.position,
      classYear: data.classYear,
      gradYear: data.gradYear,
      state: data.state,
      city: data.city,
      school: data.school,
      team: data.team,
      isPremium: data.isPremium || false,
      isVerified: data.isVerified || false,
      settings: data.settings,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    res.json({
      success: true,
      data: { profile },
    });
  } catch (error) {
    console.error('[Profile] get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile',
    });
  }
});

/**
 * PUT /profile
 * Update current user's profile
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const { uid } = req.user!;
    const updates = req.body;

    // Validate updates using shared @nxt1/core validation
    const validation = validateProfileUpdate(updates);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    // Sanitize updates - only allow specific fields
    const allowedFields = [
      'firstName',
      'lastName',
      'displayName',
      'username',
      'photoURL',
      'bannerURL',
      'bio',
      'sport',
      'position',
      'secondaryPositions',
      'classYear',
      'gradYear',
      'state',
      'city',
      'school',
      'team',
      'height',
      'weight',
      'gpa',
      'act',
      'sat',
      'contacts',
      'socialLinks',
      'settings',
    ];

    const sanitizedUpdates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sanitizedUpdates[field] = updates[field];
      }
    }

    // Generate slug if name is being updated
    if (updates.firstName || updates.lastName) {
      const doc = await db.collection('Users').doc(uid).get();
      const existingData = doc.data() || {};
      const firstName = updates.firstName || existingData.firstName || '';
      const lastName = updates.lastName || existingData.lastName || '';
      if (firstName && lastName) {
        sanitizedUpdates.slug = slugify(`${firstName} ${lastName}`);
      }
    }

    await db.collection('Users').doc(uid).update(sanitizedUpdates);

    res.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('[Profile] update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
});

/**
 * GET /profile/:username
 * Get a user's public profile by username
 */
router.get('/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const snapshot = await db
      .collection('Users')
      .where('username', '==', username.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Return public profile data only
    const publicProfile = {
      uid: doc.id,
      displayName: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      username: data.username,
      photoURL: data.photoURL,
      bannerURL: data.bannerURL,
      role: data.role || 'athlete',
      sport: data.sport,
      position: data.position,
      classYear: data.classYear,
      gradYear: data.gradYear,
      state: data.state,
      city: data.city,
      school: data.school,
      team: data.team,
      isVerified: data.isVerified || false,
      isPremium: data.isPremium || false,
      bio: data.bio,
    };

    res.json({
      success: true,
      data: { profile: publicProfile },
    });
  } catch (error) {
    console.error('[Profile] get public profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile',
    });
  }
});

/**
 * GET /profile/:uid/stats
 * Get user's profile statistics
 */
router.get('/:uid/stats', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;

    // Fetch stats in parallel
    const [userDoc, postsSnapshot, followersSnapshot, followingSnapshot] = await Promise.all([
      db.collection('Users').doc(uid).get(),
      db.collection('Posts').where('userId', '==', uid).get(),
      db.collection('Followers').where('followingId', '==', uid).get(),
      db.collection('Followers').where('followerId', '==', uid).get(),
    ]);

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const stats: ProfileStats = {
      followers: followersSnapshot.size,
      following: followingSnapshot.size,
      posts: postsSnapshot.size,
      highlights: 0,
      views: userDoc.data()?.profileViews || 0,
    };

    res.json({
      success: true,
      data: { stats },
    });
  } catch (error) {
    console.error('[Profile] get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile stats',
    });
  }
});

/**
 * GET /profile/:uid/offers
 * Get user's college offers
 */
router.get('/:uid/offers', async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;

    const snapshot = await db
      .collection('Users')
      .doc(uid)
      .collection('Offers')
      .orderBy('receivedDate', 'desc')
      .get();

    const offers: ProfileOffer[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        collegeName: data.collegeName,
        collegeLogoUrl: data.collegeLogoUrl,
        division: data.division,
        sport: data.sport,
        offerType: data.offerType || 'scholarship',
        status: data.status || 'pending',
        receivedDate: data.receivedDate,
        isCommitted: data.isCommitted || false,
      };
    });

    res.json({
      success: true,
      data: { offers },
    });
  } catch (error) {
    console.error('[Profile] get offers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch offers',
    });
  }
});

export default router;
