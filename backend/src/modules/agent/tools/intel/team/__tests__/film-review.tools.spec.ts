import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCacheDel,
  mockCanManageTeamMutationForUser,
  mockCanReadTeamIntelForUser,
  mockStorageDelete,
} = vi.hoisted(() => ({
  mockCacheDel: vi.fn().mockResolvedValue(undefined),
  mockCanManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
  mockCanReadTeamIntelForUser: vi.fn().mockResolvedValue(true),
  mockStorageDelete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (path: string) => ({
        delete: (options?: { ignoreNotFound?: boolean }) => mockStorageDelete(path, options),
      }),
    }),
  }),
}));

vi.mock('../../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => ({
    del: mockCacheDel,
  }),
}));

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: mockCanManageTeamMutationForUser,
  canReadTeamIntelForUser: mockCanReadTeamIntelForUser,
}));

vi.mock('../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  AddFilmReviewSourceTool,
  AddFilmReviewAnnotationTool,
  CreateFilmReviewPlaylistTool,
  DeleteFilmReviewTool,
  DeleteFilmReviewPlaylistTool,
  DeleteFilmReviewSourceBreakdownTool,
  DeleteFilmReviewSourceTool,
  ExtractFilmReviewClipsTool,
  GetFilmReviewSourceBreakdownTool,
  ListFilmReviewsTool,
  ListFilmReviewPlaylistsTool,
  ListFilmReviewSourcesTool,
  MoveFilmReviewToPlaylistTool,
  SaveFilmReviewTool,
  UpdateFilmReviewSourceBreakdownTool,
  UpdateFilmReviewPlaylistTool,
  UpdateFilmReviewSourceTool,
  UpdateFilmReviewTool,
} from '../film-review.tools.js';

const baseReview = {
  id: 'fr-1',
  teamId: 'team-1',
  sport: 'football',
  title: 'Week 4 Film',
  status: 'ready',
  videoUrl: 'https://cdn.example.com/week-4.mp4',
  source: 'agent_x',
  schemaVersion: 1,
  createdBy: 'coach-1',
  updatedBy: 'coach-1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
} as const;

function createDb(options: {
  readonly filmReviewDoc?: { readonly exists: boolean; readonly data: () => unknown };
  readonly playlistDoc?: { readonly exists: boolean; readonly data: () => unknown };
  readonly teamDoc?: { readonly exists: boolean; readonly data: () => unknown };
  readonly set?: ReturnType<typeof vi.fn>;
  readonly update?: ReturnType<typeof vi.fn>;
  readonly deleteDoc?: ReturnType<typeof vi.fn>;
  readonly playlistSet?: ReturnType<typeof vi.fn>;
  readonly playlistUpdate?: ReturnType<typeof vi.fn>;
  readonly playlistDeleteDoc?: ReturnType<typeof vi.fn>;
  readonly whereDocs?: readonly { readonly data: () => unknown }[];
  readonly reviewByPlaylistDocs?: readonly {
    readonly data: () => unknown;
    readonly ref: { readonly update: ReturnType<typeof vi.fn> };
  }[];
  readonly playlistWhereDocs?: readonly { readonly data: () => unknown }[];
  readonly playlistChildrenDocs?: readonly {
    readonly data: () => unknown;
    readonly ref: { readonly update: ReturnType<typeof vi.fn> };
  }[];
}) {
  const set = options.set ?? vi.fn().mockResolvedValue(undefined);
  const update = options.update ?? vi.fn().mockResolvedValue(undefined);
  const deleteDoc = options.deleteDoc ?? vi.fn().mockResolvedValue(undefined);
  const playlistSet = options.playlistSet ?? vi.fn().mockResolvedValue(undefined);
  const playlistUpdate = options.playlistUpdate ?? vi.fn().mockResolvedValue(undefined);
  const playlistDeleteDoc = options.playlistDeleteDoc ?? vi.fn().mockResolvedValue(undefined);
  const filmReviewDoc =
    options.filmReviewDoc ?? ({ exists: false, data: () => undefined } as const);
  const playlistDoc = options.playlistDoc ?? ({ exists: false, data: () => undefined } as const);
  const teamDoc = options.teamDoc ?? { exists: true, data: () => ({ ownerId: 'coach-1' }) };
  const whereDocs = options.whereDocs ?? [];
  const reviewByPlaylistDocs = options.reviewByPlaylistDocs ?? [];
  const playlistWhereDocs = options.playlistWhereDocs ?? [];
  const playlistChildrenDocs = options.playlistChildrenDocs ?? [];

  const createQuery = (
    resolveDocs: (
      filters: readonly { field: string; value: unknown }[]
    ) => readonly { readonly data: () => unknown }[]
  ) => {
    const build = (filters: readonly { field: string; value: unknown }[]) => ({
      where: vi
        .fn()
        .mockImplementation((field: string, _op: string, value: unknown) =>
          build([...filters, { field, value }])
        ),
      limit: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ docs: resolveDocs(filters) }),
      }),
      get: vi.fn().mockResolvedValue({ docs: resolveDocs(filters) }),
    });

    return build([]);
  };

  const db = {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === 'Teams') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(teamDoc),
          }),
        };
      }

      if (name === 'TeamFilmReviews') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(filmReviewDoc),
            set,
            update,
            delete: deleteDoc,
          }),
          where: vi.fn().mockImplementation((field: string, _op: string, value: unknown) =>
            createQuery((filters) => {
              const allFilters = [{ field, value }, ...filters];
              const hasPlaylistFilter = allFilters.some((entry) => entry.field === 'playlistId');
              return hasPlaylistFilter ? reviewByPlaylistDocs : whereDocs;
            })
          ),
        };
      }

      if (name === 'TeamFilmReviewPlaylists') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(playlistDoc),
            set: playlistSet,
            update: playlistUpdate,
            delete: playlistDeleteDoc,
          }),
          where: vi.fn().mockImplementation((field: string, _op: string, value: unknown) =>
            createQuery((filters) => {
              const allFilters = [{ field, value }, ...filters];
              const hasParentFilter = allFilters.some((entry) => entry.field === 'parentId');
              return hasParentFilter ? playlistChildrenDocs : playlistWhereDocs;
            })
          ),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  return {
    db,
    set,
    update,
    deleteDoc,
    playlistSet,
    playlistUpdate,
    playlistDeleteDoc,
  };
}

describe('film review Agent X tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
    mockCanReadTeamIntelForUser.mockResolvedValue(true);
    mockCacheDel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists team film reviews with team read authorization', async () => {
    const { db } = createDb({
      whereDocs: [
        {
          data: () => ({
            ...baseReview,
            timeline: [
              { id: 'play-1', number: 1, label: 'Opening drive', startSec: 0, endSec: 18 },
            ],
          }),
        },
      ],
    });

    const tool = new ListFilmReviewsTool(db as never);
    const result = await tool.execute(
      { teamId: 'team-1', sport: 'football' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(mockCanReadTeamIntelForUser).toHaveBeenCalledWith(db, 'coach-1', 'team-1', {
      ownerId: 'coach-1',
    });
    expect(result.data).toMatchObject({ count: 1 });
  });

  it('filters listed film reviews by uploadMode', async () => {
    const { db } = createDb({
      whereDocs: [
        {
          data: () => ({
            ...baseReview,
            id: 'fr-batch',
            title: 'Batch Session',
            uploadMode: 'batch_clips',
            sources: [
              {
                id: 'source-1',
                order: 0,
                title: 'Clip 1',
                videoUrl: 'https://cdn.example.com/1.mp4',
              },
              {
                id: 'source-2',
                order: 1,
                title: 'Clip 2',
                videoUrl: 'https://cdn.example.com/2.mp4',
              },
            ],
          }),
        },
        {
          data: () => ({
            ...baseReview,
            id: 'fr-full',
            title: 'Full Film',
            uploadMode: 'full_footage',
            sources: [
              {
                id: 'source-main',
                order: 0,
                title: 'Main',
                videoUrl: 'https://cdn.example.com/main.mp4',
              },
            ],
          }),
        },
      ],
    });

    const tool = new ListFilmReviewsTool(db as never);
    const result = await tool.execute(
      { teamId: 'team-1', uploadMode: 'batch_clips' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      count: 1,
      filtersApplied: expect.objectContaining({ uploadMode: 'batch_clips' }),
      filmReviews: [expect.objectContaining({ id: 'fr-batch', uploadMode: 'batch_clips' })],
    });
  });

  it('creates a film review document with AI seed data and timeline rows', async () => {
    const { db, set } = createDb({ filmReviewDoc: { exists: false, data: () => undefined } });

    const tool = new SaveFilmReviewTool(db as never);
    const result = await tool.execute(
      {
        filmReviewId: 'team-1_football_week-4',
        teamId: 'team-1',
        sport: 'Football',
        title: 'Week 4 Film',
        videoUrl: 'https://cdn.example.com/week-4.mp4',
        opponentName: 'Westlake',
        durationSec: 120,
        timeline: [
          {
            label: 'Opening drive',
            startSec: 0,
            endSec: 18,
            tags: { odk: 'O', down: 1, result: 'first down' },
          },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
    const payload = set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['id']).toBe('team-1_football_week-4');
    expect(payload['sport']).toBe('football');
    expect(payload['status']).toBe('ready');
    expect(payload['aiSummary']).toContain('Week 4 Film');
    expect(Array.isArray(payload['aiTags'])).toBe(true);
    expect(payload['timelineState']).toBe('ready');
    expect((payload['timeline'] as unknown[])[0]).toMatchObject({
      id: 'play-1',
      number: 1,
      label: 'Opening drive',
    });
    expect(mockCacheDel).toHaveBeenCalledWith('intel:team:team-1');
  });

  it('creates a source-backed batch clip film review with first-class uploadMode and sources inputs', async () => {
    const { db, set } = createDb({ filmReviewDoc: { exists: false, data: () => undefined } });

    const tool = new SaveFilmReviewTool(db as never);
    const result = await tool.execute(
      {
        filmReviewId: 'team-1_football_batch-clips',
        teamId: 'team-1',
        sport: 'Football',
        title: 'Batch Clip Session',
        uploadMode: 'batch_clips',
        sources: [
          {
            id: 'source-1',
            order: 0,
            title: 'Clip 1',
            videoUrl: 'https://cdn.example.com/clip-1.mp4',
            durationSec: 11,
          },
          {
            id: 'source-2',
            order: 1,
            title: 'Clip 2',
            videoUrl: 'https://cdn.example.com/clip-2.mp4',
            durationSec: 13,
          },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const payload = set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      id: 'team-1_football_batch-clips',
      uploadMode: 'batch_clips',
      videoUrl: 'https://cdn.example.com/clip-1.mp4',
      schemaVersion: 2,
    });
    expect(payload['sources']).toMatchObject([
      expect.objectContaining({ id: 'source-1', title: 'Clip 1' }),
      expect.objectContaining({ id: 'source-2', title: 'Clip 2' }),
    ]);
    expect(payload['timeline']).toMatchObject([
      expect.objectContaining({ sourceId: 'source-1', label: 'Clip 1' }),
      expect.objectContaining({ sourceId: 'source-2', label: 'Clip 2' }),
    ]);
    expect(result.data).toMatchObject({
      filmReview: expect.objectContaining({
        id: 'team-1_football_batch-clips',
        uploadMode: 'batch_clips',
        sourceCount: 2,
      }),
    });
  });

  it('lists persisted film review playlists for authorized team readers', async () => {
    const { db } = createDb({
      playlistWhereDocs: [
        {
          data: () => ({
            id: 'playlist-self-scout',
            teamId: 'team-1',
            name: 'Self Scout Playlist',
            sortOrder: 0,
            createdBy: 'coach-1',
            updatedBy: 'coach-1',
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
        },
      ],
    });

    const tool = new ListFilmReviewPlaylistsTool(db as never);
    const result = await tool.execute({ teamId: 'team-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ count: 1 });
  });

  it('creates a persisted film review playlist document', async () => {
    const { db, playlistSet } = createDb({
      playlistDoc: { exists: false, data: () => undefined },
      playlistWhereDocs: [],
    });

    const tool = new CreateFilmReviewPlaylistTool(db as never);
    const result = await tool.execute(
      {
        playlistId: 'playlist-self-scout',
        teamId: 'team-1',
        name: 'Self Scout Playlist',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(playlistSet).toHaveBeenCalledTimes(1);
    expect(playlistSet.mock.calls[0]?.[0]).toMatchObject({
      id: 'playlist-self-scout',
      teamId: 'team-1',
      name: 'Self Scout Playlist',
      sortOrder: 0,
    });
    expect(mockCacheDel).toHaveBeenCalledWith('team:film_review_playlists:team-1');
  });

  it('updates a film review playlist and keeps assigned review names in sync', async () => {
    const reviewAssignmentUpdate = vi.fn().mockResolvedValue(undefined);
    const { db, playlistUpdate } = createDb({
      playlistDoc: {
        exists: true,
        data: () => ({
          id: 'playlist-self-scout',
          teamId: 'team-1',
          name: 'Self Scout Playlist',
          sortOrder: 0,
          createdBy: 'coach-1',
          updatedBy: 'coach-1',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        }),
      },
      playlistWhereDocs: [
        {
          data: () => ({
            id: 'playlist-self-scout',
            teamId: 'team-1',
            name: 'Self Scout Playlist',
            sortOrder: 0,
            createdBy: 'coach-1',
            updatedBy: 'coach-1',
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
        },
      ],
      reviewByPlaylistDocs: [
        {
          data: () => baseReview,
          ref: { update: reviewAssignmentUpdate },
        },
      ],
    });

    const tool = new UpdateFilmReviewPlaylistTool(db as never);
    const result = await tool.execute(
      {
        playlistId: 'playlist-self-scout',
        name: 'Opponent Scout Playlist',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(playlistUpdate).toHaveBeenCalledTimes(1);
    expect(reviewAssignmentUpdate).toHaveBeenCalledWith({
      playlistName: 'Opponent Scout Playlist',
    });
  });

  it('moves a film review into a persisted playlist and returns the assignment', async () => {
    const { db, update } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => baseReview,
      },
      playlistWhereDocs: [
        {
          data: () => ({
            id: 'playlist-test',
            teamId: 'team-1',
            name: 'Test Folder',
            sortOrder: 1,
            createdBy: 'coach-1',
            updatedBy: 'coach-1',
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
        },
      ],
    });

    const tool = new MoveFilmReviewToPlaylistTool(db as never);
    const result = await tool.execute(
      {
        filmReviewId: 'fr-1',
        playlistName: 'Test Folder',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        playlistId: 'playlist-test',
        playlistName: 'Test Folder',
        updatedBy: 'coach-1',
      })
    );
    expect(result.data).toMatchObject({
      filmReview: expect.objectContaining({
        id: 'fr-1',
        playlistId: 'playlist-test',
        playlistName: 'Test Folder',
      }),
      playlist: expect.objectContaining({ id: 'playlist-test', name: 'Test Folder' }),
    });
  });

  it('rejects ambiguous playlist-name moves so Agent X must use a resolved playlist id', async () => {
    const { db, update } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => baseReview,
      },
      playlistWhereDocs: [
        {
          data: () => ({
            id: 'playlist-a',
            teamId: 'team-1',
            name: 'Test Folder',
            sortOrder: 1,
            createdBy: 'coach-1',
            updatedBy: 'coach-1',
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
        },
        {
          data: () => ({
            id: 'playlist-b',
            teamId: 'team-1',
            name: 'Test Folder',
            sortOrder: 2,
            createdBy: 'coach-1',
            updatedBy: 'coach-1',
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
        },
      ],
    });

    const tool = new MoveFilmReviewToPlaylistTool(db as never);
    const result = await tool.execute(
      {
        filmReviewId: 'fr-1',
        playlistName: 'Test Folder',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Multiple film review playlists');
    expect(update).not.toHaveBeenCalled();
  });

  it('extracts selected batch clips into standalone reviews and assigns the target playlist', async () => {
    const { db, set } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => ({
          ...baseReview,
          title: 'Batch Clip Session',
          uploadMode: 'batch_clips',
          videoUrl: 'https://cdn.example.com/batch.mp4',
          sources: [
            {
              id: 'source-1',
              order: 0,
              title: 'IMG_0092 2',
              videoUrl: 'https://cdn.example.com/img-0092-2.mp4',
              durationSec: 12,
            },
            {
              id: 'source-2',
              order: 1,
              title: 'IMG_0093 2',
              videoUrl: 'https://cdn.example.com/img-0093-2.mp4',
              durationSec: 14,
            },
            {
              id: 'source-3',
              order: 2,
              title: 'IMG_0191',
              videoUrl: 'https://cdn.example.com/img-0191.mp4',
              durationSec: 9,
            },
          ],
          timeline: [
            {
              id: 'play-source-1',
              number: 1,
              label: 'IMG_0092 2',
              startSec: 0,
              endSec: 12,
              sourceId: 'source-1',
            },
            {
              id: 'play-source-2',
              number: 2,
              label: 'IMG_0093 2',
              startSec: 0,
              endSec: 14,
              sourceId: 'source-2',
            },
            {
              id: 'play-source-3',
              number: 3,
              label: 'IMG_0191',
              startSec: 0,
              endSec: 9,
              sourceId: 'source-3',
            },
          ],
        }),
      },
      playlistWhereDocs: [
        {
          data: () => ({
            id: 'playlist-test',
            teamId: 'team-1',
            name: 'Test Folder',
            sortOrder: 1,
            createdBy: 'coach-1',
            updatedBy: 'coach-1',
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          }),
        },
      ],
    });

    const tool = new ExtractFilmReviewClipsTool(db as never);
    const result = await tool.execute(
      {
        filmReviewId: 'fr-1',
        sourceTitles: ['IMG_0092 2', 'IMG_0093 2'],
        outputMode: 'separate_reviews',
        playlistName: 'Test Folder',
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(set).toHaveBeenCalledTimes(2);
    const createdDocs = set.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(createdDocs[0]).toMatchObject({
      title: 'IMG_0092 2',
      uploadMode: 'full_footage',
      playlistId: 'playlist-test',
      playlistName: 'Test Folder',
      videoUrl: 'https://cdn.example.com/img-0092-2.mp4',
    });
    expect(createdDocs[1]).toMatchObject({
      title: 'IMG_0093 2',
      uploadMode: 'full_footage',
      playlistId: 'playlist-test',
      playlistName: 'Test Folder',
      videoUrl: 'https://cdn.example.com/img-0093-2.mp4',
    });
    expect(result.data).toMatchObject({
      count: 2,
      playlist: expect.objectContaining({ id: 'playlist-test', name: 'Test Folder' }),
      createdFilmReviews: [
        expect.objectContaining({ title: 'IMG_0092 2', playlistId: 'playlist-test' }),
        expect.objectContaining({ title: 'IMG_0093 2', playlistId: 'playlist-test' }),
      ],
    });
  });

  it('lists individual source videos for a multi-source film review', async () => {
    const { db } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => ({
          ...baseReview,
          uploadMode: 'batch_clips',
          breakdownSource: {
            provider: 'hudl_csv',
            fileName: 'week-4.csv',
            mimeType: 'text/csv',
            storagePath: 'Teams/team-1/breakdowns/week-4.csv',
            rowCount: 4,
            playCount: 3,
            importedBy: 'coach-1',
            importedAt: '2026-06-18T00:00:00.000Z',
          },
          sources: [
            {
              id: 'source-1',
              order: 0,
              title: 'Clip 1',
              videoUrl: 'https://cdn.example.com/1.mp4',
            },
            {
              id: 'source-2',
              order: 1,
              title: 'Clip 2',
              videoUrl: 'https://cdn.example.com/2.mp4',
            },
          ],
          timeline: [
            {
              id: 'play-1',
              number: 1,
              label: 'Clip 1 - Play A',
              startSec: 0,
              endSec: 4,
              sourceId: 'source-1',
            },
            {
              id: 'play-2',
              number: 2,
              label: 'Clip 1 - Play B',
              startSec: 4,
              endSec: 8,
              sourceId: 'source-1',
            },
            {
              id: 'play-3',
              number: 3,
              label: 'Clip 2 - Play A',
              startSec: 0,
              endSec: 5,
              sourceId: 'source-2',
            },
          ],
          timelineState: 'ready',
        }),
      },
    });

    const tool = new ListFilmReviewSourcesTool(db as never);
    const result = await tool.execute({ filmReviewId: 'fr-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      count: 2,
      sources: [
        expect.objectContaining({
          id: 'source-1',
          title: 'Clip 1',
          breakdownSummary: expect.objectContaining({
            hasBreakdown: true,
            playCount: 2,
            firstPlayNumber: 1,
            lastPlayNumber: 2,
            breakdownProvider: 'hudl_csv',
          }),
        }),
        expect.objectContaining({
          id: 'source-2',
          title: 'Clip 2',
          breakdownSummary: expect.objectContaining({
            hasBreakdown: true,
            playCount: 1,
            firstPlayNumber: 1,
            lastPlayNumber: 1,
            breakdownProvider: 'hudl_csv',
          }),
        }),
      ],
      breakdownSource: expect.objectContaining({ provider: 'hudl_csv' }),
    });
  });

  it('returns source-scoped breakdown rows for one source clip', async () => {
    const { db } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => ({
          ...baseReview,
          uploadMode: 'batch_clips',
          breakdownSource: {
            provider: 'hudl_csv',
            fileName: 'week-4.csv',
            mimeType: 'text/csv',
            storagePath: 'Teams/team-1/breakdowns/week-4.csv',
            rowCount: 4,
            playCount: 3,
            importedBy: 'coach-1',
            importedAt: '2026-06-18T00:00:00.000Z',
          },
          sources: [
            {
              id: 'source-1',
              order: 0,
              title: 'Clip 1',
              videoUrl: 'https://cdn.example.com/1.mp4',
            },
            {
              id: 'source-2',
              order: 1,
              title: 'Clip 2',
              videoUrl: 'https://cdn.example.com/2.mp4',
            },
          ],
          timeline: [
            {
              id: 'play-1',
              number: 10,
              label: 'Clip 1 - Play A',
              startSec: 0,
              endSec: 4,
              sourceId: 'source-1',
            },
            {
              id: 'play-2',
              number: 11,
              label: 'Clip 1 - Play B',
              startSec: 4,
              endSec: 8,
              sourceId: 'source-1',
            },
            {
              id: 'play-3',
              number: 20,
              label: 'Clip 2 - Play A',
              startSec: 0,
              endSec: 5,
              sourceId: 'source-2',
            },
          ],
          timelineState: 'ready',
        }),
      },
    });

    const tool = new GetFilmReviewSourceBreakdownTool(db as never);
    const result = await tool.execute(
      { filmReviewId: 'fr-1', sourceId: 'source-1' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      sportTagSchemaKey: 'football',
      source: expect.objectContaining({ id: 'source-1', title: 'Clip 1' }),
      playCount: 2,
      breakdownSource: expect.objectContaining({ provider: 'hudl_csv' }),
      breakdownSummary: expect.objectContaining({
        hasBreakdown: true,
        playCount: 2,
        breakdownProvider: 'hudl_csv',
      }),
      timeline: [
        expect.objectContaining({ id: 'play-1', sourceId: 'source-1', number: 1 }),
        expect.objectContaining({ id: 'play-2', sourceId: 'source-1', number: 2 }),
      ],
    });
    expect(result.data?.sportTagSchema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'odk', label: 'ODK' }),
        expect.objectContaining({ id: 'down', label: 'DN' }),
      ])
    );
  });

  it('exposes the correct non-football source breakdown schema for follow-up edits', async () => {
    const { db } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => ({
          ...baseReview,
          sport: 'basketball',
          uploadMode: 'batch_clips',
          sources: [
            {
              id: 'source-1',
              order: 0,
              title: 'Basketball Clip 1',
              videoUrl: 'https://cdn.example.com/basketball-1.mp4',
            },
          ],
          timeline: [
            {
              id: 'play-1',
              number: 1,
              label: 'Horns Twist',
              startSec: 0,
              endSec: 8,
              sourceId: 'source-1',
              tags: {
                period: '1',
                clock: '6:32',
                possession: 'O',
                action: 'Horns Twist',
              },
            },
          ],
          timelineState: 'ready',
        }),
      },
    });

    const tool = new GetFilmReviewSourceBreakdownTool(db as never);
    const result = await tool.execute(
      { filmReviewId: 'fr-1', sourceId: 'source-1' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      sportTagSchemaKey: 'basketball',
      source: expect.objectContaining({ id: 'source-1', title: 'Basketball Clip 1' }),
      playCount: 1,
    });
    expect(result.data?.sportTagSchema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'period', label: 'PERIOD' }),
        expect.objectContaining({ id: 'clock', label: 'CLOCK' }),
        expect.objectContaining({ id: 'possession', label: 'POSS' }),
      ])
    );
  });

  it('updates one source clip breakdown without replacing other source rows', async () => {
    const existingReview = {
      ...baseReview,
      uploadMode: 'batch_clips',
      sources: [
        { id: 'source-1', order: 0, title: 'Clip 1', videoUrl: 'https://cdn.example.com/1.mp4' },
        { id: 'source-2', order: 1, title: 'Clip 2', videoUrl: 'https://cdn.example.com/2.mp4' },
      ],
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Old Clip 1',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-1',
        },
        {
          id: 'play-2',
          number: 2,
          label: 'Clip 2 Play',
          startSec: 1,
          endSec: 5,
          sourceId: 'source-2',
        },
      ],
      timelineState: 'ready',
    };

    const updateMutation = vi.fn().mockResolvedValue(undefined);
    const { db } = createDb({
      filmReviewDoc: { exists: true, data: () => existingReview },
      update: updateMutation,
    });

    const tool = new UpdateFilmReviewSourceBreakdownTool(db as never);
    const result = await tool.execute(
      {
        filmReviewId: 'fr-1',
        sourceId: 'source-1',
        timeline: [
          { id: 'new-1', label: 'New Clip 1 Play A', startSec: 0, endSec: 3 },
          { id: 'new-2', label: 'New Clip 1 Play B', startSec: 3, endSec: 7 },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(updateMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: [
          expect.objectContaining({ id: 'play-2', sourceId: 'source-2', number: 1 }),
          expect.objectContaining({ id: 'new-1', sourceId: 'source-1', number: 2 }),
          expect.objectContaining({ id: 'new-2', sourceId: 'source-1', number: 3 }),
        ],
      })
    );
    expect(result.data).toMatchObject({
      source: expect.objectContaining({ id: 'source-1' }),
      playCount: 2,
      timeline: [
        expect.objectContaining({ id: 'new-1', sourceId: 'source-1', number: 1 }),
        expect.objectContaining({ id: 'new-2', sourceId: 'source-1', number: 2 }),
      ],
    });
  });

  it('appends and deletes source-scoped breakdown rows for one clip', async () => {
    const existingReview = {
      ...baseReview,
      uploadMode: 'batch_clips',
      sources: [
        { id: 'source-1', order: 0, title: 'Clip 1', videoUrl: 'https://cdn.example.com/1.mp4' },
        { id: 'source-2', order: 1, title: 'Clip 2', videoUrl: 'https://cdn.example.com/2.mp4' },
      ],
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Clip 1 Play',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-1',
        },
        {
          id: 'play-2',
          number: 2,
          label: 'Clip 2 Play',
          startSec: 1,
          endSec: 5,
          sourceId: 'source-2',
        },
      ],
      timelineState: 'ready',
    };

    const appendMutation = vi.fn().mockResolvedValue(undefined);
    const { db: appendDb } = createDb({
      filmReviewDoc: { exists: true, data: () => existingReview },
      update: appendMutation,
    });

    const appendTool = new UpdateFilmReviewSourceBreakdownTool(appendDb as never);
    const appendResult = await appendTool.execute(
      {
        filmReviewId: 'fr-1',
        sourceId: 'source-1',
        mergeMode: 'append',
        timeline: [{ id: 'play-3', label: 'Clip 1 Extra', startSec: 4, endSec: 8 }],
      },
      { userId: 'coach-1' }
    );

    expect(appendResult.success).toBe(true);
    expect(appendMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: expect.arrayContaining([
          expect.objectContaining({ id: 'play-1', sourceId: 'source-1' }),
          expect.objectContaining({ id: 'play-2', sourceId: 'source-2' }),
          expect.objectContaining({ id: 'play-3', sourceId: 'source-1' }),
        ]),
      })
    );

    const deleteMutation = vi.fn().mockResolvedValue(undefined);
    const { db: deleteDb } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => ({
          ...existingReview,
          timeline: [
            {
              id: 'play-1',
              number: 1,
              label: 'Clip 1 Play',
              startSec: 0,
              endSec: 4,
              sourceId: 'source-1',
            },
            {
              id: 'play-3',
              number: 2,
              label: 'Clip 1 Extra',
              startSec: 4,
              endSec: 8,
              sourceId: 'source-1',
            },
            {
              id: 'play-2',
              number: 3,
              label: 'Clip 2 Play',
              startSec: 1,
              endSec: 5,
              sourceId: 'source-2',
            },
          ],
        }),
      },
      update: deleteMutation,
    });

    const deleteTool = new DeleteFilmReviewSourceBreakdownTool(deleteDb as never);
    const deleteResult = await deleteTool.execute(
      {
        filmReviewId: 'fr-1',
        sourceId: 'source-1',
        rowIds: ['play-1'],
      },
      { userId: 'coach-1' }
    );

    expect(deleteResult.success).toBe(true);
    expect(deleteMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        timeline: [
          expect.objectContaining({ id: 'play-3', sourceId: 'source-1', number: 1 }),
          expect.objectContaining({ id: 'play-2', sourceId: 'source-2', number: 2 }),
        ],
      })
    );
    expect(deleteResult.data).toMatchObject({
      deletedCount: 1,
      playCount: 1,
      timeline: [expect.objectContaining({ id: 'play-3', sourceId: 'source-1', number: 1 })],
    });
  });

  it('adds, updates, and deletes individual source videos in a multi-source film review', async () => {
    const existingReview = {
      ...baseReview,
      uploadMode: 'batch_clips',
      schemaVersion: 2,
      sources: [
        {
          id: 'source-1',
          order: 0,
          title: 'Clip 1',
          videoUrl: 'https://cdn.example.com/clip-1.mp4',
          durationSec: 10,
        },
        {
          id: 'source-2',
          order: 1,
          title: 'Clip 2',
          videoUrl: 'https://cdn.example.com/clip-2.mp4',
          durationSec: 12,
        },
      ],
      timeline: [
        {
          id: 'play-source-1',
          number: 1,
          label: 'Clip 1',
          startSec: 0,
          endSec: 10,
          sourceId: 'source-1',
        },
        {
          id: 'play-source-2',
          number: 2,
          label: 'Clip 2',
          startSec: 0,
          endSec: 12,
          sourceId: 'source-2',
        },
      ],
    };

    const addUpdate = vi.fn().mockResolvedValue(undefined);
    const { db: addDb } = createDb({
      filmReviewDoc: { exists: true, data: () => existingReview },
      update: addUpdate,
    });

    const addTool = new AddFilmReviewSourceTool(addDb as never);
    const addResult = await addTool.execute(
      {
        filmReviewId: 'fr-1',
        source: {
          id: 'source-3',
          order: 2,
          title: 'Clip 3',
          videoUrl: 'https://cdn.example.com/clip-3.mp4',
          durationSec: 8,
        },
      },
      { userId: 'coach-1' }
    );

    expect(addResult.success).toBe(true);
    expect(addUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadMode: 'batch_clips',
        sources: expect.arrayContaining([
          expect.objectContaining({ id: 'source-3', title: 'Clip 3' }),
        ]),
      })
    );

    const updateMutation = vi.fn().mockResolvedValue(undefined);
    const { db: updateDb } = createDb({
      filmReviewDoc: { exists: true, data: () => existingReview },
      update: updateMutation,
    });

    const updateTool = new UpdateFilmReviewSourceTool(updateDb as never);
    const updateResult = await updateTool.execute(
      {
        filmReviewId: 'fr-1',
        sourceId: 'source-2',
        title: 'Updated Clip 2',
        videoUrl: 'https://cdn.example.com/clip-2-updated.mp4',
        durationSec: 15,
      },
      { userId: 'coach-1' }
    );

    expect(updateResult.success).toBe(true);
    expect(updateMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            id: 'source-2',
            title: 'Updated Clip 2',
            videoUrl: 'https://cdn.example.com/clip-2-updated.mp4',
            durationSec: 15,
          }),
        ]),
      })
    );

    const deleteMutation = vi.fn().mockResolvedValue(undefined);
    const { db: deleteDb } = createDb({
      filmReviewDoc: { exists: true, data: () => existingReview },
      update: deleteMutation,
    });

    const deleteTool = new DeleteFilmReviewSourceTool(deleteDb as never);
    const deleteResult = await deleteTool.execute(
      { filmReviewId: 'fr-1', sourceId: 'source-2' },
      { userId: 'coach-1' }
    );

    expect(deleteResult.success).toBe(true);
    expect(deleteMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadMode: 'full_footage',
        sources: [expect.objectContaining({ id: 'source-1' })],
      })
    );
    expect(deleteResult.data).toMatchObject({ deletedSourceId: 'source-2', sourceCount: 1 });
  });

  it('deletes a film review playlist and clears assigned reviews', async () => {
    const reviewAssignmentUpdate = vi.fn().mockResolvedValue(undefined);
    const childPlaylistUpdate = vi.fn().mockResolvedValue(undefined);
    const { db, playlistDeleteDoc } = createDb({
      playlistDoc: {
        exists: true,
        data: () => ({
          id: 'playlist-self-scout',
          teamId: 'team-1',
          name: 'Self Scout Playlist',
          sortOrder: 0,
          createdBy: 'coach-1',
          updatedBy: 'coach-1',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        }),
      },
      reviewByPlaylistDocs: [
        {
          data: () => baseReview,
          ref: { update: reviewAssignmentUpdate },
        },
      ],
      playlistChildrenDocs: [
        {
          data: () => ({ id: 'playlist-child', parentId: 'playlist-self-scout' }),
          ref: { update: childPlaylistUpdate },
        },
      ],
    });

    const tool = new DeleteFilmReviewPlaylistTool(db as never);
    const result = await tool.execute({ playlistId: 'playlist-self-scout' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(reviewAssignmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ playlistId: null, playlistName: null, updatedBy: 'coach-1' })
    );
    expect(childPlaylistUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null, updatedBy: 'coach-1' })
    );
    expect(playlistDeleteDoc).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthorized film review writes', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const { db, set } = createDb({});

    const tool = new SaveFilmReviewTool(db as never);
    const result = await tool.execute(
      {
        teamId: 'team-1',
        sport: 'football',
        title: 'Week 4 Film',
        videoUrl: 'https://cdn.example.com/week-4.mp4',
      },
      { userId: 'assistant-1' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authorized');
    expect(set).not.toHaveBeenCalled();
  });

  it('updates a film review and resets timeline when sport changes without replacement rows', async () => {
    const { db, update } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => ({
          ...baseReview,
          timeline: [{ id: 'old-play', number: 1, label: 'Old', startSec: 0, endSec: 10 }],
        }),
      },
    });

    const tool = new UpdateFilmReviewTool(db as never);
    const result = await tool.execute(
      { filmReviewId: 'fr-1', sport: 'basketball', title: 'Converted Review' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      sport: 'basketball',
      title: 'Converted Review',
      timeline: [],
      timelineState: 'idle',
      timelineError: null,
    });
    expect(result.data).toMatchObject({
      filmReview: expect.objectContaining({
        id: 'fr-1',
        title: 'Converted Review',
        playlistId: undefined,
        playlistName: undefined,
      }),
    });
  });

  it('resets timeline when sport changes even if timeline rows are provided in payload', async () => {
    const { db, update } = createDb({
      filmReviewDoc: {
        exists: true,
        data: () => ({
          ...baseReview,
          timeline: [{ id: 'old-play', number: 1, label: 'Old', startSec: 0, endSec: 10 }],
        }),
      },
    });

    const tool = new UpdateFilmReviewTool(db as never);
    const result = await tool.execute(
      {
        filmReviewId: 'fr-1',
        sport: 'basketball',
        timeline: [{ label: 'Fast break', startSec: 2, endSec: 9 }],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      sport: 'basketball',
      timeline: [],
      timelineState: 'idle',
      timelineGeneratedAt: null,
      timelineError: null,
    });
  });

  it('hard deletes film reviews from the collection', async () => {
    const { db, update, deleteDoc } = createDb({
      filmReviewDoc: { exists: true, data: () => baseReview },
    });

    const tool = new DeleteFilmReviewTool(db as never);
    const result = await tool.execute(
      { filmReviewId: 'fr-1', reason: 'Duplicate upload' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('hard deletes all linked cloudflare and firebase assets for multi-source reviews', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acct-test';
    process.env['CLOUDFLARE_API_TOKEN'] = 'token-test';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      })
    );

    const reviewWithLinkedMedia = {
      ...baseReview,
      cloudflareVideoId: 'cf-main',
      storagePath: 'Teams/team-1/library/main.mp4',
      videoUrl: 'https://storage.googleapis.com/nxt1-test/Teams/team-1/library/main.mp4?sig=1',
      sources: [
        {
          id: 'source-1',
          order: 0,
          videoUrl: 'https://watch.cloudflarestream.com/cf-main',
          storagePath: 'Teams/team-1/library/main.mp4',
          cloudflareVideoId: 'cf-main',
        },
        {
          id: 'source-2',
          order: 1,
          videoUrl:
            'https://firebasestorage.googleapis.com/v0/b/nxt1-test/o/Teams%2Fteam-1%2Flibrary%2Fclip-2.mp4?alt=media&token=abc',
          cloudflareVideoId: 'cf-clip-2',
        },
      ],
      breakdownSource: {
        provider: 'csv',
        fileName: 'week-4.csv',
        mimeType: 'text/csv',
        storagePath: 'Teams/team-1/library/breakdowns/week-4.csv',
        rowCount: 22,
        playCount: 20,
        importedBy: 'coach-1',
        importedAt: '2026-06-18T00:00:00.000Z',
      },
    };

    const { db, deleteDoc } = createDb({
      filmReviewDoc: { exists: true, data: () => reviewWithLinkedMedia },
    });

    const tool = new DeleteFilmReviewTool(db as never);
    const result = await tool.execute({ filmReviewId: 'fr-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    expect(deleteDoc).toHaveBeenCalledTimes(1);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://api.cloudflare.com/client/v4/accounts/acct-test/stream/cf-main',
      'https://api.cloudflare.com/client/v4/accounts/acct-test/stream/cf-clip-2',
    ]);

    expect(mockStorageDelete.mock.calls).toEqual([
      ['Teams/team-1/library/main.mp4', { ignoreNotFound: true }],
      ['Teams/team-1/library/clip-2.mp4', { ignoreNotFound: true }],
      ['Teams/team-1/library/breakdowns/week-4.csv', { ignoreNotFound: true }],
    ]);
  });

  it('adds timestamped annotations for review owners', async () => {
    mockCanManageTeamMutationForUser.mockResolvedValue(false);
    const { db, update } = createDb({
      filmReviewDoc: { exists: true, data: () => baseReview },
    });

    const tool = new AddFilmReviewAnnotationTool(db as never);
    const result = await tool.execute(
      { filmReviewId: 'fr-1', note: 'Check the safety rotation', atSec: 42, color: '#ffcc00' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0]?.[0] as Record<string, unknown>;
    const annotations = payload['annotations'] as readonly Record<string, unknown>[];
    expect(annotations[0]).toMatchObject({
      note: 'Check the safety rotation',
      atSec: 42,
      color: '#ffcc00',
      createdBy: 'coach-1',
    });
  });
});
