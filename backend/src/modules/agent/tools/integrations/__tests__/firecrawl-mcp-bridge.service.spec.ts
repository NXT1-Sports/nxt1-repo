import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Cache mock ──────────────────────────────────────────────────────────────

const cacheStore = new Map<string, unknown>();
const cache = {
  get: vi.fn(async (key: string) => cacheStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: unknown) => {
    cacheStore.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    cacheStore.delete(key);
  }),
};

vi.mock('../../../../../services/cache.service.js', () => ({
  CACHE_TTL: {
    SEARCH: 900,
    RANKINGS: 3600,
  },
  generateCacheKey: (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCacheService: () => cache,
  incrementCacheHit: vi.fn(),
  incrementCacheMiss: vi.fn(),
  incrementCacheSet: vi.fn(),
}));

import { FirecrawlMcpBridgeService } from '../firecrawl/firecrawl-mcp-bridge.service.js';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('FirecrawlMcpBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore.clear();
    process.env['FIRECRAWL_API_KEY'] = 'fc-test-key';
  });

  // ── Constructor ────────────────────────────────────────────────────────

  it('throws if FIRECRAWL_API_KEY is not set', () => {
    delete process.env['FIRECRAWL_API_KEY'];
    expect(() => new FirecrawlMcpBridgeService()).toThrow(
      'FIRECRAWL_API_KEY environment variable is required'
    );
  });

  it('sets serverName to "firecrawl"', () => {
    const service = new FirecrawlMcpBridgeService();
    expect(service.serverName).toBe('firecrawl');
  });

  // ── scrape() ──────────────────────────────────────────────────────────

  describe('scrape()', () => {
    it('validates scrape response with markdown content', async () => {
      const service = new FirecrawlMcpBridgeService();
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ markdown: '# Hello World' }) }],
      });

      const result = await service.scrape('https://example.com');
      expect(result).toEqual({ markdown: '# Hello World' });
    });

    it('rejects scrape response missing all content fields', async () => {
      const service = new FirecrawlMcpBridgeService();
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ foo: 'bar' }) }],
      });

      await expect(service.scrape('https://example.com')).rejects.toThrow(
        'Firecrawl MCP returned invalid payload for firecrawl_scrape'
      );
    });

    it('caches scrape results and reuses on identical requests', async () => {
      const service = new FirecrawlMcpBridgeService();
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ markdown: '# Roster' }) }],
      });

      const first = await service.scrape('https://gators.com/roster');
      const second = await service.scrape('https://gators.com/roster');

      expect(first).toEqual(second);
      expect(executeToolSpy).toHaveBeenCalledTimes(1);
      expect(cache.get).toHaveBeenCalledTimes(2);
      expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it('throws when MCP returns isError:true', async () => {
      const service = new FirecrawlMcpBridgeService();
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: 'Rate limit exceeded' }],
        isError: true,
      });

      await expect(service.scrape('https://example.com')).rejects.toThrow(
        'Firecrawl scrape failed'
      );
    });
  });

  // ── search() ──────────────────────────────────────────────────────────

  describe('search()', () => {
    it('validates search response with results array', async () => {
      const service = new FirecrawlMcpBridgeService();
      const results = [
        { title: 'Florida Gators', url: 'https://gators.com', content: 'Recruiting news' },
      ];
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(results) }],
      });

      const result = await service.search('florida gators recruiting');
      expect(result).toEqual(results);
    });

    it('caches search results for identical queries', async () => {
      const service = new FirecrawlMcpBridgeService();
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([{ title: 'Result', url: 'https://example.com' }]),
          },
        ],
      });

      await service.search('NCAA rules 2026');
      await service.search('NCAA rules 2026');

      expect(executeToolSpy).toHaveBeenCalledTimes(1);
    });

    it('clamps search limit to MAX_SEARCH_RESULTS', async () => {
      const service = new FirecrawlMcpBridgeService();
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify([]) }],
      });

      // Request 50 results — should be clamped to 10
      await service.search('test', { limit: 50 }).catch(() => undefined);

      const calledArgs = executeToolSpy.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
      expect(calledArgs?.['limit']).toBe(10);
    });
  });

  // ── map() ─────────────────────────────────────────────────────────────

  describe('map()', () => {
    it('validates map response with URL array', async () => {
      const service = new FirecrawlMcpBridgeService();
      const urls = ['https://gators.com/roster', 'https://gators.com/coaches'];
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(urls) }],
      });

      const result = await service.map('https://gators.com');
      expect(result).toEqual(urls);
    });

    it('caches map results for identical base URLs', async () => {
      const service = new FirecrawlMcpBridgeService();
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(['https://example.com/page1']) }],
      });

      await service.map('https://example.com');
      await service.map('https://example.com');

      expect(executeToolSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── extract() ─────────────────────────────────────────────────────────

  describe('extract()', () => {
    it('enforces MAX_BATCH_URLS limit', async () => {
      const service = new FirecrawlMcpBridgeService();
      const urls = Array.from({ length: 30 }, (_, i) => `https://example.com/page${i}`);

      await expect(service.extract(urls, 'Extract data')).rejects.toThrow(
        'Firecrawl extract limited to 25 URLs per call'
      );
    });

    it('returns validated extraction result', async () => {
      const service = new FirecrawlMcpBridgeService();
      const extraction = { players: [{ name: 'John', position: 'QB' }] };
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(extraction) }],
      });

      const result = await service.extract(
        ['https://gators.com/roster'],
        'Extract player names and positions'
      );
      expect(result).toEqual(extraction);
    });

    it('does NOT cache extract calls', async () => {
      const service = new FirecrawlMcpBridgeService();
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ data: 'test' }) }],
      });

      await service.extract(['https://example.com'], 'Extract data');
      await service.extract(['https://example.com'], 'Extract data');

      // extract is NOT cached — both should hit executeTool
      expect(executeToolSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── crawl() ───────────────────────────────────────────────────────────

  describe('crawl()', () => {
    it('clamps crawl depth and limit to safe maximums', async () => {
      const service = new FirecrawlMcpBridgeService();
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ id: 'crawl-123', status: 'started' }) }],
      });

      await service.crawl('https://example.com', { maxDepth: 10, limit: 500 });

      const calledArgs = executeToolSpy.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
      expect(calledArgs?.['maxDepth']).toBe(3); // Clamped from 10 to MAX_CRAWL_DEPTH
      expect(calledArgs?.['limit']).toBe(50); // Clamped from 500 to MAX_CRAWL_LIMIT
    });

    it('returns crawl job ID', async () => {
      const service = new FirecrawlMcpBridgeService();
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: 'crawl-abc',
              status: 'started',
              message: 'Crawl initiated',
            }),
          },
        ],
      });

      const result = await service.crawl('https://example.com');
      expect(result).toEqual({ id: 'crawl-abc', status: 'started', message: 'Crawl initiated' });
    });
  });

  // ── checkCrawlStatus() ────────────────────────────────────────────────

  describe('checkCrawlStatus()', () => {
    it('returns crawl status and results', async () => {
      const service = new FirecrawlMcpBridgeService();
      const statusData = {
        status: 'completed',
        data: [{ url: 'https://example.com', markdown: '# Page' }],
      };
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(statusData) }],
      });

      const result = await service.checkCrawlStatus('crawl-abc');
      expect(result).toEqual(statusData);
    });
  });

  // ── extractPayload edge cases ─────────────────────────────────────────

  describe('payload extraction', () => {
    it('prefers structuredContent over text blocks', async () => {
      const service = new FirecrawlMcpBridgeService();
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        structuredContent: { markdown: '# From structured' },
        content: [{ type: 'text', text: JSON.stringify({ markdown: '# From text' }) }],
      });

      const result = await service.scrape('https://example.com');
      expect(result).toEqual({ markdown: '# From structured' });
    });

    it('throws when MCP returns no content at all', async () => {
      const service = new FirecrawlMcpBridgeService();
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [],
      });

      await expect(service.scrape('https://example.com')).rejects.toThrow(
        'Firecrawl MCP returned no content'
      );
    });
  });
});
