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
import { FieldValue } from 'firebase-admin/firestore';

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
import {
  isValidTeamCode,
  USER_SCHEMA_VERSION,
  normalizeName,
  SPORT_POSITIONS,
  normalizeSportKey,
  isTeamRole,
} from '@nxt1/core';
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

import { enqueueLinkedAccountScrape } from '../services/agent-scrape.service.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  CreateUserDto,
  JoinTeamDto,
  ConnectGmailDto,
  ConnectMicrosoftDto,
  ConnectYahooDto,
} from '../dtos/auth.dto.js';
import { BulkOnboardingDto, OnboardingStepDto } from '../dtos/onboarding.dto.js';
import {
  provisionOnboardingPrograms,
  type OnboardingProgramSelection,
  type OnboardingCreateTeamProfile,
} from '../services/onboarding-program-provisioning.service.js';

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
 * - Credits/limits → Metered usage billing (no storage needed)
 *
 * @see @nxt1/core User model
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
    /** Unicode slugs of teams this coach/director manages */
    managedTeamCodes?: string[];
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

  // User preferences (notifications, tracking, theme, etc.)
  preferences?: Record<string, unknown>;

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
  /** Display name of the person who added this link */
  addedBy?: string;
  /** User ID of the person who added this link */
  addedById?: string;
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
    // Legacy aliases → V2 roles
    recruiter: 'coach' as UserRole,
    parent: 'athlete',
    'college-coach': 'coach' as UserRole,
    'recruiting-service': 'coach' as UserRole,
    scout: 'coach' as UserRole,
    media: 'coach' as UserRole,
    fan: 'athlete',
    service: 'coach' as UserRole,
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
    ...(team.title ? { title: team.title } : {}),
    ...(team.organizationId ? { organizationId: team.organizationId } : {}),
    ...(team.teamId ? { teamId: team.teamId } : {}),
    ...(team.city ? { city: team.city } : {}),
    ...(team.state ? { state: team.state } : {}),
  };
}

function getLegacyCoachTitle(user?: UserV2Document): string | undefined {
  const rootCoachTitle = (user as Record<string, unknown> | undefined)?.['coachTitle'];
  if (typeof rootCoachTitle === 'string' && rootCoachTitle.trim().length > 0) {
    return rootCoachTitle.trim();
  }

  const nestedCoachTitle = user?.coach?.title;
  if (typeof nestedCoachTitle === 'string' && nestedCoachTitle.trim().length > 0) {
    return nestedCoachTitle.trim();
  }

  const existingSportTitle = user?.sports?.find((sport) => sport.team?.title)?.team?.title;
  if (typeof existingSportTitle === 'string' && existingSportTitle.trim().length > 0) {
    return existingSportTitle.trim();
  }

  return undefined;
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
/**
 * Normalize positions to Title Case using SPORT_POSITIONS as the canonical source.
 * Looks up each position (case-insensitive) in SPORT_POSITIONS for the given sport.
 * Falls back to regex title-casing if no canonical match is found.
 *
 * @example normalizePositions(['quarterback', 'running back'], 'Football') => ['Quarterback', 'Running Back']
 */
function normalizePositions(positions: readonly string[], sport: string): string[] {
  if (!positions || positions.length === 0) return [];

  const sportKey = normalizeSportKey(sport);
  const canonical = SPORT_POSITIONS[sportKey] ?? [];

  // Build lowercase → Title Case lookup from SPORT_POSITIONS
  const canonicalMap = new Map<string, string>();
  for (const p of canonical) {
    canonicalMap.set(p.toLowerCase(), p);
  }

  const normalized = new Set<string>();
  for (const p of positions) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // Try canonical lookup first, then fallback to regex title-case
    const match = canonicalMap.get(trimmed.toLowerCase());
    normalized.add(match ?? trimmed.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  return Array.from(normalized);
}

function createSportProfile(
  sport: string,
  order: number,
  options?: {
    readonly positions?: string[];
    readonly teamName?: string;
    readonly title?: string;
    readonly teamType?: string;
    readonly city?: string;
    readonly state?: string;
    readonly teamId?: string;
    readonly organizationId?: string;
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

  const normalizedPositions = options?.positions
    ? normalizePositions(options.positions, sport)
    : [];

  // Build sport profile - only include non-empty fields (Firestore efficiency)
  const profile: SportProfile = {
    sport,
    order,
    team: {
      type: teamType,
      name: '',
    },
  };

  if (normalizedPositions.length > 0) {
    profile.positions = normalizedPositions;
  }

  if (options?.teamName || options?.teamType) {
    profile.team = {
      type: teamType,
      name: options?.teamName || '',
      ...(options?.title ? { title: options.title } : {}),
      ...(options?.teamId ? { teamId: options.teamId } : {}),
      ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
    };
  } else if (options?.teamId || options?.organizationId || options?.title) {
    profile.team = {
      ...profile.team!,
      ...(options?.teamId ? { teamId: options.teamId } : {}),
      ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
      ...(options?.title ? { title: options.title } : {}),
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

// Local helper types are in onboarding-program-provisioning.service.ts
// (OnboardingProgramSelection, normalizeProgramType, normalizeTeamType,
//  parseLocationLabel, generateUniqueTeamCode)

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
    // Metered usage billing - no plan storage needed
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

        // V2: Membership tracked via RosterEntry docs only.
        // No more memberIds[] writes on the Team doc.
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
    // Use transaction to update both user and team atomically
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('Users').doc(userId);

      // Update user with team info
      const userUpdate: Record<string, unknown> = {
        teamCode: {
          teamCode: teamData['teamCode'],
          teamName: teamData['teamName'],
          teamId: teamDoc.id,
        },
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

      // V2: Membership tracked via RosterEntry docs only.
      // No more memberIds[] writes on the Team doc.
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

/**
 * GET /auth/team-sources/:teamId
 * Fetch existing connected sources for a team during onboarding.
 * Used by the link-drop step to seed links previously added by another staff member.
 */
router.get(
  '/team-sources/:teamId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const teamId = req.params['teamId'] as string;

    if (!teamId?.trim()) {
      const error = validationError([
        { field: 'teamId', message: 'Team ID is required', rule: 'required' },
      ]);
      sendError(res, error);
      return;
    }

    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) {
      res.json({ success: true, data: [] });
      return;
    }

    const teamData = teamDoc.data();
    const sources: ConnectedSourceRecord[] = Array.isArray(teamData?.['connectedSources'])
      ? teamData!['connectedSources']
      : [];

    res.json({ success: true, data: sources });
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
  validateBody(BulkOnboardingDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId, ...profileData } = req.body;

    logger.debug('[POST /profile/onboarding] Request:', { userId, keys: Object.keys(profileData) });

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

    // ============================================
    // PREFERENCES (canonical defaults — backend is source of truth)
    // Only written if the user has no existing preferences yet.
    // The Cloud Function fallback also writes these, but the
    // onboarding endpoint is the primary path.
    // ============================================
    if (!currentUser?.preferences?.['notifications']) {
      updateData.preferences = {
        notifications: {
          push: true,
          email: true,
          marketing: true,
        },
        activityTracking: true,
        analyticsTracking: true,
        biometricLogin: false,
        theme: 'system',
      };
    }

    // Optional: firstName/lastName (may already be set from earlier steps)
    // Always normalize to Title Case (e.g. "john doe" → "John Doe")
    const firstName = normalizeName((profileData['firstName'] as string) || '');
    const lastName = normalizeName((profileData['lastName'] as string) || '');
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;

    // Always set displayName from firstName + lastName (all roles)
    const displayName = [firstName, lastName].filter(Boolean).join(' ');
    if (displayName) (updateData as Record<string, unknown>)['displayName'] = displayName;

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

    // Profile images (only use profileImgs array)
    if (profileData['profileImgs']) updateData.profileImgs = profileData['profileImgs'] as string[];
    // V2: bio/aboutMe is no longer written during onboarding.
    if (profileData['gender']) updateData.gender = profileData['gender'] as string;

    // V2: Set role (single field)
    if (profileData['userType']) {
      updateData.role = mapUserTypeToRole(profileData['userType'] as string);
    }

    const resolvedOnboardingRole =
      (updateData.role as string | undefined) ?? (currentUser?.role as string | undefined);
    const isTeamRoleOnboard = isTeamRole(resolvedOnboardingRole);
    const incomingCoachTitle =
      (typeof profileData['coachTitle'] === 'string' && profileData['coachTitle'].trim().length > 0
        ? profileData['coachTitle'].trim()
        : undefined) ?? getLegacyCoachTitle(currentUser);

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
          teamId?: string;
          organizationId?: string;
          title?: string;
        };
      }>;

      sportsData.forEach((sportData, index) => {
        const sportProfile = createSportProfile(sportData.sport, index, {
          positions: isTeamRoleOnboard ? undefined : sportData.positions,
          teamName: sportData.team?.name,
          title: sportData.team?.title ?? incomingCoachTitle,
          teamType: sportData.team?.type,
          city: sportData.team?.city,
          state: sportData.team?.state,
          teamId: sportData.team?.teamId,
          organizationId: sportData.team?.organizationId,
        });
        sports.push(sportProfile);
      });
    } else if (profileData['sport']) {
      const primarySport = createSportProfile(profileData['sport'] as string, 0, {
        positions: isTeamRoleOnboard
          ? undefined
          : (profileData['positions'] as string[] | undefined),
        teamName: profileData['highSchool'] as string | undefined,
        title: incomingCoachTitle,
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
    } else if (Array.isArray(currentUser?.sports) && currentUser.sports.length > 0) {
      const existingSports = JSON.parse(JSON.stringify(currentUser.sports)) as SportProfile[];
      if (isTeamRoleOnboard) {
        existingSports.forEach((sport) => {
          delete sport.positions;
        });
      }
      sports.push(...existingSports);
    }

    if (sports.length > 0) {
      updateData.sports = sports;
      updateData.activeSportIndex = 0;
      updateData.primarySport = sports[0]?.sport;
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
    if (profileData['classOf'] && resolvedOnboardingRole === 'athlete') {
      updateData.classOf = Number(profileData['classOf']);
    }

    // V2: Coach-specific data (coach, director)
    const isCoachRole = resolvedOnboardingRole === 'coach' || resolvedOnboardingRole === 'director';
    if (isCoachRole) {
      (updateData as Record<string, unknown>)['coachTitle'] = FieldValue.delete();
    }

    // V2: Legacy fields (highSchool, organization) are no longer written.
    // Data is stored in sports[].team and Organization docs.

    // Resolve role for provisioning and connected sources
    const role = mapUserTypeToRole(
      (profileData['userType'] as string) || (currentUser?.role as string) || 'athlete'
    );

    // ============================================
    // PROGRAM + TEAM + ROSTER CREATION (Ghost flow)
    // Delegated to onboarding-program-provisioning.service.ts
    // ============================================
    const provisionResult = await provisionOnboardingPrograms({
      db,
      userId,
      role: role as UserRole,
      sports,
      currentUser: {
        firstName: currentUser?.firstName,
        lastName: currentUser?.lastName,
        email:
          updateData.contact?.email?.trim().toLowerCase() ||
          currentUser?.contact?.email?.trim().toLowerCase() ||
          currentUser?.email?.trim().toLowerCase(),
        contact: {
          phone: updateData.contact?.phone?.trim() || currentUser?.contact?.phone?.trim(),
        },
        profileImgs: updateData.profileImgs ?? currentUser?.profileImgs,
      },
      updateData: {
        firstName: updateData.firstName,
        lastName: updateData.lastName,
        profileImgs: updateData.profileImgs,
        coachTitle: incomingCoachTitle,
        athlete: updateData.classOf ? { classOf: updateData.classOf } : undefined,
        location: updateData.location
          ? { city: updateData.location.city, state: updateData.location.state }
          : undefined,
      },
      teamSelection: profileData['teamSelection'] as
        | { teams?: OnboardingProgramSelection[] }
        | undefined,
      createTeamProfile: profileData['createTeamProfile'] as
        | OnboardingCreateTeamProfile
        | undefined,
    });

    const { teamIds, createdTeamIds, sportTeamMap } = provisionResult;

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

    // For invite users: sports[].team.teamId was passed from client but organizationId
    // was not available. Look it up from the Teams collection now.
    if (Array.isArray(updateData.sports)) {
      for (const sport of updateData.sports) {
        if (sport.team?.teamId && !sport.team?.organizationId) {
          try {
            const teamDoc = await db.collection('Teams').doc(sport.team.teamId).get();
            if (teamDoc.exists) {
              const orgId = teamDoc.data()?.['organizationId'] as string | undefined;
              const orgName = teamDoc.data()?.['teamName'] as string | undefined;
              if (orgId) {
                sport.team.organizationId = orgId;
                logger.info(
                  '[POST /profile/onboarding] Backfilled organizationId from teamId (invite flow)',
                  { teamId: sport.team.teamId, organizationId: orgId }
                );
              }
              // Also correct team name if backend has canonical name
              if (orgName && !sport.team.name) {
                sport.team.name = orgName;
              }
            }
          } catch (err) {
            logger.warn('[POST /profile/onboarding] Failed to resolve organizationId from teamId', {
              teamId: sport.team.teamId,
              error: err,
            });
          }
        }
      }
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

          // Only store on team if a privileged role (coach/director) claimed/joined the team.
          // Athletes' connected sources belong on the user doc, not the team.
          const isPrivilegedRole = role === 'coach' || role === 'director';
          if (teamIds.length > 0 && isPrivilegedRole) {
            // Tag with who added this link so future onboarding users can see the attribution
            const addedByName = [firstName, lastName].filter(Boolean).join(' ') || 'Staff';
            teamConnectedSources.push({
              ...sourceInfo,
              addedBy: addedByName,
              addedById: userId,
            });
            connectedMap.delete(key); // Remove from user doc if previously written there
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

    if (teamIds.length > 0 && teamConnectedSources.length > 0) {
      try {
        await Promise.all(
          teamIds.map(async (teamId) => {
            // For existing teams, merge with any existing connectedSources
            if (!createdTeamIds.includes(teamId)) {
              const teamDoc = await db.collection('Teams').doc(teamId).get();
              const existing: ConnectedSourceRecord[] =
                (teamDoc.data()?.['connectedSources'] as ConnectedSourceRecord[] | undefined) ?? [];
              const merged = new Map<string, ConnectedSourceRecord>();
              for (const cs of existing) {
                const key = cs.scopeId ? `${cs.platform}::${cs.scopeId}` : cs.platform;
                merged.set(key, cs);
              }
              for (const cs of teamConnectedSources) {
                const key = cs.scopeId ? `${cs.platform}::${cs.scopeId}` : cs.platform;
                if (!merged.has(key)) {
                  merged.set(key, cs);
                }
              }
              return db
                .collection('Teams')
                .doc(teamId)
                .update({
                  connectedSources: Array.from(merged.values()),
                });
            }
            return db.collection('Teams').doc(teamId).update({
              connectedSources: teamConnectedSources,
            });
          })
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

    // Welcome graphic is NO LONGER generated at onboarding completion.
    // It is deferred until the user first uploads a profile image (athletes)
    // or team logo (coaches/directors) via the edit-profile section save flow.
    // See edit-profile.routes.ts — "Deferred welcome graphic" section.

    // Shared variables used by scrape enqueue below
    const primarySportName = getPrimarySport(userData?.sports) ?? userData?.primarySport;
    const agentEnv = req.isStaging ? 'staging' : 'production';

    // Enqueue linked account scrape (skip if pre-fetched from Step 5)
    let scrapeJobId: string | undefined;
    const existingPreloadScrapeId =
      typeof profileData['scrapeJobId'] === 'string' ? profileData['scrapeJobId'] : undefined;

    // Resolve first team/org from sportTeamMap (populated after team creation above)
    const firstTeamEntry = sportTeamMap.size > 0 ? sportTeamMap.values().next().value : undefined;
    const resolvedTeamId = firstTeamEntry?.teamId as string | undefined;
    const resolvedOrgId = firstTeamEntry?.organizationId as string | undefined;
    const isCoachOrDirector = role === 'coach' || role === 'director';

    if (existingPreloadScrapeId && !isCoachOrDirector) {
      // Athletes: preload is fine — writes to user profile, not team doc
      scrapeJobId = existingPreloadScrapeId;
      logger.info('[Auth] Reusing pre-fetched scrape job from Step 5', {
        userId,
        scrapeJobId,
      });
    } else {
      // Coaches/Directors: always enqueue fresh with teamId/orgId so the agent
      // can write to the Team document (preload ran before team creation).
      // Athletes without a preload also come through here.
      if (existingPreloadScrapeId && isCoachOrDirector) {
        logger.info('[Auth] Discarding coach preload scrape — re-enqueuing with teamId', {
          userId,
          preloadScrapeId: existingPreloadScrapeId,
          resolvedTeamId,
        });
      }
      // Combine user-level and team-level connected sources.
      // For coaches/directors, links are stored on the Team doc (not User),
      // so we must also include teamConnectedSources to trigger the scrape.
      const userConnectedSources =
        (userData?.connectedSources as ConnectedSourceRecord[] | undefined) ?? [];
      const allConnectedSources = [...userConnectedSources, ...teamConnectedSources];
      if (allConnectedSources.length > 0) {
        try {
          const scrapeResult = await enqueueLinkedAccountScrape(
            db,
            {
              userId,
              role: (userData?.role as UserRole) ?? 'athlete',
              sport: primarySportName,
              linkedAccounts: allConnectedSources.map((cs) => ({
                platform: cs.platform,
                profileUrl: cs.profileUrl,
              })),
              teamId: resolvedTeamId,
              organizationId: resolvedOrgId,
            },
            agentEnv
          );
          scrapeJobId = scrapeResult?.operationId;
        } catch (err) {
          logger.error('[Auth] Failed to enqueue linked account scrape', { userId, error: err });
        }
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
  validateBody(OnboardingStepDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId, stepId, stepData } = req.body;

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
        // V2: bio/aboutMe is no longer written during onboarding.
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

        // V2: Update team info in sports array if exists (Athletes only — coaches/directors
        // don't own sports[]; their sport data is synthesized from RosterEntries)
        const schoolRole = currentUser?.role as string | undefined;
        const schoolIsTeamRole = isTeamRole(schoolRole);
        if (!schoolIsTeamRole && currentUser?.sports && currentUser.sports.length > 0) {
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
        const currentRole = currentUser?.role as string | undefined;
        const isTeamRoleUser = isTeamRole(currentRole);
        const organizationName = (stepData['organization'] as string)?.trim();
        const coachTitle = (stepData['coachTitle'] as string)?.trim() || undefined;

        if (isTeamRoleUser) {
          const existingSports = Array.isArray(currentUser?.sports)
            ? (JSON.parse(JSON.stringify(currentUser.sports)) as SportProfile[])
            : [];
          const fallbackPrimarySport =
            getPrimarySport(currentUser?.sports) ??
            ((currentUser as Record<string, unknown> | undefined)?.['primarySport'] as
              | string
              | undefined);
          const updatedSports =
            existingSports.length > 0
              ? existingSports
              : fallbackPrimarySport
                ? [
                    createSportProfile(fallbackPrimarySport, 0, {
                      teamName: organizationName,
                      title: coachTitle,
                      city: (stepData['city'] as string)?.trim() || currentUser?.location?.city,
                      state: (stepData['state'] as string)?.trim() || currentUser?.location?.state,
                    }),
                  ]
                : [];

          if (updatedSports.length > 0) {
            updatedSports.forEach((sport) => {
              delete sport.positions;
              if (!sport.team) {
                sport.team = {
                  type: 'organization',
                  name: organizationName || '',
                  ...(coachTitle ? { title: coachTitle } : {}),
                };
              }
              if (organizationName !== undefined) {
                sport.team.name = organizationName;
              }
              if (coachTitle !== undefined) {
                sport.team.title = coachTitle;
              }
            });

            updateData.sports = updatedSports;
            updateData.activeSportIndex = 0;
            updateData.primarySport = updatedSports[0]?.sport;
          }

          (updateData as Record<string, unknown>)['coachTitle'] = FieldValue.delete();
        }

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
        const currentSports: SportProfile[] = Array.isArray(currentUser?.sports)
          ? currentUser!.sports
          : [];
        const userRole = currentUser?.role as string | undefined;
        const isTeamRoleUser = isTeamRole(userRole);
        const teamRoleTitle =
          currentUser?.sports?.find((sport) => sport.team?.title)?.team?.title ??
          getLegacyCoachTitle(currentUser);

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
              teamId?: string;
              organizationId?: string;
            };
          }>;

          sportsData.forEach((sportData, index) => {
            const existingSport = currentSports.find((s) => s.order === index);
            sports.push(
              createSportProfile(sportData.sport, index, {
                positions: isTeamRoleUser
                  ? undefined
                  : (sportData.positions ?? existingSport?.positions),
                teamName:
                  sportData.team?.name ?? existingSport?.team?.name ?? currentUser?.highSchool,
                title: existingSport?.team?.title ?? teamRoleTitle,
                teamType: sportData.team?.type ?? existingSport?.team?.type,
                city: sportData.team?.city ?? currentUser?.location?.city ?? currentUser?.city,
                state: sportData.team?.state ?? currentUser?.location?.state ?? currentUser?.state,
                teamId: sportData.team?.teamId ?? existingSport?.team?.teamId,
                organizationId:
                  sportData.team?.organizationId ?? existingSport?.team?.organizationId,
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
            const existingPrimary = currentSports.find((s) => s.order === 0);
            sports.push(
              createSportProfile(primarySportName, 0, {
                positions: isTeamRoleUser ? undefined : existingPrimary?.positions,
                teamName: existingPrimary?.team?.name ?? currentUser?.highSchool,
                title: existingPrimary?.team?.title ?? teamRoleTitle,
                teamType: existingPrimary?.team?.type,
                city: currentUser?.location?.city ?? currentUser?.city,
                state: currentUser?.location?.state ?? currentUser?.state,
                teamId: existingPrimary?.team?.teamId,
                organizationId: existingPrimary?.team?.organizationId,
              })
            );
          }

          if (secondarySportName) {
            const existingSecondary = currentSports.find((s) => s.order === 1);
            sports.push(
              createSportProfile(secondarySportName, 1, {
                positions: isTeamRoleUser ? undefined : existingSecondary?.positions,
                title: existingSecondary?.team?.title ?? teamRoleTitle,
                teamId: existingSecondary?.team?.teamId,
                organizationId: existingSecondary?.team?.organizationId,
              })
            );
          }
        }

        if (sports.length > 0) {
          if (isTeamRoleUser) {
            sports.forEach((sport) => {
              if (!sport.team) {
                sport.team = { type: 'organization', name: '' };
              }
              if (teamRoleTitle) {
                sport.team.title = teamRoleTitle;
              }
            });
            (updateData as Record<string, unknown>)['coachTitle'] = FieldValue.delete();
          }

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
        const rawPositions = Array.isArray(stepData['positions'])
          ? (stepData['positions'] as string[]).slice(0, 10)
          : [];

        // Normalize positions to Title Case (e.g. "quarterback" → "Quarterback")
        const sportName = currentUser?.primarySport ?? '';
        const positions = normalizePositions(rawPositions, sportName);

        // V2: Update positions in sports array (Athletes only — coaches don't own sports[])
        const posUserRole = currentUser?.role as string | undefined;
        const posIsTeamRole = isTeamRole(posUserRole);
        if (!posIsTeamRole) {
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

        // Determine if this is a team-level role (coach/director)
        const linkRole = currentUser?.role as string | undefined;
        const isTeamRoleUser = isTeamRole(linkRole);

        // Get team IDs from user's sports array for team-level writes
        const userTeamIds: string[] = isTeamRoleUser
          ? ((currentUser?.sports as SportProfile[]) ?? [])
              .map((s) => s.team?.teamId)
              .filter((id): id is string => !!id)
          : [];

        // Connected sources keyed by "platform" or "platform::scopeId"
        const connectedMap = new Map<string, ConnectedSourceRecord>();
        for (const cs of existingConnected) {
          const k = cs.scopeId ? `${cs.platform}::${cs.scopeId}` : cs.platform;
          connectedMap.set(k, cs);
        }

        const teamConnectedSources: ConnectedSourceRecord[] = [];
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
            const sourceInfo: ConnectedSourceRecord = {
              platform,
              profileUrl: url,
              syncStatus: 'idle',
              displayOrder: existing?.displayOrder ?? displayOrder++,
              ...(link.scopeType && link.scopeType !== 'global'
                ? { scopeType: link.scopeType, scopeId: link.scopeId }
                : {}),
            };

            // Coach/director sources → Team doc; athlete/other → User doc
            if (isTeamRoleUser && userTeamIds.length > 0) {
              const addedByName =
                [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') ||
                'Staff';
              teamConnectedSources.push({
                ...sourceInfo,
                addedBy: addedByName,
                addedById: userId,
              });
              connectedMap.delete(key); // Remove from user doc if previously written there
            } else {
              connectedMap.set(key, sourceInfo);
            }
          }
        }

        // Write team connected sources to Team docs
        if (userTeamIds.length > 0 && teamConnectedSources.length > 0) {
          try {
            await Promise.all(
              userTeamIds.map(async (teamId) => {
                const teamDoc = await db.collection('Teams').doc(teamId).get();
                const existingTeamSources: ConnectedSourceRecord[] =
                  (teamDoc.data()?.['connectedSources'] as ConnectedSourceRecord[] | undefined) ??
                  [];
                const merged = new Map<string, ConnectedSourceRecord>();
                for (const cs of existingTeamSources) {
                  const k = cs.scopeId ? `${cs.platform}::${cs.scopeId}` : cs.platform;
                  merged.set(k, cs);
                }
                for (const cs of teamConnectedSources) {
                  const k = cs.scopeId ? `${cs.platform}::${cs.scopeId}` : cs.platform;
                  merged.set(k, cs);
                }
                return db
                  .collection('Teams')
                  .doc(teamId)
                  .update({
                    connectedSources: Array.from(merged.values()),
                  });
              })
            );
            logger.info('[POST /profile/onboarding-step] Wrote connected sources to Team docs', {
              userId,
              teamIds: userTeamIds,
              sourceCount: teamConnectedSources.length,
            });
          } catch (err) {
            logger.error(
              '[POST /profile/onboarding-step] Failed to write Team connected sources',
              err as Record<string, unknown>
            );
          }
        }

        // Only write remaining (non-team) sources to user doc
        if (connectedMap.size > 0) {
          (updateData as Record<string, unknown>)['connectedSources'] = Array.from(
            connectedMap.values()
          );
        } else if (isTeamRoleUser && userTeamIds.length > 0) {
          // Purge any previously incorrectly written sources from user doc
          (updateData as Record<string, unknown>)['connectedSources'] = FieldValue.delete();
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

// POST /auth/profile/complete-onboarding — REMOVED (redundant).
// The bulk POST /auth/profile/onboarding already sets onboardingCompleted: true.

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
 * Body: { idToken: string, accessToken?: string }
 * Returns: { firebaseToken: string }
 */
router.post(
  '/microsoft/custom-token',
  asyncHandler(async (req: Request, res: Response) => {
    const { idToken, accessToken } = req.body;

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

      // Prefer `oid` (Azure AD Object ID — stable GUID format, same across all apps)
      // over `sub` (pairwise subject — app-specific, long base64 string for personal MSA accounts)
      const microsoftUid = payload.sub || payload.oid;
      let email: string | undefined = payload.preferred_username || payload.email;
      let name: string | undefined = payload.name;

      if (!microsoftUid) {
        const error = validationError([
          { field: 'idToken', message: 'Invalid token: missing sub/oid', rule: 'invalid' },
        ]);
        sendError(res, error);
        return;
      }

      // For personal Microsoft accounts (consumer tenant), the idToken may not contain
      // email/preferred_username. Fall back to Microsoft Graph /me if accessToken is provided.
      if (!email && accessToken && typeof accessToken === 'string') {
        logger.debug(
          '[Microsoft Custom Token] Email missing from idToken, fetching from Graph API'
        );
        try {
          const graphRes = await fetch(
            'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName',
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (graphRes.ok) {
            const graphUser = (await graphRes.json()) as {
              mail?: string;
              userPrincipalName?: string;
              displayName?: string;
            };
            email = graphUser.mail || graphUser.userPrincipalName;
            name = name || graphUser.displayName;
          }
        } catch (graphError) {
          logger.warn('[Microsoft Custom Token] Graph API call failed', { graphError });
        }
      }

      if (!microsoftUid || !email) {
        const error = validationError([
          { field: 'idToken', message: 'Invalid token: missing user info', rule: 'invalid' },
        ]);
        sendError(res, error);
        return;
      }

      logger.debug('[Microsoft Custom Token] Token decoded', { email, name });

      // Create deterministic Firebase UID
      const firebaseUid = `${microsoftUid}`;

      // Check if user exists, create if not
      try {
        const existingUser = await req.firebase!.auth.getUser(firebaseUid);
        // Update email/displayName if not set (e.g. first time we get email from Graph API)
        if ((!existingUser.email && email) || (!existingUser.displayName && name)) {
          try {
            await req.firebase!.auth.updateUser(firebaseUid, {
              ...(email && !existingUser.email ? { email, emailVerified: true } : {}),
              ...(name && !existingUser.displayName ? { displayName: name } : {}),
            });
          } catch (updateErr) {
            // Email may already be in use by another provider — non-fatal
            logger.warn('[Microsoft Custom Token] Could not update user email/name', { updateErr });
          }
        }
      } catch (error: unknown) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'auth/user-not-found'
        ) {
          logger.debug('[Microsoft Custom Token] Creating new Firebase user');
          // Attempt to create with email so it appears in Firebase Console.
          // If email conflicts with an existing provider, fall back to no email
          // (the email is still propagated via custom token claims).
          try {
            await req.firebase!.auth.createUser({
              uid: firebaseUid,
              email,
              displayName: name,
              emailVerified: true,
            });
          } catch (createWithEmailErr: unknown) {
            const code =
              createWithEmailErr &&
              typeof createWithEmailErr === 'object' &&
              'code' in createWithEmailErr
                ? (createWithEmailErr as { code: string }).code
                : '';
            if (code === 'auth/email-already-exists') {
              logger.warn(
                '[Microsoft Custom Token] Email already taken by another provider, creating without email',
                { email }
              );
              await req.firebase!.auth.createUser({
                uid: firebaseUid,
                displayName: name,
                emailVerified: false,
              });
            } else {
              throw createWithEmailErr;
            }
          }
        } else {
          throw error;
        }
      }

      // Link the microsoft.com provider to the user so Firebase Console shows
      // the Microsoft icon and providerData is populated on the client-side user.
      // providerToLink is an Admin-SDK-only operation — it works for custom-token
      // users that have no OAuth provider linked yet.
      try {
        await req.firebase!.auth.updateUser(firebaseUid, {
          providerToLink: {
            uid: microsoftUid,
            providerId: 'microsoft.com',
            ...(email ? { email } : {}),
            ...(name ? { displayName: name } : {}),
          },
        });
      } catch (linkErr) {
        // Non-fatal: provider may already be linked, or Admin SDK version may not support it
        logger.warn('[Microsoft Custom Token] Could not link microsoft.com provider', { linkErr });
      }

      // Create Firebase custom token
      const firebaseToken = await req.firebase!.auth.createCustomToken(firebaseUid, {
        provider: 'microsoft.com',
        email: email,
        name: name,
      });

      logger.info('[Microsoft Custom Token] Success', { uid: firebaseUid, email });

      res.json({ firebaseToken, email: email ?? null, displayName: name ?? null });
    } catch (error: unknown) {
      logger.error('[Microsoft Custom Token] Error', { error });
      const errorDetail = error instanceof Error ? error.message : String(error);
      const validError = validationError([
        {
          field: 'idToken',
          message: `Failed to process Microsoft token: ${errorDetail}`,
          rule: 'invalid',
        },
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
// GOOGLE / MICROSOFT OAUTH — BACKEND-REDIRECT FLOW
// (matches nxt1-backend production approach)
// ============================================

/**
 * GET /auth/google/connect-url
 *
 * Returns a Google OAuth2 authorization URL whose redirect_uri points to
 * this backend (/auth/google/callback). The frontend opens this URL in a
 * popup — Google redirects back to the backend, which exchanges the code,
 * stores the refresh token, and renders a success page that closes the popup.
 *
 * Requires a valid Firebase ID token (appGuard).
 * Returns: { url: string }
 */
/**
 * Returns allowed frontend origins for the current environment.
 * Staging requests use STAGING_ALLOWED_FRONTEND_ORIGINS;
 * production requests use ALLOWED_FRONTEND_ORIGINS.
 * Falls back to localhost when neither is set (local dev).
 */
function getAllowedOrigins(isStaging: boolean): string[] {
  const key = isStaging ? 'STAGING_ALLOWED_FRONTEND_ORIGINS' : 'ALLOWED_FRONTEND_ORIGINS';
  return (
    process.env[key]
      ?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? ['http://localhost:4200', 'http://localhost:4201']
  );
}

function isAllowedOrigin(origin: string, isStaging: boolean): boolean {
  return getAllowedOrigins(isStaging).includes(origin);
}

/**
 * Default frontend URL — first entry in the allowed origins list.
 */
function getDefaultFrontendUrl(isStaging: boolean): string {
  return getAllowedOrigins(isStaging)[0] ?? 'http://localhost:4200';
}

/**
 * Encode state payload as base64url JSON: { uid, origin?, mobileScheme? }
 */
function encodeOAuthState(uid: string, origin: string, mobileScheme?: string): string {
  return Buffer.from(
    JSON.stringify({ uid, origin, ...(mobileScheme && { mobileScheme }) })
  ).toString('base64url');
}

/**
 * Decode state — supports both legacy plain-uid and new base64url JSON.
 */
function decodeOAuthState(state: string): { uid: string; origin?: string; mobileScheme?: string } {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
      uid?: string;
      origin?: string;
      mobileScheme?: string;
    };
    if (decoded.uid)
      return { uid: decoded.uid, origin: decoded.origin, mobileScheme: decoded.mobileScheme };
  } catch {
    // legacy: state was just the uid string
  }
  return { uid: state };
}

/** Known mobile app URI schemes allowed as OAuth callback targets */
const ALLOWED_MOBILE_SCHEMES = new Set(['nxt1sports', 'nxt1app', 'nxt1']);

router.get(
  '/google/connect-url',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;
    const origin = (req.query['origin'] as string | undefined)?.trim();
    const mobileScheme = (req.query['mobileScheme'] as string | undefined)?.trim();

    // Validate origin if provided
    if (origin && !isAllowedOrigin(origin, req.isStaging)) {
      sendError(
        res,
        validationError([{ field: 'origin', message: 'Origin not allowed', rule: 'invalid' }])
      );
      return;
    }

    // Validate mobileScheme if provided
    if (mobileScheme && !ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
      sendError(
        res,
        validationError([
          { field: 'mobileScheme', message: 'Unknown mobile scheme', rule: 'invalid' },
        ])
      );
      return;
    }

    const googleClientId = req.isStaging
      ? (process.env['STAGING_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '')
      : (process.env['CLIENT_ID'] ?? '');

    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';
    const redirectUri = `${backendUrl}${pathPrefix}/auth/google/callback`;

    const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    oauthUrl.searchParams.set('client_id', googleClientId);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set(
      'scope',
      'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email'
    );
    oauthUrl.searchParams.set('access_type', 'offline');
    oauthUrl.searchParams.set('prompt', 'select_account consent');
    // Encode uid + origin/mobileScheme so the callback knows where to redirect
    const statePayload = mobileScheme
      ? encodeOAuthState(uid, '', mobileScheme)
      : origin
        ? encodeOAuthState(uid, origin)
        : uid;
    oauthUrl.searchParams.set('state', statePayload);

    logger.debug('[Google Connect URL] Generated OAuth URL', {
      uid: uid.substring(0, 8) + '...',
      redirectUri,
      origin,
      mobileScheme,
      isStaging: req.isStaging,
    });

    res.json({ url: oauthUrl.toString() });
  })
);

/**
 * GET /auth/google/callback
 *
 * Google OAuth2 callback — receives ?code=...&state={uid} after the user grants
 * permissions. Exchanges the code for tokens, stores the refresh token in
 * Users/{uid}/emailTokens/gmail, and renders a success/error HTML page.
 *
 * NO auth guard — this endpoint is called by Google's redirect.
 */
router.get(
  '/google/callback',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { code, state: rawState, error: oauthError } = req.query as Record<string, string>;
    const { uid, origin: stateOrigin, mobileScheme } = decodeOAuthState(rawState ?? '');

    const renderResult = (success: boolean, message: string, provider = 'google') => {
      const params = new URLSearchParams({
        provider,
        success: String(success),
        message,
      });
      if (mobileScheme && ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
        // Redirect back to the native mobile app via its custom URI scheme
        res.redirect(`${mobileScheme}://oauth/callback?${params.toString()}`);
      } else {
        const frontendUrl =
          stateOrigin && isAllowedOrigin(stateOrigin, req.isStaging)
            ? stateOrigin
            : getDefaultFrontendUrl(req.isStaging);
        res.redirect(`${frontendUrl}/oauth/success?${params.toString()}`);
      }
    };

    if (oauthError) {
      logger.warn('[Google Callback] OAuth error returned by Google', { error: oauthError, uid });
      renderResult(
        false,
        oauthError === 'access_denied' ? 'Connection cancelled' : `Error: ${oauthError}`
      );
      return;
    }

    if (!code || !uid) {
      renderResult(false, 'Invalid callback — missing code or state');
      return;
    }

    const { db } = req.firebase!;

    const googleClientId = req.isStaging
      ? (process.env['STAGING_CLIENT_ID'] ?? process.env['CLIENT_ID'] ?? '')
      : (process.env['CLIENT_ID'] ?? '');
    const googleClientSecret = req.isStaging
      ? (process.env['STAGING_CLIENT_SECRET'] ?? process.env['CLIENT_SECRET'] ?? '')
      : (process.env['CLIENT_SECRET'] ?? '');

    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';
    const redirectUri = `${backendUrl}${pathPrefix}/auth/google/callback`;

    try {
      // Exchange code for tokens
      const params = new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        id_token?: string;
        error?: string;
        error_description?: string;
      };

      if (tokenData.error || !tokenData.refresh_token) {
        const errMsg = tokenData.error_description ?? tokenData.error ?? 'Token exchange failed';
        logger.warn('[Google Callback] Token exchange failed', {
          uid,
          error: tokenData.error,
          description: errMsg,
        });
        renderResult(false, errMsg);
        return;
      }

      // Decode id_token to get email
      let connectedEmail: string | undefined;
      if (tokenData.id_token) {
        try {
          const base64Url = tokenData.id_token.split('.')[1];
          if (base64Url) {
            const payload = JSON.parse(Buffer.from(base64Url, 'base64url').toString()) as {
              email?: string;
            };
            connectedEmail = payload.email;
          }
        } catch {
          /* ignore */
        }
      }

      // Store refresh token in Users/{uid}/emailTokens/gmail
      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection('emailTokens').doc('gmail');
      await tokenRef.set(
        {
          provider: 'gmail',
          refreshToken: tokenData.refresh_token,
          updatedAt: new Date().toISOString(),
          ...(connectedEmail && { email: connectedEmail }),
        },
        { merge: true }
      );

      // Update connectedEmails array on user document
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data() as
          | { connectedEmails?: Array<{ provider: string; email?: string }> }
          | undefined;
        const existing = userData?.connectedEmails ?? [];
        const filtered = existing.filter((e) => e.provider !== 'gmail');
        await userRef.update({
          connectedEmails: [
            ...filtered,
            {
              provider: 'gmail',
              isActive: true,
              connectedAt: new Date().toISOString(),
              ...(connectedEmail && { email: connectedEmail }),
            },
          ],
        });
        await invalidateProfileCaches(uid).catch((err) =>
          logger.warn('[Google Callback] Failed to invalidate profile cache', { uid, err })
        );
      }

      logger.info('[Google Callback] Gmail token saved', {
        uid: uid.substring(0, 8) + '...',
        email: connectedEmail,
      });
      renderResult(
        true,
        connectedEmail ? `Gmail connected (${connectedEmail})` : 'Gmail connected!'
      );
    } catch (err) {
      logger.error('[Google Callback] Unexpected error', { uid, error: err });
      renderResult(false, 'Connection failed. Please try again.');
    }
  })
);

/**
 * GET /auth/microsoft/connect-url
 *
 * Returns a Microsoft OAuth2 authorization URL whose redirect_uri points to
 * this backend (/auth/microsoft/callback).
 *
 * Requires a valid Firebase ID token (appGuard).
 * Returns: { url: string }
 */
router.get(
  '/microsoft/connect-url',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = req.user!.uid;

    const clientId = process.env['MICROSOFT_CLIENT_ID'] ?? '';
    if (!clientId) {
      sendError(res, internalError(new Error('Microsoft client ID not configured')));
      return;
    }

    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';
    const redirectUri = `${backendUrl}${pathPrefix}/auth/microsoft/callback`;

    const oauthUrl = new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    oauthUrl.searchParams.set('client_id', clientId);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_mode', 'query');
    oauthUrl.searchParams.set(
      'scope',
      'https://graph.microsoft.com/Mail.Send offline_access openid email https://graph.microsoft.com/User.Read'
    );
    oauthUrl.searchParams.set('prompt', 'consent');
    const origin = (req.query['origin'] as string | undefined)?.trim();
    const mobileScheme = (req.query['mobileScheme'] as string | undefined)?.trim();
    if (origin && !isAllowedOrigin(origin, req.isStaging)) {
      sendError(
        res,
        validationError([{ field: 'origin', message: 'Origin not allowed', rule: 'invalid' }])
      );
      return;
    }
    if (mobileScheme && !ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
      sendError(
        res,
        validationError([
          { field: 'mobileScheme', message: 'Unknown mobile scheme', rule: 'invalid' },
        ])
      );
      return;
    }
    const statePayload = mobileScheme
      ? encodeOAuthState(uid, '', mobileScheme)
      : origin
        ? encodeOAuthState(uid, origin)
        : uid;
    oauthUrl.searchParams.set('state', statePayload);

    logger.debug('[Microsoft Connect URL] Generated OAuth URL', {
      uid: uid.substring(0, 8) + '...',
      redirectUri,
      origin,
      mobileScheme,
    });

    res.json({ url: oauthUrl.toString() });
  })
);

/**
 * GET /auth/microsoft/callback
 *
 * Microsoft OAuth2 callback — receives ?code=...&state={uid}. Exchanges code,
 * stores refresh token in Users/{uid}/emailTokens/microsoft, renders success HTML.
 *
 * NO auth guard — called by Microsoft's redirect.
 */
router.get(
  '/microsoft/callback',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      code,
      state: rawState,
      error: oauthError,
      error_description: errorDescription,
    } = req.query as Record<string, string>;
    const { uid, origin: stateOrigin, mobileScheme } = decodeOAuthState(rawState ?? '');

    const renderResult = (success: boolean, message: string) => {
      const params = new URLSearchParams({
        provider: 'microsoft',
        success: String(success),
        message,
      });
      if (mobileScheme && ALLOWED_MOBILE_SCHEMES.has(mobileScheme)) {
        res.redirect(`${mobileScheme}://oauth/callback?${params.toString()}`);
      } else {
        const frontendUrl =
          stateOrigin && isAllowedOrigin(stateOrigin, req.isStaging)
            ? stateOrigin
            : getDefaultFrontendUrl(req.isStaging);
        res.redirect(`${frontendUrl}/oauth/success?${params.toString()}`);
      }
    };

    if (oauthError) {
      logger.warn('[Microsoft Callback] OAuth error', { error: oauthError, uid });
      // Microsoft often sends a second server_error callback after a successful auth — check if
      // token was already saved from the first callback and treat it as success if so.
      if (oauthError === 'server_error' && uid) {
        try {
          const { db: checkDb } = req.firebase!;
          const tokenDoc = await checkDb
            .collection('Users')
            .doc(uid)
            .collection('emailTokens')
            .doc('microsoft')
            .get();
          if (tokenDoc.exists) {
            logger.info(
              '[Microsoft Callback] server_error but token exists — treating as success',
              { uid: uid.substring(0, 8) + '...' }
            );
            renderResult(true, 'Microsoft connected!');
            return;
          }
        } catch {
          /* ignore — fall through to error */
        }
      }
      renderResult(
        false,
        oauthError === 'access_denied' ? 'Connection cancelled' : (errorDescription ?? oauthError)
      );
      return;
    }

    if (!code || !uid) {
      renderResult(false, 'Invalid callback — missing code or state');
      return;
    }

    const { db } = req.firebase!;

    const clientId = process.env['MICROSOFT_CLIENT_ID'] ?? '';
    const clientSecret = process.env['MICROSOFT_CLIENT_SECRET'] ?? '';
    const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
    const pathPrefix = req.isStaging ? '/api/v1/staging' : '/api/v1';
    const redirectUri = `${backendUrl}${pathPrefix}/auth/microsoft/callback`;

    try {
      const payload = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      const tokenResponse = await fetch(
        'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: payload.toString(),
        }
      );

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        id_token?: string;
        error?: string;
        error_description?: string;
      };

      if (tokenData.error || !tokenData.refresh_token) {
        const errMsg = tokenData.error_description ?? tokenData.error ?? 'Token exchange failed';
        logger.warn('[Microsoft Callback] Token exchange failed', {
          uid,
          error: tokenData.error,
          description: errMsg,
        });
        renderResult(false, errMsg);
        return;
      }

      // Get email from Microsoft Graph
      let connectedEmail: string | undefined;
      try {
        const graphResponse = await fetch(
          'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
          {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          }
        );
        const graphData = (await graphResponse.json()) as {
          mail?: string;
          userPrincipalName?: string;
        };
        connectedEmail = graphData.mail ?? graphData.userPrincipalName;
      } catch {
        /* ignore */
      }

      // Store refresh token
      const userRef = db.collection('Users').doc(uid);
      const tokenRef = userRef.collection('emailTokens').doc('microsoft');
      await tokenRef.set(
        {
          provider: 'microsoft',
          refreshToken: tokenData.refresh_token,
          accessToken: tokenData.access_token,
          updatedAt: new Date().toISOString(),
          ...(connectedEmail && { email: connectedEmail }),
        },
        { merge: true }
      );

      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data() as
          | { connectedEmails?: Array<{ provider: string; email?: string }> }
          | undefined;
        const existing = userData?.connectedEmails ?? [];
        const filtered = existing.filter((e) => e.provider !== 'microsoft');
        await userRef.update({
          connectedEmails: [
            ...filtered,
            {
              provider: 'microsoft',
              isActive: true,
              connectedAt: new Date().toISOString(),
              ...(connectedEmail && { email: connectedEmail }),
            },
          ],
        });
        await invalidateProfileCaches(uid).catch((err) =>
          logger.warn('[Microsoft Callback] Failed to invalidate profile cache', { uid, err })
        );
      }

      logger.info('[Microsoft Callback] Microsoft token saved', {
        uid: uid.substring(0, 8) + '...',
        email: connectedEmail,
      });
      renderResult(
        true,
        connectedEmail ? `Microsoft connected (${connectedEmail})` : 'Microsoft connected!'
      );
    } catch (err) {
      logger.error('[Microsoft Callback] Unexpected error', { uid, error: err });
      renderResult(false, 'Connection failed. Please try again.');
    }
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
    const googleClientSecret = req.isStaging
      ? (process.env['STAGING_CLIENT_SECRET'] ?? process.env['CLIENT_SECRET'] ?? '')
      : (process.env['CLIENT_SECRET'] ?? '');

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
      logger.debug('[Microsoft Connect Mail] Token exchange config', {
        redirectUri,
        isMobileRedirect,
        sendingClientSecret: !isMobileRedirect,
      });
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
            message: `Failed to exchange Microsoft authorization code: ${(errorData as Record<string, unknown>)['error_description'] || tokenResponse.statusText}`,
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
// PRE-FETCH SCRAPE (Optimistic — fires during onboarding Step 5)
// ============================================

/**
 * POST /auth/profile/preload-scrape
 *
 * Called from the frontend at Step 5 (Link Data Sources) of onboarding.
 * Enqueues the scraping job early so data extraction begins while the user
 * finishes Step 6 ("Before We Begin"). The final onboarding completion
 * endpoint skips scrape enqueue if a job already exists.
 */
router.post(
  '/profile/preload-scrape',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    // PRELOAD DISABLED: All scrapes are now deferred to the final onboarding completion
    // endpoint (/profile/onboarding) to ensure all core database documents (teams,
    // organizations, etc.) are fully created before the AI agent attempts to read them.
    res.json({
      success: true,
      skipped: true,
      reason: 'Deferred until onboarding completion for all roles',
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
