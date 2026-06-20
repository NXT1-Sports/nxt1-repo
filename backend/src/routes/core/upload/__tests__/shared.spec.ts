import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => {
  const save = vi.fn().mockResolvedValue(undefined);
  const file = vi.fn(() => ({
    save,
  }));
  const bucket = vi.fn(() => ({
    name: 'test-bucket',
    file,
  }));

  return {
    save,
    file,
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

  it('uses non-resumable writes without validation for backend image uploads', async () => {
    const url = await uploadToStorage(
      Buffer.from('image-bytes'),
      'Users/user-1/profile/avatar.jpg',
      'image/jpeg'
    );

    expect(storageMocks.file).toHaveBeenCalledWith('Users/user-1/profile/avatar.jpg');
    expect(storageMocks.save).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        resumable: false,
        validation: false,
        metadata: expect.objectContaining({
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
          metadata: expect.objectContaining({
            firebaseStorageDownloadTokens: expect.any(String),
          }),
        }),
      })
    );
    expect(url).toMatch(
      /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\/o\/Users%2Fuser-1%2Fprofile%2Favatar\.jpg\?alt=media&token=/
    );
  });
});
import { describe, expect, it } from 'vitest';

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
