import { describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => {
  const productionFile = { getSignedUrl: vi.fn() };
  const stagingFile = { getSignedUrl: vi.fn() };
  const productionBucket = { file: vi.fn(() => productionFile) };
  const stagingBucket = { file: vi.fn(() => stagingFile) };

  return {
    productionFile,
    stagingFile,
    productionBucket,
    stagingBucket,
    defaultStorage: { bucket: vi.fn(() => productionBucket) },
    stagingStorage: { bucket: vi.fn(() => stagingBucket) },
    getSignedUrlWithTimeout: vi.fn((getSignedUrlFn: () => Promise<[string]>) => getSignedUrlFn()),
    createSignedUrlLocally: vi.fn(() => null as string | null),
  };
});

vi.mock('../../../../../utils/firebase.js', () => ({
  storage: storageMocks.defaultStorage,
}));

vi.mock('../../../../../utils/firebase-staging.js', () => ({
  stagingStorage: storageMocks.stagingStorage,
}));

vi.mock('../../../../../utils/gcs-signed-url.js', () => ({
  getSignedUrlWithTimeout: storageMocks.getSignedUrlWithTimeout,
  createSignedUrlLocally: storageMocks.createSignedUrlLocally,
}));

import { MediaTransportResolverService } from '../media-transport-resolver.service.js';

const resetStorageMocks = (): void => {
  storageMocks.productionFile.getSignedUrl.mockReset();
  storageMocks.stagingFile.getSignedUrl.mockReset();
  storageMocks.productionBucket.file.mockClear();
  storageMocks.stagingBucket.file.mockClear();
  storageMocks.defaultStorage.bucket.mockClear();
  storageMocks.stagingStorage.bucket.mockClear();
  storageMocks.getSignedUrlWithTimeout.mockClear();
  storageMocks.createSignedUrlLocally.mockClear();
};

describe('MediaTransportResolverService', () => {
  it('keeps directly portable MP4 URLs unchanged', async () => {
    resetStorageMocks();
    const cloudflareBridge = {
      getDownloadLinks: vi.fn(),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl: 'https://cdn.example.com/highlight.mp4',
    });

    expect(result).toEqual({
      url: 'https://cdn.example.com/highlight.mp4',
      source: 'direct',
    });
    expect(cloudflareBridge.getDownloadLinks).not.toHaveBeenCalled();
    expect(cloudflareBridge.enableDownload).not.toHaveBeenCalled();
  });

  it('signs unsigned staging Firebase MP4 URLs before processing', async () => {
    resetStorageMocks();
    storageMocks.stagingFile.getSignedUrl.mockResolvedValue(['https://signed.example/staging.mp4']);
    const cloudflareBridge = {
      getDownloadLinks: vi.fn(),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl:
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/media/staged/video/runway-output.mp4',
      executionContext: {
        userId: 'user-123',
        threadId: 'thread-456',
        environment: 'staging',
      },
    });

    expect(result).toEqual({
      url: 'https://signed.example/staging.mp4',
      source: 'direct',
    });
    expect(storageMocks.stagingStorage.bucket).toHaveBeenCalledWith(
      'nxt-1-staging-v2.firebasestorage.app'
    );
    expect(storageMocks.stagingBucket.file).toHaveBeenCalledWith(
      'Users/user-123/threads/thread-456/media/staged/video/runway-output.mp4'
    );
    expect(storageMocks.defaultStorage.bucket).not.toHaveBeenCalled();
  });

  it('refreshes Firebase token URLs when fresh signing is preferred', async () => {
    resetStorageMocks();
    storageMocks.stagingFile.getSignedUrl.mockResolvedValue(['https://signed.example/fresh.jpg']);
    const cloudflareBridge = {
      getDownloadLinks: vi.fn(),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl:
        'https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/Users%2Fuser-123%2Fthreads%2Fthread-456%2Fmedia%2Fstaged%2Fvideo%2Fthumbnail.jpg?alt=media&token=stale-token',
      preferFreshFirebaseSignedUrl: true,
      executionContext: {
        userId: 'user-123',
        threadId: 'thread-456',
        environment: 'staging',
      },
    });

    expect(result).toEqual({
      url: 'https://signed.example/fresh.jpg',
      source: 'direct',
    });
    expect(storageMocks.stagingStorage.bucket).toHaveBeenCalledWith(
      'nxt-1-staging-v2.firebasestorage.app'
    );
  });

  it('re-signs expired staging Firebase signed URLs before processing', async () => {
    resetStorageMocks();
    storageMocks.stagingFile.getSignedUrl.mockResolvedValue([
      'https://signed.example/staging-refreshed.mp4',
    ]);
    const cloudflareBridge = {
      getDownloadLinks: vi.fn(),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl:
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/media/staged/video/runway-output.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20240101T000000Z&X-Goog-Expires=60&X-Goog-Signature=stale',
      executionContext: {
        userId: 'user-123',
        threadId: 'thread-456',
        environment: 'staging',
      },
    });

    expect(result).toEqual({
      url: 'https://signed.example/staging-refreshed.mp4',
      source: 'direct',
    });
    expect(storageMocks.stagingStorage.bucket).toHaveBeenCalledWith(
      'nxt-1-staging-v2.firebasestorage.app'
    );
  });

  it('rejects production Firebase bucket URLs in staging contexts', async () => {
    resetStorageMocks();
    const cloudflareBridge = {
      getDownloadLinks: vi.fn(),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);
    const sourceUrl =
      'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Users/user-123/threads/thread-456/media/runway-output.mp4';

    const result = await service.resolveProcessingUrl({
      sourceUrl,
      executionContext: {
        userId: 'user-123',
        threadId: 'thread-456',
        environment: 'staging',
      },
    });

    expect(result).toEqual({
      url: sourceUrl,
      source: 'unchanged',
    });
    expect(storageMocks.stagingStorage.bucket).not.toHaveBeenCalled();
    expect(storageMocks.defaultStorage.bucket).not.toHaveBeenCalled();
  });

  it('resolves an explicit Cloudflare video ID before trusting a signed Firebase placeholder URL', async () => {
    resetStorageMocks();
    const cloudflareBridge = {
      getDownloadLinks: vi.fn().mockResolvedValue({
        default: {
          url: 'https://customer.example.cloudflarestream.com/video-abc/downloads/default.mp4',
          status: 'ready',
        },
      }),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl:
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/media/staged/video/1779287684553-b1aa23127cb752e1-video-abc.bin?X-Goog-Signature=signed',
      cloudflareVideoId: 'video-abc',
    });

    expect(result).toEqual({
      url: 'https://customer.example.cloudflarestream.com/video-abc/downloads/default.mp4',
      source: 'cloudflare_download',
      cloudflareVideoId: 'video-abc',
    });
    expect(cloudflareBridge.getDownloadLinks).toHaveBeenCalledWith('video-abc');
  });

  it('recovers a Cloudflare Stream ID embedded in a staged placeholder filename', async () => {
    resetStorageMocks();
    const cloudflareBridge = {
      getDownloadLinks: vi.fn().mockResolvedValue({
        default: {
          url: 'https://customer.example.cloudflarestream.com/8c72670e15519099333c03359dd39b98/downloads/default.mp4',
          status: 'ready',
        },
      }),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl:
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/user-123/threads/thread-456/media/staged/video/1779287684553-b1aa23127cb752e1-8c72670e15519099333c03359dd39b98.bin?X-Goog-Signature=signed',
    });

    expect(result).toEqual({
      url: 'https://customer.example.cloudflarestream.com/8c72670e15519099333c03359dd39b98/downloads/default.mp4',
      source: 'cloudflare_download',
      cloudflareVideoId: '8c72670e15519099333c03359dd39b98',
    });
    expect(cloudflareBridge.getDownloadLinks).toHaveBeenCalledWith(
      '8c72670e15519099333c03359dd39b98'
    );
  });

  it('does not resolve Cloudflare IDs from Firebase placeholders outside the user/thread scope', async () => {
    resetStorageMocks();
    const cloudflareBridge = {
      getDownloadLinks: vi.fn(),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);
    const sourceUrl =
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/other-user/threads/thread-456/media/staged/video/1779287684553-b1aa23127cb752e1-8c72670e15519099333c03359dd39b98.bin?X-Goog-Signature=signed';

    const result = await service.resolveProcessingUrl({
      sourceUrl,
      executionContext: {
        userId: 'user-123',
        threadId: 'thread-456',
        environment: 'staging',
      },
    });

    expect(result).toEqual({
      url: sourceUrl,
      source: 'unchanged',
      cloudflareVideoId: '8c72670e15519099333c03359dd39b98',
    });
    expect(cloudflareBridge.getDownloadLinks).not.toHaveBeenCalled();
  });

  it('resolves Cloudflare watch URLs to downloadable MP4 links', async () => {
    resetStorageMocks();
    const cloudflareBridge = {
      getDownloadLinks: vi.fn().mockResolvedValue({
        default: {
          url: 'https://customer.example.cloudflarestream.com/video-123/downloads/default.mp4',
          status: 'ready',
        },
      }),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl: 'https://watch.cloudflarestream.com/video-123',
    });

    expect(result).toEqual({
      url: 'https://customer.example.cloudflarestream.com/video-123/downloads/default.mp4',
      source: 'cloudflare_download',
      cloudflareVideoId: 'video-123',
    });
    expect(cloudflareBridge.getDownloadLinks).toHaveBeenCalledWith('video-123');
    expect(cloudflareBridge.enableDownload).not.toHaveBeenCalled();
  });

  it('does not trigger Cloudflare download rendering when reuse_ready_only is requested', async () => {
    resetStorageMocks();
    const cloudflareBridge = {
      getDownloadLinks: vi.fn().mockResolvedValue({
        default: {
          url: null,
          status: 'pending',
        },
      }),
      enableDownload: vi.fn(),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl: 'https://watch.cloudflarestream.com/video-456',
      cloudflareDownloadPolicy: 'reuse_ready_only',
    });

    expect(result).toEqual({
      url: 'https://watch.cloudflarestream.com/video-456',
      source: 'unchanged',
      cloudflareVideoId: 'video-456',
    });
    expect(cloudflareBridge.getDownloadLinks).toHaveBeenCalledWith('video-456');
    expect(cloudflareBridge.enableDownload).not.toHaveBeenCalled();
  });

  it('returns unchanged URL when Cloudflare download cannot be resolved and staging context is absent', async () => {
    resetStorageMocks();
    const cloudflareBridge = {
      getDownloadLinks: vi.fn().mockRejectedValue(new Error('not ready')),
      enableDownload: vi.fn().mockRejectedValue(new Error('failed')),
    };

    const service = new MediaTransportResolverService(cloudflareBridge as never);

    const result = await service.resolveProcessingUrl({
      sourceUrl: 'https://watch.cloudflarestream.com/video-999',
      fallbackToFirebaseStaging: true,
    });

    expect(result).toEqual({
      url: 'https://watch.cloudflarestream.com/video-999',
      source: 'unchanged',
      cloudflareVideoId: 'video-999',
    });
  });
});
