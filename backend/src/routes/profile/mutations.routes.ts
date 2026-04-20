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
import { isTeamRole, PROFILE_UI_CONFIG } from '@nxt1/core';
import { CLOUDFLARE_API_BASE_URL } from '../upload/shared.js';
import {
  USERS_COLLECTION,
  FieldValue,
  invalidateProfileCaches,
  generateUniqueTeamCode,
  type UserFirestoreDoc,
  docToUser,
} from './shared.js';

const router = Router();
const POSTS_COLLECTION = 'Posts';
const PLAYER_STATS_COLLECTION = 'PlayerStats';
const RANKINGS_COLLECTION = 'Rankings';
const EVENTS_COLLECTION = 'Events';
const RECRUITING_COLLECTION = 'Recruiting';
const SCHEDULE_COLLECTION = 'Schedule';
const NEWS_COLLECTION = 'News';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the Firestore collection name and real document ID from a composite
 * feed item ID (e.g. "stat-ABCDEF" → PlayerStats / "ABCDEF").
 *
 * Metric groups are virtual (their IDs are base64url-encoded composite keys,
 * not real Firestore document IDs) and are flagged with isMetricGroup: true.
 */
type ResolvedItem =
  | { isMetricGroup: false; collection: string; docId: string }
  | { isMetricGroup: true; groupId: string };

function resolveCollectionAndDocId(itemId: string): ResolvedItem {
  if (itemId.startsWith('stat-')) {
    return { isMetricGroup: false, collection: PLAYER_STATS_COLLECTION, docId: itemId.slice(5) };
  }
  if (itemId.startsWith('metric-')) {
    return { isMetricGroup: true, groupId: itemId.slice(7) };
  }
  if (itemId.startsWith('ranking-')) {
    return { isMetricGroup: false, collection: RANKINGS_COLLECTION, docId: itemId.slice(8) };
  }
  if (itemId.startsWith('event-')) {
    return { isMetricGroup: false, collection: EVENTS_COLLECTION, docId: itemId.slice(6) };
  }
  // All recruiting sub-types (offer, commitment, visit, camp) live in the
  // Recruiting collection. The frontend prefixes them differently for display
  // discrimination but the real Firestore doc ID is always the suffix.
  if (itemId.startsWith('recruiting-')) {
    return { isMetricGroup: false, collection: RECRUITING_COLLECTION, docId: itemId.slice(11) };
  }
  if (itemId.startsWith('commitment-')) {
    return { isMetricGroup: false, collection: RECRUITING_COLLECTION, docId: itemId.slice(11) };
  }
  if (itemId.startsWith('visit-')) {
    return { isMetricGroup: false, collection: RECRUITING_COLLECTION, docId: itemId.slice(6) };
  }
  if (itemId.startsWith('camp-')) {
    return { isMetricGroup: false, collection: RECRUITING_COLLECTION, docId: itemId.slice(5) };
  }
  if (itemId.startsWith('schedule-')) {
    return { isMetricGroup: false, collection: SCHEDULE_COLLECTION, docId: itemId.slice(9) };
  }
  if (itemId.startsWith('news-')) {
    return { isMetricGroup: false, collection: NEWS_COLLECTION, docId: itemId.slice(5) };
  }
  // Default: Posts collection (no prefix)
  return { isMetricGroup: false, collection: POSTS_COLLECTION, docId: itemId };
}

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

// ─── PATCH /:userId/posts/:postId/pin ────────────────────────────────────────

router.patch(
  '/:userId/posts/:postId/pin',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, postId } = req.params as { userId: string; postId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const requestedPinState = (req.body as Record<string, unknown> | undefined)?.['isPinned'];
    if (typeof requestedPinState !== 'boolean') {
      sendError(
        res,
        validationError([
          { field: 'isPinned', message: 'isPinned must be a boolean', rule: 'invalid' },
        ])
      );
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    const userData = userDoc.data() as UserFirestoreDoc;
    const resolved = resolveCollectionAndDocId(postId);

    // ──────────────────────────────────────────────────────────────────────────
    // Metric groups: virtual IDs stored in Users.pinnedMetricGroups array
    // ──────────────────────────────────────────────────────────────────────────
    if (resolved.isMetricGroup) {
      const pinnedMetricGroups: string[] = Array.isArray(userData['pinnedMetricGroups'])
        ? [...(userData['pinnedMetricGroups'] as string[])]
        : [];
      const currentIsPinned = pinnedMetricGroups.includes(resolved.groupId);
      const countDelta =
        requestedPinState && !currentIsPinned ? 1 : !requestedPinState && currentIsPinned ? -1 : 0;

      if (requestedPinState && !currentIsPinned) {
        const currentPinnedCount =
          typeof userData['pinnedCount'] === 'number' ? (userData['pinnedCount'] as number) : 0;
        if (currentPinnedCount >= PROFILE_UI_CONFIG.maxPinnedPosts) {
          sendError(
            res,
            validationError([
              {
                field: 'isPinned',
                message: `You can pin up to ${PROFILE_UI_CONFIG.maxPinnedPosts} items`,
                rule: 'max',
              },
            ])
          );
          return;
        }
        pinnedMetricGroups.push(resolved.groupId);
      } else if (!requestedPinState) {
        const idx = pinnedMetricGroups.indexOf(resolved.groupId);
        if (idx !== -1) pinnedMetricGroups.splice(idx, 1);
      }

      const userUpdates: Record<string, unknown> = {
        pinnedMetricGroups,
        updatedAt: new Date().toISOString(),
      };
      if (countDelta !== 0) {
        userUpdates['pinnedCount'] = FieldValue.increment(countDelta);
      }
      await userRef.update(userUpdates);

      const currentUnicode = userData['unicode'] as string | null | undefined;
      await invalidateProfileCaches(userId, currentUnicode);

      logger.info('[Profile] Metric group pin state updated', {
        userId,
        postId,
        isPinned: requestedPinState,
      });
      res.json({ success: true, data: { postId, isPinned: requestedPinState } });
      return;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // All other types: store isPinned on the item's own Firestore document
    // ──────────────────────────────────────────────────────────────────────────
    const itemRef = db.collection(resolved.collection).doc(resolved.docId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      sendError(res, notFoundError('post'));
      return;
    }

    const itemData = itemDoc.data() as Record<string, unknown>;
    if (itemData['userId'] !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const currentIsPinned = !!itemData['isPinned'];
    const countDelta =
      requestedPinState && !currentIsPinned ? 1 : !requestedPinState && currentIsPinned ? -1 : 0;

    if (requestedPinState && !currentIsPinned) {
      const currentPinnedCount =
        typeof userData['pinnedCount'] === 'number' ? (userData['pinnedCount'] as number) : 0;
      if (currentPinnedCount >= PROFILE_UI_CONFIG.maxPinnedPosts) {
        sendError(
          res,
          validationError([
            {
              field: 'isPinned',
              message: `You can pin up to ${PROFILE_UI_CONFIG.maxPinnedPosts} items`,
              rule: 'max',
            },
          ])
        );
        return;
      }
    }

    const batch = db.batch();
    batch.update(itemRef, {
      isPinned: requestedPinState,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (countDelta !== 0) {
      batch.update(userRef, {
        pinnedCount: FieldValue.increment(countDelta),
        updatedAt: new Date().toISOString(),
      });
    }
    await batch.commit();

    const currentUnicode = userData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUnicode);

    logger.info('[Profile] Item pin state updated', {
      userId,
      postId,
      collection: resolved.collection,
      isPinned: requestedPinState,
    });

    res.json({ success: true, data: { postId, isPinned: requestedPinState } });
  })
);

// ─── DELETE /:userId/posts/:postId ───────────────────────────────────────────

router.delete(
  '/:userId/posts/:postId',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, postId } = req.params as { userId: string; postId: string };
    const requestingUid = req.user!.uid;

    if (requestingUid !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(userId);

    // Route to the correct Firestore collection based on item ID prefix
    const resolved = resolveCollectionAndDocId(postId);

    // Metric groups are virtual composite IDs — individual docs can't be targeted
    if (resolved.isMetricGroup) {
      sendError(
        res,
        validationError([
          {
            field: 'postId',
            message: 'Metric group items cannot be individually deleted',
            rule: 'invalid',
          },
        ])
      );
      return;
    }

    const itemRef = db.collection(resolved.collection).doc(resolved.docId);
    const [userDoc, itemDoc] = await Promise.all([userRef.get(), itemRef.get()]);

    if (!userDoc.exists) {
      sendError(res, notFoundError('profile'));
      return;
    }

    if (!itemDoc.exists) {
      sendError(res, notFoundError('post'));
      return;
    }

    const userData = userDoc.data() as UserFirestoreDoc;
    const itemData = itemDoc.data() as Record<string, unknown>;

    if (itemData['userId'] !== userId) {
      sendError(res, forbiddenError());
      return;
    }

    const wasItemPinned = !!itemData['isPinned'];

    await itemRef.delete();

    // Decrement pinnedCount if this item was pinned
    if (wasItemPinned) {
      await userRef.update({
        pinnedCount: FieldValue.increment(-1),
        updatedAt: new Date().toISOString(),
      });
    }

    const currentUnicode = userData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUnicode);

    // Best-effort: delete the Cloudflare Stream asset if this was a Post with a video.
    // Only Posts carry a cloudflareVideoId.
    if (resolved.collection === POSTS_COLLECTION) {
      const cloudflareVideoId =
        typeof itemData['cloudflareVideoId'] === 'string'
          ? (itemData['cloudflareVideoId'] as string)
          : null;

      if (cloudflareVideoId) {
        const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
        const apiToken = process.env['CLOUDFLARE_API_TOKEN'];

        if (accountId && apiToken) {
          try {
            const cfDeleteUrl = `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/${cloudflareVideoId}`;
            const cfRes = await fetch(cfDeleteUrl, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (cfRes.ok) {
              logger.info('[Profile] Cloudflare Stream asset deleted', {
                userId,
                postId,
                cloudflareVideoId,
              });
            } else {
              let cfBody: unknown;
              try {
                cfBody = await cfRes.json();
              } catch {
                cfBody = null;
              }
              logger.warn('[Profile] Cloudflare Stream asset deletion returned non-OK', {
                userId,
                postId,
                cloudflareVideoId,
                status: cfRes.status,
                body: cfBody,
              });
            }
          } catch (cfErr) {
            logger.error('[Profile] Cloudflare Stream asset deletion threw', {
              userId,
              postId,
              cloudflareVideoId,
              error: cfErr instanceof Error ? cfErr.message : String(cfErr),
            });
          }
        } else {
          logger.warn('[Profile] Cloudflare env vars missing — Stream asset not deleted', {
            userId,
            postId,
            cloudflareVideoId,
          });
        }
      }
    }

    logger.info('[Profile] Item deleted', { userId, postId, collection: resolved.collection });

    res.json({ success: true, data: { postId } });
  })
);

export default router;
