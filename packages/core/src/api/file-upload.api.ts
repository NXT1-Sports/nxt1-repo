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
export type FileCategory = 'profile-photo' | 'cover-photo' | 'document' | 'video-thumbnail';

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
  'cover-photo': {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxDimensions: { width: 4096, height: 2048 },
  },
  document: {
    maxSize: 25 * 1024 * 1024, // 25MB
    allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxDimensions: null,
  },
  'video-thumbnail': {
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxDimensions: { width: 1920, height: 1080 },
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

  if (file.size > rules.maxSize) {
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
     * Upload cover photo
     * Backend optimizes and generates responsive sizes
     */
    async uploadCoverPhoto(
      userId: string,
      file: Blob | string,
      fileName: string,
      mimeType: string,
      onProgress?: UploadProgressCallback
    ): Promise<FileUploadResult> {
      const metadata: FileUploadRequest & FileUploadMetadata = {
        userId,
        category: 'cover-photo',
        fileName,
        mimeType,
        size: typeof file === 'string' ? file.length : file.size,
      };

      const validationError = validateFileForUpload(metadata);
      if (validationError) {
        throw new Error(validationError.message);
      }

      const response = await http.uploadFile<ApiResponse<FileUploadResult>>(
        `${endpoint}/cover-photo`,
        file,
        metadata,
        onProgress
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to upload cover photo');
      }

      return response.data;
    },

    /**
     * Upload document (PDF, transcript, etc.)
     * Backend scans for viruses and validates content
     */
    async uploadDocument(
      userId: string,
      file: Blob | string,
      fileName: string,
      mimeType: string,
      onProgress?: UploadProgressCallback
    ): Promise<FileUploadResult> {
      const metadata: FileUploadRequest & FileUploadMetadata = {
        userId,
        category: 'document',
        fileName,
        mimeType,
        size: typeof file === 'string' ? file.length : file.size,
      };

      const validationError = validateFileForUpload(metadata);
      if (validationError) {
        throw new Error(validationError.message);
      }

      const response = await http.uploadFile<ApiResponse<FileUploadResult>>(
        `${endpoint}/document`,
        file,
        metadata,
        onProgress
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to upload document');
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
     */
    async getSignedUploadUrl(
      userId: string,
      category: FileCategory,
      fileName: string,
      mimeType: string
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
      });

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to get signed upload URL');
      }

      return response.data;
    },
  } as const;
}
