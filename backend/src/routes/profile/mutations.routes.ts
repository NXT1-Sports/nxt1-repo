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
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { UpdateProfileDto, UploadProfileImageDto } from '../../dtos/profile.dto.js';
import { provisionOnboardingPrograms } from '../../services/platform/onboarding-program-provisioning.service.js';
import { assertCanMutateOwnSports } from '../../services/profile/profile-sport-governance.service.js';
import { createRosterEntryService } from '../../services/team/roster-entry.service.js';
import { enqueueLinkedAccountScrape } from '../../modules/agent/services/agent-scrape.service.js';
import * as teamCodeService from '../../services/team/team-code.service.js';
import { mergeConnectedSources } from '@nxt1/core/profile';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError, notFoundError, forbiddenError } from '@nxt1/core/errors';
import type { ConnectedSource, SportProfile, UserRole } from '@nxt1/core';
import type { UpdateSportProfileRequest } from '@nxt1/core';
import type { TeamSelectionFormData } from '@nxt1/core/api';
import { RosterEntryStatus } from '@nxt1/core/models';
import { isTeamRole, PROFILE_UI_CONFIG } from '@nxt1/core';
import { CLOUDFLARE_API_BASE_URL } from '../core/upload/shared.js';
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
type ManagedUserRole = 'athlete' | 'coach' | 'director';

function normalizeIncomingConnectedSources(value: unknown): ConnectedSource[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry): entry is ConnectedSource =>
        !!entry &&
        typeof entry === 'object' &&
        typeof entry.platform === 'string' &&
        typeof entry.profileUrl === 'string'
    )
    .map((entry) => ({
      platform: entry.platform.trim().toLowerCase(),
      profileUrl: entry.profileUrl.trim(),
      scopeType: entry.scopeType,
      scopeId:
        typeof entry.scopeId === 'string' && entry.scopeId.trim() ? entry.scopeId : undefined,
    }))
    .filter((entry) => entry.platform.length > 0 && entry.profileUrl.length > 0);
}

async function enqueueAddSportScrape(options: {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly role: UserRole;
  readonly sport: string;
  readonly linkedAccounts: readonly ConnectedSource[];
  readonly teamId?: string;
  readonly organizationId?: string;
  readonly environment: 'staging' | 'production';
}): Promise<{
  readonly scrapeJobId?: string;
  readonly scrapeJobIds?: readonly string[];
  readonly scrapeThreadId?: string;
}> {
  if (options.linkedAccounts.length === 0) {
    return {};
  }

  try {
    const scrapeResult = await enqueueLinkedAccountScrape(
      options.db,
      {
        userId: options.userId,
        role: options.role,
        sport: options.sport,
        linkedAccounts: options.linkedAccounts.map((source) => ({
          platform: source.platform,
          profileUrl: source.profileUrl,
        })),
        teamId: options.teamId,
        organizationId: options.organizationId,
      },
      options.environment
    );

    const operationIds = scrapeResult?.operationIds ?? [];
    return {
      ...(operationIds[0] ? { scrapeJobId: operationIds[0], scrapeJobIds: operationIds } : {}),
      ...(scrapeResult?.threadId ? { scrapeThreadId: scrapeResult.threadId } : {}),
    };
  } catch (err) {
    logger.error('[Profile] Failed to enqueue linked account scrape for added sport', {
      userId: options.userId,
      sport: options.sport,
      error: err,
    });
    return {};
  }
}

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
    await assertCanMutateOwnSports(db, userId);
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

    await userRef.update({ profileImgs: updatedImgs, updatedAt: FieldValue.serverTimestamp() });

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
    await assertCanMutateOwnSports(db, userId);
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

    await userRef.update({ sports: updatedSports, updatedAt: FieldValue.serverTimestamp() });

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

    const sport = req.body as Partial<SportProfile> & {
      teamName?: string;
      teamType?: string;
      teamSelection?: TeamSelectionFormData;
      connectedSources?: readonly ConnectedSource[];
    };

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
    const incomingConnectedSources = normalizeIncomingConnectedSources(sport.connectedSources);
    const newSport: SportProfile = { ...sport, order: existingSports.length } as SportProfile;
    const agentEnv = req.isStaging ? 'staging' : 'production';

    const userRole = currentData['role'] as string | undefined;
    const isTeamRoleUser = userRole === 'coach' || userRole === 'director';
    const managedRole: ManagedUserRole =
      userRole === 'coach' || userRole === 'director' ? userRole : 'athlete';
    const teamSelection =
      sport.teamSelection &&
      Array.isArray(sport.teamSelection.teams) &&
      sport.teamSelection.teams.length > 0
        ? sport.teamSelection
        : undefined;
    const location = currentData['location'] as { city?: string; state?: string } | undefined;
    const fallbackCoachTitle =
      existingSports.find((entry) => entry.team?.title)?.team?.title ||
      (currentData['coachTitle'] as string | undefined);

    let provisionedTeam: { teamId: string; organizationId: string; orgName: string } | undefined;
    let provisionedTeamIds: string[] = [];

    if (teamSelection) {
      try {
        const provisionResult = await provisionOnboardingPrograms({
          db,
          userId,
          role: managedRole,
          sports: [newSport],
          currentUser: {
            firstName: (currentData['firstName'] as string | undefined) ?? '',
            lastName: (currentData['lastName'] as string | undefined) ?? '',
            displayName: (currentData['displayName'] as string | undefined) ?? undefined,
            email: (currentData['email'] as string | undefined) ?? undefined,
            contact: {
              phone:
                (currentData['contact'] as { phone?: string } | undefined)?.phone ??
                (currentData['phoneNumber'] as string | undefined),
            },
            profileImgs: (currentData['profileImgs'] as string[] | undefined) ?? [],
          },
          updateData: {
            firstName: (currentData['firstName'] as string | undefined) ?? '',
            lastName: (currentData['lastName'] as string | undefined) ?? '',
            profileImgs: (currentData['profileImgs'] as string[] | undefined) ?? [],
            coachTitle: fallbackCoachTitle,
            athlete:
              typeof currentData['classOf'] === 'number'
                ? { classOf: currentData['classOf'] as number }
                : undefined,
            location: location
              ? {
                  city: location.city,
                  state: location.state,
                }
              : undefined,
          },
          teamSelection: {
            teams: teamSelection.teams ? [...teamSelection.teams] : undefined,
          },
        });

        provisionedTeamIds = provisionResult.teamIds;
        provisionedTeam = provisionResult.sportTeamMap.get(newSport.sport.trim().toLowerCase());

        if (provisionedTeam) {
          const primarySelection = teamSelection.teams[0];
          newSport.team = {
            ...(newSport.team ?? {}),
            name: provisionedTeam.orgName,
            teamId: provisionedTeam.teamId,
            organizationId: provisionedTeam.organizationId,
            type: (newSport.team?.type ||
              primarySelection?.teamType ||
              (isTeamRoleUser ? 'organization' : 'high-school')) as import('@nxt1/core').TeamType,
          };
        }
      } catch (err) {
        logger.error('[Profile] Failed to provision selected organization for new sport', {
          error: err,
          userId,
          sport: newSport.sport,
        });
        sendError(
          res,
          validationError([
            {
              field: 'teamSelection',
              message: 'Failed to connect this sport to the selected organization.',
              rule: 'server',
            },
          ])
        );
        return;
      }
    }

    if (isTeamRoleUser) {
      if (teamSelection) {
        if (incomingConnectedSources.length > 0 && provisionedTeamIds.length > 0) {
          await Promise.all(
            provisionedTeamIds.map(async (teamId) => {
              const teamRef = db.collection('Teams').doc(teamId);
              const teamDoc = await teamRef.get();
              const existingSources = normalizeIncomingConnectedSources(
                teamDoc.data()?.['connectedSources']
              );
              await teamRef.update({
                connectedSources: mergeConnectedSources(existingSources, incomingConnectedSources),
                updatedAt: FieldValue.serverTimestamp(),
              });
            })
          );
        }

        // Add the new sport to the user's profile and make it the active sport
        // so the UI immediately reflects the just-added sport in the switcher.
        await userRef.update({
          sports: FieldValue.arrayUnion(newSport),
          activeSportIndex: existingSports.length,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Sync roster entry profile data
        const rosterEntryService = createRosterEntryService(db);
        await rosterEntryService.syncUserProfileToRosterEntries(userId, {
          ...currentData,
          sports: [...existingSports, newSport],
        });

        const currentUnicode = currentData['unicode'] as string | null | undefined;
        await invalidateProfileCaches(userId, currentUnicode);

        const scrapeMeta = await enqueueAddSportScrape({
          db,
          userId,
          role: ((currentData['role'] as string | undefined) ?? 'athlete') as UserRole,
          sport: newSport.sport as string,
          linkedAccounts: incomingConnectedSources,
          teamId: provisionedTeamIds[0] ?? provisionedTeam?.teamId,
          organizationId: provisionedTeam?.organizationId,
          environment: agentEnv,
        });

        res.status(201).json({
          success: true,
          data: {
            sport: newSport.sport,
            teamId: provisionedTeamIds[0] ?? provisionedTeam?.teamId,
            ...scrapeMeta,
          },
        });
        return;
      }

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

        // Dedup: if a Team for this (orgId, sport) already exists, reuse it
        // rather than creating a duplicate. Mirrors `ensureTeamForSport` from
        // the onboarding-program-provisioning service.
        let reusedTeamId: string | undefined;
        let reusedTeamCode: string | undefined;
        if (inheritedOrgId) {
          const existingTeamSnap = await db
            .collection('Teams')
            .where('organizationId', '==', inheritedOrgId)
            .where('sport', '==', newSport.sport)
            .where('isActive', '==', true)
            .limit(1)
            .get();
          const existingTeamDoc = existingTeamSnap.docs[0];
          if (existingTeamDoc) {
            reusedTeamId = existingTeamDoc.id;
            reusedTeamCode = existingTeamDoc.data()?.['teamCode'] as string | undefined;
          }
        }

        const candidateCode = reusedTeamId ? '' : await generateUniqueTeamCode(db);

        const team = reusedTeamId
          ? { id: reusedTeamId, teamCode: reusedTeamCode }
          : await teamCodeService.createTeamCode(
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

        if (inheritedOrgId && !reusedTeamId) {
          batch.update(db.collection('Teams').doc(team.id!), {
            organizationId: inheritedOrgId,
            isClaimed: true,
          });
        }

        // Backfill newSport.team so the sport switcher / team route resolution
        // can navigate to the new team without a roundtrip refresh. Without
        // this, `resolveTeamRouteForSportIndex` returns null and /profile
        // bounces back to the OLD primary team.
        newSport.team = {
          ...(newSport.team ?? {}),
          name: inheritedTeamName,
          teamId: team.id!,
          ...(inheritedOrgId ? { organizationId: inheritedOrgId } : {}),
          ...(team.teamCode ? { teamCode: team.teamCode } : {}),
          type: (newSport.team?.type || inheritedTeamType) as import('@nxt1/core').TeamType,
        };

        const rosterEntryService = createRosterEntryService(db);
        // Skip duplicate roster entry if reusing an existing team and an
        // active/pending entry already links this user to the team.
        const existingRoster = reusedTeamId
          ? await rosterEntryService.getActiveOrPendingRosterEntry(userId, reusedTeamId)
          : null;
        if (!existingRoster)
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
              unicode: ((currentData['unicode'] as string | undefined) ?? userId).trim(),
              profileCode: (
                (currentData['profileCode'] as string | undefined) ??
                (currentData['unicode'] as string | undefined) ??
                userId
              ).trim(),
              email: (currentData['email'] as string) || '',
              phoneNumber: (currentData['phoneNumber'] as string) || '',
              profileImgs: (currentData['profileImgs'] as string[]) || [],
            },
            batch
          );

        // Add the new sport to the user's profile atomically and activate it
        // so the switcher / team route immediately reflects the new sport.
        batch.update(userRef, {
          sports: FieldValue.arrayUnion(newSport),
          activeSportIndex: existingSports.length,
          updatedAt: FieldValue.serverTimestamp(),
        });

        await batch.commit();

        logger.info('[Profile] Atomic sport+team+roster created for coach/director', {
          userId,
          teamId: team.id,
          reusedTeam: !!reusedTeamId,
          sport: newSport.sport,
        });

        if (incomingConnectedSources.length > 0 && team.id) {
          const teamRef = db.collection('Teams').doc(team.id);
          const teamDoc = await teamRef.get();
          const existingSources = normalizeIncomingConnectedSources(
            teamDoc.data()?.['connectedSources']
          );
          await teamRef.update({
            connectedSources: mergeConnectedSources(existingSources, incomingConnectedSources),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Sync roster entry profile data
        await rosterEntryService.syncUserProfileToRosterEntries(userId, {
          ...currentData,
          sports: [...existingSports, newSport],
        });

        const currentUnicode = currentData['unicode'] as string | null | undefined;
        await invalidateProfileCaches(userId, currentUnicode);

        const scrapeMeta = await enqueueAddSportScrape({
          db,
          userId,
          role: ((currentData['role'] as string | undefined) ?? 'athlete') as UserRole,
          sport: newSport.sport as string,
          linkedAccounts: incomingConnectedSources,
          teamId: team.id,
          organizationId: inheritedOrgId || undefined,
          environment: agentEnv,
        });

        res.status(201).json({
          success: true,
          data: { sport: newSport.sport, teamId: team.id, ...scrapeMeta },
        });
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
    const existingUserConnectedSources = normalizeIncomingConnectedSources(
      currentData['connectedSources']
    );

    await userRef.update({
      sports: FieldValue.arrayUnion(newSport),
      activeSportIndex: existingSports.length,
      ...(incomingConnectedSources.length > 0
        ? {
            connectedSources: mergeConnectedSources(
              existingUserConnectedSources,
              incomingConnectedSources
            ),
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const rosterEntryService = createRosterEntryService(db);
    await rosterEntryService.syncUserProfileToRosterEntries(userId, {
      ...currentData,
      sports: [...existingSports, newSport],
    });

    const currentUnicode = currentData['unicode'] as string | null | undefined;
    await invalidateProfileCaches(userId, currentUnicode);

    const scrapeMeta = await enqueueAddSportScrape({
      db,
      userId,
      role: ((currentData['role'] as string | undefined) ?? 'athlete') as UserRole,
      sport: newSport.sport as string,
      linkedAccounts: incomingConnectedSources,
      teamId: newSport.team?.teamId,
      organizationId: newSport.team?.organizationId,
      environment: agentEnv,
    });

    logger.info('[Profile] Sport added', { userId, sport: newSport.sport });
    res.status(201).json({
      success: true,
      data: {
        sport: newSport.sport,
        ...(newSport.team?.teamId ? { teamId: newSport.team.teamId } : {}),
        ...scrapeMeta,
      },
    });
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

    await userRef.update({ sports: updatedSports, updatedAt: FieldValue.serverTimestamp() });

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
        updatedAt: FieldValue.serverTimestamp(),
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
        updatedAt: FieldValue.serverTimestamp(),
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
        updatedAt: FieldValue.serverTimestamp(),
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
