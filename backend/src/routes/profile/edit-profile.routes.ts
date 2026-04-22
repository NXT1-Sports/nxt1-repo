/**
 * @fileoverview Edit Profile Routes
 * @module @nxt1/backend/routes/edit-profile
 *
 * Profile editing feature routes.
 * Mounted on /api/v1/profile in backend/src/index.ts
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '@nxt1/core/errors/express';
import { notFoundError, forbiddenError, fieldError } from '@nxt1/core/errors';
import type { User, SportProfile, TeamType, UserRole, VerifiedMetric } from '@nxt1/core';
import { formatFileSize, TEAM_TYPES, SPORT_POSITIONS, normalizeSportKey } from '@nxt1/core';
import { invalidateProfileCaches } from './shared.js';
import { enqueueWelcomeGraphicIfReady } from '../../modules/agent/services/agent-welcome.service.js';
import { createRosterEntryService } from '../../services/team/roster-entry.service.js';
import {
  createProfileWriteAccessService,
  type ProfileWriteAccessGrant,
  getAuthorizedTargetSportSelections,
} from '../../services/profile/profile-write-access.service.js';
import type {
  EditProfileData,
  EditProfileFormData,
  EditProfileSectionId,
  EditProfileUpdateResponse,
  EditProfileBasicInfo,
  EditProfilePhotos,
  EditProfileSportsInfo,
  EditProfileAcademics,
  EditProfilePhysical,
  EditProfileContact,
} from '@nxt1/core/edit-profile';
import { SyncDiffService } from '../../modules/agent/sync/index.js';
import {
  buildDistilledProfileFromUserRecord,
  buildPreviousStateFromUserRecord,
} from '../../modules/agent/sync/manual-sync-state.helpers.js';
import { onDailySyncComplete } from '../../modules/agent/triggers/trigger.listeners.js';

const router: ExpressRouter = Router();

const USERS_COLLECTION = 'Users';
const DELEGATED_EDITABLE_SECTIONS = new Set<EditProfileSectionId>([
  'sports-info',
  'academics',
  'physical',
]);

// ============================================
// MULTER CONFIGURATION FOR FILE UPLOADS
// ============================================

/**
 * Multer memory storage - files stored in memory for processing
 */
const storage = multer.memoryStorage();

/**
 * File filter to validate MIME types
 */
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

/**
 * Multer upload middleware
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1, // Single file upload
  },
});

/**
 * Upload buffer to Firebase Storage
 * Uses staging or production bucket based on request context
 */
async function uploadToStorage(
  buffer: Buffer,
  storagePath: string,
  contentType: string,
  storage: ReturnType<typeof getStorage>
): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000', // 1 year cache
    },
  });

  // Make file publicly accessible
  await file.makePublic();

  // Get download URL
  return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

/**
 * Build storage path for profile photo
 */
function buildPhotoStoragePath(userId: string): string {
  const timestamp = Date.now();
  return `Users/${userId}/profile/avatar_${timestamp}.jpg`;
}

function getRequiredRouteParam(value: string | string[] | undefined, name: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  throw fieldError(name, `Invalid ${name}`, 'invalid');
}

function getAccessibleSportIndices(user: User, accessGrant: ProfileWriteAccessGrant): number[] {
  return getAuthorizedTargetSportSelections(
    user as unknown as Record<string, unknown>,
    accessGrant
  ).map((selection) => selection.index);
}

function resolveEditableSportIndex(
  user: User,
  requestedSportIndex: number | undefined,
  accessGrant: ProfileWriteAccessGrant
): number | undefined {
  if (!Array.isArray(user.sports) || user.sports.length === 0) {
    return requestedSportIndex;
  }

  if (accessGrant.isSelfWrite) {
    return requestedSportIndex ?? user.activeSportIndex ?? 0;
  }

  const accessibleIndices = getAccessibleSportIndices(user, accessGrant);
  if (accessibleIndices.length === 0) {
    throw forbiddenError('owner');
  }

  if (requestedSportIndex !== undefined) {
    if (!accessibleIndices.includes(requestedSportIndex)) {
      throw forbiddenError('owner');
    }
    return requestedSportIndex;
  }

  const activeSportIndex = user.activeSportIndex ?? 0;
  return accessibleIndices.includes(activeSportIndex) ? activeSportIndex : accessibleIndices[0];
}

function buildEditProfileRawUser(
  user: User,
  accessGrant: ProfileWriteAccessGrant
): Record<string, unknown> | undefined {
  if (accessGrant.isSelfWrite) {
    return user as unknown as Record<string, unknown>;
  }

  return {
    role: user.role,
    userType: user.role,
    gender: (user as unknown as Record<string, unknown>)['gender'] ?? null,
  };
}

function buildDelegatedFormData(formData: EditProfileFormData): EditProfileFormData {
  return {
    ...formData,
    basicInfo: {
      firstName: '',
      lastName: '',
      displayName: undefined,
      bio: undefined,
      location: undefined,
      classYear: undefined,
    },
    photos: {
      profileImgs: undefined,
    },
    contact: {
      email: undefined,
      phone: undefined,
    },
  };
}

/**
 * Delete a file from Firebase Storage by its public URL.
 * Best-effort: errors are logged but do not fail the parent request.
 * Handles URLs with encoded characters.
 */
async function deleteFromStorage(
  url: string,
  storage: ReturnType<typeof getStorage>
): Promise<void> {
  try {
    const bucket = storage.bucket();
    const urlPrefix = `https://storage.googleapis.com/${bucket.name}/`;
    if (!url.startsWith(urlPrefix)) return; // Not a file in our bucket
    const storagePath = decodeURIComponent(url.slice(urlPrefix.length));
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    logger.debug('[EditProfile] Deleted storage file', { storagePath });
  } catch (err) {
    logger.warn('[EditProfile] Failed to delete storage file (best-effort)', { url, err });
  }
}

// ============================================
// MAPPERS
// ============================================

/**
 * Map User document to EditProfileFormData
 * @param user - User document
 * @param sportIndex - Optional sport index to load (defaults to activeSportIndex)
 */
function userToEditProfileFormData(user: User, sportIndex?: number): EditProfileFormData {
  // Get sport data - use provided sportIndex or fall back to activeSportIndex
  const targetIndex = sportIndex ?? user.activeSportIndex ?? 0;
  const activeSport = user.sports?.[targetIndex] ?? user.sports?.[0];

  logger.debug('[EditProfile] Mapping user to form data', {
    userId: user.id,
    requestedSportIndex: sportIndex,
    targetIndex,
    sportName: activeSport?.sport,
    totalSports: user.sports?.length ?? 0,
  });

  return {
    basicInfo: {
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      displayName: user.displayName,
      bio: user.aboutMe,
      location: user.location
        ? `${user.location.city}${user.location.state ? ', ' + user.location.state : ''}`
        : undefined,
      classYear: user.classOf ? String(user.classOf) : undefined,
    },
    photos: {
      profileImgs: user.profileImgs ?? undefined,
    },
    sportsInfo: {
      sport: activeSport?.sport,
      positions: activeSport?.positions ?? [],
      teamName: activeSport?.team?.name,
      teamType: activeSport?.team?.type,
      teamOrganizationId: activeSport?.team?.organizationId,
      jerseyNumber:
        activeSport?.jerseyNumber != null ? String(activeSport.jerseyNumber) : undefined,
    },
    academics: {
      gpa:
        user.academics?.gpa != null
          ? Number.isInteger(user.academics.gpa)
            ? user.academics.gpa.toFixed(1)
            : String(user.academics.gpa)
          : undefined,
      sat: user.academics?.satScore ? String(user.academics.satScore) : undefined,
      act: user.academics?.actScore ? String(user.academics.actScore) : undefined,
      intendedMajor: user.academics?.intendedMajor,
    },
    physical: {
      height: user.measurables?.find((m) => m.field === 'height')?.value?.toString(),
      weight: user.measurables?.find((m) => m.field === 'weight')?.value?.toString(),
      wingspan: activeSport?.verifiedMetrics
        ?.find((m) => m.field === 'wingspan')
        ?.value?.toString(),
    },
    contact: {
      email: user.email,
      phone: user.contact?.phone ?? undefined,
    },
  };
}

/**
 * Map section data to Firestore update fields
 * @param sectionId - Section identifier
 * @param sectionData - Section data from frontend
 * @param user - Current user document
 * @param sportIndex - Optional sport index for sports-related sections
 */
function sectionToFirestoreUpdate(
  sectionId: EditProfileSectionId,
  sectionData: unknown,
  user: User,
  sportIndex?: number
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  switch (sectionId) {
    case 'basic-info': {
      const data = sectionData as EditProfileBasicInfo;
      if (data.firstName) updates['firstName'] = data.firstName;
      if (data.lastName) updates['lastName'] = data.lastName;
      if (data.displayName !== undefined) {
        updates['displayName'] = data.displayName || null;
      } else if (data.firstName !== undefined || data.lastName !== undefined) {
        // Auto-sync displayName whenever first/last name changes (backend safety net).
        const newFirst = (data.firstName ?? user.firstName ?? '').trim();
        const newLast = (data.lastName ?? user.lastName ?? '').trim();
        const derived = [newFirst, newLast].filter(Boolean).join(' ');
        updates['displayName'] = derived || null;
      }
      if (data.bio !== undefined) updates['aboutMe'] = data.bio || null;

      // Parse location
      if (data.location !== undefined) {
        if (data.location) {
          const parts = data.location.split(',').map((s) => s.trim());
          updates['location.city'] = parts[0] || '';
          updates['location.state'] = parts[1] || '';
        } else {
          updates['location'] = null;
        }
      }

      // Parse classYear
      if (data.classYear !== undefined) {
        updates['classOf'] = data.classYear ? parseInt(data.classYear, 10) : null;
      }
      break;
    }

    case 'photos': {
      const data = sectionData as EditProfilePhotos;
      if (data.profileImgs !== undefined) updates['profileImgs'] = data.profileImgs || [];
      break;
    }

    case 'sports-info': {
      const data = sectionData as EditProfileSportsInfo;
      const isCoachOrDirector = user.role === 'coach' || user.role === 'director';

      // Coaches/directors NEVER have physical sports[] in Firestore — it's
      // deleted during onboarding and synthesized at read-time by
      // ProfileHydrationService. Their team data is written to the Organization
      // doc in the route handler (same pattern as connected-sources).
      if (isCoachOrDirector) {
        logger.info(
          '[EditProfile] Coach/director sports-info — skipping user sports[], org write handled by route handler',
          {
            userId: user.id,
            incomingData: data,
          }
        );
        break;
      }

      // ── Athletes only below this point ───────────────────────────────────
      const targetIndex = sportIndex ?? user.activeSportIndex ?? 0;

      if (!user.sports || !Array.isArray(user.sports) || !user.sports[targetIndex]) {
        logger.error('[EditProfile] Sports array invalid for update', {
          userId: user.id,
          targetIndex,
          sportsExists: !!user.sports,
          isArray: Array.isArray(user.sports),
          sportsLength: user.sports?.length ?? 0,
          hasSportAtIndex: !!user.sports?.[targetIndex],
        });
        throw fieldError(
          'sportIndex',
          `Sport at index ${targetIndex} does not exist. User has ${user.sports?.length ?? 0} sports.`,
          'invalid_sport_index'
        );
      }

      logger.debug('[EditProfile] Updating sports-info', {
        userId: user.id,
        targetIndex,
        activeSportIndex: user.activeSportIndex,
        totalSports: user.sports?.length ?? 0,
        incomingData: data,
        existingSport: user.sports?.[targetIndex],
      });

      // ⚠️ IMPORTANT: Clone the entire sports array to avoid mutations
      const updatedSports = JSON.parse(JSON.stringify(user.sports)) as SportProfile[];
      const targetSport = updatedSports[targetIndex];

      // Note: Sport type (data.sport) is read-only - cannot be changed via edit profile

      // Jersey number
      if (data.jerseyNumber !== undefined) {
        const trimmed = data.jerseyNumber?.trim() ?? '';
        targetSport.jerseyNumber = trimmed || undefined;
      }

      // Team / program name and type
      if (
        data.positions !== undefined ||
        data.teamName !== undefined ||
        data.teamType !== undefined ||
        data.teamOrganizationId !== undefined
      ) {
        // Positions — normalize to Title Case against SPORT_POSITIONS canonical list
        if (data.positions !== undefined) {
          const sportName = targetSport.sport ?? '';
          const sportKey = normalizeSportKey(sportName);
          const canonical = SPORT_POSITIONS[sportKey] ?? [];
          const canonicalMap = new Map<string, string>();
          for (const p of canonical) {
            canonicalMap.set(p.toLowerCase(), p);
          }
          const normalized = new Set<string>();
          for (const p of data.positions) {
            const trimmed = p.trim();
            if (!trimmed) continue;
            const match = canonicalMap.get(trimmed.toLowerCase());
            normalized.add(match ?? trimmed.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
          }
          targetSport.positions = Array.from(normalized);
        }
        if (!targetSport.team) {
          targetSport.team = { type: TEAM_TYPES.HIGH_SCHOOL, name: '' };
        }
        if (data.teamName !== undefined) {
          targetSport.team.name = data.teamName || '';
        }
        if (data.teamType !== undefined) {
          const validTypes = Object.values(TEAM_TYPES) as string[];
          const incoming = data.teamType || TEAM_TYPES.HIGH_SCHOOL;
          targetSport.team.type = validTypes.includes(incoming)
            ? (incoming as TeamType)
            : TEAM_TYPES.HIGH_SCHOOL;
        }
        if (data.teamOrganizationId !== undefined) {
          targetSport.team.organizationId = data.teamOrganizationId || undefined;
        }

        logger.debug('[EditProfile] Updating team info', {
          teamName: targetSport.team.name,
          teamType: targetSport.team.type,
          organizationId: targetSport.team.organizationId,
        });
      }

      // Update the entire sports array (not nested paths)
      updates['sports'] = updatedSports;

      logger.debug('[EditProfile] Sports-info updates prepared', {
        targetIndex,
        updatedSportFields: Object.keys(data),
        totalSports: updatedSports.length,
      });

      break;
    }

    case 'academics': {
      const data = sectionData as EditProfileAcademics;

      // Academic info
      if (data.gpa !== undefined) {
        const gpaVal = data.gpa ? parseFloat(data.gpa) : null;
        const safeGpa = gpaVal != null && !isNaN(gpaVal) ? gpaVal : null;
        updates['athlete.academics.gpa'] = safeGpa;
        updates['academics.gpa'] = safeGpa;
      }
      if (data.sat !== undefined) {
        const satVal = data.sat ? parseInt(data.sat, 10) : null;
        const safeSat = satVal != null && !isNaN(satVal) ? satVal : null;
        updates['athlete.academics.satScore'] = safeSat;
        updates['academics.satScore'] = safeSat;
      }
      if (data.act !== undefined) {
        const actVal = data.act ? parseInt(data.act, 10) : null;
        const safeAct = actVal != null && !isNaN(actVal) ? actVal : null;
        updates['athlete.academics.actScore'] = safeAct;
        updates['academics.actScore'] = safeAct;
      }
      if (data.intendedMajor !== undefined) {
        const majorVal = data.intendedMajor || null;
        updates['athlete.academics.intendedMajor'] = majorVal;
        updates['academics.intendedMajor'] = majorVal;
      }
      break;
    }

    case 'physical': {
      const data = sectionData as EditProfilePhysical;

      // Write height/weight to measurables[] (canonical location)
      if (data.height !== undefined || data.weight !== undefined) {
        const existing: Array<{
          id: string;
          field: string;
          label: string;
          value: string | number;
          unit?: string;
          [k: string]: unknown;
        }> = user.measurables ? JSON.parse(JSON.stringify(user.measurables)) : [];

        if (data.height !== undefined) {
          const idx = existing.findIndex((m) => m.field === 'height');
          if (data.height) {
            const entry = {
              id: 'height',
              field: 'height',
              label: 'Height',
              value: data.height,
              unit: 'ft',
            };
            if (idx >= 0) existing[idx] = entry;
            else existing.push(entry);
          } else if (idx >= 0) {
            existing.splice(idx, 1);
          }
        }

        if (data.weight !== undefined) {
          const idx = existing.findIndex((m) => m.field === 'weight');
          if (data.weight) {
            const entry = {
              id: 'weight',
              field: 'weight',
              label: 'Weight',
              value: data.weight,
              unit: 'lbs',
            };
            if (idx >= 0) existing[idx] = entry;
            else existing.push(entry);
          } else if (idx >= 0) {
            existing.splice(idx, 1);
          }
        }

        updates['measurables'] = existing;
      }

      // Sport-specific physical metrics go to sports[i].verifiedMetrics[] (2026 canonical)
      const targetIndex = sportIndex ?? user.activeSportIndex ?? 0;

      if (data.wingspan !== undefined && user.sports && user.sports[targetIndex]) {
        const updatedSports =
          (updates['sports'] as SportProfile[] | undefined) ??
          (JSON.parse(JSON.stringify(user.sports)) as SportProfile[]);

        const existingVerifiedMetrics: VerifiedMetric[] = updatedSports[targetIndex].verifiedMetrics
          ? (JSON.parse(
              JSON.stringify(updatedSports[targetIndex].verifiedMetrics)
            ) as VerifiedMetric[])
          : [];

        const idx = existingVerifiedMetrics.findIndex((m) => m.field === 'wingspan');
        if (data.wingspan) {
          const entry: VerifiedMetric = {
            id: 'wingspan',
            field: 'wingspan',
            label: 'Wingspan',
            value: data.wingspan,
            unit: 'ft',
            category: 'physical',
            source: 'self_reported',
            verified: false,
            updatedAt: new Date().toISOString(),
          };
          if (idx >= 0) existingVerifiedMetrics[idx] = entry;
          else existingVerifiedMetrics.push(entry);
        } else if (idx >= 0) {
          existingVerifiedMetrics.splice(idx, 1);
        }

        updatedSports[targetIndex].verifiedMetrics = existingVerifiedMetrics;
        updates['sports'] = updatedSports;
      }
      break;
    }

    case 'contact': {
      const data = sectionData as EditProfileContact;

      if (data.email !== undefined) updates['email'] = data.email;
      if (data.phone !== undefined) {
        updates['contact.phone'] = data.phone || null;
      }
      break;
    }

    case 'connected-sources': {
      const data = sectionData as {
        connectedSources?: readonly {
          platform: string;
          profileUrl: string;
          scopeType?: 'global' | 'sport' | 'team';
          scopeId?: string;
        }[];
        links?: readonly {
          platform: string;
          url?: string;
          username?: string;
          scopeType?: 'global' | 'sport' | 'team';
          scopeId?: string;
        }[];
      };

      const connectedSources = Array.isArray(data.connectedSources)
        ? data.connectedSources
        : (data.links ?? [])
            .filter((link) => typeof link.platform === 'string')
            .map((link) => ({
              platform: link.platform,
              profileUrl: link.url?.trim() || link.username?.trim() || '',
              scopeType: link.scopeType,
              scopeId: link.scopeId,
            }))
            .filter((link) => link.profileUrl.length > 0);

      updates['connectedSources'] = connectedSources;
      break;
    }

    default:
      throw fieldError('sectionId', `Unknown section: ${sectionId}`, 'invalid_section');
  }

  // Always update timestamp
  updates['updatedAt'] = new Date();

  return updates;
}

// ============================================
// ROUTES
// ============================================

/**
 * Get profile data for editing
 * GET /api/v1/profile/:uid/edit?sportIndex=0
 *
 * Query params:
 * - sportIndex (optional): Which sport profile to load (0-based index)
 */
router.get(
  '/:uid/edit',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = getRequiredRouteParam(req.params['uid'], 'uid');
    const currentUserId = req.user!.uid;
    const sportIndexParam = req.query['sportIndex'] as string | undefined;

    const db = req.firebase!.db;
    const accessGrant = await createProfileWriteAccessService(db).assertCanManageProfileTarget({
      actorUserId: currentUserId,
      targetUserId: uid,
      action: 'edit-profile:get',
    });
    const user = { id: uid, ...accessGrant.targetUserData } as User;

    // Parse sportIndex from query param
    const requestedSportIndex =
      sportIndexParam !== undefined ? parseInt(sportIndexParam, 10) : undefined;
    const sportIndex = resolveEditableSportIndex(user, requestedSportIndex, accessGrant);

    const formData = accessGrant.isSelfWrite
      ? userToEditProfileFormData(user, sportIndex)
      : buildDelegatedFormData(userToEditProfileFormData(user, sportIndex));

    // Determine which sport index is being edited
    const editingSportIndex = sportIndex ?? user.activeSportIndex ?? 0;

    const response: EditProfileData = {
      uid: user.id,
      formData,
      lastUpdated:
        typeof user.updatedAt === 'string'
          ? user.updatedAt
          : user.updatedAt && typeof user.updatedAt === 'object' && 'toDate' in user.updatedAt
            ? (user.updatedAt as { toDate(): Date }).toDate().toISOString()
            : new Date().toISOString(),
      rawUser: buildEditProfileRawUser(user, accessGrant),
      activeSportIndex: editingSportIndex,
    };

    logger.info('[EditProfile] Profile data loaded for editing', {
      uid,
      requestedSportIndex,
      activeSportIndex: user.activeSportIndex,
      totalSports: user.sports?.length,
      loadedSport: formData.sportsInfo.sport,
    });

    res.json({ success: true, data: response });
  })
);

/**
 * Update profile section
 * PUT /api/v1/profile/:uid/section/:sectionId?sportIndex=0
 *
 * Query params:
 * - sportIndex (optional): Which sport to update (for sports-info, academics, physical sections)
 *
 * Body should contain the section data matching the section type.
 * Example for basic-info: { firstName, lastName, displayName, bio, location, classYear }
 */
router.put(
  '/:uid/section/:sectionId',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = getRequiredRouteParam(req.params['uid'], 'uid');
    const sectionId = getRequiredRouteParam(req.params['sectionId'], 'sectionId');
    const currentUserId = req.user!.uid;
    const sectionData = req.body;
    const sportIndexParam = req.query['sportIndex'] as string | undefined;

    // Validate section ID
    const validSections: EditProfileSectionId[] = [
      'basic-info',
      'photos',
      'sports-info',
      'academics',
      'physical',
      'contact',
      'connected-sources',
    ];

    if (!validSections.includes(sectionId as EditProfileSectionId)) {
      throw fieldError('sectionId', `Invalid section ID: ${sectionId}`, 'invalid_section');
    }

    const db = req.firebase!.db;
    const accessGrant = await createProfileWriteAccessService(db).assertCanManageProfileTarget({
      actorUserId: currentUserId,
      targetUserId: uid,
      action: `edit-profile:update-section:${sectionId}`,
    });
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      throw notFoundError('profile');
    }

    const user = { id: doc.id, ...doc.data() } as User;

    // Clean up orphaned Storage files when photos are removed from the gallery
    if (sectionId === 'photos' && Array.isArray(sectionData.profileImgs)) {
      const oldUrls: string[] = (user as unknown as Record<string, string[]>)['profileImgs'] ?? [];
      const newUrls: string[] = sectionData.profileImgs as string[];
      const orphanedUrls = oldUrls.filter((url) => !newUrls.includes(url));
      if (orphanedUrls.length > 0) {
        logger.info('[EditProfile] Removing orphaned photo Storage files', {
          userId: uid,
          count: orphanedUrls.length,
        });
        await Promise.allSettled(
          orphanedUrls.map((url) => deleteFromStorage(url, req.firebase!.storage))
        );
      }
    }

    // Log user's sports BEFORE update
    logger.debug('[EditProfile] User sports BEFORE update', {
      userId: uid,
      sportsCount: user.sports?.length ?? 0,
      sports: user.sports?.map((s, idx) => ({
        index: idx,
        sport: s.sport,
        jerseyNumber: s.jerseyNumber,
        positions: s.positions,
        hasTeam: !!s.team,
      })),
    });

    // Parse sportIndex from query param (used for sports-related sections)
    const requestedSportIndex =
      sportIndexParam !== undefined ? parseInt(sportIndexParam, 10) : undefined;
    const typedSectionId = sectionId as EditProfileSectionId;
    if (!accessGrant.isSelfWrite && !DELEGATED_EDITABLE_SECTIONS.has(typedSectionId)) {
      throw forbiddenError('owner');
    }
    const sportIndex = DELEGATED_EDITABLE_SECTIONS.has(typedSectionId)
      ? resolveEditableSportIndex(user, requestedSportIndex, accessGrant)
      : requestedSportIndex;
    if (
      !accessGrant.isSelfWrite &&
      typedSectionId === 'sports-info' &&
      sectionData &&
      Object.prototype.hasOwnProperty.call(sectionData, 'teamOrganizationId')
    ) {
      const selectedSportScope = getAuthorizedTargetSportSelections(
        user as unknown as Record<string, unknown>,
        accessGrant
      ).find((selection) => selection.index === sportIndex);
      const requestedOrganizationId =
        typeof sectionData['teamOrganizationId'] === 'string'
          ? sectionData['teamOrganizationId'].trim()
          : null;

      if (
        !selectedSportScope ||
        !selectedSportScope.organizationId ||
        !requestedOrganizationId ||
        requestedOrganizationId !== selectedSportScope.organizationId
      ) {
        throw forbiddenError('owner');
      }
    }

    // Map section data to Firestore updates
    const updates = sectionToFirestoreUpdate(typedSectionId, sectionData, user, sportIndex);

    logger.debug('[EditProfile] Firestore updates prepared', {
      sectionId,
      sportIndex,
      updateKeys: Object.keys(updates),
      updates,
      userSportsBeforeUpdate: user.sports,
    });

    // For coach/director roles, connected sources belong on the Team doc, not User doc
    const isTeamRole = user.role === 'coach' || user.role === 'director';
    const activeSportData =
      user.sports?.[sportIndex ?? user.activeSportIndex ?? 0] ?? user.sports?.[0];
    const teamId = (user.teamCode as { teamId?: string })?.teamId ?? activeSportData?.team?.teamId;

    if (sectionId === 'connected-sources' && isTeamRole && teamId && updates['connectedSources']) {
      // Write connected sources to Team doc instead of User doc
      try {
        await db.collection('Teams').doc(teamId).update({
          connectedSources: updates['connectedSources'],
          updatedAt: new Date(),
        });
        logger.info('[EditProfile] Connected sources saved to Team doc', {
          userId: uid,
          teamId,
          count: Array.isArray(updates['connectedSources'])
            ? updates['connectedSources'].length
            : 0,
        });
      } catch (err) {
        logger.error('[EditProfile] Failed to save connected sources to Team doc', {
          userId: uid,
          teamId,
          err,
        });
        throw err;
      }
      // Remove connectedSources from user updates — they live on the Team doc
      delete updates['connectedSources'];
    }

    // For coach/director roles, sports-info data belongs on the Organization doc, not User doc.
    // This mirrors onboarding which deletes sports[] for coaches and stores team data on Org/Team docs.
    if (sectionId === 'sports-info' && isTeamRole) {
      const coachTeamId = (user.teamCode as Record<string, string> | null | undefined)?.['teamId'];

      if (coachTeamId) {
        try {
          const teamDoc = await db.collection('Teams').doc(coachTeamId).get();
          const teamData = teamDoc.exists ? teamDoc.data() : null;
          const orgId = teamData?.['organizationId'] as string | undefined;
          const sportsData = sectionData as EditProfileSportsInfo;

          // Update Team doc with sport name if provided
          if (sportsData.sport !== undefined) {
            await db
              .collection('Teams')
              .doc(coachTeamId)
              .update({
                sportName: sportsData.sport || '',
                updatedAt: new Date(),
              });
            const rosterEntryService = createRosterEntryService(db);
            await rosterEntryService.syncTeamSport(coachTeamId, sportsData.sport || '');
            logger.info('[EditProfile] Coach sport saved to Team doc', {
              userId: uid,
              teamId: coachTeamId,
              sport: sportsData.sport,
            });
          }

          // Update Organization doc with team-level display data
          if (orgId) {
            const orgUpdates: Record<string, unknown> = { updatedAt: new Date() };
            if (sportsData.teamName !== undefined) orgUpdates['name'] = sportsData.teamName || '';

            if (Object.keys(orgUpdates).length > 1) {
              await db.collection('Organizations').doc(orgId).update(orgUpdates);
              logger.info('[EditProfile] Coach sports-info saved to Organization doc', {
                userId: uid,
                organizationId: orgId,
                updatedFields: Object.keys(orgUpdates).filter((k) => k !== 'updatedAt'),
              });
            }
          } else {
            logger.warn(
              '[EditProfile] No organizationId on Team doc — cannot write coach sports-info to Org',
              {
                userId: uid,
                teamId: coachTeamId,
              }
            );
          }
        } catch (err) {
          logger.error('[EditProfile] Failed to save coach sports-info to Org/Team docs', {
            userId: uid,
            teamId: coachTeamId,
            err,
          });
          throw err;
        }
      } else {
        logger.warn(
          '[EditProfile] Coach has no teamCode.teamId — cannot resolve Organization for sports-info',
          {
            userId: uid,
          }
        );
      }
    }

    // Log the exact raw updates object for debugging
    logger.debug('[EditProfile] RAW updates object being sent to Firestore:', {
      rawUpdates: JSON.stringify(updates, null, 2),
    });

    // Update Firestore
    await userRef.update(updates);

    logger.debug('[EditProfile] Firestore update completed', { userId: uid, sectionId });

    // Fetch updated user
    const updatedDoc = await userRef.get();
    const updatedUserData = (updatedDoc.data() ?? {}) as Record<string, unknown>;
    const updatedUser = { id: updatedDoc.id, ...updatedUserData } as User;

    try {
      const diffService = new SyncDiffService();
      const activeSportRecord =
        updatedUser.sports?.[sportIndex ?? updatedUser.activeSportIndex ?? 0] ??
        updatedUser.sports?.[0];
      const deltaSport =
        (typeof activeSportRecord?.sport === 'string' && activeSportRecord.sport.trim()) ||
        (typeof sectionData?.['sport'] === 'string' && sectionData['sport'].trim()) ||
        'general';

      // Fetch awards from root collection (source of truth)
      const previousAwardsSnap = await db.collection('Awards').where('userId', '==', uid).get();
      const previousAwardDocs = previousAwardsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const scopedDelta = {
        ...diffService.diff(
          uid,
          deltaSport,
          'manual-profile',
          buildPreviousStateFromUserRecord(
            user as unknown as Record<string, unknown>,
            sportIndex,
            previousAwardDocs
          ),
          buildDistilledProfileFromUserRecord(updatedUserData, sportIndex)
        ),
        teamId:
          typeof activeSportRecord?.team?.teamId === 'string'
            ? activeSportRecord.team.teamId
            : undefined,
        organizationId:
          typeof activeSportRecord?.team?.organizationId === 'string'
            ? activeSportRecord.team.organizationId
            : undefined,
      };

      if (!scopedDelta.isEmpty) {
        logger.info('[EditProfile] Manual delta detected, firing sync trigger', {
          uid,
          sectionId,
          sport: scopedDelta.sport,
          totalChanges: scopedDelta.summary.totalChanges,
          teamId: scopedDelta.teamId,
          organizationId: scopedDelta.organizationId,
        });
        void onDailySyncComplete(scopedDelta).catch((err) => {
          logger.warn('[EditProfile] Manual sync trigger dispatch failed', {
            uid,
            sectionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      logger.warn('[EditProfile] Manual delta computation failed', {
        uid,
        sectionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const rosterEntryService = createRosterEntryService(db);
    await rosterEntryService.syncUserProfileToRosterEntries(
      uid,
      updatedDoc.data() as Record<string, unknown>
    );

    // ─── Deferred welcome graphic ──────────────────────────────────────────
    // Generate a welcome graphic the FIRST time the user adds a relevant image:
    //   • Athletes / parents → first profile image (profileImgs)
    //   • Coaches / directors → org/team has a logo (resolved from Team → Organization docs)
    const role = (updatedUser.role ?? 'athlete') as UserRole;
    const isCoachDirector = role === 'coach' || role === 'director';
    const primarySportIndex = updatedUser.activeSportIndex ?? 0;
    const primarySport = updatedUser.sports?.[primarySportIndex];

    // For coaches/directors, resolve org chain: teamCode.teamId → Team doc → Organization doc.
    // Coaches don't have reliable sports[] on their raw Firestore doc (it's synthesized
    // at read-time by ProfileHydrationService). All team/org data comes from the docs directly.
    let organizationId: string | undefined;
    let teamDocData: Record<string, unknown> | undefined;
    let orgDocData: Record<string, unknown> | undefined;

    if (isCoachDirector) {
      const teamDocId =
        (updatedUser.teamCode as Record<string, string> | null | undefined)?.['teamId'] ??
        updatedUser.teamCode?.id;

      if (teamDocId) {
        try {
          const teamDoc = await db.collection('Teams').doc(teamDocId).get();
          if (teamDoc.exists) {
            teamDocData = teamDoc.data() as Record<string, unknown>;
            organizationId = teamDocData['organizationId'] as string | undefined;
          }
        } catch (err) {
          logger.warn('[EditProfile] Failed to resolve team for welcome graphic', {
            teamDocId,
            err,
          });
        }
      }

      if (organizationId) {
        try {
          const orgDoc = await db.collection('Organizations').doc(organizationId).get();
          if (orgDoc.exists) {
            orgDocData = orgDoc.data() as Record<string, unknown>;
          }
        } catch (err) {
          logger.warn('[EditProfile] Failed to resolve org for welcome graphic', {
            organizationId,
            err,
          });
        }
      }
    } else {
      organizationId = primarySport?.team?.organizationId;
    }

    let hasWelcomeGraphicAlready = false;

    if (isCoachDirector && organizationId) {
      // Coaches: dedup on Organization doc so multiple coaches on the same team don't re-trigger
      hasWelcomeGraphicAlready = !!orgDocData?.['welcomeGraphicQueued'];
    } else if (!isCoachDirector) {
      // Athletes: dedup on User doc
      hasWelcomeGraphicAlready = !!(updatedDoc.data() as Record<string, unknown> | undefined)?.[
        'welcomeGraphicQueued'
      ];
    }

    if (!hasWelcomeGraphicAlready) {
      // Athlete trigger: first profile image upload (compare pre → post)
      const hadProfileImg = !!(user.profileImgs && user.profileImgs.length > 0);
      const hasProfileImgNow = !!(updatedUser.profileImgs && updatedUser.profileImgs.length > 0);
      const athleteImageAdded = !isCoachDirector && !hadProfileImg && hasProfileImgNow;

      // Coach trigger: the Organization or Team doc already has a logo.
      // We intentionally read from org/team docs — NOT from sports[] which is
      // synthetic for coaches. The dedup flag on the org prevents re-triggering.
      const orgLogoUrl =
        (orgDocData?.['logoUrl'] as string | undefined) ??
        (teamDocData?.['logoUrl'] as string | undefined) ??
        (teamDocData?.['teamLogoImg'] as string | undefined);
      const teamLogoAvailable = isCoachDirector && !!orgLogoUrl;

      if (athleteImageAdded || teamLogoAvailable) {
        const agentEnv = req.isStaging ? 'staging' : 'production';

        void enqueueWelcomeGraphicIfReady(db, { userId: uid }, agentEnv)
          .then((result) => {
            if (result.status === 'enqueued') {
              logger.info('[EditProfile] Welcome graphic enqueued', {
                userId: uid,
                trigger: athleteImageAdded ? 'profileImage' : 'teamLogo',
                role,
                ...(organizationId ? { organizationId } : {}),
              });
              return;
            }

            logger.info('[EditProfile] Welcome graphic deferred', {
              trigger: athleteImageAdded ? 'profileImage' : 'teamLogo',
              role,
              reason: result.reason,
              ...(organizationId ? { organizationId } : {}),
            });
          })
          .catch((err) =>
            logger.error('[EditProfile] Failed to evaluate welcome graphic enqueue', {
              userId: uid,
              error: err,
            })
          );
      }
    }
    // ─── End deferred welcome graphic ──────────────────────────────────────

    // Invalidate all profile caches to ensure fresh data
    await invalidateProfileCaches(uid, updatedUser.unicode).catch((err) =>
      logger.warn('[EditProfile] Cache invalidation failed', { userId: uid, err })
    );

    logger.debug('[EditProfile] User sports AFTER update', {
      userId: uid,
      sportsCount: updatedUser.sports?.length ?? 0,
      sports: updatedUser.sports?.map((s, idx) => ({
        index: idx,
        sport: s.sport,
        jerseyNumber: s.jerseyNumber,
        positions: s.positions,
        hasTeam: !!s.team,
      })),
    });

    logger.debug('[EditProfile] Fetched updated user', {
      userId: uid,
      updatedSportsCount: updatedUser.sports?.length ?? 0,
      activeSportIndex: updatedUser.activeSportIndex,
      activeSport: updatedUser.sports?.[updatedUser.activeSportIndex ?? 0],
    });

    const response: EditProfileUpdateResponse = {
      success: true,
      message: 'Profile updated successfully',
    };

    logger.info('[EditProfile] Section updated', {
      uid,
      sectionId,
    });

    res.json({ success: true, data: response });
  })
);

/**
 * Upload profile/banner photo
 * POST /api/v1/profile/:uid/photo
 *
 * Request: multipart/form-data
 * - file: image file
 *
 * Response: { success: true, data: { url: string } }
 */
router.post(
  '/:uid/photo',
  appGuard,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = getRequiredRouteParam(req.params['uid'], 'uid');
    const currentUserId = req.user!.uid;
    const file = req.file;

    // Validate required fields
    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    // Authorization: user can only upload their own photos
    if (currentUserId !== uid) {
      throw forbiddenError('owner');
    }

    logger.info('Processing photo upload', {
      userId: uid,
      originalSize: formatFileSize(file.size),
      mimeType: file.mimetype,
    });

    // Optimize image (convert to JPEG, fixed 800×800)
    const jpegBuffer = await sharp(file.buffer)
      .rotate()
      .resize(800, 800, {
        fit: 'cover',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Build storage path
    const storagePath = buildPhotoStoragePath(uid);

    // Upload to Firebase Storage (uses correct bucket from middleware)
    const url = await uploadToStorage(jpegBuffer, storagePath, 'image/jpeg', req.firebase!.storage);

    logger.info('Photo upload complete', {
      userId: uid,
      url,
      optimizedSize: formatFileSize(jpegBuffer.length),
      compressionRatio: `${Math.round((1 - jpegBuffer.length / file.size) * 100)}%`,
    });

    res.json({
      success: true,
      data: { url },
    });
  })
);

/**
 * Delete profile/banner photo
 * DELETE /api/v1/profile/:uid/photo/:type
 *
 * type='profile' — deletes all profileImgs from Storage + clears gallery
 */
router.delete(
  '/:uid/photo/:type',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = getRequiredRouteParam(req.params['uid'], 'uid');
    const type = getRequiredRouteParam(req.params['type'], 'type');
    const currentUserId = req.user!.uid;

    if (type !== 'profile') {
      throw fieldError('type', 'Type must be "profile"', 'invalid');
    }

    if (uid !== currentUserId) {
      throw forbiddenError('owner');
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      throw notFoundError('profile');
    }

    const user = { id: doc.id, ...doc.data() } as User;
    const userData = doc.data() as Record<string, unknown>;

    logger.info('[EditProfile] Deleting photo', { userId: uid, type });

    const updates: Record<string, unknown> = {};

    // Delete all profile gallery images
    const profileImgs: string[] = (userData['profileImgs'] as string[] | undefined) ?? [];
    await Promise.allSettled(
      profileImgs.map((url) => deleteFromStorage(url, req.firebase!.storage))
    );
    updates['profileImgs'] = [];
    updates['profileImg'] = null;

    await userRef.update(updates);

    const nextUserData = {
      ...userData,
      ...updates,
    } as Record<string, unknown>;

    const rosterEntryService = createRosterEntryService(db);
    await rosterEntryService.syncUserProfileToRosterEntries(uid, nextUserData);

    await invalidateProfileCaches(uid, user.unicode).catch((err) =>
      logger.warn('[EditProfile] Cache invalidation failed after photo delete', {
        userId: uid,
        err,
      })
    );

    logger.info('[EditProfile] Photo deleted', { userId: uid, type });

    res.json({ success: true });
  })
);

/**
 * Update active sport index
 * PUT /api/v1/profile/:uid/active-sport-index
 * Body: { activeSportIndex: number }
 */
router.put(
  '/:uid/active-sport-index',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const uid = getRequiredRouteParam(req.params['uid'], 'uid');
    const currentUserId = req.user!.uid;
    const { activeSportIndex } = req.body;

    // Only allow users to update their own profile
    if (uid !== currentUserId) {
      throw forbiddenError('owner');
    }

    // Validate activeSportIndex
    if (typeof activeSportIndex !== 'number' || activeSportIndex < 0) {
      throw fieldError(
        'activeSportIndex',
        'Invalid activeSportIndex - must be a non-negative number',
        'invalid_value'
      );
    }

    const db = req.firebase!.db;
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      throw notFoundError('profile');
    }

    const user = { id: doc.id, ...doc.data() } as User;

    // Validate that the sport index exists
    if (!user.sports || activeSportIndex >= user.sports.length) {
      throw fieldError(
        'activeSportIndex',
        `Sport index ${activeSportIndex} does not exist. User has ${user.sports?.length ?? 0} sports.`,
        'invalid_sport_index'
      );
    }

    // Update activeSportIndex
    await userRef.update({
      activeSportIndex,
      updatedAt: new Date(),
    });

    // Invalidate profile caches
    await invalidateProfileCaches(uid, user.unicode).catch((err) =>
      logger.warn('[EditProfile] Cache invalidation failed', { userId: uid, err })
    );

    logger.info('[EditProfile] Active sport index updated', {
      uid,
      oldIndex: user.activeSportIndex ?? 0,
      newIndex: activeSportIndex,
      sportName: user.sports[activeSportIndex].sport,
    });

    res.json({
      success: true,
      data: {
        activeSportIndex,
        sportName: user.sports[activeSportIndex].sport,
      },
    });
  })
);

export default router;
