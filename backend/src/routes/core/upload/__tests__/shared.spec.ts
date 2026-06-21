import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => {
  const request = vi.fn().mockResolvedValue({ status: 200, data: {} });
  const bucket = vi.fn(() => ({
    name: 'test-bucket',
    storage: {
      authClient: {
        request,
      },
    },
  }));

  return {
    request,
    bucket,
  };
});

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: storageMocks.bucket,
  }),
}));

import { uploadToStorage } from '../shared.js';

describe('uploadToStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses authenticated multipart uploads for backend image uploads', async () => {
    const url = await uploadToStorage(
      Buffer.from('image-bytes'),
      'Users/user-1/profile/avatar.jpg',
      'image/jpeg'
    );

    expect(storageMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://storage.googleapis.com/upload/storage/v1/b/test-bucket/o?uploadType=multipart&name=Users%2Fuser-1%2Fprofile%2Favatar.jpg',
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': expect.stringContaining('multipart/related; boundary='),
        }),
        data: expect.any(Buffer),
        responseType: 'json',
      })
    );

    const requestOptions = storageMocks.request.mock.calls[0]?.[0] as {
      data: Buffer;
    };

    expect(requestOptions.data.toString('utf8')).toContain('"contentType":"image/jpeg"');
    expect(requestOptions.data.toString('utf8')).toContain(
      '"cacheControl":"public, max-age=31536000"'
    );
    expect(requestOptions.data.toString('utf8')).toContain('firebaseStorageDownloadTokens');
    expect(url).toMatch(
      /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\/o\/Users%2Fuser-1%2Fprofile%2Favatar\.jpg\?alt=media&token=/
    );
  });
});

import { buildCloudflarePlaybackUrls, getCloudflareStreamHost } from '../shared.js';

describe('Cloudflare upload shared helpers', () => {
  it('normalizes a bare customer code into a Cloudflare Stream host', () => {
    expect(getCloudflareStreamHost('3so5upzyragnxh5k')).toBe(
      'https://customer-3so5upzyragnxh5k.cloudflarestream.com'
    );
  });

  it('preserves a fully qualified Cloudflare Stream host without duplicating the domain', () => {
    expect(getCloudflareStreamHost('customer-3so5upzyragnxh5k.cloudflarestream.com')).toBe(
      'https://customer-3so5upzyragnxh5k.cloudflarestream.com'
    );
  });

  it('builds playback URLs from a fully qualified Cloudflare Stream host', () => {
    expect(
      buildCloudflarePlaybackUrls('video-123', 'customer-3so5upzyragnxh5k.cloudflarestream.com')
    ).toEqual({
      hlsUrl:
        'https://customer-3so5upzyragnxh5k.cloudflarestream.com/video-123/manifest/video.m3u8',
      dashUrl:
        'https://customer-3so5upzyragnxh5k.cloudflarestream.com/video-123/manifest/video.mpd',
      iframeUrl: 'https://customer-3so5upzyragnxh5k.cloudflarestream.com/video-123/iframe',
    });
  });
});
