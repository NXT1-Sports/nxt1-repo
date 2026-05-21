import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCacheDel, mockCanManageTeamMutationForUser, mockCanReadTeamIntelForUser } = vi.hoisted(
  () => ({
    mockCacheDel: vi.fn().mockResolvedValue(undefined),
    mockCanManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
    mockCanReadTeamIntelForUser: vi.fn().mockResolvedValue(true),
  })
);

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
  AddFilmReviewAnnotationTool,
  DeleteFilmReviewTool,
  ListFilmReviewsTool,
  SaveFilmReviewTool,
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
  readonly teamDoc?: { readonly exists: boolean; readonly data: () => unknown };
  readonly set?: ReturnType<typeof vi.fn>;
  readonly update?: ReturnType<typeof vi.fn>;
  readonly whereDocs?: readonly { readonly data: () => unknown }[];
}) {
  const set = options.set ?? vi.fn().mockResolvedValue(undefined);
  const update = options.update ?? vi.fn().mockResolvedValue(undefined);
  const filmReviewDoc =
    options.filmReviewDoc ?? ({ exists: false, data: () => undefined } as const);
  const teamDoc = options.teamDoc ?? { exists: true, data: () => ({ ownerId: 'coach-1' }) };
  const whereDocs = options.whereDocs ?? [];

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
          }),
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: whereDocs }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  return { db, set, update };
}

describe('film review Agent X tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManageTeamMutationForUser.mockResolvedValue(true);
    mockCanReadTeamIntelForUser.mockResolvedValue(true);
    mockCacheDel.mockResolvedValue(undefined);
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
  });

  it('archives film reviews instead of hard deleting them', async () => {
    const { db, update } = createDb({
      filmReviewDoc: { exists: true, data: () => baseReview },
    });

    const tool = new DeleteFilmReviewTool(db as never);
    const result = await tool.execute(
      { filmReviewId: 'fr-1', reason: 'Duplicate upload' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'archived',
        archivedBy: 'coach-1',
        archivedReason: 'Duplicate upload',
      })
    );
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
