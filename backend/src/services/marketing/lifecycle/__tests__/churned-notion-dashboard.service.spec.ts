import { beforeEach, describe, expect, it, vi } from 'vitest';

const { paymentLogFindOneMock, notionQueryMock, notionUpdateMock } = vi.hoisted(() => ({
  paymentLogFindOneMock: vi.fn(),
  notionQueryMock: vi.fn(),
  notionUpdateMock: vi.fn(),
}));

vi.mock('../../../../models/billing/payment-log.model.js', () => ({
  PaymentLogModel: {
    findOne: paymentLogFindOneMock,
  },
}));

vi.mock('../../integrations/notion/notion-client.service.js', () => ({
  getNotionSignupDashboardConfig: vi.fn(() => ({ token: 'test-token', databaseId: 'db-1' })),
  getNotionSignupDashboardDisabledReason: vi.fn(() => null),
  queryNotionDatabaseByEmail: notionQueryMock,
  updateNotionSignupDashboardPage: notionUpdateMock,
}));

vi.mock('../../../../config/database.config.js', () => ({
  ensureMongoDBConnected: vi.fn(async () => undefined),
}));

import { runChurnedNotionDashboardSync } from '../churned-notion-dashboard.service.js';

type StoredDocument = Record<string, unknown>;

interface FakeSnapshot {
  readonly id: string;
  readonly exists: boolean;
  data(): StoredDocument | undefined;
}

interface FakeDocRef {
  readonly id: string;
  get(): Promise<FakeSnapshot>;
}

function createSnapshot(id: string, document: StoredDocument | undefined): FakeSnapshot {
  return {
    id,
    exists: document !== undefined,
    data: () => (document ? structuredClone(document) : undefined),
  };
}

function createFakeFirestore(params: {
  wallets: Record<string, StoredDocument>;
  organizations: Record<string, StoredDocument>;
  users: Record<string, StoredDocument>;
}) {
  const wallets = new Map(Object.entries(params.wallets));
  const organizations = new Map(Object.entries(params.organizations));
  const users = new Map(Object.entries(params.users));

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

  const createDocRef = (collection: Map<string, StoredDocument>, id: string): FakeDocRef => ({
    id,
    get: async () => createSnapshot(id, collection.get(id)),
  });

  return {
    db: {
      collection(name: string) {
        if (name === 'Wallets') {
          return createWalletQuery();
        }

        if (name === 'Organizations') {
          return {
            doc: (id: string) => createDocRef(organizations, id),
          };
        }

        if (name === 'Users') {
          return {
            doc: (id: string) => createDocRef(users, id),
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      },
    } as unknown as FirebaseFirestore.Firestore,
  };
}

function mockNoPaidHistory(): void {
  const exec = vi.fn().mockResolvedValue(null);
  const lean = vi.fn().mockReturnValue({ exec });
  const sort = vi.fn().mockReturnValue({ lean });
  paymentLogFindOneMock.mockReturnValue({ sort });
}

describe('churned notion dashboard lifecycle service', () => {
  beforeEach(() => {
    paymentLogFindOneMock.mockReset();
    notionQueryMock.mockReset();
    notionUpdateMock.mockReset();
    mockNoPaidHistory();
  });

  it('skips churn for zero-balance orgs without paid history even if trial credits were depleted', async () => {
    const now = new Date('2026-07-02T12:00:00.000Z');
    const trialDepletedAt = new Date('2026-05-20T12:00:00.000Z');
    const { db } = createFakeFirestore({
      wallets: {
        'wallet-org-1': {
          ownerType: 'organization',
          ownerId: 'org-1',
          balanceCents: 0,
          paymentProvider: 'stripe',
        },
      },
      organizations: {
        'org-1': {
          billingOwnerUid: 'user-1',
          billingEmail: 'coach@example.com',
        },
      },
      users: {
        'user-1': {
          email: 'coach@example.com',
          lifecycle: {
            usage: {
              trialCreditsFinished: {
                depletedAt: trialDepletedAt,
              },
            },
          },
        },
      },
    });

    const result = await runChurnedNotionDashboardSync({ db, now, limit: 10, graceDays: 30 });

    expect(result.processedCount).toBe(1);
    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.results).toEqual([
      {
        organizationId: 'org-1',
        userId: 'user-1',
        outcome: 'skipped',
        reason: 'no-paid-history',
      },
    ]);
    expect(paymentLogFindOneMock).toHaveBeenCalledTimes(1);
    expect(notionQueryMock).not.toHaveBeenCalled();
    expect(notionUpdateMock).not.toHaveBeenCalled();
  });
});
