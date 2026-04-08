/**
 * @fileoverview Unit Tests — Cancellation signal propagation through scraping tools
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Verifies that the AbortSignal from ToolExecutionContext is propagated
 * through the scraping pipeline: tool → ScraperService → FirecrawlService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrapeWebpageTool } from '../scrape-webpage.tool.js';
import type { ScraperService } from '../scraper.service.js';
import type { ScrapeResult, ScrapeRequest } from '../scraper.types.js';

// ─── Mock ScraperService ────────────────────────────────────────────────────

function createMockScraper(): ScraperService {
  return {
    scrape: vi.fn(),
    validateUrl: vi.fn(),
  } as unknown as ScraperService;
}

const MOCK_RESULT: ScrapeResult = {
  url: 'https://example.com',
  title: 'Example',
  markdownContent: '# Example\n\nContent.',
  contentLength: 20,
  provider: 'firecrawl',
  scrapedInMs: 100,
  pageData: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ScrapeWebpageTool — signal propagation', () => {
  let tool: ScrapeWebpageTool;
  let mockScraper: ScraperService;

  beforeEach(() => {
    mockScraper = createMockScraper();
    tool = new ScrapeWebpageTool(mockScraper);
    vi.mocked(mockScraper.scrape).mockResolvedValue(MOCK_RESULT);
  });

  it('should pass context.signal to scraper.scrape()', async () => {
    const controller = new AbortController();

    await tool.execute(
      { url: 'https://example.com' },
      { userId: 'u1', threadId: 't1', signal: controller.signal }
    );

    expect(mockScraper.scrape).toHaveBeenCalledOnce();
    const scrapeArg = vi.mocked(mockScraper.scrape).mock.calls[0][0] as ScrapeRequest;
    expect(scrapeArg.signal).toBe(controller.signal);
  });

  it('should pass undefined signal when context has no signal', async () => {
    await tool.execute({ url: 'https://example.com' }, { userId: 'u1' });

    const scrapeArg = vi.mocked(mockScraper.scrape).mock.calls[0][0] as ScrapeRequest;
    expect(scrapeArg.signal).toBeUndefined();
  });

  it('should pass undefined signal when no context is provided', async () => {
    await tool.execute({ url: 'https://example.com' });

    const scrapeArg = vi.mocked(mockScraper.scrape).mock.calls[0][0] as ScrapeRequest;
    expect(scrapeArg.signal).toBeUndefined();
  });

  it('should return error when scraper throws due to aborted signal', async () => {
    vi.mocked(mockScraper.scrape).mockRejectedValue(new Error('Operation cancelled'));
    const controller = new AbortController();
    controller.abort();

    const result = await tool.execute(
      { url: 'https://example.com' },
      { userId: 'u1', signal: controller.signal }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Operation cancelled');
  });
});
