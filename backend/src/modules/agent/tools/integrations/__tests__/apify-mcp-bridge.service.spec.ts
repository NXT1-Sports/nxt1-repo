import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    PROFILES: 900,
  },
  generateCacheKey: (prefix: string, params: Record<string, unknown>) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCacheService: () => cache,
  incrementCacheHit: vi.fn(),
  incrementCacheMiss: vi.fn(),
  incrementCacheSet: vi.fn(),
}));

import { ApifyMcpBridgeService } from '../apify/apify-mcp-bridge.service.js';

describe('ApifyMcpBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore.clear();
    process.env['APIFY_API_TOKEN'] = 'test-token';
  });

  it('rejects malformed actor search payloads', async () => {
    const service = new ApifyMcpBridgeService();
    vi.spyOn(service, 'executeTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ foo: 'bar' }) }],
    });

    await expect(service.searchActors('quarterback prospects')).rejects.toThrow(
      'Apify MCP returned invalid payload for search-actors'
    );
  });

  it('reuses cached search results for identical discovery requests', async () => {
    const service = new ApifyMcpBridgeService();
    const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
      structuredContent: {
        actors: [{ id: 'apify/instagram-scraper', name: 'Instagram Scraper' }],
      },
      content: [],
    });

    const first = await service.searchActors('instagram scraper', 5);
    const second = await service.searchActors('instagram scraper', 5);

    expect(first).toEqual(second);
    expect(executeToolSpy).toHaveBeenCalledTimes(1);
    expect(cache.get).toHaveBeenCalledTimes(2);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
