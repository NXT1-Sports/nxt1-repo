import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

const mockFindPayments = vi.fn();
const mockUpsertB2CUsersEntry = vi.fn();
const mockRefreshB2CUsersActivity = vi.fn();

vi.mock('../../../../models/billing/payment-log.model.js', () => ({
  PaymentLogModel: {
    find: mockFindPayments,
  },
}));

vi.mock('../../integrations/notion/b2c-users-entry.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../integrations/notion/b2c-users-entry.service.js')>();
  return {
    ...actual,
    upsertB2CUsersEntry: mockUpsertB2CUsersEntry,
    refreshB2CUsersActivity: mockRefreshB2CUsersActivity,
  };
});

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

  it('promotes personal depletion to Trial Credits Finished and deactivates Organization Mode', async () => {
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
            operationId: 'op_usage_original',
            feature: 'agent_x',
            amountCents: 199,
          },
          organizationMode: {
            status: 'created',
            environment: 'production',
            createdAt: '2026-07-03T00:00:00.000Z',
            pageId: 'page_usage_started',
            pageUrl: 'https://notion.so/page_usage_started',
            organizationId: 'org_123',
          },
        },
      },
    });

    const { recordB2CUsersTrialCreditsFinishedEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersTrialCreditsFinishedEntry({
      db,
      userId: 'user_coach_1',
      operationId: 'op_trial_finished',
      feature: 'agent_x',
      baselineCents: 95,
      newBalanceCents: 0,
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
        pageId: 'page_usage_started',
        stage: 'Trial Credits Finished',
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
                trialCreditsFinished: expect.objectContaining({
                  status: 'created',
                  operationId: 'op_trial_finished',
                  feature: 'agent_x',
                  balanceCents: 0,
                }),
              },
            },
          }),
          { merge: true },
        ],
      ])
    );
  });

  it('promotes Expansion / Pricing users to Usage Started when usage criteria is met', async () => {
    const { db, setMock } = createDbWithUser({
      role: 'coach',
      email: 'coach@example.com',
      firstName: 'Casey',
      lastName: 'Jones',
      lifecycle: {
        b2cUsers: {
          accountStarted: {
            status: 'created',
            pageId: 'page_b2c_existing',
            pageUrl: 'https://notion.so/page_b2c_existing',
          },
          expansionPricing: {
            status: 'created',
            pageId: 'page_b2c_existing',
            pageUrl: 'https://notion.so/page_b2c_existing',
          },
        },
      },
    });

    const { recordB2CUsersUsageStartedEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersUsageStartedEntry({
      db,
      userId: 'user_coach_expansion_1',
      operationId: 'op_usage_after_expansion',
      feature: 'agent_x',
      chargeAmountCents: 299,
      environment: 'production',
    });

    expect(result).toEqual({
      status: 'created',
      pageId: 'page_b2c_1',
      pageUrl: 'https://notion.so/page_b2c_1',
    });
    expect(mockUpsertB2CUsersEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_coach_expansion_1',
        pageId: 'page_b2c_existing',
        stage: 'Usage Started',
      })
    );
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          b2cUsers: {
            usageStarted: expect.objectContaining({
              status: 'created',
              operationId: 'op_usage_after_expansion',
              feature: 'agent_x',
              amountCents: 299,
            }),
          },
        },
      }),
      { merge: true }
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

  it('skips Organization Mode when organization id is missing', async () => {
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
      userId: 'user_director_missing_org',
      organizationId: '   ',
      environment: 'production',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'missing-required-field' });
    expect(mockUpsertB2CUsersEntry).not.toHaveBeenCalled();
  });

  it('skips Usage Started when operation identifiers are missing', async () => {
    const { db } = createDbWithUser({
      role: 'coach',
      email: 'coach@example.com',
      firstName: 'Casey',
      lastName: 'Jones',
      lifecycle: {},
    });

    const { recordB2CUsersUsageStartedEntry } = await import('../b2c-users.service.js');

    const result = await recordB2CUsersUsageStartedEntry({
      db,
      userId: 'user_missing_operation_context',
      operationId: '   ',
      feature: '',
      chargeAmountCents: 199,
      environment: 'production',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'missing-required-field' });
    expect(mockUpsertB2CUsersEntry).not.toHaveBeenCalled();
  });
});

function createActivityRefreshDb(input: {
  readonly wallets: ReadonlyArray<{ id: string; ownerId: string }>;
  readonly users: Record<string, Record<string, unknown> | undefined>;
}) {
  const walletDocs = input.wallets.map((wallet) => ({
    id: wallet.id,
    data: () => ({ ownerId: wallet.ownerId, ownerType: 'individual' }),
  }));

  const userSets: Record<string, unknown> = {};
  const usersDocMock = vi.fn((userId: string) => ({
    get: vi.fn().mockResolvedValue({
      exists: Boolean(input.users[userId]),
      data: () => input.users[userId],
    }),
    set: vi.fn((patch: unknown) => {
      userSets[userId] = patch;
      return Promise.resolve();
    }),
  }));

  const walletsWhereMock = vi.fn().mockReturnValue({
    limit: vi.fn((limitNum: number) => {
      const docs = walletDocs.slice(0, limitNum);
      const queryObj: Record<string, unknown> = {
        get: vi.fn().mockResolvedValue({
          empty: docs.length === 0,
          docs,
        }),
        startAfter: vi.fn((lastDoc: { id: string }) => {
          const idx = walletDocs.findIndex((w) => w.id === lastDoc.id);
          const afterDocs = idx >= 0 ? walletDocs.slice(idx + 1, idx + 1 + limitNum) : [];
          return {
            get: vi.fn().mockResolvedValue({
              empty: afterDocs.length === 0,
              docs: afterDocs,
            }),
          };
        }),
      };
      return queryObj;
    }),
  });

  const collectionMock = vi.fn((name: string) => {
    if (name === 'Wallets') return { where: walletsWhereMock };
    if (name === 'Users') return { doc: usersDocMock };
    throw new Error(`Unexpected collection: ${name}`);
  });

  return { db: { collection: collectionMock } as unknown as Firestore, userSets };
}

describe('runB2CUsersActivityRefreshSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes an active user from their real last-login activity', async () => {
    const { db } = createActivityRefreshDb({
      wallets: [{ id: 'wallet_1', ownerId: 'user_active_1' }],
      users: {
        user_active_1: {
          lastLoginAt: '2026-09-19T00:00:00.000Z',
          lifecycle: {
            b2cUsers: {
              usageStarted: { status: 'created', pageId: 'page_active_1' },
            },
          },
        },
      },
    });
    mockRefreshB2CUsersActivity.mockResolvedValue({ status: 'updated', pageId: 'page_active_1' });

    const { runB2CUsersActivityRefreshSync } = await import('../b2c-users.service.js');
    const result = await runB2CUsersActivityRefreshSync({ db, environment: 'production' });

    expect(result.updatedCount).toBe(1);
    expect(mockRefreshB2CUsersActivity).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'page_active_1' })
    );
  });

  it('skips users in a terminal stage without calling Notion', async () => {
    const { db } = createActivityRefreshDb({
      wallets: [{ id: 'wallet_2', ownerId: 'user_churned_1' }],
      users: {
        user_churned_1: {
          lastLoginAt: '2026-01-01T00:00:00.000Z',
          lifecycle: {
            b2cUsers: {
              churned: { status: 'created', pageId: 'page_churned_1' },
            },
          },
        },
      },
    });

    const { runB2CUsersActivityRefreshSync } = await import('../b2c-users.service.js');
    const result = await runB2CUsersActivityRefreshSync({ db, environment: 'production' });

    expect(result.results).toEqual([
      { userId: 'user_churned_1', outcome: 'skipped', reason: 'terminal-stage' },
    ]);
    expect(mockRefreshB2CUsersActivity).not.toHaveBeenCalled();
  });

  it('skips users without an existing B2C Users Notion row', async () => {
    const { db } = createActivityRefreshDb({
      wallets: [{ id: 'wallet_3', ownerId: 'user_no_row' }],
      users: {
        user_no_row: { lastLoginAt: '2026-09-19T00:00:00.000Z', lifecycle: {} },
      },
    });

    const { runB2CUsersActivityRefreshSync } = await import('../b2c-users.service.js');
    const result = await runB2CUsersActivityRefreshSync({ db, environment: 'production' });

    expect(result.results).toEqual([
      { userId: 'user_no_row', outcome: 'skipped', reason: 'missing-existing-row' },
    ]);
    expect(mockRefreshB2CUsersActivity).not.toHaveBeenCalled();
  });

  it('skips updating Notion when lastActiveAt and engagement are already current', async () => {
    const { db } = createActivityRefreshDb({
      wallets: [{ id: 'wallet_4', ownerId: 'user_current' }],
      users: {
        user_current: {
          lastLoginAt: '2026-09-19T00:00:00.000Z',
          lifecycle: {
            b2cUsers: {
              usageStarted: { status: 'created', pageId: 'page_current' },
              activitySync: {
                lastActiveAt: new Date('2026-09-19T00:00:00.000Z').toISOString(),
                engagement: 'High',
              },
            },
          },
        },
      },
    });

    const { runB2CUsersActivityRefreshSync } = await import('../b2c-users.service.js');
    const result = await runB2CUsersActivityRefreshSync({ db, environment: 'production' });

    expect(result.results).toEqual([
      { userId: 'user_current', outcome: 'skipped', reason: 'already-current' },
    ]);
    expect(mockRefreshB2CUsersActivity).not.toHaveBeenCalled();
  });

  it('forces update when force is true even if already current', async () => {
    const { db, userSets } = createActivityRefreshDb({
      wallets: [{ id: 'wallet_5', ownerId: 'user_forced' }],
      users: {
        user_forced: {
          lastLoginAt: '2026-09-19T00:00:00.000Z',
          lifecycle: {
            b2cUsers: {
              usageStarted: { status: 'created', pageId: 'page_forced' },
              activitySync: {
                lastActiveAt: new Date('2026-09-19T00:00:00.000Z').toISOString(),
                engagement: 'High',
              },
            },
          },
        },
      },
    });
    mockRefreshB2CUsersActivity.mockResolvedValue({ status: 'updated', pageId: 'page_forced' });

    const { runB2CUsersActivityRefreshSync } = await import('../b2c-users.service.js');
    const result = await runB2CUsersActivityRefreshSync({
      db,
      environment: 'production',
      force: true,
    });

    expect(result.updatedCount).toBe(1);
    expect(mockRefreshB2CUsersActivity).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'page_forced' })
    );
    expect(userSets['user_forced']).toBeTruthy();
  });

  it('paginates across multiple wallet batches until all are processed', async () => {
    const { db } = createActivityRefreshDb({
      wallets: [
        { id: 'w1', ownerId: 'u1' },
        { id: 'w2', ownerId: 'u2' },
        { id: 'w3', ownerId: 'u3' },
      ],
      users: {
        u1: {
          lastLoginAt: '2026-09-19T00:00:00.000Z',
          lifecycle: { b2cUsers: { usageStarted: { status: 'created', pageId: 'p1' } } },
        },
        u2: {
          lastLoginAt: '2026-09-19T00:00:00.000Z',
          lifecycle: { b2cUsers: { usageStarted: { status: 'created', pageId: 'p2' } } },
        },
        u3: {
          lastLoginAt: '2026-09-19T00:00:00.000Z',
          lifecycle: { b2cUsers: { usageStarted: { status: 'created', pageId: 'p3' } } },
        },
      },
    });
    mockRefreshB2CUsersActivity.mockResolvedValue({ status: 'updated', pageId: 'ok' });

    const { runB2CUsersActivityRefreshSync } = await import('../b2c-users.service.js');
    // Batch size of 2 across 3 wallets forces 2 pages
    const result = await runB2CUsersActivityRefreshSync({
      db,
      environment: 'production',
      batchSize: 2,
    });

    expect(result.processedCount).toBe(3);
    expect(result.updatedCount).toBe(3);
    expect(mockRefreshB2CUsersActivity).toHaveBeenCalledTimes(3);
  });
});
