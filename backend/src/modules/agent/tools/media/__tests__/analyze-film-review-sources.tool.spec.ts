import { describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../base.tool.js';
import { AnalyzeFilmReviewSourcesTool } from '../analyze-film-review-sources.tool.js';

const sourceIds = ['source-1', 'source-2', 'source-3'] as const;

function createDb() {
  return {
    collection: vi.fn(() => ({
      doc: vi.fn((id: string) => ({
        id,
        get: vi.fn().mockResolvedValue({
          exists: id === 'review-1',
          id,
          data: () => ({
            teamId: 'team-1',
            type: 'file',
            payloadKind: 'native',
            title: 'Georgetown Film',
            status: 'ready',
            sport: 'football',
            createdByUserId: 'coach-1',
            updatedByUserId: 'coach-1',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
            payload: {
              asset: {
                url: 'https://cdn.example.com/source-1.mp4',
                kind: 'video',
                mimeType: 'video/mp4',
              },
              filmReview: {
                uploadMode: 'batch_clips',
                videoUrl: 'https://cdn.example.com/source-1.mp4',
                source: 'team_files',
                schemaVersion: 2,
                sources: sourceIds.map((sourceId) => ({
                  id: sourceId,
                  title: sourceId,
                  videoUrl: `https://cdn.example.com/${sourceId}.mp4`,
                })),
                timeline: [],
              },
            },
          }),
        }),
      })),
    })),
  };
}

function createContext(): ToolExecutionContext {
  return {
    userId: 'coach-1',
    operationId: 'operation-1',
    emitStage: vi.fn(),
    emitToolStep: vi.fn(),
  };
}

function observation(player: string): string {
  return JSON.stringify({
    classification: 'offense',
    playerStats: [
      {
        player,
        passingAttempts: 0,
        passingCompletions: 0,
        passingYards: 0,
        passingTouchdowns: 0,
        interceptions: 0,
        rushingAttempts: 1,
        rushingYards: 4,
        rushingTouchdowns: 0,
        receptions: 0,
        receivingYards: 0,
        receivingTouchdowns: 0,
        confidence: 'high',
      },
    ],
  });
}

describe('AnalyzeFilmReviewSourcesTool', () => {
  it('analyzes every requested source with an explicit source pointer and aggregates verified stats', async () => {
    const analyzeVideo = { execute: vi.fn() };
    analyzeVideo.execute.mockImplementation(async (input: Record<string, unknown>) => ({
      success: true,
      data: { analysis: observation(input['sourceId'] === 'source-3' ? '#22' : '#7') },
    }));
    const tool = new AnalyzeFilmReviewSourcesTool(analyzeVideo as never, createDb() as never);

    const context = createContext();
    const result = await tool.execute(
      { filmReviewId: 'review-1', sourceIds, concurrency: 1 },
      context
    );

    expect(result.success).toBe(true);
    expect(analyzeVideo.execute).toHaveBeenCalledTimes(3);
    expect(analyzeVideo.execute.mock.calls.map(([input]) => input['sourceId'])).toEqual(sourceIds);
    expect(result.data).toMatchObject({
      coverage: { requested: 3, analyzed: 3, unavailable: 0, failed: 0, invalidOutput: 0 },
      aggregate: [
        expect.objectContaining({ player: '#22', rushingAttempts: 1, rushingYards: 4 }),
        expect.objectContaining({ player: '#7', rushingAttempts: 2, rushingYards: 8 }),
      ],
    });
    expect(context.emitToolStep).toHaveBeenCalledTimes(6);
    expect(context.emitToolStep).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'step_active',
        toolName: 'analyze_video',
        message: 'Analyzing source-1 (1/3)',
      })
    );
    expect(context.emitToolStep).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        type: 'tool_result',
        toolName: 'analyze_video',
        toolSuccess: true,
        message: 'Analyzing source-3 (3/3)',
      })
    );
  });

  it('fails instead of returning a completed report when any selected source lacks a verified observation', async () => {
    const analyzeVideo = { execute: vi.fn() };
    analyzeVideo.execute.mockImplementation(async (input: Record<string, unknown>) =>
      input['sourceId'] === 'source-2'
        ? { success: false, error: 'Video analysis failed.' }
        : { success: true, data: { analysis: observation('#7') } }
    );
    const tool = new AnalyzeFilmReviewSourcesTool(analyzeVideo as never, createDb() as never);

    const result = await tool.execute(
      { filmReviewId: 'review-1', sourceIds, concurrency: 1 },
      createContext()
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Selected-film analysis is incomplete: 2/3 source clips produced verified observations.'
    );
    expect(result.data).toMatchObject({
      coverage: { requested: 3, analyzed: 2, failed: 1 },
    });
  });
});
