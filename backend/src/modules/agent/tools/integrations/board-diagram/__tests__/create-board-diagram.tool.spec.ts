import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';
import type { BoardDiagramService } from '../board-diagram.service.js';
import { CreateBoardDiagramTool } from '../tools/create-board-diagram.tool.js';
import type { BoardDiagramAsset } from '../shared/board-diagram.types.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TEST_CONTEXT: ToolExecutionContext = {
  userId: 'user-42',
  threadId: 'thread-99',
  emitStage: vi.fn(),
};

const MOCK_ASSET: BoardDiagramAsset = {
  id: 'asset-uuid-1234',
  kind: 'sport_play',
  sport: 'football',
  title: 'Cover 2 Zone',
  description: 'Standard cover 2 with deep safeties splitting the field',
  imageUrl:
    'https://storage.googleapis.com/nxt1-bucket/Users/user-42/threads/thread-99/media/board-diagrams/cover-2-zone-1234.png',
  storagePath: 'Users/user-42/threads/thread-99/media/board-diagrams/cover-2-zone-1234.png',
  xmlContent:
    '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>',
  editUrl:
    'https://app.diagrams.net/#R%3CmxGraphModel%3E%3Croot%3E%3C%2Froot%3E%3C%2FmxGraphModel%3E',
  sourceLayout: {
    sport: 'football',
    title: 'Cover 2 Zone',
    fieldWidth: 600,
    fieldHeight: 440,
    losY: 280,
    players: [],
    routes: [],
  },
  userId: 'user-42',
  threadId: 'thread-99',
  deleted: false,
  deletedAt: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const MOCK_DRILL_ASSET: BoardDiagramAsset = {
  ...MOCK_ASSET,
  id: 'asset-drill-5678',
  kind: 'sport_drill',
  title: '3-Man Weave Drill',
  description: 'Three players running a weave pattern to the basket',
  sport: 'basketball',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CreateBoardDiagramTool', () => {
  const serviceMock = {
    createDiagram: vi.fn(),
  } satisfies Pick<BoardDiagramService, 'createDiagram'>;

  let tool: CreateBoardDiagramTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new CreateBoardDiagramTool(serviceMock as unknown as BoardDiagramService);
  });

  it('returns assetId, imageUrl, editUrl, xmlContent, and kind on success', async () => {
    serviceMock.createDiagram.mockResolvedValue(MOCK_ASSET);

    const result = await tool.execute(
      { description: 'Cover 2 zone coverage', sport: 'football' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['assetId']).toBe('asset-uuid-1234');
    expect(data['kind']).toBe('sport_play');
    expect(data['sport']).toBe('football');
    expect(data['imageUrl']).toBe(MOCK_ASSET.imageUrl);
    expect(data['diagramUrl']).toBe(MOCK_ASSET.imageUrl);
    expect(data['editUrl']).toBe(MOCK_ASSET.editUrl);
    expect(data['xmlContent']).toBe(MOCK_ASSET.xmlContent);
    expect(data['title']).toBe('Cover 2 Zone');
    expect(data['mimeType']).toBe('image/png');
  });

  it('defaults kind to sport_play when not provided', async () => {
    serviceMock.createDiagram.mockResolvedValue(MOCK_ASSET);

    await tool.execute({ description: 'Some play', sport: 'football' }, TEST_CONTEXT);

    expect(serviceMock.createDiagram).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'sport_play' }),
      TEST_CONTEXT
    );
  });

  it('passes kind=sport_drill to the service', async () => {
    serviceMock.createDiagram.mockResolvedValue(MOCK_DRILL_ASSET);

    const result = await tool.execute(
      { description: '3-man weave to basket', sport: 'basketball', kind: 'sport_drill' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(serviceMock.createDiagram).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'sport_drill' }),
      TEST_CONTEXT
    );
    const data = result.data as Record<string, unknown>;
    expect(data['kind']).toBe('sport_drill');
  });

  it('includes files, attachments, and mediaArtifact in response', async () => {
    serviceMock.createDiagram.mockResolvedValue(MOCK_ASSET);

    const result = await tool.execute({ description: 'Cover 2', sport: 'football' }, TEST_CONTEXT);

    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data['files'])).toBe(true);
    expect(Array.isArray(data['attachments'])).toBe(true);
    expect(data['mediaArtifact']).toMatchObject({
      source: 'board_diagram_export',
      mimeType: 'image/png',
    });
  });

  it('emits processing_media stage before calling service', async () => {
    serviceMock.createDiagram.mockResolvedValue(MOCK_ASSET);
    const emitStage = vi.fn();

    await tool.execute(
      { description: 'Cover 2', sport: 'football' },
      { ...TEST_CONTEXT, emitStage }
    );

    expect(emitStage).toHaveBeenCalledWith('processing_media', {
      icon: 'media',
      phase: 'create_board_diagram',
    });
  });

  it('returns error when service throws', async () => {
    serviceMock.createDiagram.mockRejectedValue(new Error('LLM timeout'));

    const result = await tool.execute({ description: 'Cover 2', sport: 'football' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toBe('LLM timeout');
  });

  it('returns zod error for missing description', async () => {
    const result = await tool.execute({ sport: 'football' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/description/i);
  });

  it('rejects invalid kind values', async () => {
    const result = await tool.execute({ description: 'Test', kind: 'invalid_kind' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
  });

  it('does not call service when input is invalid', async () => {
    await tool.execute({}, TEST_CONTEXT);
    expect(serviceMock.createDiagram).not.toHaveBeenCalled();
  });
});
