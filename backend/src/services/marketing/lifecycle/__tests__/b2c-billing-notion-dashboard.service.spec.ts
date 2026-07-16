import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

const mockPaymentFind = vi.fn();
const mockPaymentFindOne = vi.fn();
const mockUpsertB2CUsersEntry = vi.fn();

vi.mock('../../../../models/billing/payment-log.model.js', () => ({
  PaymentLogModel: {
    find: mockPaymentFind,
    findOne: mockPaymentFindOne,
  },
}));

vi.mock('../../integrations/notion/b2c-users-entry.service.js', () => ({
  upsertB2CUsersEntry: mockUpsertB2CUsersEntry,
}));

vi.mock('../../../../config/database.config.js', () => ({
  ensureMongoDBConnected: vi.fn().mockResolvedValue(undefined),
}));

function createPaymentQueryResult(
  rows: Array<{ amountPaid?: number; amountRefunded?: number; createdAt?: Date }>
) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function createFindOneResult(document: { createdAt?: Date } | null) {
  return {
    sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(document),
      }),
    }),
  };
}

function createSnapshot(id: string, document: Record<string, unknown> | undefined) {
  return {
    id,
    exists: document !== undefined,
    data: () => (document ? structuredClone(document) : undefined),
  };
}

function createFakeFirestore(params: {
  wallets: Record<string, Record<string, unknown>>;
  users: Record<string, Record<string, unknown>>;
}) {
  const wallets = new Map(Object.entries(params.wallets));
  const users = new Map(Object.entries(params.users));
  const setMock = vi.fn().mockResolvedValue(undefined);

  const createWalletQuery = () => {
    let ownerTypeFilter: string | undefined;
    let limitCount = Number.POSITIVE_INFINITY;

    return {
      where(path: string, _operator: string, value: unknown) {
        if (path === 'ownerType' && typeof value === 'string') {
          ownerTypeFilter = value;
        }
        return this;
      },
      limit(value: number) {
        limitCount = value;
        return this;
      },
      async get() {
        const docs = [...wallets.entries()]
          .filter(([, doc]) => {
            if (!ownerTypeFilter) return true;
            return doc['ownerType'] === ownerTypeFilter;
          })
          .slice(0, limitCount)
          .map(([id, doc]) => createSnapshot(id, doc));

        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  };

  return {
    db: {
      collection(name: string) {
        if (name === 'Wallets') {
          return createWalletQuery();
        }

        if (name === 'Users') {
          return {
            doc: (id: string) => ({
              get: async () => createSnapshot(id, users.get(id)),
              set: setMock,
            }),
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      },
    } as unknown as Firestore,
    setMock,
  };
}

describe('b2c billing notion dashboard lifecycle service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaymentFind.mockReturnValue(createPaymentQueryResult([]));
    mockPaymentFindOne.mockReturnValue(createFindOneResult(null));
    mockUpsertB2CUsersEntry.mockResolvedValue({
      status: 'created',
      pageId: 'page_b2c_1',
      pageUrl: 'https://notion.so/page_b2c_1',
    });
  });

  it('promotes eligible personal users to Closed Lost', async () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    const { db, setMock } = createFakeFirestore({
      wallets: {
        'user-1': {
          ownerType: 'individual',
          ownerId: 'user-1',
          balanceCents: 0,
          paymentProvider: 'stripe',
        },
      },
      users: {
        'user-1': {
          email: 'athlete@example.com',
          firstName: 'Avery',
          lastName: 'Stone',
          lifecycle: {
            b2cUsers: {
              accountStarted: {
                status: 'created',
                environment: 'production',
                createdAt: '2026-04-01T00:00:00.000Z',
              },
            },
          },
        },
      },
    });

    const { runB2CClosedLostNotionDashboardSync } =
      await import('../b2c-billing-notion-dashboard.service.js');

    const result = await runB2CClosedLostNotionDashboardSync({
      db,
      environment: 'production',
      now,
      limit: 10,
      decisionWindowDays: 45,
      inactivityDays: 21,
    });

    expect(result.processedCount).toBe(1);
    expect(result.createdCount).toBe(1);
    expect(result.existingCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'athlete@example.com',
        stage: 'Closed Lost',
        lastActiveAt: new Date('2026-04-01T00:00:00.000Z'),
      })
    );
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          b2cUsers: {
            closedLost: expect.objectContaining({
              status: 'created',
              balanceCents: 0,
              reasonCode: 'no-paid-conversion-after-personal-onboarding',
            }),
          },
        },
      }),
      { merge: true }
    );
  });

  it('promotes eligible personal users to Churned', async () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    mockPaymentFindOne.mockReturnValue(
      createFindOneResult({ createdAt: new Date('2026-06-01T00:00:00.000Z') })
    );

    const { db, setMock } = createFakeFirestore({
      wallets: {
        'user-2': {
          ownerType: 'individual',
          ownerId: 'user-2',
          balanceCents: 0,
          paymentProvider: 'iap',
        },
      },
      users: {
        'user-2': {
          email: 'coach@example.com',
          firstName: 'Casey',
          lastName: 'Jones',
          lifecycle: {
            b2cUsers: {
              closedWon: {
                status: 'created',
                environment: 'production',
                createdAt: '2026-06-01T00:00:00.000Z',
              },
            },
          },
        },
      },
    });

    const { runB2CChurnedNotionDashboardSync } =
      await import('../b2c-billing-notion-dashboard.service.js');

    const result = await runB2CChurnedNotionDashboardSync({
      db,
      environment: 'production',
      now,
      limit: 10,
      graceDays: 30,
    });

    expect(result.processedCount).toBe(1);
    expect(result.createdCount).toBe(1);
    expect(result.existingCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        email: 'coach@example.com',
        stage: 'Churned',
        lastActiveAt: new Date('2026-06-01T00:00:00.000Z'),
      })
    );
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          b2cUsers: {
            churned: expect.objectContaining({
              status: 'created',
              balanceCents: 0,
            }),
          },
        },
      }),
      { merge: true }
    );
  });

  it('reports existing B2C pages as successful deduplicated outcomes', async () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    mockUpsertB2CUsersEntry.mockResolvedValue({
      status: 'existing',
      pageId: 'page_b2c_existing',
      pageUrl: 'https://notion.so/page_b2c_existing',
    });

    const { db, setMock } = createFakeFirestore({
      wallets: {
        'user-3': {
          ownerType: 'individual',
          ownerId: 'user-3',
          balanceCents: 0,
          paymentProvider: 'stripe',
        },
      },
      users: {
        'user-3': {
          email: 'existing@example.com',
          firstName: 'Jordan',
          lastName: 'Lee',
          lifecycle: {
            b2cUsers: {
              accountStarted: {
                status: 'created',
                environment: 'production',
                createdAt: '2026-04-01T00:00:00.000Z',
              },
            },
          },
        },
      },
    });

    const { runB2CClosedLostNotionDashboardSync } =
      await import('../b2c-billing-notion-dashboard.service.js');

    const result = await runB2CClosedLostNotionDashboardSync({
      db,
      environment: 'production',
      now,
      limit: 10,
      decisionWindowDays: 45,
      inactivityDays: 21,
    });

    expect(result.processedCount).toBe(1);
    expect(result.createdCount).toBe(0);
    expect(result.existingCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.results).toEqual([
      {
        userId: 'user-3',
        outcome: 'existing',
        reason: undefined,
      },
    ]);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          b2cUsers: {
            closedLost: expect.objectContaining({
              status: 'created',
              pageId: 'page_b2c_existing',
              pageUrl: 'https://notion.so/page_b2c_existing',
            }),
          },
        },
      }),
      { merge: true }
    );
  });
});
