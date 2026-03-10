/**
 * @fileoverview Auth Routes - V2 User Model Implementation
 * @module @nxt1/backend
 *
 * Authentication routes using shared @nxt1/core types and unified error handling.
 * Implements V2 User model with:
 * - Single `role` field instead of boolean flags
 * - `sports[]` array instead of flat sport fields
 * - Nested objects for location, contact, social
 * - `onboardingCompleted` flag
 *
 * @version 2.0.0
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';

import type {
  ValidateTeamCodeResponse,
  CreateUserRequest,
  TeamTypeApi,
  UserRole,
  SportProfile,
  Location,
  ContactInfo,
  UserSocialLink,
} from '@nxt1/core';
import { isValidEmail, isValidTeamCode, USER_SCHEMA_VERSION } from '@nxt1/core';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import {
  validationError,
  notFoundError,
  conflictError,
  unauthorizedError,
  internalError,
} from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';
import { generateUnicodeForUser, getUserUnicode } from '../utils/unicode-generator.js';

// Import profile routes
import profileRoutes, { invalidateProfileCaches } from './profile.routes.js';

const router: RouterType = Router();

// ============================================
// V2 USER MODEL TYPES
// ============================================

/**
 * V2 User document structure for Firestore
 *
 * Design Principles:
 * - User document = Identity + Profile ONLY
 * - Payment/Subscription data → Subscriptions collection
 * - Credits/limits → Derived from PLAN_CONFIGS (no storage needed for free tier)
 *
 * @see @nxt1/core User model
 * @see Subscriptions collection for payment data
 */
interface UserV2Document {
  // Core identity
  email: string;
  firstName?: string;
  lastName?: string;
  profileImgs?: string[];
  aboutMe?: string;
  gender?: string;

  // V2: Single role field
  role?: UserRole;
  lastLoginAt?: string;

  // V2: Sports array
  sports?: SportProfile[];
  activeSportIndex?: number;

  // V2: Nested objects
  location?: Location;
  contact?: ContactInfo;
  social?: UserSocialLink[];

  // Athlete-specific
  athlete?: {
    classOf?: number;
  };

  // Coach-specific
  coach?: {
    title?: string;
    organization?: string;
  };

  // Onboarding
  onboardingCompleted: boolean;
  onboardingCompletedAt?: string;
  onboardingProgress?: Record<string, { completed: boolean; completedAt: string }>;

  // Team association (for team-based access)
  teamCode?: {
    teamCode: string;
    teamName: string;
    teamId: string;
  };

  // Referral tracking
  referralId?: string;
  referralSource?: string;
  referralDetails?: string | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Schema version for migrations
  _schemaVersion: number;

  // ============================================
  // MINIMAL LEGACY FIELDS (being phased out)
  // ============================================
  primarySport?: string; // For backward compat only
  highSchool?: string; // For backward compat only
  state?: string; // For backward compat only
  city?: string; // For backward compat only
  organization?: string; // For coaches backward compat
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map frontend userType to V2 role (5 core roles).
 * Handles legacy role strings from existing Firestore documents.
 * @param userType - The user type from frontend (e.g., 'athlete', 'coach', 'recruiter')
 * @returns UserRole - The mapped V2 role
 */
function mapUserTypeToRole(userType: string): UserRole {
  const roleMap: Record<string, UserRole> = {
    athlete: 'athlete',
    coach: 'coach',
    director: 'director' as UserRole,
    recruiter: 'recruiter' as UserRole,
    parent: 'parent',
    // Legacy aliases
    'college-coach': 'recruiter' as UserRole,
    'recruiting-service': 'recruiter' as UserRole,
    scout: 'recruiter' as UserRole,
    media: 'recruiter' as UserRole,
    fan: 'athlete',
    service: 'recruiter' as UserRole,
  };
  return roleMap[userType as keyof typeof roleMap] ?? 'athlete';
}

/**
 * Create a SportProfile from onboarding data
 * @param sport - Sport name (e.g., 'Football', 'Basketball')
 * @param order - Order in sports array (0 = primary, 1 = secondary)
 * @param options - Optional team and position data
 * @returns SportProfile - Complete sport profile object
 */
function createSportProfile(
  sport: string,
  order: number,
  options?: {
    readonly positions?: string[];
    readonly teamName?: string;
    readonly teamType?: string;
    readonly city?: string;
    readonly state?: string;
    readonly teamLogo?: string;
    readonly teamColors?: string[];
  }
): SportProfile {
  const VALID_TEAM_TYPES = [
    'high-school',
    'club',
    'college',
    'middle-school',
    'juco',
    'organization',
  ] as const;
  type ValidTeamType = (typeof VALID_TEAM_TYPES)[number];

  const teamType: ValidTeamType =
    options?.teamType && VALID_TEAM_TYPES.includes(options.teamType as ValidTeamType)
      ? (options.teamType as ValidTeamType)
      : 'high-school';

  // Build sport profile - only include non-empty fields (Firestore efficiency)
  const profile: SportProfile = {
    sport,
    order,
    accountType: 'athlete', // Will be overridden by caller for non-athlete roles
    positions: options?.positions ?? [],
    metrics: {},
    team: { type: 'club', name: '', logo: '', colors: [] },
  };
  if (options?.teamName || options?.teamLogo || options?.teamColors?.length || options?.teamType) {
    profile.team = {
      type: teamType,
      name: options?.teamName || '',
      logo: options?.teamLogo,
      colors: options?.teamColors,
    };
  }
  return profile;
}

/**
 * Get primary sport from sports array (for legacy field compatibility)
 * @param sports - Array of sport profiles
 * @returns Sport name of primary sport, or undefined if none
 */
function getPrimarySport(sports?: SportProfile[]): string | undefined {
  if (!sports?.length) return undefined;
  const primary = sports.find((s) => s.order === 0) ?? sports[0];
  return primary?.sport;
}

/**
 * GET /auth/team-code/validate/:code
 * Validate a team code for registration
 *
 * This endpoint matches the @nxt1/core API expectation.
 * Also available via query param: GET /validate-team-code?teamCode=CODE
 */
router.get(
  ['/validate-team-code', '/team-code/validate/:code'],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const code = (req.params['code'] || req.query['teamCode']) as string;

    if (!code || !isValidTeamCode(code)) {
      const error = validationError([
        { field: 'teamCode', message: 'Team code is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    // Query Firestore - automatically uses staging or prod based on route
    const snapshot = await db
      .collection('Teams')
      .where('teamCode', '==', code.toUpperCase())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      const error = notFoundError('teamCode');
      sendError(res, error);
      return;
    }

    const doc = snapshot.docs[0];
    const data = doc?.data();

    const response: ValidateTeamCodeResponse = {
      valid: true,
      teamCode: {
        id: doc.id,
        code: data?.['teamCode'] as string,
        teamName: data?.['teamName'] as string,
        teamType: ((data?.['teamType'] as string)?.toLowerCase().replace(' ', '-') ||
          'high-school') as TeamTypeApi,
        sport: data?.['sportName'] as string,
        isFreeTrial: (data?.['isFreeTrial'] as boolean) || false,
        trialDays: data?.['trialDays'] as number | undefined,
        memberCount: (data?.['members'] as unknown[])?.length || 0,
        maxMembers: data?.['maxMembers'] as number | undefined,
      },
    };

    res.json(response);
  })
);

/**
 * POST /auth/users
 * Create user endpoint - alias for /create-user to match core API expectations
 */
router.post(
  '/users',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // const { db } = req.firebase;
    const { uid, email } = req.body as CreateUserRequest;

    // Validation
    if (!uid?.trim() || !email?.trim()) {
      const error = validationError([
        ...(!uid?.trim()
          ? [{ field: 'uid', message: 'User ID is required', rule: 'required' }]
          : []),
        ...(!email?.trim()
          ? [{ field: 'email', message: 'Email is required', rule: 'required' }]
          : []),
      ]);
      sendError(res, error);
      return;
    }

    res.status(501).json({ success: false, error: 'Not implemented' });
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
    const { db } = req.firebase!;
    const { uid, email, teamCode, referralId } = req.body as CreateUserRequest;

    logger.debug('[NXT1-REPO BACKEND] Create user request:', {
      uid: uid?.substring(0, 8) + '...',
      email,
      teamCode: teamCode ?? 'none',
      referralId: referralId ?? 'none',
      timestamp: new Date().toISOString(),
      backend: 'nxt1-repo',
      port: process.env['PORT'] ?? 3000,
    });

    // Validation
    if (!uid?.trim() || !email?.trim()) {
      const error = validationError([
        ...(!uid?.trim()
          ? [{ field: 'uid', message: 'User ID is required', rule: 'required' }]
          : []),
        ...(!email?.trim()
          ? [{ field: 'email', message: 'Email is required', rule: 'required' }]
          : []),
      ]);
      sendError(res, error);
      return;
    }

    const sanitizedEmail = email.toLowerCase().trim();
    if (!isValidEmail(sanitizedEmail)) {
      const error = validationError([
        { field: 'email', message: 'Invalid email format', rule: 'email' },
      ]);
      sendError(res, error);
      return;
    }

    // Validate team code if provided
    let validatedTeam: {
      readonly id: string;
      readonly teamCode: string;
      readonly teamName: string;
      readonly isFreeTrial: boolean;
      readonly trialDays?: number;
    } | null = null;

    if (teamCode?.trim() && isValidTeamCode(teamCode)) {
      const teamSnapshot = await db
        .collection('Teams')
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
          isFreeTrial: (teamData['isFreeTrial'] as boolean) ?? false,
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

    const now = new Date().toISOString();

    // Create V2 user document (Identity + Profile only)
    // Note: Payment/subscription data goes in Subscriptions collection
    // Free tier limits are derived from PLAN_CONFIGS - no storage needed
    const newUser: UserV2Document = {
      // Core identity
      email: sanitizedEmail,

      // Onboarding status
      onboardingCompleted: false,

      // Timestamps
      createdAt: now,
      updatedAt: now,

      // Schema version
      _schemaVersion: USER_SCHEMA_VERSION,
    };

    // Add team code reference if validated
    if (validatedTeam) {
      newUser.teamCode = {
        teamCode: validatedTeam.teamCode,
        teamName: validatedTeam.teamName,
        teamId: validatedTeam.id,
      };
    }

    // Add referral tracking if provided
    if (referralId?.trim()) {
      newUser.referralId = referralId.trim();
    }

    // Use transaction if we need to update team members
    if (validatedTeam) {
      await db.runTransaction(async (transaction) => {
        // Create user document
        const userRef = db.collection('Users').doc(uid);
        transaction.set(userRef, newUser);

        // Create Subscription document for team-based access
        const subscriptionRef = db.collection('Subscriptions').doc(uid);
        const subscriptionData = {
          userId: uid,
          plan: validatedTeam!.isFreeTrial ? 'starter' : 'pro', // Team provides paid tier
          status: validatedTeam!.isFreeTrial ? 'trialing' : 'active',
          billingInterval: 'month',
          currentPeriodStart: now,
          currentPeriodEnd:
            validatedTeam!.isFreeTrial && validatedTeam!.trialDays
              ? new Date(Date.now() + validatedTeam!.trialDays * 24 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          cancelAtPeriodEnd: false,
          teamCode: {
            code: validatedTeam!.teamCode,
            teamId: validatedTeam!.id,
            teamName: validatedTeam!.teamName,
            providedPlan: validatedTeam!.isFreeTrial ? 'starter' : 'pro',
          },
          credits: {
            ai: { allocated: 5, used: 0, bonus: 0 },
            college: { allocated: 0, used: 0, bonus: 0 },
            email: { allocated: 5, used: 0, bonus: 0 },
            periodStart: now,
            periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          createdAt: now,
          updatedAt: now,
          _schemaVersion: 1,
        };
        transaction.set(subscriptionRef, subscriptionData);

        // Add user to team's memberIds array
        const teamRef = db.collection('Teams').doc(validatedTeam!.id);
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
          email: sanitizedEmail,
          onboardingCompleted: false,
          teamCode: validatedTeam
            ? {
                teamCode: validatedTeam.teamCode,
                teamName: validatedTeam.teamName,
              }
            : undefined,
        },
      },
    };

    logger.info('[NXT1-REPO BACKEND] User created successfully:', {
      uid: uid?.substring(0, 8) + '...',
      email: sanitizedEmail,
      hasTeam: !!validatedTeam,
      teamCode: teamCode ?? 'none',
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
    const { db } = req.firebase!;
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
      .collection('Teams')
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
      const teamRef = db.collection('Teams').doc(teamDoc.id);
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
    const { db } = req.firebase!;
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

// GET /auth/profile/:uid and other /auth/profile/* routes are handled
// entirely by profileRoutes (see bottom of file), which implements
// proper caching (MEDIUM_TTL 15 min) via PROFILE_CACHE_KEYS.

/**
 * POST /auth/profile/onboarding
 * Save complete onboarding profile data and mark onboarding as complete
 *
 * V2 Implementation:
 * - Saves `role` field instead of boolean flags
 * - Saves `sports[]` array instead of flat fields
 * - Saves nested `location`, `contact`, `social` objects
 * - Sets `onboardingCompleted: true`
 * - firstName/lastName are optional (may be set in earlier steps)
 */
router.post(
  '/profile/onboarding',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId, ...profileData } = req.body;

    logger.debug('[POST /profile/onboarding] Request:', { userId, keys: Object.keys(profileData) });

    if (!userId?.trim()) {
      const error = validationError([
        { field: 'userId', message: 'User ID is required', rule: 'required' },
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

    const currentUser = userDoc.data() as UserV2Document | undefined;
    const now = new Date().toISOString();

    // ============================================
    // V2 UPDATE DATA
    // ============================================
    const updateData: Partial<UserV2Document> = {
      updatedAt: now,
      lastLoginAt: now,
      _schemaVersion: USER_SCHEMA_VERSION,
      // Mark onboarding as complete
      onboardingCompleted: true,
      onboardingCompletedAt: now,
    };

    // Optional: firstName/lastName (may already be set from earlier steps)
    const firstName = (profileData['firstName'] as string)?.trim();
    const lastName = (profileData['lastName'] as string)?.trim();
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;

    // Profile images and bio (only use profileImgs array)
    if (profileData['profileImgs']) updateData.profileImgs = profileData['profileImgs'] as string[];
    if (profileData['bio']) updateData.aboutMe = (profileData['bio'] as string).trim();
    if (profileData['gender']) updateData.gender = profileData['gender'] as string;

    // V2: Set role (single field)
    if (profileData['userType']) {
      updateData.role = mapUserTypeToRole(profileData['userType'] as string);
    }

    // V2: Build sports array
    const sports: SportProfile[] = [];

    if (profileData['sport']) {
      const primarySport = createSportProfile(profileData['sport'] as string, 0, {
        positions: profileData['positions'] as string[] | undefined,
        teamName: profileData['highSchool'] as string | undefined,
        teamType: profileData['highSchoolSuffix'] as string | undefined,
        city: profileData['city'] as string | undefined,
        state: profileData['state'] as string | undefined,
        teamLogo: profileData['teamLogo'] as string | undefined,
        teamColors: profileData['teamColors'] as string[] | undefined,
      });
      sports.push(primarySport);
    }

    if (profileData['secondarySport']) {
      const secondarySport = createSportProfile(profileData['secondarySport'] as string, 1);
      sports.push(secondarySport);
    }

    if (profileData['tertiarySport']) {
      const tertiarySport = createSportProfile(profileData['tertiarySport'] as string, 2);
      sports.push(tertiarySport);
    }

    if (sports.length > 0) {
      updateData.sports = sports;
      updateData.activeSportIndex = 0;
    }

    // V2: Build location object
    if (
      profileData['city'] ||
      profileData['state'] ||
      profileData['address'] ||
      profileData['zipCode']
    ) {
      updateData.location = {
        address: (profileData['address'] as string) || '',
        city: (profileData['city'] as string) || '',
        state: (profileData['state'] as string) || '',
        zipCode: (profileData['zipCode'] as string) || '',
        country: (profileData['country'] as string) || 'USA',
      };
    }

    // V2: Athlete-specific data
    if (profileData['classOf'] && updateData.role === 'athlete') {
      updateData.athlete = {
        ...currentUser?.athlete,
        classOf: Number(profileData['classOf']),
      };
    }

    // V2: Coach-specific data (coach, director, recruiter)
    const isCoachRole =
      (updateData.role as UserRole) === ('coach' as UserRole) ||
      (updateData.role as UserRole) === ('director' as UserRole) ||
      (updateData.role as UserRole) === ('recruiter' as UserRole);
    if (isCoachRole && (profileData['coachTitle'] || profileData['organization'])) {
      updateData.coach = {
        ...currentUser?.coach,
        title: profileData['coachTitle'] as string | undefined,
        organization: profileData['organization'] as string | undefined,
      };
    }

    // ============================================
    // MINIMAL LEGACY FIELDS (backward compatibility)
    // Note: primarySport NOT saved - derived from sports[0] in API response
    // ============================================
    if (profileData['highSchool']) updateData.highSchool = profileData['highSchool'] as string;
    if (profileData['state']) updateData.state = profileData['state'] as string;
    if (profileData['city']) updateData.city = profileData['city'] as string;
    if (profileData['organization'])
      updateData.organization = profileData['organization'] as string;

    // V2: Build social array from link sources (connected accounts)
    // Supports scoped links: scopeType = 'global' | 'sport' | 'team', scopeId = sport key or team ID
    const linkSources = profileData['linkSources'] as
      | {
          links?: Array<{
            platform?: string;
            connected?: boolean;
            connectionType?: string;
            username?: string;
            url?: string;
            scopeType?: string;
            scopeId?: string;
          }>;
        }
      | undefined;
    if (linkSources?.links && Array.isArray(linkSources.links)) {
      const existingSocial: UserSocialLink[] = Array.isArray(currentUser?.social)
        ? (currentUser.social as UserSocialLink[])
        : [];
      // Key social links by "platform" or "platform::scopeId" to support scoped entries
      const socialMap = new Map<string, UserSocialLink>();
      for (const link of existingSocial) {
        const key = (link as UserSocialLink & { scopeType?: string; scopeId?: string }).scopeId
          ? `${link.platform.toLowerCase()}::${(link as UserSocialLink & { scopeId?: string }).scopeId}`
          : link.platform.toLowerCase();
        socialMap.set(key, link);
      }
      let socialOrder = socialMap.size;
      for (const link of linkSources.links) {
        if (link.connected && link.platform) {
          const platform = link.platform.toLowerCase();
          const scope = link.scopeType ?? 'global';
          const scopeId = link.scopeId;
          const key = scopeId ? `${platform}::${scopeId}` : platform;
          const value = link.url ?? link.username ?? '';
          const existing = socialMap.get(key);
          socialMap.set(key, {
            platform,
            url: value.startsWith('http') ? value : `https://${platform}.com/${value}`,
            username: link.username,
            displayOrder: existing?.displayOrder ?? socialOrder++,
            verified: false,
            ...(scope !== 'global' && { scopeType: scope }),
            ...(scopeId && { scopeId }),
          } as UserSocialLink);
        }
      }
      if (socialMap.size > 0) {
        updateData.social = Array.from(socialMap.values());
      }
    }

    // Update user document
    try {
      await db.collection('Users').doc(userId).update(updateData);
      logger.debug('[POST /profile/onboarding] Firestore update successful');
    } catch (updateError) {
      logger.error('[POST /profile/onboarding] Firestore update FAILED:', { error: updateError });
      throw updateError;
    }

    // Invalidate Redis cache so GET /auth/profile/:userId returns fresh data
    await invalidateProfileCaches(userId).catch((err) =>
      logger.warn('[POST /profile/onboarding] Cache invalidation failed', { userId, err })
    );

    // Fetch updated user
    let userData: UserV2Document | undefined;
    try {
      const updatedUser = await db.collection('Users').doc(userId).get();
      userData = updatedUser.data() as UserV2Document | undefined;
      logger.debug('[POST /profile/onboarding] Fetched user:', {
        firstName: userData?.firstName,
        role: userData?.role,
      });
    } catch (fetchError) {
      logger.error('[POST /profile/onboarding] Fetch user FAILED:', { error: fetchError });
      throw fetchError;
    }

    logger.info('[POST /profile/onboarding] Success:', { userId, onboardingCompleted: true });

    res.json({
      success: true,
      user: {
        id: userId,
        firstName: userData?.firstName,
        lastName: userData?.lastName,
        role: userData?.role,
        onboardingCompleted: true,
        completeSignUp: true, // Legacy field for backward compat
        primarySport: getPrimarySport(userData?.sports) ?? userData?.primarySport,
      },
      redirectPath: '/home',
    });
  })
);

/**
 * POST /auth/profile/onboarding-step
 * Save individual onboarding step data incrementally
 *
 * V2 Implementation:
 * - Uses `role` field for role step
 * - Updates `sports[]` array for sport/positions steps
 * - Uses nested objects for location/contact/social
 * - Also writes legacy fields for backward compatibility
 */
router.post(
  '/profile/onboarding-step',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
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

    // Check if user exists and get current data
    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) {
      const error = notFoundError('user', userId);
      sendError(res, error);
      return;
    }

    const currentUser = userDoc.data() as UserV2Document | undefined;
    const now = new Date().toISOString();

    // Build V2 update data based on step type
    const updateData: Partial<UserV2Document> & { [key: string]: unknown } = {
      updatedAt: now,
      _schemaVersion: USER_SCHEMA_VERSION,
      [`onboardingProgress.${stepId}`]: {
        completed: true,
        completedAt: now,
      },
    };

    // Process step-specific data
    switch (stepId) {
      case 'role': {
        if (stepData['userType']) {
          // V2: Single role field (no boolean flags needed)
          updateData.role = mapUserTypeToRole(stepData['userType'] as string);
        }
        break;
      }

      case 'profile': {
        if (stepData['firstName']) updateData.firstName = (stepData['firstName'] as string).trim();
        if (stepData['lastName']) updateData.lastName = (stepData['lastName'] as string).trim();
        // Profile images (only use profileImgs array)
        if (stepData['profileImgs']) updateData.profileImgs = stepData['profileImgs'] as string[];
        if (stepData['bio']) updateData.aboutMe = (stepData['bio'] as string).trim();
        if (stepData['gender']) updateData.gender = stepData['gender'] as string;
        break;
      }

      case 'school': {
        // V2: Build/update location object
        const location: Location = {
          city: (stepData['city'] as string)?.trim() || currentUser?.location?.city || '',
          state: (stepData['state'] as string)?.trim() || currentUser?.location?.state || '',
          country: 'USA',
        };
        updateData.location = location;

        // V2: Update team info in sports array if exists
        if (currentUser?.sports && currentUser.sports.length > 0) {
          const updatedSports = [...currentUser.sports];
          const currentTeam = updatedSports[0]?.team;
          updatedSports[0] = {
            ...updatedSports[0],
            team: {
              ...currentTeam,
              name: (stepData['highSchool'] as string)?.trim() || currentTeam?.name,
              type:
                ((stepData['highSchoolSuffix'] as string)?.toLowerCase() as
                  | 'high-school'
                  | 'club') ||
                currentTeam?.type ||
                'high-school',
            },
          };
          updateData.sports = updatedSports;
        }

        // V2: Update athlete classOf
        if (stepData['classOf'] && !isNaN(Number(stepData['classOf']))) {
          updateData.athlete = {
            ...currentUser?.athlete,
            classOf: Number(stepData['classOf']),
          };
        }
        // Note: School/location data is in location{} and sports[].team{}
        break;
      }

      case 'organization': {
        // V2: Update coach data
        updateData.coach = {
          ...currentUser?.coach,
          organization: (stepData['organization'] as string)?.trim(),
          title: (stepData['coachTitle'] as string)?.trim(),
        };

        // V2: Update location
        if (stepData['city'] || stepData['state']) {
          updateData.location = {
            city: (stepData['city'] as string)?.trim() || currentUser?.location?.city || '',
            state: (stepData['state'] as string)?.trim() || currentUser?.location?.state || '',
            country: 'USA',
          };
        }
        // Note: Coach data is in coach{} and location{} objects
        break;
      }

      case 'sport': {
        const primarySportName = (stepData['primarySport'] as string)?.trim();
        const secondarySportName = (stepData['secondarySport'] as string)?.trim();

        // V2: Build sports array
        const sports: SportProfile[] = [];

        if (primarySportName) {
          // Preserve existing positions and team data if available
          const existingPrimary = currentUser?.sports?.find((s) => s.order === 0);
          sports.push(
            createSportProfile(primarySportName, 0, {
              positions: existingPrimary?.positions,
              teamName: existingPrimary?.team?.name ?? currentUser?.highSchool,
              teamType: existingPrimary?.team?.type,
              city: currentUser?.location?.city ?? currentUser?.city,
              state: currentUser?.location?.state ?? currentUser?.state,
            })
          );
        }

        if (secondarySportName) {
          const existingSecondary = currentUser?.sports?.find((s) => s.order === 1);
          sports.push(
            createSportProfile(secondarySportName, 1, {
              positions: existingSecondary?.positions,
            })
          );
        }

        if (sports.length > 0) {
          updateData.sports = sports;
          updateData.activeSportIndex = 0;

          // Minimal legacy: Keep primarySport for backward compat
          if (primarySportName) {
            updateData.primarySport = primarySportName;
          }
        }
        break;
      }

      case 'positions': {
        const positions = Array.isArray(stepData['positions'])
          ? (stepData['positions'] as string[]).slice(0, 10)
          : [];

        // V2: Update positions in sports array
        if (currentUser?.sports && currentUser.sports.length > 0) {
          const updatedSports = [...currentUser.sports];
          updatedSports[0] = {
            ...updatedSports[0],
            positions,
          };
          updateData.sports = updatedSports;
        } else if (positions.length > 0) {
          // Create sport entry if none exists (shouldn't happen in normal flow)
          const sportName = currentUser?.primarySport ?? 'unknown';
          updateData.sports = [createSportProfile(sportName, 0, { positions })];
          updateData.activeSportIndex = 0;
        }
        // Note: No legacy primarySportPositions - use sports[0].positions
        break;
      }

      case 'contact': {
        // V2: Build contact object
        const contact: ContactInfo = {
          email:
            (stepData['contactEmail'] as string)?.toLowerCase() ||
            currentUser?.contact?.email ||
            currentUser?.email ||
            '',
          phone: (stepData['phoneNumber'] as string)?.trim() || currentUser?.contact?.phone,
        };
        updateData.contact = contact;

        // V2: Build social array (agnostic — supports any platform)
        const existingSocial: UserSocialLink[] = Array.isArray(currentUser?.social)
          ? (currentUser.social as UserSocialLink[])
          : [];

        // Map onboarding step fields → platform entries
        const onboardingLinks: Array<{ platform: string; value: string | undefined }> = [
          { platform: 'instagram', value: (stepData['instagram'] as string)?.trim() },
          { platform: 'twitter', value: (stepData['twitter'] as string)?.trim() },
          { platform: 'tiktok', value: (stepData['tiktok'] as string)?.trim() },
          { platform: 'hudl', value: (stepData['hudlAccountLink'] as string)?.trim() },
          { platform: 'youtube', value: (stepData['youtubeAccountLink'] as string)?.trim() },
        ];

        // Merge: new values override existing entries for the same platform
        const socialMap = new Map<string, UserSocialLink>();
        for (const link of existingSocial) {
          socialMap.set(link.platform.toLowerCase(), link);
        }
        let order = socialMap.size;
        for (const { platform, value } of onboardingLinks) {
          if (value) {
            const existing = socialMap.get(platform);
            socialMap.set(platform, {
              platform,
              url: value.startsWith('http') ? value : `https://${platform}.com/${value}`,
              username: value.startsWith('http') ? undefined : value,
              displayOrder: existing?.displayOrder ?? order++,
              verified: false,
            });
          }
        }
        const social: UserSocialLink[] = Array.from(socialMap.values());
        updateData.social = social;
        // Note: No legacy flat fields - use contact{} and social{} objects
        break;
      }

      case 'referral-source': {
        updateData['showedHearAbout'] = true;
        break;
      }

      case 'link-sources': {
        // V2: Build social array from connected link sources
        const existingSocial: UserSocialLink[] = Array.isArray(currentUser?.social)
          ? (currentUser.social as UserSocialLink[])
          : [];

        const links = Array.isArray(stepData['links'])
          ? (stepData['links'] as Array<{
              platform?: string;
              connected?: boolean;
              username?: string;
              url?: string;
              connectionType?: string;
              scopeType?: string;
              scopeId?: string;
            }>)
          : [];

        // Key by "platform" or "platform::scopeId" to support scoped entries
        const socialMap = new Map<string, UserSocialLink>();
        for (const link of existingSocial) {
          const k = (link as UserSocialLink & { scopeId?: string }).scopeId
            ? `${link.platform.toLowerCase()}::${(link as UserSocialLink & { scopeId?: string }).scopeId}`
            : link.platform.toLowerCase();
          socialMap.set(k, link);
        }
        let linkOrder = socialMap.size;
        for (const link of links) {
          if (link.connected && link.platform) {
            const platform = link.platform.toLowerCase();
            const key = link.scopeId ? `${platform}::${link.scopeId}` : platform;
            const value = link.url ?? link.username ?? '';
            const existing = socialMap.get(key);
            socialMap.set(key, {
              platform,
              url: value.startsWith('http') ? value : `https://${platform}.com/${value}`,
              username: link.username,
              displayOrder: existing?.displayOrder ?? linkOrder++,
              verified: false,
              ...(link.scopeType && link.scopeType !== 'global'
                ? { scopeType: link.scopeType, scopeId: link.scopeId }
                : {}),
            } as UserSocialLink);
          }
        }
        if (socialMap.size > 0) {
          updateData.social = Array.from(socialMap.values());
        }
        break;
      }

      default: {
        // For unknown steps, save raw data under onboardingSteps
        updateData[`onboardingSteps.${stepId}`] = stepData;
      }
    }

    // Update user document
    await db.collection('Users').doc(userId).update(updateData);

    // Invalidate Redis cache so GET /auth/profile/:userId returns fresh data
    await invalidateProfileCaches(userId).catch((err) =>
      logger.warn('[POST /profile/onboarding-step] Cache invalidation failed', { userId, err })
    );

    res.json({
      success: true,
      stepId,
      savedFields: Object.keys(updateData).filter(
        (k) => !k.startsWith('onboardingProgress') && k !== 'updatedAt' && k !== '_schemaVersion'
      ),
    });
  })
);

/**
 * POST /auth/profile/complete-onboarding
 * Mark user's onboarding as complete
 *
 * V2 Implementation:
 * - Sets `onboardingCompleted: true` (V2 field)
 * - Also sets `completeSignUp: true` (legacy field)
 * - Returns V2 formatted response
 */
router.post(
  '/profile/complete-onboarding',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId } = req.body as { userId: string };

    if (!userId) {
      const error = validationError([
        { field: 'userId', message: 'User ID is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    const now = new Date().toISOString();

    // Update user document to mark onboarding complete (V2 only)
    await db.collection('Users').doc(userId).update({
      onboardingCompleted: true,
      onboardingCompletedAt: now,
      _schemaVersion: USER_SCHEMA_VERSION,
      updatedAt: now,
    });

    // Invalidate Redis cache so GET /auth/profile/:userId returns fresh data
    await invalidateProfileCaches(userId).catch((err) =>
      logger.warn('[POST /profile/complete-onboarding] Cache invalidation failed', { userId, err })
    );

    // Fetch updated user data
    const updatedUser = await db.collection('Users').doc(userId).get();
    const userData = updatedUser.data() as UserV2Document | undefined;

    res.json({
      success: true,
      user: {
        id: userId,
        firstName: userData?.firstName,
        lastName: userData?.lastName,
        role: userData?.role,
        onboardingCompleted: true,
        primarySport: getPrimarySport(userData?.sports) ?? userData?.primarySport,
      },
      redirectPath: '/explore',
    });
  })
);

/**
 * POST /auth/analytics/hear-about
 * Save referral source ("How did you hear about us")
 *
 * @body userId - User ID
 * @body source - Referral source (e.g., 'social-media', 'friend', 'coach')
 * @body details - Optional additional details
 * @body clubName - Optional club name
 * @body otherSpecify - Optional custom source description
 */
router.post(
  '/analytics/hear-about',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId, source, details, clubName, otherSpecify } = req.body as {
      userId: string;
      source: string;
      details?: string;
      clubName?: string;
      otherSpecify?: string;
    };

    if (!userId?.trim() || !source?.trim()) {
      const error = validationError([
        ...(!userId?.trim()
          ? [{ field: 'userId', message: 'User ID is required', rule: 'required' }]
          : []),
        ...(!source?.trim()
          ? [{ field: 'source', message: 'Source is required', rule: 'required' }]
          : []),
      ]);
      sendError(res, error);
      return;
    }

    const now = new Date();
    const nowISO = now.toISOString();

    // Create HearAbout document
    const hearAboutData: Record<string, unknown> = {
      userId: userId.trim(),
      source: source.trim(),
      timestamp: now,
      createdAt: nowISO,
    };

    if (details?.trim()) hearAboutData['details'] = details.trim();
    if (clubName?.trim()) hearAboutData['clubName'] = clubName.trim();
    if (otherSpecify?.trim()) hearAboutData['otherSpecify'] = otherSpecify.trim();

    const hearAboutRef = await db.collection('HearAbout').add(hearAboutData);

    // Update user document with referral source
    await db
      .collection('Users')
      .doc(userId.trim())
      .update({
        referralSource: source.trim(),
        referralDetails: details?.trim() ?? null,
        updatedAt: nowISO,
      });

    res.json({
      success: true,
      id: hearAboutRef.id,
    });
  })
);

/**
 * Microsoft Custom Token for Mobile
 *
 * Validates Microsoft MSAL tokens from mobile app and creates Firebase custom token.
 * This allows native MSAL authentication to work with Firebase Auth.
 *
 * POST /auth/microsoft/custom-token
 * Body: { idToken: string, accessToken: string }
 * Returns: { firebaseToken: string }
 */
router.post(
  '/microsoft/custom-token',
  asyncHandler(async (req: Request, res: Response) => {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      const error = validationError([
        { field: 'idToken', message: 'Missing or invalid ID token', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    logger.debug('[Microsoft Custom Token] Processing Microsoft token');

    try {
      // Decode ID token to get user info (basic validation)
      const base64Url = idToken.split('.')[1];
      if (!base64Url) {
        throw new Error('Invalid token format');
      }

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString());

      const microsoftUid = payload.sub || payload.oid;
      const email = payload.preferred_username || payload.email;
      const name = payload.name;

      if (!microsoftUid || !email) {
        const error = validationError([
          { field: 'idToken', message: 'Invalid token: missing user info', rule: 'invalid' },
        ]);
        sendError(res, error);
        return;
      }

      logger.debug('[Microsoft Custom Token] Token decoded', { email, name });

      // Create deterministic Firebase UID
      const firebaseUid = `microsoft_${microsoftUid}`;

      // Check if user exists, create if not
      try {
        await req.firebase!.auth.getUser(firebaseUid);
      } catch (error: unknown) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'auth/user-not-found'
        ) {
          logger.debug('[Microsoft Custom Token] Creating new Firebase user');
          await req.firebase!.auth.createUser({
            uid: firebaseUid,
            email: email,
            displayName: name,
            emailVerified: true,
          });
        } else {
          throw error;
        }
      }

      // Create Firebase custom token
      const firebaseToken = await req.firebase!.auth.createCustomToken(firebaseUid, {
        provider: 'microsoft.com',
        email: email,
        name: name,
      });

      logger.info('[Microsoft Custom Token] Success', { uid: firebaseUid, email });

      res.json({ firebaseToken });
    } catch (error: unknown) {
      logger.error('[Microsoft Custom Token] Error', { error });
      const validError = validationError([
        { field: 'idToken', message: 'Failed to process Microsoft token', rule: 'invalid' },
      ]);
      sendError(res, validError);
    }
  })
);

// ============================================
// UNICODE GENERATION
// ============================================

/**
 * POST /auth/generate-unicode
 *
 * Manually generate unicode for authenticated user.
 * Useful for:
 * - Existing users created before Cloud Function
 * - Retry if Cloud Function failed
 * - Manual admin generation
 *
 * NOTE: Normally unicode is auto-generated by Cloud Function onUserCreated.
 * This endpoint is a fallback/manual option.
 */
router.post(
  '/generate-unicode',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;

    if (!user?.uid) {
      return sendError(res, unauthorizedError('missing'));
    }

    const userId = user.uid;
    const db = req.firebase!.db;

    logger.info('[Unicode] Manual generation requested', { userId });

    // Check if user already has unicode
    const existingUnicode = await getUserUnicode(db, userId);
    if (existingUnicode) {
      logger.info('[Unicode] User already has unicode', { userId, unicode: existingUnicode });
      return res.status(200).json({
        success: true,
        unicode: existingUnicode,
        message: 'Unicode already exists',
      });
    }

    try {
      // Generate new unicode
      const unicode = await generateUnicodeForUser(db, userId);

      logger.info('[Unicode] Manual generation successful', { userId, unicode });

      return res.status(200).json({
        success: true,
        unicode,
        message: 'Unicode generated successfully',
      });
    } catch (error) {
      logger.error('[Unicode] Manual generation failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      return sendError(res, internalError(error));
    }
  })
);

/**
 * GET /auth/unicode
 *
 * Get current user's unicode
 */
router.get(
  '/unicode',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;

    if (!user?.uid) {
      return sendError(res, unauthorizedError('missing'));
    }

    const userId = user.uid;
    const db = req.firebase!.db;

    const unicode = await getUserUnicode(db, userId);

    if (!unicode) {
      logger.warn('[Unicode] User has no unicode', { userId });
      return res.status(404).json({
        success: false,
        message: 'Unicode not found. Please generate one.',
      });
    }

    return res.status(200).json({
      success: true,
      unicode,
    });
  })
);

// ============================================
// PROFILE ROUTES
// ============================================
// Mounted early so profileRoutes handles all /auth/profile/* requests
// (GET /:userId, GET /username/:username, GET /search, PUT, POST, DELETE)
// with Redis caching (MEDIUM_TTL = 15 min via PROFILE_CACHE_KEYS).
router.use('/profile', profileRoutes);

export default router;
