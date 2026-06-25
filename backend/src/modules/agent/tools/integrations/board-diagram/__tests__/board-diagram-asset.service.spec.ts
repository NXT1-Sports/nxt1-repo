import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardDiagramAssetService } from '../services/board-diagram-asset.service.js';
import type { BoardDiagramAsset } from '../shared/board-diagram.types.js';

const SET_MOCK = vi.fn();
const UPDATE_MOCK = vi.fn();
const GET_MOCK = vi.fn();
const DOC_MOCK = vi.fn(() => ({
  set: SET_MOCK,
  update: UPDATE_MOCK,
  get: GET_MOCK,
}));
const GET_QUERY_MOCK = vi.fn();
const LIMIT_MOCK = vi.fn(() => ({ get: GET_QUERY_MOCK }));
const ORDER_BY_MOCK = vi.fn(() => ({ limit: LIMIT_MOCK }));
const WHERE_MOCK = vi.fn(() => ({
  where: WHERE_MOCK_SECOND,
  orderBy: ORDER_BY_MOCK,
  limit: LIMIT_MOCK,
}));
const WHERE_MOCK_SECOND = vi.fn(() => ({ orderBy: ORDER_BY_MOCK }));
const COLLECTION_MOCK = vi.fn(() => ({
  doc: DOC_MOCK,
  where: WHERE_MOCK,
}));

const DB_MOCK = {
  collection: COLLECTION_MOCK,
};

const BASE_ASSET: Omit<BoardDiagramAsset, 'id'> = {
  kind: 'sport_drill',
  sport: 'football',
  title: 'QB Pocket Footwork Accuracy Drill',
  description: 'QB pocket footwork with cone pocket and progression throws',
  imageUrl: 'https://storage.googleapis.com/nxt1-bucket/diagram.png',
  storagePath: 'Users/u1/threads/t1/media/board-diagrams/diagram.png',
  xmlContent: '<mxfile>xml</mxfile>',
  editUrl: 'https://app.diagrams.net/#Rxml',
  sourceLayout: {
    sport: 'football',
    title: 'QB Pocket Footwork Accuracy Drill',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 280,
    players: [
      {
        id: 'qb',
        label: 'QB',
        x: 300,
        y: 300,
        team: 'offense',
      },
    ],
    routes: [
      {
        from: 'qb',
        points: [
          [300, 300],
          [300, 240],
          [260, 220],
        ],
        label: 'drop',
        type: 'cut',
      },
    ],
  },
  userId: 'u1',
  threadId: 't1',
  deleted: false,
  deletedAt: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

describe('BoardDiagramAssetService', () => {
  let service: BoardDiagramAssetService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BoardDiagramAssetService(DB_MOCK as never);
  });

  it('serializes nested route points before writing to Firestore', async () => {
    SET_MOCK.mockResolvedValue(undefined);

    await service.create(BASE_ASSET);

    expect(SET_MOCK).toHaveBeenCalledTimes(1);
    expect(SET_MOCK).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLayout: expect.objectContaining({
          routes: [
            expect.objectContaining({
              points: [
                { x: 300, y: 300 },
                { x: 300, y: 240 },
                { x: 260, y: 220 },
              ],
            }),
          ],
        }),
      })
    );
  });

  it('rehydrates Firestore-safe points back into tuple points on read', async () => {
    GET_MOCK.mockResolvedValue({
      exists: true,
      data: () => ({
        ...BASE_ASSET,
        id: 'asset-1',
        sourceLayout: {
          ...BASE_ASSET.sourceLayout,
          routes: [
            {
              ...BASE_ASSET.sourceLayout.routes[0],
              points: [
                { x: 300, y: 300 },
                { x: 300, y: 240 },
                { x: 260, y: 220 },
              ],
            },
          ],
        },
      }),
    });

    const asset = await service.getById('asset-1', 'u1');

    expect(asset).not.toBeNull();
    expect(asset?.sourceLayout.routes[0]?.points).toEqual([
      [300, 300],
      [300, 240],
      [260, 220],
    ]);
  });

  it('serializes sourceLayout when patching an existing asset', async () => {
    GET_MOCK.mockResolvedValue({
      exists: true,
      data: () => ({ id: 'asset-1', ...BASE_ASSET }),
    });
    UPDATE_MOCK.mockResolvedValue(undefined);

    await service.patch('asset-1', 'u1', {
      sourceLayout: BASE_ASSET.sourceLayout,
      title: 'Updated Drill',
    });

    expect(UPDATE_MOCK).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated Drill',
        sourceLayout: expect.objectContaining({
          routes: [
            expect.objectContaining({
              points: [
                { x: 300, y: 300 },
                { x: 300, y: 240 },
                { x: 260, y: 220 },
              ],
            }),
          ],
        }),
      })
    );
  });

  it('lists active user assets without requiring composite-index query clauses', async () => {
    GET_QUERY_MOCK.mockResolvedValueOnce({
      docs: [
        { data: () => ({ ...BASE_ASSET, id: 'asset-active', createdAt: 3 }) },
        { data: () => ({ ...BASE_ASSET, id: 'asset-deleted', deleted: true, createdAt: 4 }) },
      ],
    });
    GET_QUERY_MOCK.mockResolvedValueOnce({
      docs: [{ data: () => ({ ...BASE_ASSET, id: 'asset-legacy', createdAt: 2 }) }],
    });

    const assets = await service.listByUser('u1', 25);

    expect(COLLECTION_MOCK).toHaveBeenCalledWith('DiagramAssets');
    expect(COLLECTION_MOCK).toHaveBeenCalledWith('diagramAssets');
    expect(WHERE_MOCK).toHaveBeenCalledWith('userId', '==', 'u1');
    expect(WHERE_MOCK_SECOND).not.toHaveBeenCalled();
    expect(ORDER_BY_MOCK).not.toHaveBeenCalled();
    expect(LIMIT_MOCK).toHaveBeenCalledWith(25);
    expect(assets.map((asset) => asset.id)).toEqual(['asset-active', 'asset-legacy']);
  });

  it('tolerates legacy list records without sourceLayout routes', async () => {
    GET_QUERY_MOCK.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            ...BASE_ASSET,
            id: 'asset-legacy-layout',
            sourceLayout: undefined,
          }),
        },
      ],
    });
    GET_QUERY_MOCK.mockResolvedValueOnce({ docs: [] });

    const assets = await service.listByUser('u1');

    expect(assets[0]?.id).toBe('asset-legacy-layout');
    expect(assets[0]?.sourceLayout.routes).toEqual([]);
  });

  it('tolerates malformed legacy route entries', async () => {
    GET_QUERY_MOCK.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            ...BASE_ASSET,
            id: 'asset-malformed-route',
            sourceLayout: {
              ...BASE_ASSET.sourceLayout,
              routes: [null, { points: [{ x: 12, y: 34 }] }],
            },
          }),
        },
      ],
    });
    GET_QUERY_MOCK.mockResolvedValueOnce({ docs: [] });

    const assets = await service.listByUser('u1');

    expect(assets[0]?.sourceLayout.routes).toHaveLength(2);
    expect(assets[0]?.sourceLayout.routes[0]?.points).toEqual([]);
    expect(assets[0]?.sourceLayout.routes[1]?.points).toEqual([[12, 34]]);
  });
});
