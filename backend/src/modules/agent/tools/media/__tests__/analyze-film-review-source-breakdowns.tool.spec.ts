import { describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../base.tool.js';
import { AnalyzeFilmReviewSourceBreakdownsTool } from '../analyze-film-review-source-breakdowns.tool.js';

const sourceIds = ['source-1', 'source-2', 'source-3'] as const;

function createDb(
  options: {
    readonly sources?: readonly string[];
    readonly timeline?: readonly Record<string, unknown>[];
    readonly reviewRevision?: number;
    readonly reviewRevisions?: readonly number[];
  } = {}
) {
  const sources = options.sources ?? sourceIds;
  let reviewReadCount = 0;
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
                reviewRevision:
                  options.reviewRevisions?.[
                    Math.min(reviewReadCount++, options.reviewRevisions.length - 1)
                  ] ??
                  options.reviewRevision ??
                  0,
                sources: sources.map((sourceId) => ({
                  id: sourceId,
                  title: sourceId,
                  durationSec: 8,
                  videoUrl: `https://cdn.example.com/${sourceId}.mp4`,
                })),
                timeline: options.timeline ?? [],
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

function observation(
  input: {
    readonly tags?: Readonly<Record<string, unknown>>;
    readonly status?: 'verified' | 'partial' | 'insufficient';
    readonly applicability?: 'scrimmage' | 'non_scrimmage' | 'unclear';
    readonly playStartSec?: number;
    readonly playEndSec?: number;
  } = {}
): string {
  return JSON.stringify({
    status: input.status ?? 'verified',
    applicability: input.applicability ?? 'scrimmage',
    label: 'Inside zone',
    confidence: 'high',
    playStartSec: input.playStartSec ?? 0,
    playEndSec: input.playEndSec ?? 8,
    tags: input.tags ?? { defFront: 'Even' },
    notes: 'Verified from film',
  });
}

describe('AnalyzeFilmReviewSourceBreakdownsTool', () => {
  it('analyzes all selected sources and submits one create-if-missing patch batch', async () => {
    const analyzeVideo = { execute: vi.fn() };
    analyzeVideo.execute.mockImplementation(async (input: Record<string, unknown>) => ({
      success: true,
      data: {
        analysis: observation({
          tags: { defFront: input['sourceId'] === 'source-2' ? 'Odd' : 'Even' },
        }),
      },
    }));
    const patchSourceBreakdowns = { execute: vi.fn().mockResolvedValue({ success: true }) };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb() as never
    );

    const context = createContext();
    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds,
        requestedTagIds: 'all',
        concurrency: 1,
      },
      context
    );

    expect(result.success).toBe(true);
    expect(analyzeVideo.execute).toHaveBeenCalledTimes(3);
    expect(analyzeVideo.execute.mock.calls.map(([input]) => input['sourceId'])).toEqual(sourceIds);
    expect(analyzeVideo.execute.mock.calls[0]?.[0]['analysisObjectives']).toHaveLength(8);
    expect(analyzeVideo.execute.mock.calls[0]?.[0]['prompt']).toContain(
      'odk (ODK) [enum; allowed values: O, D, K]'
    );
    expect(patchSourceBreakdowns.execute).toHaveBeenCalledTimes(1);
    expect(patchSourceBreakdowns.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        filmReviewId: 'review-1',
        expectedRevision: 0,
        patches: expect.arrayContaining([
          expect.objectContaining({
            sourceId: 'source-2',
            rowId: 'agent-breakdown-source-2-0-8000',
            tags: { defFront: 'Odd' },
            tagProvenance: {
              defFront: expect.objectContaining({
                origin: 'agent_x',
                operationId: 'operation-1',
                updatedAt: expect.any(String),
              }),
            },
            createIfMissing: expect.objectContaining({
              number: 1,
              label: 'Inside zone',
              startSec: 0,
              endSec: 8,
            }),
          }),
        ]),
      }),
      context
    );
    expect(result.data).toMatchObject({
      coverage: {
        requested: 3,
        analyzed: 3,
        unavailable: 0,
        failed: 0,
        invalidOutput: 0,
        insufficient: 0,
      },
      updatedSourceIds: [...sourceIds],
      retryableSourceIds: [],
    });
    expect(context.emitToolStep).toHaveBeenCalledTimes(6);
  });

  it('refreshes the review revision after analysis before persisting patches', async () => {
    const analyzeVideo = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { analysis: observation({ tags: { defFront: 'Odd' } }) },
      }),
    };
    const patchSourceBreakdowns = { execute: vi.fn().mockResolvedValue({ success: true }) };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb({ sources: ['source-1'], reviewRevisions: [0, 1] }) as never
    );

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds: ['source-1'],
        requestedTagIds: ['defFront'],
        concurrency: 1,
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(patchSourceBreakdowns.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        patches: [expect.objectContaining({ sourceId: 'source-1', tags: { defFront: 'Odd' } })],
      }),
      expect.any(Object)
    );
  });

  it('retries once when patch persistence reports a revision conflict', async () => {
    const analyzeVideo = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { analysis: observation({ tags: { defFront: 'Odd' } }) },
      }),
    };
    const patchSourceBreakdowns = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          error: 'Film review revision conflict: expected 1, found 2.',
          data: { code: 'REVISION_CONFLICT', currentRevision: 2 },
        })
        .mockResolvedValueOnce({ success: true }),
    };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb({ sources: ['source-1'], reviewRevisions: [0, 1, 2] }) as never
    );

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds: ['source-1'],
        requestedTagIds: ['defFront'],
        concurrency: 1,
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(patchSourceBreakdowns.execute).toHaveBeenCalledTimes(2);
    expect(
      patchSourceBreakdowns.execute.mock.calls.map(([input]) => input.expectedRevision)
    ).toEqual([1, 2]);
  });

  it('rejects selections larger than 5 clips and returns batching guidance', async () => {
    const selectedSourceIds = Array.from({ length: 18 }, (_, index) => `source-${index + 1}`);
    const analyzeVideo = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { analysis: observation({ tags: { defFront: 'Even' } }) },
      }),
    };
    const patchSourceBreakdowns = { execute: vi.fn().mockResolvedValue({ success: true }) };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb({ sources: selectedSourceIds }) as never
    );

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds: selectedSourceIds,
        requestedTagIds: ['defFront'],
        concurrency: 3,
      },
      createContext()
    );

    expect(result.success).toBe(false);
    expect(analyzeVideo.execute).not.toHaveBeenCalled();
    expect(patchSourceBreakdowns.execute).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      maxSelectedSources: 5,
      requestedSourceCount: 18,
      recommendedNextAction: expect.stringContaining('first 5 sourceIds only'),
    });
    expect(result.error).toContain('accepts at most 5 source clips per call');
  });

  it('persists verified partial success and reports unresolved sources for retry', async () => {
    const analyzeVideo = { execute: vi.fn() };
    analyzeVideo.execute.mockImplementation(async (input: Record<string, unknown>) =>
      input['sourceId'] === 'source-2'
        ? {
            success: true,
            data: {
              analysis: observation({ status: 'insufficient', tags: {} }),
            },
          }
        : input['sourceId'] === 'source-3'
          ? { success: false, error: 'Model timeout' }
          : { success: true, data: { analysis: observation() } }
    );
    const patchSourceBreakdowns = { execute: vi.fn().mockResolvedValue({ success: true }) };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb() as never
    );

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds,
        requestedTagIds: ['defFront'],
        concurrency: 1,
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      coverage: {
        requested: 3,
        analyzed: 1,
        insufficient: 1,
        failed: 1,
      },
      updatedSourceIds: ['source-1'],
      insufficientSourceIds: ['source-2'],
      failedSourceIds: ['source-3'],
      retryableSourceIds: ['source-2', 'source-3'],
    });
    expect(patchSourceBreakdowns.execute).toHaveBeenCalledTimes(1);
    expect(patchSourceBreakdowns.execute.mock.calls[0]?.[0]).toMatchObject({
      patches: [expect.objectContaining({ sourceId: 'source-1' })],
    });
  });

  it('leaves defFront empty for verified non-scrimmage clips', async () => {
    const analyzeVideo = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: {
          analysis: observation({ applicability: 'non_scrimmage', tags: {} }),
        },
      }),
    };
    const patchSourceBreakdowns = { execute: vi.fn().mockResolvedValue({ success: true }) };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb({ sources: ['source-1'] }) as never
    );

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds: ['source-1'],
        requestedTagIds: ['defFront'],
      },
      createContext()
    );

    expect(result.success).toBe(true);
    expect(patchSourceBreakdowns.execute).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      coverage: {
        requested: 1,
        analyzed: 0,
        notApplicable: 1,
      },
      updatedSourceIds: [],
      notApplicableSourceIds: ['source-1'],
      retryableSourceIds: [],
    });
  });

  it('targets the sole existing row without replacing its metadata', async () => {
    const analyzeVideo = {
      execute: vi.fn().mockResolvedValue({ success: true, data: { analysis: observation() } }),
    };
    const patchSourceBreakdowns = { execute: vi.fn().mockResolvedValue({ success: true }) };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb({
        sources: ['source-1'],
        timeline: [
          {
            id: 'existing-row',
            sourceId: 'source-1',
            number: 4,
            label: 'Preserved label',
            startSec: 2,
            endSec: 6,
            tags: { coverage: 'Cover 3' },
          },
        ],
      }) as never
    );

    await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds: ['source-1'],
        requestedTagIds: ['defFront'],
      },
      createContext()
    );

    expect(patchSourceBreakdowns.execute.mock.calls[0]?.[0]).toMatchObject({
      patches: [
        expect.objectContaining({
          sourceId: 'source-1',
          rowId: 'existing-row',
          tags: { defFront: 'Even' },
        }),
      ],
    });
    expect(patchSourceBreakdowns.execute.mock.calls[0]?.[0].patches[0]).not.toHaveProperty(
      'createIfMissing'
    );
  });

  it('uses a unique model time range match when a source has multiple rows', async () => {
    const analyzeVideo = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { analysis: observation({ playStartSec: 10, playEndSec: 18 }) },
      }),
    };
    const patchSourceBreakdowns = { execute: vi.fn().mockResolvedValue({ success: true }) };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb({
        sources: ['source-1'],
        timeline: [
          { id: 'row-1', sourceId: 'source-1', number: 1, label: 'One', startSec: 0, endSec: 8 },
          { id: 'row-2', sourceId: 'source-1', number: 2, label: 'Two', startSec: 10, endSec: 18 },
        ],
      }) as never
    );

    await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds: ['source-1'],
        requestedTagIds: ['defFront'],
      },
      createContext()
    );

    expect(patchSourceBreakdowns.execute.mock.calls[0]?.[0]).toMatchObject({
      patches: [expect.objectContaining({ rowId: 'row-2' })],
    });
  });

  it('does not write when multiple rows cannot be matched unambiguously', async () => {
    const analyzeVideo = {
      execute: vi.fn().mockResolvedValue({ success: true, data: { analysis: observation() } }),
    };
    const patchSourceBreakdowns = { execute: vi.fn().mockResolvedValue({ success: true }) };
    const tool = new AnalyzeFilmReviewSourceBreakdownsTool(
      analyzeVideo as never,
      patchSourceBreakdowns as never,
      createDb({
        sources: ['source-1'],
        timeline: [
          { id: 'row-1', sourceId: 'source-1', number: 1, label: 'One', startSec: 20, endSec: 28 },
          { id: 'row-2', sourceId: 'source-1', number: 2, label: 'Two', startSec: 30, endSec: 38 },
        ],
      }) as never
    );

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds: ['source-1'],
        requestedTagIds: ['defFront'],
      },
      createContext()
    );

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({
      insufficientSourceIds: ['source-1'],
      retryableSourceIds: ['source-1'],
    });
    expect(patchSourceBreakdowns.execute).not.toHaveBeenCalled();
  });
});
