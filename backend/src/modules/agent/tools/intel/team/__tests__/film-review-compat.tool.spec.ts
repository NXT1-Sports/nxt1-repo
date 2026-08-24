import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

import {
  AddFilmReviewAnnotationTool,
  AddFilmReviewSourceTool,
  DeleteFilmReviewTool,
  ExtractFilmReviewClipsTool,
  SaveFilmReviewTool,
  RefreshFilmReviewAiTool,
  GetFilmReviewSourceBreakdownTool,
  GetFilmReviewTool,
  ImportFilmReviewBreakdownTool,
  ListFilmReviewSourcesTool,
  ListFilmReviewsTool,
  PatchFilmReviewSourceBreakdownsTool,
  SearchFilmReviewBreakdownRowsTool,
  UpdateFilmReviewTool,
  UpdateFilmReviewSourceBreakdownTool,
} from '../film-review-compat.tool.js';

type MockDoc = {
  readonly id: string;
  readonly data: () => Record<string, unknown>;
};

function createUniversalFileQuery(
  getDocs: () => readonly MockDoc[],
  filters: readonly { field: string; op: string; value: unknown }[] = []
): {
  readonly where: ReturnType<typeof vi.fn>;
  readonly orderBy: ReturnType<typeof vi.fn>;
  readonly limit: ReturnType<typeof vi.fn>;
  readonly get: ReturnType<typeof vi.fn>;
} {
  const applyFilters = () =>
    getDocs().filter((doc) => {
      const record = doc.data();
      return filters.every(({ field, op, value }) => {
        const current = field
          .split('.')
          .reduce<unknown>(
            (acc, key) =>
              acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
            record
          );
        if (op === 'array-contains') {
          return Array.isArray(current) && current.includes(value);
        }
        return current === value;
      });
    });

  return {
    where: vi
      .fn()
      .mockImplementation((field: string, op: string, value: unknown) =>
        createUniversalFileQuery(getDocs, [...filters, { field, op, value }])
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

function createDb(docs: readonly MockDoc[], folders: readonly MockDoc[] = []) {
  const writes: Array<{ readonly id: string; readonly payload: Record<string, unknown> }> = [];
  let beforeNextTransaction: (() => void) | undefined;
  const store = new Map<string, Record<string, unknown>>(
    docs.map((doc) => [doc.id, structuredClone(doc.data())])
  );
  const folderStore = new Map<string, Record<string, unknown>>(
    folders.map((doc) => [doc.id, structuredClone(doc.data())])
  );

  const getDocs = (): readonly MockDoc[] =>
    [...store.entries()].map(([id, data]) => ({
      id,
      data: () => data,
    }));
  const getFolders = (): readonly MockDoc[] =>
    [...folderStore.entries()].map(([id, data]) => ({
      id,
      data: () => data,
    }));

  const runTransaction = vi.fn().mockImplementation(
    async (
      callback: (transaction: {
        readonly get: (reference: { get: () => Promise<unknown> }) => Promise<unknown>;
        readonly set: (
          reference: {
            set: (
              payload: Record<string, unknown>,
              options?: { merge?: boolean }
            ) => Promise<unknown>;
          },
          payload: Record<string, unknown>,
          options?: { merge?: boolean }
        ) => void;
      }) => Promise<unknown>
    ) => {
      beforeNextTransaction?.();
      beforeNextTransaction = undefined;
      const pendingWrites: Promise<unknown>[] = [];
      const result = await callback({
        get: (reference) => reference.get(),
        set: (reference, payload, options) => {
          pendingWrites.push(reference.set(payload, options));
        },
      });
      await Promise.all(pendingWrites);
      return result;
    }
  );

  return {
    writes,
    runTransaction,
    beforeNextTransaction: (callback: () => void) => {
      beforeNextTransaction = callback;
    },
    mutateUniversalFile: (
      id: string,
      update: (current: Record<string, unknown>) => Record<string, unknown>
    ) => {
      const current = store.get(id);
      if (current) store.set(id, update(structuredClone(current)));
    },
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
              writes.push({ id, payload: structuredClone(payload) });
              const existing = store.get(id) ?? {};
              store.set(id, { ...existing, ...structuredClone(payload) });
            }),
            delete: vi.fn().mockImplementation(async () => {
              store.delete(id);
            }),
          })),
          where: vi
            .fn()
            .mockImplementation((field: string, op: string, value: unknown) =>
              createUniversalFileQuery(getDocs, [{ field, op, value }])
            ),
        };
      }

      if (name === 'TeamFileFolders') {
        return {
          doc: vi.fn().mockImplementation((id: string) => ({
            get: vi.fn().mockResolvedValue({
              exists: folderStore.has(id),
              id,
              data: () => folderStore.get(id) ?? {},
            }),
          })),
          where: vi
            .fn()
            .mockImplementation((field: string, op: string, value: unknown) =>
              createUniversalFileQuery(getFolders, [{ field, op, value }])
            ),
        };
      }

      if (name === 'RosterEntries') {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [] }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };
}

function makeFolder(id: string, overrides: Record<string, unknown> = {}): MockDoc {
  return {
    id,
    data: () => ({
      teamId: 'team-1',
      name: 'Film',
      normalizedName: 'film',
      sortOrder: 0,
      createdByUserId: 'coach-1',
      readAccessKeys: ['user:coach-1'],
      writeAccessKeys: ['user:coach-1'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      ...overrides,
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
      ownerUserId: 'coach-1',
      updatedByUserId: 'coach-1',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      readAccessKeys: ['user:coach-1'],
      writeAccessKeys: ['user:coach-1'],
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

  it('surfaces an ownership clarification blocker for ambiguous ODK rows', async () => {
    const db = createDb([
      makeFilmReviewFile('review-ambiguous', {
        payload: {
          filmReview: {
            uploadMode: 'single_video',
            videoUrl: 'https://cdn.example.com/video.mp4',
            source: 'team_files',
            schemaVersion: 2,
            sources: [
              {
                id: 'source-1',
                order: 0,
                title: 'Video 2026',
                videoUrl: 'https://cdn.example.com/video.mp4',
              },
            ],
            timeline: [
              {
                id: 'play-1',
                number: 1,
                label: '1st and 10 run right',
                startSec: 10,
                endSec: 18,
                sourceId: 'source-1',
                tags: { odk: 'O', playType: 'Run' },
              },
            ],
          },
        },
      }),
    ]);
    const tool = new GetFilmReviewTool(db as never);

    const result = await tool.execute({ filmReviewId: 'review-ambiguous' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(result.markdown).toContain('STOP: ownership clarification required');
    expect(result.markdown).toContain('Your next action must be');
    expect(result.markdown).toContain('Which team is this ODK keyed to');
    expect(result.data).toMatchObject({
      ownershipSummary: {
        confidenceCounts: { ambiguous: 1 },
      },
    });
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
        ownerUserId: 'coach-1',
        updatedByUserId: 'coach-1',
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
        readAccessKeys: ['user:coach-1'],
        writeAccessKeys: ['user:coach-1'],
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

    const result = await tool.execute({}, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    const data = result.data as { reviews: Array<{ id: string }> };
    expect(data.reviews.map((review) => review.id)).toEqual(['review-2', 'review-1']);
  });

  it('loads and updates a personal film review without team scope', async () => {
    const personalReview = makeFilmReviewFile('review-personal', {
      teamId: '',
      ownerUserId: 'athlete-1',
      createdByUserId: 'athlete-1',
      updatedByUserId: 'athlete-1',
      readAccessKeys: ['user:athlete-1'],
      writeAccessKeys: ['user:athlete-1'],
      title: 'Personal Workout Breakdown',
    });
    const db = createDb([personalReview]);
    const getTool = new GetFilmReviewTool(db as never);
    const updateTool = new UpdateFilmReviewTool(db as never);

    const getResult = await getTool.execute(
      { filmReviewId: 'review-personal' },
      { userId: 'athlete-1' }
    );
    const updateResult = await updateTool.execute(
      { filmReviewId: 'review-personal', title: 'Updated Personal Breakdown' },
      { userId: 'athlete-1' }
    );

    expect(getResult.success).toBe(true);
    expect(updateResult.success).toBe(true);

    const updated = updateResult.data as { review: { title: string } };
    expect(updated.review.title).toBe('Updated Personal Breakdown');
  });

  it('creates a personal film review without teamId', async () => {
    const db = createDb([]);
    const tool = new SaveFilmReviewTool(db as never);
    const thumbnailUrl = 'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2/o/thumb.jpg';

    const result = await tool.execute(
      {
        title: 'Solo Training Session',
        sport: 'football',
        videoUrl: 'https://cdn.example.com/personal-review.mp4',
        storagePath: 'Users/athlete-1/agent-x/videos/personal-review.mp4',
        thumbnailUrl,
        durationSec: 42,
      },
      { userId: 'athlete-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as { review: { id: string; title: string; teamId?: string | null } };
    expect(data.review.title).toBe('Solo Training Session');
    expect(data.review.teamId ?? null).toBeNull();

    const createdSnapshot = await db.collection('UniversalFiles').doc(data.review.id).get();
    const createdData = createdSnapshot.data();
    const payload = createdData?.['payload'] as Record<string, unknown>;
    const asset = payload['asset'] as Record<string, unknown>;
    const filmReview = payload['filmReview'] as Record<string, unknown>;
    const sources = filmReview['sources'] as Array<Record<string, unknown>>;

    expect(createdData?.['thumbnailUrl']).toBe(thumbnailUrl);
    expect(payload['thumbnailUrl']).toBe(thumbnailUrl);
    expect(asset['thumbnailUrl']).toBe(thumbnailUrl);
    expect(filmReview['thumbnailUrl']).toBe(thumbnailUrl);
    expect(sources[0]?.['thumbnailUrl']).toBe(thumbnailUrl);
    expect(sources[0]?.['storagePath']).toBe('Users/athlete-1/agent-x/videos/personal-review.mp4');
    expect(sources[0]?.['durationSec']).toBe(42);
  });

  it('lists only the authenticated user workspace reviews', async () => {
    const db = createDb([
      makeFilmReviewFile('review-own', {
        teamId: '',
        ownerUserId: 'athlete-1',
        createdByUserId: 'athlete-1',
        updatedByUserId: 'athlete-1',
        readAccessKeys: ['user:athlete-1'],
        writeAccessKeys: ['user:athlete-1'],
        updatedAt: '2026-06-05T00:00:00.000Z',
      }),
      makeFilmReviewFile('review-other', {
        teamId: '',
        ownerUserId: 'athlete-2',
        createdByUserId: 'athlete-2',
        updatedByUserId: 'athlete-2',
        readAccessKeys: ['user:athlete-2'],
        writeAccessKeys: ['user:athlete-2'],
        updatedAt: '2026-06-06T00:00:00.000Z',
      }),
    ]);
    const tool = new ListFilmReviewsTool(db as never);

    const result = await tool.execute({}, { userId: 'athlete-1' });

    expect(result.success).toBe(true);
    const data = result.data as { reviews: Array<{ id: string }> };
    expect(data.reviews.map((review) => review.id)).toEqual(['review-own']);
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

  it('searches all breakdown rows by formation tag and returns matching source IDs', async () => {
    const db = createDb([
      makeFilmReviewFile('review-1', {
        payload: {
          asset: {
            url: 'https://cdn.example.com/video.mp4',
            kind: 'video',
            mimeType: 'video/mp4',
          },
          filmReview: {
            uploadMode: 'batch_clips',
            videoUrl: 'https://cdn.example.com/video.mp4',
            source: 'team_files',
            schemaVersion: 2,
            sources: [
              {
                id: 'source-66',
                order: 65,
                title: 'Wide - Clip 067',
                videoUrl: 'https://cdn.example.com/source-66.mp4',
              },
              {
                id: 'source-73',
                order: 72,
                title: 'Wide - Clip 074',
                videoUrl: 'https://cdn.example.com/source-73.mp4',
              },
              {
                id: 'source-2',
                order: 1,
                title: 'Wide - Clip 002',
                videoUrl: 'https://cdn.example.com/source-2.mp4',
              },
            ],
            timelineState: 'ready',
            timeline: [
              {
                id: 'hudl-play-66-run',
                number: 66,
                label: 'Run',
                startSec: 0,
                endSec: 22.33,
                sourceId: 'source-66',
                tags: { offForm: 'IOWA BLACK', playType: 'Run' },
              },
              {
                id: 'hudl-play-73-run',
                number: 73,
                label: 'Run',
                startSec: 0,
                endSec: 26.72,
                sourceId: 'source-73',
                tags: { offForm: 'Iowa Black', playType: 'Run' },
              },
              {
                id: 'hudl-play-2-run',
                number: 2,
                label: 'Run',
                startSec: 0,
                endSec: 11,
                sourceId: 'source-2',
                tags: { offForm: '2x2', playType: 'Run' },
              },
            ],
          },
        },
      }),
    ]);
    const tool = new SearchFilmReviewBreakdownRowsTool(db as never);

    const result = await tool.execute(
      { filmReviewId: 'review-1', tagId: 'offForm', tagValue: 'iowa black' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      matchCount: number;
      sourceIds: string[];
      matches: Array<{ sourceTitle: string; matchedTags: Array<{ tagId: string }> }>;
    };
    expect(data.matchCount).toBe(2);
    expect(data.sourceIds).toEqual(['source-66', 'source-73']);
    expect(data.matches.map((match) => match.sourceTitle)).toEqual([
      'Wide - Clip 067',
      'Wide - Clip 074',
    ]);
    expect(data.matches[0]?.matchedTags[0]?.tagId).toBe('offForm');
  });

  it('searches 4-3 defensive front rows as string values and schema-rejects boolean false', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    db.mutateUniversalFile('review-1', (current) => {
      const payload = current['payload'] as Record<string, unknown>;
      const filmReview = payload['filmReview'] as Record<string, unknown>;
      const sources = filmReview['sources'] as Array<Record<string, unknown>>;

      return {
        ...current,
        payload: {
          ...payload,
          filmReview: {
            ...filmReview,
            sources: [
              ...sources,
              {
                id: 'source-2',
                order: 1,
                title: 'Wide - Clip 043',
                videoUrl: 'https://cdn.example.com/source-2.mp4',
              },
            ],
            timeline: [
              {
                id: 'play-1',
                number: 1,
                label: '4-3 stop',
                startSec: 10,
                endSec: 18,
                sourceId: 'source-1',
                tags: { odk: 'D', defFront: '4-3', playType: 'Run' },
              },
              {
                id: 'play-2',
                number: 2,
                label: 'Odd front pressure',
                startSec: 20,
                endSec: 28,
                sourceId: 'source-2',
                tags: { odk: 'D', defFront: 'Odd', playType: 'Pass' },
              },
            ],
          },
        },
      };
    });
    const tool = new SearchFilmReviewBreakdownRowsTool(db as never);

    const invalidResult = await tool.execute(
      { filmReviewId: 'review-1', tagId: 'defFront', tagValue: false },
      { userId: 'coach-1' }
    );
    const validResult = await tool.execute(
      { filmReviewId: 'review-1', tagId: 'defFront', tagValue: '4-3' },
      { userId: 'coach-1' }
    );

    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toContain('tagValue: Invalid input');
    expect(validResult.success).toBe(true);
    expect(validResult.data).toMatchObject({ matchCount: 1, sourceIds: ['source-1'] });
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

  it('patches multiple source rows losslessly in one UniversalFiles payload write', async () => {
    const base = makeFilmReviewFile('review-1').data();
    const basePayload = base['payload'] as Record<string, unknown>;
    const baseReview = basePayload['filmReview'] as Record<string, unknown>;
    const db = createDb([
      makeFilmReviewFile('review-1', {
        payload: {
          ...basePayload,
          filmReview: {
            ...baseReview,
            reviewRevision: 2,
            sources: [
              ...(baseReview['sources'] as readonly Record<string, unknown>[]),
              {
                id: 'source-2',
                order: 1,
                title: 'Endzone',
                videoUrl: 'https://cdn.example.com/source-2.mp4',
              },
            ],
            timeline: [
              {
                id: 'play-1',
                sourceId: 'source-1',
                number: 1,
                label: 'Inside zone',
                startSec: 10,
                endSec: 18,
                annotation: {
                  kind: 'text',
                  text: 'Preserve this note',
                  bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
                },
                tags: { odk: 'O', defFront: 'Even', coverage: 'Cover 3' },
              },
              {
                id: 'play-2',
                sourceId: 'source-2',
                number: 2,
                label: 'Counter',
                startSec: 20,
                endSec: 28,
                tags: { odk: 'O', defFront: 'Odd', coverage: 'Cover 1' },
              },
            ],
          },
        },
      }),
    ]);
    const tool = new PatchFilmReviewSourceBreakdownsTool(db as never);

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        expectedRevision: 2,
        patches: [
          { sourceId: 'source-1', rowId: 'play-1', tags: { defFront: 'Odd' } },
          { sourceId: 'source-2', rowId: 'play-2', clearTagIds: ['coverage'] },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      reviewRevision: number;
      timeline: Array<{
        id: string;
        annotation?: unknown;
        tags?: Record<string, unknown>;
      }>;
    };
    expect(data.reviewRevision).toBe(3);
    expect(data.timeline.find((row) => row.id === 'play-1')).toMatchObject({
      annotation: expect.objectContaining({ text: 'Preserve this note' }),
      tags: { odk: 'O', defFront: 'Odd', coverage: 'Cover 3' },
    });
    expect(data.timeline.find((row) => row.id === 'play-2')?.tags).toEqual({
      odk: 'O',
      defFront: 'Odd',
    });
    expect(db.runTransaction).toHaveBeenCalledTimes(1);
    expect(db.writes.filter((write) => write.payload['payload'] !== undefined)).toHaveLength(1);
  });

  it.each([
    [
      {
        expectedRevision: 4,
        patches: [{ sourceId: 'source-1', rowId: 'play-1', tags: { defFront: 'Odd' } }],
      },
      'REVISION_CONFLICT',
    ],
    [
      {
        expectedRevision: 0,
        patches: [{ sourceId: 'source-1', rowId: 'play-1', tags: { odk: 'X' } }],
      },
      'INVALID_TAG_VALUE',
    ],
    [
      {
        expectedRevision: 0,
        patches: [{ sourceId: 'source-1', rowId: 'play-1', tags: { madeUp: 'value' } }],
      },
      'INVALID_TAG_ID',
    ],
  ] as const)('rejects invalid batch patch input before persistence', async (patchInput, code) => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new PatchFilmReviewSourceBreakdownsTool(db as never);

    const result = await tool.execute(
      { filmReviewId: 'review-1', ...patchInput },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code });
    expect(db.writes).toHaveLength(0);
  });

  it('rejects a stale legacy update after a newer breakdown revision commits', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    db.beforeNextTransaction(() => {
      db.mutateUniversalFile('review-1', (current) => {
        const payload = current['payload'] as Record<string, unknown>;
        const filmReview = payload['filmReview'] as Record<string, unknown>;
        return {
          ...current,
          payload: {
            ...payload,
            filmReview: {
              ...filmReview,
              reviewRevision: 1,
              timeline: [
                {
                  id: 'play-1',
                  sourceId: 'source-1',
                  number: 1,
                  label: '1st and 10 run right',
                  startSec: 10,
                  endSec: 18,
                  tags: { defFront: 'Odd' },
                },
              ],
            },
          },
        };
      });
    });
    const tool = new UpdateFilmReviewTool(db as never);

    await expect(
      tool.execute(
        { filmReviewId: 'review-1', title: 'Stale metadata update' },
        { userId: 'coach-1' }
      )
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 1 });
    expect(db.writes).toHaveLength(0);
  });

  it('rechecks write authorization inside the patch transaction', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    db.beforeNextTransaction(() => {
      db.mutateUniversalFile('review-1', (current) => ({
        ...current,
        teamId: '',
        createdByUserId: 'other-user',
        ownerUserId: 'other-user',
        writeAccessKeys: ['user:other-user'],
      }));
    });
    const tool = new PatchFilmReviewSourceBreakdownsTool(db as never);

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        expectedRevision: 0,
        patches: [{ sourceId: 'source-1', rowId: 'play-1', tags: { defFront: 'Odd' } }],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(false);
    expect(result.data).toMatchObject({ code: 'ACCESS_DENIED' });
    expect(db.writes).toHaveLength(0);
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

  it('updates an existing film review with Firebase thumbnail metadata for the Files list', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new UpdateFilmReviewTool(db as never);
    const thumbnailUrl = 'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2/o/review-thumb.jpg';

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        storagePath: 'Users/coach-1/agent-x/videos/review-1.mp4',
        thumbnailUrl,
        durationSec: 64,
        downloadUrl: 'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2/o/review-1.mp4',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const updatedSnapshot = await db.collection('UniversalFiles').doc('review-1').get();
    const updatedData = updatedSnapshot.data();
    const payload = updatedData?.['payload'] as Record<string, unknown>;
    const asset = payload['asset'] as Record<string, unknown>;
    const filmReview = payload['filmReview'] as Record<string, unknown>;
    const sources = filmReview['sources'] as Array<Record<string, unknown>>;

    expect(updatedData?.['thumbnailUrl']).toBe(thumbnailUrl);
    expect(payload['thumbnailUrl']).toBe(thumbnailUrl);
    expect(asset['thumbnailUrl']).toBe(thumbnailUrl);
    expect(filmReview['thumbnailUrl']).toBe(thumbnailUrl);
    expect(sources[0]?.['thumbnailUrl']).toBe(thumbnailUrl);
    expect(sources[0]?.['storagePath']).toBe('Users/coach-1/agent-x/videos/review-1.mp4');
    expect(sources[0]?.['durationSec']).toBe(64);
    expect(sources[0]?.['downloadUrl']).toBe(
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2/o/review-1.mp4'
    );
  });

  it('imports a breakdown attachment into an existing film review through the Agent tool', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    const tool = new ImportFilmReviewBreakdownTool(db as never, async () => ({
      buffer: Buffer.from('Play,Start,End,ODK,Play Type,Result\n1,0:10,0:18,O,Pass,Complete\n'),
      fileName: 'hudl-breakdown.csv',
      mimeType: 'text/csv',
      storagePath: 'Users/coach-1/agent-x/breakdowns/hudl-breakdown.csv',
    }));

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        storagePath: 'Users/coach-1/agent-x/breakdowns/hudl-breakdown.csv',
        fileName: 'hudl-breakdown.csv',
        mimeType: 'text/csv',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ playCount: 1, rowCount: 1 });

    const updatedSnapshot = await db.collection('UniversalFiles').doc('review-1').get();
    const filmReview = (updatedSnapshot.data()?.['payload'] as Record<string, unknown>)[
      'filmReview'
    ] as Record<string, unknown>;
    const timeline = filmReview['timeline'] as Array<Record<string, unknown>>;
    const breakdownSource = filmReview['breakdownSource'] as Record<string, unknown>;

    expect(filmReview['timelineState']).toBe('ready');
    expect(timeline[0]).toMatchObject({
      number: 1,
      startSec: 10,
      endSec: 18,
      tags: { odk: 'O', playType: 'Pass', result: 'Complete' },
    });
    expect(breakdownSource).toMatchObject({
      provider: 'csv',
      fileName: 'hudl-breakdown.csv',
      mimeType: 'text/csv',
      storagePath: 'Users/coach-1/agent-x/breakdowns/hudl-breakdown.csv',
      rowCount: 1,
      playCount: 1,
      importedBy: 'coach-1',
    });
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

  it('retries adding a source when the review revision advances before commit', async () => {
    const db = createDb([makeFilmReviewFile('review-1')]);
    db.beforeNextTransaction(() => {
      db.mutateUniversalFile('review-1', (current) => {
        const payload = current['payload'] as Record<string, unknown>;
        const filmReview = payload['filmReview'] as Record<string, unknown>;
        return {
          ...current,
          payload: {
            ...payload,
            filmReview: {
              ...filmReview,
              reviewRevision: 1,
              aiSummary: 'Updated by a concurrent analysis pass.',
            },
          },
        };
      });
    });
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
    expect(db.runTransaction).toHaveBeenCalledTimes(2);

    const updatedSnapshot = await db.collection('UniversalFiles').doc('review-1').get();
    const filmReview = (updatedSnapshot.data()?.['payload'] as Record<string, unknown>)[
      'filmReview'
    ] as Record<string, unknown>;
    const sources = filmReview['sources'] as Array<Record<string, unknown>>;

    expect(filmReview['reviewRevision']).toBe(2);
    expect(filmReview['aiSummary']).toBe('Updated by a concurrent analysis pass.');
    expect(sources.map((source) => source['id'])).toEqual(['source-1', 'source-2']);
  });

  it('creates extracted clip reviews directly in the requested Files folder', async () => {
    const db = createDb([makeFilmReviewFile('review-1')], [makeFolder('folder-film')]);
    const sourceThumbnailUrl = 'https://cdn.example.com/video-thumb.jpg';
    db.mutateUniversalFile('review-1', (current) => {
      const payload = current['payload'] as Record<string, unknown>;
      const filmReview = payload['filmReview'] as Record<string, unknown>;
      const sources = filmReview['sources'] as Array<Record<string, unknown>>;

      return {
        ...current,
        payload: {
          ...payload,
          filmReview: {
            ...filmReview,
            sources: sources.map((source) =>
              source['id'] === 'source-1' ? { ...source, thumbnailUrl: sourceThumbnailUrl } : source
            ),
          },
        },
      };
    });
    const tool = new ExtractFilmReviewClipsTool(db as never);

    const result = await tool.execute(
      {
        filmReviewId: 'review-1',
        sourceIds: ['source-1'],
        outputMode: 'combined_review',
        title: 'Wide Clips Cutup - Clips 1-6',
        folderName: 'Film',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      folderId: string | null;
      folderName: string | null;
      reviews: Array<{ id: string; title: string }>;
    };
    expect(data.folderId).toBe('folder-film');
    expect(data.folderName).toBe('Film');
    expect(data.reviews).toHaveLength(1);
    expect(data.reviews[0]?.title).toBe('Wide Clips Cutup - Clips 1-6');

    const createdSnapshot = await db.collection('UniversalFiles').doc(data.reviews[0]!.id).get();
    expect(createdSnapshot.exists).toBe(true);
    expect(createdSnapshot.data()?.['folderId']).toBe('folder-film');
    expect(createdSnapshot.data()?.['thumbnailUrl']).toBe(sourceThumbnailUrl);
    expect((createdSnapshot.data()?.['payload'] as Record<string, unknown>)['thumbnailUrl']).toBe(
      sourceThumbnailUrl
    );
    expect(
      (
        (createdSnapshot.data()?.['payload'] as Record<string, unknown>)['filmReview'] as Record<
          string,
          unknown
        >
      )['thumbnailUrl']
    ).toBe(sourceThumbnailUrl);
  });

  it('creates one combined cutup from multiple parent film reviews with remapped source IDs', async () => {
    const riverside = makeFilmReviewFile('riverside-review', {
      title: 'Riverside Full Game 2026',
      teamId: '',
      payload: {
        asset: {
          url: 'https://cdn.example.com/riverside.mp4',
          kind: 'video',
          mimeType: 'video/mp4',
        },
        filmReview: {
          uploadMode: 'batch_clips',
          videoUrl: 'https://cdn.example.com/riverside.mp4',
          source: 'team_files',
          schemaVersion: 2,
          sources: [
            {
              id: 'source-1',
              order: 0,
              title: 'Wide - Clip 067',
              videoUrl: 'https://cdn.example.com/riverside-source-1.mp4',
            },
          ],
          timelineState: 'ready',
          timeline: [
            {
              id: 'hudl-play-66-run',
              number: 66,
              label: 'Run',
              startSec: 0,
              endSec: 22.33,
              sourceId: 'source-1',
              tags: { offForm: 'IOWA BLACK' },
            },
          ],
        },
      },
    });
    const georgetown = makeFilmReviewFile('georgetown-review', {
      title: 'Georgetown Full Game Film (2025)',
      payload: {
        asset: {
          url: 'https://cdn.example.com/georgetown.mp4',
          kind: 'video',
          mimeType: 'video/mp4',
        },
        filmReview: {
          uploadMode: 'batch_clips',
          videoUrl: 'https://cdn.example.com/georgetown.mp4',
          source: 'team_files',
          schemaVersion: 2,
          sources: [
            {
              id: 'source-1',
              order: 0,
              title: 'Tight - Clip 115',
              videoUrl: 'https://cdn.example.com/georgetown-source-1.mp4',
            },
          ],
          timelineState: 'ready',
          timeline: [
            {
              id: 'hudl-play-18-pass',
              number: 18,
              label: 'Pass',
              startSec: 0,
              endSec: 30.37,
              sourceId: 'source-1',
              tags: { offForm: 'IOWA BLACK' },
            },
          ],
        },
      },
    });
    const db = createDb([riverside, georgetown], [makeFolder('folder-film')]);
    const tool = new ExtractFilmReviewClipsTool(db as never);

    const result = await tool.execute(
      {
        reviewSelections: [
          { filmReviewId: 'riverside-review', sourceIds: ['source-1'] },
          { filmReviewId: 'georgetown-review', sourceIds: ['source-1'] },
        ],
        outputMode: 'combined_review',
        title: 'Iowa Black Cutup',
        folderName: 'Film',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      sourceCount: number;
      sourceReviewCount: number;
      folderId: string | null;
      reviews: Array<{ id: string; title: string }>;
    };
    expect(data.sourceCount).toBe(2);
    expect(data.sourceReviewCount).toBe(2);
    expect(data.folderId).toBe('folder-film');
    expect(data.reviews).toHaveLength(1);
    expect(data.reviews[0]?.title).toBe('Iowa Black Cutup');

    const createdSnapshot = await db.collection('UniversalFiles').doc(data.reviews[0]!.id).get();
    expect(createdSnapshot.data()?.['teamId']).toBe('team-1');
    const createdFilmReview = createdSnapshot.data()?.['payload'] as {
      filmReview?: {
        sources?: Array<{ id: string; title: string }>;
        timeline?: Array<{ id: string; sourceId: string; tags?: Record<string, unknown> }>;
      };
    };
    const sources = createdFilmReview.filmReview?.sources ?? [];
    const timeline = createdFilmReview.filmReview?.timeline ?? [];
    const sourceIds = sources.map((source) => source.id);

    expect(new Set(sourceIds).size).toBe(2);
    expect(sourceIds.every((sourceId) => sourceId !== 'source-1')).toBe(true);
    expect(sources.map((source) => source.title)).toEqual([
      'Riverside Full Game 2026 - Wide - Clip 067',
      'Georgetown Full Game Film (2025) - Tight - Clip 115',
    ]);
    expect(timeline.map((row) => row.sourceId).sort()).toEqual([...sourceIds].sort());
    expect(timeline.every((row) => row.tags?.['offForm'] === 'IOWA BLACK')).toBe(true);
  });

  it('falls back to the parent review thumbnail when selected clip sources have none', async () => {
    const parentThumbnailUrl = 'https://cdn.example.com/riverside-parent-thumb.jpg';
    const db = createDb([
      makeFilmReviewFile('riverside-review', {
        title: 'Riverside Full Game 2026',
        thumbnailUrl: parentThumbnailUrl,
        payload: {
          thumbnailUrl: parentThumbnailUrl,
          asset: {
            url: 'https://cdn.example.com/riverside.mp4',
            kind: 'video',
            mimeType: 'video/mp4',
          },
          filmReview: {
            uploadMode: 'batch_clips',
            videoUrl: 'https://cdn.example.com/riverside.mp4',
            thumbnailUrl: parentThumbnailUrl,
            source: 'team_files',
            schemaVersion: 2,
            sources: [
              {
                id: 'source-1',
                order: 0,
                title: 'Wide - Clip 006',
                videoUrl: 'https://cdn.example.com/riverside-source-1.mp4',
              },
            ],
            timelineState: 'ready',
            timeline: [
              {
                id: 'hudl-play-6-punt',
                number: 6,
                label: '4th & 10 Punt',
                startSec: 0,
                endSec: 18.2,
                sourceId: 'source-1',
                tags: { defFront: '4-3' },
              },
            ],
          },
        },
      }),
    ]);
    const tool = new ExtractFilmReviewClipsTool(db as never);

    const result = await tool.execute(
      {
        filmReviewId: 'riverside-review',
        sourceIds: ['source-1'],
        outputMode: 'combined_review',
        title: 'Riverside Full Game 2026 - 4-3 Defense Cutup',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as { reviews: Array<{ id: string; title: string }> };
    expect(data.reviews[0]?.title).toBe('Riverside Full Game 2026 - 4-3 Defense Cutup');

    const createdSnapshot = await db.collection('UniversalFiles').doc(data.reviews[0]!.id).get();
    expect(createdSnapshot.data()?.['thumbnailUrl']).toBe(parentThumbnailUrl);
    expect((createdSnapshot.data()?.['payload'] as Record<string, unknown>)['thumbnailUrl']).toBe(
      parentThumbnailUrl
    );
    expect(
      (
        (
          (createdSnapshot.data()?.['payload'] as Record<string, unknown>)['filmReview'] as Record<
            string,
            unknown
          >
        )['sources'] as Array<Record<string, unknown>>
      )[0]?.['thumbnailUrl']
    ).toBe(parentThumbnailUrl);
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
