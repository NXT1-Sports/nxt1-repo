/**
 * @fileoverview Unit Tests — Firecrawl social domain block
 *
 * Verifies that FirecrawlScrapeTool and FirecrawlExtractTool reject social
 * media URLs at the code level (before any API call is made) and return a
 * corrective error message pointing to the right tool.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { FirecrawlScrapeTool } from '../firecrawl-scrape.tool.js';
import { FirecrawlExtractTool } from '../firecrawl-extract.tool.js';
import type { ToolExecutionContext } from '../../../../base.tool.js';

const TEST_CONTEXT: ToolExecutionContext = {
  userId: 'user-123',
  threadId: 'thread-456',
};

const SOCIAL_URLS = [
  'https://x.com/athlete/status/1234567890',
  'https://www.twitter.com/athlete',
  'https://instagram.com/p/ABC123/',
  'https://www.instagram.com/reel/DEF456/',
  'https://tiktok.com/@athlete/video/789',
  'https://facebook.com/athlete',
  'https://threads.net/@athlete',
];

const mockBridge = {
  scrape: vi.fn(),
  extract: vi.fn(),
  map: vi.fn(),
  crawl: vi.fn(),
};

describe('FirecrawlScrapeTool — social domain block', () => {
  let tool: FirecrawlScrapeTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new FirecrawlScrapeTool(mockBridge as never, undefined as never);
  });

  for (const url of SOCIAL_URLS) {
    it(`blocks ${new URL(url).hostname}`, async () => {
      const result = await tool.execute({ url, format: 'markdown' }, TEST_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Must NOT have called Firecrawl API
      expect(mockBridge.scrape).not.toHaveBeenCalled();
    });
  }

  it('does NOT block non-social URLs', async () => {
    mockBridge.scrape.mockResolvedValue({ data: { markdown: '# Content' } });

    const result = await tool.execute(
      { url: 'https://gophersports.com/roster', format: 'markdown' },
      TEST_CONTEXT
    );

    expect(mockBridge.scrape).toHaveBeenCalledTimes(1);
    // Result may succeed or fail based on mock — the key is no early rejection
    expect(result.error ?? '').not.toMatch(/social/i);
  });

  it('returns corrective example pointing to scrape_twitter for x.com', async () => {
    const result = await tool.execute(
      { url: 'https://x.com/athlete/status/1234567890', format: 'markdown' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/scrape_twitter|twitter/i);
  });

  it('returns corrective example pointing to scrape_instagram for instagram.com', async () => {
    const result = await tool.execute(
      { url: 'https://instagram.com/p/ABC123/', format: 'markdown' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/scrape_instagram|instagram/i);
  });
});

describe('FirecrawlExtractTool — social domain block', () => {
  let tool: FirecrawlExtractTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new FirecrawlExtractTool(mockBridge as never);
  });

  it('blocks x.com before calling extract API', async () => {
    const result = await tool.execute(
      {
        urls: ['https://x.com/athlete'],
        prompt: 'extract profile info',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(mockBridge.extract).not.toHaveBeenCalled();
  });

  it('does NOT block public web pages', async () => {
    mockBridge.extract.mockResolvedValue({ data: { name: 'John Doe' } });

    await tool.execute(
      { urls: ['https://rivals.com/news/article-123'], prompt: 'extract article' },
      TEST_CONTEXT
    );

    expect(mockBridge.extract).toHaveBeenCalledTimes(1);
  });
});
