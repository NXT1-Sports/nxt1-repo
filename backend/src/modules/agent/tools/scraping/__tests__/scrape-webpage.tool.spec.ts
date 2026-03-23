/**
 * @fileoverview Unit Tests — ScrapeWebpageTool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Tests the tool shell in isolation by mocking the ScraperService.
 * Verifies input validation, successful delegation, structured data
 * formatting, and error wrapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrapeWebpageTool } from '../scrape-webpage.tool.js';
import type { ScraperService } from '../scraper.service.js';
import type { ScrapeResult } from '../scraper.types.js';
import type { PageStructuredData } from '../page-data.types.js';

// ─── Mock ScraperService ────────────────────────────────────────────────────

function createMockScraper(): ScraperService {
  return {
    scrape: vi.fn(),
    validateUrl: vi.fn(),
  } as unknown as ScraperService;
}

const MOCK_PAGE_DATA: PageStructuredData = {
  title: 'Jalen Smith - MaxPreps',
  description: 'Jalen Smith stats and highlights',
  openGraph: {
    title: 'Jalen Smith - MaxPreps',
    description: 'Jalen Smith stats',
    image: 'https://images.maxpreps.com/jalen.jpg',
    url: 'https://www.maxpreps.com/athlete/jalen-smith/abc123',
    type: 'profile',
    siteName: 'MaxPreps',
  },
  twitterCard: null,
  ldJson: [],
  nextData: { props: { pageProps: { athlete: { firstName: 'Jalen', position: 'PG' } } } },
  nuxtData: null,
  embeddedData: {},
  images: [
    { src: 'https://images.maxpreps.com/jalen.jpg', alt: 'Jalen Smith', source: 'og' as const },
  ],
  videos: [{ src: 'https://www.hudl.com/video/abc123', provider: 'hudl' as const }],
  colors: ['#003366', '#CC0022'],
  hasRichData: true,
};

const MOCK_RESULT: ScrapeResult = {
  url: 'https://www.maxpreps.com/athlete/jalen-smith/abc123',
  title: 'Jalen Smith - MaxPreps',
  markdownContent: '# Jalen Smith\n\nPPG: 18.5 | APG: 6.2',
  contentLength: 42,
  provider: 'firecrawl',
  scrapedInMs: 350,
  pageData: MOCK_PAGE_DATA,
};

const MOCK_RESULT_NO_STRUCTURED: ScrapeResult = {
  url: 'https://example.com/article',
  title: 'Some Article',
  markdownContent: '# Some Article\n\nContent here.',
  contentLength: 30,
  provider: 'firecrawl',
  scrapedInMs: 200,
  pageData: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ScrapeWebpageTool', () => {
  let tool: ScrapeWebpageTool;
  let mockScraper: ScraperService;

  beforeEach(() => {
    mockScraper = createMockScraper();
    tool = new ScrapeWebpageTool(mockScraper);
  });

  // ── Metadata ──────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should have the correct tool name', () => {
      expect(tool.name).toBe('scrape_webpage');
    });

    it('should not be a mutation', () => {
      expect(tool.isMutation).toBe(false);
    });

    it('should have url as a required parameter', () => {
      const params = tool.parameters as Record<string, unknown>;
      expect(params['required']).toContain('url');
    });

    it('should allow performance_coordinator, recruiting_coordinator, general, and brand_media_coordinator agents', () => {
      expect(tool.allowedAgents).toContain('performance_coordinator');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');
      expect(tool.allowedAgents).toContain('general');
      expect(tool.allowedAgents).toContain('brand_media_coordinator');
    });

    it('should not allow the compliance_coordinator agent', () => {
      expect(tool.allowedAgents).not.toContain('compliance_coordinator');
    });
  });

  // ── Input Validation ──────────────────────────────────────────────────

  describe('input validation', () => {
    it('should return error when url is missing', async () => {
      const result = await tool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    it('should return error when url is empty string', async () => {
      const result = await tool.execute({ url: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    it('should return error when url is not a string', async () => {
      const result = await tool.execute({ url: 12345 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    it('should return error when url is whitespace only', async () => {
      const result = await tool.execute({ url: '   ' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });
  });

  // ── Successful Scraping ───────────────────────────────────────────────

  describe('successful scraping', () => {
    it('should delegate to ScraperService and return structured data', async () => {
      vi.mocked(mockScraper.scrape).mockResolvedValue(MOCK_RESULT);

      const result = await tool.execute({
        url: 'https://www.maxpreps.com/athlete/jalen-smith/abc123',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['url']).toBe(MOCK_RESULT.url);
      expect(data['title']).toBe(MOCK_RESULT.title);
      expect(data['markdownContent']).toContain('Jalen Smith');
      expect(data['contentLength']).toBe(42);
      expect(data['provider']).toBe('firecrawl');
      expect(data['scrapedInMs']).toBe(350);
    });

    it('should include structuredData when pageData has rich data', async () => {
      vi.mocked(mockScraper.scrape).mockResolvedValue(MOCK_RESULT);

      const result = await tool.execute({
        url: 'https://www.maxpreps.com/athlete/jalen-smith/abc123',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const structured = data['structuredData'] as Record<string, unknown>;
      expect(structured).not.toBeNull();
      expect(structured['nextData']).toBeDefined();
      expect(structured['openGraph']).toBeDefined();
      expect(structured['images']).toHaveLength(1);
      expect(structured['videos']).toHaveLength(1);
      expect(structured['colors']).toEqual(['#003366', '#CC0022']);
    });

    it('should return null structuredData when no rich data found', async () => {
      vi.mocked(mockScraper.scrape).mockResolvedValue(MOCK_RESULT_NO_STRUCTURED);

      const result = await tool.execute({ url: 'https://example.com/article' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['structuredData']).toBeNull();
    });

    it('should surface embeddedData when available', async () => {
      const hudlModel = { user: { firstName: 'Deshon', positions: 'RB, SB' } };
      const resultWithEmbed: ScrapeResult = {
        ...MOCK_RESULT,
        pageData: {
          ...MOCK_PAGE_DATA,
          nextData: null,
          embeddedData: { __hudlEmbed: { model: hudlModel } },
        },
      };
      vi.mocked(mockScraper.scrape).mockResolvedValue(resultWithEmbed);

      const result = await tool.execute({ url: 'https://www.hudl.com/profile/123' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const structured = data['structuredData'] as Record<string, unknown>;
      expect(structured['embeddedData']).toBeDefined();
      expect(structured['nextData']).toBeUndefined();
    });

    it('should trim the URL before scraping', async () => {
      vi.mocked(mockScraper.scrape).mockResolvedValue(MOCK_RESULT);

      await tool.execute({ url: '  https://hudl.com/profile/123  ' });

      expect(mockScraper.scrape).toHaveBeenCalledWith({
        url: 'https://hudl.com/profile/123',
        maxLength: undefined,
      });
    });

    it('should forward maxLength when provided', async () => {
      vi.mocked(mockScraper.scrape).mockResolvedValue(MOCK_RESULT);

      await tool.execute({ url: 'https://example.com', maxLength: 5000 });

      expect(mockScraper.scrape).toHaveBeenCalledWith({
        url: 'https://example.com',
        maxLength: 5000,
      });
    });

    it('should ignore invalid maxLength values', async () => {
      vi.mocked(mockScraper.scrape).mockResolvedValue(MOCK_RESULT);

      await tool.execute({ url: 'https://example.com', maxLength: -1 });

      expect(mockScraper.scrape).toHaveBeenCalledWith({
        url: 'https://example.com',
        maxLength: undefined,
      });
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should wrap ScraperService errors as ToolResult failures', async () => {
      vi.mocked(mockScraper.scrape).mockRejectedValue(new Error('Blocked host: "localhost"'));

      const result = await tool.execute({ url: 'http://localhost:3000' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Blocked host: "localhost"');
    });

    it('should handle non-Error throw values', async () => {
      vi.mocked(mockScraper.scrape).mockRejectedValue('string error');

      const result = await tool.execute({ url: 'https://example.com' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Scraping failed');
    });

    it('should handle network timeout errors', async () => {
      vi.mocked(mockScraper.scrape).mockRejectedValue(
        new Error(
          'Failed to scrape URL: https://slow-site.com. Both Firecrawl and native fetch failed.'
        )
      );

      const result = await tool.execute({ url: 'https://slow-site.com' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to scrape');
    });
  });
});
