/**
 * @fileoverview BoardDiagramService unit tests.
 *
 * Strategy: mock the LLM, mock Firebase Storage, mock Firestore CRUD —
 * verify the orchestration logic (create / update / delete) and the
 * buildSystemPromptForKind helper without actually hitting external services.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

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
    // Offense (8 players — meets football minimum)
    { id: 'qb', label: 'QB', x: 300, y: 310, team: 'offense', shape: 'circle' },
    { id: 'rb', label: 'RB', x: 300, y: 340, team: 'offense', shape: 'circle' },
    { id: 'wr1', label: 'WR', x: 100, y: 280, team: 'offense', shape: 'circle' },
    { id: 'wr2', label: 'WR', x: 500, y: 280, team: 'offense', shape: 'circle' },
    { id: 'te', label: 'TE', x: 420, y: 280, team: 'offense', shape: 'circle' },
    { id: 'ol1', label: 'C', x: 300, y: 280, team: 'offense', shape: 'circle' },
    { id: 'ol2', label: 'LG', x: 260, y: 280, team: 'offense', shape: 'circle' },
    { id: 'ol3', label: 'RG', x: 340, y: 280, team: 'offense', shape: 'circle' },
    // Defense (cover 2)
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

describe('BoardDiagramService', () => {
  let llmMock: { chat: Mock };
  let service: BoardDiagramService;

  beforeEach(() => {
    vi.clearAllMocks();

    llmMock = {
      complete: vi.fn().mockResolvedValue({ content: MINIMAL_LAYOUT_JSON }),
    };

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

  describe('createDiagram', () => {
    it('returns a full BoardDiagramAsset on success', async () => {
      const asset = await service.createDiagram(
        {
          description: 'Standard cover 2 zone with deep safeties',
          sport: 'football',
          title: 'Cover 2',
          kind: 'sport_play',
        },
        TEST_CONTEXT
      );

      expect(asset.id).toBe('asset-uuid-1234');
      expect(asset.kind).toBe('sport_play');
      expect(asset.imageUrl).toContain('https://storage.googleapis.com');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('calls LLM with a system prompt containing sport context', async () => {
      await service.createDiagram(
        {
          description: '3-man weave drill from baseline',
          sport: 'basketball',
          kind: 'sport_drill',
        },
        TEST_CONTEXT
      );

      expect(llmMock.complete).toHaveBeenCalledWith(
        expect.objectContaining({}),
        expect.objectContaining({
          tier: 'prompt_engineering',
        })
      );

      const callArgs = (llmMock.complete.mock.calls[0] as [unknown[], unknown])[0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = callArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('basketball');
    });

    it('uses drill system prompt when kind is sport_drill', async () => {
      llmMock.complete.mockResolvedValue({ content: MINIMAL_DRILL_LAYOUT_JSON });

      await service.createDiagram(
        {
          description: '3-man weave baseline drill',
          sport: 'basketball',
          kind: 'sport_drill',
        },
        TEST_CONTEXT
      );

      const callArgs = (llmMock.complete.mock.calls[0] as [unknown[], unknown])[0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = callArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toMatch(/drill|Drill/);
    });

    it('defaults sport to football when not specified', async () => {
      await service.createDiagram({ description: 'Some play', kind: 'sport_play' }, TEST_CONTEXT);

      const callArgs = (llmMock.complete.mock.calls[0] as [unknown[], unknown])[0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = callArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('football');
    });

    it('saves PNG to Firebase Storage', async () => {
      await service.createDiagram(
        { description: 'Test play', sport: 'football', kind: 'sport_play' },
        TEST_CONTEXT
      );

      expect(MOCK_FILE.save).toHaveBeenCalledWith(
        expect.anything(), // Buffer (or Buffer-like from sharp mock)
        expect.objectContaining({ metadata: expect.anything() })
      );
    });

    it('throws when LLM returns invalid JSON', async () => {
      llmMock.complete.mockResolvedValue({ content: 'NOT JSON AT ALL' });

      await expect(
        service.createDiagram(
          { description: 'Cover 2', sport: 'football', kind: 'sport_play' },
          TEST_CONTEXT
        )
      ).rejects.toThrow(/(invalid|not valid|JSON)/i);
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
      expect(MOCK_FILE.delete).toHaveBeenCalledTimes(1);
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
