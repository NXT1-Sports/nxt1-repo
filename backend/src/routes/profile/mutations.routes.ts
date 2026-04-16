/**
 * @fileoverview Profile — mutation routes.
 *
 * PUT  /:userId          — full profile update
 * POST /:userId/image    — update profile image
 * PUT  /:userId/sport    — update sport at index
 * POST /:userId/sport    — add sport (athlete: array push; coach/director: Team + RosterEntry)
 * DELETE /:userId/sport/:sportIndex — remove sport
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { UpdateProfileDto, UploadProfileImageDto } from '../../dtos/profile.dto.js';
import { createRosterEntryService } from '../../services/roster-entry.service.js';
import * as teamCodeService from '../../services/team-code.service.js';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, notFoundError, forbiddenError } from '@nxt1/core/errors';
import type { SportProfile } from '@nxt1/core';
import type { UpdateSportProfileRequest } from '@nxt1/core';
import { RosterEntryStatus } from '@nxt1/core/models';
import { isTeamRole } from '@nxt1/core';
import {
  USERS_COLLECTION,
  FieldValue,
  invalidateProfileCaches,
  generateUniqueTeamCode,
  type UserFirestoreDoc,
  docToUser,
} from './shared.js';

const router = Router();

// ─── PUT /:userId — full profile update ──────────────────────────────────────

router.put(
  '/:userId',
  appGuard,
  validateBody(UpdateProfileDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const body = req.body;

    const allowedFields: string[] = [
      'firstName',
      'lastName',
      'displayName',
      'username',
      'aboutMe',
      'bannerImg',
      'profileImgs',
      'gender',
      'measurables',
      'classOf',
      'location',
      'contact',
      'social',
      'sports',
      'activeSportIndex',
      'teamHistory',
      'awards',
      'connectedSources',
      'athlete',
      'coach',
      'director',
      'preferences',
    ];

    const updates: Partial<Record<string, unknown>> = {};
    for (const field of allowedFields) {
      if ((body as Record<string, unknown>)[field] !== undefined) {
        updates[field] = (body as Record<string, unknown>)[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      sendError(
        res,
        validationError([{ field: 'body', message: 'No valid fields to update', rule: 'required' }])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);

    const currentDoc = await userRef.get();
    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const currentUnicode = currentData['unicode'] as string | null | undefined;
    const currentRole = typeof currentData['role'] === 'string' ? currentData['role'] : null;

    if (isTeamRole(currentRole)) {
      const blockedFields = [
        'measurables',
        'classOf',
        'sports',
        'activeSportIndex',
        'teamHistory',
        'awards',
        'connectedSources',
        'athlete',
      ] as const;
      const blockedUpdates = blockedFields.filter((f) => updates[f] !== undefined);

      if (blockedUpdates.length > 0) {
        logger.warn('[Profile] Ignoring self-update fields blocked for team roles', {
          userId,
          role: currentRole,
          blockedUpdates,
        });
        for (const f of blockedUpdates) delete updates[f];
      }

      if (Object.keys(updates).length === 0) {
        sendError(
          res,
          validationError([
            {
              field: 'body',
              message: 'No valid fields to update for this role',
              rule: 'forbidden_fields',
            },
          ])
        );
        return;
      }
    }

    if (
      updates['displayName'] === undefined &&
      (updates['firstName'] !== undefined || updates['lastName'] !== undefined)
    ) {
      const nextFirstName =
        (typeof updates['firstName'] === 'string'
          ? updates['firstName']
          : currentData['firstName']) ?? '';
      const nextLastName =
        (typeof updates['lastName'] === 'string' ? updates['lastName'] : currentData['lastName']) ??
        '';
      updates['displayName'] = [nextFirstName, nextLastName]
        .map((v) => v.trim())
        .filter(Boolean)
        .join(' ');
    }

    updates['updatedAt'] = new Date().toISOString();
    await userRef.update(updates);

    const updatedDoc = await userRef.get();
    const updatedData = updatedDoc.data() as UserFirestoreDoc;
    const updatedUser = docToUser(updatedDoc.id, updatedData);

    const rosterEntryService = createRosterEntryService(db);
    await rosterEntryService.syncUserProfileToRosterEntries(
      userId,
      updatedData as Record<string, unknown>
    );

    await invalidateProfileCaches(userId, currentUnicode);

    logger.info('[Profile] Profile updated', { userId });
    res.json({ success: true, data: updatedUser });
  })
);

// ─── POST /:userId/image ───────────────────────────────────────────────────────

router.post(
  '/:userId/image',
  appGuard,
  validateBody(UploadProfileImageDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const { imageUrl } = req.body;

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const currentDoc = await userRef.get();

    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const currentUnicode = currentData['unicode'] as string | null | undefined;
    const existingImgs = (currentData['profileImgs'] as string[] | undefined) ?? [];
    const updatedImgs = [
      imageUrl.trim(),
      ...existingImgs.filter((img) => img !== imageUrl.trim()),
    ].slice(0, 5);

    await userRef.update({ profileImgs: updatedImgs, updatedAt: new Date().toISOString() });

    const rosterEntryService = createRosterEntryService(db);
    await rosterEntryService.syncUserProfileToRosterEntries(userId, {
      ...currentData,
      profileImgs: updatedImgs,
    });

    await invalidateProfileCaches(userId, currentUnicode);

    logger.info('[Profile] Profile image updated', { userId });
    res.json({ success: true, data: { url: imageUrl.trim() } });
  })
);

// ─── PUT /:userId/sport ────────────────────────────────────────────────────────

router.put(
  '/:userId/sport',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const { sportIndex, updates } = req.body as UpdateSportProfileRequest;

    if (
      sportIndex === undefined ||
      sportIndex === null ||
      !updates ||
      typeof updates !== 'object'
    ) {
      sendError(
        res,
        validationError([
          { field: 'sportIndex', message: 'sportIndex and updates are required', rule: 'required' },
        ])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const currentDoc = await userRef.get();

    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const sports: SportProfile[] = (currentData['sports'] as SportProfile[] | undefined) ?? [];

    if (sportIndex < 0 || sportIndex >= sports.length) {
      sendError(
        res,
        validationError([
          { field: 'sportIndex', message: `Invalid sportIndex: ${sportIndex}`, rule: 'range' },
        ])
      );
      return;
    }

    const updatedSport: SportProfile = { ...sports[sportIndex], ...updates } as SportProfile;
    const updatedSports = [...sports];
    updatedSports[sportIndex] = updatedSport;

    await userRef.update({ sports: updatedSports, updatedAt: new Date().toISOString() });

    const rosterEntryService = createRosterEntryService(db);
    await rosterEntryService.syncUserProfileToRosterEntries(userId, {
      ...currentData,
      sports: updatedSports,
    });

    const currentUnicode = currentData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUnicode);

    logger.info('[Profile] Sport updated', { userId, sportIndex });
    res.json({ success: true, data: updatedSport });
  })
);

// ─── POST /:userId/sport ───────────────────────────────────────────────────────

router.post(
  '/:userId/sport',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const sport = req.body as Partial<SportProfile> & { teamName?: string; teamType?: string };

    if (!sport.sport?.trim()) {
      sendError(
        res,
        validationError([{ field: 'sport', message: 'sport name is required', rule: 'required' }])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const currentDoc = await userRef.get();

    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const existingSports: SportProfile[] =
      (currentData['sports'] as SportProfile[] | undefined) ?? [];
    const newSport: SportProfile = { ...sport, order: existingSports.length } as SportProfile;

    const userRole = currentData['role'] as string | undefined;
    const isTeamRoleUser = userRole === 'coach' || userRole === 'director';

    if (isTeamRoleUser) {
      // ── COACH / DIRECTOR: Atomic Team + RosterEntry ──────────────────────
      const rosterEntries = await db
        .collection('RosterEntries')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      let inheritedTeamName = '';
      let inheritedTeamType = 'club';
      let inheritedOrgId = '';

      if (!rosterEntries.empty) {
        const entryData = rosterEntries.docs[0].data();
        inheritedOrgId = entryData['organizationId'] || '';
        if (entryData['teamId']) {
          const primaryTeamDoc = await db.collection('Teams').doc(entryData['teamId']).get();
          if (primaryTeamDoc.exists) {
            inheritedTeamName = primaryTeamDoc.data()?.['teamName'] || '';
            inheritedTeamType = primaryTeamDoc.data()?.['teamType'] || 'club';
            inheritedOrgId = inheritedOrgId || primaryTeamDoc.data()?.['organizationId'] || '';
          }
        }
      } else {
        const teamCodeObj = currentData['teamCode'] as Record<string, unknown> | undefined;
        if (teamCodeObj?.['teamName']) {
          inheritedTeamName = teamCodeObj['teamName'] as string;
          inheritedTeamType = (teamCodeObj['teamType'] as string) || 'club';
          inheritedOrgId = (teamCodeObj['organizationId'] as string) || '';
        }
      }

      if (!inheritedTeamName && sport.teamName?.trim()) {
        inheritedTeamName = sport.teamName.trim();
        inheritedTeamType = sport.teamType?.trim() || 'club';
      }

      if (!inheritedTeamName && userRole === 'director') {
        let orgSnap = await db
          .collection('Organizations')
          .where('createdBy', '==', userId)
          .limit(1)
          .get();
        if (orgSnap.empty) {
          orgSnap = await db
            .collection('Organizations')
            .where('ownerId', '==', userId)
            .limit(1)
            .get();
        }
        if (!orgSnap.empty) {
          const orgData = orgSnap.docs[0].data();
          inheritedOrgId = orgSnap.docs[0].id;
          inheritedTeamName =
            (orgData['name'] as string | undefined) ||
            (orgData['teamName'] as string | undefined) ||
            (orgData['organizationName'] as string | undefined) ||
            '';
          inheritedTeamType = (orgData['teamType'] as string | undefined) || 'organization';
        }
      }

      if (!inheritedTeamName) {
        logger.warn('[Profile] Coach/Director has no primary team — cannot add sport', { userId });
        sendError(
          res,
          validationError([
            {
              field: 'sport',
              message: 'No primary team found. Complete onboarding first.',
              rule: 'required',
            },
          ])
        );
        return;
      }

      try {
        const batch = db.batch();
        const candidateCode = await generateUniqueTeamCode(db);

        const team = await teamCodeService.createTeamCode(
          db,
          {
            teamCode: candidateCode,
            teamName: inheritedTeamName,
            teamType: inheritedTeamType as
              | 'high-school'
              | 'club'
              | 'college'
              | 'middle-school'
              | 'juco'
              | 'organization',
            sport: newSport.sport as string,
            createdBy: userId,
            creatorRole: userRole as 'athlete' | 'coach' | 'director',
            creatorName:
              `${currentData['firstName'] || ''} ${currentData['lastName'] || ''}`.trim(),
            creatorEmail: currentData['email'] || '',
            creatorPhoneNumber: currentData['phoneNumber'] || '',
          },
          batch
        );

        if (inheritedOrgId) {
          batch.update(db.collection('Teams').doc(team.id!), {
            organizationId: inheritedOrgId,
            isClaimed: true,
          });
        }

        const rosterEntryService = createRosterEntryService(db);
        await rosterEntryService.createRosterEntry(
          {
            userId,
            teamId: team.id!,
            organizationId: inheritedOrgId,
            role: userRole,
            sport: newSport.sport as string,
            status: RosterEntryStatus.ACTIVE,
            firstName: (currentData['firstName'] as string) || '',
            lastName: (currentData['lastName'] as string) || '',
            displayName: (
              (currentData['displayName'] as string | undefined) ??
              `${currentData['firstName'] || ''} ${currentData['lastName'] || ''}`
            ).trim(),
            email: (currentData['email'] as string) || '',
            phoneNumber: (currentData['phoneNumber'] as string) || '',
            profileImgs: (currentData['profileImgs'] as string[]) || [],
          },
          batch
        );

        await batch.commit();

        logger.info('[Profile] Atomic sport+team+roster created for coach/director', {
          userId,
          teamId: team.id,
          sport: newSport.sport,
        });

        const currentUnicode = currentData['unicode'] as string | null | undefined;
        await invalidateProfileCaches(userId, currentUnicode);

        res.status(201).json({ success: true, data: { sport: newSport.sport, teamId: team.id } });
        return;
      } catch (err) {
        logger.error('[Profile] Atomic team creation failed for added sport', {
          error: err,
          userId,
        });
        sendError(
          res,
          validationError([
            { field: 'sport', message: 'Failed to create team for this sport', rule: 'server' },
          ])
        );
        return;
      }
    }

    // ── ATHLETE: Write sport directly to user.sports[] ────────────────────
    await userRef.update({
      sports: FieldValue.arrayUnion(newSport),
      updatedAt: new Date().toISOString(),
    });

    const rosterEntryService = createRosterEntryService(db);
    await rosterEntryService.syncUserProfileToRosterEntries(userId, {
      ...currentData,
      sports: [...existingSports, newSport],
    });

    const currentUnicode = currentData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUnicode);

    logger.info('[Profile] Sport added', { userId, sport: newSport.sport });
    res.status(201).json({ success: true, data: newSport });
  })
);

// ─── DELETE /:userId/sport/:sportIndex ────────────────────────────────────────

router.delete(
  '/:userId/sport/:sportIndex',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sportIndex: sportIndexStr } = req.params as {
      userId: string;
      sportIndex: string;
    };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const sportIndex = parseInt(sportIndexStr, 10);
    if (isNaN(sportIndex) || sportIndex < 0) {
      sendError(
        res,
        validationError([
          {
            field: 'sportIndex',
            message: 'sportIndex must be a non-negative integer',
            rule: 'range',
          },
        ])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const currentDoc = await userRef.get();

    if (!currentDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const currentData = currentDoc.data() as UserFirestoreDoc;
    const sports: SportProfile[] = (currentData['sports'] as SportProfile[] | undefined) ?? [];

    if (sportIndex >= sports.length) {
      sendError(
        res,
        validationError([
          { field: 'sportIndex', message: `No sport at index ${sportIndex}`, rule: 'range' },
        ])
      );
      return;
    }

    const updatedSports = sports
      .filter((_, idx) => idx !== sportIndex)
      .map((s, idx) => ({ ...s, order: idx }));

    await userRef.update({ sports: updatedSports, updatedAt: new Date().toISOString() });

    const rosterEntryService = createRosterEntryService(db);
    await rosterEntryService.syncUserProfileToRosterEntries(userId, {
      ...currentData,
      sports: updatedSports,
    });

    const currentUnicode = currentData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUnicode);

    logger.info('[Profile] Sport removed', { userId, sportIndex });
    res.json({ success: true, data: null });
  })
);

export default router;
