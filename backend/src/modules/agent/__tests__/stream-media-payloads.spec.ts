import { describe, expect, it } from 'vitest';

import { extractMediaPayloads } from '../stream-media-payloads.js';

describe('extractMediaPayloads', () => {
  it('extracts signed HLS playback urls as video payloads', () => {
    const signedHlsUrl =
      'https://customer-abc.cloudflarestream.com/video-123/manifest/video.m3u8?token=signed-token';

    expect(extractMediaPayloads({ signedHlsUrl })).toEqual([
      {
        type: 'video',
        url: signedHlsUrl,
        mimeType: 'application/vnd.apple.mpegurl',
      },
    ]);
  });

  it('extracts ephemeral video urls with thumbnail metadata', () => {
    const ephemeralUrl = 'https://runway.example.com/output/video-123';
    const thumbnailUrl = 'https://runway.example.com/output/video-123-thumb.jpg';

    expect(
      extractMediaPayloads({
        ephemeralUrl,
        thumbnailUrl,
      })
    ).toEqual([
      {
        type: 'video',
        url: ephemeralUrl,
        thumbnailUrl,
      },
    ]);
  });
});
