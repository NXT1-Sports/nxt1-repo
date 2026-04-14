import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFirestoreMock = vi.hoisted(() => vi.fn());
const stagingDbMock = vi.hoisted(() => ({ collection: vi.fn() }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: getFirestoreMock,
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date | string) {}

    toDate() {
      return this.value instanceof Date ? this.value : new Date(this.value);
    }
  },
}));

vi.mock('../../../../../utils/firebase-staging.js', () => ({
  stagingDb: stagingDbMock,
}));

vi.mock('../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { QueryNxt1PlatformDataTool } from '../query-nxt1-platform-data.tool.js';

function createSnapshot(rows: Array<Record<string, unknown>>) {
  return {
    empty: rows.length === 0,
    docs: rows.map((row, index) => ({
      id: String(row['id'] ?? `doc-${index + 1}`),
      data: () => row,
    })),
  };
}

function createMockDb(collectionRows: Record<string, Array<Record<string, unknown>>>) {
  const applyWhere = (
    rows: Array<Record<string, unknown>>,
    field: string,
    operator: string,
    value: unknown
  ) => {
    if (operator === '==') {
      return rows.filter((row) => row[field] === value);
    }

    if (operator === 'array-contains') {
      return rows.filter(
        (row) => Array.isArray(row[field]) && (row[field] as unknown[]).includes(value)
      );
    }

    throw new Error(`Unsupported operator ${operator}`);
  };

  const createQuery = (
    rows: Array<Record<string, unknown>>,
    limitValue?: number
  ): {
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    startAfter: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  } => ({
    where: vi.fn((field: string, operator: string, value: unknown) =>
      createQuery(applyWhere(rows, field, operator, value), limitValue)
    ),
    limit: vi.fn((nextLimit: number) => createQuery(rows, nextLimit)),
    startAfter: vi.fn((doc: { id: string }) => {
      const startIndex = rows.findIndex((row) => String(row['id']) === doc.id);
      return createQuery(startIndex >= 0 ? rows.slice(startIndex + 1) : rows, limitValue);
    }),
    get: vi.fn(async () => createSnapshot(limitValue ? rows.slice(0, limitValue) : rows)),
  });

  return {
    collection: vi.fn().mockImplementation((name: string) => {
      const rows = collectionRows[name];
      if (!rows) {
        throw new Error(`Unexpected collection ${name}`);
      }

      return {
        ...createQuery(rows),
        doc: vi.fn((id: string) => ({
          get: vi.fn(async () => {
            const row = rows.find((entry) => String(entry['id']) === id);
            return {
              exists: Boolean(row),
              id,
              data: () => row,
            };
          }),
        })),
      };
    }),
  };
}

describe('QueryNxt1PlatformDataTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFirestoreMock.mockReturnValue(
      createMockDb({
        Users: [],
        Teams: [],
        Organizations: [],
        Posts: [],
        Recruiting: [],
        PlayerStats: [],
        PlayerMetrics: [],
        RosterEntries: [],
        Events: [],
      })
    );
  });

  it('counts posts across the full platform and returns totalCount', async () => {
    const db = createMockDb({
      Users: [],
      Teams: [],
      Organizations: [],
      Posts: [
        {
          id: 'post-1',
          userId: 'user-1',
          type: 'highlight',
          sportId: 'Football',
          title: 'Week 1 TD',
        },
        {
          id: 'post-2',
          userId: 'user-2',
          type: 'highlight',
          sportId: 'Football',
          title: 'Week 2 TD',
        },
        {
          id: 'post-3',
          userId: 'user-3',
          type: 'highlight',
          sportId: 'Basketball',
          title: 'Dunk Mix',
        },
      ],
      Recruiting: [],
      PlayerStats: [],
      PlayerMetrics: [],
      RosterEntries: [],
      Events: [],
    });

    const tool = new QueryNxt1PlatformDataTool({ production: db as never });
    const result = await tool.execute({
      entityType: 'posts',
      postType: 'highlight',
      sport: 'Football',
    });

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['totalCount']).toBe(2);
    expect((result.data as Record<string, unknown>)['items']).toEqual([
      expect.objectContaining({ id: 'post-1', type: 'highlight' }),
      expect.objectContaining({ id: 'post-2', type: 'highlight' }),
    ]);
  });

  it('returns a full cross-collection user bundle', async () => {
    const db = createMockDb({
      Users: [
        {
          id: 'user-1',
          displayName: 'Jordan Miles',
          unicode: '123456',
          role: 'athlete',
          primarySport: 'Football',
          profileImgs: ['https://cdn.test/jordan.jpg'],
        },
      ],
      Teams: [],
      Organizations: [],
      Posts: [
        { id: 'post-1', userId: 'user-1', type: 'highlight', title: 'Senior Tape' },
        { id: 'post-2', userId: 'user-1', type: 'update', title: 'Offer Update' },
      ],
      Recruiting: [
        {
          id: 'recruit-1',
          userId: 'user-1',
          sport: 'Football',
          category: 'offer',
          collegeName: 'Rice',
        },
      ],
      PlayerStats: [
        {
          id: 'stat-1',
          userId: 'user-1',
          sportId: 'Football',
          season: '2025',
          category: 'passing',
        },
      ],
      PlayerMetrics: [
        {
          id: 'metric-1',
          userId: 'user-1',
          sportId: 'Football',
          field: 'forty',
          label: '40 Yard Dash',
          value: 4.62,
        },
      ],
      RosterEntries: [
        {
          id: 'roster-1',
          userId: 'user-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          role: 'athlete',
          sport: 'Football',
        },
      ],
      Events: [{ id: 'event-1', userId: 'user-1', type: 'camp', title: 'Elite Camp' }],
    });

    const tool = new QueryNxt1PlatformDataTool({ production: db as never });
    const result = await tool.execute({ entityType: 'user_bundle', userId: 'user-1' });

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['matched']).toBe(true);
    expect((result.data as Record<string, unknown>)['user']).toEqual(
      expect.objectContaining({ id: 'user-1', name: 'Jordan Miles', sport: 'Football' })
    );
    expect((result.data as Record<string, unknown>)['totals']).toEqual({
      posts: 2,
      recruiting: 1,
      seasonStats: 1,
      physicalMetrics: 1,
      rosterEntries: 1,
      events: 1,
    });
  });

  it('uses staging firestore when the runtime environment is staging', async () => {
    const stagingDb = createMockDb({
      Users: [],
      Teams: [],
      Organizations: [
        { id: 'org-1', name: 'Houston Select', status: 'active', location: 'Houston, TX' },
      ],
      Posts: [],
      Recruiting: [],
      PlayerStats: [],
      PlayerMetrics: [],
      RosterEntries: [],
      Events: [],
    });

    const tool = new QueryNxt1PlatformDataTool({ staging: stagingDb as never });
    const result = await tool.execute(
      { entityType: 'organizations', state: 'TX' },
      { userId: 'user-1', environment: 'staging' }
    );

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['totalCount']).toBe(1);
  });
});
