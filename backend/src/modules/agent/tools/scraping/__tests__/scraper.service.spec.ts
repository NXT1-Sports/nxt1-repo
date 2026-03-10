/**
 * @fileoverview Unit Tests — ScraperService
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Tests the core scraping engine in isolation by mocking `fetch`.
 * Covers URL validation (SSRF prevention), Jina primary strategy,
 * fetch fallback strategy, content truncation, and error handling.
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

  // ── Jina Strategy ─────────────────────────────────────────────────────

  describe('scrape — Jina strategy', () => {
    it('should return markdown from Jina on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_MARKDOWN,
      });

      const result = await service.scrape({ url: 'https://www.maxpreps.com/athlete/123' });

      expect(result.provider).toBe('jina');
      expect(result.markdownContent).toContain('Jalen Smith');
      expect(result.title).toBe('Jalen Smith Stats');
      expect(result.contentLength).toBeGreaterThan(0);
      expect(result.scrapedInMs).toBeGreaterThanOrEqual(0);
    });

    it('should call Jina with the correct URL format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_MARKDOWN,
      });

      await service.scrape({ url: 'https://hudl.com/profile/123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://hudl.com/profile/123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'text/markdown',
          }),
        })
      );
    });

    it('should pass the correct Jina headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_MARKDOWN,
      });

      await service.scrape({ url: 'https://example.com' });

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders).toHaveProperty('X-Return-Format', 'markdown');
      expect(callHeaders).toHaveProperty('X-No-Cache', 'true');
    });
  });

  // ── Fallback Strategy ─────────────────────────────────────────────────

  describe('scrape — fetch fallback', () => {
    it('should fall back to native fetch when Jina fails', async () => {
      // Jina returns non-OK
      mockFetch.mockResolvedValueOnce({ ok: false });
      // Fallback succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => SAMPLE_HTML,
      });

      const result = await service.scrape({ url: 'https://www.maxpreps.com/athlete/123' });

      expect(result.provider).toBe('fetch-fallback');
      expect(result.markdownContent).toContain('Jalen Smith');
      expect(result.title).toBe('MaxPreps - Jalen Smith');
    });

    it('should strip script, style, nav, and footer tags from HTML', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => SAMPLE_HTML,
      });

      const result = await service.scrape({ url: 'https://example.com' });

      expect(result.markdownContent).not.toContain('var x = 1');
      expect(result.markdownContent).not.toContain('Navigation here');
      expect(result.markdownContent).not.toContain('Footer content');
      expect(result.markdownContent).not.toContain('.hidden');
    });

    it('should reject non-HTML content types in fallback', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => '{"data": "not html"}',
      });

      await expect(service.scrape({ url: 'https://api.example.com/data' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });
  });

  // ── Content Truncation ────────────────────────────────────────────────

  describe('content truncation', () => {
    it('should truncate content exceeding maxLength', async () => {
      const longContent = '# Title\n\n' + 'A'.repeat(30_000);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => longContent,
      });

      const result = await service.scrape({ url: 'https://example.com', maxLength: 500 });

      expect(result.contentLength).toBeLessThanOrEqual(540); // 500 + "\n\n[Content truncated]"
      expect(result.markdownContent).toContain('[Content truncated]');
    });

    it('should not truncate content within maxLength', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_MARKDOWN,
      });

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

    it('should throw when both strategies fail', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      mockFetch.mockResolvedValueOnce({ ok: false });

      await expect(service.scrape({ url: 'https://example.com' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });

    it('should throw when Jina returns too little content and fallback also fails', async () => {
      // Jina returns nearly empty response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Hi',
      });
      // Fallback also fails
      mockFetch.mockResolvedValueOnce({ ok: false });

      await expect(service.scrape({ url: 'https://example.com' })).rejects.toThrow(
        'Failed to scrape URL'
      );
    });
  });
});
