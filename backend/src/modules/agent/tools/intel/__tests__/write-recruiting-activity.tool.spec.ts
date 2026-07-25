import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cacheMock,
  canManageTeamMutationForUserMock,
  assertCanManageAthleteProfileTargetMock,
  resolveAuthorizedTargetSportSelectionMock,
  invalidateProfileCachesMock,
  collegeFindOneMock,
} = vi.hoisted(() => ({
  cacheMock: {
    del: vi.fn().mockResolvedValue(undefined),
    delByPrefix: vi.fn().mockResolvedValue(undefined),
  },
  canManageTeamMutationForUserMock: vi.fn().mockResolvedValue(true),
  assertCanManageAthleteProfileTargetMock: vi.fn(),
  resolveAuthorizedTargetSportSelectionMock: vi.fn(),
  invalidateProfileCachesMock: vi.fn().mockResolvedValue(undefined),
  collegeFindOneMock: vi.fn(() => ({
    lean: () => ({
      exec: async () => null,
    }),
  })),
}));

vi.mock('../../../../../services/core/cache.service.js', () => ({
  getCacheService: () => cacheMock,
}));

vi.mock('../../../../../services/team/team-intel-permissions.js', () => ({
  canManageTeamMutationForUser: canManageTeamMutationForUserMock,
}));

vi.mock('../../../../../services/profile/profile-write-access.service.js', () => ({
  createProfileWriteAccessService: () => ({
    assertCanManageAthleteProfileTarget: assertCanManageAthleteProfileTargetMock,
  }),
  resolveAuthorizedTargetSportSelection: resolveAuthorizedTargetSportSelectionMock,
}));

vi.mock('../../../../../routes/profile/shared.js', () => ({
  invalidateProfileCaches: invalidateProfileCachesMock,
}));

vi.mock('../../../../../models/core/college.model.js', () => ({
  CollegeModel: {
    findOne: collegeFindOneMock,
  },
}));

import { WriteRecruitingActivityTool } from '../user/write-recruiting-activity.tool.js';

type StoredDoc = {
  id: string;
  data: Record<string, unknown>;
};

function createFirestoreMock(seed: Record<string, readonly StoredDoc[]>) {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  let idCounter = 0;

  for (const [collectionName, docs] of Object.entries(seed)) {
    collections.set(collectionName, new Map(docs.map((doc) => [doc.id, { ...doc.data }])));
  }

  const ensureCollection = (name: string): Map<string, Record<string, unknown>> => {
    let collection = collections.get(name);
    if (!collection) {
      collection = new Map();
      collections.set(name, collection);
    }
    return collection;
  };

  const runQuery = (
    name: string,
    filters: Array<{ field: string; op: string; value: unknown }>,
    orderByField?: string,
    orderByDirection: 'asc' | 'desc' = 'asc',
    limitCount?: number
  ) => {
    let docs = Array.from(ensureCollection(name).entries()).map(([id, data]) => ({ id, data }));

    for (const filter of filters) {
      docs = docs.filter((doc) => {
        const value = doc.data[filter.field];
        if (filter.op === '==') return value === filter.value;
        if (filter.op === '<') return String(value ?? '') < String(filter.value ?? '');
        if (filter.op === 'in' && Array.isArray(filter.value)) return filter.value.includes(value);
        return true;
      });
    }

    if (orderByField) {
      docs.sort((left, right) => {
        const leftValue = String(left.data[orderByField] ?? '');
        const rightValue = String(right.data[orderByField] ?? '');
        if (leftValue < rightValue) return orderByDirection === 'asc' ? -1 : 1;
        if (leftValue > rightValue) return orderByDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (limitCount !== undefined) {
      docs = docs.slice(0, limitCount);
    }

    return docs.map((doc) => ({
      id: doc.id,
      data: () => doc.data,
      ref: { id: doc.id, collection: name },
    }));
  };

  const buildQuery = (
    name: string,
    filters: Array<{ field: string; op: string; value: unknown }> = [],
    orderByField?: string,
    orderByDirection: 'asc' | 'desc' = 'asc',
    limitCount?: number
  ) => ({
    where(field: string, op: string, value: unknown) {
      return buildQuery(
        name,
        [...filters, { field, op, value }],
        orderByField,
        orderByDirection,
        limitCount
      );
    },
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
      return buildQuery(name, filters, field, direction, limitCount);
    },
    limit(count: number) {
      return buildQuery(name, filters, orderByField, orderByDirection, count);
    },
    select(..._fields: string[]) {
      return buildQuery(name, filters, orderByField, orderByDirection, limitCount);
    },
    async get() {
      const docs = runQuery(name, filters, orderByField, orderByDirection, limitCount);
      return { docs, empty: docs.length === 0 };
    },
  });

  const db = {
    collection(name: string) {
      const query = buildQuery(name);
      return {
        ...query,
        doc(id?: string) {
          const docId = id ?? `${name}-${++idCounter}`;
          return {
            id: docId,
            collection: name,
            async get() {
              const data = ensureCollection(name).get(docId);
              return {
                id: docId,
                exists: !!data,
                data: () => (data ? { ...data } : undefined),
              };
            },
          };
        },
      };
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        set(ref: { id: string; collection: string }, data: Record<string, unknown>) {
          ops.push(() => {
            ensureCollection(ref.collection).set(ref.id, { ...data });
          });
        },
        update(ref: { id: string; collection: string }, patch: Record<string, unknown>) {
          ops.push(() => {
            const collection = ensureCollection(ref.collection);
            const existing = collection.get(ref.id) ?? {};
            collection.set(ref.id, { ...existing, ...patch });
          });
        },
        async commit() {
          ops.forEach((op) => op());
        },
      };
    },
  };

  return {
    db,
    getCollection(name: string) {
      return Array.from(ensureCollection(name).entries()).map(([id, data]) => ({ id, data }));
    },
  };
}

describe('WriteRecruitingActivityTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['FIREBASE_STORAGE_BUCKET'] = 'nxt-1-v2.firebasestorage.app';
    canManageTeamMutationForUserMock.mockResolvedValue(true);
    assertCanManageAthleteProfileTargetMock.mockResolvedValue({
      isSelfWrite: false,
      targetUserData: { unicode: 'athlete-one' },
    });
    resolveAuthorizedTargetSportSelectionMock.mockReturnValue({
      teamId: 'team-1',
      organizationId: 'org-1',
    });
    collegeFindOneMock.mockImplementation(() => ({
      lean: () => ({
        exec: async () => null,
      }),
    }));
  });

  it('prefers an exact Ohio State logo match over broad Ohio text matches', async () => {
    assertCanManageAthleteProfileTargetMock.mockResolvedValue({
      isSelfWrite: true,
      targetUserData: { unicode: 'athlete-one' },
    });
    resolveAuthorizedTargetSportSelectionMock.mockReturnValue(null);
    collegeFindOneMock.mockImplementation((filter: Record<string, unknown>) => ({
      lean: () => ({
        exec: async () => {
          const textSearch = (filter['$text'] as { $search?: string } | undefined)?.$search;
          if (textSearch === '"ohio state"') {
            return { logoUrl: '104151' };
          }
          if (textSearch === 'ohio state') {
            return { logoUrl: '103893' };
          }
          return null;
        },
      }),
    }));

    const firestore = createFirestoreMock({
      Teams: [],
      Recruiting: [],
      RosterEntries: [],
    });

    const tool = new WriteRecruitingActivityTool(firestore.db as never);
    const result = await tool.execute(
      {
        userId: 'athlete-1',
        targetSport: 'football',
        source: 'x',
        activities: [
          {
            category: 'offer',
            collegeName: 'Ohio State',
            date: '2026-07-24T00:00:00.000Z',
          },
        ],
      },
      { userId: 'athlete-1' }
    );

    expect(result.success).toBe(true);

    const recruitingDocs = firestore.getCollection('Recruiting');
    expect(recruitingDocs[0]?.data).toMatchObject({
      collegeName: 'Ohio State',
      collegeLogoUrl:
        'https://storage.googleapis.com/nxt-1-v2.firebasestorage.app/Colleges/104151.png',
    });
  });

  it('creates team-linked recruiting records without requiring a userId', async () => {
    const firestore = createFirestoreMock({
      Teams: [
        {
          id: 'team-1',
          data: { teamCode: 'EASTDRAGONS', organizationId: 'org-1' },
        },
      ],
      Recruiting: [],
      RosterEntries: [],
    });

    const tool = new WriteRecruitingActivityTool(firestore.db as never);
    const result = await tool.execute(
      {
        teamId: 'team-1',
        targetSport: 'football',
        source: 'x',
        activities: [
          {
            category: 'offer',
            collegeName: 'Alabama',
            prospectDisplayName: 'Jay Carter',
            date: '2026-04-12T12:00:00.000Z',
          },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ written: 1, updated: 0, skipped: 0, teamId: 'team-1' });

    const recruitingDocs = firestore.getCollection('Recruiting');
    expect(recruitingDocs).toHaveLength(1);
    expect(recruitingDocs[0]?.data).toMatchObject({
      teamId: 'team-1',
      organizationId: 'org-1',
      ownerType: 'team',
      prospectDisplayName: 'Jay Carter',
      category: 'offer',
      sport: 'football',
    });
    expect(cacheMock.delByPrefix).toHaveBeenCalledWith('team:timeline:v1:EASTDRAGONS:');
  });

  it('merges later athlete linkage into an existing team recruiting record instead of duplicating it', async () => {
    const firestore = createFirestoreMock({
      Teams: [
        {
          id: 'team-1',
          data: { teamCode: 'EASTDRAGONS', organizationId: 'org-1' },
        },
      ],
      Recruiting: [
        {
          id: 'rec-1',
          data: {
            id: 'rec-1',
            teamId: 'team-1',
            organizationId: 'org-1',
            ownerType: 'team',
            category: 'offer',
            collegeName: 'Alabama',
            sport: 'football',
            prospectDisplayName: 'Jay Carter',
            date: '2026-04-12T12:00:00.000Z',
            createdAt: '2026-04-12T12:00:00.000Z',
            updatedAt: '2026-04-12T12:00:00.000Z',
          },
        },
      ],
      RosterEntries: [],
    });

    const tool = new WriteRecruitingActivityTool(firestore.db as never);
    const result = await tool.execute(
      {
        userId: 'athlete-1',
        teamId: 'team-1',
        targetSport: 'football',
        source: 'x',
        activities: [
          {
            category: 'offer',
            collegeName: 'Alabama',
            prospectDisplayName: 'Jay Carter',
            date: '2026-04-12T12:00:00.000Z',
          },
        ],
      },
      { userId: 'coach-1' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ written: 0, updated: 1, skipped: 0, userId: 'athlete-1' });

    const recruitingDocs = firestore.getCollection('Recruiting');
    expect(recruitingDocs).toHaveLength(1);
    expect(recruitingDocs[0]?.data).toMatchObject({
      id: 'rec-1',
      teamId: 'team-1',
      userId: 'athlete-1',
      prospectDisplayName: 'Jay Carter',
    });
    expect(invalidateProfileCachesMock).toHaveBeenCalledWith('athlete-1', 'athlete-one');
  });

  it('allows athletes to write their own recruiting activity for their authorized sport team', async () => {
    assertCanManageAthleteProfileTargetMock.mockResolvedValue({
      isSelfWrite: true,
      targetUserData: { unicode: 'athlete-one' },
    });
    resolveAuthorizedTargetSportSelectionMock.mockReturnValue({
      teamId: 'team-1',
      organizationId: 'org-1',
    });
    canManageTeamMutationForUserMock.mockResolvedValue(false);

    const firestore = createFirestoreMock({
      Teams: [
        {
          id: 'team-1',
          data: { teamCode: 'fishers-tigers', organizationId: 'org-1' },
        },
      ],
      Recruiting: [],
      RosterEntries: [],
    });

    const tool = new WriteRecruitingActivityTool(firestore.db as never);
    const result = await tool.execute(
      {
        userId: 'athlete-1',
        teamId: 'team-1',
        targetSport: 'basketball',
        source: 'x',
        activities: [
          {
            category: 'offer',
            collegeName: 'Holy Cross',
            prospectDisplayName: 'Cooper Zachary',
            date: '2026-05-23T03:37:59.000Z',
          },
        ],
      },
      { userId: 'athlete-1' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ written: 1, updated: 0, skipped: 0, userId: 'athlete-1' });

    const recruitingDocs = firestore.getCollection('Recruiting');
    expect(recruitingDocs).toHaveLength(1);
    expect(recruitingDocs[0]?.data).toMatchObject({
      userId: 'athlete-1',
      teamId: 'team-1',
      organizationId: 'org-1',
      ownerType: 'user',
      sport: 'basketball',
      category: 'offer',
    });
    expect(canManageTeamMutationForUserMock).not.toHaveBeenCalled();
  });
});
