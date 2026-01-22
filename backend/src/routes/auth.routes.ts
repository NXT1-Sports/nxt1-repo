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

    console.log(`[NXT1-REPO BACKEND] 🚀 Create user request:`, {
      uid: uid?.substring(0, 8) + '...',
      email,
      teamCode: teamCode || 'none',
      referralId: referralId || 'none',
      timestamp: new Date().toISOString(),
      backend: 'nxt1-repo',
      port: process.env['PORT'] || 3000,
    });

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
      credits: 5,
      featureCredits: 5,
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

    const responseData = {
      success: true,
      data: {
        user: {
          id: uid,
          email,
          credits: 5,
          featureCredits: 5,
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
    };

    console.log(`[NXT1-REPO BACKEND] ✅ User created successfully:`, {
      uid: uid?.substring(0, 8) + '...',
      email,
      credits: responseData.data.user.credits,
      featureCredits: responseData.data.user.featureCredits,
      teamCode: teamCode || 'none',
      backend: 'nxt1-repo',
    });

    res.status(201).json(responseData);
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
    const profile: {
      id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      profileImg?: string;
      primarySport?: string;
      isRecruit?: boolean;
      isCollegeCoach?: boolean;
      completeSignUp?: boolean;
      lastActivatedPlan?: string;
      teamCode?: unknown;
      [key: string]: unknown;
    } = {
      id: userDoc.id,
      email: userData?.['email'],
      firstName: userData?.['firstName'],
      lastName: userData?.['lastName'],
      profileImg: userData?.['profileImg'],
      primarySport: userData?.['primarySport'] || userData?.['sport'],
      isRecruit: userData?.['isRecruit'] || false,
      isCollegeCoach: userData?.['isCollegeCoach'] || false,
      completeSignUp: userData?.['completeSignUp'] || false,
      lastActivatedPlan: userData?.['lastActivatedPlan'],
      teamCode: userData?.['teamCode'],
    };
    res.json(profile);
  })
);

/**
 * POST /auth/profile/onboarding
 * Save complete onboarding profile data
 */
router.post(
  '/profile/onboarding',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { userId, ...profileData } = req.body;

    if (!userId) {
      const error = validationError([
        { field: 'userId', message: 'User ID is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    // Validate required fields
    if (!profileData['firstName'] || !profileData['lastName']) {
      const error = validationError([
        { field: 'firstName', message: 'First name is required', rule: 'required' },
        { field: 'lastName', message: 'Last name is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    // Check if user exists
    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) {
      const error = notFoundError('user', userId);
      sendError(res, error);
      return;
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      firstName: (profileData['firstName'] as string).trim(),
      lastName: (profileData['lastName'] as string).trim(),
      updatedAt: new Date().toISOString(),
    };

    // Add optional fields if provided
    if (profileData['profileImg']) updateData['profileImg'] = profileData['profileImg'];
    if (profileData['bio']) updateData['bio'] = profileData['bio'];
    if (profileData['sport']) {
      updateData['sport'] = profileData['sport'];
      updateData['primarySport'] = profileData['sport'];
    }
    if (profileData['secondarySport']) updateData['secondarySport'] = profileData['secondarySport'];
    if (profileData['positions']) updateData['primarySportPositions'] = profileData['positions'];
    if (profileData['highSchool']) updateData['highSchool'] = profileData['highSchool'];
    if (profileData['highSchoolSuffix'])
      updateData['highSchoolSuffix'] = profileData['highSchoolSuffix'];
    if (profileData['classOf']) updateData['classOf'] = profileData['classOf'];
    if (profileData['state']) updateData['state'] = profileData['state'];
    if (profileData['city']) updateData['city'] = profileData['city'];
    if (profileData['club']) updateData['club'] = profileData['club'];
    if (profileData['organization']) updateData['organization'] = profileData['organization'];
    if (profileData['coachTitle']) updateData['coachTitle'] = profileData['coachTitle'];

    // Set user type flags
    if (profileData['userType']) {
      updateData['isRecruit'] = profileData['userType'] === 'athlete';
      updateData['isCollegeCoach'] = profileData['userType'] === 'coach';
      updateData['isFan'] = profileData['userType'] === 'fan';
      updateData['isMedia'] = profileData['userType'] === 'media';
      updateData['isService'] = profileData['userType'] === 'service';
      updateData['isParent'] = profileData['userType'] === 'parent';
      updateData['isScout'] = profileData['userType'] === 'scout';
    }

    // Update user document
    await db.collection('Users').doc(userId).update(updateData);

    // Fetch updated user
    const updatedUser = await db.collection('Users').doc(userId).get();
    const userData = updatedUser.data();

    res.json({
      success: true,
      user: {
        id: userId,
        firstName: userData?.['firstName'],
        lastName: userData?.['lastName'],
        completeSignUp: userData?.['completeSignUp'] || false,
        primarySport: userData?.['primarySport'] || userData?.['sport'],
      },
      redirectPath: '/auth/onboarding',
    });
  })
);

/**
 * POST /auth/profile/onboarding-step
 * Save individual onboarding step data incrementally
 *
 * This allows saving data as user progresses through steps, ensuring
 * Firebase has current data for downstream features.
 */
router.post(
  '/profile/onboarding-step',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { userId, stepId, stepData } = req.body;

    // Validate required fields
    if (!userId || !stepId || !stepData || typeof stepData !== 'object') {
      const error = validationError([
        ...(!userId ? [{ field: 'userId', message: 'User ID is required', rule: 'required' }] : []),
        ...(!stepId ? [{ field: 'stepId', message: 'Step ID is required', rule: 'required' }] : []),
        ...(!stepData
          ? [{ field: 'stepData', message: 'Step data is required', rule: 'required' }]
          : []),
      ]);
      sendError(res, error);
      return;
    }

    // Check if user exists
    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) {
      const error = notFoundError('user', userId);
      sendError(res, error);
      return;
    }

    // Build update data based on step type
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      [`onboardingProgress.${stepId}`]: {
        completed: true,
        completedAt: new Date().toISOString(),
      },
    };

    // Process step-specific data
    switch (stepId) {
      case 'role':
        if (stepData['userType']) {
          updateData['isRecruit'] = stepData['userType'] === 'athlete';
          updateData['isCollegeCoach'] = stepData['userType'] === 'coach';
          updateData['isFan'] = stepData['userType'] === 'fan';
          updateData['isMedia'] = stepData['userType'] === 'media';
          updateData['isService'] = stepData['userType'] === 'service';
          updateData['isParent'] = stepData['userType'] === 'parent';
          updateData['isScout'] = stepData['userType'] === 'scout';
        }
        break;

      case 'profile':
        if (stepData['firstName'])
          updateData['firstName'] = (stepData['firstName'] as string).trim();
        if (stepData['lastName']) updateData['lastName'] = (stepData['lastName'] as string).trim();
        if (stepData['profileImg']) updateData['profileImg'] = stepData['profileImg'];
        if (stepData['bio']) updateData['bio'] = (stepData['bio'] as string).trim();
        break;

      case 'school':
        if (stepData['highSchool'])
          updateData['highSchool'] = (stepData['highSchool'] as string).trim();
        if (stepData['highSchoolSuffix'])
          updateData['highSchoolSuffix'] = (stepData['highSchoolSuffix'] as string).trim();
        if (stepData['classOf'] && !isNaN(Number(stepData['classOf']))) {
          updateData['classOf'] = Number(stepData['classOf']);
        }
        if (stepData['state']) updateData['state'] = (stepData['state'] as string).trim();
        if (stepData['city']) updateData['city'] = (stepData['city'] as string).trim();
        if (stepData['club']) updateData['club'] = (stepData['club'] as string).trim();
        break;

      case 'organization':
        if (stepData['organization'])
          updateData['organization'] = (stepData['organization'] as string).trim();
        if (stepData['secondOrganization'])
          updateData['secondOrganization'] = (stepData['secondOrganization'] as string).trim();
        if (stepData['coachTitle'])
          updateData['coachTitle'] = (stepData['coachTitle'] as string).trim();
        if (stepData['state']) updateData['state'] = (stepData['state'] as string).trim();
        if (stepData['city']) updateData['city'] = (stepData['city'] as string).trim();
        break;

      case 'sport':
        if (stepData['primarySport']) {
          updateData['primarySport'] = (stepData['primarySport'] as string).trim();
          updateData['sport'] = updateData['primarySport']; // Legacy field
          updateData['appSport'] = updateData['primarySport'];
        }
        if (stepData['secondarySport']) {
          updateData['secondarySport'] = (stepData['secondarySport'] as string).trim();
        }
        break;

      case 'positions':
        if (Array.isArray(stepData['positions'])) {
          updateData['primarySportPositions'] = (stepData['positions'] as string[]).slice(0, 10);
        }
        break;

      case 'contact':
        if (stepData['contactEmail'] && isValidEmail(stepData['contactEmail'] as string)) {
          updateData['contactEmail'] = (stepData['contactEmail'] as string).toLowerCase();
        }
        if (stepData['phoneNumber'])
          updateData['phoneNumber'] = (stepData['phoneNumber'] as string).trim();
        if (stepData['instagram'])
          updateData['instagram'] = (stepData['instagram'] as string).trim();
        if (stepData['twitter']) updateData['twitter'] = (stepData['twitter'] as string).trim();
        if (stepData['tiktok']) updateData['tiktok'] = (stepData['tiktok'] as string).trim();
        if (stepData['hudlAccountLink'])
          updateData['hudlAccountLink'] = (stepData['hudlAccountLink'] as string).trim();
        if (stepData['youtubeAccountLink'])
          updateData['youtubeAccountLink'] = (stepData['youtubeAccountLink'] as string).trim();
        break;

      case 'referral-source':
        updateData['showedHearAbout'] = true;
        break;

      default:
        // For unknown steps, save raw data under onboardingSteps
        updateData[`onboardingSteps.${stepId}`] = stepData;
    }

    // Update user document
    await db.collection('Users').doc(userId).update(updateData);

    res.json({
      success: true,
      stepId,
      savedFields: Object.keys(updateData).filter(
        (k) => !k.startsWith('onboardingProgress') && k !== 'updatedAt'
      ),
    });
  })
);

/**
 * POST /auth/profile/onboarding
 * Save user's complete onboarding profile data
 */
router.post(
  '/profile/onboarding',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { userId, ...profileData } = req.body as { userId: string; [key: string]: unknown };

    if (!userId) {
      const error = validationError([
        { field: 'userId', message: 'User ID is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    const now = new Date().toISOString();

    // Update user document with complete onboarding data
    await db
      .collection('Users')
      .doc(userId)
      .update({
        ...profileData,
        signupCompleted: true,
        onboardingCompleted: true,
        updatedAt: now,
      });

    // Fetch updated user data
    const updatedUser = await db.collection('Users').doc(userId).get();
    const userData = updatedUser.data();

    res.json({
      success: true,
      user: {
        id: userId,
        firstName: userData?.['firstName'],
        lastName: userData?.['lastName'],
        completeSignUp: userData?.['completeSignUp'] || true,
        primarySport: userData?.['primarySport'] || userData?.['sport'],
      },
      redirectPath: '/home',
    });
  })
);

/**
 * POST /auth/profile/complete-onboarding
 * Mark user's onboarding as complete
 */
router.post(
  '/profile/complete-onboarding',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { userId } = req.body as { userId: string };

    if (!userId) {
      const error = validationError([
        { field: 'userId', message: 'User ID is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    const now = new Date().toISOString();

    // Update user document to mark onboarding complete
    await db.collection('Users').doc(userId).update({
      completeSignUp: true,
      onboardingCompletedAt: now,
      updatedAt: now,
    });

    // Fetch updated user data
    const updatedUser = await db.collection('Users').doc(userId).get();
    const userData = updatedUser.data();

    res.json({
      success: true,
      user: {
        id: userId,
        firstName: userData?.['firstName'],
        lastName: userData?.['lastName'],
        completeSignUp: true,
        primarySport: userData?.['primarySport'] || userData?.['sport'],
      },
      redirectPath: '/explore',
    });
  })
);

/**
 * POST /auth/analytics/hear-about
 * Save referral source ("How did you hear about us")
 */
router.post(
  '/analytics/hear-about',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase;
    const { userId, source, details, clubName, otherSpecify } = req.body as {
      userId: string;
      source: string;
      details?: string;
      clubName?: string;
      otherSpecify?: string;
    };

    if (!userId || !source) {
      const error = validationError([
        { field: 'userId', message: 'User ID is required', rule: 'required' },
        { field: 'source', message: 'Source is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    const now = new Date();

    // Create HearAbout document
    const hearAboutData: Record<string, unknown> = {
      userId,
      source,
      timestamp: now,
      createdAt: now.toISOString(),
    };

    if (details) hearAboutData['details'] = details;
    if (clubName) hearAboutData['clubName'] = clubName;
    if (otherSpecify) hearAboutData['otherSpecify'] = otherSpecify;

    const hearAboutRef = await db.collection('HearAbout').add(hearAboutData);

    // Update user document with referral source
    await db
      .collection('Users')
      .doc(userId)
      .update({
        referralSource: source,
        referralDetails: details || null,
        updatedAt: now.toISOString(),
      });

    res.json({
      success: true,
      id: hearAboutRef.id,
    });
  })
);

export default router;
