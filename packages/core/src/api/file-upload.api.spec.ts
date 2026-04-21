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
  type DirectVideoUploadSession,
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

      // maxSize is absent — TypeScript enforces this at compile time; no maxSize check at runtime
      expect(rules.allowedTypes).toContain('image/jpeg');
      expect(rules.allowedTypes).toContain('image/png');
      expect(rules.allowedTypes).toContain('image/webp');
      expect(rules.allowedTypes).toContain('image/gif');
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

    it('should provision a direct highlight video upload session', async () => {
      const mockSession: DirectVideoUploadSession = {
        uploadUrl: 'https://upload.videodelivery.net/tus/video-123',
        cloudflareVideoId: 'video-123',
        uploadMethod: 'tus',
        tusResumable: '1.0.0',
        expiresAt: '2026-04-13T00:00:00.000Z',
        maxSize: 500 * 1024 * 1024,
        maxDurationSeconds: 300,
        name: 'nxt1-feed-user123-video',
        metadata: {
          userId: 'user123',
          context: 'feed',
          environment: 'staging',
          originalFileName: 'highlight.mp4',
          mimeType: 'video/mp4',
        },
      };

      vi.mocked(mockHttp.post).mockResolvedValue({
        success: true,
        data: mockSession,
      } as ApiResponse<DirectVideoUploadSession>);

      const result = await api.provisionHighlightVideoUpload(
        'user123',
        'highlight.mp4',
        'video/mp4',
        25 * 1024 * 1024,
        {
          context: 'feed',
          maxDurationSeconds: 300,
        }
      );

      expect(result).toEqual(mockSession);
      expect(mockHttp.post).toHaveBeenCalledWith(
        'https://api.test.com/v1/upload/cloudflare/direct-url',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Tus-Resumable': '1.0.0',
            'Upload-Length': String(25 * 1024 * 1024),
            'Upload-Metadata': expect.stringContaining('filename '),
          }),
        })
      );
      expect(
        (vi.mocked(mockHttp.post).mock.calls[0]?.[2] as { headers: Record<string, string> })
          .headers['Upload-Metadata']
      ).toContain('context ZmVlZA==');
      expect(
        (vi.mocked(mockHttp.post).mock.calls[0]?.[2] as { headers: Record<string, string> })
          .headers['Upload-Metadata']
      ).toContain('maxDurationSeconds MzAw');
    });

    it('should reject invalid highlight video uploads before provisioning', async () => {
      await expect(
        api.provisionHighlightVideoUpload(
          'user123',
          'highlight.mov',
          'video/unknown',
          25 * 1024 * 1024
        )
      ).rejects.toThrow('File type not allowed');

      expect(mockHttp.post).not.toHaveBeenCalled();
    });

    it('should finalize a direct highlight video upload', async () => {
      const finalizedVideo = {
        cloudflareVideoId: 'video-123',
        status: 'ready',
        readyToStream: true,
        durationSeconds: 37,
        thumbnailUrl: 'https://videodelivery.net/video-123/thumbnails/thumbnail.jpg',
        previewUrl: 'https://videodelivery.net/video-123/thumbnails/preview.jpg',
        uploadedAt: '2026-04-13T00:00:00.000Z',
        name: 'nxt1-feed-user123-video',
        metadata: {
          userId: 'user123',
          context: 'feed',
          environment: 'staging',
          originalFileName: 'highlight.mp4',
          mimeType: 'video/mp4',
        },
        playback: {
          hlsUrl: 'https://videodelivery.net/video-123/manifest/video.m3u8',
          dashUrl: 'https://videodelivery.net/video-123/manifest/video.mpd',
          iframeUrl: 'https://videodelivery.net/video-123/iframe',
        },
      };

      vi.mocked(mockHttp.post).mockResolvedValue({
        success: true,
        data: finalizedVideo,
      } as ApiResponse<typeof finalizedVideo>);

      const result = await api.finalizeHighlightVideoUpload('video-123');

      expect(result).toEqual(finalizedVideo);
      expect(mockHttp.post).toHaveBeenCalledWith(
        'https://api.test.com/v1/upload/cloudflare/finalize',
        {
          cloudflareVideoId: 'video-123',
        }
      );
    });

    it('should reject finalize requests without a video id', async () => {
      await expect(api.finalizeHighlightVideoUpload('   ')).rejects.toThrow(
        'cloudflareVideoId is required'
      );

      expect(mockHttp.post).not.toHaveBeenCalled();
    });

    it('should persist a finalized Cloudflare highlight post', async () => {
      const persistedPost = {
        postId: 'cf-stream-video-123',
        cloudflareVideoId: 'video-123',
        status: 'ready',
        readyToStream: true,
        title: 'Junior Season Highlights',
        content: 'Week 9 tape',
        thumbnailUrl: 'https://videodelivery.net/video-123/thumbnails/thumbnail.jpg',
        mediaUrl: 'https://videodelivery.net/video-123/iframe',
        duration: 42,
        visibility: 'public' as const,
        createdAt: '2026-04-13T00:00:00.000Z',
        updatedAt: '2026-04-13T00:00:00.000Z',
        playback: {
          hlsUrl: 'https://videodelivery.net/video-123/manifest/video.m3u8',
          dashUrl: 'https://videodelivery.net/video-123/manifest/video.mpd',
          iframeUrl: 'https://videodelivery.net/video-123/iframe',
        },
      };

      vi.mocked(mockHttp.post).mockResolvedValue({
        success: true,
        data: persistedPost,
      } as ApiResponse<typeof persistedPost>);

      const result = await api.persistHighlightVideoPost({
        cloudflareVideoId: 'video-123',
        title: 'Junior Season Highlights',
        content: 'Week 9 tape',
        sportId: 'football',
      });

      expect(result).toEqual(persistedPost);
      expect(mockHttp.post).toHaveBeenCalledWith(
        'https://api.test.com/v1/upload/cloudflare/highlight-post',
        {
          cloudflareVideoId: 'video-123',
          title: 'Junior Season Highlights',
          content: 'Week 9 tape',
          sportId: 'football',
        }
      );
    });

    it('should reject persisted highlight requests without a video id', async () => {
      await expect(api.persistHighlightVideoPost({ cloudflareVideoId: '   ' })).rejects.toThrow(
        'cloudflareVideoId is required'
      );

      expect(mockHttp.post).not.toHaveBeenCalled();
    });
  });
});
