import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { asyncHandler } from '@nxt1/core/errors/express';
import { fieldError, forbiddenError } from '@nxt1/core/errors';
import { FILE_UPLOAD_RULES, formatFileSize } from '@nxt1/core';
import type { FileCategory } from '@nxt1/core';
import { logger } from '../../../utils/logger.js';
import {
  type ExtendedFileUploadResult,
  upload,
  optimizeImage,
  uploadToStorage,
  buildExtensionCompatiblePath,
  buildStoragePath,
  buildTeamLogoPath,
  getExtensionThumbnailPaths,
  waitForExtensionThumbnails,
  buildThumbnailUrls,
} from './shared.js';
import { RosterEntryService } from '../../../services/team/roster-entry.service.js';

const router: RouterType = Router();

const TEAM_MEDIA_MANAGER_ROLES = new Set([
  'admin',
  'head-coach',
  'coach',
  'administrative',
  'director',
  'program-director',
]);

async function canManageTeamMedia(
  db: FirebaseFirestore.Firestore,
  teamId: string,
  userId: string,
  teamData: Record<string, unknown>
): Promise<boolean> {
  const rosterService = new RosterEntryService(db);
  const entry = await rosterService.getActiveOrPendingRosterEntry(userId, teamId);
  const entryRole = typeof entry?.role === 'string' ? entry.role.toLowerCase() : '';

  if (TEAM_MEDIA_MANAGER_ROLES.has(entryRole)) {
    return true;
  }

  const adminIds = Array.isArray(teamData['adminIds'])
    ? teamData['adminIds'].filter((value): value is string => typeof value === 'string')
    : [];

  return (
    teamData['ownerId'] === userId ||
    teamData['coachId'] === userId ||
    teamData['createdBy'] === userId ||
    adminIds.includes(userId)
  );
}

// ============================================
// POST /profile-photo
// ============================================

router.post(
  '/profile-photo',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const file = req.file;

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    const category: FileCategory = 'profile-photo';
    const rules = FILE_UPLOAD_RULES[category];

    const maxSize = 'maxSize' in rules ? (rules as { maxSize: number }).maxSize : null;
    if (maxSize !== null && file.size > maxSize) {
      throw fieldError('file', `File must be smaller than ${formatFileSize(maxSize)}`, 'maxSize');
    }

    logger.info('Processing profile photo upload', {
      userId,
      originalSize: formatFileSize(file.size),
      mimeType: file.mimetype,
    });

    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();

    const optimized = await optimizeImage(file.buffer, category, file.mimetype);

    // Convert to JPEG for extension compatibility
    const jpegBuffer = await sharp(optimized.buffer).jpeg({ quality: 90 }).toBuffer();

    const mainPath = buildExtensionCompatiblePath(userId, category);
    const mainUrl = await uploadToStorage(jpegBuffer, mainPath, 'image/jpeg', bucket);

    const thumbnailPaths = getExtensionThumbnailPaths(mainPath);
    const thumbnailsReady = await waitForExtensionThumbnails(
      bucket,
      thumbnailPaths.small.webp,
      10,
      300
    );

    const thumbnailUrls = buildThumbnailUrls(bucket.name, thumbnailPaths);

    const result: ExtendedFileUploadResult = {
      url: mainUrl,
      storagePath: mainPath,
      size: jpegBuffer.length,
      mimeType: 'image/jpeg',
      thumbnailUrl: thumbnailUrls.medium,
      dimensions: optimized.dimensions,
      thumbnails: thumbnailUrls,
      thumbnailsReady,
    };

    logger.info('Profile photo upload complete', {
      userId,
      url: mainUrl,
      optimizedSize: formatFileSize(jpegBuffer.length),
      compressionRatio: `${Math.round((1 - jpegBuffer.length / file.size) * 100)}%`,
      thumbnailsReady,
      thumbnails: thumbnailUrls,
    });

    res.json({ success: true, data: result });
  })
);

router.post(
  '/team-logo',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const file = req.file;
    const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId.trim() : '';

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    if (!teamId) {
      throw fieldError('teamId', 'Team ID is required for team-logo uploads', 'required');
    }

    const category: FileCategory = 'team-logo';
    const rules = FILE_UPLOAD_RULES[category];
    const maxSize = 'maxSize' in rules ? (rules as { maxSize: number }).maxSize : null;

    if (maxSize !== null && file.size > maxSize) {
      throw fieldError('file', `File must be smaller than ${formatFileSize(maxSize)}`, 'maxSize');
    }

    const db = req.firebase?.db;
    if (!db) {
      throw fieldError('teamId', 'Database unavailable', 'server_error');
    }

    const teamDoc = await db.collection('Teams').doc(teamId).get();
    if (!teamDoc.exists) {
      throw forbiddenError('team');
    }

    const teamData = teamDoc.data() ?? {};
    const isAuthorized = await canManageTeamMedia(db, teamId, userId, teamData);
    if (!isAuthorized) {
      throw forbiddenError('team');
    }

    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();
    const storagePath = buildTeamLogoPath(teamId, file.originalname);
    const url = await uploadToStorage(file.buffer, storagePath, file.mimetype, bucket);

    logger.info('Team logo upload complete', {
      userId,
      teamId,
      storagePath,
      mimeType: file.mimetype,
      size: formatFileSize(file.size),
    });

    res.json({
      success: true,
      data: {
        url,
        storagePath,
        size: file.size,
        mimeType: file.mimetype,
      },
    });
  })
);

// ============================================
// POST /highlight-video
// ============================================

router.post(
  '/highlight-video',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const { fileName, mimeType, fileSize } = req.body;

    if (!fileName) {
      throw fieldError('fileName', 'File name is required', 'required');
    }

    if (!mimeType) {
      throw fieldError('mimeType', 'MIME type is required', 'required');
    }

    const category: FileCategory = 'highlight-video';
    const rules = FILE_UPLOAD_RULES[category];

    const allowedTypes = rules.allowedTypes as readonly string[];
    if (!allowedTypes.includes(mimeType)) {
      throw fieldError(
        'mimeType',
        `File type ${mimeType} not allowed. Allowed: ${allowedTypes.join(', ')}`,
        'invalid'
      );
    }

    if (fileSize && fileSize > rules.maxSize) {
      throw fieldError(
        'fileSize',
        `File must be smaller than ${formatFileSize(rules.maxSize)}`,
        'maxSize'
      );
    }

    const storagePath = buildStoragePath(userId, category, fileName);
    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();
    const file = bucket.file(storagePath);

    const expiresAt = Date.now() + 30 * 60 * 1000;
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType: mimeType,
      extensionHeaders: {
        'x-goog-content-length-range': `0,${rules.maxSize}`,
      },
    });

    logger.info('Generated highlight video upload URL', {
      userId,
      storagePath,
      mimeType,
      fileSize: fileSize ? formatFileSize(fileSize) : 'unknown',
    });

    res.json({
      success: true,
      data: {
        uploadUrl: signedUrl,
        storagePath,
        expiresAt,
        maxSize: rules.maxSize,
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
      },
    });
  })
);

// ============================================
// POST /highlight-video/confirm
// ============================================

router.post(
  '/highlight-video/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const { storagePath } = req.body;

    if (!storagePath) {
      throw fieldError('storagePath', 'Storage path is required', 'required');
    }

    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();

    if (!exists) {
      throw fieldError(
        'storagePath',
        'Uploaded file not found at the specified path. Upload may have failed.',
        'not_found'
      );
    }

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    logger.info('Video upload confirmed', { userId, storagePath });

    res.json({
      success: true,
      data: {
        publicUrl,
        storagePath,
        message: 'Video upload confirmed.',
      },
    });
  })
);

// ============================================
// DELETE /file
// ============================================

router.delete(
  '/file',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const { path: storagePath } = req.query;

    if (!storagePath) {
      throw fieldError('path', 'Storage path is required', 'required');
    }

    const pathString = String(storagePath);
    if (!pathString.startsWith(`Users/${userId}/`)) {
      throw forbiddenError('owner');
    }

    logger.info('Deleting file', { userId, path: storagePath });

    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();
    const file = bucket.file(pathString);

    const [exists] = await file.exists();
    if (!exists) {
      res.json({ success: true });
      return;
    }

    await file.delete();

    const isProfilePhoto = pathString.includes('/profile/');

    if (isProfilePhoto) {
      const thumbnailPaths = getExtensionThumbnailPaths(pathString);
      const allThumbnails = [
        thumbnailPaths.small.jpg,
        thumbnailPaths.small.webp,
        thumbnailPaths.small.png,
        thumbnailPaths.medium.jpg,
        thumbnailPaths.medium.webp,
        thumbnailPaths.medium.png,
        thumbnailPaths.large.jpg,
        thumbnailPaths.large.webp,
        thumbnailPaths.large.png,
      ];

      await Promise.allSettled(
        allThumbnails.map(async (thumbPath) => {
          const thumbFile = bucket.file(thumbPath);
          const [thumbExists] = await thumbFile.exists();
          if (thumbExists) {
            await thumbFile.delete();
            logger.debug('Deleted thumbnail', { path: thumbPath });
          }
        })
      );

      logger.info('File and thumbnails deleted', {
        userId,
        path: storagePath,
        thumbnailsDeleted: allThumbnails.length,
      });
    } else {
      const legacyThumbnailPath = pathString.replace(/(\.[^.]+)$/, '_thumb.webp');
      const legacyThumbnailFile = bucket.file(legacyThumbnailPath);
      const [legacyExists] = await legacyThumbnailFile.exists();
      if (legacyExists) {
        await legacyThumbnailFile.delete();
      }

      logger.info('File deleted', { userId, path: storagePath });
    }

    res.json({ success: true });
  })
);

// ============================================
// POST /signed-url
// ============================================

router.post(
  '/signed-url',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const { category, fileName, mimeType, teamId } = req.body;

    if (!category) {
      throw fieldError('category', 'File category is required', 'required');
    }

    if (!fileName) {
      throw fieldError('fileName', 'File name is required', 'required');
    }

    if (!mimeType) {
      throw fieldError('mimeType', 'MIME type is required', 'required');
    }

    const rules = FILE_UPLOAD_RULES[category as FileCategory];
    if (!rules) {
      throw fieldError('category', `Invalid file category: ${category}`, 'invalid');
    }

    const allowedTypes = rules.allowedTypes as readonly string[];
    if (!allowedTypes.includes(mimeType)) {
      throw fieldError('mimeType', `File type ${mimeType} not allowed for ${category}`, 'invalid');
    }

    let storagePath: string;

    if (category === 'team-logo') {
      if (!teamId || typeof teamId !== 'string') {
        throw fieldError('teamId', 'Team ID is required for team-logo uploads', 'required');
      }

      const db = req.firebase?.db;
      if (!db) {
        throw fieldError('teamId', 'Database unavailable', 'server_error');
      }

      const teamDoc = await db.collection('Teams').doc(teamId).get();
      if (!teamDoc.exists) {
        throw forbiddenError('team');
      }

      const teamData = teamDoc.data() ?? {};
      const isAuthorized = await canManageTeamMedia(db, teamId, userId, teamData);

      if (!isAuthorized) {
        throw forbiddenError('team');
      }

      storagePath = buildTeamLogoPath(teamId, fileName);
    } else if (category === 'profile-photo') {
      storagePath = buildExtensionCompatiblePath(userId, category as FileCategory);
    } else {
      storagePath = buildStoragePath(userId, category as FileCategory, fileName);
    }

    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();
    const file = bucket.file(storagePath);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: mimeType,
    });

    const isExtensionPath = storagePath.includes('/profile/');
    const thumbnailPaths = isExtensionPath ? getExtensionThumbnailPaths(storagePath) : null;

    res.json({
      success: true,
      data: {
        uploadUrl: signedUrl,
        storagePath,
        expiresAt: Date.now() + 15 * 60 * 1000,
        extensionEnabled: isExtensionPath,
        thumbnailPaths: thumbnailPaths
          ? {
              small: thumbnailPaths.small.webp,
              medium: thumbnailPaths.medium.webp,
              large: thumbnailPaths.large.webp,
            }
          : null,
      },
    });
  })
);

export default router;
