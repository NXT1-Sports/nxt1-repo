/**
 * @fileoverview Auth Routes — User Creation and Team Joining
 * @module @nxt1/backend/routes/auth
 *
 * Handles:
 * - POST /create-user
 * - POST /join-team
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { notFoundError, conflictError } from '@nxt1/core/errors';
import { isValidTeamCode, USER_SCHEMA_VERSION, isTeamRole } from '@nxt1/core';
import type { UserRole, SportProfile } from '@nxt1/core';
import { RosterEntryStatus } from '@nxt1/core/models';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { CreateUserDto, JoinTeamDto } from '../../dtos/auth.dto.js';
import { createRosterEntryService } from '../../services/team/roster-entry.service.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

/**
 * POST /auth/create-user
 * Create a new user in Firestore with optional team code association.
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
    }

    // Check if user already exists
    const existingUser = await db.collection('Users').doc(uid).get();
    if (existingUser.exists) {
      const error = conflictError('user');
      sendError(res, error);
      return;
    }

    const newUser: {
      [key: string]: unknown;
      teamCode?: {
        teamCode: string;
        teamName: string;
        teamId: string;
      };
      referralId?: string;
    } = {
      email: sanitizedEmail,
      onboardingCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      _schemaVersion: USER_SCHEMA_VERSION,
    };

    if (validatedTeam) {
      newUser.teamCode = {
        teamCode: validatedTeam.teamCode,
        teamName: validatedTeam.teamName,
        teamId: validatedTeam.id,
      };
    }

    if (referralId?.trim()) {
      newUser.referralId = referralId.trim();
    }

    if (validatedTeam) {
      await db.runTransaction(async (transaction) => {
        const userRef = db.collection('Users').doc(uid);
        transaction.set(userRef, newUser);
        // V2: Membership tracked via RosterEntry docs only.
      });
    } else {
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
 * Join a team using a team code (for users who signed up without one).
 */
router.post(
  '/join-team',
  validateBody(JoinTeamDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId, code } = req.body;

    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) {
      const error = notFoundError('user', userId);
      sendError(res, error);
      return;
    }

    const userData = userDoc.data();
    if (userData?.['teamCode']) {
      const error = conflictError('team-membership');
      sendError(res, error);
      return;
    }

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
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('Users').doc(userId);

      const userUpdate: Record<string, unknown> = {
        teamCode: {
          teamCode: teamData['teamCode'],
          teamName: teamData['teamName'],
          teamId: teamDoc.id,
        },
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (teamData['isFreeTrial'] && teamData['trialDays']) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + (teamData['trialDays'] as number));
        userUpdate['trialStartDate'] = FieldValue.serverTimestamp();
        userUpdate['trialEndDate'] = Timestamp.fromDate(trialEnd);
      }

      transaction.update(userRef, userUpdate);
      // V2: Membership tracked via RosterEntry docs only.
    });

    // Create RosterEntry for tracking membership in junction table
    try {
      const rosterService = createRosterEntryService(db);
      const freshUserData = (await db.collection('Users').doc(userId).get()).data();
      const userRole: UserRole = (freshUserData?.['role'] as UserRole | undefined) ?? 'athlete';
      const organizationId: string = teamData['organizationId'] ?? '';
      const teamSport: string = teamData['sport'] ?? '';
      const isStaffRole = isTeamRole(userRole);
      const rosterStatus = isStaffRole ? RosterEntryStatus.PENDING : RosterEntryStatus.ACTIVE;

      const sportProfiles = freshUserData?.['sports'] as SportProfile[] | undefined;
      const athletePositions =
        userRole === 'athlete'
          ? sportProfiles?.find(
              (s) => s.sport?.trim().toLowerCase() === teamSport.trim().toLowerCase()
            )?.positions
          : undefined;

      await rosterService.createRosterEntry({
        userId,
        teamId: teamDoc.id,
        organizationId,
        role: userRole,
        sport: teamSport,
        status: rosterStatus,
        ...(userRole === 'athlete' ? { positions: athletePositions } : {}),
        firstName: (freshUserData?.['firstName'] as string | undefined) ?? '',
        lastName: (freshUserData?.['lastName'] as string | undefined) ?? '',
        displayName:
          (freshUserData?.['displayName'] as string | undefined) ??
          [freshUserData?.['firstName'] ?? '', freshUserData?.['lastName'] ?? '']
            .map((v) => String(v).trim())
            .filter(Boolean)
            .join(' '),
        email: (freshUserData?.['email'] as string | undefined) ?? '',
      });

      logger.info('[POST /auth/join-team] RosterEntry created', {
        userId,
        teamId: teamDoc.id,
        role: userRole,
        status: rosterStatus,
      });
    } catch (rosterErr: unknown) {
      const msg = rosterErr instanceof Error ? rosterErr.message : String(rosterErr);
      if (!msg.includes('already')) {
        logger.warn('[POST /auth/join-team] RosterEntry creation failed (non-blocking)', {
          userId,
          teamId: teamDoc.id,
          error: msg,
        });
      }
    }

    res.json({
      success: true,
      teamName: teamData['teamName'],
    });
  })
);

export default router;
