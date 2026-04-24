/**
 * @fileoverview File Upload API - Pure TypeScript
 * @module @nxt1/core/api
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Pure TypeScript API factory for file uploads.
 * All uploads go through the BACKEND - frontend never touches storage directly.
 *
 * Architecture (2026 Best Practice):
 * ┌────────────────────────────────────────────────────────────┐
 * │                    Frontend (Web/Mobile)                   │
 * │   Collects file, validates client-side, sends to backend   │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ createFileUploadApi() - THIS FILE ⭐        │
 * │     Pure TypeScript - works on web, mobile, anywhere       │
 * ├────────────────────────────────────────────────────────────┤
 * │                     Backend API Server                     │
 * │   Validates, processes, uploads to Firebase Storage        │
 * │   Handles image optimization, virus scanning, etc.         │
 * ├────────────────────────────────────────────────────────────┤
 * │                    Firebase Storage                        │
 * │              Secure file storage with CDN                  │
 * └────────────────────────────────────────────────────────────┘
 *
 * Why backend-first:
 * - Security: Backend validates file type, size, content
 * - Processing: Backend can optimize images, generate thumbnails
 * - Consistency: Single upload logic for all platforms
 * - Audit: Backend can log all uploads for compliance
 *
 * @version 1.0.0
 */

import type { HttpAdapter } from './http-adapter';
import type { ApiResponse } from '../profile/profile.api';

// ============================================
// FILE UPLOAD TYPES
// ============================================

/**
 * Supported file categories for uploads
 * Backend enforces different rules per category
 */
export type FileCategory = 'profile-photo' | 'video-thumbnail' | 'highlight-video' | 'team-logo';

/**
 * File metadata for upload
 * Platform-agnostic - works with File (web) or blob data (mobile)
 */
export interface FileUploadMetadata {
  /** Original filename */
  fileName: string;
  /** MIME type (e.g., 'image/jpeg') */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** File category for backend validation rules */
  category: FileCategory;
}

/**
 * Upload request payload
 * Sent as multipart/form-data to backend
 */
export interface FileUploadRequest {
  /** User ID who owns this file */
  userId: string;
  /** File category */
  category: FileCategory;
  /** Optional: Custom path within user's storage */
  customPath?: string;
  /** Optional: Additional metadata */
  metadata?: Record<string, string>;
}

/**
 * Successful upload response from backend
 */
export interface FileUploadResult {
  /** CDN URL of the uploaded file */
  url: string;
  /** Storage path (for deletion) */
  storagePath: string;
  /** File size in bytes (may differ after optimization) */
  size: number;
  /** MIME type (may differ after conversion) */
  mimeType: string;
  /** Optional: Thumbnail URL (for images/videos) */
  thumbnailUrl?: string;
  /** Optional: Optimized dimensions (for images) */
  dimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Provision options for a direct Cloudflare video upload.
 */
export interface HighlightVideoUploadProvisionOptions {
  /** Logical upload context for downstream routing (feed, profile, agent-x, etc.) */
  context?: string;
  /** Optional requested max duration in seconds enforced by Cloudflare */
  maxDurationSeconds?: number;
}

/**
 * Cloudflare direct upload session returned by the backend.
 */
export interface DirectVideoUploadSession {
  uploadUrl: string;
  cloudflareVideoId: string;
  uploadMethod: 'tus';
  tusResumable: '1.0.0';
  expiresAt: string;
  maxSize: number;
  maxDurationSeconds: number;
  name: string;
  metadata: {
    userId: string;
    context: string;
    environment: string;
    originalFileName: string;
    mimeType: string;
  };
}

/**
 * Canonical video payload returned after the backend finalizes a direct upload.
 */
export interface FinalizedHighlightVideoUpload {
  cloudflareVideoId: string;
  status: string;
  readyToStream: boolean;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  uploadedAt: string | null;
  name: string | null;
  metadata: {
    userId: string;
    context: string;
    environment: string;
    originalFileName: string;
    mimeType: string;
  };
  playback: {
    hlsUrl: string | null;
    dashUrl: string | null;
    iframeUrl: string | null;
  };
}

/**
 * Request payload for persisting a finalized Cloudflare highlight into the Posts collection.
 */
export interface PersistHighlightVideoPostRequest {
  cloudflareVideoId: string;
  title?: string;
  content?: string;
  sportId?: string;
  teamId?: string;
  organizationId?: string;
  visibility?: 'public' | 'team' | 'private';
  isPinned?: boolean;
}

/**
 * Canonical persisted highlight post returned by the backend.
 */
export interface PersistedHighlightVideoPost {
  postId: string;
  cloudflareVideoId: string;
  status: string;
  readyToStream: boolean;
  title: string | null;
  content: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  duration: number | null;
  visibility: 'public' | 'team' | 'private';
  createdAt: string;
  updatedAt: string;
  playback: {
    hlsUrl: string | null;
    dashUrl: string | null;
    iframeUrl: string | null;
  };
}

/**
 * File deletion request
 */
export interface FileDeleteRequest {
  /** User ID who owns the file */
  userId: string;
  /** Storage path or URL of file to delete */
  storagePath: string;
}

/**
 * Upload progress callback
 * Percentage from 0 to 100
 */
export type UploadProgressCallback = (progress: number) => void;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeTusMetadataValue(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const chunk =
      ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);

    encoded += BASE64_ALPHABET[(chunk >> 18) & 0x3f];
    encoded += BASE64_ALPHABET[(chunk >> 12) & 0x3f];
    encoded += index + 1 < bytes.length ? BASE64_ALPHABET[(chunk >> 6) & 0x3f] : '=';
    encoded += index + 2 < bytes.length ? BASE64_ALPHABET[chunk & 0x3f] : '=';
  }

  return encoded;
}

function buildTusUploadMetadataHeader(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => `${key} ${encodeTusMetadataValue(value)}`)
    .join(',');
}

// ============================================
// FILE VALIDATION CONSTANTS
// ============================================

/**
 * File validation rules per category
 * Frontend uses these for early validation, backend re-validates
 */
export const FILE_UPLOAD_RULES = {
  'profile-photo': {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxDimensions: { width: 2048, height: 2048 },
  },
  'video-thumbnail': {
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxDimensions: { width: 1920, height: 1080 },
  },
  'highlight-video': {
    maxSize: 500 * 1024 * 1024, // 500MB
    allowedTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
    maxDimensions: null,
  },
  'team-logo': {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxDimensions: { width: 2048, height: 2048 },
  },
} as const;

// ============================================
// FILE VALIDATION HELPERS
// ============================================

/**
 * Validation error structure
 */
export interface FileValidationError {
  code: 'FILE_TOO_LARGE' | 'INVALID_TYPE' | 'INVALID_DIMENSIONS' | 'EMPTY_FILE';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Validate file against category rules
 * @param file - File metadata to validate
 * @returns null if valid, error object if invalid
 */
export function validateFileForUpload(file: FileUploadMetadata): FileValidationError | null {
  const rules = FILE_UPLOAD_RULES[file.category];

  if (!rules) {
    return {
      code: 'INVALID_TYPE',
      message: `Unknown file category: ${file.category}`,
    };
  }

  // Check file size
  if (file.size === 0) {
    return {
      code: 'EMPTY_FILE',
      message: 'File is empty',
    };
  }

  if ('maxSize' in rules && file.size > rules.maxSize) {
    const maxSizeMB = Math.round(rules.maxSize / (1024 * 1024));
    return {
      code: 'FILE_TOO_LARGE',
      message: `File must be smaller than ${maxSizeMB}MB`,
      details: { maxSize: rules.maxSize, actualSize: file.size },
    };
  }

  // Check MIME type
  const allowedTypes = rules.allowedTypes as readonly string[];
  if (!allowedTypes.includes(file.mimeType)) {
    return {
      code: 'INVALID_TYPE',
      message: `File type not allowed. Accepted: ${rules.allowedTypes.join(', ')}`,
      details: { allowedTypes: rules.allowedTypes, actualType: file.mimeType },
    };
  }

  return null;
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ============================================
// EXTENDED HTTP ADAPTER FOR FILE UPLOADS
// ============================================

/**
 * Extended HTTP adapter with file upload support
 * Platforms implement this differently:
 * - Web: FormData with XMLHttpRequest/fetch
 * - Mobile: Capacitor HTTP with multipart support
 */
export interface FileUploadHttpAdapter extends HttpAdapter {
  /**
   * Upload file with multipart/form-data
   * @param url - Upload endpoint URL
   * @param file - File data (Blob on web, base64/path on mobile)
   * @param metadata - File metadata
   * @param onProgress - Optional progress callback
   */
  uploadFile<T>(
    url: string,
    file: Blob | string,
    metadata: FileUploadRequest & FileUploadMetadata,
    onProgress?: UploadProgressCallback
  ): Promise<T>;
}

// ============================================
// FILE UPLOAD API FACTORY
// ============================================

export type FileUploadApi = ReturnType<typeof createFileUploadApi>;

/**
 * Create File Upload API instance
 *
 * @param http - HTTP adapter with file upload support
 * @param baseUrl - Base API URL
 * @returns File upload API methods
 *
 * @example
 * ```typescript
 * const uploadApi = createFileUploadApi(httpAdapter, 'https://api.nxt1.com/v1');
 *
 * // Upload profile photo
 * const result = await uploadApi.uploadProfilePhoto(userId, file);
 * console.log('Uploaded:', result.url);
 * ```
 */
export function createFileUploadApi(http: FileUploadHttpAdapter, baseUrl: string) {
  const endpoint = `${baseUrl}/upload`;

  return {
    /**
     * Upload profile photo
     * Backend optimizes image and generates thumbnail
     *
     * @param userId - User ID
     * @param file - Image file blob
     * @param fileName - Original filename
     * @param mimeType - MIME type
     * @param onProgress - Progress callback
     */
    async uploadProfilePhoto(
      userId: string,
      file: Blob | string,
      fileName: string,
      mimeType: string,
      onProgress?: UploadProgressCallback
    ): Promise<FileUploadResult> {
      const metadata: FileUploadRequest & FileUploadMetadata = {
        userId,
        category: 'profile-photo',
        fileName,
        mimeType,
        size: typeof file === 'string' ? file.length : file.size,
      };

      // Validate before upload
      const validationError = validateFileForUpload(metadata);
      if (validationError) {
        throw new Error(validationError.message);
      }

      const response = await http.uploadFile<ApiResponse<FileUploadResult>>(
        `${endpoint}/profile-photo`,
        file,
        metadata,
        onProgress
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to upload profile photo');
      }

      return response.data;
    },

    /**
     * Provision a Cloudflare Stream direct upload session for a highlight video.
     * The caller is responsible for performing the actual TUS upload to the returned uploadUrl.
     */
    async provisionHighlightVideoUpload(
      _userId: string,
      fileName: string,
      mimeType: string,
      size: number,
      options?: HighlightVideoUploadProvisionOptions
    ): Promise<DirectVideoUploadSession> {
      const metadata: FileUploadMetadata = {
        fileName,
        mimeType,
        size,
        category: 'highlight-video',
      };

      const validationError = validateFileForUpload(metadata);
      if (validationError) {
        throw new Error(validationError.message);
      }

      const tusMetadata = buildTusUploadMetadataHeader({
        filename: fileName,
        filetype: mimeType,
        ...(options?.context ? { context: options.context } : {}),
        ...(options?.maxDurationSeconds
          ? { maxDurationSeconds: String(options.maxDurationSeconds) }
          : {}),
      });

      const response = await http.post<ApiResponse<DirectVideoUploadSession>>(
        `${endpoint}/cloudflare/direct-url`,
        undefined,
        {
          headers: {
            'Tus-Resumable': '1.0.0',
            'Upload-Length': String(size),
            'Upload-Metadata': tusMetadata,
          },
        }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to provision highlight video upload');
      }

      return response.data;
    },

    /**
     * Finalize a direct Cloudflare video upload after the browser completes the TUS transfer.
     * Returns a backend-owned canonical video payload for the client.
     */
    async finalizeHighlightVideoUpload(
      cloudflareVideoId: string
    ): Promise<FinalizedHighlightVideoUpload> {
      if (!cloudflareVideoId.trim()) {
        throw new Error('cloudflareVideoId is required');
      }

      const response = await http.post<ApiResponse<FinalizedHighlightVideoUpload>>(
        `${endpoint}/cloudflare/finalize`,
        { cloudflareVideoId }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to finalize highlight video upload');
      }

      return response.data;
    },

    /**
     * Persist a finalized Cloudflare highlight video into the backend Posts collection.
     */
    async persistHighlightVideoPost(
      request: PersistHighlightVideoPostRequest
    ): Promise<PersistedHighlightVideoPost> {
      if (!request.cloudflareVideoId.trim()) {
        throw new Error('cloudflareVideoId is required');
      }

      const response = await http.post<ApiResponse<PersistedHighlightVideoPost>>(
        `${endpoint}/cloudflare/highlight-post`,
        request
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to persist highlight video post');
      }

      return response.data;
    },

    /**
     * Delete uploaded file
     * Backend handles storage cleanup
     */
    async deleteFile(userId: string, storagePath: string): Promise<void> {
      const response = await http.delete<ApiResponse<void>>(`${endpoint}/file`, {
        params: { userId, path: storagePath },
      });

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete file');
      }
    },

    /**
     * Get signed upload URL for large files
     * Enables direct-to-storage uploads for files > 10MB
     * (Backend still validates after upload)
     *
     * @param teamId - Required when category is 'team-logo'
     */
    async getSignedUploadUrl(
      userId: string,
      category: FileCategory,
      fileName: string,
      mimeType: string,
      teamId?: string
    ): Promise<{ uploadUrl: string; storagePath: string; expiresAt: number }> {
      const response = await http.post<
        ApiResponse<{
          uploadUrl: string;
          storagePath: string;
          expiresAt: number;
        }>
      >(`${endpoint}/signed-url`, {
        userId,
        category,
        fileName,
        mimeType,
        ...(teamId ? { teamId } : {}),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to get signed upload URL');
      }

      return response.data;
    },
  } as const;
}
