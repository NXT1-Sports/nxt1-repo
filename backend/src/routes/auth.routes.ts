/**
 * @fileoverview Auth Routes
 * @module @nxt1/backend
 *
 * Authentication routes using shared @nxt1/core types.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { ValidateTeamCodeResponse, CreateUserRequest, TeamTypeApi } from '@nxt1/core';
import { isValidEmail, isValidTeamCode } from '@nxt1/core';

import { db } from '../utils/firebase.js';

const router = Router();

/**
 * POST /auth/validate-team-code
 * Validate a team code for registration
 */
router.post('/validate-team-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code || !isValidTeamCode(code)) {
      const response: ValidateTeamCodeResponse = {
        valid: false,
        error: 'Invalid team code format',
      };
      res.status(400).json(response);
      return;
    }

    // Query Firestore for team code
    const snapshot = await db
      .collection('TeamCodes')
      .where('teamCode', '==', code.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      const response: ValidateTeamCodeResponse = {
        valid: false,
        error: 'Team code not found or expired',
      };
      res.status(404).json(response);
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
  } catch (error) {
    console.error('[Auth] validate-team-code error:', error);
    const response: ValidateTeamCodeResponse = {
      valid: false,
      error: 'Failed to validate team code',
    };
    res.status(500).json(response);
  }
});

/**
 * POST /auth/create-user
 * Create a new user in Firestore
 */
router.post('/create-user', async (req: Request, res: Response): Promise<void> => {
  try {
    const { uid, email } = req.body as CreateUserRequest;

    // Validation
    if (!uid || !email) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: uid, email',
      });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
      return;
    }

    // Check if user already exists
    const existingUser = await db.collection('Users').doc(uid).get();
    if (existingUser.exists) {
      res.status(409).json({
        success: false,
        error: 'User already exists',
      });
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
  } catch (error) {
    console.error('[Auth] create-user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user',
    });
  }
});

/**
 * GET /auth/check-username
 * Check if a username is available
 */
router.get('/check-username', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      res.status(400).json({
        available: false,
        error: 'Username is required',
      });
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
  } catch (error) {
    console.error('[Auth] check-username error:', error);
    res.status(500).json({
      available: false,
      error: 'Failed to check username',
    });
  }
});

export default router;
