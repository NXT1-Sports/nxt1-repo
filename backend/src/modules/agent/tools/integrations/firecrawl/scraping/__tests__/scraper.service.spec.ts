/**
 * @fileoverview Unit Tests — ScraperService
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/scraping
 *
 * Tests the 2-tier scraping engine in isolation by injecting a mock Firecrawl
 * MCP bridge (primary path) and mocking `fetch` (fallback path).
 * Covers URL validation (SSRF prevention), Firecrawl-first scraping with both
 * markdown + HTML in one call, direct fetch fallback, structured data
 * extraction integration, content truncation, and error handling.
 *
 *   - `mockMcpBridge` controls the Firecrawl MCP bridge (primary)
 *   - `mockFetch` controls the direct HTML fetch (fallback only)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScraperService } from '../scraper.service.js';
import type { FirecrawlMcpBridgeService } from '../../mcp/firecrawl-mcp-bridge.service.js';
import { MAX_SCRAPE_CONTENT_LENGTH } from '../scraper.types.js';

// ─── Global fetch mock ──────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ─── Fixtures ───────────────────────────────────────────────────────────────

const SAMPLE_MARKDOWN = `# Jalen Smith Stats\n\nPosition: Point Guard\nHeight: 6'1"\nWeight: 175 lbs\n\n## Season Stats\n\n| GP | PPG | APG | RPG |\n|----|-----|-----|-----|\n| 28 | 18.5 | 6.2 | 4.1 |`;

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>MaxPreps - Jalen Smith</title></head>
<body>
<nav>Navigation here</nav>
<script>var x = 1;</script>
<style>.hidden { display: none; }</style>
<main>
<h1>Jalen Smith Stats</h1>
<p>Position: Point Guard</p>
<p>Height: 6'1"</p>
<table><tr><td>PPG</td><td>18.5</td></tr></table>
</main>
<footer>Footer content</footer>
</body>
</html>`;

const SAMPLE_HTML_WITH_NEXT_DATA = `<!DOCTYPE html>
<html>
<head>
<title>MaxPreps - Deshon Yancey</title>
<meta property="og:title" content="Deshon Yancey - RB" />
<meta property="og:image" content="https://images.maxpreps.com/photo.jpg" />
</head>
<body>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"athlete":{"firstName":"Deshon","lastName":"Yancey","primaryPosition":"RB","heightFeet":5,"heightInches":8,"weight":150,"graduatingClass":"2027"}}}}</script>
<main><h1>Deshon Yancey</h1></main>
</body>
</html>`;

const SAMPLE_HTML_WITH_EMBEDDED_DATA = `<!DOCTYPE html>
<html>
<head>
<title>Deshon Yancey - Hudl</title>
<meta property="og:title" content="Deshon Yancey on Hudl" />
</head>
<body>
<script>window.__hudlEmbed={"data":{"pageData":{"athlete":{"athleteId":"19341470","profileUrl":"https://www.hudl.com/profile/19341470/deshon-yancey","sportId":1}}},"model":{"user":{"firstName":"Deshon","lastName":"Yancey","primaryColor":"222222","secondaryColor":"ff1e1e","positions":"RB, SB","graduationYear":2027,"description":"Running back and slot back at Mt Zion High School in Jonesboro Georgia. Class of 2027 prospect with 4.5 forty yard dash time."},"about":{"overview":{"organization":"Mt. Zion High School","location":"Jonesboro, GA","weight":"154lbs","twitter":"Deshon4Yancey","fortyYardDash":"4.55","shuttleRun":"4.21"}},"highlights":[{"title":"Junior Season Highlights","videoId":"abc123"}]}};</script>
<main><h1>Deshon Yancey</h1></main>
</body>
</html>`;

const SAMPLE_HTML_WITH_HUDL_CDN_VIDEOS = `<!DOCTYPE html>
<html>
<head>
<title>Ryder Lyons - Hudl</title>
<meta property="og:title" content="Ryder Lyons on Hudl" />
</head>
<body>
<script>window.__hudlEmbed={"highlights":[
{"videoUrl":"https://vi.hudl.com/p-highlights/User/16389887/6121dfa50dc02a09e0c6b671/bebbc27c_360.mp4?v=2","title":"Junior Highlights"},
{"videoUrl":"https://vi.hudl.com/p-highlights/User/16389887/6121dfa50dc02a09e0c6b671/bebbc27c_480.mp4?v=2","title":"Junior Highlights"},
{"videoUrl":"https://vi.hudl.com/p-highlights/User/16389887/6121dfa50dc02a09e0c6b671/bebbc27c_720.mp4?v=2","title":"Junior Highlights"},
{"videoUrl":"https://vc.hudl.com/p-highlights/User/16389887/7234ef120abc34f1a2d8e982/cc11dd22_360.mp4?v=1","title":"Sophomore Season"},
{"videoUrl":"https://vc.hudl.com/p-highlights/User/16389887/7234ef120abc34f1a2d8e982/cc11dd22_720.mp4?v=1","title":"Sophomore Season"}
]};</script>
<main><h1>Ryder Lyons</h1></main>
</body>
</html>`;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Mock a successful direct HTML fetch (call index 0). */
function mockDirectFetchOk(html: string = SAMPLE_HTML) {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () => html,
  };
}

/** Create a mock Firecrawl MCP bridge that resolves with the given markdown + HTML. */
function createMockMcpBridge(
  markdown?: string | null,
  html?: string | null
): FirecrawlMcpBridgeService {
  const scrape =
    markdown != null
      ? vi.fn().mockResolvedValue({ markdown, ...(html != null ? { html } : {}) })
      : vi.fn().mockRejectedValue(new Error('Firecrawl unavailable'));

  return { scrape } as unknown as FirecrawlMcpBridgeService;
}

/** Mock a failed response for the direct HTML fetch tier. */
function mockFailed() {
  return { ok: false };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ScraperService', () => {
  let service: ScraperService;

  // Default: Firecrawl available with sample markdown + HTML
  beforeEach(() => {
    service = new ScraperService(createMockMcpBridge(SAMPLE_MARKDOWN, SAMPLE_HTML));
  });

  // ── URL Validation (SSRF Prevention) ──────────────────────────────────

  describe('validateUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(service.validateUrl('https://www.maxpreps.com/athlete/123')).toBe(
        'https://www.maxpreps.com/athlete/123'
      );
    });

    it('should accept valid HTTP URLs', () => {
      expect(service.validateUrl('http://example.com')).toBe('http://example.com/');
    });

    it('should trim whitespace from URLs', () => {
      expect(service.validateUrl('  https://hudl.com  ')).toBe('https://hudl.com/');
    });

    it('should reject invalid URLs', () => {
      expect(() => service.validateUrl('not a url')).toThrow('Invalid URL');
    });

    it('should reject empty strings', () => {
      expect(() => service.validateUrl('')).toThrow('Invalid URL');
    });

    it('should block file:// protocol', () => {
      expect(() => service.validateUrl('file:///etc/passwd')).toThrow('Blocked protocol');
    });

    it('should block ftp:// protocol', () => {
      expect(() => service.validateUrl('ftp://internal.server/data')).toThrow('Blocked protocol');
    });

    it('should block javascript: protocol', () => {
      expect(() => service.validateUrl('javascript:alert(1)')).toThrow('Blocked protocol');
    });

    it('should block localhost', () => {
      expect(() => service.validateUrl('http://localhost:3000')).toThrow('Blocked host');
    });

    it('should block 127.0.0.1', () => {
      expect(() => service.validateUrl('http://127.0.0.1/admin')).toThrow('Blocked host');
    });

    it('should block 0.0.0.0', () => {
      expect(() => service.validateUrl('http://0.0.0.0')).toThrow('Blocked host');
    });

    it('should block AWS metadata endpoint (SSRF)', () => {
      expect(() => service.validateUrl('http://169.254.169.254/latest/meta-data')).toThrow(
        'Blocked host'
      );
    });

    it('should block GCP metadata endpoint (SSRF)', () => {
      expect(() =>
        service.validateUrl('http://metadata.google.internal/computeMetadata/v1/')
      ).toThrow('Blocked host');
    });

    it('should block private 10.x.x.x range', () => {
      expect(() => service.validateUrl('http://10.0.0.1/internal')).toThrow('Private IP');
    });

    it('should block private 172.16.x.x range', () => {
      expect(() => service.validateUrl('http://172.16.0.1/admin')).toThrow('Private IP');
    });

    it('should block private 192.168.x.x range', () => {
      expect(() => service.validateUrl('http://192.168.1.1/router')).toThrow('Private IP');
    });

    it('should allow public IPs', () => {
      expect(service.validateUrl('http://8.8.8.8')).toBe('http://8.8.8.8/');
    });
  });

  // ── Firecrawl Strategy (primary — markdown + HTML in one call) ────────

  describe('scrape — Firecrawl strategy', () => {
    it('should return markdown from Firecrawl on success', async () => {
      const result = await service.scrape({ url: 'https://www.maxpreps.com/athlete/123' });

      expect(result.provider).toBe('firecrawl');
      expect(result.markdownContent).toContain('Jalen Smith');
      // Title comes from Firecrawl's JS-rendered HTML
      expect(result.title).toBe('MaxPreps - Jalen Smith');
      expect(result.contentLength).toBeGreaterThan(0);
      expect(result.scrapedInMs).toBeGreaterThanOrEqual(0);
    });

    it('should not call direct fetch when Firecrawl succeeds', async () => {
      await service.scrape({ url: 'https://www.maxpreps.com/athlete/123' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should include pageData from Firecrawl JS-rendered HTML', async () => {
      const nextDataService = new ScraperService(
        createMockMcpBridge(SAMPLE_MARKDOWN, SAMPLE_HTML_WITH_NEXT_DATA)
      );

      const result = await nextDataService.scrape({ url: 'https://www.maxpreps.com/athlete/456' });

      expect(result.provider).toBe('firecrawl');
      expect(result.pageData).not.toBeNull();
      expect(result.pageData?.nextData).toBeDefined();
      expect(result.pageData?.openGraph?.title).toBe('Deshon Yancey - RB');
      expect(result.pageData?.openGraph?.image).toBe('https://images.maxpreps.com/photo.jpg');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return pageData as null when Firecrawl returns markdown but no HTML', async () => {
      const markdownOnlyService = new ScraperService(createMockMcpBridge(SAMPLE_MARKDOWN));

      const result = await markdownOnlyService.scrape({ url: 'https://hudl.com/profile/123' });

      expect(result.provider).toBe('firecrawl');
      expect(result.pageData).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── Fallback Strategy (direct fetch when Firecrawl unavailable) ───────

  describe('scrape — fetch fallback', () => {
    // For fallback tests, Firecrawl is unavailable
    let fallbackService: ScraperService;

    beforeEach(() => {
      fallbackService = new ScraperService(createMockMcpBridge(null));
    });

    it('should fall back to direct fetch + HTML→Markdown when Firecrawl fails', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk()); // direct fetch OK

      const result = await fallbackService.scrape({ url: 'https://www.maxpreps.com/athlete/123' });

      expect(result.provider).toBe('fetch-fallback');
      expect(result.markdownContent).toContain('Jalen Smith');
      expect(result.title).toBe('MaxPreps - Jalen Smith');
    });

    it('should strip script, style, nav, and footer tags from HTML markdown', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk());

      const result = await fallbackService.scrape({ url: 'https://example.com' });

      expect(result.markdownContent).not.toContain('var x = 1');
      expect(result.markdownContent).not.toContain('Navigation here');
      expect(result.markdownContent).not.toContain('Footer content');
      expect(result.markdownContent).not.toContain('.hidden');
    });

    it('should include structured pageData on fallback path', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_NEXT_DATA));

      const result = await fallbackService.scrape({ url: 'https://maxpreps.com/athlete/789' });

      expect(result.provider).toBe('fetch-fallback');
      expect(result.pageData).not.toBeNull();
      expect(result.pageData?.nextData).toBeDefined();
    });

    it('should extract embeddedData from generic window.__* blobs', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_EMBEDDED_DATA));

      const result = await fallbackService.scrape({ url: 'https://www.hudl.com/profile/19341470' });

      expect(result.pageData).not.toBeNull();
      expect(result.pageData?.embeddedData).toBeDefined();
      expect(result.pageData?.embeddedData['__hudlEmbed']).toBeDefined();

      const hudlData = result.pageData?.embeddedData['__hudlEmbed'] as Record<string, unknown>;
      const model = hudlData['model'] as Record<string, unknown>;
      const user = model['user'] as Record<string, unknown>;
      expect(user['firstName']).toBe('Deshon');
      expect(user['lastName']).toBe('Yancey');
    });

    it('should mark hasRichData true when embeddedData is found', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_EMBEDDED_DATA));

      const result = await fallbackService.scrape({ url: 'https://www.hudl.com/profile/19341470' });

      expect(result.pageData?.hasRichData).toBe(true);
    });

    it('should extract colors from embeddedData blobs', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_EMBEDDED_DATA));

      const result = await fallbackService.scrape({ url: 'https://www.hudl.com/profile/19341470' });

      expect(result.pageData?.colors).toBeDefined();
      expect(result.pageData?.colors.length).toBeGreaterThan(0);
    });

    it('should extract Hudl CDN video URLs and pick highest quality per highlight', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_HUDL_CDN_VIDEOS));

      const result = await fallbackService.scrape({ url: 'https://www.hudl.com/profile/16389887' });

      const videos = result.pageData?.videos ?? [];
      // Should have exactly 2 videos (one per highlight), not 5 (all quality variants)
      expect(videos.length).toBe(2);
      // Should pick 720p (highest quality) for both highlights
      expect(videos.every((v) => v.src.includes('_720.mp4'))).toBe(true);
      expect(videos.every((v) => v.provider === 'hudl')).toBe(true);
    });

    it('should extract videoId (highlight ID) from Hudl CDN URLs', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_HUDL_CDN_VIDEOS));

      const result = await fallbackService.scrape({ url: 'https://www.hudl.com/profile/16389887' });

      const videos = result.pageData?.videos ?? [];
      const videoIds = videos.map((v) => v.videoId).sort();
      expect(videoIds).toEqual(['6121dfa50dc02a09e0c6b671', '7234ef120abc34f1a2d8e982']);
    });

    it('should extract Hudl CDN videos from both vi.hudl.com and vc.hudl.com domains', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_HUDL_CDN_VIDEOS));

      const result = await fallbackService.scrape({ url: 'https://www.hudl.com/profile/16389887' });

      const videos = result.pageData?.videos ?? [];
      // First highlight is on vi.hudl.com, second on vc.hudl.com
      const viVideos = videos.filter((v) => v.src.includes('vi.hudl.com'));
      const vcVideos = videos.filter((v) => v.src.includes('vc.hudl.com'));
      expect(viVideos.length).toBe(1);
      expect(vcVideos.length).toBe(1);
    });

    it('should reject non-HTML content types in direct fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => '{"data": "not html"}',
      });

      await expect(fallbackService.scrape({ url: 'https://api.example.com/data' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });
  });

  // ── Content Truncation ────────────────────────────────────────────────

  describe('content truncation', () => {
    it('should truncate content exceeding maxLength', async () => {
      const longContent = '# Title\n\n' + 'A'.repeat(30_000);
      const truncService = new ScraperService(createMockMcpBridge(longContent));

      const result = await truncService.scrape({ url: 'https://example.com', maxLength: 500 });

      expect(result.contentLength).toBeLessThanOrEqual(540); // 500 + "\n\n[Content truncated]"
      expect(result.markdownContent).toContain('[Content truncated]');
    });

    it('should not truncate content within maxLength', async () => {
      const result = await service.scrape({
        url: 'https://example.com',
        maxLength: MAX_SCRAPE_CONTENT_LENGTH,
      });

      expect(result.markdownContent).not.toContain('[Content truncated]');
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw on SSRF-blocked URL', async () => {
      await expect(service.scrape({ url: 'http://169.254.169.254/latest' })).rejects.toThrow(
        'Blocked host'
      );
    });

    it('should throw on invalid URL', async () => {
      await expect(service.scrape({ url: 'not-a-url' })).rejects.toThrow('Invalid URL');
    });

    it('should throw when both tiers fail', async () => {
      const failService = new ScraperService(createMockMcpBridge(null));
      mockFetch.mockResolvedValueOnce(mockFailed()); // direct fetch fails

      await expect(failService.scrape({ url: 'https://example.com' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });

    it('should throw when Firecrawl returns too little content and direct fetch also fails', async () => {
      const shortService = new ScraperService(createMockMcpBridge('Hi'));
      mockFetch.mockResolvedValueOnce(mockFailed()); // direct fetch fails

      await expect(shortService.scrape({ url: 'https://example.com' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });
  });

  // ── scrapeWithSchema (LLM-powered extraction) ────────────────────────

  describe('scrapeWithSchema', () => {
    it('should call MCP bridge extract with URL, prompt, and schema', async () => {
      const extractMock = vi
        .fn()
        .mockResolvedValue({ players: [{ name: 'Jalen', position: 'PG' }] });
      const bridge = {
        scrape: vi.fn(),
        extract: extractMock,
      } as unknown as FirecrawlMcpBridgeService;
      const schemaService = new ScraperService(bridge);

      const schema = { type: 'object', properties: { players: { type: 'array' } } };
      const result = await schemaService.scrapeWithSchema(
        'https://gocards.com/roster',
        'Extract the roster',
        schema
      );

      expect(extractMock).toHaveBeenCalledWith(
        ['https://gocards.com/roster'],
        'Extract the roster',
        { schema }
      );
      expect(result).toEqual({ players: [{ name: 'Jalen', position: 'PG' }] });
    });

    it('should call extract without schema when not provided', async () => {
      const extractMock = vi.fn().mockResolvedValue({ data: 'extracted' });
      const bridge = {
        scrape: vi.fn(),
        extract: extractMock,
      } as unknown as FirecrawlMcpBridgeService;
      const schemaService = new ScraperService(bridge);

      await schemaService.scrapeWithSchema('https://example.com', 'Extract everything');

      expect(extractMock).toHaveBeenCalledWith(['https://example.com/'], 'Extract everything', {});
    });

    it('should throw when MCP bridge is not available', async () => {
      const noBridgeService = new ScraperService(null);

      await expect(
        noBridgeService.scrapeWithSchema('https://example.com', 'Extract data')
      ).rejects.toThrow('requires Firecrawl MCP bridge');
    });

    it('should validate URL before calling extract', async () => {
      const bridge = {
        scrape: vi.fn(),
        extract: vi.fn(),
      } as unknown as FirecrawlMcpBridgeService;
      const schemaService = new ScraperService(bridge);

      await expect(
        schemaService.scrapeWithSchema('http://169.254.169.254', 'Extract secrets')
      ).rejects.toThrow('Blocked host');
    });
  });

  // ── scrapeMany (parallel fan-out) ─────────────────────────────────────

  describe('scrapeMany', () => {
    it('should scrape multiple URLs and return results for each', async () => {
      const results = await service.scrapeMany([
        { url: 'https://example.com/a' },
        { url: 'https://example.com/b' },
      ]);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'success')).toBe(true);
    });

    it('should return error status for individual URL failures without killing batch', async () => {
      // Uses service with Firecrawl that rejects — but also mock fetch to fail
      const partialService = new ScraperService(createMockMcpBridge(null));

      // First URL: direct fetch succeeds
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk());
      // Second URL: direct fetch also fails
      mockFetch.mockResolvedValueOnce(mockFailed());

      const results = await partialService.scrapeMany([
        { url: 'https://example.com/good' },
        { url: 'https://example.com/bad' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('error');
    });

    it('should call onItemSettled for each completed URL', async () => {
      const onItemSettled = vi.fn();

      await service.scrapeMany(
        [
          { url: 'https://example.com/1' },
          { url: 'https://example.com/2' },
          { url: 'https://example.com/3' },
        ],
        { onItemSettled }
      );

      expect(onItemSettled).toHaveBeenCalledTimes(3);
      expect(onItemSettled).toHaveBeenLastCalledWith(3, 3, expect.any(String));
    });

    it('should respect concurrency limit', async () => {
      // With concurrency 1, URLs are processed sequentially
      const results = await service.scrapeMany(
        [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }],
        { concurrency: 1 }
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'success')).toBe(true);
    });

    it('should clamp concurrency between 1 and 10', async () => {
      // concurrency: 100 gets clamped to 10 (no error)
      const results = await service.scrapeMany([{ url: 'https://example.com/a' }], {
        concurrency: 100,
      });
      expect(results).toHaveLength(1);
    });
  });

  // ── warmCache (proactive cache warming) ───────────────────────────────

  describe('warmCache', () => {
    it('should call MCP bridge scrape for each URL', async () => {
      const scrapeMock = vi.fn().mockResolvedValue({ markdown: SAMPLE_MARKDOWN });
      const bridge = { scrape: scrapeMock } as unknown as FirecrawlMcpBridgeService;
      const warmService = new ScraperService(bridge);

      const result = await warmService.warmCache([
        'https://example.com/a',
        'https://example.com/b',
      ]);

      expect(scrapeMock).toHaveBeenCalledTimes(2);
      expect(scrapeMock).toHaveBeenCalledWith(expect.any(String), {
        formats: ['markdown', 'html'],
      });
      expect(result.total).toBe(2);
      expect(result.warmed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should return skip result when MCP bridge is unavailable', async () => {
      const noBridgeService = new ScraperService(null);

      const result = await noBridgeService.warmCache(['https://example.com']);

      expect(result.total).toBe(1);
      expect(result.warmed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toContain('No MCP bridge');
    });

    it('should handle partial failures gracefully', async () => {
      const scrapeMock = vi
        .fn()
        .mockResolvedValueOnce({ markdown: 'ok' })
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ markdown: 'ok' });
      const bridge = { scrape: scrapeMock } as unknown as FirecrawlMcpBridgeService;
      const warmService = new ScraperService(bridge);

      const result = await warmService.warmCache([
        'https://example.com/a',
        'https://example.com/b',
        'https://example.com/c',
      ]);

      expect(result.total).toBe(3);
      expect(result.warmed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('timeout');
    });

    it('should cap batch at 100 URLs', async () => {
      const scrapeMock = vi.fn().mockResolvedValue({ markdown: 'ok' });
      const bridge = { scrape: scrapeMock } as unknown as FirecrawlMcpBridgeService;
      const warmService = new ScraperService(bridge);

      const urls = Array.from({ length: 150 }, (_, i) => `https://example.com/${i}`);
      const result = await warmService.warmCache(urls);

      expect(result.total).toBe(100); // capped at 100
      expect(scrapeMock).toHaveBeenCalledTimes(100);
    });

    it('should filter out invalid/SSRF URLs without crashing', async () => {
      const scrapeMock = vi.fn().mockResolvedValue({ markdown: 'ok' });
      const bridge = { scrape: scrapeMock } as unknown as FirecrawlMcpBridgeService;
      const warmService = new ScraperService(bridge);

      const result = await warmService.warmCache([
        'https://example.com/good',
        'http://169.254.169.254/bad', // SSRF blocked
        'https://example.com/also-good',
      ]);

      expect(result.warmed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('Blocked host');
    });

    it('should call onItemSettled for each URL', async () => {
      const scrapeMock = vi.fn().mockResolvedValue({ markdown: 'ok' });
      const bridge = { scrape: scrapeMock } as unknown as FirecrawlMcpBridgeService;
      const warmService = new ScraperService(bridge);
      const onItemSettled = vi.fn();

      await warmService.warmCache(['https://example.com/a', 'https://example.com/b'], {
        onItemSettled,
      });

      expect(onItemSettled).toHaveBeenCalledTimes(2);
    });
  });
});
