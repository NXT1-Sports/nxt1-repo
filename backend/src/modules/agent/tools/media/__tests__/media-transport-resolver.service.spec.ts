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

  it('resolves Cloudflare watch URLs to downloadable MP4 links', async () => {
    const cloudflareBridge = {
      getDownloadLinks: vi.fn().mockResolvedValue({
        default: {
          url: 'https://customer.example.cloudflarestream.com/video-123/downloads/default.mp4',
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
