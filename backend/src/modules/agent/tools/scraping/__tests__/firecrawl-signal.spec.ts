/**
 * @fileoverview Unit Tests — FirecrawlService signal support
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Verifies that FirecrawlService methods throw immediately when
 * the AbortSignal is already aborted (pre-check guard).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirecrawlService } from '../firecrawl.service.js';

// ─── Mock Firecrawl SDK ─────────────────────────────────────────────────────

vi.mock('@mendable/firecrawl-js', () => {
  const mockScrape = vi.fn().mockResolvedValue({
    markdown: '# Test',
    metadata: { title: 'Test' },
  });
  const mockSearch = vi.fn().mockResolvedValue({
    web: [{ url: 'https://example.com', title: 'Example', description: 'Desc' }],
  });

  class MockFirecrawl {
    scrape = mockScrape;
    search = mockSearch;
  }

  return { default: MockFirecrawl };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FirecrawlService — signal support', () => {
  let service: FirecrawlService;

  beforeEach(() => {
    service = new FirecrawlService('test-api-key');
  });

  describe('scrapeText', () => {
    it('should throw immediately when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(service.scrapeText('https://example.com', controller.signal)).rejects.toThrow(
        'Operation cancelled'
      );
    });

    it('should proceed when signal is not aborted', async () => {
      const controller = new AbortController();
      const result = await service.scrapeText('https://example.com', controller.signal);

      expect(result.markdown).toBe('# Test');
      expect(result.url).toBe('https://example.com');
    });

    it('should proceed when no signal is provided', async () => {
      const result = await service.scrapeText('https://example.com');

      expect(result.markdown).toBe('# Test');
    });
  });

  describe('scrapeWithActions', () => {
    it('should throw immediately when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.scrapeWithActions('https://example.com', [], controller.signal)
      ).rejects.toThrow('Operation cancelled');
    });
  });

  describe('search', () => {
    it('should throw immediately when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(service.search('test query', 5, controller.signal)).rejects.toThrow(
        'Operation cancelled'
      );
    });

    it('should proceed when signal is not aborted', async () => {
      const result = await service.search('test query');

      expect(result.query).toBe('test query');
      expect(result.results.length).toBeGreaterThan(0);
    });
  });
});
