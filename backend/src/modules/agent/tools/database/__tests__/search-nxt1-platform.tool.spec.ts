import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllTeamsMock = vi.hoisted(() => vi.fn());
const getFirestoreMock = vi.hoisted(() => vi.fn());
const stagingDbMock = vi.hoisted(() => ({ collection: vi.fn() }));

vi.mock('../../../../../services/team-code.service.js', () => ({
  getAllTeams: getAllTeamsMock,
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: getFirestoreMock,
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

import { SearchNxt1PlatformTool } from '../search-nxt1-platform.tool.js';

function createUsersSnapshot(rows: Array<Record<string, unknown>>) {
  return {
    docs: rows.map((row, index) => ({
      id: String(row['id'] ?? `user-${index + 1}`),
      data: () => row,
    })),
  };
}

function createMockDb(userRows: Array<Record<string, unknown>>) {
  const state = {
    whereCalls: [] as Array<[string, string, unknown]>,
  };

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
  } => {
    const query = {
      where: vi.fn((field: string, operator: string, value: unknown) => {
        state.whereCalls.push([field, operator, value]);
        return createQuery(applyWhere(rows, field, operator, value), limitValue);
      }),
      limit: vi.fn((nextLimit: number) => createQuery(rows, nextLimit)),
      startAfter: vi.fn((doc: { id: string }) => {
        const startIndex = rows.findIndex((row) => String(row['id']) === doc.id);
        return createQuery(startIndex >= 0 ? rows.slice(startIndex + 1) : rows, limitValue);
      }),
      get: vi.fn(async () => createUsersSnapshot(limitValue ? rows.slice(0, limitValue) : rows)),
    };

    return query;
  };

  return {
    collection: vi.fn().mockImplementation((name: string) => {
      if (name !== 'Users') {
        throw new Error(`Unexpected collection ${name}`);
      }

      return createQuery(userRows);
    }),
    state,
  };
}

describe('SearchNxt1PlatformTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFirestoreMock.mockReturnValue({ collection: vi.fn() });
  });

  it('browses active teams without requiring a query', async () => {
    getAllTeamsMock.mockResolvedValue({
      teams: [
        {
          id: 'team-1',
          teamCode: 'FBN123',
          teamName: 'Strake Jesuit Football',
          sport: 'Football',
          city: 'Houston',
          state: 'TX',
          slug: 'strake-jesuit-football',
        },
      ],
    });

    const productionDb = {} as never;
    const tool = new SearchNxt1PlatformTool({ production: productionDb });
    const result = await tool.execute({ entityType: 'teams', sport: 'Football', state: 'TX' });

    expect(result.success).toBe(true);
    expect(getAllTeamsMock).toHaveBeenCalledWith(
      productionDb,
      expect.objectContaining({ sportName: 'Football', state: 'TX' })
    );
    expect((result.data as Record<string, unknown>)['items']).toEqual([
      expect.objectContaining({
        type: 'team',
        name: 'Strake Jesuit Football',
        route: '/team/strake-jesuit-football/FBN123',
      }),
    ]);
  });

  it('requires a query or filters for user searches', async () => {
    const tool = new SearchNxt1PlatformTool();
    const result = await tool.execute({ entityType: 'users' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('query');
  });

  it('searches global user profiles by searchIndex and role filters', async () => {
    const db = createMockDb([
      {
        id: 'user-1',
        displayName: 'Jordan Miles',
        role: 'athlete',
        unicode: '123456',
        searchIndex: ['jordan miles'],
        sports: [{ sport: 'Football', position: 'QB', team: { name: 'Strake Jesuit' } }],
        location: { state: 'TX' },
        profileImgs: ['https://cdn.test/jordan.jpg'],
      },
    ]);

    const tool = new SearchNxt1PlatformTool({ production: db as never });
    const result = await tool.execute({
      entityType: 'users',
      query: 'Jordan Miles',
      role: 'athlete',
      sport: 'Football',
      state: 'TX',
    });

    expect(result.success).toBe(true);
    expect(db.state.whereCalls).toContainEqual(['role', '==', 'athlete']);
    expect(db.state.whereCalls).toContainEqual(['searchIndex', 'array-contains', 'jordan miles']);
    expect((result.data as Record<string, unknown>)['items']).toEqual([
      expect.objectContaining({
        type: 'user',
        name: 'Jordan Miles',
        route: '/profile/123456',
        sport: 'Football',
      }),
    ]);
    expect((result.data as Record<string, unknown>)['totalCount']).toBe(1);
  });

  it('counts filtered users without requiring a name query', async () => {
    const db = createMockDb([
      {
        id: 'user-1',
        displayName: 'Jordan Miles',
        role: 'athlete',
        unicode: '123456',
        primarySport: 'Football',
      },
      {
        id: 'user-2',
        displayName: 'Aaron Cole',
        role: 'athlete',
        sports: [{ sport: 'Football', position: 'WR' }],
      },
      {
        id: 'user-3',
        displayName: 'Mason Lee',
        role: 'athlete',
        primarySport: 'Basketball',
      },
    ]);

    const tool = new SearchNxt1PlatformTool({ production: db as never });
    const result = await tool.execute({
      entityType: 'users',
      role: 'athlete',
      sport: 'Football',
    });

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['totalCount']).toBe(2);
    expect((result.data as Record<string, unknown>)['userMatchMode']).toBe('filtered_browse');
  });

  it('falls back from a generic category query to filtered user counting', async () => {
    const db = createMockDb([
      {
        id: 'user-1',
        displayName: 'Jordan Miles',
        role: 'athlete',
        primarySport: 'Football',
        searchIndex: ['jordan miles', 'football'],
      },
      {
        id: 'user-2',
        displayName: 'Aaron Cole',
        role: 'athlete',
        sports: [{ sport: 'Football', position: 'WR' }],
        searchIndex: ['aaron cole', 'football'],
      },
    ]);

    const tool = new SearchNxt1PlatformTool({ production: db as never });
    const result = await tool.execute({
      entityType: 'users',
      query: 'football athletes',
      role: 'athlete',
      sport: 'Football',
    });

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)['totalCount']).toBe(2);
    expect((result.data as Record<string, unknown>)['userMatchMode']).toBe('filtered_browse');
  });

  it('uses staging firestore when the runtime environment is staging', async () => {
    getAllTeamsMock.mockResolvedValue({ teams: [] });
    const stagingDb = {} as never;
    const tool = new SearchNxt1PlatformTool({ staging: stagingDb });

    await tool.execute(
      { entityType: 'teams', query: 'Dallas' },
      { userId: 'user-1', environment: 'staging' }
    );

    expect(getAllTeamsMock).toHaveBeenCalledWith(
      stagingDb,
      expect.objectContaining({ search: 'Dallas' })
    );
  });
});
