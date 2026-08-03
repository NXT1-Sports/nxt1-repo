import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

const mockFindPayments = vi.fn();
const mockUpsertB2CUsersEntry = vi.fn();

vi.mock('../../../../models/billing/payment-log.model.js', () => ({
  PaymentLogModel: {
    find: mockFindPayments,
  },
}));

vi.mock('../../integrations/notion/b2c-users-entry.service.js', () => ({
  upsertB2CUsersEntry: mockUpsertB2CUsersEntry,
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

function createDbWithUser(user: Record<string, unknown>) {
  const getMock = vi.fn().mockResolvedValue({
    exists: true,
    data: () => user,
  });
  const setMock = vi.fn().mockResolvedValue(undefined);
  const docMock = vi.fn().mockReturnValue({
    get: getMock,
    set: setMock,
  });
  const collectionMock = vi.fn().mockReturnValue({
    doc: docMock,
  });

  return {
    db: {
      collection: collectionMock,
    } as unknown as Firestore,
    setMock,
  };
}

describe('b2c-users.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindPayments.mockReturnValue(createPaymentQueryResult([]));
    mockUpsertB2CUsersEntry.mockResolvedValue({
      status: 'created',
      pageId: 'page_b2c_1',
      pageUrl: 'https://notion.so/page_b2c_1',
    });
  });

  it('creates Account Started for a non-athlete user', async () => {
    const { db, setMock } = createDbWithUser({
      role: 'coach',
      email: 'coach@example.com',
      firstName: 'Casey',
      lastName: 'Jones',
      lifecycle: {},
    });

    const { recordB2CUsersAccountStartedEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersAccountStartedEntry({
      db,
      userId: 'user_coach_1',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'created',
      pageId: 'page_b2c_1',
      pageUrl: 'https://notion.so/page_b2c_1',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_coach_1',
        email: 'coach@example.com',
        firstName: 'Casey',
        lastName: 'Jones',
        stage: 'Account Started',
      })
    );
    expect(setMock).toHaveBeenCalled();
  });

  it('promotes to Onboarding Completed without changing the original Account Started marker', async () => {
    const originalCreatedAt = new Date('2026-07-01T00:00:00.000Z');
    const { db, setMock } = createDbWithUser({
      role: 'coach',
      email: 'coach@example.com',
      firstName: 'Casey',
      lastName: 'Jones',
      createdAt: '2026-07-01T00:00:00.000Z',
      lifecycle: {
        b2cUsers: {
          accountStarted: {
            status: 'created',
            environment: 'production',
            createdAt: '2026-07-01T00:00:00.000Z',
            pageId: 'page_b2c_existing',
            pageUrl: 'https://notion.so/page_b2c_existing',
          },
        },
      },
    });
    mockUpsertB2CUsersEntry.mockResolvedValueOnce({
      status: 'existing',
      pageId: 'page_b2c_existing',
      pageUrl: 'https://notion.so/page_b2c_existing',
    });

    const { reupsertB2CUsersAccountStartedEntry } = await import('../b2c-users.service.js');

    const result = await reupsertB2CUsersAccountStartedEntry({
      db,
      userId: 'user_coach_1',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page_b2c_existing',
      pageUrl: 'https://notion.so/page_b2c_existing',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_coach_1',
        pageId: 'page_b2c_existing',
        stage: 'Onboarding Completed',
      })
    );
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          b2cUsers: {
            accountStarted: expect.objectContaining({
              status: 'created',
              createdAt: originalCreatedAt,
              pageId: 'page_b2c_existing',
              pageUrl: 'https://notion.so/page_b2c_existing',
            }),
          },
        },
      }),
      { merge: true }
    );
  });

  it('creates Organization Mode for a non-athlete organization-billed user', async () => {
    const { db } = createDbWithUser({
      role: 'director',
      email: 'director@example.com',
      firstName: 'Dana',
      lastName: 'Reed',
      lifecycle: {},
    });

    const { recordB2CUsersOrganizationModeEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersOrganizationModeEntry({
      db,
      userId: 'user_director_1',
      organizationId: 'org_123',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'created',
      pageId: 'page_b2c_1',
      pageUrl: 'https://notion.so/page_b2c_1',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_director_1',
        email: 'director@example.com',
        stage: 'Organization Mode',
        organizationId: 'org_123',
      })
    );
  });

  it('deactivates Organization Mode when personal usage resumes and creates Usage Started', async () => {
    const { db, setMock } = createDbWithUser({
      role: 'coach',
      email: 'coach@example.com',
      firstName: 'Casey',
      lastName: 'Jones',
      lifecycle: {
        b2cUsers: {
          organizationMode: {
            status: 'created',
            environment: 'production',
            createdAt: '2026-07-01T00:00:00.000Z',
            pageId: 'page_org_mode',
            pageUrl: 'https://notion.so/page_org_mode',
            organizationId: 'org_123',
          },
        },
      },
    });

    const { recordB2CUsersUsageStartedEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersUsageStartedEntry({
      db,
      userId: 'user_coach_1',
      operationId: 'op_personal_1',
      feature: 'agent_x',
      chargeAmountCents: 199,
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'created',
      pageId: 'page_b2c_1',
      pageUrl: 'https://notion.so/page_b2c_1',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_coach_1',
        pageId: 'page_org_mode',
        stage: 'Usage Started',
      })
    );
    expect(setMock.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            lifecycle: {
              b2cUsers: {
                organizationMode: expect.objectContaining({
                  status: 'inactive',
                  organizationId: 'org_123',
                }),
              },
            },
          }),
          { merge: true },
        ],
        [
          expect.objectContaining({
            lifecycle: {
              b2cUsers: {
                usageStarted: expect.objectContaining({
                  status: 'created',
                  operationId: 'op_personal_1',
                  feature: 'agent_x',
                  amountCents: 199,
                }),
              },
            },
          }),
          { merge: true },
        ],
      ])
    );
  });

  it('reconciles Usage Started when the lifecycle state already exists', async () => {
    const originalCreatedAt = new Date('2026-07-02T00:00:00.000Z');
    const { db, setMock } = createDbWithUser({
      role: 'coach',
      email: 'coach@example.com',
      firstName: 'Casey',
      lastName: 'Jones',
      lifecycle: {
        b2cUsers: {
          usageStarted: {
            status: 'created',
            environment: 'production',
            createdAt: '2026-07-02T00:00:00.000Z',
            pageId: 'page_usage_started',
            pageUrl: 'https://notion.so/page_usage_started',
            operationId: 'op_original',
            feature: 'agent_x',
            amountCents: 199,
          },
        },
      },
    });
    mockUpsertB2CUsersEntry.mockResolvedValueOnce({
      status: 'existing',
      pageId: 'page_usage_started',
      pageUrl: 'https://notion.so/page_usage_started',
    });

    const { recordB2CUsersUsageStartedEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersUsageStartedEntry({
      db,
      userId: 'user_coach_1',
      operationId: 'op_retry',
      feature: 'agent_x',
      chargeAmountCents: 249,
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page_usage_started',
      pageUrl: 'https://notion.so/page_usage_started',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_coach_1',
        pageId: 'page_usage_started',
        stage: 'Usage Started',
      })
    );
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          b2cUsers: {
            usageStarted: expect.objectContaining({
              status: 'created',
              createdAt: originalCreatedAt,
              pageId: 'page_usage_started',
              pageUrl: 'https://notion.so/page_usage_started',
              operationId: 'op_original',
              amountCents: 199,
            }),
          },
        },
      }),
      { merge: true }
    );
  });

  it('does not downgrade Usage Started when completed signup re-upsert runs late', async () => {
    const { db } = createDbWithUser({
      role: 'coach',
      email: 'coach@example.com',
      firstName: 'Casey',
      lastName: 'Jones',
      lifecycle: {
        b2cUsers: {
          accountStarted: {
            status: 'created',
            environment: 'production',
            createdAt: '2026-07-01T00:00:00.000Z',
            pageId: 'page_b2c_existing',
          },
          usageStarted: {
            status: 'created',
            environment: 'production',
            createdAt: '2026-07-02T00:00:00.000Z',
            pageId: 'page_usage_started',
            operationId: 'op_usage',
            feature: 'agent_x',
            amountCents: 199,
          },
        },
      },
    });
    mockUpsertB2CUsersEntry.mockResolvedValueOnce({
      status: 'existing',
      pageId: 'page_usage_started',
      pageUrl: 'https://notion.so/page_usage_started',
    });

    const { reupsertB2CUsersAccountStartedEntry } = await import('../b2c-users.service.js');

    const result = await reupsertB2CUsersAccountStartedEntry({
      db,
      userId: 'user_coach_1',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page_usage_started',
      pageUrl: 'https://notion.so/page_usage_started',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_coach_1',
        pageId: 'page_usage_started',
        stage: 'Usage Started',
      })
    );
  });

  it('deactivates Organization Mode when a personal purchase occurs and creates Closed Won', async () => {
    const { db, setMock } = createDbWithUser({
      role: 'coach',
      email: 'coach@example.com',
      firstName: 'Casey',
      lastName: 'Jones',
      lifecycle: {
        b2cUsers: {
          organizationMode: {
            status: 'created',
            environment: 'production',
            createdAt: '2026-07-01T00:00:00.000Z',
            pageId: 'page_org_mode',
            pageUrl: 'https://notion.so/page_org_mode',
            organizationId: 'org_123',
          },
        },
      },
    });

    const { recordB2CUsersClosedWonEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersClosedWonEntry({
      db,
      userId: 'user_coach_1',
      amountCents: 999,
      source: 'stripe_checkout',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'created',
      pageId: 'page_b2c_1',
      pageUrl: 'https://notion.so/page_b2c_1',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_coach_1',
        stage: 'Closed Won',
      })
    );
    expect(setMock.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            lifecycle: {
              b2cUsers: {
                organizationMode: expect.objectContaining({
                  status: 'inactive',
                  organizationId: 'org_123',
                }),
              },
            },
          }),
          { merge: true },
        ],
        [
          expect.objectContaining({
            lifecycle: {
              b2cUsers: {
                closedWon: expect.objectContaining({
                  status: 'created',
                  amountCents: 999,
                  source: 'stripe_checkout',
                }),
              },
            },
          }),
          { merge: true },
        ],
      ])
    );
  });

  it('reconciles Organization Mode when the lifecycle state already exists', async () => {
    const originalCreatedAt = new Date('2026-07-03T00:00:00.000Z');
    const { db, setMock } = createDbWithUser({
      role: 'director',
      email: 'director@example.com',
      firstName: 'Dana',
      lastName: 'Reed',
      lifecycle: {
        b2cUsers: {
          organizationMode: {
            status: 'created',
            environment: 'production',
            createdAt: '2026-07-03T00:00:00.000Z',
            pageId: 'page_org_mode_existing',
            pageUrl: 'https://notion.so/page_org_mode_existing',
            organizationId: 'org_123',
          },
        },
      },
    });
    mockUpsertB2CUsersEntry.mockResolvedValueOnce({
      status: 'existing',
      pageId: 'page_org_mode_existing',
      pageUrl: 'https://notion.so/page_org_mode_existing',
    });

    const { recordB2CUsersOrganizationModeEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersOrganizationModeEntry({
      db,
      userId: 'user_director_1',
      organizationId: 'org_123',
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'existing',
      pageId: 'page_org_mode_existing',
      pageUrl: 'https://notion.so/page_org_mode_existing',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_director_1',
        pageId: 'page_org_mode_existing',
        stage: 'Organization Mode',
        organizationId: 'org_123',
      })
    );
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          b2cUsers: {
            organizationMode: expect.objectContaining({
              status: 'created',
              createdAt: originalCreatedAt,
              pageId: 'page_org_mode_existing',
              pageUrl: 'https://notion.so/page_org_mode_existing',
              organizationId: 'org_123',
            }),
          },
        },
      }),
      { merge: true }
    );
  });
});
