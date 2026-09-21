import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  paymentLogFindMock,
  notionQueryMock,
  notionUpdateMock,
  assertNotionPageStatusMock,
  sendB2BClosedWonAdminEmailMock,
  sendB2BClosedWonStaffEmailMock,
  sendB2BClosedWonAthleteBroadcastEmailMock,
} = vi.hoisted(() => ({
  paymentLogFindMock: vi.fn(),
  notionQueryMock: vi.fn(),
  notionUpdateMock: vi.fn(),
  assertNotionPageStatusMock: vi.fn(),
  sendB2BClosedWonAdminEmailMock: vi.fn(),
  sendB2BClosedWonStaffEmailMock: vi.fn(),
  sendB2BClosedWonAthleteBroadcastEmailMock: vi.fn(),
}));

vi.mock('../../../../models/billing/payment-log.model.js', () => ({
  PaymentLogModel: {
    find: paymentLogFindMock,
  },
}));

vi.mock('../../integrations/notion/notion-client.service.js', () => ({
  getNotionSignupDashboardConfig: vi.fn(() => ({ token: 'test-token', databaseId: 'db-1' })),
  getNotionSignupDashboardDisabledReason: vi.fn(() => null),
  queryNotionDatabaseByEmail: notionQueryMock,
  queryNotionDatabase: vi.fn(async () => null),
  updateNotionSignupDashboardPage: notionUpdateMock,
  assertNotionPageStatus: assertNotionPageStatusMock,
}));

vi.mock('../../../../config/database.config.js', () => ({
  ensureMongoDBConnected: vi.fn(async () => undefined),
}));

vi.mock('../../email/campaigns/closed-won/closed-won-email.service.js', () => ({
  sendB2BClosedWonAdminEmail: sendB2BClosedWonAdminEmailMock,
  sendB2BClosedWonStaffEmail: sendB2BClosedWonStaffEmailMock,
  sendB2BClosedWonAthleteBroadcastEmail: sendB2BClosedWonAthleteBroadcastEmailMock,
}));

import { recordClosedWonNotionDashboardEntry } from '../closed-won-notion-dashboard.service.js';

type StoredDocument = Record<string, unknown>;

function createFakeFirestore(params: {
  organizations: Record<string, StoredDocument>;
  users: Record<string, StoredDocument>;
}) {
  const organizations = new Map(Object.entries(params.organizations));
  const users = new Map(Object.entries(params.users));

  const createDocRef = (collection: Map<string, StoredDocument>, id: string) => ({
    id,
    get: async () => ({
      id,
      exists: collection.has(id),
      data: () => collection.get(id),
      ref: createDocRef(collection, id),
    }),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      const existing = collection.get(id) ?? {};
      const merged = options?.merge ? { ...existing, ...data } : data;
      // Handle nested lifecycle merging if present
      if (options?.merge && data['lifecycle'] && existing['lifecycle']) {
        merged['lifecycle'] = {
          ...(existing['lifecycle'] as Record<string, unknown>),
          ...(data['lifecycle'] as Record<string, unknown>),
          sales: {
            ...((existing['lifecycle'] as Record<string, unknown>)?.['sales'] as Record<
              string,
              unknown
            >),
            ...((data['lifecycle'] as Record<string, unknown>)?.['sales'] as Record<
              string,
              unknown
            >),
            closedWon: {
              ...((
                (existing['lifecycle'] as Record<string, unknown>)?.['sales'] as Record<
                  string,
                  unknown
                >
              )?.['closedWon'] as Record<string, unknown>),
              ...((
                (data['lifecycle'] as Record<string, unknown>)?.['sales'] as Record<string, unknown>
              )?.['closedWon'] as Record<string, unknown>),
            },
          },
        };
      }
      collection.set(id, merged);
    },
  });

  return {
    organizations,
    users,
    db: {
      collection(name: string) {
        if (name === 'Organizations') {
          return {
            doc: (id: string) => createDocRef(organizations, id),
          };
        }
        if (name === 'Users') {
          return {
            doc: (id: string) => createDocRef(users, id),
            where(field: string, _op: string, value: unknown) {
              return {
                get: async () => {
                  const docs = Array.from(users.entries())
                    .filter(([, doc]) => doc[field] === value)
                    .map(([id, doc]) => ({
                      id,
                      data: () => doc,
                      ref: createDocRef(users, id),
                    }));
                  return { docs, empty: docs.length === 0, size: docs.length };
                },
              };
            },
          };
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    },
  };
}

describe('closed-won-notion-dashboard.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentLogFindMock.mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: async () => [{ amountPaid: 2500 }],
        }),
      }),
    });
    sendB2BClosedWonAdminEmailMock.mockResolvedValue({ status: 'sent' });
    sendB2BClosedWonStaffEmailMock.mockResolvedValue({ status: 'sent' });
    sendB2BClosedWonAthleteBroadcastEmailMock.mockResolvedValue({ status: 'sent' });
    notionUpdateMock.mockResolvedValue({ id: 'page-123', url: 'https://notion.so/page-123' });
    assertNotionPageStatusMock.mockResolvedValue(undefined);
  });

  it('sends B2B Admin welcome email and records adminEmailSentAt on first purchase', async () => {
    const fake = createFakeFirestore({
      organizations: {
        org_1: {
          name: 'NXT1 Seed Organization',
          billingOwnerUid: 'admin_1',
          billingEmail: 'admin@nxt1sports.com',
        },
      },
      users: {
        admin_1: {
          email: 'admin@nxt1sports.com',
          firstName: 'John',
          role: 'director',
          organizationId: 'org_1',
        },
      },
    });

    notionQueryMock.mockResolvedValueOnce({ id: 'lead-page-1' });

    const result = await recordClosedWonNotionDashboardEntry({
      db: fake.db as never,
      organizationId: 'org_1',
      amountCents: 250000,
      source: 'stripe_checkout',
    });

    expect(result).toEqual({
      status: 'created',
      pageId: 'page-123',
      pageUrl: 'https://notion.so/page-123',
    });
    expect(sendB2BClosedWonAdminEmailMock).toHaveBeenCalledTimes(1);
    expect(sendB2BClosedWonAdminEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@nxt1sports.com',
        organizationName: 'NXT1 Seed Organization',
      })
    );

    const updatedUser = fake.users.get('admin_1');
    const closedWonState = (updatedUser?.['lifecycle'] as Record<string, unknown>)?.['sales']?.[
      'closedWon'
    ] as Record<string, unknown>;
    expect(closedWonState?.['status']).toBe('created');
    expect(closedWonState?.['adminEmailSentAt']).toBeInstanceOf(Date);
  });

  it('never resends B2B Admin email if adminEmailSentAt is already set', async () => {
    const fake = createFakeFirestore({
      organizations: {
        org_1: {
          name: 'NXT1 Seed Organization',
          billingOwnerUid: 'admin_1',
          billingEmail: 'admin@nxt1sports.com',
        },
      },
      users: {
        admin_1: {
          email: 'admin@nxt1sports.com',
          firstName: 'John',
          role: 'director',
          organizationId: 'org_1',
          lifecycle: {
            sales: {
              closedWon: {
                status: 'skipped',
                adminEmailSentAt: new Date('2026-09-20T10:00:00Z'),
              },
            },
          },
        },
      },
    });

    const result = await recordClosedWonNotionDashboardEntry({
      db: fake.db as never,
      organizationId: 'org_1',
      amountCents: 250000,
      source: 'stripe_checkout',
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'already-created',
    });
    expect(sendB2BClosedWonAdminEmailMock).not.toHaveBeenCalled();
  });

  it('marks status as skipped (not failed) and preserves email marker when no lead row exists in Notion', async () => {
    const fake = createFakeFirestore({
      organizations: {
        org_seed: {
          name: 'NXT1 Seed Organization',
          billingOwnerUid: 'admin_seed',
          billingEmail: 'seed.director.01+nxt1@nxt1sports.com',
        },
      },
      users: {
        admin_seed: {
          email: 'seed.director.01+nxt1@nxt1sports.com',
          firstName: 'Seed Coach',
          role: 'director',
          organizationId: 'org_seed',
        },
      },
    });

    notionQueryMock.mockResolvedValue(null);

    const result = await recordClosedWonNotionDashboardEntry({
      db: fake.db as never,
      organizationId: 'org_seed',
      amountCents: 250000,
      source: 'stripe_checkout',
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'missing-existing-row',
    });
    // First time it sends the email:
    expect(sendB2BClosedWonAdminEmailMock).toHaveBeenCalledTimes(1);

    // And sets status to skipped (not failed!) with adminEmailSentAt set
    const updatedUser = fake.users.get('admin_seed');
    const closedWonState = (updatedUser?.['lifecycle'] as Record<string, unknown>)?.['sales']?.[
      'closedWon'
    ] as Record<string, unknown>;
    expect(closedWonState?.['status']).toBe('skipped');
    expect(closedWonState?.['adminEmailSentAt']).toBeInstanceOf(Date);

    // When called a second time (or retried by outbox):
    const secondResult = await recordClosedWonNotionDashboardEntry({
      db: fake.db as never,
      organizationId: 'org_seed',
      amountCents: 250000,
      source: 'stripe_checkout',
    });

    expect(secondResult).toEqual({
      status: 'skipped',
      reason: 'already-created',
    });
    // Email was NOT sent a second time:
    expect(sendB2BClosedWonAdminEmailMock).toHaveBeenCalledTimes(1);
  });
});
