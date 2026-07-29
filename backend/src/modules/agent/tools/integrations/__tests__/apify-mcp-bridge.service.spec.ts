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

vi.mock('../../../../../services/core/cache.service.js', () => ({
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

  describe('getActorOutput — uses get-dataset-items MCP tool', () => {
    it('calls get-dataset-items (not get-actor-output) with correct parameters', async () => {
      const service = new ApifyMcpBridgeService();
      const items = [{ athleteId: 'a1', name: 'Jordan Smith' }];
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        structuredContent: items,
        content: [],
      });

      const result = await service.getActorOutput('ds-abc123', 0, 50);

      expect(executeToolSpy).toHaveBeenCalledWith(
        'get-dataset-items',
        { datasetId: 'ds-abc123', offset: 0, limit: 50 },
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(executeToolSpy).not.toHaveBeenCalledWith(
        'get-actor-output',
        expect.anything(),
        expect.anything()
      );
      expect(result).toEqual(items);
    });

    it('enforces the 200-item hard cap on limit', async () => {
      const service = new ApifyMcpBridgeService();
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [{ type: 'text', text: '[]' }],
      });

      await service.getActorOutput('ds-abc123', 0, 9999);

      expect(executeToolSpy).toHaveBeenCalledWith(
        'get-dataset-items',
        { datasetId: 'ds-abc123', offset: 0, limit: 200 },
        expect.anything()
      );
    });

    it('throws APIFY_REQUEST_FAILED when get-dataset-items returns an error result', async () => {
      const service = new ApifyMcpBridgeService();
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ message: 'Dataset not found' }) }],
      });

      await expect(service.getActorOutput('ds-missing', 0, 10)).rejects.toThrow(
        'Failed to fetch dataset items for "ds-missing"'
      );
    });

    it('throws APIFY_RESPONSE_EMPTY when the MCP response has no content', async () => {
      const service = new ApifyMcpBridgeService();
      vi.spyOn(service, 'executeTool').mockResolvedValue({
        content: [],
      });

      await expect(service.getActorOutput('ds-empty', 0, 10)).rejects.toThrow(
        'Apify MCP returned no structured content'
      );
    });

    it('returns cached result on second call with the same parameters', async () => {
      const service = new ApifyMcpBridgeService();
      const items = [{ id: 'row-1' }];
      const executeToolSpy = vi.spyOn(service, 'executeTool').mockResolvedValue({
        structuredContent: items,
        content: [],
      });

      const first = await service.getActorOutput('ds-cached', 0, 10);
      const second = await service.getActorOutput('ds-cached', 0, 10);

      expect(first).toEqual(second);
      expect(executeToolSpy).toHaveBeenCalledTimes(1);
    });
  });
});
