/**
 * @fileoverview File Upload Routes - Backend-First Pattern with Firebase Extension Support
 * @module @nxt1/backend
 *
 * Handles all file uploads with:
 * - Multipart form-data parsing via multer
 * - File type and size validation
 * - Image optimization (resize, compress)
 * - Firebase Storage upload with CDN URLs
 * - Firebase Resize Images Extension support (auto-generates thumbnails)
 *
 * Architecture (2026 Best Practice):
 * ┌────────────────────────────────────────────────────────────┐
 * │                    Frontend (Web/Mobile)                   │
 * │   Collects file, validates client-side, sends multipart    │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ This File - Upload Routes ⭐                │
 * │   Validates, optimizes, uploads to Firebase Storage        │
 * ├────────────────────────────────────────────────────────────┤
 * │              Firebase Storage Resize Extension             │
 * │   Auto-generates thumbnails: 200x200, 400x400, 800x800     │
 * │   Output formats: WebP (primary) + JPG (fallback)          │
 * │   Stored in: {originalPath}/thumbs/                        │
 * ├────────────────────────────────────────────────────────────┤
 * │                    Firebase Storage                        │
 * │              Secure file storage with CDN                  │
 * └────────────────────────────────────────────────────────────┘
 *
 * @version 2.0.0
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { asyncHandler } from '@nxt1/core/errors/express';
import { fieldError, forbiddenError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';
import type { FileCategory, FileUploadResult } from '@nxt1/core';
import { FILE_UPLOAD_RULES, formatFileSize } from '@nxt1/core';

// Import storage constants for extension-compatible paths
import { THUMBNAIL_SIZES, IMAGE_FORMATS } from '@nxt1/core/constants';

const router: RouterType = Router();

// ============================================
// MULTER CONFIGURATION
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
  // Get category from request body (set before file)
  const category = (_req.body?.category || 'profile-photo') as FileCategory;
  const rules = FILE_UPLOAD_RULES[category];

  if (!rules) {
    cb(new Error(`Invalid file category: ${category}`));
    return;
  }

  // Check if MIME type is allowed
  const allowedTypes = rules.allowedTypes as readonly string[];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed for ${category}`));
  }
};

/**
 * Multer upload middleware
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max (validated per-category below)
    files: 1, // Single file upload
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Optimize and resize image using sharp
 *
 * @param buffer - Image buffer
 * @param category - File category for size limits
 * @param mimeType - Original MIME type
 * @returns Optimized image buffer and metadata
 */
async function optimizeImage(
  buffer: Buffer,
  category: FileCategory,
  mimeType: string
): Promise<{
  buffer: Buffer;
  mimeType: string;
  dimensions: { width: number; height: number };
}> {
  const rules = FILE_UPLOAD_RULES[category];
  const maxDimensions = rules?.maxDimensions;

  let sharpInstance = sharp(buffer);
  const metadata = await sharpInstance.metadata();

  // Resize if needed
  if (
    maxDimensions &&
    metadata.width &&
    metadata.height &&
    (metadata.width > maxDimensions.width || metadata.height > maxDimensions.height)
  ) {
    sharpInstance = sharpInstance.resize(maxDimensions.width, maxDimensions.height, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Determine output format and optimize
  let outputMimeType: string;
  let optimizedBuffer: Buffer;

  if (mimeType === 'image/gif') {
    // Keep GIFs as-is for animations
    outputMimeType = 'image/gif';
    optimizedBuffer = await sharpInstance.gif().toBuffer();
  } else if (mimeType === 'image/png') {
    // Keep PNGs for transparency with optimization
    outputMimeType = 'image/png';
    optimizedBuffer = await sharpInstance.png({ quality: 85, compressionLevel: 9 }).toBuffer();
  } else {
    // Convert JPEG/WebP to optimized WebP for best compression
    outputMimeType = 'image/webp';
    optimizedBuffer = await sharpInstance.webp({ quality: 85, effort: 6 }).toBuffer();
  }

  const optimizedMetadata = await sharp(optimizedBuffer).metadata();

  return {
    buffer: optimizedBuffer,
    mimeType: outputMimeType,
    dimensions: {
      width: optimizedMetadata.width || 0,
      height: optimizedMetadata.height || 0,
    },
  };
}

// NOTE: generateThumbnail removed - Firebase Extension now handles thumbnail generation

/**
 * Upload buffer to Firebase Storage
 *
 * @param buffer - File buffer
 * @param storagePath - Path in storage bucket
 * @param contentType - MIME type
 * @param bucket - Storage bucket instance (optional, uses default if not provided)
 * @returns Download URL
 */
async function uploadToStorage(
  buffer: Buffer,
  storagePath: string,
  contentType: string,
  bucket?: ReturnType<ReturnType<typeof getStorage>['bucket']>
): Promise<string> {
  const storageBucket = bucket || getStorage().bucket();
  const file = storageBucket.file(storagePath);

  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000', // 1 year cache
    },
  });

  // Make file publicly accessible
  await file.makePublic();

  // Get download URL
  return `https://storage.googleapis.com/${storageBucket.name}/${storagePath}`;
}

/**
 * Build storage path for file - Extension-Compatible Format
 *
 * Uses paths that trigger the Firebase Resize Images extension:
 * - Profile photos: users/{userId}/profile/avatar_{timestamp}.jpg
 * - Cover photos: users/{userId}/cover/cover_{timestamp}.jpg
 * - Team logos: teams/{teamId}/logo/logo_{timestamp}.jpg
 *
 * Extension will auto-generate thumbnails in:
 * - users/{userId}/profile/thumbs/avatar_{timestamp}_200x200.webp
 * - users/{userId}/profile/thumbs/avatar_{timestamp}_400x400.webp
 * - users/{userId}/profile/thumbs/avatar_{timestamp}_800x800.webp
 *
 * @param userId - User ID
 * @param category - File category
 * @param fileName - Original filename (optional, used for extension)
 * @returns Storage path compatible with Firebase extension
 */
function buildExtensionCompatiblePath(
  userId: string,
  category: FileCategory,
  fileName?: string
): string {
  const timestamp = Date.now();
  const extension = 'jpg'; // Use jpg for broad compatibility with extension

  switch (category) {
    case 'profile-photo':
      // Extension path: users/{userId}/profile/avatar_{timestamp}.jpg
      return `users/${userId}/profile/avatar_${timestamp}.${extension}`;

    case 'cover-photo':
      // Extension path: users/{userId}/cover/cover_{timestamp}.jpg
      return `users/${userId}/cover/cover_${timestamp}.${extension}`;

    case 'document': {
      // Documents don't go through extension - keep original format
      const docExtension = fileName?.split('.').pop() || 'pdf';
      const sanitizedName = (fileName || 'document').replace(/[^a-zA-Z0-9.-]/g, '_').split('.')[0];
      return `users/${userId}/documents/${timestamp}_${sanitizedName}.${docExtension}`;
    }

    default:
      // Fallback for unknown categories
      return `users/${userId}/uploads/${timestamp}.${extension}`;
  }
}

/**
 * Build thumbnail paths generated by Firebase Extension.
 * Extension generates 3 sizes x 3 formats = 9 thumbnails in same directory.
 *
 * @param originalPath - Original file path
 * @returns Object with all thumbnail paths
 */
function getExtensionThumbnailPaths(originalPath: string): {
  small: { jpg: string; webp: string; png: string };
  medium: { jpg: string; webp: string; png: string };
  large: { jpg: string; webp: string; png: string };
} {
  const lastSlash = originalPath.lastIndexOf('/');
  const directory = originalPath.substring(0, lastSlash);
  const filename = originalPath.substring(lastSlash + 1);
  const dotIndex = filename.lastIndexOf('.');
  const name = filename.substring(0, dotIndex);

  // Extension generates in SAME directory (no thumbs/ subdirectory)
  // Format: {name}_{width}x{height}.{format}
  return {
    small: {
      jpg: `${directory}/${name}_${THUMBNAIL_SIZES.SMALL.suffix}.${IMAGE_FORMATS.JPEG}`,
      webp: `${directory}/${name}_${THUMBNAIL_SIZES.SMALL.suffix}.${IMAGE_FORMATS.WEBP}`,
      png: `${directory}/${name}_${THUMBNAIL_SIZES.SMALL.suffix}.${IMAGE_FORMATS.PNG}`,
    },
    medium: {
      jpg: `${directory}/${name}_${THUMBNAIL_SIZES.MEDIUM.suffix}.${IMAGE_FORMATS.JPEG}`,
      webp: `${directory}/${name}_${THUMBNAIL_SIZES.MEDIUM.suffix}.${IMAGE_FORMATS.WEBP}`,
      png: `${directory}/${name}_${THUMBNAIL_SIZES.MEDIUM.suffix}.${IMAGE_FORMATS.PNG}`,
    },
    large: {
      jpg: `${directory}/${name}_${THUMBNAIL_SIZES.LARGE.suffix}.${IMAGE_FORMATS.JPEG}`,
      webp: `${directory}/${name}_${THUMBNAIL_SIZES.LARGE.suffix}.${IMAGE_FORMATS.WEBP}`,
      png: `${directory}/${name}_${THUMBNAIL_SIZES.LARGE.suffix}.${IMAGE_FORMATS.PNG}`,
    },
  };
}

/**
 * Wait for Firebase Extension to generate thumbnails
 *
 * The extension typically takes 200-500ms to process.
 * We poll for the smallest thumbnail to verify processing is complete.
 *
 * @param bucket - Storage bucket
 * @param thumbnailPath - Path to check (usually small thumbnail)
 * @param maxAttempts - Maximum polling attempts
 * @param delayMs - Delay between attempts
 * @returns true if thumbnail exists, false if timeout
 */
async function waitForExtensionThumbnails(
  bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>,
  thumbnailPath: string,
  maxAttempts: number = 10,
  delayMs: number = 300
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const [exists] = await bucket.file(thumbnailPath).exists();
      if (exists) {
        logger.debug('Extension thumbnail ready', { path: thumbnailPath, attempt });
        return true;
      }
    } catch {
      // Ignore errors during polling
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  logger.warn('Extension thumbnail timeout', { path: thumbnailPath, maxAttempts });
  return false;
}

/**
 * Build download URLs for extension-generated thumbnails
 *
 * Returns WebP URLs (best compression, modern browsers).
 * Frontend can construct jpg/png URLs if needed using same pattern.
 *
 * @param bucketName - Storage bucket name
 * @param thumbnailPaths - Paths from getExtensionThumbnailPaths()
 * @returns URLs for all thumbnail sizes (WebP primary, with all format paths)
 */
function buildThumbnailUrls(
  bucketName: string,
  thumbnailPaths: ReturnType<typeof getExtensionThumbnailPaths>
): {
  small: string;
  medium: string;
  large: string;
  /** All format URLs for advanced use cases */
  all: {
    small: { jpg: string; webp: string; png: string };
    medium: { jpg: string; webp: string; png: string };
    large: { jpg: string; webp: string; png: string };
  };
} {
  const baseUrl = `https://storage.googleapis.com/${bucketName}`;

  return {
    // Primary URLs (WebP - best compression)
    small: `${baseUrl}/${thumbnailPaths.small.webp}`,
    medium: `${baseUrl}/${thumbnailPaths.medium.webp}`,
    large: `${baseUrl}/${thumbnailPaths.large.webp}`,
    // All format URLs for <picture> srcset or fallbacks
    all: {
      small: {
        jpg: `${baseUrl}/${thumbnailPaths.small.jpg}`,
        webp: `${baseUrl}/${thumbnailPaths.small.webp}`,
        png: `${baseUrl}/${thumbnailPaths.small.png}`,
      },
      medium: {
        jpg: `${baseUrl}/${thumbnailPaths.medium.jpg}`,
        webp: `${baseUrl}/${thumbnailPaths.medium.webp}`,
        png: `${baseUrl}/${thumbnailPaths.medium.png}`,
      },
      large: {
        jpg: `${baseUrl}/${thumbnailPaths.large.jpg}`,
        webp: `${baseUrl}/${thumbnailPaths.large.webp}`,
        png: `${baseUrl}/${thumbnailPaths.large.png}`,
      },
    },
  };
}

/**
 * Build storage path for file
 *
 * @deprecated Use buildExtensionCompatiblePath() instead for extension support
 */
function buildStoragePath(userId: string, category: FileCategory, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const extension = category === 'profile-photo' ? 'webp' : sanitizedName.split('.').pop() || 'bin';

  return `users/${userId}/${category}/${timestamp}_${sanitizedName.split('.')[0]}.${extension}`;
}

// ============================================
// EXTENDED RESPONSE TYPE FOR EXTENSION SUPPORT
// ============================================

/**
 * Extended file upload result with extension-generated thumbnails
 */
interface ExtendedFileUploadResult extends FileUploadResult {
  /** Thumbnails generated by Firebase Resize Images extension */
  thumbnails?: {
    /** 200x200 thumbnail (WebP) */
    small: string;
    /** 400x400 thumbnail (WebP) */
    medium: string;
    /** 800x800 thumbnail (WebP) */
    large: string;
  };
  /** Whether extension thumbnails are ready (async generation) */
  thumbnailsReady?: boolean;
}

// ============================================
// ROUTES
// ============================================

/**
 * POST /upload/profile-photo
 *
 * Upload profile photo with optimization and Firebase Extension thumbnail generation.
 *
 * Flow:
 * 1. Validate and optimize image
 * 2. Upload to extension-compatible path: users/{userId}/profile/avatar_{timestamp}.jpg
 * 3. Wait for Firebase Extension to generate thumbnails
 * 4. Return URLs including auto-generated thumbnails
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Body: file (image), userId, category, fileName
 *
 * Response:
 * - 200: { success: true, data: ExtendedFileUploadResult }
 * - 400: Validation error
 * - 401: Unauthorized
 * - 413: File too large
 * - 415: Unsupported media type
 */
router.post(
  '/profile-photo',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, fileName } = req.body;
    const file = req.file;

    // Validate required fields
    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    // Validate file size per category rules
    const category: FileCategory = 'profile-photo';
    const rules = FILE_UPLOAD_RULES[category];

    if (file.size > rules.maxSize) {
      throw fieldError(
        'file',
        `File must be smaller than ${formatFileSize(rules.maxSize)}`,
        'maxSize'
      );
    }

    logger.info('Processing profile photo upload', {
      userId,
      originalSize: formatFileSize(file.size),
      mimeType: file.mimetype,
    });

    // Get the appropriate storage bucket from request context
    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();

    // Optimize image (convert to JPEG for extension compatibility)
    const optimized = await optimizeImage(file.buffer, category, file.mimetype);

    // Convert to JPEG for extension (extension processes jpg better)
    const jpegBuffer = await sharp(optimized.buffer).jpeg({ quality: 90 }).toBuffer();

    // Build extension-compatible storage path
    // Format: users/{userId}/profile/avatar_{timestamp}.jpg
    const mainPath = buildExtensionCompatiblePath(userId, category, fileName);

    // Upload to Firebase Storage (extension triggers automatically)
    const mainUrl = await uploadToStorage(jpegBuffer, mainPath, 'image/jpeg', bucket);

    // Get expected thumbnail paths (generated by extension)
    const thumbnailPaths = getExtensionThumbnailPaths(mainPath);

    // Wait for extension to generate thumbnails (typically 200-500ms)
    const thumbnailsReady = await waitForExtensionThumbnails(
      bucket,
      thumbnailPaths.small.webp, // Check smallest first
      10, // max attempts
      300 // 300ms between checks = 3 second max wait
    );

    // Build thumbnail URLs
    const thumbnailUrls = buildThumbnailUrls(bucket.name, thumbnailPaths);

    const result: ExtendedFileUploadResult = {
      url: mainUrl,
      storagePath: mainPath,
      size: jpegBuffer.length,
      mimeType: 'image/jpeg',
      thumbnailUrl: thumbnailUrls.medium, // Default to medium for backwards compatibility
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

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /upload/banner-photo
 *
 * Upload banner/cover photo with optimization.
 * Alias for cover-photo to match core API expectations.
 */
router.post(
  '/banner-photo',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    req.body.category = 'cover-photo'; // Map to existing category
    const { userId } = req.body;
    const file = req.file;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    const category: FileCategory = 'cover-photo';
    const rules = FILE_UPLOAD_RULES[category];

    if (file.size > rules.maxSize) {
      throw fieldError(
        'file',
        `File must be smaller than ${formatFileSize(rules.maxSize)}`,
        'maxSize'
      );
    }

    res.status(501).json({ success: false, error: 'Not implemented' });
  })
);

/**
 * POST /upload/highlight-video
 *
 * Upload highlight video.
 */
router.post(
  '/highlight-video',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body;
    const file = req.file;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    res.status(501).json({ success: false, error: 'Not implemented' });
  })
);

/**
 * POST /upload/graphic
 *
 * Upload graphic/image.
 */
router.post(
  '/graphic',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body;
    const file = req.file;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    res.status(501).json({ success: false, error: 'Not implemented' });
  })
);

/**
 * POST /upload/highlight-video
 *
 * Upload highlight video.
 */
router.post(
  '/highlight-video',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body;
    const file = req.file;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    res.status(501).json({ success: false, error: 'Not implemented' });
  })
);

/**
 * POST /upload/graphic
 *
 * Upload graphic/image.
 */
router.post(
  '/graphic',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body;
    const file = req.file;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    res.status(501).json({ success: false, error: 'Not implemented' });
  })
);

/**
 * POST /upload/cover-photo
 *
 * Upload cover photo with optimization.
 * Note: Cover photos don't use the resize extension (not in monitored path).
 */
router.post(
  '/cover-photo',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, fileName } = req.body;
    const file = req.file;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    const category: FileCategory = 'cover-photo';
    const rules = FILE_UPLOAD_RULES[category];

    if (file.size > rules.maxSize) {
      throw fieldError(
        'file',
        `File must be smaller than ${formatFileSize(rules.maxSize)}`,
        'maxSize'
      );
    }

    logger.info('Processing cover photo upload', {
      userId,
      originalSize: formatFileSize(file.size),
    });

    // Get the appropriate storage bucket from request context
    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();

    // Optimize image
    const optimized = await optimizeImage(file.buffer, category, file.mimetype);

    // Build storage path and upload (cover photos are in users/{userId}/cover-photo/)
    const originalFileName = fileName || file.originalname;
    const timestamp = Date.now();
    const sanitizedName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_').split('.')[0];
    const mainPath = `users/${userId}/cover-photo/cover_${timestamp}_${sanitizedName}.webp`;

    const mainUrl = await uploadToStorage(optimized.buffer, mainPath, optimized.mimeType, bucket);

    const result: FileUploadResult = {
      url: mainUrl,
      storagePath: mainPath,
      size: optimized.buffer.length,
      mimeType: optimized.mimeType,
      dimensions: optimized.dimensions,
    };

    logger.info('Cover photo upload complete', {
      userId,
      url: mainUrl,
      optimizedSize: formatFileSize(optimized.buffer.length),
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /upload/document
 *
 * Upload document (PDF, etc.) without image processing.
 */
router.post(
  '/document',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, fileName } = req.body;
    const file = req.file;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    const category: FileCategory = 'document';
    const rules = FILE_UPLOAD_RULES[category];

    if (file.size > rules.maxSize) {
      throw fieldError(
        'file',
        `File must be smaller than ${formatFileSize(rules.maxSize)}`,
        'maxSize'
      );
    }

    logger.info('Processing document upload', {
      userId,
      size: formatFileSize(file.size),
      mimeType: file.mimetype,
    });

    // Build storage path and upload (no optimization for documents)
    const originalFileName = fileName || file.originalname;
    const mainPath = buildStoragePath(userId, category, originalFileName);
    const mainUrl = await uploadToStorage(file.buffer, mainPath, file.mimetype);

    const result: FileUploadResult = {
      url: mainUrl,
      storagePath: mainPath,
      size: file.size,
      mimeType: file.mimetype,
    };

    logger.info('Document upload complete', { userId, url: mainUrl });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * DELETE /upload/:filePath
 *
 * Delete uploaded file from storage (path param version for core API compatibility).
 */
router.delete(
  '/:filePath',
  asyncHandler(async (_: Request, res: Response) => {
    res.status(501).json({ success: false, error: 'Not implemented' });
  })
);

/**
 * DELETE /upload/file
 *
 * Delete uploaded file from storage.
 * Automatically cleans up extension-generated thumbnails.
 *
 * Query params:
 * - userId: User ID (for authorization)
 * - path: Storage path to delete
 */
router.delete(
  '/file',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, path: storagePath } = req.query;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

    if (!storagePath) {
      throw fieldError('path', 'Storage path is required', 'required');
    }

    // Security: Ensure path belongs to user
    const pathString = String(storagePath);
    if (!pathString.startsWith(`users/${userId}/`)) {
      throw forbiddenError('owner');
    }

    logger.info('Deleting file', { userId, path: storagePath });

    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();
    const file = bucket.file(pathString);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      // File doesn't exist - success (idempotent)
      res.json({ success: true });
      return;
    }

    // Delete main file
    await file.delete();

    // Check if this is a profile photo (extension-monitored path)
    const isProfilePhoto = pathString.includes('/profile/');

    if (isProfilePhoto) {
      // Delete all extension-generated thumbnails (3 sizes × 3 formats = 9 files)
      const thumbnailPaths = getExtensionThumbnailPaths(pathString);
      const allThumbnails = [
        // Small (200x200)
        thumbnailPaths.small.jpg,
        thumbnailPaths.small.webp,
        thumbnailPaths.small.png,
        // Medium (400x400)
        thumbnailPaths.medium.jpg,
        thumbnailPaths.medium.webp,
        thumbnailPaths.medium.png,
        // Large (800x800)
        thumbnailPaths.large.jpg,
        thumbnailPaths.large.webp,
        thumbnailPaths.large.png,
      ];

      // Delete thumbnails in parallel (ignore errors for non-existent files)
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
      // Legacy: Also try to delete old-style thumbnail if it exists
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

/**
 * POST /upload/signed-url
 *
 * Get signed upload URL for large files (direct-to-storage upload).
 * Backend validates after upload completes.
 *
 * Note: Direct uploads to extension-monitored paths will trigger automatic
 * thumbnail generation. Use path format: users/{userId}/profile/...
 */
router.post(
  '/signed-url',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, category, fileName, mimeType } = req.body;

    if (!userId) {
      throw fieldError('userId', 'User ID is required', 'required');
    }

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

    // Validate MIME type
    const allowedTypes = rules.allowedTypes as readonly string[];
    if (!allowedTypes.includes(mimeType)) {
      throw fieldError('mimeType', `File type ${mimeType} not allowed for ${category}`, 'invalid');
    }

    // Use extension-compatible path for profile photos
    const storagePath =
      category === 'profile-photo'
        ? buildExtensionCompatiblePath(userId, category as FileCategory, fileName)
        : buildStoragePath(userId, category as FileCategory, fileName);

    const bucket = req.firebase?.storage?.bucket() || getStorage().bucket();
    const file = bucket.file(storagePath);

    // Generate signed URL valid for 15 minutes
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: mimeType,
    });

    // Include thumbnail paths if extension will process
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
