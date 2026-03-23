/**
 * @fileoverview Unit Tests — ReadWebpageTool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Tests the tool shell in isolation by mocking FirecrawlService.
 * Verifies input validation, SSRF blocking, successful scraping,
 * thin-content handling, and error wrapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReadWebpageTool } from '../read-webpage.tool.js';
import type { FirecrawlService, FirecrawlScrapeResult } from '../firecrawl.service.js';

// ─── Mock FirecrawlService ──────────────────────────────────────────────────

function createMockFirecrawl(
  markdown:
    | string
    | null = '# Test Page\n\nThis is a test page with enough content to pass the minimum length check easily.'
): FirecrawlService {
  const scrapeText = markdown
    ? vi.fn<[], Promise<FirecrawlScrapeResult>>().mockResolvedValue({
        url: 'https://example.com/',
        markdown,
        title: 'Test Page',
        scrapedInMs: 250,
      })
    : vi
        .fn<[], Promise<FirecrawlScrapeResult>>()
        .mockRejectedValue(new Error('Firecrawl scrape failed'));

  return { scrapeText, scrapeWithActions: vi.fn(), search: vi.fn() } as unknown as FirecrawlService;
}

const SAMPLE_MARKDOWN =
  '# Jalen Smith — MaxPreps\n\n' +
  'Position: PG | Class: 2026 | Height: 6\'2"\n\n' +
  '## Season Stats\n\n| PPG | APG | SPG |\n|-----|-----|-----|\n| 18.5 | 6.2 | 2.1 |';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReadWebpageTool', () => {
  let tool: ReadWebpageTool;
  let mockFirecrawl: FirecrawlService;

  beforeEach(() => {
    mockFirecrawl = createMockFirecrawl(SAMPLE_MARKDOWN);
    tool = new ReadWebpageTool(mockFirecrawl);
  });

  // ── Metadata ──────────────────────────────────────────────────────────

  describe('metadata', () => {
    it('should have the correct tool name', () => {
      expect(tool.name).toBe('read_webpage');
    });

    it('should not be a mutation', () => {
      expect(tool.isMutation).toBe(false);
    });

    it('should have url as a required parameter', () => {
      const params = tool.parameters as Record<string, unknown>;
      expect(params['required']).toContain('url');
    });

    it('should allow expected agents', () => {
      expect(tool.allowedAgents).toContain('data_coordinator');
      expect(tool.allowedAgents).toContain('performance_coordinator');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');
      expect(tool.allowedAgents).toContain('general');
      expect(tool.allowedAgents).toContain('brand_media_coordinator');
    });

    it('should not allow compliance_coordinator', () => {
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

  // ── SSRF Protection ───────────────────────────────────────────────────

  describe('SSRF protection', () => {
    it('should block localhost', async () => {
      const result = await tool.execute({ url: 'http://localhost:3000' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked host');
    });

    it('should block private IPs', async () => {
      const result = await tool.execute({ url: 'http://127.0.0.1/admin' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked host');
    });

    it('should block cloud metadata endpoints', async () => {
      const result = await tool.execute({ url: 'http://169.254.169.254/latest/meta-data' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked host');
    });

    it('should block non-HTTP protocols', async () => {
      const result = await tool.execute({ url: 'file:///etc/passwd' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked protocol');
    });

    it('should block social media platforms', async () => {
      const result = await tool.execute({ url: 'https://www.instagram.com/user123' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('social media');
    });

    it('should not call Firecrawl when URL is blocked', async () => {
      await tool.execute({ url: 'http://localhost:3000' });
      expect(mockFirecrawl.scrapeText).not.toHaveBeenCalled();
    });
  });

  // ── Successful Scraping ───────────────────────────────────────────────

  describe('successful scraping', () => {
    it('should delegate to FirecrawlService and return markdown data', async () => {
      const result = await tool.execute({ url: 'https://www.maxpreps.com/athlete/jalen/abc' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['url']).toBe('https://example.com/');
      expect(data['title']).toBe('Test Page');
      expect(data['scrapedInMs']).toBe(250);
      expect(data['markdownContent']).toContain('Jalen Smith');
      expect(data['contentLength']).toBe(SAMPLE_MARKDOWN.length);
    });

    it('should pass the URL to FirecrawlService', async () => {
      await tool.execute({ url: 'https://www.hudl.com/profile/123' });
      expect(mockFirecrawl.scrapeText).toHaveBeenCalledWith('https://www.hudl.com/profile/123');
    });

    it('should trim the URL before passing to Firecrawl', async () => {
      await tool.execute({ url: '  https://hudl.com/profile/456  ' });
      expect(mockFirecrawl.scrapeText).toHaveBeenCalledWith('https://hudl.com/profile/456');
    });
  });

  // ── Thin Content Handling ─────────────────────────────────────────────

  describe('thin content handling', () => {
    it('should return error when markdown is too short', async () => {
      const thin = createMockFirecrawl('Short');
      vi.mocked(thin.scrapeText).mockResolvedValue({
        url: 'https://example.com/',
        markdown: 'Short',
        title: '',
        scrapedInMs: 100,
      });
      const thinTool = new ReadWebpageTool(thin);

      const result = await thinTool.execute({ url: 'https://example.com' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('very little content');
    });

    it('should return error when markdown is empty', async () => {
      const empty = createMockFirecrawl('');
      vi.mocked(empty.scrapeText).mockResolvedValue({
        url: 'https://example.com/',
        markdown: '',
        title: '',
        scrapedInMs: 100,
      });
      const emptyTool = new ReadWebpageTool(empty);

      const result = await emptyTool.execute({ url: 'https://example.com' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('very little content');
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should wrap Firecrawl errors as ToolResult failures', async () => {
      const failing = createMockFirecrawl(null);
      const failTool = new ReadWebpageTool(failing);

      const result = await failTool.execute({ url: 'https://example.com' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Firecrawl scrape failed');
    });

    it('should handle non-Error throw values', async () => {
      vi.mocked(mockFirecrawl.scrapeText).mockRejectedValue('string error');

      const result = await tool.execute({ url: 'https://example.com' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to read webpage');
    });
  });
});
