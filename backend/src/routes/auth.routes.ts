/**
 * @fileoverview Auth Routes
 * @module @nxt1/backend
 *
 * Authentication routes using shared @nxt1/core types and unified error handling.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { ValidateTeamCodeResponse, CreateUserRequest, TeamTypeApi } from '@nxt1/core';
import { isValidEmail, isValidTeamCode } from '@nxt1/core';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, notFoundError, conflictError } from '@nxt1/core/errors';

const router = Router();

/**
 * POST /auth/validate-team-code
 * Validate a team code for registration
 */
router.post(
  '/validate-team-code',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { code } = req.body;

    if (!code || !isValidTeamCode(code)) {
      const error = validationError([
        { field: 'code', message: 'Invalid team code format', rule: 'format' },
      ]);
      sendError(res, error);
      return;
    }

    // Query Firestore - automatically uses staging or prod based on route
    const snapshot = await db
      .collection('TeamCodes')
      .where('teamCode', '==', code.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      const error = notFoundError('team-code');
      sendError(res, error);
      return;
    }

    const doc = snapshot.docs[0];
    const teamCode = doc.data();

    const response: ValidateTeamCodeResponse = {
      valid: true,
      teamCode: {
        id: doc.id,
        code: teamCode['teamCode'] as string,
        teamName: teamCode['teamName'] as string,
        teamType: ((teamCode['teamType'] as string)?.toLowerCase().replace(' ', '-') ||
          'high-school') as TeamTypeApi,
        sport: teamCode['sportName'] as string,
        isFreeTrial: (teamCode['isFreeTrial'] as boolean) || false,
        trialDays: teamCode['trialDays'] as number | undefined,
        memberCount: (teamCode['members'] as unknown[])?.length || 0,
        maxMembers: teamCode['maxMembers'] as number | undefined,
      },
    };

    res.json(response);
  })
);

/**
 * POST /auth/create-user
 * Create a new user in Firestore
 */
router.post(
  '/create-user',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { uid, email } = req.body as CreateUserRequest;

    // Validation
    if (!uid || !email) {
      const error = validationError([
        ...(!uid ? [{ field: 'uid', message: 'User ID is required', rule: 'required' }] : []),
        ...(!email ? [{ field: 'email', message: 'Email is required', rule: 'required' }] : []),
      ]);
      sendError(res, error);
      return;
    }

    if (!isValidEmail(email)) {
      const error = validationError([
        { field: 'email', message: 'Invalid email format', rule: 'email' },
      ]);
      sendError(res, error);
      return;
    }

    // Check if user already exists
    const existingUser = await db.collection('Users').doc(uid).get();
    if (existingUser.exists) {
      const error = conflictError('user');
      sendError(res, error);
      return;
    }

    // Create user document
    const newUser = {
      email,
      credits: 0,
      featureCredits: 0,
      lastActivatedPlan: 'free',
      completeSignUp: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection('Users').doc(uid).set(newUser);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: uid,
          email,
          credits: 0,
          featureCredits: 0,
          lastActivatedPlan: 'free',
          completeSignUp: false,
        },
      },
    });
  })
);

/**
 * GET /auth/check-username
 * Check if a username is available
 */
router.get(
  '/check-username',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      const error = validationError([
        { field: 'username', message: 'Username is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    const snapshot = await db
      .collection('Users')
      .where('username', '==', username.toLowerCase())
      .limit(1)
      .get();

    res.json({
      available: snapshot.empty,
      suggestions: snapshot.empty ? [] : [`${username}1`, `${username}2`, `${username}_`],
    });
  })
);

/**
 * GET /auth/profile/:uid
 * Get user profile by UID
 */
router.get(
  '/profile/:uid',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { uid } = req.params;

    console.log('[Auth] GET /profile/:uid - uid:', uid);

    if (!uid) {
      console.log('[Auth] Error: uid is missing');
      const error = validationError([
        { field: 'uid', message: 'User ID is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    // Fetch user document
    console.log('[Auth] Fetching user from Firestore...');
    const userDoc = await db.collection('Users').doc(uid).get();

    if (!userDoc.exists) {
      console.log('[Auth] User not found in Firestore');
      const error = notFoundError('user', uid);
      sendError(res, error);
      return;
    }

    const userData = userDoc.data();
    console.log('[Auth] User data retrieved, keys:', userData ? Object.keys(userData).length : 0);
    const profile = {
      id: userDoc.id,
      ...userData,
    };

    console.log('[Auth] Sending success response');
    res.json({
      success: true,
      data: profile,
    });
  })
);

export default router;
