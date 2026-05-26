/**
 * @fileoverview Unit tests for write-athlete-videos Cloudflare field mapping.
 */

import { describe, expect, it } from 'vitest';
import {
  parseFirebaseStorageReference,
  resolveCloudflareVideoPostFields,
  shouldImportVideoSourceToCloudflare,
} from '../write-athlete-videos.tool.js';

describe('resolveCloudflareVideoPostFields', () => {
  it('maps Cloudflare upload metadata to streamable post fields', () => {
    const fields = resolveCloudflareVideoPostFields(
      {
        cloudflareVideoId: 'cf-video-123',
        cloudflareStatus: 'ready',
        readyToStream: true,
        thumbnailUrl: 'https://videodelivery.net/cf-video-123/thumbnails/thumbnail.jpg',
        durationSeconds: 12.5,
        playback: {
          hlsUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/manifest/video.m3u8',
          dashUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/manifest/video.mpd',
          iframeUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/iframe',
        },
      },
      undefined
    );

    expect(fields).toEqual({
      cloudflareVideoId: 'cf-video-123',
      cloudflareStatus: 'ready',
      readyToStream: true,
      mediaUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/iframe',
      iframeUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/iframe',
      videoUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/manifest/video.m3u8',
      playback: {
        hlsUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/manifest/video.m3u8',
        dashUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/manifest/video.mpd',
        iframeUrl: 'https://customer-123.cloudflarestream.com/cf-video-123/iframe',
      },
      thumbnailUrl: 'https://videodelivery.net/cf-video-123/thumbnails/thumbnail.jpg',
      poster: 'https://videodelivery.net/cf-video-123/thumbnails/thumbnail.jpg',
      duration: 12.5,
    });
  });

  it('builds default Cloudflare playback URLs when the attachment only has an id', () => {
    const fields = resolveCloudflareVideoPostFields(
      {
        cloudflareVideoId: 'cf-video-456',
      },
      undefined
    );

    expect(fields).toMatchObject({
      cloudflareVideoId: 'cf-video-456',
      cloudflareStatus: 'ready',
      readyToStream: true,
      mediaUrl: 'https://iframe.videodelivery.net/cf-video-456',
      iframeUrl: 'https://iframe.videodelivery.net/cf-video-456',
      videoUrl: 'https://videodelivery.net/cf-video-456/manifest/video.m3u8',
      thumbnailUrl: 'https://videodelivery.net/cf-video-456/thumbnails/thumbnail.jpg',
      poster: 'https://videodelivery.net/cf-video-456/thumbnails/thumbnail.jpg',
    });
  });

  it('keeps processing videos out of mediaUrl until ready', () => {
    const fields = resolveCloudflareVideoPostFields(
      {
        cloudflareVideoId: 'cf-video-789',
        cloudflareStatus: 'inprogress',
        readyToStream: false,
      },
      'customer-123'
    );

    expect(fields).toMatchObject({
      cloudflareVideoId: 'cf-video-789',
      cloudflareStatus: 'inprogress',
      readyToStream: false,
      mediaUrl: null,
      iframeUrl: 'https://customer-123.cloudflarestream.com/cf-video-789/iframe',
      videoUrl: 'https://customer-123.cloudflarestream.com/cf-video-789/manifest/video.m3u8',
    });
  });
});

describe('shouldImportVideoSourceToCloudflare', () => {
  it('requires Cloudflare import for Firebase/GCS uploaded video URLs', () => {
    expect(
      shouldImportVideoSourceToCloudflare(
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-1/uploads/video/unbound/clip.MOV?X-Goog-Signature=abc',
        'other'
      )
    ).toBe(true);
    expect(
      shouldImportVideoSourceToCloudflare(
        'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-1%2Fuploads%2Fvideo%2Funbound%2Fclip.mp4?alt=media',
        'other'
      )
    ).toBe(true);
  });

  it('does not re-import Cloudflare videos', () => {
    expect(
      shouldImportVideoSourceToCloudflare(
        'https://iframe.videodelivery.net/cf-video-123',
        'cloudflare'
      )
    ).toBe(false);
  });
});

describe('parseFirebaseStorageReference', () => {
  it('extracts bucket and object path from GCS signed URLs', () => {
    expect(
      parseFirebaseStorageReference(
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-1/uploads/video/unbound/clip.MOV?X-Goog-Signature=abc'
      )
    ).toEqual({
      bucketName: 'nxt-1-staging-v2.firebasestorage.app',
      storagePath: 'Users/user-1/uploads/video/unbound/clip.MOV',
    });
  });

  it('extracts bucket and object path from Firebase Storage URLs', () => {
    expect(
      parseFirebaseStorageReference(
        'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-1%2Fthreads%2Fthread-1%2Fmedia%2Fvideo%2Fclip.mp4?alt=media'
      )
    ).toEqual({
      bucketName: 'nxt-1-staging-v2.firebasestorage.app',
      storagePath: 'Users/user-1/threads/thread-1/media/video/clip.mp4',
    });
  });

  it('uses signed URL parsing to preserve the staging bucket when a bare storagePath is also present', () => {
    const signedUrlReference = parseFirebaseStorageReference(
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-1/uploads/video/unbound/clip.MOV?X-Goog-Signature=abc'
    );
    const barePathReference = parseFirebaseStorageReference(
      'Users/user-1/uploads/video/unbound/clip.MOV'
    );

    expect(signedUrlReference).toEqual({
      bucketName: 'nxt-1-staging-v2.firebasestorage.app',
      storagePath: 'Users/user-1/uploads/video/unbound/clip.MOV',
    });
    expect(barePathReference).toEqual({
      storagePath: 'Users/user-1/uploads/video/unbound/clip.MOV',
    });
  });
});
