import { describe, expect, it, vi } from 'vitest';
import { FirecrawlImagesTool, extractImages } from '../firecrawl-images.tool.js';
import type { FirecrawlMcpBridgeService } from '../firecrawl-mcp-bridge.service.js';

describe('FirecrawlImagesTool', () => {
  it('uses supported html scrape format and extracts image URLs', async () => {
    const bridge = {
      scrape: vi.fn().mockResolvedValue({
        html: '<html><body><img src="/images/player.jpg" alt="Player headshot"><img data-src="https://cdn.example.com/team.png"></body></html>',
      }),
    } as unknown as FirecrawlMcpBridgeService;
    const tool = new FirecrawlImagesTool(bridge);

    const result = await tool.execute({ url: 'https://example.com/roster', maxImages: 10 });

    expect(result.success).toBe(true);
    expect(bridge.scrape).toHaveBeenCalledWith('https://example.com/roster', {
      formats: ['html'],
    });
    expect((result.data as { images: readonly { url: string; alt?: string }[] }).images).toEqual([
      {
        url: 'https://example.com/images/player.jpg',
        mimeType: 'image/jpeg',
        alt: 'Player headshot',
      },
      {
        url: 'https://cdn.example.com/team.png',
        mimeType: 'image/png',
      },
    ]);
  });

  it('marks invalid URL input as validation failure', async () => {
    const bridge = { scrape: vi.fn() } as unknown as FirecrawlMcpBridgeService;
    const tool = new FirecrawlImagesTool(bridge);

    const result = await tool.execute({ url: 'example.com/roster' });

    expect(result.success).toBe(false);
    expect(result.isValidationError).toBe(true);
    expect(result.error).toBe('URL must start with http:// or https://');
    expect(bridge.scrape).not.toHaveBeenCalled();
  });
});

describe('extractImages', () => {
  it('extracts srcset candidates and deduplicates images', () => {
    const images = extractImages(
      {
        data: {
          html: '<img src="/small.jpg" srcset="/small.jpg 1x, /large.webp 2x" alt="Action shot">',
        },
      },
      10,
      'https://example.com/gallery/'
    );

    expect(images).toEqual([
      {
        url: 'https://example.com/small.jpg',
        mimeType: 'image/jpeg',
        alt: 'Action shot',
      },
      {
        url: 'https://example.com/large.webp',
        mimeType: 'image/webp',
        alt: 'Action shot',
      },
    ]);
  });
});
