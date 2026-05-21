import { describe, expect, it, vi } from 'vitest';

import { MediaTransportResolverService } from '../media-transport-resolver.service.js';

describe('MediaTransportResolverService', () => {
  it('keeps directly portable MP4 URLs unchanged', async () => {
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

  it('resolves an explicit Cloudflare video ID before trusting a signed Firebase placeholder URL', async () => {
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

  it('returns unchanged URL when Cloudflare download cannot be resolved and staging context is absent', async () => {
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
