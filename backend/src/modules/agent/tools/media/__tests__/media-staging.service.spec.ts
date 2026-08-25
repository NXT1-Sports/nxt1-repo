import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const ensureFirebaseDownloadUrlMock = vi.hoisted(() => vi.fn());
const saveBufferAndMakePublicMock = vi.hoisted(() => vi.fn());
const defaultBucketMock = vi.hoisted(() => vi.fn());
const stagingBucketMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../utils/logger.js', () => ({
  logger: loggerMock,
}));

vi.mock('../../../../../utils/firebase.js', () => ({
  storage: {
    bucket: defaultBucketMock,
  },
}));

vi.mock('../../../../../utils/firebase-staging.js', () => ({
  stagingStorage: {
    bucket: stagingBucketMock,
  },
}));

vi.mock('../agent-media-lifecycle.service.js', () => ({
  AgentMediaLifecycleService: {
    ensureFirebaseDownloadUrl: ensureFirebaseDownloadUrlMock,
    saveBufferAndMakePublic: saveBufferAndMakePublicMock,
    extractStoragePathFromUrl: (urlInput: string) => {
      try {
        const url = new URL(urlInput);
        if (url.hostname === 'storage.googleapis.com') {
          const parts = url.pathname.split('/').filter(Boolean);
          return parts.length >= 2 ? decodeURIComponent(parts.slice(1).join('/')) : null;
        }
        if (url.hostname === 'firebasestorage.googleapis.com') {
          const match = url.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
          return match?.[1] ? decodeURIComponent(match[1]) : null;
        }
        return null;
      } catch {
        return null;
      }
    },
  },
}));

import { MediaStagingService } from '../media-staging.service.js';

interface MediaStagingInternals {
  stageFromUrl(request: {
    readonly sourceUrl: string;
    readonly staging: {
      readonly userId: string;
      readonly threadId: string;
    };
    readonly environment: 'staging';
    readonly mediaKind: 'image' | 'video';
    readonly fileName: string;
  }): Promise<{
    readonly signedUrl: string;
    readonly storagePath: string;
    readonly mimeType: string;
    readonly mediaKind: string;
    readonly sizeBytes: number;
  }>;
  resolveStorage(environment?: string): { bucket: () => unknown };
  isPlausibleVideoPayload(sample: Buffer): boolean;
  uploadBufferToStorage(params: {
    bucket: unknown;
    storagePath: string;
    mimeType: string;
    cacheControl: string;
    buffer: Buffer;
    signedUrlTtlMs?: number;
  }): Promise<{ readonly signedUrl: string }>;
}

describe('MediaStagingService', () => {
  let internals: MediaStagingInternals;

  beforeEach(() => {
    vi.clearAllMocks();
    internals = new MediaStagingService() as unknown as MediaStagingInternals;
    ensureFirebaseDownloadUrlMock.mockReset();
    saveBufferAndMakePublicMock.mockReset();
    defaultBucketMock.mockReset();
    stagingBucketMock.mockReset();
  });

  it('accepts MP4 payload signatures', () => {
    const sample = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(64),
    ]);

    expect(internals.isPlausibleVideoPayload(sample)).toBe(true);
  });

  it('rejects html and json payloads staged as video', () => {
    expect(internals.isPlausibleVideoPayload(Buffer.from('<!doctype html><html></html>'))).toBe(
      false
    );
    expect(internals.isPlausibleVideoPayload(Buffer.from('{"error":"not authorized"}'))).toBe(
      false
    );
  });

  it('uploads staged bytes through the durable Firebase media lifecycle path', async () => {
    const bucket = { name: 'nxt-1-staging-v2.firebasestorage.app', file: vi.fn() };
    saveBufferAndMakePublicMock.mockResolvedValue({
      url: 'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fimage%2Fstaged.jpeg?alt=media&token=token-123',
    });

    const result = await internals.uploadBufferToStorage({
      bucket,
      storagePath: 'Users/user-123/threads/thread-456/media/staged/image/staged.jpeg',
      mimeType: 'image/jpeg',
      cacheControl: 'private, max-age=3600',
      buffer: Buffer.from([1, 2, 3]),
    });

    expect(saveBufferAndMakePublicMock).toHaveBeenCalledWith({
      bucket,
      storagePath: 'Users/user-123/threads/thread-456/media/staged/image/staged.jpeg',
      buffer: Buffer.from([1, 2, 3]),
      mimeType: 'image/jpeg',
      cacheControl: 'private, max-age=3600',
      signedUrlTtlMs: undefined,
    });
    expect(result.signedUrl).toContain('firebasestorage.googleapis.com');
    expect(result.signedUrl).toContain('token-123');
  });

  it('stages owned Firebase media by storage copy instead of HTTP fetch', async () => {
    const sourcePath = 'Users/user-123/uploads/image/unbound/original.jpeg';
    const stagedPath = 'Users/user-123/threads/thread-456/media/staged/image';
    const sourceFile = {
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi.fn().mockResolvedValue([
        {
          contentType: 'image/jpeg',
          size: '17729181',
          metadata: { firebaseStorageDownloadTokens: 'existing-token' },
        },
      ]),
      copy: vi.fn().mockResolvedValue(undefined),
    };
    const stagedFile = {
      setMetadata: vi.fn().mockResolvedValue(undefined),
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example/staged-read']),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const bucket = {
      name: 'nxt-1-staging-v2.firebasestorage.app',
      file: vi.fn((path: string) => {
        if (path === sourcePath) return sourceFile;
        if (path.startsWith(stagedPath)) return stagedFile;
        return stagedFile;
      }),
    };
    internals.resolveStorage = vi.fn(() => ({ bucket: () => bucket }));
    stagingBucketMock.mockImplementation((name?: string) => {
      expect(name).toBe(bucket.name);
      return bucket;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    ensureFirebaseDownloadUrlMock.mockResolvedValue(
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fimage%2Fcopied.jpeg?alt=media&token=live-token'
    );

    const result = await internals.stageFromUrl({
      sourceUrl:
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/uploads/image/unbound/original.jpeg?X-Goog-Signature=signed',
      staging: {
        userId: 'user-123',
        threadId: 'thread-456',
      },
      environment: 'staging',
      mediaKind: 'image',
      fileName: 'crown_point_football_player.jpeg',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sourceFile.copy).toHaveBeenCalledWith(stagedFile);
    expect(stagedFile.setMetadata).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        signedUrl:
          'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fimage%2Fcopied.jpeg?alt=media&token=live-token',
        mimeType: 'image/jpeg',
        mediaKind: 'image',
        sizeBytes: 17729181,
      })
    );
  });

  it('falls back to download and durable Firebase upload when owned Firebase copy fails', async () => {
    const sourcePath = 'Users/user-123/uploads/video/unbound/original.mp4';
    const stagedPath = 'Users/user-123/threads/thread-456/media/staged/video';
    const sourceBuffer = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(20 * 1024),
    ]);
    const sourceFile = {
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi.fn().mockResolvedValue([
        {
          contentType: 'video/mp4',
          size: String(sourceBuffer.length),
          metadata: {},
        },
      ]),
      copy: vi.fn().mockRejectedValue(new Error('Parse Error')),
      download: vi.fn().mockResolvedValue([sourceBuffer]),
    };
    const stagedFile = {
      setMetadata: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const bucket = {
      name: 'nxt-1-staging-v2.firebasestorage.app',
      file: vi.fn((path: string) => {
        if (path === sourcePath) return sourceFile;
        if (path.startsWith(stagedPath)) return stagedFile;
        return stagedFile;
      }),
    };
    internals.resolveStorage = vi.fn(() => ({ bucket: () => bucket }));
    stagingBucketMock.mockImplementation((name?: string) => {
      expect(name).toBe(bucket.name);
      return bucket;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    saveBufferAndMakePublicMock.mockResolvedValue({
      url: 'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fvideo%2Fcopied.mp4?alt=media&token=fallback-token',
    });

    const result = await internals.stageFromUrl({
      sourceUrl:
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/uploads/video/unbound/original.mp4?X-Goog-Signature=signed',
      staging: {
        userId: 'user-123',
        threadId: 'thread-456',
      },
      environment: 'staging',
      mediaKind: 'video',
      fileName: 'highlight.mp4',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sourceFile.copy).toHaveBeenCalledWith(stagedFile);
    expect(sourceFile.download).toHaveBeenCalled();
    expect(saveBufferAndMakePublicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket,
        buffer: sourceBuffer,
        mimeType: 'video/mp4',
        cacheControl: 'private, max-age=3600',
      })
    );
    expect(ensureFirebaseDownloadUrlMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        signedUrl:
          'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fvideo%2Fcopied.mp4?alt=media&token=fallback-token',
        storagePath: expect.stringContaining(
          'Users/user-123/threads/thread-456/media/staged/video/'
        ),
        mimeType: 'video/mp4',
        mediaKind: 'video',
        sizeBytes: sourceBuffer.length,
      })
    );
  });

  it('stages owned Firebase media across source buckets without falling back to HTTP fetch', async () => {
    const productionBucketName = 'nxt-1-v2.firebasestorage.app';
    const stagingBucketName = 'nxt-1-staging-v2.firebasestorage.app';
    const sourcePath = 'Users/user-123/threads/legacy-thread/media/staged/video/runway-output.mp4';
    const sourceFile = {
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi.fn().mockResolvedValue([
        {
          contentType: 'video/mp4',
          size: '24576',
          metadata: { firebaseStorageDownloadTokens: 'legacy-token' },
        },
      ]),
      copy: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(),
    };
    const stagedFile = {
      setMetadata: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const sourceBucket = {
      name: productionBucketName,
      file: vi.fn((path: string) => {
        expect(path).toBe(sourcePath);
        return sourceFile;
      }),
    };
    const targetBucket = {
      name: stagingBucketName,
      file: vi.fn(() => stagedFile),
    };

    internals.resolveStorage = vi.fn(() => ({ bucket: () => targetBucket }));
    defaultBucketMock.mockImplementation((name?: string) => {
      expect(name).toBe(productionBucketName);
      return sourceBucket;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    ensureFirebaseDownloadUrlMock.mockResolvedValue(
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fvideo%2Frunway-output.mp4?alt=media&token=staged-token'
    );

    const result = await internals.stageFromUrl({
      sourceUrl:
        'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Flegacy-thread%2Fmedia%2Fstaged%2Fvideo%2Frunway-output.mp4?alt=media&token=legacy-token',
      staging: {
        userId: 'user-123',
        threadId: 'thread-456',
      },
      environment: 'staging',
      mediaKind: 'video',
      fileName: 'runway-output.mp4',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sourceFile.copy).toHaveBeenCalledWith(stagedFile);
    expect(sourceFile.download).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        signedUrl:
          'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fvideo%2Frunway-output.mp4?alt=media&token=staged-token',
        mimeType: 'video/mp4',
        mediaKind: 'video',
        sizeBytes: 24576,
      })
    );
  });
});
