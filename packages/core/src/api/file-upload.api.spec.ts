/**
 * @fileoverview File Upload API Tests
 * @module @nxt1/core/api
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFileUploadApi,
  validateFileForUpload,
  formatFileSize,
  FILE_UPLOAD_RULES,
  type FileUploadMetadata,
  type FileUploadHttpAdapter,
} from './file-upload.api';
import type { ApiResponse } from '../profile/profile.api';

describe('File Upload API', () => {
  // ============================================
  // VALIDATION TESTS
  // ============================================

  describe('validateFileForUpload', () => {
    it('should accept valid profile photo', () => {
      const file: FileUploadMetadata = {
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1024 * 1024, // 1MB
        category: 'profile-photo',
      };

      const error = validateFileForUpload(file);
      expect(error).toBeNull();
    });

    it('should reject file that is too large', () => {
      const file: FileUploadMetadata = {
        fileName: 'large-photo.jpg',
        mimeType: 'image/jpeg',
        size: 10 * 1024 * 1024, // 10MB - exceeds 5MB limit
        category: 'profile-photo',
      };

      const error = validateFileForUpload(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('FILE_TOO_LARGE');
    });

    it('should reject invalid MIME type', () => {
      const file: FileUploadMetadata = {
        fileName: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        category: 'profile-photo', // PDF not allowed for profile photos
      };

      const error = validateFileForUpload(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('INVALID_TYPE');
    });

    it('should reject empty file', () => {
      const file: FileUploadMetadata = {
        fileName: 'empty.jpg',
        mimeType: 'image/jpeg',
        size: 0,
        category: 'profile-photo',
      };

      const error = validateFileForUpload(file);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('EMPTY_FILE');
    });

    it('should accept PDF for document category', () => {
      const file: FileUploadMetadata = {
        fileName: 'transcript.pdf',
        mimeType: 'application/pdf',
        size: 1024 * 1024,
        category: 'document',
      };

      const error = validateFileForUpload(file);
      expect(error).toBeNull();
    });

    it('should accept WebP for profile photo', () => {
      const file: FileUploadMetadata = {
        fileName: 'photo.webp',
        mimeType: 'image/webp',
        size: 500 * 1024,
        category: 'profile-photo',
      };

      const error = validateFileForUpload(file);
      expect(error).toBeNull();
    });

    it('should accept GIF for profile photo', () => {
      const file: FileUploadMetadata = {
        fileName: 'animated.gif',
        mimeType: 'image/gif',
        size: 2 * 1024 * 1024,
        category: 'profile-photo',
      };

      const error = validateFileForUpload(file);
      expect(error).toBeNull();
    });
  });

  // ============================================
  // FORMAT FILE SIZE TESTS
  // ============================================

  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });

  // ============================================
  // FILE UPLOAD RULES TESTS
  // ============================================

  describe('FILE_UPLOAD_RULES', () => {
    it('should have correct profile-photo rules', () => {
      const rules = FILE_UPLOAD_RULES['profile-photo'];

      expect(rules.maxSize).toBe(5 * 1024 * 1024); // 5MB
      expect(rules.allowedTypes).toContain('image/jpeg');
      expect(rules.allowedTypes).toContain('image/png');
      expect(rules.allowedTypes).toContain('image/webp');
      expect(rules.allowedTypes).toContain('image/gif');
    });

    it('should have correct cover-photo rules', () => {
      const rules = FILE_UPLOAD_RULES['cover-photo'];

      expect(rules.maxSize).toBe(10 * 1024 * 1024); // 10MB
      expect(rules.allowedTypes).toContain('image/jpeg');
      expect(rules.allowedTypes).not.toContain('image/gif'); // No GIFs for cover
    });

    it('should have correct document rules', () => {
      const rules = FILE_UPLOAD_RULES['document'];

      expect(rules.maxSize).toBe(25 * 1024 * 1024); // 25MB
      expect(rules.allowedTypes).toContain('application/pdf');
    });
  });

  // ============================================
  // API FACTORY TESTS
  // ============================================

  describe('createFileUploadApi', () => {
    let mockHttp: FileUploadHttpAdapter;
    let api: ReturnType<typeof createFileUploadApi>;

    beforeEach(() => {
      mockHttp = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        uploadFile: vi.fn(),
      };
      api = createFileUploadApi(mockHttp, 'https://api.test.com/v1');
    });

    it('should upload profile photo successfully', async () => {
      const mockResult = {
        url: 'https://storage.example.com/users/123/profile/photo.webp',
        storagePath: 'users/123/profile/photo.webp',
        size: 50000,
        mimeType: 'image/webp',
        thumbnailUrl: 'https://storage.example.com/users/123/profile/photo_thumb.webp',
        dimensions: { width: 512, height: 512 },
      };

      vi.mocked(mockHttp.uploadFile).mockResolvedValue({
        success: true,
        data: mockResult,
      } as ApiResponse<typeof mockResult>);

      const result = await api.uploadProfilePhoto(
        'user123',
        new Blob(['test'], { type: 'image/jpeg' }),
        'photo.jpg',
        'image/jpeg'
      );

      expect(result).toEqual(mockResult);
      expect(mockHttp.uploadFile).toHaveBeenCalledWith(
        'https://api.test.com/v1/upload/profile-photo',
        expect.any(Blob),
        expect.objectContaining({
          userId: 'user123',
          category: 'profile-photo',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
        }),
        undefined
      );
    });

    it('should call progress callback during upload', async () => {
      const mockResult = {
        url: 'https://storage.example.com/photo.webp',
        storagePath: 'users/123/profile/photo.webp',
        size: 50000,
        mimeType: 'image/webp',
      };

      vi.mocked(mockHttp.uploadFile).mockImplementation(async (_url, _file, _meta, onProgress) => {
        // Simulate progress updates
        onProgress?.(25);
        onProgress?.(50);
        onProgress?.(75);
        onProgress?.(100);
        return { success: true, data: mockResult } as ApiResponse<typeof mockResult>;
      });

      const progressUpdates: number[] = [];
      await api.uploadProfilePhoto(
        'user123',
        new Blob(['test'], { type: 'image/jpeg' }),
        'photo.jpg',
        'image/jpeg',
        (progress) => progressUpdates.push(progress)
      );

      expect(progressUpdates).toEqual([25, 50, 75, 100]);
    });

    it('should throw error for invalid file', async () => {
      // File too large (exceeds 5MB for profile photos)
      await expect(
        api.uploadProfilePhoto(
          'user123',
          'x'.repeat(10 * 1024 * 1024), // 10MB base64 string
          'large.jpg',
          'image/jpeg'
        )
      ).rejects.toThrow('smaller than 5MB');
    });

    it('should throw error on API failure', async () => {
      vi.mocked(mockHttp.uploadFile).mockResolvedValue({
        success: false,
        error: 'Server error',
      } as ApiResponse<unknown>);

      await expect(
        api.uploadProfilePhoto(
          'user123',
          new Blob(['test'], { type: 'image/jpeg' }),
          'photo.jpg',
          'image/jpeg'
        )
      ).rejects.toThrow('Server error');
    });

    it('should delete file successfully', async () => {
      vi.mocked(mockHttp.delete).mockResolvedValue({ success: true });

      await expect(
        api.deleteFile('user123', 'users/user123/profile/photo.webp')
      ).resolves.not.toThrow();

      expect(mockHttp.delete).toHaveBeenCalledWith(
        'https://api.test.com/v1/upload/file',
        expect.objectContaining({
          params: { userId: 'user123', path: 'users/user123/profile/photo.webp' },
        })
      );
    });

    it('should get signed upload URL', async () => {
      const mockData = {
        uploadUrl: 'https://storage.googleapis.com/bucket/path?signature=xxx',
        storagePath: 'users/123/profile/photo.jpg',
        expiresAt: Date.now() + 15 * 60 * 1000,
      };

      vi.mocked(mockHttp.post).mockResolvedValue({
        success: true,
        data: mockData,
      });

      const result = await api.getSignedUploadUrl(
        'user123',
        'profile-photo',
        'photo.jpg',
        'image/jpeg'
      );

      expect(result).toEqual(mockData);
      expect(mockHttp.post).toHaveBeenCalledWith(
        'https://api.test.com/v1/upload/signed-url',
        expect.objectContaining({
          userId: 'user123',
          category: 'profile-photo',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
        })
      );
    });
  });
});
