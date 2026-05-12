import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../base.tool.js';
import type { BoardDiagramService } from '../board-diagram.service.js';
import { DeleteBoardDiagramTool } from '../tools/delete-board-diagram.tool.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TEST_CONTEXT: ToolExecutionContext = {
  userId: 'user-42',
  threadId: 'thread-99',
  emitStage: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DeleteBoardDiagramTool', () => {
  const serviceMock = {
    deleteDiagram: vi.fn(),
  } satisfies Pick<BoardDiagramService, 'deleteDiagram'>;

  let tool: DeleteBoardDiagramTool;

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new DeleteBoardDiagramTool(serviceMock as unknown as BoardDiagramService);
  });

  it('returns deleted: true and assetId on success', async () => {
    serviceMock.deleteDiagram.mockResolvedValue(undefined);

    const result = await tool.execute(
      { assetId: 'asset-uuid-1234', userId: 'user-42' },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data['deleted']).toBe(true);
    expect(data['assetId']).toBe('asset-uuid-1234');
    expect(data['message']).toBe('Diagram deleted successfully.');
  });

  it('falls back userId from execution context when not in input', async () => {
    serviceMock.deleteDiagram.mockResolvedValue(undefined);

    await tool.execute({ assetId: 'asset-uuid-1234' }, TEST_CONTEXT);

    expect(serviceMock.deleteDiagram).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-42' }),
      TEST_CONTEXT
    );
  });

  it('returns error when asset not found', async () => {
    serviceMock.deleteDiagram.mockRejectedValue(
      new Error(
        "Diagram asset 'asset-uuid-1234' not found or you do not have permission to delete it."
      )
    );

    const result = await tool.execute({ assetId: 'asset-uuid-1234' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error when service throws generic error', async () => {
    serviceMock.deleteDiagram.mockRejectedValue(new Error('Firestore unavailable'));

    const result = await tool.execute({ assetId: 'asset-uuid-1234' }, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Firestore unavailable');
  });

  it('returns zod error for missing assetId', async () => {
    const result = await tool.execute({}, TEST_CONTEXT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/assetId/i);
  });

  it('does not call service when input is invalid', async () => {
    await tool.execute({ userId: 'user-42' }, TEST_CONTEXT);
    expect(serviceMock.deleteDiagram).not.toHaveBeenCalled();
  });

  it('calls service with both assetId and userId', async () => {
    serviceMock.deleteDiagram.mockResolvedValue(undefined);

    await tool.execute({ assetId: 'asset-abc', userId: 'user-xyz' }, TEST_CONTEXT);

    expect(serviceMock.deleteDiagram).toHaveBeenCalledWith(
      { assetId: 'asset-abc', userId: 'user-xyz' },
      TEST_CONTEXT
    );
  });
});
