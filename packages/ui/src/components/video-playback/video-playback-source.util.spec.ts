import { describe, expect, it } from 'vitest';

import {
  buildCloudflareHlsUrl,
  isCloudflarePlaybackSource,
  isHlsSourceUrl,
  resolveCloudflareBaseEmbedUrl,
  resolveCloudflareHlsUrl,
  resolvePlayableVideoUrl,
} from './video-playback-source.util';

describe('video playback source helpers', () => {
  it('keeps native downloadable urls unchanged', () => {
    expect(
      resolvePlayableVideoUrl({
        videoUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/video.mp4?alt=media',
      })
    ).toBe('https://firebasestorage.googleapis.com/v0/b/example/o/video.mp4?alt=media');
  });

  it('derives cloudflare hls from a direct video id', () => {
    expect(
      resolvePlayableVideoUrl({
        cloudflareVideoId: 'abc123',
        readyToStream: true,
      })
    ).toBe('https://videodelivery.net/abc123/manifest/video.m3u8');
  });

  it('does not resolve cloudflare playback before stream readiness', () => {
    expect(
      resolvePlayableVideoUrl({
        cloudflareVideoId: 'abc123',
        readyToStream: false,
      })
    ).toBeNull();

    expect(
      resolveCloudflareBaseEmbedUrl({
        cloudflareVideoId: 'abc123',
        readyToStream: false,
      })
    ).toBeNull();
  });

  it('converts cloudflare watch and iframe urls into hls manifests', () => {
    expect(resolveCloudflareHlsUrl('https://watch.cloudflarestream.com/abc123')).toBe(
      'https://videodelivery.net/abc123/manifest/video.m3u8'
    );

    expect(resolveCloudflareHlsUrl('https://iframe.videodelivery.net/abc123')).toBe(
      'https://videodelivery.net/abc123/manifest/video.m3u8'
    );
  });

  it('preserves zone-specific cloudflare stream hosts when building hls urls', () => {
    expect(
      buildCloudflareHlsUrl('abc123', 'https://customer.cloudflarestream.com/abc123/iframe')
    ).toBe('https://customer.cloudflarestream.com/abc123/manifest/video.m3u8');
  });

  it('detects hls manifest urls', () => {
    expect(isHlsSourceUrl('https://videodelivery.net/abc123/manifest/video.m3u8')).toBe(true);
    expect(isHlsSourceUrl('https://example.com/video.mp4')).toBe(false);
  });

  it('detects cloudflare playback sources from ids and urls', () => {
    expect(isCloudflarePlaybackSource({ cloudflareVideoId: 'abc123' })).toBe(true);
    expect(
      isCloudflarePlaybackSource({
        videoUrl: 'https://watch.cloudflarestream.com/abc123',
      })
    ).toBe(true);
    expect(
      isCloudflarePlaybackSource({
        videoUrl: 'https://firebasestorage.googleapis.com/v0/b/example/o/video.mp4?alt=media',
      })
    ).toBe(false);
  });

  it('derives cloudflare embed urls from ids and watch urls', () => {
    expect(
      resolveCloudflareBaseEmbedUrl({ cloudflareVideoId: 'abc123', readyToStream: true })
    ).toBe('https://iframe.videodelivery.net/abc123');

    expect(
      resolveCloudflareBaseEmbedUrl({
        videoUrl: 'https://watch.cloudflarestream.com/abc123',
      })
    ).toBe('https://iframe.videodelivery.net/abc123');

    expect(
      resolveCloudflareBaseEmbedUrl({
        videoUrl: 'https://customer.videodelivery.net/abc123/videos/manifest/video.m3u8',
      })
    ).toBe('https://iframe.videodelivery.net/abc123');

    expect(
      resolveCloudflareBaseEmbedUrl({
        videoUrl: 'https://customer.cloudflarestream.com/abc123/manifest/video.m3u8',
      })
    ).toBe('https://iframe.videodelivery.net/abc123');
  });
});
