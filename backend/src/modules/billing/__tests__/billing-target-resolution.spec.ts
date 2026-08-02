import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

type StoredDoc = Record<string, unknown>;

function createMockFirestore(seed?: Record<string, Record<string, StoredDoc>>) {
  const store = new Map<string, StoredDoc>();

  for (const [collectionName, docs] of Object.entries(seed ?? {})) {
    for (const [id, data] of Object.entries(docs ?? {})) {
      store.set(`${collectionName}/${id}`, { ...data });
    }
  }

  const matchesFilters = (
    data: StoredDoc,
    filters: Array<{ field: string; op: string; value: unknown }>
  ): boolean => {
    return filters.every(({ field, op, value }) => {
      if (op === '==') {
        return data[field] === value;
      }
      return false;
    });
  };

  const buildQuery = (
    collectionName: string,
    filters: Array<{ field: string; op: string; value: unknown }>
  ) => ({
    where: (field: string, op: string, value: unknown) =>
      buildQuery(collectionName, [...filters, { field, op, value }]),
    orderBy: (_field: string, _direction?: 'asc' | 'desc') => buildQuery(collectionName, filters),
    limit: (_count: number) => ({
      get: async () => {
        const docs = [...store.entries()]
          .filter(
            ([path, data]) => path.startsWith(`${collectionName}/`) && matchesFilters(data, filters)
          )
          .map(([path, data]) => ({
            id: path.split('/')[1] ?? '',
            exists: true,
            data: () => data,
          }));
        return { empty: docs.length === 0, docs: docs.slice(0, 1) };
      },
    }),
    get: async () => {
      const docs = [...store.entries()]
        .filter(
          ([path, data]) => path.startsWith(`${collectionName}/`) && matchesFilters(data, filters)
        )
        .map(([path, data]) => ({
          id: path.split('/')[1] ?? '',
          exists: true,
          data: () => data,
        }));
      return { empty: docs.length === 0, docs };
    },
  });

  const db = {
    collection: (collectionName: string) => ({
      doc: (id: string) => ({
        id,
        get: async () => ({
          exists: store.has(`${collectionName}/${id}`),
          id,
          data: () => store.get(`${collectionName}/${id}`),
        }),
        set: async (payload: StoredDoc, options?: { merge?: boolean }) => {
          const key = `${collectionName}/${id}`;
          const existing = options?.merge ? (store.get(key) ?? {}) : {};
          store.set(key, { ...existing, ...payload });
        },
        update: async (payload: StoredDoc) => {
          const key = `${collectionName}/${id}`;
          const existing = store.get(key) ?? {};
          store.set(key, { ...existing, ...payload });
        },
      }),
      where: (field: string, op: string, value: unknown) =>
        buildQuery(collectionName, [{ field, op, value }]),
      get: async () => {
        const docs = [...store.entries()]
          .filter(([path]) => path.startsWith(`${collectionName}/`))
          .map(([path, data]) => ({
            id: path.split('/')[1] ?? '',
            exists: true,
            data: () => data,
          }));
        return { empty: docs.length === 0, docs };
      },
    }),
  };

  return {
    db,
    getDoc: (collectionName: string, id: string) => store.get(`${collectionName}/${id}`),
  };
}

describe('resolveBillingTarget', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('promotes athletes with a provisional personal target into org billing when admins exist', async () => {
    const { getBillingState } = await import('../budget.service.js');
    const firestore = createMockFirestore({
      Users: {
        'user-1': {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user-1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Organizations: {
        'org-1': {
          ownerId: 'director-1',
          admins: [{ userId: 'director-1', role: 'director' }],
        },
      },
      Teams: {
        'team-1': {
          organizationId: 'org-1',
          adminIds: ['director-1'],
        },
      },
      RosterEntries: {
        'roster-1': {
          userId: 'user-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          status: 'active',
        },
      },
    });

    const result = await getBillingState(firestore.db as never, 'user-1');

    expect(result).not.toBeNull();
    expect(result?.billingEntity).toBe('organization');
    expect(result?.billingMode).toBe('organization');
    expect(result?.organizationId).toBe('org-1');
    expect(firestore.getDoc('Users', 'user-1')?.['activeBillingTarget']).toMatchObject({
      ownerId: 'org-1',
      ownerType: 'organization',
      organizationId: 'org-1',
      source: 'organization',
    });
  });

  it('keeps athletes on personal billing until their roster membership is active', async () => {
    const { getBillingState } = await import('../budget.service.js');
    const firestore = createMockFirestore({
      Users: {
        'user-1': {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user-1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Organizations: {
        'org-1': {
          ownerId: 'director-1',
          admins: [{ userId: 'director-1', role: 'director' }],
        },
      },
      Teams: {
        'team-1': {
          organizationId: 'org-1',
          adminIds: ['director-1'],
        },
      },
      RosterEntries: {
        'roster-1': {
          userId: 'user-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          status: 'pending',
        },
      },
    });

    const result = await getBillingState(firestore.db as never, 'user-1');

    expect(result).not.toBeNull();
    expect(result?.billingEntity).toBe('individual');
    expect(result?.billingMode).toBe('personal');
    expect(result?.organizationId).toBeUndefined();
    expect(firestore.getDoc('Users', 'user-1')?.['activeBillingTarget']).toMatchObject({
      ownerId: 'user-1',
      ownerType: 'individual',
    });
  });

  it('re-resolves a cached provisional personal result after roster activation', async () => {
    const { getBillingState } = await import('../budget.service.js');
    const firestore = createMockFirestore({
      Users: {
        'user-1': {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user-1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Organizations: {
        'org-1': {
          ownerId: 'director-1',
          admins: [{ userId: 'director-1', role: 'director' }],
        },
      },
      Teams: {
        'team-1': {
          organizationId: 'org-1',
          adminIds: ['director-1'],
        },
      },
      RosterEntries: {
        'roster-1': {
          userId: 'user-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          status: 'pending',
        },
      },
    });

    const beforeActivation = await getBillingState(firestore.db as never, 'user-1');
    expect(beforeActivation?.billingEntity).toBe('individual');

    await (firestore.db as never)
      .collection('RosterEntries')
      .doc('roster-1')
      .update({ status: 'active' });

    const afterActivation = await getBillingState(firestore.db as never, 'user-1');

    expect(afterActivation).not.toBeNull();
    expect(afterActivation?.billingEntity).toBe('organization');
    expect(afterActivation?.billingMode).toBe('organization');
    expect(afterActivation?.organizationId).toBe('org-1');
  });

  it('keeps athletes on personal billing when team org-budget access is disabled', async () => {
    const { getBillingState } = await import('../budget.service.js');
    const firestore = createMockFirestore({
      Users: {
        'user-1': {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user-1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Organizations: {
        'org-1': {
          ownerId: 'director-1',
          admins: [{ userId: 'director-1', role: 'director' }],
        },
      },
      Teams: {
        'team-1': {
          organizationId: 'org-1',
          adminIds: ['director-1'],
          organizationBudgetAccess: {
            enabledForAllAthletes: false,
            enabledAthleteUserIds: [],
          },
        },
      },
      RosterEntries: {
        'roster-1': {
          userId: 'user-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          status: 'active',
        },
      },
    });

    const result = await getBillingState(firestore.db as never, 'user-1');

    expect(result).not.toBeNull();
    expect(result?.billingEntity).toBe('individual');
    expect(result?.billingMode).toBe('personal');
    expect(result?.organizationId).toBeUndefined();
  });

  it('allows selected athletes to keep organization billing when bulk access is disabled', async () => {
    const { getBillingState } = await import('../budget.service.js');
    const firestore = createMockFirestore({
      Users: {
        'user-1': {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user-1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Organizations: {
        'org-1': {
          ownerId: 'director-1',
          admins: [{ userId: 'director-1', role: 'director' }],
        },
      },
      Teams: {
        'team-1': {
          organizationId: 'org-1',
          adminIds: ['director-1'],
          organizationBudgetAccess: {
            enabledForAllAthletes: false,
            enabledAthleteUserIds: ['user-1'],
          },
        },
      },
      RosterEntries: {
        'roster-1': {
          userId: 'user-1',
          teamId: 'team-1',
          organizationId: 'org-1',
          status: 'active',
        },
      },
    });

    const result = await getBillingState(firestore.db as never, 'user-1');

    expect(result).not.toBeNull();
    expect(result?.billingEntity).toBe('organization');
    expect(result?.billingMode).toBe('organization');
    expect(result?.organizationId).toBe('org-1');
  });

  it('falls back to explicit personal billing when a stored org target is stale', async () => {
    const { resolveBillingTarget } = await import('../budget.service.js');
    const firestore = createMockFirestore({
      Users: {
        'user-1': {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'org-1',
            ownerType: 'organization',
            organizationId: 'org-1',
            teamId: 'team-1',
            source: 'organization',
          },
        },
      },
      Organizations: {
        'org-1': {
          ownerId: 'director-1',
          admins: [{ userId: 'director-1', role: 'director' }],
        },
      },
      Wallets: {
        'individual:user-1': { ownerId: 'user-1', ownerType: 'individual', balanceCents: 5000 },
      },
      BillingPreferences: {
        'individual:user-1': {
          ownerId: 'user-1',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          budgetInterval: 'monthly',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'individual:user-1:2026-06': {
          ownerId: 'user-1',
          ownerType: 'individual',
          periodKey: '2026-06',
          periodStart: '2026-06-01T00:00:00.000Z',
          periodEnd: '2026-06-30T23:59:59.999Z',
          monthlyBudget: 10000,
          currentPeriodSpend: 0,
        },
      },
    });

    const result = await resolveBillingTarget(firestore.db as never, 'user-1');

    expect(result.type).toBe('individual');
    expect(result.context.billingMode).toBe('personal');
    expect(result.organizationId).toBeUndefined();
    expect(result.teamIds).toBeUndefined();
    expect(firestore.getDoc('Users', 'user-1')?.['activeBillingTarget']).toMatchObject({
      ownerId: 'user-1',
      ownerType: 'individual',
      source: 'personal',
      userSelected: true,
    });
    expect(
      (firestore.getDoc('Users', 'user-1')?.['activeBillingTarget'] as Record<string, unknown>)?.[
        'organizationId'
      ]
    ).toBeUndefined();
    expect(
      (firestore.getDoc('Users', 'user-1')?.['activeBillingTarget'] as Record<string, unknown>)?.[
        'teamId'
      ]
    ).toBeUndefined();
  });
});
