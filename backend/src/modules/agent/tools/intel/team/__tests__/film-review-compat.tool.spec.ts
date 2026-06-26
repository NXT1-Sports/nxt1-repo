import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

import {
  AddFilmReviewAnnotationTool,
  AddFilmReviewSourceTool,
  DeleteFilmReviewTool,
  SaveFilmReviewTool,
  RefreshFilmReviewAiTool,
  GetFilmReviewSourceBreakdownTool,
  GetFilmReviewTool,
  ListFilmReviewSourcesTool,
  ListFilmReviewsTool,
  UpdateFilmReviewSourceBreakdownTool,
} from '../film-review-compat.tool.js';

type MockDoc = {
  readonly id: string;
  readonly data: () => Record<string, unknown>;
};

function createUniversalFileQuery(
  getDocs: () => readonly MockDoc[],
  filters: readonly { field: string; value: unknown }[] = []
): {
  readonly where: ReturnType<typeof vi.fn>;
  readonly orderBy: ReturnType<typeof vi.fn>;
  readonly limit: ReturnType<typeof vi.fn>;
  readonly get: ReturnType<typeof vi.fn>;
} {
  const applyFilters = () =>
    getDocs().filter((doc) => {
      const record = doc.data();
      return filters.every(({ field, value }) => {
        const current = field
          .split('.')
          .reduce<unknown>(
            (acc, key) =>
              acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
            record
          );
        return current === value;
      });
    });

  return {
    where: vi
      .fn()
      .mockImplementation((field: string, _op: string, value: unknown) =>
        createUniversalFileQuery(getDocs, [...filters, { field, value }])
      ),
    orderBy: vi.fn().mockImplementation(() => createUniversalFileQuery(getDocs, filters)),
    limit: vi.fn().mockImplementation((limit: number) => ({
      get: vi.fn().mockResolvedValue({
        docs: applyFilters().slice(0, limit),
        empty: applyFilters().length === 0,
        size: applyFilters().slice(0, limit).length,
      }),
    })),
    get: vi.fn().mockResolvedValue({
      docs: applyFilters(),
      empty: applyFilters().length === 0,
      size: applyFilters().length,
    }),
  };
}

function createDb(docs: readonly MockDoc[]) {
  const store = new Map<string, Record<string, unknown>>(
    docs.map((doc) => [doc.id, structuredClone(doc.data())])
  );

  const getDocs = (): readonly MockDoc[] =>
    [...store.entries()].map(([id, data]) => ({
      id,
      data: () => data,
    }));

  return {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'Teams') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ ownerId: 'coach-1' }) }),
          }),
        };
      }

      if (name === 'UniversalFiles') {
        return {
          doc: vi.fn().mockImplementation((id: string) => ({
            get: vi.fn().mockResolvedValue({
              exists: store.has(id),
              id,
              data: () => store.get(id) ?? {},
            }),
            set: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
              const existing = store.get(id) ?? {};
              store.set(id, { ...existing, ...structuredClone(payload) });
            }),
            delete: vi.fn().mockImplementation(async () => {
              store.delete(id);
            }),
          })),
          where: vi
            .fn()
            .mockImplementation((field: string, _op: string, value: unknown) =>
              createUniversalFileQuery(getDocs, [{ field, value }])
            ),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };
}

function makeFilmReviewFile(id: string, overrides: Record<string, unknown> = {}): MockDoc {
  return {
    id,
    data: () => ({
      teamId: 'team-1',
      type: 'file',
      payloadKind: 'native',
      title: 'Opponent Week 1',
      status: 'ready',
      sport: 'football',
      createdByUserId: 'coach-1',
      updatedByUserId: 'coach-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      classification: {
        primary: 'film_review',
        route: 'film_review',
        labels: ['film_review', 'video_analysis'],
      },
      payload: {
        asset: {
          url: 'https://cdn.example.com/video.mp4',
          kind: 'video',
          mimeType: 'video/mp4',
        },
        filmReview: {
          uploadMode: 'single_video',
          videoUrl: 'https://cdn.example.com/video.mp4',
          source: 'team_files',
          schemaVersion: 2,
          aiSummary: 'Heavy run tendency on first down.',
          keyInsights: ['Uses orbit motion to trigger edge fits'],
          sources: [
            {
              id: 'source-1',
              order: 0,
              title: 'Video 2026',
              videoUrl: 'https://cdn.example.com/video.mp4',
            },
          ],
          timelineState: 'ready',
          timeline: [
            {
              id: 'play-1',
              number: 1,
              label: '1st and 10 run right',
              startSec: 10,
              endSec: 18,
              sourceId: 'source-1',
            },
          ],
        },
      },
      ...overrides,
    }),
  };
}

describe('film review compatibility tools', () => {
  it('loads a film review from a UniversalFiles record', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new GetFilmReviewTool(db as never);

    const result = await tool.execute({ filmReviewId: 'review-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    const data = result.data as { review: { id: string; title: string } };
    expect(data.review.id).toBe('review-1');
    expect(data.review.title).toBe('Opponent Week 1');
  });

  it('lists film reviews across film_review and classified file records', async () => {
    const directFilmReviewDoc: MockDoc = {
      id: 'review-2',
      data: () => ({
        teamId: 'team-1',
        type: 'film_review',
        payloadKind: 'native',
        title: 'Opponent Week 2',
        status: 'ready',
        sport: 'football',
        createdByUserId: 'coach-1',
        updatedByUserId: 'coach-1',
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
        payload: {
          videoUrl: 'https://cdn.example.com/video-2.mp4',
          source: 'team_files',
          schemaVersion: 2,
          sources: [],
          timeline: [],
        },
      }),
    };
    const db = createDb([makeFilmReviewFile('review-1'), directFilmReviewDoc]);
    const tool = new ListFilmReviewsTool(db as never);

    const result = await tool.execute({ teamId: 'team-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    const data = result.data as { reviews: Array<{ id: string }> };
    expect(data.reviews.map((review) => review.id)).toEqual(['review-2', 'review-1']);
  });

  it('returns sources and source breakdown rows for one review source', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const listSourcesTool = new ListFilmReviewSourcesTool(db as never);
    const breakdownTool = new GetFilmReviewSourceBreakdownTool(db as never);

    const sourcesResult = await listSourcesTool.execute(
      { filmReviewId: 'review-1' },
      { userId: 'coach-1' }
    );
    const breakdownResult = await breakdownTool.execute(
      { filmReviewId: 'review-1', sourceId: 'source-1' },
      { userId: 'coach-1' }
    );

    expect(sourcesResult.success).toBe(true);
    expect(breakdownResult.success).toBe(true);

    const sourcesData = sourcesResult.data as { sources: Array<{ id: string }> };
    const breakdownData = breakdownResult.data as { timeline: Array<{ id: string }> };
    expect(sourcesData.sources[0]?.id).toBe('source-1');
    expect(breakdownData.timeline[0]?.id).toBe('play-1');
  });

  it('updates one source breakdown table on an existing review', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new UpdateFilmReviewSourceBreakdownTool(db as never);

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceId: 'source-1',
        timeline: JSON.stringify([
          {
            playNumber: 1,
            startSec: 0,
            endSec: 1,
            odk: 'O',
            playType: 'Pass',
            result: 'Incomplete',
          },
        ]),
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      timeline: Array<{ sourceId?: string; tags?: Record<string, unknown> }>;
    };
    expect(data.timeline).toHaveLength(1);
    expect(data.timeline[0]?.sourceId).toBe('source-1');
    expect(data.timeline[0]?.tags?.['playType']).toBe('Pass');
  });

  it('saves timeline updates on an existing review', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new SaveFilmReviewTool(db as never);

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        title: 'IMG_0093 2.MOV Breakdown',
        sport: 'Football',
        timeline: JSON.stringify([
          {
            playNumber: 1,
            startSec: 0,
            endSec: 1,
            sourceId: 'source-1',
            odk: 'O',
            playType: 'Pass',
            result: 'Incomplete',
          },
        ]),
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      review: { title: string; sport: string; timeline?: Array<{ sourceId?: string }> };
    };
    expect(data.review.title).toBe('IMG_0093 2.MOV Breakdown');
    expect(data.review.sport).toBe('football');
    expect(data.review.timeline?.[0]?.sourceId).toBe('source-1');
  });

  it('adds a source clip to an existing review', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new AddFilmReviewSourceTool(db as never);

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        source: {
          id: 'source-2',
          order: 1,
          title: 'Endzone Copy',
          videoUrl: 'https://cdn.example.com/video-2.mp4',
        },
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as { sources: Array<{ id: string }> };
    expect(data.sources.map((source) => source.id)).toEqual(['source-1', 'source-2']);
  });

  it('adds an annotation to an existing review', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new AddFilmReviewAnnotationTool(db as never);

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        note: 'Watch the alley defender here',
        atSec: 12,
        color: '#ffcc00',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as { annotations: Array<{ note: string; atSec: number }> };
    expect(data.annotations).toHaveLength(1);
    expect(data.annotations[0]?.note).toBe('Watch the alley defender here');
    expect(data.annotations[0]?.atSec).toBe(12);
  });

  it('refreshes synthetic AI fields for an existing review', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new RefreshFilmReviewAiTool(db as never);

    const result = await tool.execute({ filmReviewId: 'review-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    const data = result.data as { aiSummary: string; keyInsights: string[] };
    expect(data.aiSummary).toContain('Agent X identified');
    expect(data.keyInsights.length).toBeGreaterThan(0);
  });

  it('strips the film review projection from the base file on delete', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new DeleteFilmReviewTool(db as never);

    const result = await tool.execute({ filmReviewId: 'review-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);

    const getTool = new GetFilmReviewTool(db as never);
    const loadResult = await getTool.execute({ filmReviewId: 'review-1' }, { userId: 'coach-1' });
    expect(loadResult.success).toBe(false);
  });
});
