/**
 * @fileoverview Unit Tests — BuildRecruitingBoardTool
 * @module @nxt1/backend/modules/agent/tools/analytics
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock FieldValue since firebase-admin is not available in test
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
  FieldValue: {
    serverTimestamp: vi.fn().mockReturnValue({ _isFieldValue: true }),
  },
}));

import { BuildRecruitingBoardTool } from '../build-recruiting-board.tool.js';

// ─── Mock Helpers ───────────────────────────────────────────────────────────

function createMockFirestore(opts?: {
  boardExists?: boolean;
  boardData?: Record<string, unknown>;
  setError?: unknown;
  updateError?: unknown;
}) {
  const boardDoc = {
    exists: opts?.boardExists ?? false,
    data: () =>
      opts?.boardData ?? {
        name: 'Class of 2026',
        sport: 'football',
        prospects: [],
      },
  };

  const boardRef = {
    id: 'board-abc-123',
    get: vi.fn().mockResolvedValue(boardDoc),
    set: opts?.setError
      ? vi.fn().mockRejectedValue(opts.setError)
      : vi.fn().mockResolvedValue(undefined),
    update: opts?.updateError
      ? vi.fn().mockRejectedValue(opts.updateError)
      : vi.fn().mockResolvedValue(undefined),
  };

  return {
    db: {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue(boardRef),
          }),
        }),
      }),
    },
    boardRef,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('BuildRecruitingBoardTool', () => {
  let tool: BuildRecruitingBoardTool;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should expose expected tool metadata', () => {
      const { db } = createMockFirestore();
      tool = new BuildRecruitingBoardTool(db as never);

      expect(tool.name).toBe('build_recruiting_board');
      expect(tool.isMutation).toBe(true);
      expect(tool.category).toBe('database');
      expect(tool.allowedAgents).toContain('recruiting_coordinator');
      expect(tool.allowedAgents).toContain('performance_coordinator');

      const params = tool.parameters as Record<string, unknown>;
      const required = params['required'] as string[];
      expect(required).toContain('teamId');
      expect(required).toContain('operation');
    });
  });

  describe('input validation', () => {
    it('should return error when teamId is missing', async () => {
      const { db } = createMockFirestore();
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({ operation: 'create' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('teamId');
    });

    it('should return error when operation is missing', async () => {
      const { db } = createMockFirestore();
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({ teamId: 'team1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('operation');
    });

    it('should return error for invalid operation', async () => {
      const { db } = createMockFirestore();
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({ teamId: 'team1', operation: 'invalid' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid operation');
    });
  });

  describe('create operation', () => {
    it('should create a new board with prospects', async () => {
      const { db, boardRef } = createMockFirestore();
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({
        teamId: 'team1',
        operation: 'create',
        boardName: 'Top Recruits 2026',
        sport: 'football',
        prospects: [
          { userId: 'p1', name: 'John Doe', position: 'QB', classOf: 2026 },
          { userId: 'p2', name: 'Jane Smith', position: 'WR', classOf: 2026 },
        ],
      });

      expect(result.success).toBe(true);
      expect(boardRef.set).toHaveBeenCalledTimes(1);
      const data = result.data as Record<string, unknown>;
      expect(data['prospectCount']).toBe(2);
      expect(data['boardName']).toBe('Top Recruits 2026');
    });

    it('should handle Firestore write errors', async () => {
      const { db } = createMockFirestore({
        setError: new Error('PERMISSION_DENIED'),
      });
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({
        teamId: 'team1',
        operation: 'create',
        boardName: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('PERMISSION_DENIED');
    });
  });

  describe('read operation', () => {
    it('should return error when boardId is missing', async () => {
      const { db } = createMockFirestore();
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({ teamId: 'team1', operation: 'read' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('boardId');
    });

    it('should return board data when found', async () => {
      const { db } = createMockFirestore({
        boardExists: true,
        boardData: {
          name: 'Class of 2026',
          sport: 'football',
          prospects: [
            { userId: 'p1', name: 'John', position: 'QB', status: 'contacted', priority: 1 },
            { userId: 'p2', name: 'Jane', position: 'WR', status: 'scouted', priority: 2 },
          ],
        },
      });
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({
        teamId: 'team1',
        operation: 'read',
        boardId: 'board1',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['totalProspects']).toBe(2);
      expect(data['statusSummary']).toBeDefined();
    });

    it('should return error when board not found', async () => {
      const { db } = createMockFirestore({ boardExists: false });
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({
        teamId: 'team1',
        operation: 'read',
        boardId: 'missing',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('add operation', () => {
    it('should add new prospects to an existing board', async () => {
      const { db, boardRef } = createMockFirestore({
        boardExists: true,
        boardData: {
          name: 'Board',
          prospects: [
            {
              userId: 'existing1',
              name: 'Existing',
              position: 'RB',
              status: 'contacted',
              priority: 1,
              addedAt: '2024-01-01',
              updatedAt: '2024-01-01',
            },
          ],
        },
      });
      tool = new BuildRecruitingBoardTool(db as never);

      const result = await tool.execute({
        teamId: 'team1',
        operation: 'add',
        boardId: 'board1',
        prospects: [
          { userId: 'new1', name: 'New Prospect', position: 'QB' },
          { userId: 'existing1', name: 'Duplicate', position: 'RB' },
        ],
      });

      expect(result.success).toBe(true);
      expect(boardRef.update).toHaveBeenCalledTimes(1);
      const data = result.data as Record<string, unknown>;
      expect(data['addedCount']).toBe(1);
      expect(data['skippedDuplicates']).toBe(1);
    });
  });
});
