/**
 * @fileoverview Unit Tests — ScraperService
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Tests the 3-tier scraping engine in isolation by mocking `fetch`.
 * Covers URL validation (SSRF prevention), parallel fetching (Tier 1 direct
 * HTML + Tier 2 Jina), Tier 3 HTML→Markdown fallback, structured data
 * extraction integration, content truncation, and error handling.
 *
 * Because the service runs Tier 1 (direct fetch) and Tier 2 (Jina) in
 * parallel via Promise.all, `mockFetch` receives two calls simultaneously:
 *   Call 0 → direct HTML fetch (the target URL)
 *   Call 1 → Jina reader (`https://r.jina.ai/{url}`)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScraperService } from '../scraper.service.js';
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Mock a successful direct HTML fetch (call index 0). */
function mockDirectFetchOk(html: string = SAMPLE_HTML) {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () => html,
  };
}

/** Mock a successful Jina response (call index 1). */
function mockJinaOk(markdown: string = SAMPLE_MARKDOWN) {
  return {
    ok: true,
    text: async () => markdown,
  };
}

/** Mock a failed response for either tier. */
function mockFailed() {
  return { ok: false };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ScraperService', () => {
  let service: ScraperService;

  beforeEach(() => {
    service = new ScraperService();
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

  // ── Jina Strategy (Tier 2, preferred markdown source) ─────────────────

  describe('scrape — Jina strategy', () => {
    it('should return markdown from Jina on success', async () => {
      // Call 0: direct fetch (also succeeds for structured data)
      // Call 1: Jina (succeeds — preferred markdown source)
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk()).mockResolvedValueOnce(mockJinaOk());

      const result = await service.scrape({ url: 'https://www.maxpreps.com/athlete/123' });

      expect(result.provider).toBe('jina');
      expect(result.markdownContent).toContain('Jalen Smith');
      // Title comes from pageData (HTML <title>) when direct fetch succeeds
      expect(result.title).toBe('MaxPreps - Jalen Smith');
      expect(result.contentLength).toBeGreaterThan(0);
      expect(result.scrapedInMs).toBeGreaterThanOrEqual(0);
    });

    it('should include pageData from direct HTML fetch alongside Jina markdown', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_NEXT_DATA))
        .mockResolvedValueOnce(mockJinaOk());

      const result = await service.scrape({ url: 'https://www.maxpreps.com/athlete/456' });

      expect(result.provider).toBe('jina');
      expect(result.pageData).not.toBeNull();
      expect(result.pageData?.nextData).toBeDefined();
      expect(result.pageData?.openGraph?.title).toBe('Deshon Yancey - RB');
      expect(result.pageData?.openGraph?.image).toBe('https://images.maxpreps.com/photo.jpg');
    });

    it('should use Jina markdown even if direct fetch fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFailed()) // direct fetch fails
        .mockResolvedValueOnce(mockJinaOk()); // Jina succeeds

      const result = await service.scrape({ url: 'https://hudl.com/profile/123' });

      expect(result.provider).toBe('jina');
      expect(result.pageData).toBeNull(); // no HTML → no structured data
    });
  });

  // ── Fallback Strategy (Tier 3) ────────────────────────────────────────

  describe('scrape — fetch fallback (Tier 3)', () => {
    it('should fall back to HTML→Markdown when Jina fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDirectFetchOk()) // direct fetch OK
        .mockResolvedValueOnce(mockFailed()); // Jina fails

      const result = await service.scrape({ url: 'https://www.maxpreps.com/athlete/123' });

      expect(result.provider).toBe('fetch-fallback');
      expect(result.markdownContent).toContain('Jalen Smith');
      expect(result.title).toBe('MaxPreps - Jalen Smith');
    });

    it('should strip script, style, nav, and footer tags from HTML markdown', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk()).mockResolvedValueOnce(mockFailed());

      const result = await service.scrape({ url: 'https://example.com' });

      expect(result.markdownContent).not.toContain('var x = 1');
      expect(result.markdownContent).not.toContain('Navigation here');
      expect(result.markdownContent).not.toContain('Footer content');
      expect(result.markdownContent).not.toContain('.hidden');
    });

    it('should include structured pageData on fallback path', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_NEXT_DATA))
        .mockResolvedValueOnce(mockFailed());

      const result = await service.scrape({ url: 'https://maxpreps.com/athlete/789' });

      expect(result.provider).toBe('fetch-fallback');
      expect(result.pageData).not.toBeNull();
      expect(result.pageData?.nextData).toBeDefined();
    });

    it('should extract embeddedData from generic window.__* blobs', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_EMBEDDED_DATA))
        .mockResolvedValueOnce(mockFailed());

      const result = await service.scrape({ url: 'https://www.hudl.com/profile/19341470' });

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
      mockFetch
        .mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_EMBEDDED_DATA))
        .mockResolvedValueOnce(mockFailed());

      const result = await service.scrape({ url: 'https://www.hudl.com/profile/19341470' });

      expect(result.pageData?.hasRichData).toBe(true);
    });

    it('should extract colors from embeddedData blobs', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDirectFetchOk(SAMPLE_HTML_WITH_EMBEDDED_DATA))
        .mockResolvedValueOnce(mockFailed());

      const result = await service.scrape({ url: 'https://www.hudl.com/profile/19341470' });

      expect(result.pageData?.colors).toBeDefined();
      expect(result.pageData?.colors.length).toBeGreaterThan(0);
    });

    it('should reject non-HTML content types in direct fetch', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => '{"data": "not html"}',
        })
        .mockResolvedValueOnce(mockFailed());

      await expect(service.scrape({ url: 'https://api.example.com/data' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });
  });

  // ── Content Truncation ────────────────────────────────────────────────

  describe('content truncation', () => {
    it('should truncate content exceeding maxLength', async () => {
      const longContent = '# Title\n\n' + 'A'.repeat(30_000);
      mockFetch
        .mockResolvedValueOnce(mockDirectFetchOk())
        .mockResolvedValueOnce(mockJinaOk(longContent));

      const result = await service.scrape({ url: 'https://example.com', maxLength: 500 });

      expect(result.contentLength).toBeLessThanOrEqual(540); // 500 + "\n\n[Content truncated]"
      expect(result.markdownContent).toContain('[Content truncated]');
    });

    it('should not truncate content within maxLength', async () => {
      mockFetch.mockResolvedValueOnce(mockDirectFetchOk()).mockResolvedValueOnce(mockJinaOk());

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
      mockFetch
        .mockResolvedValueOnce(mockFailed()) // direct fetch fails
        .mockResolvedValueOnce(mockFailed()); // Jina fails

      await expect(service.scrape({ url: 'https://example.com' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });

    it('should throw when Jina returns too little content and direct fetch also fails', async () => {
      mockFetch
        .mockResolvedValueOnce(mockFailed()) // direct fetch fails
        .mockResolvedValueOnce({ ok: true, text: async () => 'Hi' }); // Jina too short

      await expect(service.scrape({ url: 'https://example.com' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });
  });
});
