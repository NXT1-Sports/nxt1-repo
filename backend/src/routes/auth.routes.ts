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
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import type {
  ValidateTeamCodeResponse,
  CreateUserRequest,
  TeamTypeApi,
  UserRole,
  SportProfile,
  Location,
  ContactInfo,
  ConnectedEmail,
} from '@nxt1/core';
import { RosterEntryStatus, RosterRole } from '@nxt1/core/models';
import { isValidTeamCode, USER_SCHEMA_VERSION } from '@nxt1/core';
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

import { enqueueWelcomeGraphic } from '../services/agent-welcome.service.js';
import { enqueueLinkedAccountScrape } from '../services/agent-scrape.service.js';
import * as teamCodeService from '../services/team-code.service.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  CreateUserDto,
  JoinTeamDto,
  ConnectGmailDto,
  ConnectMicrosoftDto,
  ConnectYahooDto,
} from '../dtos/auth.dto.js';
import { createOrganizationService } from '../services/organization.service.js';
import { createRosterEntryService } from '../services/roster-entry.service.js';
import { normalizeProgramName } from '../services/name-normalizer.service.js';

// Import profile routes
import profileRoutes, { invalidateProfileCaches } from './profile.routes.js';
import { appGuard } from '../middleware/auth.middleware.js';

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

  // Connected sources (all platforms - social, film, stats, recruiting)
  connectedSources?: ConnectedSourceRecord[];

  classOf?: number;

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

  // Connected email accounts for campaigns/outreach.
  // SECURITY: Only metadata (ConnectedEmail) is stored here.
  // OAuth tokens live in: Users/{uid}/emailTokens/{provider} (subcollection).
  // Firestore rules restrict that subcollection to backend/Functions only.
  connectedEmails?: ConnectedEmail[];

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

interface ConnectedSourceRecord {
  platform: string;
  profileUrl: string;
  faviconUrl?: string;
  syncStatus: 'idle';
  scopeType?: string;
  scopeId?: string;
  displayOrder?: number;
}

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

function clearLegacyLocationFields(target: Record<string, unknown>): void {
  target['city'] = FieldValue.delete();
  target['state'] = FieldValue.delete();
}

function sanitizeStoredTeam(
  team?: SportProfile['team'] | SportProfile['clubTeam']
): SportProfile['team'] | SportProfile['clubTeam'] | undefined {
  if (!team?.type) return undefined;

  return {
    type: team.type,
    ...(team.name ? { name: team.name } : {}),
    ...(team.organizationId ? { organizationId: team.organizationId } : {}),
    ...(team.teamId ? { teamId: team.teamId } : {}),
  };
}

function sanitizeSportsForStorage(sports?: SportProfile[]): SportProfile[] | undefined {
  if (!Array.isArray(sports)) return undefined;

  return sports.map((sport) => ({
    ...sport,
    ...(sport.team ? { team: sanitizeStoredTeam(sport.team) } : {}),
    ...(sport.clubTeam ? { clubTeam: sanitizeStoredTeam(sport.clubTeam) } : {}),
  }));
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
    positions: options?.positions ?? [],
    team: {
      type: teamType,
      name: '',
    },
  };

  if (options?.teamName || options?.teamType) {
    profile.team = {
      type: teamType,
      name: options?.teamName || '',
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

type ProgramType = 'high-school' | 'middle-school' | 'club' | 'college' | 'juco' | 'organization';

interface OnboardingProgramSelection {
  id: string;
  name?: string;
  teamType?: string;
  location?: string;
  isDraft?: boolean;
  organizationId?: string;
}

function normalizeProgramType(value?: string): ProgramType {
  const normalized = (value ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'high-school':
    case 'middle-school':
    case 'club':
    case 'college':
    case 'juco':
    case 'organization':
      return normalized;
    case 'school':
      return 'high-school';
    default:
      return 'organization';
  }
}

function normalizeTeamType(value?: string): TeamTypeApi {
  const programType = normalizeProgramType(value);
  return programType;
}

function parseLocationLabel(location?: string): {
  city?: string;
  state?: string;
} {
  if (!location?.trim()) {
    return {};
  }

  const [cityRaw, stateRaw] = location.split(',').map((part) => part.trim());
  const city = cityRaw || undefined;
  const state = stateRaw || undefined;
  return { city, state };
}

async function generateUniqueTeamCode(db: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { team } = await teamCodeService.getTeamCodeByCode(db, candidate, false);
    if (!team) {
      return candidate;
    }
  }

  return `${Date.now().toString(36).slice(-6)}`.toUpperCase();
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
        sport: (data?.['sport'] as string) || (data?.['sportName'] as string),
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
  validateBody(CreateUserDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { uid, email, teamCode, referralId } = req.body;

    logger.debug('[NXT1-REPO BACKEND] Create user request:', {
      uid: uid?.substring(0, 8) + '...',
      email,
      teamCode: teamCode ?? 'none',
      referralId: referralId ?? 'none',
      timestamp: new Date().toISOString(),
      backend: 'nxt1-repo',
      port: process.env['PORT'] ?? 3000,
    });

    const sanitizedEmail = email.toLowerCase().trim();

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

    // Note: The personalized AI welcome graphic is enqueued after onboarding
    // completes (POST /profile/onboarding) when we have role, sport, and name.

    res.status(201).json(responseData);
  })
);

/**
 * POST /auth/join-team
 * Join a team using a team code (for users who signed up without one)
 */
router.post(
  '/join-team',
  validateBody(JoinTeamDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId, code } = req.body;

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

    const incomingContact = profileData['contact'] as ContactInfo | undefined;
    const contactEmail =
      incomingContact?.email?.trim().toLowerCase() ||
      (profileData['contactEmail'] as string | undefined)?.trim().toLowerCase() ||
      (profileData['email'] as string | undefined)?.trim().toLowerCase() ||
      '';
    const contactPhone =
      incomingContact?.phone?.trim() ||
      (profileData['phoneNumber'] as string | undefined)?.trim() ||
      '';

    const mergedContactEmail =
      contactEmail ||
      currentUser?.contact?.email?.trim().toLowerCase() ||
      currentUser?.email?.trim().toLowerCase() ||
      '';
    const mergedContactPhone = contactPhone || currentUser?.contact?.phone?.trim() || undefined;

    if (mergedContactEmail || mergedContactPhone) {
      updateData.contact = {
        email: mergedContactEmail,
        ...(mergedContactPhone ? { phone: mergedContactPhone } : {}),
      };
    }

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

    if (Array.isArray(profileData['sports']) && profileData['sports'].length > 0) {
      const sportsData = profileData['sports'] as Array<{
        sport: string;
        isPrimary?: boolean;
        positions?: string[];
        team?: {
          name?: string;
          type?: string;
          city?: string;
          state?: string;
        };
      }>;

      sportsData.forEach((sportData, index) => {
        const sportProfile = createSportProfile(sportData.sport, index, {
          positions: sportData.positions,
          teamName: sportData.team?.name,
          teamType: sportData.team?.type,
          city: sportData.team?.city,
          state: sportData.team?.state,
        });
        sports.push(sportProfile);
      });
    } else if (profileData['sport']) {
      const primarySport = createSportProfile(profileData['sport'] as string, 0, {
        positions: profileData['positions'] as string[] | undefined,
        teamName: profileData['highSchool'] as string | undefined,
        teamType: profileData['highSchoolSuffix'] as string | undefined,
        city: profileData['city'] as string | undefined,
        state: profileData['state'] as string | undefined,
      });
      sports.push(primarySport);

      if (profileData['secondarySport']) {
        const secondarySport = createSportProfile(profileData['secondarySport'] as string, 1);
        sports.push(secondarySport);
      }

      if (profileData['tertiarySport']) {
        const tertiarySport = createSportProfile(profileData['tertiarySport'] as string, 2);
        sports.push(tertiarySport);
      }
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
      clearLegacyLocationFields(updateData as Record<string, unknown>);
    }

    // V2: Class year (Athlete)
    if (profileData['classOf'] && updateData.role === 'athlete') {
      updateData.classOf = Number(profileData['classOf']);
    }

    // V2: Coach-specific data (coach, director, recruiter)
    const isCoachRole =
      (updateData.role as UserRole) === ('coach' as UserRole) ||
      (updateData.role as UserRole) === ('director' as UserRole) ||
      (updateData.role as UserRole) === ('recruiter' as UserRole);
    if (isCoachRole && (profileData['coachTitle'] || profileData['organization'])) {
      updateData.coach = {
        ...currentUser?.coach,
        ...(profileData['coachTitle'] != null && { title: profileData['coachTitle'] as string }),
        ...(profileData['organization'] != null && {
          organization: profileData['organization'] as string,
        }),
      };
    }

    // ============================================
    // MINIMAL LEGACY FIELDS (backward compatibility)
    // Note: primarySport NOT saved - derived from sports[0] in API response
    // ============================================
    if (profileData['highSchool']) updateData.highSchool = profileData['highSchool'] as string;
    if (profileData['organization'])
      updateData.organization = profileData['organization'] as string;

    // ============================================
    // PROGRAM + TEAM + ROSTER CREATION (Ghost flow)
    // ============================================
    const createdTeamIds: string[] = [];
    const organizationService = createOrganizationService(db);
    const rosterEntryService = createRosterEntryService(db);

    const createTeamProfile =
      (profileData['createTeamProfile'] as
        | {
            programName?: string;
            teamType?: string;
            mascot?: string;
            state?: string;
            city?: string;
          }
        | undefined) ?? undefined;

    const teamSelection =
      (profileData['teamSelection'] as
        | {
            teams?: OnboardingProgramSelection[];
          }
        | undefined) ?? undefined;

    const role = mapUserTypeToRole(
      (profileData['userType'] as string) || (currentUser?.role as string) || 'athlete'
    );

    const selectedPrograms: OnboardingProgramSelection[] = Array.isArray(teamSelection?.teams)
      ? [...teamSelection.teams]
      : [];

    if (selectedPrograms.length === 0 && createTeamProfile?.programName?.trim()) {
      selectedPrograms.push({
        id: `draft_${Date.now().toString(36)}`,
        name: createTeamProfile.programName,
        teamType: createTeamProfile.teamType,
        isDraft: true,
      });
    }

    const selectedSports = sports.map((sport) => sport.sport).filter(Boolean);
    const sportsToCreate = selectedSports.length > 0 ? selectedSports : ['basketball'];
    const creatorFirstName = updateData.firstName ?? currentUser?.firstName ?? '';
    const creatorLastName = updateData.lastName ?? currentUser?.lastName ?? '';
    const creatorName = [creatorFirstName, creatorLastName].filter(Boolean).join(' ') || undefined;
    const creatorEmail =
      updateData.contact?.email?.trim().toLowerCase() ||
      currentUser?.contact?.email?.trim().toLowerCase() ||
      currentUser?.email?.trim().toLowerCase() ||
      undefined;
    const creatorPhoneNumber =
      updateData.contact?.phone?.trim() || currentUser?.contact?.phone?.trim() || undefined;

    const programsWithIds: Array<{
      organizationId: string;
      name: string;
      teamType: TeamTypeApi;
      city?: string;
      state?: string;
      isGhost: boolean;
    }> = [];

    for (const program of selectedPrograms) {
      const isDraftProgram = Boolean(program.isDraft) || program.id.startsWith('draft_');
      const rawName = program.name?.trim() ?? '';
      if (!rawName && isDraftProgram) {
        continue;
      }

      const parsedLocation = parseLocationLabel(program.location);
      const state =
        parsedLocation.state || createTeamProfile?.state || updateData.location?.state || '';
      const city =
        parsedLocation.city || createTeamProfile?.city || updateData.location?.city || '';
      const teamType = normalizeTeamType(program.teamType || createTeamProfile?.teamType);

      if (isDraftProgram) {
        try {
          const normalizedName = await normalizeProgramName(rawName);
          const org = await organizationService.createOrganization({
            name: normalizedName,
            type: normalizeProgramType(program.teamType || createTeamProfile?.teamType),
            // Athletes who trigger ghost-org creation during onboarding are NOT owners.
            // Coaches and directors are owners; their ownerId is recorded.
            ownerId: role !== 'athlete' ? userId : '',
            skipAdmins: role === 'athlete',
            location: {
              address: '',
              city,
              state,
              zipCode: '',
              country: 'USA',
            },
            mascot: createTeamProfile?.mascot,
            isClaimed: false,
            source: 'user_generated',
          });

          if (role === 'coach') {
            await organizationService.addAdmin({
              organizationId: org.id!,
              userId,
              role: 'admin',
              addedBy: userId,
            });
          }

          programsWithIds.push({
            organizationId: org.id!,
            name: org.name,
            teamType,
            city,
            state,
            isGhost: true,
          });

          logger.info('[POST /profile/onboarding] Created ghost program', {
            organizationId: org.id,
            name: org.name,
          });
        } catch (err) {
          logger.error('[POST /profile/onboarding] Failed to create ghost program', {
            error: err,
            name: rawName,
          });
        }
      } else {
        const organizationId = program.organizationId || program.id;
        if (!organizationId) {
          continue;
        }

        programsWithIds.push({
          organizationId,
          name: rawName || 'Program',
          teamType,
          city,
          state,
          isGhost: false,
        });

        if (role === 'coach') {
          try {
            await organizationService.addAdmin({
              organizationId,
              userId,
              role: 'admin',
              addedBy: userId,
            });
          } catch (err) {
            logger.warn('[POST /profile/onboarding] Failed to add coach as org admin', {
              organizationId,
              error: err,
            });
          }
        }
      }
    }

    // Track resolved sport → { teamId, organizationId } for backfilling User.sports[].team
    const sportTeamMap = new Map<
      string,
      { teamId: string; organizationId: string; orgName: string }
    >();

    for (const program of programsWithIds) {
      for (const sportName of sportsToCreate) {
        try {
          let existingTeamSnapshot = await db
            .collection('Teams')
            .where('organizationId', '==', program.organizationId)
            .where('sport', '==', sportName)
            .where('isActive', '==', true)
            .limit(1)
            .get();

          if (existingTeamSnapshot.empty) {
            existingTeamSnapshot = await db
              .collection('Teams')
              .where('organizationId', '==', program.organizationId)
              .where('sportName', '==', sportName)
              .where('isActive', '==', true)
              .limit(1)
              .get();
          }

          let teamId: string;

          if (!existingTeamSnapshot.empty) {
            const existingDoc = existingTeamSnapshot.docs[0];
            if (!existingDoc) {
              continue;
            }
            teamId = existingDoc.id;

            const existingData = existingDoc.data() as Record<string, unknown>;
            const needsSportMigration =
              existingData['sport'] !== sportName ||
              Object.prototype.hasOwnProperty.call(existingData, 'sportName');

            if (needsSportMigration) {
              await db.collection('Teams').doc(teamId).set(
                {
                  sport: sportName,
                  sportName: FieldValue.delete(),
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          } else {
            const teamCode = await generateUniqueTeamCode(db);
            const teamName = program.name.trim();

            const team = await teamCodeService.createTeamCode(db, {
              teamCode,
              teamName,
              teamType: program.teamType,
              sport: sportName,
              createdBy: userId,
              // Pass the creator's role so athletes get role: 'Athlete' in team.members,
              // not the default 'Administrative' fallback.
              creatorRole: role as 'athlete' | 'coach' | 'director' | 'media',
              creatorName,
              creatorEmail,
              creatorPhoneNumber,
            });

            if (!team.id) {
              throw new Error('Created team is missing an id');
            }

            await db.collection('Teams').doc(team.id).update({
              organizationId: program.organizationId,
              isClaimed: false,
              source: 'user_generated',
              sport: sportName,
              sportName: FieldValue.delete(),
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            });

            await organizationService.incrementTeamCount(program.organizationId).catch(() => {
              logger.warn('[POST /profile/onboarding] Failed to increment org team count', {
                organizationId: program.organizationId,
              });
            });

            teamId = team.id;
            createdTeamIds.push(team.id);
            logger.info('[POST /profile/onboarding] Created ghost sport team', {
              teamId,
              organizationId: program.organizationId,
              sportName,
            });
          }

          const rosterRole =
            role === 'director'
              ? RosterRole.OWNER
              : role === 'coach'
                ? RosterRole.HEAD_COACH
                : RosterRole.ATHLETE;

          const rosterStatus =
            role === 'director' ? RosterEntryStatus.ACTIVE : RosterEntryStatus.PENDING;

          try {
            await rosterEntryService.createRosterEntry({
              userId,
              teamId,
              organizationId: program.organizationId,
              role: rosterRole,
              status: rosterStatus,
              firstName: updateData.firstName ?? currentUser?.firstName ?? '',
              lastName: updateData.lastName ?? currentUser?.lastName ?? '',
              email: creatorEmail ?? '',
              profileImg: updateData.profileImgs?.[0] ?? currentUser?.profileImgs?.[0] ?? '',
              classOf: updateData.classOf ?? currentUser?.classOf,
            });
          } catch (err) {
            logger.warn('[POST /profile/onboarding] Failed to create roster entry', {
              userId,
              teamId,
              error: err,
            });
          }

          // Track the resolved sport→team→org mapping for backfilling User.sports[].team
          if (!sportTeamMap.has(sportName.toLowerCase())) {
            sportTeamMap.set(sportName.toLowerCase(), {
              teamId,
              organizationId: program.organizationId,
              orgName: program.name,
            });
          }
        } catch (err) {
          logger.error('[POST /profile/onboarding] Failed sport team pipeline step', {
            organizationId: program.organizationId,
            sportName,
            error: err,
          });
        }
      }
    }

    // Backfill User.sports[].team with relational IDs from resolved teams.
    // The profile hydration service uses these IDs to overlay LIVE Organization
    // branding (logo, colors) at read time — no snapshot branding is stored.
    if (sportTeamMap.size > 0 && Array.isArray(updateData.sports)) {
      for (const sport of updateData.sports) {
        const sportKey = (sport.sport ?? '').toLowerCase();
        const resolved = sportTeamMap.get(sportKey);
        if (resolved && sport.team) {
          sport.team.organizationId = resolved.organizationId;
          sport.team.teamId = resolved.teamId;
          // Update team name to match the resolved organization name
          if (resolved.orgName) {
            sport.team.name = resolved.orgName;
          }
        }
      }
      logger.info('[POST /profile/onboarding] Backfilled sports[].team with relational IDs', {
        sportCount: sportTeamMap.size,
        sports: [...sportTeamMap.keys()],
      });
    }

    // V2: Build social[] and connectedSources[] from link sources
    // Social platforms (instagram, twitter, etc.) → social[]
    // Data platforms (hudl, maxpreps, 247sports, etc.) → connectedSources[]
    const teamConnectedSources: ConnectedSourceRecord[] = [];
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
      // --- Connected sources (ALL platforms) ---
      const existingConnected: ConnectedSourceRecord[] = Array.isArray(
        currentUser?.connectedSources
      )
        ? currentUser.connectedSources
        : [];
      const connectedMap = new Map<string, ConnectedSourceRecord>();
      for (const cs of existingConnected) {
        const key = cs.scopeId ? `${cs.platform}::${cs.scopeId}` : cs.platform;
        connectedMap.set(key, cs);
      }

      let displayOrder = 0;
      for (const link of linkSources.links) {
        if (link.connected && link.platform) {
          const platform = link.platform.toLowerCase();
          const scope = link.scopeType ?? 'global';
          const scopeId = link.scopeId;
          const key = scopeId ? `${platform}::${scopeId}` : platform;
          const value = link.url ?? link.username ?? '';
          const url = value.startsWith('http')
            ? value
            : value
              ? `https://${platform}.com/${value}`
              : '';

          // V2: All platforms (social + data) → connectedSources[]
          const sourceInfo: ConnectedSourceRecord = {
            platform,
            profileUrl: url,
            syncStatus: 'idle',
            displayOrder: connectedMap.get(key)?.displayOrder ?? displayOrder++,
            ...(scope !== 'global' && { scopeType: scope }),
            ...(scopeId && { scopeId }),
          };

          // Only store on team if a privileged role (coach/director) created the team.
          // Athletes' connected sources belong on the user doc, not the team.
          const isPrivilegedRole = role === 'coach' || role === 'director';
          if (createdTeamIds.length > 0 && isPrivilegedRole) {
            teamConnectedSources.push(sourceInfo);
          } else {
            connectedMap.set(key, sourceInfo);
          }
        }
      }
      if (connectedMap.size > 0) {
        (updateData as Record<string, unknown>)['connectedSources'] = Array.from(
          connectedMap.values()
        );
      }
    }

    if (createdTeamIds.length > 0 && teamConnectedSources.length > 0) {
      try {
        await Promise.all(
          createdTeamIds.map((teamId) =>
            db.collection('Teams').doc(teamId).update({
              connectedSources: teamConnectedSources,
            })
          )
        );
      } catch (err) {
        logger.error(
          '[POST /profile/onboarding] Failed to update Team linked sources:',
          err as Record<string, unknown>
        );
      }
    }

    // Update user document
    try {
      if (Array.isArray(updateData.sports)) {
        updateData.sports = sanitizeSportsForStorage(updateData.sports);
      }

      await db.collection('Users').doc(userId).update(updateData);
      logger.debug('[POST /profile/onboarding] Firestore update successful');
    } catch (updateError) {
      const err = updateError instanceof Error ? updateError : new Error(String(updateError));
      logger.error('[POST /profile/onboarding] Firestore update FAILED:', {
        error: err.message,
        stack: err.stack,
      });
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
      const err = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      logger.error('[POST /profile/onboarding] Fetch user FAILED:', {
        error: err.message,
        stack: err.stack,
      });
      throw fetchError;
    }

    logger.info('[POST /profile/onboarding] Success:', { userId, onboardingCompleted: true });

    // Fire-and-forget: enqueue personalized AI welcome graphic via Agent X
    const primarySportName = getPrimarySport(userData?.sports) ?? userData?.primarySport;
    const primarySportProfile = userData?.sports?.[0];
    const agentEnv = req.isStaging ? 'staging' : 'production';
    void enqueueWelcomeGraphic(
      db,
      {
        userId,
        displayName: `${userData?.firstName ?? ''} ${userData?.lastName ?? ''}`.trim() || 'Athlete',
        role: (userData?.role as UserRole) ?? 'athlete',
        sport: primarySportName,
        position: primarySportProfile?.positions?.[0],
        profileImageUrl: userData?.profileImgs?.[0],
        teamName: primarySportProfile?.team?.name,
        teamColors: primarySportProfile?.team?.colors as string[] | undefined,
      },
      agentEnv
    ).catch((err) =>
      logger.error('[Auth] Failed to enqueue welcome graphic', { userId, error: err })
    );

    // Enqueue linked account scrape (awaited to return jobId to frontend)
    let scrapeJobId: string | undefined;
    const connectedSources = userData?.connectedSources as ConnectedSourceRecord[] | undefined;
    if (connectedSources && connectedSources.length > 0) {
      try {
        const scrapeResult = await enqueueLinkedAccountScrape(
          db,
          {
            userId,
            role: (userData?.role as UserRole) ?? 'athlete',
            sport: primarySportName,
            linkedAccounts: connectedSources.map((cs) => ({
              platform: cs.platform,
              profileUrl: cs.profileUrl,
            })),
          },
          agentEnv
        );
        scrapeJobId = scrapeResult?.operationId;
      } catch (err) {
        logger.error('[Auth] Failed to enqueue linked account scrape', { userId, error: err });
      }
    }

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
      ...(scrapeJobId && { scrapeJobId }),
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
        clearLegacyLocationFields(updateData);

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
          updateData.classOf = Number(stepData['classOf']);
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
          clearLegacyLocationFields(updateData);
        }
        // Note: Coach data is in coach{} and location{} objects
        break;
      }

      case 'sport': {
        const sports: SportProfile[] = [];
        if (Array.isArray(stepData['sports']) && stepData['sports'].length > 0) {
          const sportsData = stepData['sports'] as Array<{
            sport: string;
            isPrimary?: boolean;
            positions?: string[];
            team?: {
              name?: string;
              type?: string;
              city?: string;
              state?: string;
            };
          }>;

          sportsData.forEach((sportData, index) => {
            const existingSport = currentUser?.sports?.find((s) => s.order === index);
            sports.push(
              createSportProfile(sportData.sport, index, {
                positions: sportData.positions ?? existingSport?.positions,
                teamName:
                  sportData.team?.name ?? existingSport?.team?.name ?? currentUser?.highSchool,
                teamType: sportData.team?.type ?? existingSport?.team?.type,
                city: sportData.team?.city ?? currentUser?.location?.city ?? currentUser?.city,
                state: sportData.team?.state ?? currentUser?.location?.state ?? currentUser?.state,
              })
            );
          });

          logger.debug('[POST /profile/onboarding-step] Processing sports array', {
            count: sportsData.length,
            sports: sportsData.map((s) => s.sport),
          });
        } else {
          const primarySportName = (stepData['primarySport'] as string)?.trim();
          const secondarySportName = (stepData['secondarySport'] as string)?.trim();

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
        }

        if (sports.length > 0) {
          updateData.sports = sports;
          updateData.activeSportIndex = 0;

          const primarySport = sports.find((s) => s.order === 0);
          if (primarySport) {
            updateData.primarySport = primarySport.sport;
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

        // V2: Build connectedSources[] from contact step platforms
        const existingConnected: ConnectedSourceRecord[] = Array.isArray(
          currentUser?.connectedSources
        )
          ? currentUser.connectedSources
          : [];

        // Map onboarding step fields → platform entries
        const onboardingLinks: Array<{ platform: string; value: string | undefined }> = [
          { platform: 'instagram', value: (stepData['instagram'] as string)?.trim() },
          { platform: 'twitter', value: (stepData['twitter'] as string)?.trim() },
          { platform: 'tiktok', value: (stepData['tiktok'] as string)?.trim() },
          { platform: 'hudl', value: (stepData['hudlAccountLink'] as string)?.trim() },
          { platform: 'youtube', value: (stepData['youtubeAccountLink'] as string)?.trim() },
        ];

        const connectedMap = new Map<string, ConnectedSourceRecord>();
        for (const cs of existingConnected) {
          connectedMap.set(cs.platform, cs);
        }

        let displayOrder = 0;
        for (const { platform, value } of onboardingLinks) {
          if (value) {
            const url = value.startsWith('http') ? value : `https://${platform}.com/${value}`;
            const existing = connectedMap.get(platform);
            connectedMap.set(platform, {
              platform,
              profileUrl: url,
              syncStatus: 'idle',
              displayOrder: existing?.displayOrder ?? displayOrder++,
            });
          }
        }
        if (connectedMap.size > 0) {
          (updateData as Record<string, unknown>)['connectedSources'] = Array.from(
            connectedMap.values()
          );
        }
        break;
      }

      case 'referral-source': {
        // Backward compatibility for existing UI prompt logic.
        updateData['showedHearAbout'] = true;

        const referralSource = (stepData['source'] as string)?.trim();
        if (referralSource) {
          updateData['referralSource'] = referralSource;
          const referralDetails = (stepData['details'] as string)?.trim();
          const referralClubName = (stepData['clubName'] as string)?.trim();
          const referralOtherSpecify = (stepData['otherSpecify'] as string)?.trim();
          if (referralDetails) updateData['referralDetails'] = referralDetails;
          if (referralClubName) updateData['referralClubName'] = referralClubName;
          if (referralOtherSpecify) updateData['referralOtherSpecify'] = referralOtherSpecify;
        }
        break;
      }

      case 'link-sources': {
        // V2: Build connectedSources[] from link-sources step
        const existingConnected: ConnectedSourceRecord[] = Array.isArray(
          currentUser?.connectedSources
        )
          ? currentUser.connectedSources
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

        // Connected sources keyed by "platform" or "platform::scopeId"
        const connectedMap = new Map<string, ConnectedSourceRecord>();
        for (const cs of existingConnected) {
          const k = cs.scopeId ? `${cs.platform}::${cs.scopeId}` : cs.platform;
          connectedMap.set(k, cs);
        }

        let displayOrder = 0;
        for (const link of links) {
          if (link.connected && link.platform) {
            const platform = link.platform.toLowerCase();
            const key = link.scopeId ? `${platform}::${link.scopeId}` : platform;
            const value = link.url ?? link.username ?? '';
            const url = value.startsWith('http')
              ? value
              : value
                ? `https://${platform}.com/${value}`
                : '';

            const existing = connectedMap.get(key);
            connectedMap.set(key, {
              platform,
              profileUrl: url,
              syncStatus: 'idle',
              displayOrder: existing?.displayOrder ?? displayOrder++,
              ...(link.scopeType && link.scopeType !== 'global'
                ? { scopeType: link.scopeType, scopeId: link.scopeId }
                : {}),
            });
          }
        }
        if (connectedMap.size > 0) {
          (updateData as Record<string, unknown>)['connectedSources'] = Array.from(
            connectedMap.values()
          );
        }
        break;
      }

      default: {
        // For unknown steps, save raw data under onboardingSteps
        updateData[`onboardingSteps.${stepId}`] = stepData;
      }
    }

    // Update user document
    if (Array.isArray(updateData.sports)) {
      updateData.sports = sanitizeSportsForStorage(updateData.sports);
    }

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
 * Stores attribution data on the user document only.
 * Marketing aggregation should use Firebase Analytics / GA4 events.
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

    const nowISO = new Date().toISOString();

    // Update user document with referral attribution (single source of truth)
    // Only include optional fields when they have actual values — skip nulls.
    const updatePayload: Record<string, unknown> = {
      referralSource: source.trim(),
      showedHearAbout: true,
      updatedAt: nowISO,
    };
    const trimmedDetails = details?.trim();
    const trimmedClubName = clubName?.trim();
    const trimmedOtherSpecify = otherSpecify?.trim();
    if (trimmedDetails) updatePayload['referralDetails'] = trimmedDetails;
    if (trimmedClubName) updatePayload['referralClubName'] = trimmedClubName;
    if (trimmedOtherSpecify) updatePayload['referralOtherSpecify'] = trimmedOtherSpecify;

    await db.collection('Users').doc(userId.trim()).update(updatePayload);

    res.json({
      success: true,
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
// GMAIL TOKEN EXCHANGE (Mobile Native)
// ============================================

/**
 * POST /auth/google/connect-gmail
 *
 * Exchanges a Google serverAuthCode (from native mobile Google Sign-In) for a
 * long-lived refresh token, then persists it securely in the emailTokens
 * subcollection so the backend can send emails on behalf of the user.
 *
 * This endpoint is needed because:
 * - Mobile native sign-in (via @capacitor-firebase/authentication) only sends
 *   an idToken to Firebase — the serverAuthCode never reaches Firebase functions.
 * - The refresh token cannot be obtained any other way after sign-in completes.
 *
 * SECURITY:
 * - Requires a valid Firebase ID token (appGuard).
 * - Refresh token stored ONLY in Users/{uid}/emailTokens/gmail (server-only
 *   subcollection) — never on the public User document.
 * - CLIENT_SECRET never exposed to the client.
 *
 * Body: { serverAuthCode: string }
 * Returns: { success: true, email: string }
 */
router.post(
  '/google/connect-gmail',
  appGuard,
  validateBody(ConnectGmailDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const uid = req.user!.uid;
    const {
      serverAuthCode,
      accessToken: webAccessToken,
      redirectUri,
    } = req.body as ConnectGmailDto;

    if (!serverAuthCode && !webAccessToken) {
      sendError(
        res,
        validationError([
          {
            field: 'serverAuthCode',
            message: 'Either serverAuthCode (native/mobile) or accessToken (web) is required',
            rule: 'required',
          },
        ])
      );
      return;
    }

    // Pick Google OAuth web client credentials based on environment.
    // For native serverAuthCode exchange, the client_id MUST be the web client
    // that was used as the server client during Google Sign-In on the device.
    const googleClientId = req.isStaging
      ? (process.env['STAGING_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '')
      : (process.env['CLIENT_ID'] ?? '');
    const googleClientSecret = process.env['CLIENT_SECRET'] ?? '';

    logger.debug('[Google Connect Gmail] Environment config', {
      isStaging: req.isStaging,
      clientId: googleClientId.substring(0, 20) + '...',
    });

    /**
     * Write Gmail token + connectedEmails metadata to Firestore with retry.
     *
     * Race condition: `connect-gmail` can be called before `create-user` finishes
     * writing the User document. `batch.update()` throws NOT_FOUND (gRPC code 5)
     * in that case. We retry with exponential backoff to let `create-user` complete.
     *
     * Retries: 4 attempts — delays 500 ms, 1 s, 2 s, 4 s (total wait ≤ 7.5 s).
     */
    const writeWithRetry = async (
      tokenFields: Record<string, unknown>,
      email: string | undefined
    ): Promise<void> => {
      const MAX_RETRIES = 4;
      const BASE_DELAY_MS = 500;
      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection('emailTokens').doc('gmail');

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.debug('[Google Connect Gmail] User doc not ready — retrying Firestore write', {
            uid: uid.substring(0, 8) + '...',
            attempt,
            delayMs: delay,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }

        try {
          const now = new Date().toISOString();
          const snap = await userRef.get();
          const existing = (snap.data()?.['connectedEmails'] as ConnectedEmail[] | undefined) ?? [];
          const filtered = existing.filter((e) => e.provider !== 'gmail');

          const meta: ConnectedEmail = {
            email: email ?? '',
            provider: 'gmail',
            isActive: true,
            connectedAt: now,
          };

          const batch = db.batch();
          // Metadata on user document (no token — OWASP A01/A02 compliance)
          batch.update(userRef, {
            connectedEmails: [...filtered, meta],
            updatedAt: now,
          });
          // Token in server-only subcollection (Firestore rules restrict client access)
          batch.set(tokenRef, { ...tokenFields, email: email ?? '', lastRefreshedAt: now });
          await batch.commit();
          return; // ✓ done
        } catch (err) {
          const e = err as { code?: number; message?: string };
          const isNotFound =
            e.code === 5 || (typeof e.message === 'string' && e.message.includes('NOT_FOUND'));
          if (!isNotFound || attempt === MAX_RETRIES) throw err;
        }
      }
    };

    // ── Web/PWA path: accessToken from signInWithPopup (no code exchange needed) ─────────────
    if (!serverAuthCode && webAccessToken) {
      logger.debug('[Google Connect Gmail] Storing web accessToken directly', {
        uid: uid.substring(0, 8) + '...',
      });

      const connectedEmail = req.user!.email;
      await writeWithRetry({ provider: 'gmail', accessToken: webAccessToken }, connectedEmail);

      logger.info('[Google Connect Gmail] Web accessToken saved successfully', {
        uid: uid.substring(0, 8) + '...',
        email: connectedEmail,
      });

      // Invalidate Redis cache so GET /auth/profile/:userId returns fresh connectedEmails
      await invalidateProfileCaches(uid).catch((err) =>
        logger.warn('[Google Connect Gmail] Cache invalidation failed', { uid, err })
      );

      res.json({ success: true, email: connectedEmail });
      return;
    }

    // ── Native/Browser path: exchange serverAuthCode/code for refresh_token ───────────────────
    logger.debug('[Google Connect Gmail] Exchanging authorization code', {
      uid: uid.substring(0, 8) + '...',
      hasRedirectUri: !!redirectUri,
    });

    // Exchange authorization code for tokens.
    // - Native mobile serverAuthCode: redirect_uri MUST be empty string (Google Sign-In SDK default)
    // - Browser OAuth code: redirect_uri MUST match the one used in authorization request
    const tokenEndpoint = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
      code: serverAuthCode!,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri ?? '', // Use provided redirectUri or empty for native
    });

    let tokenData: {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };

    try {
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      tokenData = (await tokenResponse.json()) as typeof tokenData;
    } catch (fetchErr) {
      logger.error('[Google Connect Gmail] Network error contacting Google token endpoint', {
        uid,
        error: fetchErr,
      });
      sendError(res, internalError(fetchErr));
      return;
    }

    if (tokenData.error || !tokenData.refresh_token) {
      logger.warn('[Google Connect Gmail] Token exchange failed', {
        uid,
        googleError: tokenData.error,
        googleErrorDescription: tokenData.error_description,
        hasRefreshToken: !!tokenData.refresh_token,
        clientIdUsed: googleClientId.substring(0, 30) + '...',
        isStaging: req.isStaging,
      });
      // Include Google error code in message for easier mobile debugging
      const googleErrMsg = tokenData.error
        ? `[${tokenData.error}] ${tokenData.error_description ?? 'Token exchange failed'}`
        : 'No refresh_token returned — check GIDServerClientID matches STAGING_CLIENT_ID';
      const error = validationError([
        {
          field: 'serverAuthCode',
          message: googleErrMsg,
          rule: 'invalid',
        },
      ]);
      sendError(res, error);
      return;
    }

    // Decode id_token to get the user's email address (safest source).
    let connectedEmail = req.user!.email;
    if (tokenData.id_token) {
      try {
        const base64Url = tokenData.id_token.split('.')[1];
        if (base64Url) {
          const payload = JSON.parse(Buffer.from(base64Url, 'base64url').toString()) as {
            email?: string;
          };
          if (payload.email) connectedEmail = payload.email;
        }
      } catch {
        // Use req.user.email as fallback — already set above
      }
    }

    await writeWithRetry(
      { provider: 'gmail', refreshToken: tokenData.refresh_token },
      connectedEmail
    );

    logger.info('[Google Connect Gmail] Gmail token saved successfully', {
      uid: uid.substring(0, 8) + '...',
      email: connectedEmail,
    });

    res.json({ success: true, email: connectedEmail });
  })
);

// ============================================
// MICROSOFT MAIL CONNECT
// ============================================

/**
 * POST /auth/microsoft/connect-mail
 *
 * Store Microsoft credentials for sending/reading emails via Microsoft Graph API.
 *
 * Supports two flows:
 * 1. Authorization Code Flow (Web - Recommended):
 *    - Frontend sends { code, redirectUri }
 *    - Backend exchanges code for access_token + refresh_token
 *    - Provides long-term access (refresh_token doesn't expire)
 *
 * 2. Direct Token Flow  (Mobile Fallback):
 *    - Frontend sends { accessToken, refreshToken? }
 *    - Backend stores tokens directly
 *    - May have limited refresh_token availability
 *
 * Uses writeWithRetry pattern to handle race conditions.
 */
router.post(
  '/microsoft/connect-mail',
  appGuard,
  validateBody(ConnectMicrosoftDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const uid = req.user!.uid;
    const { code, redirectUri, accessToken, refreshToken } = req.body as ConnectMicrosoftDto;

    // Validate: Either code+redirectUri OR accessToken must be provided
    if (!code && !accessToken) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Either code+redirectUri or accessToken must be provided',
      });
      return;
    }

    logger.debug('[Microsoft Connect Mail] Processing request', {
      uid: uid.substring(0, 8) + '...',
      flow: code ? 'authorization_code' : 'direct_token',
      hasRefreshToken: !!refreshToken,
    });

    let finalAccessToken: string;
    let finalRefreshToken: string | undefined;
    let email: string | undefined;
    if (code && redirectUri) {
      logger.debug('[Microsoft Connect Mail] Exchanging authorization code');

      const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
      // Mobile redirect URIs (custom scheme like nxt1sports://ms/callback) are registered
      // as "Mobile and desktop applications" in Azure = public client.
      // Public clients must NOT send client_secret — omit it for custom scheme URIs.
      const isMobileRedirect =
        redirectUri.startsWith('nxt1sports://') || redirectUri.startsWith('nxt1app://');
      const tokenParams: Record<string, string> = {
        client_id: process.env['MICROSOFT_CLIENT_ID'] || '',
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      };
      if (!isMobileRedirect) {
        tokenParams['client_secret'] = process.env['MICROSOFT_CLIENT_SECRET'] || '';
      }
      const params = new URLSearchParams(tokenParams);

      try {
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json().catch(() => ({}));
          logger.error('[Microsoft Connect Mail] Token exchange failed', {
            status: tokenResponse.status,
            error: errorData,
          });
          res.status(tokenResponse.status).json({
            error: 'token_exchange_failed',
            message: `Failed to exchange Microsoft authorization code: ${(errorData as any).error_description || tokenResponse.statusText}`,
          });
          return;
        }

        const tokenData = await tokenResponse.json();
        finalAccessToken = tokenData.access_token;
        finalRefreshToken = tokenData.refresh_token;

        // Get user email from Graph API
        const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${finalAccessToken}` },
        });

        if (graphResponse.ok) {
          const userData = await graphResponse.json();
          email = userData.mail || userData.userPrincipalName;
        }

        logger.debug('[Microsoft Connect Mail] Token exchange successful', {
          hasAccessToken: !!finalAccessToken,
          hasRefreshToken: !!finalRefreshToken,
          email,
        });
      } catch (err) {
        logger.error('[Microsoft Connect Mail] Token exchange error', { error: err });
        throw err;
      }
    } else {
      // Flow 2: Direct token (mobile fallback)
      finalAccessToken = accessToken!;
      finalRefreshToken = refreshToken;
      email = req.user!.email;
      logger.debug('[Microsoft Connect Mail] Using direct token flow');
    }

    /**
     * Write tokens to Firestore with retry logic
     */
    const writeWithRetry = async (userEmail: string | undefined): Promise<void> => {
      const MAX_RETRIES = 4;
      const BASE_DELAY_MS = 500;
      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection('emailTokens').doc('microsoft');

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.debug('[Microsoft Connect Mail] User doc not ready — retrying', {
            uid: uid.substring(0, 8) + '...',
            attempt,
            delayMs: delay,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }

        try {
          const now = new Date().toISOString();
          const snap = await userRef.get();
          const existing = (snap.data()?.['connectedEmails'] as ConnectedEmail[] | undefined) ?? [];
          const filtered = existing.filter((e) => e.provider !== 'microsoft');

          const meta: ConnectedEmail = {
            email: userEmail ?? '',
            provider: 'microsoft',
            isActive: true,
            connectedAt: now,
          };

          const batch = db.batch();
          // Metadata on user doc (no token — OWASP A01/A02)
          batch.update(userRef, {
            connectedEmails: [...filtered, meta],
            updatedAt: now,
          });

          // Token in server-only subcollection
          const tokenData: Record<string, unknown> = {
            provider: 'microsoft',
            accessToken: finalAccessToken,
            email: userEmail ?? '',
            lastRefreshedAt: now,
          };

          if (finalRefreshToken) {
            tokenData['refreshToken'] = finalRefreshToken;
            logger.debug('[Microsoft Connect Mail] ✅ Storing refreshToken for long-term access');
          } else {
            logger.warn(
              '[Microsoft Connect Mail] ⚠️ No refreshToken - accessToken will expire in 1 hour'
            );
          }

          batch.set(tokenRef, tokenData);
          await batch.commit();
          return;
        } catch (err) {
          const e = err as { code?: number; message?: string };
          const isNotFound =
            e.code === 5 || (typeof e.message === 'string' && e.message.includes('NOT_FOUND'));
          if (!isNotFound || attempt === MAX_RETRIES) throw err;
        }
      }
    };

    await writeWithRetry(email || req.user!.email);

    logger.info('[Microsoft Connect Mail] Token saved successfully', {
      uid: uid.substring(0, 8) + '...',
      email: email || req.user!.email,
      hasRefreshToken: !!finalRefreshToken,
    });

    // Invalidate Redis cache so GET /auth/profile/:userId returns fresh connectedEmails
    await invalidateProfileCaches(uid).catch((err) =>
      logger.warn('[Microsoft Connect Mail] Cache invalidation failed', { uid, err })
    );

    res.json({ success: true, email: email || req.user!.email });
  })
);

// ============================================
// YAHOO MAIL CONNECT
// ============================================

/**
 * POST /auth/yahoo/connect-mail
 *
 * Exchange Yahoo authorization code for refresh_token and store it
 * securely in the emailTokens subcollection.
 *
 * Yahoo OAuth Flow:
 * 1. Frontend opens OAuth URL (https://api.login.yahoo.com/oauth2/request_auth)
 * 2. User grants permission, Yahoo redirects with authorization code
 * 3. Frontend calls this endpoint with code + redirectUri
 * 4. Backend exchanges code for access_token + refresh_token
 * 5. Backend stores refresh_token in Users/{uid}/emailTokens/yahoo
 *
 * SECURITY:
 * - Requires valid Firebase ID token (appGuard)
 * - CLIENT_SECRET never exposed to client
 * - Tokens stored only in server-only subcollection
 *
 * Body: { code: string, redirectUri: string }
 * Returns: { success: true, email: string }
 */
router.post(
  '/yahoo/connect-mail',
  appGuard,
  validateBody(ConnectYahooDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const uid = req.user!.uid;
    const { code, redirectUri } = req.body as ConnectYahooDto;

    logger.debug('[Yahoo Connect Mail] Exchanging authorization code', {
      uid: uid.substring(0, 8) + '...',
      redirectUri,
    });

    /**
     * Write Yahoo token + connectedEmails metadata to Firestore with retry.
     * Same retry pattern as Gmail/Microsoft for race conditions.
     */
    const writeWithRetry = async (
      tokenFields: Record<string, unknown>,
      email: string | undefined
    ): Promise<void> => {
      const MAX_RETRIES = 4;
      const BASE_DELAY_MS = 500;
      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection('emailTokens').doc('yahoo');

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.debug('[Yahoo Connect Mail] User doc not ready — retrying', {
            uid: uid.substring(0, 8) + '...',
            attempt,
            delayMs: delay,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }

        try {
          const now = new Date().toISOString();
          const snap = await userRef.get();
          const existing = (snap.data()?.['connectedEmails'] as ConnectedEmail[] | undefined) ?? [];
          const filtered = existing.filter((e) => e.provider !== 'yahoo');

          const meta: ConnectedEmail = {
            email: email ?? '',
            provider: 'yahoo',
            isActive: true,
            connectedAt: now,
          };

          const batch = db.batch();
          // Metadata on user doc (no token — OWASP A01/A02)
          batch.update(userRef, {
            connectedEmails: [...filtered, meta],
            updatedAt: now,
          });
          // Token in server-only subcollection
          batch.set(tokenRef, { ...tokenFields, email: email ?? '', lastRefreshedAt: now });
          await batch.commit();
          return;
        } catch (err) {
          const e = err as { code?: number; message?: string };
          const isNotFound =
            e.code === 5 || (typeof e.message === 'string' && e.message.includes('NOT_FOUND'));
          if (!isNotFound || attempt === MAX_RETRIES) throw err;
        }
      }
    };

    // Exchange authorization code for tokens
    const tokenEndpoint = 'https://api.login.yahoo.com/oauth2/get_token';
    const params = new URLSearchParams({
      code,
      client_id: process.env['YAHOO_CLIENT_ID'] ?? '',
      client_secret: process.env['YAHOO_CLIENT_SECRET'] ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    let tokenData: {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    try {
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      tokenData = (await tokenResponse.json()) as typeof tokenData;
    } catch (fetchErr) {
      logger.error('[Yahoo Connect Mail] Network error contacting Yahoo token endpoint', {
        uid,
        error: fetchErr,
      });
      sendError(res, internalError(fetchErr));
      return;
    }

    if (tokenData.error || !tokenData.refresh_token) {
      logger.warn('[Yahoo Connect Mail] Token exchange failed', {
        uid,
        error: tokenData.error,
        description: tokenData.error_description,
        hasRefreshToken: !!tokenData.refresh_token,
      });
      const error = validationError([
        {
          field: 'code',
          message:
            tokenData.error_description ??
            'Failed to exchange code — code may be expired or already used',
          rule: 'invalid',
        },
      ]);
      sendError(res, error);
      return;
    }

    // Get user's email from Yahoo userinfo endpoint
    let connectedEmail = req.user!.email;
    if (tokenData.access_token) {
      try {
        const userinfoResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
        const userinfo = (await userinfoResponse.json()) as { email?: string };
        if (userinfo.email) {
          connectedEmail = userinfo.email;
        }
      } catch {
        // Fallback to req.user.email if userinfo fails
      }
    }

    await writeWithRetry(
      { provider: 'yahoo', refreshToken: tokenData.refresh_token },
      connectedEmail
    );

    logger.info('[Yahoo Connect Mail] Yahoo token saved successfully', {
      uid: uid.substring(0, 8) + '...',
      email: connectedEmail,
    });

    // Invalidate Redis cache so GET /auth/profile/:userId returns fresh connectedEmails
    await invalidateProfileCaches(uid).catch((err) =>
      logger.warn('[Yahoo Connect Mail] Cache invalidation failed', { uid, err })
    );

    res.json({ success: true, email: connectedEmail });
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
