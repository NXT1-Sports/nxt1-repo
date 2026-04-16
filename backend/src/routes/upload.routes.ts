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
import { Timestamp } from 'firebase-admin/firestore';
import { asyncHandler } from '@nxt1/core/errors/express';
import { fieldError, forbiddenError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';
import { appGuard } from '../middleware/auth.middleware.js';
import type { FileCategory, FileUploadResult } from '@nxt1/core';
import { FILE_UPLOAD_RULES, formatFileSize, PostVisibility } from '@nxt1/core';

// Import storage constants for extension-compatible paths
import { THUMBNAIL_SIZES, IMAGE_FORMATS } from '@nxt1/core/constants';
import { getCacheService } from '../services/cache.service.js';
import { invalidateProfileCaches } from './profile.routes.js';
import { buildVideoSearchIndex } from '../utils/search-index.js';

const router: RouterType = Router();
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const DEFAULT_CF_VIDEO_MAX_DURATION_SECONDS = 10_800;
const DEFAULT_CF_UPLOAD_EXPIRY_HOURS = 12;
const POSTS_COLLECTION = 'Posts';

interface CloudflareVideoFinalizeResponse {
  readonly cloudflareVideoId: string;
  readonly status: string;
  readonly readyToStream: boolean;
  readonly durationSeconds: number | null;
  readonly thumbnailUrl: string | null;
  readonly previewUrl: string | null;
  readonly uploadedAt: string | null;
  readonly name: string | null;
  readonly metadata: {
    readonly userId: string;
    readonly context: string;
    readonly environment: string;
    readonly originalFileName: string;
    readonly mimeType: string;
  };
  readonly playback: {
    readonly hlsUrl: string | null;
    readonly dashUrl: string | null;
    readonly iframeUrl: string | null;
  };
}

interface PersistedHighlightVideoPostResponse {
  readonly postId: string;
  readonly cloudflareVideoId: string;
  readonly status: string;
  readonly readyToStream: boolean;
  readonly title: string | null;
  readonly content: string;
  readonly thumbnailUrl: string | null;
  readonly mediaUrl: string | null;
  readonly duration: number | null;
  readonly visibility: 'public' | 'team' | 'private';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly playback: {
    readonly hlsUrl: string | null;
    readonly dashUrl: string | null;
    readonly iframeUrl: string | null;
  };
}

// All upload routes require authentication
router.use(appGuard);

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

  let sharpInstance = sharp(buffer).rotate();
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
 * Build storage path for file
 *
 * @param userId - User ID
 * @param category - File category
 * @param fileName - Original filename (optional, used for extension)
 * @returns Storage path
 */
function buildExtensionCompatiblePath(
  userId: string,
  category: FileCategory,
  fileName?: string
): string {
  const timestamp = Date.now();
  const extension = 'jpg';

  switch (category) {
    case 'profile-photo':
      return `Profiles/ProfileImages/${userId}/avatar_${timestamp}.${extension}`;

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
 * @deprecated Use buildExtensionCompatiblePath() instead
 */
function buildStoragePath(userId: string, category: FileCategory, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

  if (category === 'profile-photo') {
    return `Profiles/ProfileImages/${userId}/avatar_${timestamp}.jpg`;
  }

  const extension = sanitizedName.split('.').pop() || 'bin';
  return `users/${userId}/${category}/${timestamp}_${sanitizedName.split('.')[0]}.${extension}`;
}

/**
 * Parse a tus Upload-Metadata header into decoded key/value pairs.
 * Boolean keys without a value are represented as the string "true".
 */
function parseTusMetadataHeader(header: string | string[] | undefined): Record<string, string> {
  if (!header || Array.isArray(header)) return {};

  return header
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [rawKey, ...rest] = entry.split(' ');
      const key = rawKey?.trim().toLowerCase();
      if (!key) return acc;

      if (rest.length === 0) {
        acc[key] = 'true';
        return acc;
      }

      try {
        acc[key] = Buffer.from(rest.join(' '), 'base64').toString('utf8');
      } catch {
        acc[key] = '';
      }

      return acc;
    }, {});
}

/**
 * Encode key/value metadata into a tus Upload-Metadata header.
 */
function buildTusMetadataHeader(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => `${key} ${Buffer.from(value, 'utf8').toString('base64')}`)
    .join(',');
}

/**
 * Resolve a metadata value from multiple possible header keys.
 */
function getTusMetadataValue(
  metadata: Record<string, string>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = metadata[key.toLowerCase()];
    if (value) return value;
  }

  return undefined;
}

/**
 * Build a searchable display name for Cloudflare's flat video library UI.
 */
function buildCloudflareVideoName(userId: string, context: string, fileName: string): string {
  const timestamp = Date.now();
  const baseName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_').split('.')[0] || 'video';
  const safeContext = context.replace(/[^a-zA-Z0-9_-]/g, '_') || 'general';
  return `nxt1-${safeContext}-${userId}-${timestamp}-${baseName}`;
}

/**
 * Extract the Cloudflare video UID from a direct upload Location header.
 */
function extractCloudflareVideoId(uploadUrl: string): string | null {
  try {
    const url = new URL(uploadUrl);
    return url.pathname.split('/').filter(Boolean).pop() ?? null;
  } catch {
    return null;
  }
}

function getCloudflareStreamHost(customerCode: string | undefined): string | null {
  if (!customerCode) return null;

  const normalizedCustomerCode = customerCode.startsWith('customer-')
    ? customerCode
    : `customer-${customerCode}`;

  return `https://${normalizedCustomerCode}.cloudflarestream.com`;
}

function buildCloudflarePlaybackUrls(
  videoId: string,
  customerCode: string | undefined,
  playback?: { hls?: string; dash?: string }
): { hlsUrl: string | null; dashUrl: string | null; iframeUrl: string | null } {
  const streamHost = getCloudflareStreamHost(customerCode);

  return {
    hlsUrl: playback?.hls ?? (streamHost ? `${streamHost}/${videoId}/manifest/video.m3u8` : null),
    dashUrl: playback?.dash ?? (streamHost ? `${streamHost}/${videoId}/manifest/video.mpd` : null),
    iframeUrl: streamHost ? `${streamHost}/${videoId}/iframe` : null,
  };
}

function normalizeCloudflareVideoForClient(
  videoId: string,
  payload: Record<string, unknown>,
  customerCode: string | undefined
): CloudflareVideoFinalizeResponse {
  const meta = ((payload['meta'] as Record<string, unknown> | undefined) ?? {}) as Record<
    string,
    unknown
  >;
  const status = ((payload['status'] as Record<string, unknown> | undefined) ?? {}) as Record<
    string,
    unknown
  >;
  const playback = ((payload['playback'] as Record<string, unknown> | undefined) ?? {}) as Record<
    string,
    unknown
  >;

  return {
    cloudflareVideoId: videoId,
    status: typeof status['state'] === 'string' ? status['state'] : 'unknown',
    readyToStream: payload['readyToStream'] === true,
    durationSeconds:
      typeof payload['duration'] === 'number'
        ? payload['duration']
        : Number(payload['duration']) || null,
    thumbnailUrl: typeof payload['thumbnail'] === 'string' ? payload['thumbnail'] : null,
    previewUrl: typeof payload['preview'] === 'string' ? payload['preview'] : null,
    uploadedAt: typeof payload['uploaded'] === 'string' ? payload['uploaded'] : null,
    name: typeof meta['name'] === 'string' ? meta['name'] : null,
    metadata: {
      userId: typeof meta['nxt1_user_id'] === 'string' ? meta['nxt1_user_id'] : '',
      context: typeof meta['nxt1_context'] === 'string' ? meta['nxt1_context'] : 'general',
      environment: typeof meta['nxt1_env'] === 'string' ? meta['nxt1_env'] : 'staging',
      originalFileName:
        typeof meta['nxt1_file_name'] === 'string' ? meta['nxt1_file_name'] : `${videoId}.mp4`,
      mimeType: typeof meta['nxt1_mime_type'] === 'string' ? meta['nxt1_mime_type'] : 'video/mp4',
    },
    playback: buildCloudflarePlaybackUrls(videoId, customerCode, {
      hls: typeof playback['hls'] === 'string' ? playback['hls'] : undefined,
      dash: typeof playback['dash'] === 'string' ? playback['dash'] : undefined,
    }),
  };
}

function getCloudflareHighlightPostId(cloudflareVideoId: string): string {
  return `cf-stream-${cloudflareVideoId}`;
}

function trimOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw fieldError(fieldName, `${fieldName} must be a string`, 'invalid');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    throw fieldError(fieldName, `${fieldName} must be ${maxLength} characters or fewer`, 'invalid');
  }

  return trimmed;
}

function parsePinnedFlag(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw fieldError('isPinned', 'isPinned must be a boolean', 'invalid');
  }

  return value;
}

function parsePostVisibility(value: unknown): PostVisibility | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw fieldError('visibility', 'visibility must be a string', 'invalid');
  }

  switch (value.trim().toLowerCase()) {
    case 'public':
      return PostVisibility.PUBLIC;
    case 'team':
      return PostVisibility.TEAM;
    case 'private':
      return PostVisibility.PRIVATE;
    default:
      throw fieldError('visibility', 'visibility must be public, team, or private', 'invalid');
  }
}

function toVisibilityType(visibility: PostVisibility): 'public' | 'team' | 'private' {
  switch (visibility) {
    case PostVisibility.TEAM:
      return 'team';
    case PostVisibility.PRIVATE:
      return 'private';
    case PostVisibility.PUBLIC:
    default:
      return 'public';
  }
}

function buildDefaultHighlightTitle(finalized: CloudflareVideoFinalizeResponse): string {
  const rawName = finalized.name ?? finalized.metadata.originalFileName;
  const baseName = rawName.split('/').pop() ?? rawName;
  return (
    baseName
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Highlight Video'
  );
}

async function fetchCloudflareFinalizedVideo(
  userId: string,
  cloudflareVideoId: string,
  accountId: string,
  apiToken: string,
  customerCode: string | undefined
): Promise<CloudflareVideoFinalizeResponse> {
  const response = await fetch(
    `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/${cloudflareVideoId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  let responseBody: Record<string, unknown> | null;
  try {
    responseBody = (await response.json()) as Record<string, unknown>;
  } catch {
    responseBody = null;
  }

  if (!response.ok || responseBody?.['success'] === false) {
    const errors = Array.isArray(responseBody?.['errors'])
      ? (responseBody?.['errors'] as Array<Record<string, unknown>>)
      : [];
    const errorMessage =
      typeof errors[0]?.['message'] === 'string'
        ? (errors[0]['message'] as string)
        : `status ${response.status}`;

    logger.error('Cloudflare finalize fetch failed', {
      userId,
      cloudflareVideoId,
      error: errorMessage,
    });

    throw new Error(`Cloudflare finalize failed: ${errorMessage}`);
  }

  const payload =
    responseBody && typeof responseBody['result'] === 'object' && responseBody['result'] !== null
      ? (responseBody['result'] as Record<string, unknown>)
      : null;

  if (!payload) {
    logger.error('Cloudflare finalize returned no video payload', {
      userId,
      cloudflareVideoId,
    });

    throw new Error('Cloudflare finalize returned no video payload');
  }

  const finalized = normalizeCloudflareVideoForClient(cloudflareVideoId, payload, customerCode);

  if (finalized.metadata.userId && finalized.metadata.userId !== userId) {
    throw forbiddenError('owner');
  }

  return finalized;
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
 * POST /upload/cloudflare/direct-url
 *
 * Preferred video upload route for the 2026 platform architecture.
 * This provisions a one-time resumable tus upload URL directly from
 * Cloudflare Stream so the browser/mobile app can upload large videos
 * straight to Cloudflare edge without touching the backend.
 *
 * Required request headers:
 * - Tus-Resumable: 1.0.0
 * - Upload-Length: file size in bytes
 * - Upload-Metadata: base64 metadata including filename + filetype
 */
router.post(
  '/cloudflare/direct-url',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];

    if (!accountId || !apiToken) {
      logger.error('Cloudflare direct upload requested without env configuration');
      return res.status(503).json({
        success: false,
        error: 'Cloudflare direct uploads are not configured',
      });
    }

    const tusResumable = req.headers['tus-resumable'];
    if (Array.isArray(tusResumable) || tusResumable !== '1.0.0') {
      throw fieldError('Tus-Resumable', 'Tus-Resumable header must be 1.0.0', 'required');
    }

    const uploadLengthHeader = req.headers['upload-length'];
    if (!uploadLengthHeader || Array.isArray(uploadLengthHeader)) {
      throw fieldError('Upload-Length', 'Upload-Length header is required', 'required');
    }

    const fileSize = Number(uploadLengthHeader);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw fieldError('Upload-Length', 'Upload-Length must be a positive number', 'invalid');
    }

    const clientMetadata = parseTusMetadataHeader(req.headers['upload-metadata']);
    const fileName = getTusMetadataValue(clientMetadata, ['filename', 'fileName', 'name']);
    const mimeType = getTusMetadataValue(clientMetadata, ['filetype', 'mimeType', 'mimetype']);
    const uploadContext =
      getTusMetadataValue(clientMetadata, ['context', 'uploadcontext', 'uploadContext']) ??
      'general';
    const requestedDuration = getTusMetadataValue(clientMetadata, [
      'maxdurationseconds',
      'maxDurationSeconds',
    ]);

    if (!fileName) {
      throw fieldError(
        'Upload-Metadata',
        'Upload-Metadata must include filename metadata',
        'required'
      );
    }

    if (!mimeType) {
      throw fieldError(
        'Upload-Metadata',
        'Upload-Metadata must include filetype metadata',
        'required'
      );
    }

    const category: FileCategory = 'highlight-video';
    const rules = FILE_UPLOAD_RULES[category];
    const allowedTypes = rules.allowedTypes as readonly string[];

    if (!allowedTypes.includes(mimeType)) {
      throw fieldError(
        'filetype',
        `File type ${mimeType} not allowed. Allowed: ${allowedTypes.join(', ')}`,
        'invalid'
      );
    }

    if (fileSize > rules.maxSize) {
      throw fieldError(
        'Upload-Length',
        `File must be smaller than ${formatFileSize(rules.maxSize)}`,
        'maxSize'
      );
    }

    const parsedMaxDuration = requestedDuration ? Number(requestedDuration) : NaN;
    const maxDurationSeconds = Number.isFinite(parsedMaxDuration)
      ? Math.min(Math.max(parsedMaxDuration, 1), 36_000)
      : DEFAULT_CF_VIDEO_MAX_DURATION_SECONDS;

    const environment = process.env['NODE_ENV'] === 'production' ? 'production' : 'staging';
    const backendUrl = process.env['BACKEND_URL']?.replace(/\/$/, '') ?? '';
    const expiresAt = new Date(
      Date.now() + DEFAULT_CF_UPLOAD_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();
    const videoName = buildCloudflareVideoName(userId, uploadContext, fileName);

    const upstreamMetadata = buildTusMetadataHeader({
      name: videoName,
      maxDurationSeconds: String(maxDurationSeconds),
      expiry: expiresAt,
      nxt1_user_id: userId,
      nxt1_context: uploadContext,
      nxt1_env: environment,
      nxt1_file_name: fileName,
      nxt1_mime_type: mimeType,
      ...(backendUrl ? { webhook_backend_url: backendUrl } : {}),
    });

    const response = await fetch(
      `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream?direct_user=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': String(fileSize),
          'Upload-Metadata': upstreamMetadata,
          'Upload-Creator': userId,
        },
      }
    );

    if (!response.ok) {
      let details = `status ${response.status}`;
      try {
        const body = (await response.json()) as {
          errors?: Array<{ message?: string }>;
          messages?: Array<{ message?: string }>;
        };
        const message = body.errors?.[0]?.message ?? body.messages?.[0]?.message;
        if (message) details = message;
      } catch {
        // Keep fallback status string
      }

      logger.error('Cloudflare direct upload provisioning failed', {
        userId,
        fileName,
        mimeType,
        fileSize,
        details,
      });

      return res.status(502).json({
        success: false,
        error: `Cloudflare direct upload provisioning failed: ${details}`,
      });
    }

    const uploadUrl = response.headers.get('Location');
    const cloudflareVideoId = uploadUrl ? extractCloudflareVideoId(uploadUrl) : null;

    if (!uploadUrl || !cloudflareVideoId) {
      logger.error('Cloudflare direct upload provisioning returned no Location header', {
        userId,
        fileName,
      });
      return res.status(502).json({
        success: false,
        error: 'Cloudflare direct upload provisioning returned no upload URL',
      });
    }

    logger.info('Provisioned Cloudflare tus direct upload URL', {
      userId,
      fileName,
      mimeType,
      fileSize: formatFileSize(fileSize),
      uploadContext,
      cloudflareVideoId,
    });

    res.setHeader('Access-Control-Expose-Headers', 'Location, Stream-Media-Id');
    res.setHeader('Location', uploadUrl);
    res.setHeader('Stream-Media-Id', cloudflareVideoId);

    return res.status(201).json({
      success: true,
      data: {
        uploadUrl,
        cloudflareVideoId,
        uploadMethod: 'tus',
        tusResumable: '1.0.0',
        expiresAt,
        maxSize: rules.maxSize,
        maxDurationSeconds,
        name: videoName,
        metadata: {
          userId,
          context: uploadContext,
          environment,
          originalFileName: fileName,
          mimeType,
        },
      },
    });
  })
);

/**
 * POST /upload/cloudflare/finalize
 *
 * Finalize a Cloudflare Stream direct upload after the browser finishes its TUS transfer.
 * This gives the frontend a backend-owned canonical video payload instead of leaving it with
 * only a temporary upload session.
 */
router.post(
  '/cloudflare/finalize',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) {
      logger.error('Cloudflare finalize requested without env configuration');
      return res.status(503).json({
        success: false,
        error: 'Cloudflare direct uploads are not configured',
      });
    }

    const cloudflareVideoId =
      typeof req.body?.['cloudflareVideoId'] === 'string'
        ? (req.body['cloudflareVideoId'] as string).trim()
        : '';

    if (!cloudflareVideoId) {
      throw fieldError('cloudflareVideoId', 'cloudflareVideoId is required', 'required');
    }

    let finalized: CloudflareVideoFinalizeResponse;
    try {
      finalized = await fetchCloudflareFinalizedVideo(
        userId,
        cloudflareVideoId,
        accountId,
        apiToken,
        customerCode
      );
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        throw error;
      }

      return res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : 'Cloudflare finalize failed',
      });
    }

    logger.info('Finalized Cloudflare direct upload session', {
      userId,
      cloudflareVideoId,
      status: finalized.status,
      readyToStream: finalized.readyToStream,
      context: finalized.metadata.context,
    });

    return res.json({
      success: true,
      data: finalized,
    });
  })
);

/**
 * POST /upload/cloudflare/highlight-post
 *
 * Persist a finalized Cloudflare highlight video into the Posts collection using
 * the existing highlight schema consumed by profile, feed, and explore readers.
 */
router.post(
  '/cloudflare/highlight-post',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const db = req.firebase!.db;
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) {
      logger.error('Cloudflare highlight persistence requested without env configuration');
      return res.status(503).json({
        success: false,
        error: 'Cloudflare direct uploads are not configured',
      });
    }

    const cloudflareVideoId =
      typeof req.body?.['cloudflareVideoId'] === 'string'
        ? (req.body['cloudflareVideoId'] as string).trim()
        : '';

    if (!cloudflareVideoId) {
      throw fieldError('cloudflareVideoId', 'cloudflareVideoId is required', 'required');
    }

    let finalized: CloudflareVideoFinalizeResponse;
    try {
      finalized = await fetchCloudflareFinalizedVideo(
        userId,
        cloudflareVideoId,
        accountId,
        apiToken,
        customerCode
      );
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        throw error;
      }

      return res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : 'Cloudflare highlight persistence failed',
      });
    }

    const title = trimOptionalString(req.body?.['title'], 'title', 200);
    const content = trimOptionalString(req.body?.['content'], 'content', 2000);
    const sportId = trimOptionalString(req.body?.['sportId'], 'sportId', 100);
    const teamId = trimOptionalString(req.body?.['teamId'], 'teamId', 100);
    const organizationId = trimOptionalString(req.body?.['organizationId'], 'organizationId', 100);
    const isPinned = parsePinnedFlag(req.body?.['isPinned']);
    const requestedVisibility = parsePostVisibility(req.body?.['visibility']);

    const postId = getCloudflareHighlightPostId(cloudflareVideoId);
    const postRef = db.collection(POSTS_COLLECTION).doc(postId);
    const existingSnapshot = await postRef.get();
    const existingData = existingSnapshot.exists
      ? ((existingSnapshot.data() as Record<string, unknown>) ?? {})
      : {};

    const thumbnailUrl =
      finalized.thumbnailUrl ??
      finalized.previewUrl ??
      (existingData['thumbnailUrl'] as string | undefined) ??
      null;
    const mediaUrl =
      finalized.playback.iframeUrl ??
      (existingData['mediaUrl'] as string | undefined) ??
      finalized.playback.hlsUrl ??
      null;
    const createdAt = existingSnapshot.exists
      ? ((existingData['createdAt'] as Timestamp | undefined) ?? Timestamp.now())
      : finalized.uploadedAt
        ? Timestamp.fromDate(new Date(finalized.uploadedAt))
        : Timestamp.now();
    const updatedAt = Timestamp.now();
    const resolvedTitle =
      title ??
      (typeof existingData['title'] === 'string' ? (existingData['title'] as string) : undefined) ??
      buildDefaultHighlightTitle(finalized);
    const resolvedContent =
      content ??
      (typeof existingData['content'] === 'string' ? (existingData['content'] as string) : '') ??
      '';
    const visibility =
      requestedVisibility ??
      (existingData['visibility'] as PostVisibility | undefined) ??
      PostVisibility.PUBLIC;
    const tags = Array.isArray(existingData['tags']) ? (existingData['tags'] as string[]) : [];
    const searchIndex = buildVideoSearchIndex({
      title: resolvedTitle,
      description: resolvedContent,
      sport: sportId ?? (existingData['sportId'] as string | undefined),
      tags,
    });

    const payload: Record<string, unknown> = {
      id: postId,
      userId,
      ownerType: 'user',
      type: 'highlight',
      visibility,
      isPublic: visibility === PostVisibility.PUBLIC,
      title: resolvedTitle,
      content: resolvedContent,
      url: mediaUrl,
      mediaUrl,
      videoUrl:
        finalized.playback.hlsUrl ?? (existingData['videoUrl'] as string | undefined) ?? mediaUrl,
      thumbnailUrl,
      poster: thumbnailUrl,
      previewUrl:
        finalized.previewUrl ?? (existingData['previewUrl'] as string | undefined) ?? null,
      duration:
        finalized.durationSeconds ??
        ((typeof existingData['duration'] === 'number' ? existingData['duration'] : undefined) as
          | number
          | undefined) ??
        null,
      cloudflareVideoId,
      cloudflareStatus: finalized.status,
      readyToStream: finalized.readyToStream,
      playback: finalized.playback,
      cloudflareMetadata: finalized.metadata,
      uploadProvider: 'cloudflare-stream',
      searchIndex,
      tags,
      stats:
        (existingData['stats'] as Record<string, unknown> | undefined) ??
        ({ likes: 0, comments: 0, shares: 0, views: 0 } satisfies Record<string, number>),
      createdAt,
      updatedAt,
      ...((sportId ?? existingData['sportId'])
        ? { sportId: sportId ?? existingData['sportId'] }
        : {}),
      ...((teamId ?? existingData['teamId']) ? { teamId: teamId ?? existingData['teamId'] } : {}),
      ...((organizationId ?? existingData['organizationId'])
        ? { organizationId: organizationId ?? existingData['organizationId'] }
        : {}),
      ...((isPinned ?? existingData['isPinned'] !== undefined)
        ? { isPinned: isPinned ?? (existingData['isPinned'] as boolean) }
        : {}),
    };

    await postRef.set(payload);

    const cache = getCacheService();
    await Promise.all([
      cache.del(`profile:videos:${userId}*`),
      cache.del('explore:*'),
      invalidateProfileCaches(userId),
    ]);

    const responseBody: PersistedHighlightVideoPostResponse = {
      postId,
      cloudflareVideoId,
      status: finalized.status,
      readyToStream: finalized.readyToStream,
      title: resolvedTitle,
      content: resolvedContent,
      thumbnailUrl,
      mediaUrl,
      duration: finalized.durationSeconds,
      visibility: toVisibilityType(visibility),
      createdAt: createdAt.toDate().toISOString(),
      updatedAt: updatedAt.toDate().toISOString(),
      playback: finalized.playback,
    };

    logger.info('Persisted Cloudflare highlight post', {
      userId,
      postId,
      cloudflareVideoId,
      readyToStream: finalized.readyToStream,
      status: finalized.status,
    });

    return res.json({
      success: true,
      data: responseBody,
    });
  })
);

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
    const userId = req.user!.uid;
    const { fileName } = req.body;
    const file = req.file;

    if (!file) {
      throw fieldError('file', 'File is required', 'required');
    }

    // Validate file size per category rules (profile-photo has no maxSize — sharp normalizes before upload)
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
 * POST /upload/highlight-video
 *
 * Get a presigned upload URL for highlight video.
 * Videos are uploaded directly to Firebase Storage from the client,
 * bypassing the Express memory limit. Backend validates metadata,
 * generates a signed URL, and returns it along with the storage path.
 *
 * Flow:
 * 1. Client sends { userId, fileName, mimeType, fileSize }
 * 2. Backend validates against FILE_UPLOAD_RULES['highlight-video']
 * 3. Backend generates a signed upload URL (v4, 30 min expiry)
 * 4. Client uploads directly to the signed URL via PUT
 * 5. (Future) Cloud Run job processes video for HLS/thumbnails
 */
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

    // Validate MIME type
    const allowedTypes = rules.allowedTypes as readonly string[];
    if (!allowedTypes.includes(mimeType)) {
      throw fieldError(
        'mimeType',
        `File type ${mimeType} not allowed. Allowed: ${allowedTypes.join(', ')}`,
        'invalid'
      );
    }

    // Validate file size (if provided — final check happens at storage level)
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

    // Generate signed URL valid for 30 minutes (videos take longer to upload)
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

/**
 * POST /upload/highlight-video/confirm
 *
 * Confirm a highlight video upload and enqueue processing.
 * Called by the frontend after it finishes uploading to the presigned URL.
 * Publishes a Pub/Sub message so the video processing Cloud Run worker
 * can transcode to HLS asynchronously.
 *
 * Request body: { userId, storagePath, mimeType, fileSize? }
 */
router.post(
  '/highlight-video/confirm',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const { storagePath } = req.body;

    if (!storagePath) {
      throw fieldError('storagePath', 'Storage path is required', 'required');
    }

    // Verify the file actually exists in Storage
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

    // Make the source file publicly readable
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

/**
 * POST /upload/document
 *
 * Upload document (PDF, etc.) without image processing.
 */
router.post(
  '/document',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const { fileName } = req.body;
    const file = req.file;

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
 * Automatically cleans up extension-generated thumbnails.
 *
 * Query params:
 * - userId: User ID (for authorization)
 * - path: Storage path to delete
 */
router.delete(
  '/file',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const { path: storagePath } = req.query;

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
    const userId = req.user!.uid;
    const { category, fileName, mimeType } = req.body;

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
