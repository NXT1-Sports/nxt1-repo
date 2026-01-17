/**
 * @fileoverview Auth Routes
 * @module @nxt1/backend
 *
 * Authentication routes using shared @nxt1/core types and unified error handling.
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';

import type { ValidateTeamCodeResponse, CreateUserRequest, TeamTypeApi } from '@nxt1/core';
import { isValidEmail, isValidTeamCode } from '@nxt1/core';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, notFoundError, conflictError } from '@nxt1/core/errors';

const router: RouterType = Router();

/**
 * GET /auth/team-code/validate/:code
 * Validate a team code for registration
 *
 * This endpoint matches the @nxt1/core API expectation.
 */
router.get(
  '/team-code/validate/:code',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const code = req.params['code'] as string;

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
 * Create a new user in Firestore with optional team code association
 *
 * If a valid team code is provided, the user will be:
 * 1. Created with the team association
 * 2. Added to the team's member list
 * 3. Given appropriate subscription status based on team
 *
 * Uses Firestore transaction to ensure atomicity.
 */
router.post(
  '/create-user',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { uid, email, teamCode, referralId } = req.body as CreateUserRequest;

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

    // Validate team code if provided
    let validatedTeam: {
      id: string;
      teamCode: string;
      teamName: string;
      isFreeTrial: boolean;
      trialDays?: number;
    } | null = null;

    if (teamCode && isValidTeamCode(teamCode)) {
      const teamSnapshot = await db
        .collection('TeamCodes')
        .where('teamCode', '==', teamCode.toUpperCase())
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!teamSnapshot.empty) {
        const teamDoc = teamSnapshot.docs[0];
        const teamData = teamDoc.data();
        validatedTeam = {
          id: teamDoc.id,
          teamCode: teamData['teamCode'] as string,
          teamName: teamData['teamName'] as string,
          isFreeTrial: (teamData['isFreeTrial'] as boolean) || false,
          trialDays: teamData['trialDays'] as number | undefined,
        };
      }
      // If team code is invalid, we continue without it (soft fail)
      // User can join a team later
    }

    // Check if user already exists
    const existingUser = await db.collection('Users').doc(uid).get();
    if (existingUser.exists) {
      const error = conflictError('user');
      sendError(res, error);
      return;
    }

    // Determine subscription plan based on team code
    const now = new Date().toISOString();
    let lastActivatedPlan: 'free' | 'trial' | 'subscription' = 'free';

    if (validatedTeam) {
      lastActivatedPlan = validatedTeam.isFreeTrial ? 'trial' : 'subscription';
    }

    // Create user document with team association
    interface NewUserData {
      email: string;
      credits: number;
      featureCredits: number;
      lastActivatedPlan: 'free' | 'trial' | 'subscription';
      completeSignUp: boolean;
      createdAt: string;
      updatedAt: string;
      teamCode?: {
        teamCode: string;
        teamName: string;
        teamId: string;
      };
      referralId?: string;
      trialStartDate?: string;
      trialEndDate?: string;
    }

    const newUser: NewUserData = {
      email,
      credits: 0,
      featureCredits: 0,
      lastActivatedPlan,
      completeSignUp: false,
      createdAt: now,
      updatedAt: now,
    };

    // Add team code reference if validated
    if (validatedTeam) {
      newUser.teamCode = {
        teamCode: validatedTeam.teamCode,
        teamName: validatedTeam.teamName,
        teamId: validatedTeam.id,
      };

      // Set trial dates if applicable
      if (validatedTeam.isFreeTrial && validatedTeam.trialDays) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + validatedTeam.trialDays);
        newUser.trialStartDate = now;
        newUser.trialEndDate = trialEnd.toISOString();
      }
    }

    // Add referral tracking if provided
    if (referralId) {
      newUser.referralId = referralId;
    }

    // Use transaction if we need to update team members
    if (validatedTeam) {
      await db.runTransaction(async (transaction) => {
        // Create user
        const userRef = db.collection('Users').doc(uid);
        transaction.set(userRef, newUser);

        // Add user to team's memberIds array
        const teamRef = db.collection('TeamCodes').doc(validatedTeam!.id);
        const { FieldValue } = await import('firebase-admin/firestore');
        transaction.update(teamRef, {
          memberIds: FieldValue.arrayUnion(uid),
          updatedAt: now,
        });
      });
    } else {
      // Simple create without team
      await db.collection('Users').doc(uid).set(newUser);
    }

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: uid,
          email,
          credits: 0,
          featureCredits: 0,
          lastActivatedPlan,
          completeSignUp: false,
          teamCode: validatedTeam
            ? {
                teamCode: validatedTeam.teamCode,
                teamName: validatedTeam.teamName,
              }
            : undefined,
        },
      },
    });
  })
);

/**
 * POST /auth/join-team
 * Join a team using a team code (for users who signed up without one)
 */
router.post(
  '/join-team',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { userId, code } = req.body;

    // Validation
    if (!userId || !code) {
      const error = validationError([
        ...(!userId ? [{ field: 'userId', message: 'User ID is required', rule: 'required' }] : []),
        ...(!code ? [{ field: 'code', message: 'Team code is required', rule: 'required' }] : []),
      ]);
      sendError(res, error);
      return;
    }

    if (!isValidTeamCode(code)) {
      const error = validationError([
        { field: 'code', message: 'Invalid team code format', rule: 'format' },
      ]);
      sendError(res, error);
      return;
    }

    // Check user exists
    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) {
      const error = notFoundError('user', userId);
      sendError(res, error);
      return;
    }

    // Check if user already has a team
    const userData = userDoc.data();
    if (userData?.['teamCode']) {
      const error = conflictError('team-membership');
      sendError(res, error);
      return;
    }

    // Find and validate team code
    const teamSnapshot = await db
      .collection('TeamCodes')
      .where('teamCode', '==', code.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (teamSnapshot.empty) {
      const error = notFoundError('team-code');
      sendError(res, error);
      return;
    }

    const teamDoc = teamSnapshot.docs[0];
    const teamData = teamDoc.data();

    const now = new Date().toISOString();
    const lastActivatedPlan = teamData['isFreeTrial'] ? 'trial' : 'subscription';

    // Use transaction to update both user and team atomically
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('Users').doc(userId);
      const teamRef = db.collection('TeamCodes').doc(teamDoc.id);
      const { FieldValue } = await import('firebase-admin/firestore');

      // Update user with team info
      const userUpdate: Record<string, unknown> = {
        teamCode: {
          teamCode: teamData['teamCode'],
          teamName: teamData['teamName'],
          teamId: teamDoc.id,
        },
        lastActivatedPlan,
        updatedAt: now,
      };

      // Add trial dates if applicable
      if (teamData['isFreeTrial'] && teamData['trialDays']) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + (teamData['trialDays'] as number));
        userUpdate['trialStartDate'] = now;
        userUpdate['trialEndDate'] = trialEnd.toISOString();
      }

      transaction.update(userRef, userUpdate);

      // Add user to team's memberIds
      transaction.update(teamRef, {
        memberIds: FieldValue.arrayUnion(userId),
        updatedAt: now,
      });
    });

    res.json({
      success: true,
      teamName: teamData['teamName'],
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
    const uid = req.params['uid'] as string;

    if (!uid) {
      const error = validationError([
        { field: 'uid', message: 'User ID is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    // Fetch user document
    const userDoc = await db.collection('Users').doc(uid).get();

    if (!userDoc.exists) {
      const error = notFoundError('user', uid);
      sendError(res, error);
      return;
    }

    const userData = userDoc.data();
    const profile = {
      id: userDoc.id,
      ...userData,
    };
    res.json({
      success: true,
      data: profile,
    });
  })
);

export default router;
