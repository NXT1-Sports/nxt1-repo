import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const ensureFirebaseDownloadUrlMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../utils/logger.js', () => ({
  logger: loggerMock,
}));

vi.mock('../agent-media-lifecycle.service.js', () => ({
  AgentMediaLifecycleService: {
    ensureFirebaseDownloadUrl: ensureFirebaseDownloadUrlMock,
    extractStoragePathFromUrl: (urlInput: string) => {
      try {
        const url = new URL(urlInput);
        if (url.hostname !== 'storage.googleapis.com') return null;
        const parts = url.pathname.split('/').filter(Boolean);
        return parts.length >= 2 ? decodeURIComponent(parts.slice(1).join('/')) : null;
      } catch {
        return null;
      }
    },
  },
}));

import { MediaStagingService } from '../media-staging.service.js';

interface MediaStagingInternals {
  isPlausibleVideoPayload(sample: Buffer): boolean;
  uploadBufferToStorage(params: {
    file: {
      save: (
        buffer: Buffer,
        options: {
          resumable: boolean;
          metadata: {
            contentType: string;
            cacheControl: string;
            metadata: Record<string, string>;
          };
        }
      ) => Promise<unknown>;
    };
    mimeType: string;
    cacheControl: string;
    metadata: Record<string, string>;
    buffer: Buffer;
  }): Promise<void>;
}

describe('MediaStagingService', () => {
  const service = new MediaStagingService() as unknown as MediaStagingInternals;

  beforeEach(() => {
    vi.clearAllMocks();
    ensureFirebaseDownloadUrlMock.mockReset();
  });

  it('accepts MP4 payload signatures', () => {
    const sample = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypmp42'),
      Buffer.alloc(64),
    ]);

    expect(service.isPlausibleVideoPayload(sample)).toBe(true);
  });

  it('rejects html and json payloads staged as video', () => {
    expect(service.isPlausibleVideoPayload(Buffer.from('<!doctype html><html></html>'))).toBe(
      false
    );
    expect(service.isPlausibleVideoPayload(Buffer.from('{"error":"not authorized"}'))).toBe(false);
  });

  it('uploads staged bytes directly to storage with metadata', async () => {
    const file = {
      save: vi.fn().mockResolvedValue(undefined),
    };

    await service.uploadBufferToStorage({
      file: file as never,
      mimeType: 'image/jpeg',
      cacheControl: 'private, max-age=3600',
      metadata: {
        firebaseStorageDownloadTokens: 'token-123',
        stagedBy: 'agent_x',
      },
      buffer: Buffer.from([1, 2, 3]),
    });

    expect(file.save).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), {
      resumable: false,
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'private, max-age=3600',
        metadata: {
          firebaseStorageDownloadTokens: 'token-123',
          stagedBy: 'agent_x',
        },
      },
    });
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
    vi.spyOn(service as never, 'resolveStorage').mockReturnValue({ bucket: () => bucket } as never);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    ensureFirebaseDownloadUrlMock.mockResolvedValue(
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fimage%2Fcopied.jpeg?alt=media&token=live-token'
    );

    const result = await (service as never).stageFromUrl({
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

  it('continues when metadata update hits the known parse-error path', async () => {
    const sourcePath = 'Users/user-123/uploads/image/unbound/original.jpeg';
    const stagedPath = 'Users/user-123/threads/thread-456/media/staged/image';
    const sourceFile = {
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi.fn().mockResolvedValue([{ contentType: 'image/jpeg', size: '88647' }]),
      copy: vi.fn().mockResolvedValue(undefined),
    };
    const stagedFile = {
      setMetadata: vi.fn().mockRejectedValue(new Error('Parse Error')),
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
    vi.spyOn(service as never, 'resolveStorage').mockReturnValue({ bucket: () => bucket } as never);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    ensureFirebaseDownloadUrlMock.mockRejectedValue(new Error('Parse Error'));

    const result = await (service as never).stageFromUrl({
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
    expect(stagedFile.getSignedUrl).toHaveBeenCalled();
    expect(result.signedUrl).toBe('https://signed.example/staged-read');
    expect(loggerMock.info).toHaveBeenCalledWith(
      '[MediaStagingService] Metadata update skipped after successful upload due to known parse-error path',
      expect.objectContaining({
        metadataError: 'Parse Error',
      })
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[MediaStagingService] Falling back to staged signed URL after durable URL mint failed',
      expect.objectContaining({
        error: 'Parse Error',
      })
    );
  });
});
