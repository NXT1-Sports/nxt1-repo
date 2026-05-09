import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';
import type { BoardDiagramService } from '../board-diagram.service.js';
import { UpdateBoardDiagramTool } from '../tools/update-board-diagram.tool.js';
import type { BoardDiagramAsset } from '../shared/board-diagram.types.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TEST_CONTEXT: ToolExecutionContext = {
  userId: 'user-42',
  threadId: 'thread-99',
  emitStage: vi.fn(),
};

const UPDATED_ASSET: BoardDiagramAsset = {
  id: 'asset-uuid-1234',
  kind: 'sport_play',
  sport: 'football',
  title: 'Cover 2 Zone — Revised',
  description: 'Cover 2 with cornerbacks in hard cover at the line',
  imageUrl:
    'https://storage.googleapis.com/nxt1-bucket/Users/user-42/threads/thread-99/media/board-diagrams/cover-2-zone-revised-5678.png',
  storagePath: 'Users/user-42/threads/thread-99/media/board-diagrams/cover-2-zone-revised-5678.png',
  xmlContent: '<mxfile><diagram>updated xml</diagram></mxfile>',
  editUrl: 'https://app.diagrams.net/#Rupdated-xml-encoded',
  sourceLayout: {
    sport: 'football',
    title: 'Cover 2 Zone — Revised',
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
  updatedAt: 1_700_100_000_000,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UpdateBoardDiagramTool', () => {
  const serviceMock = {
    updateDiagram: vi.fn(),
  } satisfies Pick<BoardDiagramService, 'updateDiagram'>;

  let tool: UpdateBoardDiagramTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new UpdateBoardDiagramTool(serviceMock as unknown as BoardDiagramService);
  });

  it('returns updated asset fields on success', async () => {
    serviceMock.updateDiagram.mockResolvedValue(UPDATED_ASSET);

    const result = await tool.execute(
      {
        assetId: 'asset-uuid-1234',
        description: 'Cover 2 with cornerbacks in hard cover at the line',
        title: 'Cover 2 Zone — Revised',
        userId: 'user-42',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['assetId']).toBe('asset-uuid-1234');
    expect(data['imageUrl']).toBe(UPDATED_ASSET.imageUrl);
    expect(data['editUrl']).toBe(UPDATED_ASSET.editUrl);
    expect(data['xmlContent']).toContain('updated xml');
    expect(data['title']).toBe('Cover 2 Zone — Revised');
    expect(data['updatedAt']).toBe(1_700_100_000_000);
    expect(data['mimeType']).toBe('image/png');
  });

  it('falls back userId from execution context when not in input', async () => {
    serviceMock.updateDiagram.mockResolvedValue(UPDATED_ASSET);

    await tool.execute(
      { assetId: 'asset-uuid-1234', description: 'New description' },
      TEST_CONTEXT
    );

    expect(serviceMock.updateDiagram).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-42' }),
      TEST_CONTEXT
    );
  });

  it('emits processing_media stage before calling service', async () => {
    serviceMock.updateDiagram.mockResolvedValue(UPDATED_ASSET);
    const emitStage = vi.fn();

    await tool.execute(
      { assetId: 'asset-uuid-1234', description: 'Updated' },
      { ...TEST_CONTEXT, emitStage }
    );

    expect(emitStage).toHaveBeenCalledWith('processing_media', {
      icon: 'media',
      phase: 'update_board_diagram',
    });
  });

  it('returns error when asset not found', async () => {
    serviceMock.updateDiagram.mockRejectedValue(
      new Error(
        "Diagram asset 'asset-uuid-1234' not found or you do not have permission to update it."
      )
    );

    const result = await tool.execute(
      { assetId: 'asset-uuid-1234', description: 'Update' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error when service throws generic error', async () => {
    serviceMock.updateDiagram.mockRejectedValue(new Error('Network failure'));

    const result = await tool.execute(
      { assetId: 'asset-uuid-1234', description: 'Update' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network failure');
  });

  it('returns zod error for missing assetId', async () => {
    const result = await tool.execute({ description: 'No assetId' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/assetId/i);
  });

  it('does not call service when input is invalid', async () => {
    await tool.execute({}, TEST_CONTEXT);
    expect(serviceMock.updateDiagram).not.toHaveBeenCalled();
  });

  it('includes files, attachments, and mediaArtifact in response', async () => {
    serviceMock.updateDiagram.mockResolvedValue(UPDATED_ASSET);

    const result = await tool.execute(
      { assetId: 'asset-uuid-1234', description: 'Updated' },
      TEST_CONTEXT
    );

    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data['files'])).toBe(true);
    expect(Array.isArray(data['attachments'])).toBe(true);
    expect(data['mediaArtifact']).toMatchObject({
      source: 'board_diagram_export',
      mimeType: 'image/png',
    });
  });
});
