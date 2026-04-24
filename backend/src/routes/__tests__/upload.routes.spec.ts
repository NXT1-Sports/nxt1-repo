/**
 * @fileoverview Upload Routes Tests
 * @module @nxt1/backend/routes/__tests__/upload
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app, { __getMockFirestoreDocument, __resetMockFirestore } from '../../test-app.js';

// All upload routes require appGuard — send a Bearer token so the mock
// verifyIdToken in test-app.ts is reached instead of an early 401.
const AUTH_HEADER = 'Bearer test-token';
const VALID_TUS_METADATA = 'filename aGlnaGxpZ2h0Lm1wNA==,filetype dmlkZW8vbXA0,context ZmVlZA==';

describe('Upload Routes', () => {
  beforeEach(() => {
    __resetMockFirestore();
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'cf-account-123');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cf-token-123');
    vi.stubEnv('BACKEND_URL', 'https://api-staging.nxt1.test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('Production Routes', () => {
    it('POST /api/v1/upload/profile-photo should handle file upload', async () => {
      const response = await request(app)
        .post('/api/v1/upload/profile-photo')
        .set('Authorization', AUTH_HEADER)
        .field('category', 'profile-photo');

      // Should return 400 (no file) or 500 (Firebase context missing)
      expect([400, 500]).toContain(response.status);
    });

    it('POST /api/v1/upload/highlight-video should handle video upload', async () => {
      const response = await request(app)
        .post('/api/v1/upload/highlight-video')
        .set('Authorization', AUTH_HEADER)
        .field('category', 'highlight-video');

      expect([400, 500]).toContain(response.status);
    });

    it('POST /api/v1/upload/cloudflare/direct-url should validate tus headers', async () => {
      const response = await request(app)
        .post('/api/v1/upload/cloudflare/direct-url')
        .set('Authorization', AUTH_HEADER);

      expect(response.status).toBe(400);
    });

    it('POST /api/v1/upload/cloudflare/direct-url should return 503 when Cloudflare is not configured', async () => {
      vi.unstubAllEnvs();

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/direct-url')
        .set('Authorization', AUTH_HEADER)
        .set('Tus-Resumable', '1.0.0')
        .set('Upload-Length', String(25 * 1024 * 1024))
        .set('Upload-Metadata', VALID_TUS_METADATA);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        success: false,
        error: 'Cloudflare direct uploads are not configured',
      });
    });

    it('POST /api/v1/upload/cloudflare/direct-url should provision a Cloudflare tus upload URL', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 201,
          headers: {
            Location: 'https://upload.videodelivery.net/tus/1234567890abcdef',
          },
        })
      );

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/direct-url')
        .set('Authorization', AUTH_HEADER)
        .set('Tus-Resumable', '1.0.0')
        .set('Upload-Length', String(25 * 1024 * 1024))
        .set('Upload-Metadata', VALID_TUS_METADATA);

      expect(response.status).toBe(201);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/cf-account-123/stream?direct_user=true',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer cf-token-123',
            'Tus-Resumable': '1.0.0',
            'Upload-Length': String(25 * 1024 * 1024),
            'Upload-Creator': 'test-user',
          }),
        })
      );
      expect(response.headers['location']).toBe(
        'https://upload.videodelivery.net/tus/1234567890abcdef'
      );
      expect(response.headers['stream-media-id']).toBe('1234567890abcdef');
      expect(response.body).toMatchObject({
        success: true,
        data: {
          uploadUrl: 'https://upload.videodelivery.net/tus/1234567890abcdef',
          cloudflareVideoId: '1234567890abcdef',
          uploadMethod: 'tus',
          metadata: {
            userId: 'test-user',
            context: 'feed',
            environment: 'staging',
            originalFileName: 'highlight.mp4',
            mimeType: 'video/mp4',
          },
        },
      });
    });

    it('POST /api/v1/upload/cloudflare/direct-url should surface upstream provisioning failures', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: 'invalid upload request' }],
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/direct-url')
        .set('Authorization', AUTH_HEADER)
        .set('Tus-Resumable', '1.0.0')
        .set('Upload-Length', String(25 * 1024 * 1024))
        .set('Upload-Metadata', VALID_TUS_METADATA);

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        success: false,
        error: 'Cloudflare direct upload provisioning failed: invalid upload request',
      });
    });

    it('POST /api/v1/upload/cloudflare/direct-url should reject upstream responses without a Location header', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 201 }));

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/direct-url')
        .set('Authorization', AUTH_HEADER)
        .set('Tus-Resumable', '1.0.0')
        .set('Upload-Length', String(25 * 1024 * 1024))
        .set('Upload-Metadata', VALID_TUS_METADATA);

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        success: false,
        error: 'Cloudflare direct upload provisioning returned no upload URL',
      });
    });

    it('POST /api/v1/upload/cloudflare/finalize should return 503 when Cloudflare is not configured', async () => {
      vi.unstubAllEnvs();

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/finalize')
        .set('Authorization', AUTH_HEADER)
        .send({ cloudflareVideoId: 'video-123' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        success: false,
        error: 'Cloudflare direct uploads are not configured',
      });
    });

    it('POST /api/v1/upload/cloudflare/finalize should validate cloudflareVideoId', async () => {
      const response = await request(app)
        .post('/api/v1/upload/cloudflare/finalize')
        .set('Authorization', AUTH_HEADER)
        .send({ cloudflareVideoId: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('POST /api/v1/upload/cloudflare/finalize should normalize the finalized video payload', async () => {
      vi.stubEnv('CLOUDFLARE_STREAM_CUSTOMER_CODE', 'customer-123');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              readyToStream: true,
              duration: 42,
              thumbnail:
                'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
              preview: 'https://customer-123.cloudflarestream.com/video-123/thumbnails/preview.jpg',
              uploaded: '2026-04-13T00:00:00.000Z',
              meta: {
                name: 'nxt1-feed-test-user-video',
                nxt1_user_id: 'test-user',
                nxt1_context: 'feed',
                nxt1_env: 'staging',
                nxt1_file_name: 'highlight.mp4',
                nxt1_mime_type: 'video/mp4',
              },
              status: {
                state: 'ready',
              },
              playback: {
                hls: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
                dash: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.mpd',
              },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/finalize')
        .set('Authorization', AUTH_HEADER)
        .send({ cloudflareVideoId: 'video-123' });

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/cf-account-123/stream/video-123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer cf-token-123',
          }),
        })
      );
      expect(response.body).toEqual({
        success: true,
        data: {
          cloudflareVideoId: 'video-123',
          status: 'ready',
          readyToStream: true,
          durationSeconds: 42,
          thumbnailUrl:
            'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
          previewUrl: 'https://customer-123.cloudflarestream.com/video-123/thumbnails/preview.jpg',
          uploadedAt: '2026-04-13T00:00:00.000Z',
          name: 'nxt1-feed-test-user-video',
          metadata: {
            userId: 'test-user',
            context: 'feed',
            environment: 'staging',
            originalFileName: 'highlight.mp4',
            mimeType: 'video/mp4',
          },
          playback: {
            hlsUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
            dashUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.mpd',
            iframeUrl: 'https://customer-123.cloudflarestream.com/video-123/iframe',
          },
        },
      });
    });

    it('POST /api/v1/upload/cloudflare/finalize should reject uploads owned by another user', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              readyToStream: false,
              meta: {
                nxt1_user_id: 'different-user',
              },
              status: {
                state: 'inprogress',
              },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/finalize')
        .set('Authorization', AUTH_HEADER)
        .send({ cloudflareVideoId: 'video-123' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('POST /api/v1/upload/cloudflare/finalize should surface upstream fetch failures', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: 'video not found' }],
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/finalize')
        .set('Authorization', AUTH_HEADER)
        .send({ cloudflareVideoId: 'video-123' });

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        success: false,
        error: 'Cloudflare finalize failed: video not found',
      });
    });

    it('POST /api/v1/upload/cloudflare/highlight-post should validate cloudflareVideoId', async () => {
      const response = await request(app)
        .post('/api/v1/upload/cloudflare/highlight-post')
        .set('Authorization', AUTH_HEADER)
        .send({ cloudflareVideoId: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('POST /api/v1/upload/cloudflare/highlight-post should persist a canonical highlight post', async () => {
      vi.stubEnv('CLOUDFLARE_STREAM_CUSTOMER_CODE', 'customer-123');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              readyToStream: true,
              duration: 42,
              thumbnail:
                'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
              preview: 'https://customer-123.cloudflarestream.com/video-123/thumbnails/preview.jpg',
              uploaded: '2026-04-13T00:00:00.000Z',
              meta: {
                name: 'nxt1-feed-test-user-video',
                nxt1_user_id: 'test-user',
                nxt1_context: 'feed',
                nxt1_env: 'staging',
                nxt1_file_name: 'highlight.mp4',
                nxt1_mime_type: 'video/mp4',
              },
              status: { state: 'ready' },
              playback: {
                hls: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
                dash: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.mpd',
              },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const response = await request(app)
        .post('/api/v1/upload/cloudflare/highlight-post')
        .set('Authorization', AUTH_HEADER)
        .send({
          cloudflareVideoId: 'video-123',
          title: 'Junior Season Highlights',
          content: 'Week 9 tape',
          sportId: 'football',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          postId: 'cf-stream-video-123',
          cloudflareVideoId: 'video-123',
          status: 'ready',
          readyToStream: true,
          title: 'Junior Season Highlights',
          content: 'Week 9 tape',
          thumbnailUrl:
            'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
          mediaUrl: 'https://customer-123.cloudflarestream.com/video-123/iframe',
          duration: 42,
          visibility: 'public',
          createdAt: '2026-04-13T00:00:00.000Z',
          updatedAt: expect.any(String),
          playback: {
            hlsUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
            dashUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.mpd',
            iframeUrl: 'https://customer-123.cloudflarestream.com/video-123/iframe',
          },
        },
      });

      expect(__getMockFirestoreDocument('Posts/cf-stream-video-123')).toMatchObject({
        id: 'cf-stream-video-123',
        userId: 'test-user',
        type: 'video',
        title: 'Junior Season Highlights',
        content: 'Week 9 tape',
        sportId: 'football',
        cloudflareVideoId: 'video-123',
        readyToStream: true,
        mediaUrl: 'https://customer-123.cloudflarestream.com/video-123/iframe',
        videoUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
        thumbnailUrl:
          'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
      });
    });
  });

  describe('Staging Routes', () => {
    it('POST /api/v1/staging/upload/profile-photo should handle file upload', async () => {
      const response = await request(app)
        .post('/api/v1/staging/upload/profile-photo')
        .set('Authorization', AUTH_HEADER)
        .field('category', 'profile-photo');

      expect([400, 500]).toContain(response.status);
    });

    it('POST /api/v1/staging/upload/cloudflare/direct-url should validate tus headers', async () => {
      const response = await request(app)
        .post('/api/v1/staging/upload/cloudflare/direct-url')
        .set('Authorization', AUTH_HEADER);

      expect(response.status).toBe(400);
    });
  });
});
