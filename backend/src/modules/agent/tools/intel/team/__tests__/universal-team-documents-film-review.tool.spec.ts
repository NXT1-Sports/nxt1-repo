import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../../../../services/team/universal-file-semantic.service.js', () => ({
  UniversalFileSemanticService: class {
    async search(): Promise<readonly unknown[]> {
      return [];
    }
  },
}));

import {
  GetUniversalTeamDocumentTool,
  ListUniversalTeamDocumentsTool,
} from '../universal-team-documents.tool.js';

type MockDoc = {
  readonly id: string;
  readonly data: () => Record<string, unknown>;
};

function createQuery(
  docs: readonly MockDoc[],
  filters: readonly { field: string; value: unknown }[] = []
): {
  readonly where: ReturnType<typeof vi.fn>;
  readonly orderBy: ReturnType<typeof vi.fn>;
  readonly offset: ReturnType<typeof vi.fn>;
  readonly limit: ReturnType<typeof vi.fn>;
  readonly get: ReturnType<typeof vi.fn>;
} {
  const applyFilters = () =>
    docs.filter((doc) => {
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
        createQuery(docs, [...filters, { field, value }])
      ),
    orderBy: vi.fn().mockImplementation(() => createQuery(docs, filters)),
    offset: vi.fn().mockImplementation(() => createQuery(docs, filters)),
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
              exists: docs.some((doc) => doc.id === id),
              id,
              data: () => docs.find((doc) => doc.id === id)?.data() ?? {},
            }),
          })),
          where: vi
            .fn()
            .mockImplementation((field: string, _op: string, value: unknown) =>
              createQuery(docs, [{ field, value }])
            ),
          orderBy: vi.fn().mockImplementation(() => createQuery(docs)),
        };
      }

      if (name === 'RosterEntries') {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }),
    getAll: vi
      .fn()
      .mockImplementation(async (...refs: Array<{ get: () => Promise<unknown> }>) =>
        Promise.all(refs.map(async (ref) => (await ref.get()) as never))
      ),
  };
}

const filmReviewDoc: MockDoc = {
  id: 'review-1',
  data: () => ({
    teamId: 'team-1',
    type: 'file',
    payloadKind: 'native',
    title: 'Opponent Week 1',
    status: 'ready',
    sport: 'football',
    summary: 'Film review summary',
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
        aiSummary: 'Opponent majors in zone run.',
        keyInsights: ['Boundary safety rotates late'],
        timelineState: 'ready',
        sources: [],
        timeline: [],
      },
    },
  }),
};

describe('universal team documents tool film review inspection', () => {
  it('loads a film review artifact through get_universal_team_document', async () => {
    const db = createDb([filmReviewDoc]);
    const tool = new GetUniversalTeamDocumentTool(db as never);

    const result = await tool.execute({ documentId: 'review-1' }, { userId: 'coach-1' });

    expect(result.success).toBe(true);
    const data = result.data as {
      summary: {
        type: string;
        artifactKind: string;
        editableViaUniversalDocumentTool: boolean;
        metadata: { sourceCount: number };
      };
    };
    expect(data.summary.type).toBe('file');
    expect(data.summary.artifactKind).toBe('film_review');
    expect(data.summary.editableViaUniversalDocumentTool).toBe(false);
    expect(data.summary.metadata.sourceCount).toBe(0);
  });

  it('includes film review artifacts in list_universal_team_documents filters', async () => {
    const db = createDb([filmReviewDoc]);
    const tool = new ListUniversalTeamDocumentsTool(db as never);

    const result = await tool.execute(
      { teamId: 'team-1', classification: 'film_review' },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    const data = result.data as { documents: Array<{ id: string }> };
    expect(data.documents.map((document) => document.id)).toEqual(['review-1']);
  });
});
