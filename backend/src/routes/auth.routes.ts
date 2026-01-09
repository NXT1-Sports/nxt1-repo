/**
 * @fileoverview Auth Routes
 * @module @nxt1/backend
 *
 * Authentication routes using shared @nxt1/core types.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type {
  ApiResponse,
  ValidateTeamCodeResponse,
  CreateUserRequest,
  CreateUserResponse,
} from '@nxt1/core';
import { validateRegistration, isValidEmail, isValidTeamCode } from '@nxt1/core';

import { db } from '../utils/firebase.js';
import { appGuard } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * POST /auth/validate-team-code
 * Validate a team code for registration
 */
router.post('/validate-team-code', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || !isValidTeamCode(code)) {
      const response: ValidateTeamCodeResponse = {
        valid: false,
        error: 'Invalid team code format',
      };
      return res.status(400).json(response);
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
      return res.status(404).json(response);
    }

    const doc = snapshot.docs[0];
    const teamCode = doc.data();

    const response: ValidateTeamCodeResponse = {
      valid: true,
      teamCode: {
        id: doc.id,
        code: teamCode.teamCode,
        teamName: teamCode.teamName,
        teamType: teamCode.teamType?.toLowerCase().replace(' ', '-') || 'high-school',
        sport: teamCode.sportName,
        isFreeTrial: teamCode.isFreeTrial || false,
        trialDays: teamCode.trialDays,
        memberCount: teamCode.members?.length || 0,
        maxMembers: teamCode.maxMembers,
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
router.post('/create-user', async (req: Request, res: Response) => {
  try {
    const { uid, email, teamCode, referralId } = req.body as CreateUserRequest;

    // Validation
    if (!uid || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: uid, email',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    // Check if user already exists
    const existingUser = await db.collection('Users').doc(uid).get();
    if (existingUser.exists) {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
      });
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

    const response: CreateUserResponse = {
      success: true,
      data: {
        user: {
          id: uid,
          email,
          credits: 0,
          featureCredits: 0,
          lastActivatedPlan: 'free',
          completeSignUp: false,
          hasTeamCode: !!teamCode,
        },
      },
    };

    res.status(201).json(response);
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
router.get('/check-username', async (req: Request, res: Response) => {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        available: false,
        error: 'Username is required',
      });
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
