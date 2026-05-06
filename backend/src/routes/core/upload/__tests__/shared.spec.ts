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
      buildCloudflarePlaybackUrls(
        'video-123',
        'customer-3so5upzyragnxh5k.cloudflarestream.com'
      )
    ).toEqual({
      hlsUrl:
        'https://customer-3so5upzyragnxh5k.cloudflarestream.com/video-123/manifest/video.m3u8',
      dashUrl:
        'https://customer-3so5upzyragnxh5k.cloudflarestream.com/video-123/manifest/video.mpd',
      iframeUrl: 'https://customer-3so5upzyragnxh5k.cloudflarestream.com/video-123/iframe',
    });
  });
});