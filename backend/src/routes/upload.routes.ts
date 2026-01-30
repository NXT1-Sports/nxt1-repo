/**
 * @fileoverview File Upload Routes - Backend-First Pattern
 * @module @nxt1/backend
 *
 * Handles all file uploads with:
 * - Multipart form-data parsing via multer
 * - File type and size validation
 * - Image optimization (resize, compress)
 * - Firebase Storage upload with CDN URLs
 * - Thumbnail generation for images
 *
 * Architecture (2026 Best Practice):
 * ┌────────────────────────────────────────────────────────────┐
 * │                    Frontend (Web/Mobile)                   │
 * │   Collects file, validates client-side, sends multipart    │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ This File - Upload Routes ⭐                │
 * │   Validates, optimizes, uploads to Firebase Storage        │
 * ├────────────────────────────────────────────────────────────┤
 * │                    Firebase Storage                        │
 * │              Secure file storage with CDN                  │
 * └────────────────────────────────────────────────────────────┘
 *
 * @version 1.0.0
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

/**
 * Generate thumbnail for image
 *
 * @param buffer - Image buffer
 * @param size - Thumbnail size (square)
 * @returns Thumbnail buffer
 */
async function generateThumbnail(buffer: Buffer, size: number = 200): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, {
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: 75 })
    .toBuffer();
}

/**
 * Upload buffer to Firebase Storage
 *
 * @param buffer - File buffer
 * @param storagePath - Path in storage bucket
 * @param contentType - MIME type
 * @returns Download URL
 */
async function uploadToStorage(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<string> {
  const bucket = getStorage().bucket();
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
 * Build storage path for file
 *
 * @param userId - User ID
 * @param category - File category
 * @param fileName - Original filename
 * @returns Storage path
 */
function buildStoragePath(userId: string, category: FileCategory, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const extension = category === 'profile-photo' ? 'webp' : sanitizedName.split('.').pop() || 'bin';

  return `users/${userId}/${category}/${timestamp}_${sanitizedName.split('.')[0]}.${extension}`;
}

// ============================================
// ROUTES
// ============================================

/**
 * POST /upload/profile-photo
 *
 * Upload profile photo with optimization and thumbnail generation.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Body: file (image), userId, category, fileName
 *
 * Response:
 * - 200: { success: true, data: FileUploadResult }
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

    // Optimize image
    const optimized = await optimizeImage(file.buffer, category, file.mimetype);

    // Generate thumbnail
    const thumbnailBuffer = await generateThumbnail(file.buffer, 200);

    // Build storage paths
    const originalFileName = fileName || file.originalname;
    const mainPath = buildStoragePath(userId, category, originalFileName);
    const thumbnailPath = mainPath.replace(/(\.[^.]+)$/, '_thumb.webp');

    // Upload to Firebase Storage
    const [mainUrl, thumbnailUrl] = await Promise.all([
      uploadToStorage(optimized.buffer, mainPath, optimized.mimeType),
      uploadToStorage(thumbnailBuffer, thumbnailPath, 'image/webp'),
    ]);

    const result: FileUploadResult = {
      url: mainUrl,
      storagePath: mainPath,
      size: optimized.buffer.length,
      mimeType: optimized.mimeType,
      thumbnailUrl,
      dimensions: optimized.dimensions,
    };

    logger.info('Profile photo upload complete', {
      userId,
      url: mainUrl,
      optimizedSize: formatFileSize(optimized.buffer.length),
      compressionRatio: `${Math.round((1 - optimized.buffer.length / file.size) * 100)}%`,
    });

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /upload/cover-photo
 *
 * Upload cover photo with optimization.
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

    // Optimize image
    const optimized = await optimizeImage(file.buffer, category, file.mimetype);

    // Build storage path and upload
    const originalFileName = fileName || file.originalname;
    const mainPath = buildStoragePath(userId, category, originalFileName);
    const mainUrl = await uploadToStorage(optimized.buffer, mainPath, optimized.mimeType);

    const result: FileUploadResult = {
      url: mainUrl,
      storagePath: mainPath,
      size: optimized.buffer.length,
      mimeType: optimized.mimeType,
      dimensions: optimized.dimensions,
    };

    logger.info('Cover photo upload complete', { userId, url: mainUrl });

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
 * DELETE /upload/file
 *
 * Delete uploaded file from storage.
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

    const bucket = getStorage().bucket();
    const file = bucket.file(pathString);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      // File doesn't exist - success (idempotent)
      res.json({ success: true });
      return;
    }

    // Delete file
    await file.delete();

    // Also try to delete thumbnail if it exists
    const thumbnailPath = pathString.replace(/(\.[^.]+)$/, '_thumb.webp');
    const thumbnailFile = bucket.file(thumbnailPath);
    const [thumbnailExists] = await thumbnailFile.exists();
    if (thumbnailExists) {
      await thumbnailFile.delete();
    }

    logger.info('File deleted', { userId, path: storagePath });

    res.json({ success: true });
  })
);

/**
 * POST /upload/signed-url
 *
 * Get signed upload URL for large files (direct-to-storage upload).
 * Backend validates after upload completes.
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

    const storagePath = buildStoragePath(userId, category as FileCategory, fileName);
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    // Generate signed URL valid for 15 minutes
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: mimeType,
    });

    res.json({
      success: true,
      data: {
        uploadUrl: signedUrl,
        storagePath,
        expiresAt: Date.now() + 15 * 60 * 1000,
      },
    });
  })
);

export default router;
