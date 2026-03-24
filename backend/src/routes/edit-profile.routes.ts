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
import { appGuard } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '@nxt1/core/errors/express';
import { notFoundError, forbiddenError, fieldError } from '@nxt1/core/errors';
import type { User, SportProfile, TeamType } from '@nxt1/core';
import { formatFileSize, TEAM_TYPES } from '@nxt1/core';
import { invalidateProfileCaches } from './profile.routes.js';
import type {
  EditProfileData,
  EditProfileFormData,
  ProfileCompletionData,
  SectionCompletionData,
  ProfileCompletionTier,
  EditProfileSectionId,
  EditProfileUpdateResponse,
  EditProfileBasicInfo,
  EditProfilePhotos,
  EditProfileSportsInfo,
  EditProfileAcademics,
  EditProfilePhysical,
  EditProfileSocialLinks,
  EditProfileContact,
} from '@nxt1/core/edit-profile';

const router: ExpressRouter = Router();

const USERS_COLLECTION = 'Users';

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
 * Build storage path for profile/banner photo
 */
function buildPhotoStoragePath(userId: string, type: 'profile' | 'banner'): string {
  const timestamp = Date.now();
  const extension = 'jpg';

  if (type === 'profile') {
    return `${USERS_COLLECTION}/${userId}/profile/avatar_${timestamp}.${extension}`;
  } else {
    return `${USERS_COLLECTION}/${userId}/cover/cover_${timestamp}.${extension}`;
  }
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
      bannerImg: user.bannerImg ?? undefined,
      profileImgs: user.profileImgs ?? undefined,
    },
    sportsInfo: {
      sport: activeSport?.sport,
      primaryPosition: activeSport?.positions?.[0],
      secondaryPositions: activeSport?.positions?.slice(1),
      jerseyNumber: activeSport?.jerseyNumber,
      yearsExperience: activeSport?.yearsExperience,
      teamName: activeSport?.team?.name,
      teamType: activeSport?.team?.type,
      teamLogoUrl: activeSport?.team?.logoUrl,
      teamOrganizationId: activeSport?.team?.organizationId,
    },
    academics: {
      school: activeSport?.team?.name,
      gpa:
        user.athlete?.academics?.gpa != null
          ? Number.isInteger(user.athlete.academics.gpa)
            ? user.athlete.academics.gpa.toFixed(1)
            : String(user.athlete.academics.gpa)
          : undefined,
      sat: user.athlete?.academics?.satScore ? String(user.athlete.academics.satScore) : undefined,
      act: user.athlete?.academics?.actScore ? String(user.athlete.academics.actScore) : undefined,
      intendedMajor: user.athlete?.academics?.intendedMajor,
      graduationDate: user.classOf ? String(user.classOf) : undefined,
    },
    physical: {
      height: user.height,
      weight: user.weight,
      // SportProfile doesn't have 'measurements' field - use 'metrics' (deprecated) instead
      wingspan: activeSport?.metrics?.['wingspan']
        ? String(activeSport.metrics['wingspan'])
        : undefined,
      fortyYardDash: activeSport?.metrics?.['40YardDash']
        ? String(activeSport.metrics['40YardDash'])
        : undefined,
      verticalJump: activeSport?.metrics?.['verticalJump']
        ? String(activeSport.metrics['verticalJump'])
        : undefined,
    },
    socialLinks: {
      links: (user.connectedSources ?? []).map((cs) => ({
        platform: cs.platform,
        url: cs.profileUrl,
        username: undefined, // connectedSources uses profileUrl only
        displayOrder: cs.displayOrder ?? 0,
        scopeType: cs.scopeType,
        scopeId: cs.scopeId,
      })),
    },
    contact: {
      email: user.email,
      phone: user.contact?.phone ?? undefined,
      parentEmail: user.athlete?.parentInfo?.email,
      parentPhone: user.athlete?.parentInfo?.phone,
      coachEmail: activeSport?.coach?.email,
      preferredContactMethod: user.preferredContactMethod ?? 'email',
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
      if (data.displayName !== undefined) updates['displayName'] = data.displayName || null;
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
      if (data.bannerImg !== undefined) updates['bannerImg'] = data.bannerImg || null;
      if (data.profileImgs !== undefined) updates['profileImgs'] = data.profileImgs || [];
      break;
    }

    case 'sports-info': {
      const data = sectionData as EditProfileSportsInfo;

      // Use provided sportIndex or fall back to activeSportIndex
      const targetIndex = sportIndex ?? user.activeSportIndex ?? 0;

      // Safety check: Ensure sports array exists and has target index
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
      // We update the whole array to prevent Firestore from corrupting array structure
      const updatedSports = JSON.parse(JSON.stringify(user.sports)) as SportProfile[];
      const targetSport = updatedSports[targetIndex];

      // Note: Sport type (data.sport) is read-only - cannot be changed via edit profile
      // Users must use profile settings to change their sport

      // Update fields on the cloned sport object
      if (data.primaryPosition !== undefined || data.secondaryPositions !== undefined) {
        const positions: string[] = [];
        if (data.primaryPosition) positions.push(data.primaryPosition);
        if (data.secondaryPositions) positions.push(...data.secondaryPositions);
        targetSport.positions = positions.length > 0 ? positions : [];

        logger.debug('[EditProfile] Updating positions', {
          primaryPosition: data.primaryPosition,
          secondaryPositions: data.secondaryPositions,
          finalPositions: targetSport.positions,
        });
      }

      if (data.jerseyNumber !== undefined) {
        targetSport.jerseyNumber = data.jerseyNumber || undefined;
      }

      if (data.yearsExperience !== undefined) {
        targetSport.yearsExperience = data.yearsExperience || undefined;
      }

      // Team / program name and type
      if (
        data.teamName !== undefined ||
        data.teamType !== undefined ||
        data.teamLogoUrl !== undefined ||
        data.teamOrganizationId !== undefined
      ) {
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
        if (data.teamLogoUrl !== undefined) {
          targetSport.team.logoUrl = data.teamLogoUrl || undefined;
        }
        if (data.teamOrganizationId !== undefined) {
          targetSport.team.organizationId = data.teamOrganizationId || undefined;
        }

        logger.debug('[EditProfile] Updating team info', {
          teamName: targetSport.team.name,
          teamType: targetSport.team.type,
          teamLogoUrl: targetSport.team.logoUrl,
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

      // School goes to team.name for the sport being edited
      const targetIndex = sportIndex ?? user.activeSportIndex ?? 0;
      if (data.school !== undefined && user.sports && user.sports[targetIndex]) {
        const updatedSports = JSON.parse(JSON.stringify(user.sports)) as SportProfile[];
        if (!updatedSports[targetIndex].team) {
          updatedSports[targetIndex].team = {
            type: 'high-school',
            name: '',
          };
        }
        updatedSports[targetIndex].team.name = data.school || '';
        updates['sports'] = updatedSports;
      }

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

      // Graduation date goes to classOf
      if (data.graduationDate !== undefined) {
        updates['classOf'] = data.graduationDate ? parseInt(data.graduationDate, 10) : null;
      }
      break;
    }

    case 'physical': {
      const data = sectionData as EditProfilePhysical;

      // User-level physical data (applies to all sports)
      if (data.height !== undefined) updates['height'] = data.height || null;
      if (data.weight !== undefined) updates['weight'] = data.weight || null;

      // Invalidate measurables verification when height or weight is manually changed.
      // The verification was set by Agent X after scraping an external source;
      // a manual edit means the data no longer matches the verified value.
      if (data.height !== undefined || data.weight !== undefined) {
        const physIdx = sportIndex ?? user.activeSportIndex ?? 0;
        if (user.sports && user.sports[physIdx]) {
          const cloned = JSON.parse(JSON.stringify(user.sports)) as SportProfile[];
          const target = cloned[physIdx];
          if (Array.isArray(target.verifications)) {
            target.verifications = target.verifications.filter(
              (v: { scope?: string }) => v.scope !== 'measurables'
            );
          }
          // Only set sports once — may be overwritten below by metrics branch
          if (!updates['sports']) {
            updates['sports'] = cloned;
          } else {
            // Metrics branch already cloned; apply invalidation on that copy
            (updates['sports'] as SportProfile[])[physIdx].verifications = target.verifications;
          }
        }
      }

      // Sport-specific physical metrics go to the sport being edited
      const targetIndex = sportIndex ?? user.activeSportIndex ?? 0;
      const hasMetricsToUpdate =
        data.wingspan !== undefined ||
        data.fortyYardDash !== undefined ||
        data.verticalJump !== undefined;

      if (hasMetricsToUpdate && user.sports && user.sports[targetIndex]) {
        // Re-use the clone from the invalidation branch if it exists; otherwise deep-clone.
        const updatedSports =
          (updates['sports'] as SportProfile[] | undefined) ??
          (JSON.parse(JSON.stringify(user.sports)) as SportProfile[]);
        if (!updatedSports[targetIndex].metrics) {
          updatedSports[targetIndex].metrics = {};
        }

        if (data.wingspan !== undefined) {
          updatedSports[targetIndex].metrics!['wingspan'] = data.wingspan
            ? parseFloat(data.wingspan)
            : undefined;
        }
        if (data.fortyYardDash !== undefined) {
          updatedSports[targetIndex].metrics!['40YardDash'] = data.fortyYardDash
            ? parseFloat(data.fortyYardDash)
            : undefined;
        }
        if (data.verticalJump !== undefined) {
          updatedSports[targetIndex].metrics!['verticalJump'] = data.verticalJump
            ? parseFloat(data.verticalJump)
            : undefined;
        }

        updates['sports'] = updatedSports;
      }
      break;
    }

    case 'social-links': {
      const data = sectionData as EditProfileSocialLinks;
      if (data.links !== undefined) {
        updates['connectedSources'] = data.links.map((link, index) => ({
          platform: link.platform,
          profileUrl: link.url,
          syncStatus: 'idle' as const,
          displayOrder: link.displayOrder ?? index,
          ...(link.scopeType && { scopeType: link.scopeType }),
          ...(link.scopeId && { scopeId: link.scopeId }),
        }));
      }
      break;
    }

    case 'contact': {
      const data = sectionData as EditProfileContact;

      if (data.email !== undefined) updates['email'] = data.email;
      if (data.phone !== undefined) {
        updates['contact.phone'] = data.phone || null;
      }
      if (data.parentEmail !== undefined) {
        updates['athlete.parentInfo.email'] = data.parentEmail || null;
      }
      if (data.parentPhone !== undefined) {
        updates['athlete.parentInfo.phone'] = data.parentPhone || null;
      }
      if (data.coachEmail !== undefined && user.sports) {
        const targetIndex = sportIndex ?? user.activeSportIndex ?? 0;
        if (user.sports[targetIndex]) {
          const updatedSports = JSON.parse(JSON.stringify(user.sports)) as SportProfile[];
          if (!updatedSports[targetIndex].coach) {
            updatedSports[targetIndex].coach = { firstName: '', lastName: '', email: '' };
          }
          updatedSports[targetIndex].coach!.email = data.coachEmail || '';
          updates['sports'] = updatedSports;
        }
      }
      if (data.preferredContactMethod !== undefined) {
        updates['preferredContactMethod'] = data.preferredContactMethod;
      }
      break;
    }

    default:
      throw fieldError('sectionId', `Unknown section: ${sectionId}`, 'invalid_section');
  }

  // Always update timestamp
  updates['updatedAt'] = new Date();

  return updates;
}

/**
 * Calculate profile completion percentage and tier
 */
function calculateProfileCompletion(form: EditProfileFormData): ProfileCompletionData {
  const sections: SectionCompletionData[] = [];
  let totalFields = 0;
  let completedFields = 0;
  let totalXP = 0;
  let earnedXP = 0;

  // Basic Info Section (6 fields, 100 XP)
  const basicInfoFields = [
    form.basicInfo.firstName,
    form.basicInfo.lastName,
    form.basicInfo.bio,
    form.basicInfo.location,
    form.basicInfo.classYear,
    form.basicInfo.displayName,
  ];
  const basicInfoCompleted = basicInfoFields.filter(Boolean).length;
  sections.push({
    sectionId: 'basic-info',
    percentage: Math.round((basicInfoCompleted / 6) * 100),
    fieldsCompleted: basicInfoCompleted,
    fieldsTotal: 6,
    xpEarned: Math.round((basicInfoCompleted / 6) * 100),
    isComplete: basicInfoCompleted === 6,
  });
  totalFields += 6;
  completedFields += basicInfoCompleted;
  totalXP += 100;
  earnedXP += Math.round((basicInfoCompleted / 6) * 100);

  // Photos Section (2 fields, 75 XP)
  const photosFields = [form.photos.profileImgs?.length ? 1 : 0, form.photos.bannerImg ? 1 : 0];
  const photosCompleted = photosFields.filter(Boolean).length;
  sections.push({
    sectionId: 'photos',
    percentage: Math.round((photosCompleted / 2) * 100),
    fieldsCompleted: photosCompleted,
    fieldsTotal: 2,
    xpEarned: Math.round((photosCompleted / 2) * 75),
    isComplete: photosCompleted === 2,
  });
  totalFields += 2;
  completedFields += photosCompleted;
  totalXP += 75;
  earnedXP += Math.round((photosCompleted / 2) * 75);

  // Sports Info Section (4 fields, 100 XP)
  const sportsFields = [
    form.sportsInfo.sport,
    form.sportsInfo.primaryPosition,
    form.sportsInfo.jerseyNumber,
    form.sportsInfo.secondaryPositions?.length ? 1 : 0,
  ];
  const sportsCompleted = sportsFields.filter(Boolean).length;
  sections.push({
    sectionId: 'sports-info',
    percentage: Math.round((sportsCompleted / 4) * 100),
    fieldsCompleted: sportsCompleted,
    fieldsTotal: 4,
    xpEarned: Math.round((sportsCompleted / 4) * 100),
    isComplete: sportsCompleted === 4,
  });
  totalFields += 4;
  completedFields += sportsCompleted;
  totalXP += 100;
  earnedXP += Math.round((sportsCompleted / 4) * 100);

  // Academics Section (6 fields, 100 XP)
  const academicsFields = [
    form.academics.school,
    form.academics.gpa,
    form.academics.sat,
    form.academics.act,
    form.academics.intendedMajor,
    form.academics.graduationDate,
  ];
  const academicsCompleted = academicsFields.filter(Boolean).length;
  sections.push({
    sectionId: 'academics',
    percentage: Math.round((academicsCompleted / 6) * 100),
    fieldsCompleted: academicsCompleted,
    fieldsTotal: 6,
    xpEarned: Math.round((academicsCompleted / 6) * 100),
    isComplete: academicsCompleted === 6,
  });
  totalFields += 6;
  completedFields += academicsCompleted;
  totalXP += 100;
  earnedXP += Math.round((academicsCompleted / 6) * 100);

  // Physical Section (5 fields, 100 XP)
  const physicalFields = [
    form.physical.height,
    form.physical.weight,
    form.physical.wingspan,
    form.physical.fortyYardDash,
    form.physical.verticalJump,
  ];
  const physicalCompleted = physicalFields.filter(Boolean).length;
  sections.push({
    sectionId: 'physical',
    percentage: Math.round((physicalCompleted / 5) * 100),
    fieldsCompleted: physicalCompleted,
    fieldsTotal: 5,
    xpEarned: Math.round((physicalCompleted / 5) * 100),
    isComplete: physicalCompleted === 5,
  });
  totalFields += 5;
  completedFields += physicalCompleted;
  totalXP += 100;
  earnedXP += Math.round((physicalCompleted / 5) * 100);

  // Social Links Section (min 3 links, 75 XP)
  const socialLinksCount = Math.min(form.socialLinks.links.length, 5);
  sections.push({
    sectionId: 'social-links',
    percentage: Math.round((socialLinksCount / 5) * 100),
    fieldsCompleted: socialLinksCount,
    fieldsTotal: 5,
    xpEarned: Math.round((socialLinksCount / 5) * 75),
    isComplete: socialLinksCount >= 3,
  });
  totalFields += 5;
  completedFields += socialLinksCount;
  totalXP += 75;
  earnedXP += Math.round((socialLinksCount / 5) * 75);

  // Contact Section (5 fields, 50 XP)
  const contactFields = [
    form.contact.email,
    form.contact.phone,
    form.contact.parentEmail,
    form.contact.parentPhone,
    form.contact.coachEmail,
  ];
  const contactCompleted = contactFields.filter(Boolean).length;
  sections.push({
    sectionId: 'contact',
    percentage: Math.round((contactCompleted / 5) * 100),
    fieldsCompleted: contactCompleted,
    fieldsTotal: 5,
    xpEarned: Math.round((contactCompleted / 5) * 50),
    isComplete: contactCompleted === 5,
  });
  totalFields += 5;
  completedFields += contactCompleted;
  totalXP += 50;
  earnedXP += Math.round((contactCompleted / 5) * 50);

  // Calculate overall percentage
  const overallPercentage = Math.round((completedFields / totalFields) * 100);

  // Determine tier
  let tier: ProfileCompletionTier = 'rookie';
  if (overallPercentage >= 95) tier = 'legend';
  else if (overallPercentage >= 75) tier = 'mvp';
  else if (overallPercentage >= 50) tier = 'all-star';
  else if (overallPercentage >= 25) tier = 'starter';

  // Determine next tier
  let nextTier: ProfileCompletionTier | undefined;
  if (tier === 'rookie') nextTier = 'starter';
  else if (tier === 'starter') nextTier = 'all-star';
  else if (tier === 'all-star') nextTier = 'mvp';
  else if (tier === 'mvp') nextTier = 'legend';

  return {
    percentage: overallPercentage,
    tier,
    xpEarned: earnedXP,
    xpTotal: totalXP,
    progressToNextTier: nextTier ? overallPercentage : 100,
    nextTier,
    fieldsCompleted: completedFields,
    fieldsTotal: totalFields,
    sections,
    recentAchievements: [],
  };
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
    const { uid } = req.params;
    const currentUserId = req.user!.uid;
    const sportIndexParam = req.query['sportIndex'] as string | undefined;

    // Only allow users to edit their own profile
    if (uid !== currentUserId) {
      throw forbiddenError('owner');
    }

    const db = req.firebase!.db;
    const doc = await db.collection(USERS_COLLECTION).doc(uid).get();

    if (!doc.exists) {
      throw notFoundError('profile');
    }

    const user = { id: doc.id, ...doc.data() } as User;

    // Parse sportIndex from query param
    const sportIndex = sportIndexParam !== undefined ? parseInt(sportIndexParam, 10) : undefined;
    const formData = userToEditProfileFormData(user, sportIndex);
    const completion = calculateProfileCompletion(formData);

    // Determine which sport index is being edited
    const editingSportIndex = sportIndex ?? user.activeSportIndex ?? 0;

    const response: EditProfileData = {
      uid: user.id,
      formData,
      completion,
      lastUpdated:
        typeof user.updatedAt === 'string'
          ? user.updatedAt
          : user.updatedAt && typeof user.updatedAt === 'object' && 'toDate' in user.updatedAt
            ? (user.updatedAt as { toDate(): Date }).toDate().toISOString()
            : new Date().toISOString(),
      // Include raw user data for sport switching
      rawUser: user,
      activeSportIndex: editingSportIndex,
    };

    logger.info('[EditProfile] Profile data loaded for editing', {
      uid,
      requestedSportIndex: sportIndex,
      activeSportIndex: user.activeSportIndex,
      totalSports: user.sports?.length,
      loadedSport: formData.sportsInfo.sport,
      loadedJerseyNumber: formData.sportsInfo.jerseyNumber,
      loadedPrimaryPosition: formData.sportsInfo.primaryPosition,
      allSports: user.sports?.map((s, i) => ({
        index: i,
        sport: s.sport,
        jerseyNumber: s.jerseyNumber,
        positions: s.positions,
      })),
      completion: completion.percentage,
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
    const { uid, sectionId } = req.params;
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
      'social-links',
      'contact',
    ];

    if (!validSections.includes(sectionId as EditProfileSectionId)) {
      throw fieldError('sectionId', `Invalid section ID: ${sectionId}`, 'invalid_section');
    }

    // Only allow users to update their own profile
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

    // Get previous completion for XP calculation
    const previousFormData = userToEditProfileFormData(user);
    const previousCompletion = calculateProfileCompletion(previousFormData);
    const previousSectionData = previousCompletion.sections.find((s) => s.sectionId === sectionId);

    // Parse sportIndex from query param (used for sports-related sections)
    const sportIndex = sportIndexParam !== undefined ? parseInt(sportIndexParam, 10) : undefined;

    // Map section data to Firestore updates
    const updates = sectionToFirestoreUpdate(
      sectionId as EditProfileSectionId,
      sectionData,
      user,
      sportIndex
    );

    logger.debug('[EditProfile] Firestore updates prepared', {
      sectionId,
      sportIndex,
      updateKeys: Object.keys(updates),
      updates,
      userSportsBeforeUpdate: user.sports,
    });

    // Log the exact raw updates object for debugging
    logger.debug('[EditProfile] RAW updates object being sent to Firestore:', {
      rawUpdates: JSON.stringify(updates, null, 2),
    });

    // Update Firestore
    await userRef.update(updates);

    logger.debug('[EditProfile] Firestore update completed', { userId: uid, sectionId });

    // Fetch updated user
    const updatedDoc = await userRef.get();
    const updatedUser = { id: updatedDoc.id, ...updatedDoc.data() } as User;

    // Invalidate all profile caches to ensure fresh data
    await invalidateProfileCaches(uid, updatedUser.username, updatedUser.unicode).catch((err) =>
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

    // Calculate new completion
    const updatedFormData = userToEditProfileFormData(updatedUser);
    const newCompletion = calculateProfileCompletion(updatedFormData);
    const newSectionData = newCompletion.sections.find((s) => s.sectionId === sectionId);

    // Calculate XP awarded (section level)
    const xpAwarded = (newSectionData?.xpEarned ?? 0) - (previousSectionData?.xpEarned ?? 0);

    // Check for tier upgrades (achievements)
    const achievementsUnlocked: Array<{
      id: string;
      title: string;
      description: string;
      icon: string;
      xpReward: number;
      unlockedAt: string;
      tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    }> = [];

    if (newCompletion.tier !== previousCompletion.tier) {
      achievementsUnlocked.push({
        id: `tier-${newCompletion.tier}`,
        title: `${newCompletion.tier.toUpperCase()} Status Achieved!`,
        description: `You've reached ${newCompletion.tier} tier with ${newCompletion.percentage}% profile completion`,
        icon: 'trophy',
        xpReward: 50,
        unlockedAt: new Date().toISOString(),
        tier:
          newCompletion.tier === 'legend'
            ? 'platinum'
            : newCompletion.tier === 'mvp'
              ? 'gold'
              : newCompletion.tier === 'all-star'
                ? 'silver'
                : 'bronze',
      });
    }

    const response: EditProfileUpdateResponse = {
      success: true,
      message: 'Profile updated successfully',
      xpAwarded,
      achievementsUnlocked,
      newCompletionPercentage: newCompletion.percentage,
      newTier: newCompletion.tier,
    };

    logger.info('[EditProfile] Section updated', {
      uid,
      sectionId,
      previousCompletion: previousCompletion.percentage,
      newCompletion: newCompletion.percentage,
      xpAwarded,
      tierUpgrade: newCompletion.tier !== previousCompletion.tier ? newCompletion.tier : null,
    });

    res.json({ success: true, data: response });
  })
);

/**
 * Get profile completion data
 * GET /api/v1/profile/:uid/completion
 */
router.get(
  '/:uid/completion',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { uid } = req.params;
    const currentUserId = req.user!.uid;

    // Only allow users to view their own completion
    if (uid !== currentUserId) {
      throw forbiddenError('owner');
    }

    const db = req.firebase!.db;
    const doc = await db.collection(USERS_COLLECTION).doc(uid).get();

    if (!doc.exists) {
      throw notFoundError('profile');
    }

    const user = { id: doc.id, ...doc.data() } as User;
    const formData = userToEditProfileFormData(user);
    const completion = calculateProfileCompletion(formData);

    logger.debug('[EditProfile] Completion calculated', {
      uid,
      percentage: completion.percentage,
      tier: completion.tier,
    });

    res.json({ success: true, data: completion });
  })
);

/**
 * Upload profile/banner photo
 * POST /api/v1/profile/:uid/photo
 *
 * Request: multipart/form-data
 * - file: image file
 * - type: 'profile' | 'banner'
 *
 * Response: { success: true, data: { url: string } }
 */
router.post(
  '/:uid/photo',
  appGuard,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { uid } = req.params;
    const currentUserId = req.user!.uid;
    const { type } = req.body;
    const file = req.file;

    // Validate required fields
    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    if (!type || (type !== 'profile' && type !== 'banner')) {
      throw fieldError('type', 'Type must be "profile" or "banner"', 'invalid');
    }

    // Authorization: user can only upload their own photos
    if (currentUserId !== uid) {
      throw forbiddenError('owner');
    }

    logger.info('Processing photo upload', {
      userId: uid,
      type,
      originalSize: formatFileSize(file.size),
      mimeType: file.mimetype,
    });

    // Optimize image (convert to JPEG)
    const jpegBuffer = await sharp(file.buffer)
      .resize(type === 'profile' ? 800 : 1200, type === 'profile' ? 800 : 400, {
        fit: 'cover',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Build storage path
    const storagePath = buildPhotoStoragePath(uid, type);

    // Upload to Firebase Storage (uses correct bucket from middleware)
    const url = await uploadToStorage(jpegBuffer, storagePath, 'image/jpeg', req.firebase!.storage);

    logger.info('Photo upload complete', {
      userId: uid,
      type,
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
 * type='banner'  — deletes bannerImg from Storage + clears field
 * type='profile' — deletes all profileImgs from Storage + clears gallery
 */
router.delete(
  '/:uid/photo/:type',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { uid, type } = req.params;
    const currentUserId = req.user!.uid;

    if (type !== 'profile' && type !== 'banner') {
      throw fieldError('type', 'Type must be "profile" or "banner"', 'invalid');
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

    if (type === 'banner') {
      const bannerImg = (userData['bannerImg'] as string | undefined) ?? null;
      if (bannerImg) {
        await deleteFromStorage(bannerImg, req.firebase!.storage);
      }
      updates['bannerImg'] = null;
    } else {
      // Delete all profile gallery images
      const profileImgs: string[] = (userData['profileImgs'] as string[] | undefined) ?? [];
      await Promise.allSettled(
        profileImgs.map((url) => deleteFromStorage(url, req.firebase!.storage))
      );
      updates['profileImgs'] = [];
      updates['profileImg'] = null;
    }

    await userRef.update(updates);

    await invalidateProfileCaches(uid, user.username, user.unicode).catch((err) =>
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
    const { uid } = req.params;
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
    await invalidateProfileCaches(uid, user.username, user.unicode).catch((err) =>
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
