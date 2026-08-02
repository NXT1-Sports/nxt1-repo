import { describe, expect, it, vi } from 'vitest';
import { ExecuteSandboxScriptTool } from '../execute-sandbox-script.tool.js';

type MockDoc = {
  readonly id: string;
  readonly data: () => Record<string, unknown>;
};

function createDb(docs: readonly MockDoc[]) {
  const store = new Map<string, Record<string, unknown>>(
    docs.map((doc) => [doc.id, structuredClone(doc.data())])
  );

  return {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'UniversalFiles') {
        return {
          doc: vi.fn().mockImplementation((id: string) => ({
            get: vi.fn().mockResolvedValue({
              exists: store.has(id),
              id,
              data: () => store.get(id) ?? {},
            }),
          })),
        };
      }

      return {
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
        }),
      };
    }),
  };
}

function makeFilmReviewFile(id: string): MockDoc {
  return {
    id,
    data: () => ({
      teamId: 'team-1',
      type: 'file',
      payloadKind: 'native',
      title: 'Riverside Full Game 2026',
      status: 'ready',
      sport: 'football',
      createdByUserId: 'coach-1',
      ownerUserId: 'coach-1',
      updatedByUserId: 'coach-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      readAccessKeys: ['user:coach-1'],
      writeAccessKeys: ['user:coach-1'],
      payload: {
        asset: {
          url: 'https://cdn.example.com/game.mp4',
          kind: 'video',
          mimeType: 'video/mp4',
        },
        filmReview: {
          uploadMode: 'batch_clips',
          videoUrl: 'https://cdn.example.com/game.mp4',
          source: 'team_files',
          schemaVersion: 2,
          perspective: { offensiveTeam: 'our', defensiveTeam: 'opponent' },
          sources: [
            {
              id: 'source-1',
              order: 0,
              title: 'Play 1',
              videoUrl: 'https://cdn.example.com/1.mp4',
            },
            {
              id: 'source-2',
              order: 1,
              title: 'Play 2',
              videoUrl: 'https://cdn.example.com/2.mp4',
            },
            {
              id: 'source-3',
              order: 2,
              title: 'Play 3',
              videoUrl: 'https://cdn.example.com/3.mp4',
            },
          ],
          timelineState: 'ready',
          timeline: [
            {
              id: 'play-1',
              number: 1,
              label: 'Run right',
              sourceId: 'source-1',
              tags: { odk: 'O', playType: 'Run', result: 'Rush', gainLoss: 4, eff: 'Y' },
            },
            {
              id: 'play-2',
              number: 2,
              label: 'Pass complete',
              sourceId: 'source-2',
              tags: { odk: 'O', playType: 'Pass', result: 'Complete', gainLoss: 12, eff: 'Y' },
            },
            {
              id: 'play-3',
              number: 3,
              label: 'Defensive snap',
              sourceId: 'source-3',
              tags: { odk: 'D', playType: 'Run', result: 'Tackle', gainLoss: 2, eff: 'N' },
            },
          ],
        },
      },
    }),
  };
}

describe('ExecuteSandboxScriptTool', () => {
  it('runs deterministic analysis over inline JSON', async () => {
    const tool = new ExecuteSandboxScriptTool(createDb([]) as never);

    const result = await tool.execute(
      {
        dataSources: [
          {
            sourceType: 'inline_json',
            alias: 'numbers',
            value: [{ value: 2 }, { value: 3 }, { value: 5 }],
          },
        ],
        script:
          'return { total: helpers.sumBy(numbers, item => item.value), count: numbers.length };',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect((result.data as { result: unknown }).result).toEqual({ total: 10, count: 3 });
  });

  it('injects selected film review rows without exposing signed media URLs', async () => {
    const tool = new ExecuteSandboxScriptTool(createDb([makeFilmReviewFile('review-1')]) as never);

    const result = await tool.execute(
      {
        dataSources: [
          {
            sourceType: 'film_review',
            alias: 'film',
            filmReviewId: 'review-1',
            selectedSourceIds: ['source-1', 'source-2'],
          },
        ],
        script: [
          'const offensive = film.selectedTimeline.filter(row => row.tags?.odk === "O");',
          'return {',
          '  selectedRows: film.selectedTimeline.length,',
          '  offensiveRows: offensive.length,',
          '  yards: helpers.sumBy(offensive, row => row.tags?.gainLoss),',
          '  sourceHasVideoUrl: Boolean(film.selectedSources[0].videoUrl),',
          '};',
        ].join('\n'),
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect((result.data as { result: unknown }).result).toEqual({
      selectedRows: 2,
      offensiveRows: 2,
      yards: 16,
      sourceHasVideoUrl: false,
    });
  });

  it('exposes convenience globals for a single film review source', async () => {
    const tool = new ExecuteSandboxScriptTool(createDb([makeFilmReviewFile('review-1')]) as never);

    const result = await tool.execute(
      {
        dataSources: [
          {
            sourceType: 'film_review',
            alias: 'film',
            filmReviewId: 'review-1',
            selectedSourceIds: ['source-1', 'source-2'],
          },
        ],
        script: [
          'const ownMap = Object.fromEntries(rowOwnership.map(item => [item.rowId, item]));',
          'return {',
          '  selectedRows: selectedTimeline.length,',
          '  ownershipRows: rowOwnership.length,',
          '  firstRowKind: ownMap["play-1"]?.rowKind ?? null,',
          '  title,',
          '};',
        ].join('\n'),
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect((result.data as { result: unknown }).result).toEqual({
      selectedRows: 2,
      ownershipRows: 3,
      firstRowKind: 'offense_defense',
      title: 'Riverside Full Game 2026',
    });
  });

  it('returns actionable guidance when ownership fields are requested without a film review data source', async () => {
    const tool = new ExecuteSandboxScriptTool(createDb([]) as never);

    const result = await tool.execute(
      {
        dataSources: [
          {
            sourceType: 'inline_json',
            alias: 'timeline',
            value: [{ id: 'play-1', tags: { playType: 'Run' } }],
          },
        ],
        script: 'return { count: rowOwnership.length, rows: timeline.length };',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('sourceType "film_review"');
    expect(result.error).toContain('selectedTimeline');
    expect(result.error).toContain('rowOwnership');
  });
});
