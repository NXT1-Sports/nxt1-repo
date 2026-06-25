import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { syncPlaybookDiagramAsset } from '../playbook-diagram-asset.util.js';

type AssetRecord = Record<string, unknown> & { id: string };

describe('syncPlaybookDiagramAsset', () => {
  const existingAsset: AssetRecord = {
    id: 'asset-existing',
    kind: 'sport_play',
    sport: 'football',
    title: 'Mesh',
    description: 'Existing board diagram',
    imageUrl: 'https://example.com/mesh.png',
    storagePath: 'Users/u1/diagrams/mesh.png',
    xmlContent: '<mxfile>mesh</mxfile>',
    editUrl: 'https://app.diagrams.net/#mesh',
    sourceLayout: {
      sport: 'football',
      title: 'Mesh',
      fieldWidth: 600,
      fieldHeight: 440,
      losY: 280,
      players: [],
      routes: [],
    },
    userId: 'u1',
    threadId: null,
    deleted: false,
    deletedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };

  function makeDb(initialAssets: readonly AssetRecord[]) {
    const assets = new Map(initialAssets.map((asset) => [asset.id, { ...asset }]));

    function queryAssets(filters: Readonly<Record<string, unknown>>): AssetRecord[] {
      return [...assets.values()].filter((asset) => {
        for (const [key, value] of Object.entries(filters)) {
          if (asset[key] !== value) return false;
        }
        return true;
      });
    }

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'DiagramAssets' || name === 'diagramAssets') {
          return {
            doc: vi.fn().mockImplementation((id: string) => ({
              get: vi.fn().mockResolvedValue({
                exists: assets.has(id),
                data: () => assets.get(id),
              }),
              set: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
                assets.set(id, payload as AssetRecord);
              }),
              update: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
                const existing = assets.get(id) ?? ({ id } as AssetRecord);
                assets.set(id, { ...existing, ...payload });
              }),
            })),
            where: vi.fn().mockImplementation((field: string, _op: string, value: unknown) => ({
              where: vi
                .fn()
                .mockImplementation((field2: string, _op2: string, value2: unknown) => ({
                  limit: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({
                      docs: queryAssets({ [field]: value, [field2]: value2 })
                        .slice(0, 1)
                        .map((asset) => ({ data: () => asset })),
                    }),
                  }),
                })),
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({
                  docs: queryAssets({ [field]: value }).map((asset) => ({ data: () => asset })),
                }),
              }),
            })),
          };
        }

        throw new Error(`Unexpected collection ${name}`);
      }),
    };

    return { db, assets };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing asset when a valid diagramAssetId is supplied', async () => {
    const { db, assets } = makeDb([existingAsset]);

    const result = await syncPlaybookDiagramAsset({
      db: db as never,
      userId: 'u1',
      sport: 'football',
      title: 'Mesh',
      diagramAssetId: 'asset-existing',
    });

    expect(result).toEqual({
      diagramAssetId: 'asset-existing',
      diagramUrl: 'https://example.com/mesh.png',
    });
    expect(assets.size).toBe(1);
  });

  it('links by diagramUrl when the asset already exists', async () => {
    const { db, assets } = makeDb([existingAsset]);

    const result = await syncPlaybookDiagramAsset({
      db: db as never,
      userId: 'u1',
      sport: 'football',
      title: 'Mesh',
      diagramUrl: 'https://example.com/mesh.png',
    });

    expect(result).toEqual({
      diagramAssetId: 'asset-existing',
      diagramUrl: 'https://example.com/mesh.png',
    });
    expect(assets.size).toBe(1);
  });

  it('imports a playbook-only image URL into DiagramAssets when no asset exists', async () => {
    const { db, assets } = makeDb([]);

    const result = await syncPlaybookDiagramAsset({
      db: db as never,
      userId: 'u1',
      sport: 'basketball_boys',
      title: 'Horns Twist',
      description: 'Imported from playbook save',
      diagramUrl: 'https://example.com/horns.png',
    });

    expect(result.diagramAssetId).toBeTruthy();
    expect(result.diagramUrl).toBe('https://example.com/horns.png');

    const created = [...assets.values()][0];
    expect(created?.['assetSource']).toBe('external_image');
    expect(created?.['kind']).toBe('sport_play');
    expect(created?.['sport']).toBe('basketball');
    expect(created?.['imageUrl']).toBe('https://example.com/horns.png');
    expect(created?.['storagePath']).toBeUndefined();
    expect(created?.['sourceLayout']).toEqual(
      expect.objectContaining({
        sport: 'basketball',
        title: 'Horns Twist',
        players: [],
        routes: [],
      })
    );
  });
});
