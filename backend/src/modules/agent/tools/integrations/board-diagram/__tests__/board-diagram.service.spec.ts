/**
 * @fileoverview BoardDiagramService unit tests.
 *
 * Strategy: mock the LLM, mock Firebase Storage, mock Firestore CRUD —
 * verify the orchestration logic (create / update / delete) and the
 * buildSystemPromptForKind helper without actually hitting external services.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { resetFeatureFlagsService } from '../../../../../../config/feature-flags/index.js';

// ── Firebase mocks (must precede service import) ───────────────────────────

const MOCK_STORAGE_BUCKET = {
  name: 'nxt1-test-bucket',
  file: vi.fn(),
};
const MOCK_FILE = {
  save: vi.fn(),
  delete: vi.fn(),
  publicUrl: vi.fn(),
  makePublic: vi.fn(),
  exists: vi.fn(),
};
MOCK_STORAGE_BUCKET.file.mockReturnValue(MOCK_FILE);
MOCK_FILE.publicUrl.mockReturnValue(
  'https://storage.googleapis.com/nxt1-bucket/board-diagrams/test.png'
);
MOCK_FILE.makePublic.mockResolvedValue(undefined);
MOCK_FILE.exists.mockResolvedValue([true]);

vi.mock('../../../../../../utils/firebase.js', () => ({
  db: {},
  storage: { bucket: vi.fn(() => MOCK_STORAGE_BUCKET) },
}));

vi.mock('../../../../../../utils/firebase-staging.js', () => ({
  stagingDb: {},
  stagingStorage: { bucket: vi.fn(() => MOCK_STORAGE_BUCKET) },
}));

// ── Firestore asset service mock ───────────────────────────────────────────

const mockCreate = vi.fn();
const mockGetById = vi.fn();
const mockPatch = vi.fn();
const mockSoftDelete = vi.fn();

vi.mock('../services/board-diagram-asset.service.js', () => ({
  BoardDiagramAssetService: class {
    create = mockCreate;
    getById = mockGetById;
    patch = mockPatch;
    softDelete = mockSoftDelete;
  },
}));

// ── sharp mock ─────────────────────────────────────────────────────────────

vi.mock('sharp', () => {
  const sharpMock = vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('PNG_DATA')),
  }));
  return { default: sharpMock };
});

// ── Now import the service (after mocks are in place) ─────────────────────

import { BoardDiagramService } from '../board-diagram.service.js';
import type { OpenRouterService } from '../../../llm/openrouter.service.js';
import type { ToolExecutionContext } from '../../../base.tool.js';
import type { BoardDiagramAsset } from '../shared/board-diagram.types.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const MINIMAL_LAYOUT_JSON = JSON.stringify({
  sport: 'football',
  title: 'Cover 2',
  fieldWidth: 600,
  fieldHeight: 440,
  losY: 280,
  players: [
    // Defense-only fixture for cover-2 validation
    { id: 's1', label: 'S', x: 150, y: 100, team: 'defense', shape: 'square' },
    { id: 's2', label: 'S', x: 450, y: 100, team: 'defense', shape: 'square' },
    { id: 'cb1', label: 'CB', x: 90, y: 270, team: 'defense', shape: 'square' },
    { id: 'cb2', label: 'CB', x: 510, y: 270, team: 'defense', shape: 'square' },
    { id: 'lb1', label: 'LB', x: 220, y: 200, team: 'defense', shape: 'square' },
    { id: 'lb2', label: 'LB', x: 380, y: 200, team: 'defense', shape: 'square' },
    { id: 'dl1', label: 'DE', x: 240, y: 270, team: 'defense', shape: 'square' },
    { id: 'dl2', label: 'DT', x: 300, y: 265, team: 'defense', shape: 'square' },
    { id: 'dl3', label: 'DE', x: 360, y: 270, team: 'defense', shape: 'square' },
  ],
  routes: [],
});

const MINIMAL_DRILL_LAYOUT_JSON = JSON.stringify({
  sport: 'basketball',
  title: '3-Man Weave',
  fieldWidth: 600,
  fieldHeight: 440,
  losY: 264,
  players: [
    { id: 'p1', label: 'P1', x: 150, y: 380, team: 'offense', shape: 'circle' },
    { id: 'p2', label: 'P2', x: 300, y: 380, team: 'offense', shape: 'circle' },
    { id: 'p3', label: 'P3', x: 450, y: 380, team: 'offense', shape: 'circle' },
  ],
  routes: [
    {
      from: 'p1',
      points: [
        [150, 380],
        [300, 200],
      ],
      type: 'go',
    },
    {
      from: 'p2',
      points: [
        [300, 380],
        [450, 200],
      ],
      type: 'cut',
    },
    {
      from: 'p3',
      points: [
        [450, 380],
        [150, 200],
      ],
      type: 'cut',
    },
  ],
});

const MOCK_ASSET: BoardDiagramAsset = {
  id: 'asset-uuid-1234',
  kind: 'sport_play',
  sport: 'football',
  title: 'Cover 2',
  description: 'Standard cover 2 zone',
  imageUrl:
    'https://storage.googleapis.com/nxt1-bucket/Users/u1/threads/t1/media/board-diagrams/cover-2-1234.png',
  storagePath: 'Users/u1/threads/t1/media/board-diagrams/cover-2-1234.png',
  svgUrl:
    'https://storage.googleapis.com/nxt1-bucket/Users/u1/threads/t1/media/board-diagrams/cover-2-1234.svg',
  svgStoragePath: 'Users/u1/threads/t1/media/board-diagrams/cover-2-1234.svg',
  xmlContent: '<mxfile>xml</mxfile>',
  editUrl: 'https://app.diagrams.net/#Rxml-encoded',
  sourceLayout: {
    sport: 'football',
    title: 'Cover 2',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 280,
    players: [],
    routes: [],
  },
  userId: 'u1',
  threadId: 't1',
  deleted: false,
  deletedAt: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const TEST_CONTEXT: ToolExecutionContext = {
  userId: 'u1',
  threadId: 't1',
  environment: 'production',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

// ── fetch mock for Tavily ──────────────────────────────────────────────────

const MOCK_TAVILY_RESPONSE = {
  query: 'cover 2 football play',
  images: ['https://example.com/cover2.png'],
  results: [
    {
      title: 'Cover 2 Defense',
      url: 'https://example.com/cover2',
      content: 'The cover 2 is a two-deep zone defense with corner underneath...',
    },
  ],
};

const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(MOCK_TAVILY_RESPONSE),
} as unknown as Response);

vi.stubGlobal('fetch', fetchMock);

describe('BoardDiagramService', () => {
  let llmMock: { complete: Mock };
  let service: BoardDiagramService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetFeatureFlagsService();

    llmMock = {
      complete: vi.fn().mockResolvedValue({ content: MINIMAL_LAYOUT_JSON }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(MOCK_TAVILY_RESPONSE),
    } as unknown as Response);

    MOCK_STORAGE_BUCKET.file.mockReturnValue(MOCK_FILE);
    MOCK_FILE.save.mockResolvedValue(undefined);
    MOCK_FILE.makePublic.mockResolvedValue(undefined);
    MOCK_FILE.exists.mockResolvedValue([true]);
    MOCK_FILE.delete.mockResolvedValue(undefined);
    MOCK_FILE.publicUrl.mockReturnValue(MOCK_ASSET.imageUrl);

    mockCreate.mockResolvedValue(MOCK_ASSET);
    mockGetById.mockResolvedValue(MOCK_ASSET);
    mockPatch.mockResolvedValue({ ...MOCK_ASSET, updatedAt: 1_700_100_000_000 });
    mockSoftDelete.mockResolvedValue(true);

    service = new BoardDiagramService(llmMock as unknown as OpenRouterService);
  });

  // ── createDiagram ─────────────────────────────────────────────────────────
  // NOTE: createDiagram now uses Tavily web search (LLM-based generation is disabled).
  // Tests verify the web-search orchestration path.

  describe('createDiagram', () => {
    it('returns a BoardDiagramAsset with correct kind and sport on success', async () => {
      const asset = await service.createDiagram(
        {
          description: 'Standard cover 2 zone with deep safeties',
          sport: 'football',
          title: 'Cover 2',
          kind: 'sport_play',
        },
        TEST_CONTEXT
      );

      expect(asset.id).toMatch(/^[0-9a-f-]{36}$/); // random UUID
      expect(asset.kind).toBe('sport_play');
      expect(asset.sport).toBe('football');
      expect(asset.userId).toBe('u1');
      expect(asset.threadId).toBe('t1');
    }, 15_000);

    it('calls Tavily search with the diagram description', async () => {
      await service.createDiagram(
        {
          description: '3-man weave drill from baseline',
          sport: 'basketball',
          kind: 'sport_drill',
        },
        TEST_CONTEXT
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    }, 15_000);

    it('uses drill search query when kind is sport_drill', async () => {
      await service.createDiagram(
        {
          description: '3-man weave baseline drill',
          sport: 'basketball',
          kind: 'sport_drill',
        },
        TEST_CONTEXT
      );

      const callBody = JSON.parse(
        (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
      ) as { query: string };
      expect(callBody.query).toMatch(/drill/i);
    });

    it('defaults sport to football when not specified', async () => {
      const asset = await service.createDiagram(
        { description: 'Some play', kind: 'sport_play' },
        TEST_CONTEXT
      );

      expect(asset.sport).toBe('football');
    });

    it('returns asset with imageUrl from Tavily images', async () => {
      const asset = await service.createDiagram(
        { description: 'Test play', sport: 'football', kind: 'sport_play' },
        TEST_CONTEXT
      );

      expect(asset.imageUrl).toBe('https://example.com/cover2.png');
    });

    it('returns asset with empty imageUrl when Tavily returns no images', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ ...MOCK_TAVILY_RESPONSE, images: [] }),
      } as unknown as Response);

      const asset = await service.createDiagram(
        { description: 'Test play', sport: 'football', kind: 'sport_play' },
        TEST_CONTEXT
      );

      expect(asset.imageUrl).toBe('');
    });

    it('returns fallback asset when Tavily search fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      const asset = await service.createDiagram(
        { description: 'Cover 2', sport: 'football', kind: 'sport_play' },
        TEST_CONTEXT
      );

      // Returns a fallback asset rather than throwing
      expect(asset.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(asset.kind).toBe('sport_play');
    });
  });

  // ── updateDiagram ─────────────────────────────────────────────────────────

  describe('updateDiagram', () => {
    it('returns updated asset on success', async () => {
      const updated = await service.updateDiagram(
        {
          assetId: 'asset-uuid-1234',
          userId: 'u1',
          description: 'Revised cover 2 with cornerbacks pressing',
        },
        TEST_CONTEXT
      );

      expect(updated.id).toBe('asset-uuid-1234');
      expect(mockPatch).toHaveBeenCalledTimes(1);
      expect(mockPatch).toHaveBeenCalledWith(
        'asset-uuid-1234',
        'u1',
        expect.objectContaining({
          svgUrl: expect.stringContaining('.svg'),
          svgStoragePath: expect.stringContaining('.svg'),
        })
      );
    });

    it('throws when asset not found', async () => {
      mockGetById.mockResolvedValue(null);

      await expect(
        service.updateDiagram({ assetId: 'ghost-id', userId: 'u1' }, TEST_CONTEXT)
      ).rejects.toThrow(/not found/i);
    });

    it('deletes old PNG non-fatally even when delete fails', async () => {
      MOCK_FILE.delete.mockRejectedValueOnce(new Error('Storage gone'));

      // Should resolve, not throw
      await expect(
        service.updateDiagram({ assetId: 'asset-uuid-1234', userId: 'u1' }, TEST_CONTEXT)
      ).resolves.toBeDefined();
    });
  });

  // ── deleteDiagram ─────────────────────────────────────────────────────────

  describe('deleteDiagram', () => {
    it('soft-deletes asset and removes PNG', async () => {
      await service.deleteDiagram({ assetId: 'asset-uuid-1234', userId: 'u1' }, TEST_CONTEXT);

      expect(mockSoftDelete).toHaveBeenCalledWith('asset-uuid-1234', 'u1');
      expect(MOCK_FILE.delete).toHaveBeenCalledTimes(2);
    });

    it('throws when asset not found', async () => {
      mockGetById.mockResolvedValue(null);

      await expect(
        service.deleteDiagram({ assetId: 'ghost-id', userId: 'u1' }, TEST_CONTEXT)
      ).rejects.toThrow(/not found/i);
    });

    it('completes soft-delete even when PNG deletion fails', async () => {
      MOCK_FILE.delete.mockRejectedValueOnce(new Error('Storage error'));

      await expect(
        service.deleteDiagram({ assetId: 'asset-uuid-1234', userId: 'u1' }, TEST_CONTEXT)
      ).resolves.toBeUndefined();

      expect(mockSoftDelete).toHaveBeenCalledTimes(1);
    });
  });
});
