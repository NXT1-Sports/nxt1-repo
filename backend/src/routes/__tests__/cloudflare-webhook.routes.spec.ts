import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app, {
  __getMockFirestoreDocument,
  __resetMockFirestore,
  __seedMockFirestoreDocument,
} from '../../test-app.js';

describe('Cloudflare Webhook Routes', () => {
  beforeEach(() => {
    __resetMockFirestore();
    vi.stubEnv('CLOUDFLARE_STREAM_CUSTOMER_CODE', 'customer-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('POST /api/v1/cloudflare-webhook should reconcile a ready event into an existing video post', async () => {
    __seedMockFirestoreDocument('Posts/cf-stream-video-123', {
      id: 'cf-stream-video-123',
      userId: 'test-user',
      type: 'video',
      mediaUrl: 'https://customer-123.cloudflarestream.com/video-123/iframe',
      videoUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
      readyToStream: false,
      cloudflareStatus: 'inprogress',
    });

    const response = await request(app)
      .post('/api/v1/cloudflare-webhook')
      .send({
        uid: 'video-123',
        readyToStream: true,
        thumbnail: 'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
        playback: {
          hls: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
          dash: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.mpd',
        },
        duration: 42,
        status: { state: 'ready' },
        meta: {
          nxt1_user_id: 'test-user',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, videoUid: 'video-123', state: 'ready' });

    expect(__getMockFirestoreDocument('Posts/cf-stream-video-123')).toMatchObject({
      readyToStream: true,
      cloudflareStatus: 'ready',
      duration: 42,
      thumbnailUrl: 'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
      mediaUrl: 'https://customer-123.cloudflarestream.com/video-123/iframe',
      videoUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
      playback: {
        hlsUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.m3u8',
        dashUrl: 'https://customer-123.cloudflarestream.com/video-123/manifest/video.mpd',
        iframeUrl: 'https://customer-123.cloudflarestream.com/video-123/iframe',
      },
      cloudflareError: null,
    });
  });

  it('POST /api/v1/cloudflare-webhook should reconcile an error event into an existing video post', async () => {
    __seedMockFirestoreDocument('Posts/cf-stream-video-456', {
      id: 'cf-stream-video-456',
      userId: 'test-user',
      type: 'video',
      readyToStream: false,
      cloudflareStatus: 'inprogress',
    });

    const response = await request(app)
      .post('/api/v1/cloudflare-webhook')
      .send({
        uid: 'video-456',
        readyToStream: false,
        status: {
          state: 'error',
          errorReasonCode: 'ERR_STREAM_TRANSCODE',
          errorReasonText: 'Transcode failed',
        },
        meta: {
          nxt1_user_id: 'test-user',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, videoUid: 'video-456', state: 'error' });

    expect(__getMockFirestoreDocument('Posts/cf-stream-video-456')).toMatchObject({
      readyToStream: false,
      cloudflareStatus: 'error',
      cloudflareError: {
        code: 'ERR_STREAM_TRANSCODE',
        message: 'Transcode failed',
      },
    });
  });
});
