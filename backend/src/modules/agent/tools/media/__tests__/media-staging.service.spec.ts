import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: loggerMock,
}));

import { MediaStagingService } from '../media-staging.service.js';

interface MediaStagingInternals {
  isPlausibleVideoPayload(sample: Buffer): boolean;
  uploadBufferViaSignedPut(params: {
    file: { getSignedUrl: (options: unknown) => Promise<[string]> };
    mimeType: string;
    cacheControl: string;
    buffer: Buffer;
  }): Promise<void>;
}

describe('MediaStagingService', () => {
  const service = new MediaStagingService() as unknown as MediaStagingInternals;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('uploads staged bytes through a signed PUT', async () => {
    const file = {
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example/upload']),
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await service.uploadBufferViaSignedPut({
      file: file as never,
      mimeType: 'image/jpeg',
      cacheControl: 'private, max-age=3600',
      buffer: Buffer.from([1, 2, 3]),
    });

    expect(file.getSignedUrl).toHaveBeenCalledWith({
      action: 'write',
      expires: expect.any(Date),
      version: 'v4',
      contentType: 'image/jpeg',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://signed.example/upload', {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
      body: new Uint8Array([1, 2, 3]),
    });
  });

  it('stages owned Firebase media by storage copy instead of HTTP fetch', async () => {
    const sourcePath = 'Users/user-123/uploads/image/unbound/original.jpeg';
    const stagedPath = 'Users/user-123/threads/thread-456/media/staged/image';
    const sourceFile = {
      exists: vi.fn().mockResolvedValue([true]),
      getMetadata: vi.fn().mockResolvedValue([{ contentType: 'image/jpeg', size: '17729181' }]),
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
    expect(stagedFile.setMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'image/jpeg',
        cacheControl: 'private, max-age=3600',
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        signedUrl: 'https://signed.example/staged-read',
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
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});
