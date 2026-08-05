import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordB2CUsersOrganizationModeEntry = vi.fn();
const mockRecordB2CUsersTrialCreditsFinishedEntry = vi.fn();
const mockRecordB2CUsersUsageStartedEntry = vi.fn();
const mockRecordB2CUsersAccountStartedEntry = vi.fn();
const mockRecordUsageStartedNotionDashboardEntry = vi.fn();
const mockRecordTrialCreditsFinishedNotionDashboardEntry = vi.fn();

vi.mock('../../lifecycle/b2c-users.service.js', () => ({
  recordB2CUsersAccountStartedEntry: mockRecordB2CUsersAccountStartedEntry,
  recordB2CUsersOrganizationModeEntry: mockRecordB2CUsersOrganizationModeEntry,
  recordB2CUsersTrialCreditsFinishedEntry: mockRecordB2CUsersTrialCreditsFinishedEntry,
  recordB2CUsersUsageStartedEntry: mockRecordB2CUsersUsageStartedEntry,
}));

vi.mock('../../lifecycle/usage-started-notion-dashboard.service.js', () => ({
  recordUsageStartedNotionDashboardEntry: mockRecordUsageStartedNotionDashboardEntry,
}));

vi.mock('../../lifecycle/trial-credits-finished-notion-dashboard.service.js', () => ({
  recordTrialCreditsFinishedNotionDashboardEntry:
    mockRecordTrialCreditsFinishedNotionDashboardEntry,
}));

function createOutboxDb(initialRecords: Array<Record<string, unknown>>) {
  const store = new Map<string, Record<string, unknown>>(
    initialRecords.map((record) => [String(record.eventKey), { ...record }])
  );

  const makeDocRef = (eventKey: string) => ({
    async get() {
      const record = store.get(eventKey);
      return {
        exists: Boolean(record),
        data: () => record,
      };
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      const previous = store.get(eventKey) ?? { eventKey };
      store.set(eventKey, options?.merge ? { ...previous, ...data } : { ...data });
    },
  });

  return {
    db: {
      collection(name: string) {
        if (name === 'MarketingOutbox') {
          return {
            doc: (eventKey: string) => makeDocRef(eventKey),
            where() {
              return {
                limit() {
                  return {
                    async get() {
                      return {
                        docs: Array.from(store.values())
                          .filter(
                            (record) => record.status === 'pending' || record.status === 'failed'
                          )
                          .map((record) => ({ id: String(record.eventKey) })),
                      };
                    },
                  };
                },
              };
            },
          };
        }

        return {
          doc: (eventKey: string) => makeDocRef(eventKey),
        };
      },
      async runTransaction<T>(
        callback: (transaction: {
          get: (
            ref: ReturnType<typeof makeDocRef>
          ) => Promise<Awaited<ReturnType<ReturnType<typeof makeDocRef>['get']>>>;
          set: (
            ref: ReturnType<typeof makeDocRef>,
            data: Record<string, unknown>,
            options?: { merge?: boolean }
          ) => Promise<void>;
        }) => Promise<T>
      ) {
        return callback({
          get: (ref) => ref.get(),
          set: async (ref, data, options) => {
            await ref.set(data, options);
          },
        });
      },
    },
    store,
  };
}

describe('marketing-outbox.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordB2CUsersAccountStartedEntry.mockResolvedValue({ status: 'created' });
    mockRecordB2CUsersOrganizationModeEntry.mockResolvedValue({ status: 'created' });
    mockRecordB2CUsersTrialCreditsFinishedEntry.mockResolvedValue({ status: 'created' });
    mockRecordB2CUsersUsageStartedEntry.mockResolvedValue({ status: 'created' });
    mockRecordUsageStartedNotionDashboardEntry.mockResolvedValue({ status: 'created' });
    mockRecordTrialCreditsFinishedNotionDashboardEntry.mockResolvedValue({ status: 'created' });
  });

  it('routes signup started to Account Started', async () => {
    const { db } = createOutboxDb([
      {
        eventKey: 'signup.started::user_0',
        eventType: 'signup.started',
        status: 'pending',
        attempts: 0,
        environment: 'production',
        payload: {
          userId: 'user_0',
          environment: 'production',
        },
      },
    ]);

    const { processPendingMarketingOutboxEvents } = await import('../marketing-outbox.service.js');

    const result = await processPendingMarketingOutboxEvents({ db: db as never, limit: 10 });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(mockRecordB2CUsersAccountStartedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_0',
        environment: 'production',
      })
    );
    expect(mockRecordB2CUsersOrganizationModeEntry).not.toHaveBeenCalled();
    expect(mockRecordB2CUsersUsageStartedEntry).not.toHaveBeenCalled();
  });

  it('routes organization usage to Organization Mode', async () => {
    const { db } = createOutboxDb([
      {
        eventKey: 'billing.usage_started.organization::op_org_1',
        eventType: 'billing.usage_started.organization',
        status: 'pending',
        attempts: 0,
        environment: 'production',
        payload: {
          userId: 'user_1',
          organizationId: 'org_1',
          operationId: 'op_org_1',
          feature: 'agent_x',
          chargeAmountCents: 199,
          environment: 'production',
        },
      },
    ]);

    const { processPendingMarketingOutboxEvents } = await import('../marketing-outbox.service.js');

    const result = await processPendingMarketingOutboxEvents({ db: db as never, limit: 10 });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(mockRecordB2CUsersOrganizationModeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        organizationId: 'org_1',
        environment: 'production',
      })
    );
    expect(mockRecordB2CUsersUsageStartedEntry).not.toHaveBeenCalled();
    expect(mockRecordUsageStartedNotionDashboardEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        organizationId: 'org_1',
      })
    );
  });

  it('fails organization usage outbox when the B2B usage dashboard does not update', async () => {
    mockRecordUsageStartedNotionDashboardEntry.mockResolvedValueOnce({
      status: 'skipped',
      reason: 'missing-b2b-partner-page',
    });
    const { db, store } = createOutboxDb([
      {
        eventKey: 'billing.usage_started.organization::op_org_1',
        eventType: 'billing.usage_started.organization',
        status: 'pending',
        attempts: 0,
        environment: 'production',
        payload: {
          userId: 'user_1',
          organizationId: 'org_1',
          operationId: 'op_org_1',
          feature: 'agent_x',
          chargeAmountCents: 199,
          environment: 'production',
        },
      },
    ]);

    const { processPendingMarketingOutboxEvents } = await import('../marketing-outbox.service.js');

    const result = await processPendingMarketingOutboxEvents({
      db: db as never,
      limit: 10,
      now: new Date('2026-07-22T12:00:00.000Z'),
    });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 0,
      failedCount: 1,
      skippedCount: 0,
    });
    expect(store.get('billing.usage_started.organization::op_org_1')).toEqual(
      expect.objectContaining({
        status: 'failed',
        attempts: 1,
        lastError: expect.stringContaining('missing-b2b-partner-page'),
      })
    );
    expect(mockRecordB2CUsersOrganizationModeEntry).toHaveBeenCalled();
    expect(mockRecordUsageStartedNotionDashboardEntry).toHaveBeenCalled();
  });

  it('completes organization usage outbox when staging intentionally skips the B2B usage dashboard', async () => {
    mockRecordUsageStartedNotionDashboardEntry.mockResolvedValueOnce({
      status: 'skipped',
      reason: 'background-job',
    });
    const { db, store } = createOutboxDb([
      {
        eventKey: 'billing.usage_started.organization::op_org_staging_1',
        eventType: 'billing.usage_started.organization',
        status: 'pending',
        attempts: 0,
        environment: 'staging',
        payload: {
          userId: 'user_1',
          organizationId: 'org_1',
          operationId: 'op_org_staging_1',
          feature: 'agent_x',
          chargeAmountCents: 199,
          environment: 'staging',
        },
      },
    ]);

    const { processPendingMarketingOutboxEvents } = await import('../marketing-outbox.service.js');

    const result = await processPendingMarketingOutboxEvents({
      db: db as never,
      limit: 10,
      now: new Date('2026-07-24T04:00:04.414Z'),
    });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(store.get('billing.usage_started.organization::op_org_staging_1')).toEqual(
      expect.objectContaining({
        status: 'completed',
        attempts: 1,
        lastError: null,
      })
    );
    expect(mockRecordB2CUsersOrganizationModeEntry).toHaveBeenCalled();
    expect(mockRecordUsageStartedNotionDashboardEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'staging',
      })
    );
  });

  it('routes individual usage to personal Usage Started', async () => {
    const { db } = createOutboxDb([
      {
        eventKey: 'billing.usage_started.individual::op_ind_1',
        eventType: 'billing.usage_started.individual',
        status: 'pending',
        attempts: 0,
        environment: 'production',
        payload: {
          userId: 'user_2',
          operationId: 'op_ind_1',
          feature: 'agent_x',
          chargeAmountCents: 299,
          environment: 'production',
        },
      },
    ]);

    const { processPendingMarketingOutboxEvents } = await import('../marketing-outbox.service.js');

    const result = await processPendingMarketingOutboxEvents({ db: db as never, limit: 10 });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(mockRecordB2CUsersUsageStartedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_2',
        operationId: 'op_ind_1',
        feature: 'agent_x',
        chargeAmountCents: 299,
        environment: 'production',
      })
    );
    expect(mockRecordB2CUsersOrganizationModeEntry).not.toHaveBeenCalled();
    expect(mockRecordUsageStartedNotionDashboardEntry).not.toHaveBeenCalled();
  });

  it('routes individual trial depletion to personal Trial Credits Finished', async () => {
    const { db } = createOutboxDb([
      {
        eventKey: 'billing.trial_credits_finished::op_trial_ind_1',
        eventType: 'billing.trial_credits_finished',
        status: 'pending',
        attempts: 0,
        environment: 'production',
        payload: {
          userId: 'user_3',
          billingOwnerType: 'individual',
          organizationId: null,
          operationId: 'op_trial_ind_1',
          feature: 'agent_x',
          baselineCents: 100,
          newBalanceCents: 0,
          environment: 'production',
        },
      },
    ]);

    const { processPendingMarketingOutboxEvents } = await import('../marketing-outbox.service.js');

    const result = await processPendingMarketingOutboxEvents({ db: db as never, limit: 10 });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(mockRecordB2CUsersTrialCreditsFinishedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_3',
        operationId: 'op_trial_ind_1',
        feature: 'agent_x',
        baselineCents: 100,
        newBalanceCents: 0,
        environment: 'production',
      })
    );
    expect(mockRecordTrialCreditsFinishedNotionDashboardEntry).not.toHaveBeenCalled();
  });

  it('routes organization trial depletion to the B2B Trial Credits Finished dashboard', async () => {
    const { db } = createOutboxDb([
      {
        eventKey: 'billing.trial_credits_finished::op_trial_org_1',
        eventType: 'billing.trial_credits_finished',
        status: 'pending',
        attempts: 0,
        environment: 'production',
        payload: {
          userId: 'user_4',
          billingOwnerType: 'organization',
          organizationId: 'org_4',
          operationId: 'op_trial_org_1',
          feature: 'agent_x',
          baselineCents: 300,
          newBalanceCents: 0,
          environment: 'production',
        },
      },
    ]);

    const { processPendingMarketingOutboxEvents } = await import('../marketing-outbox.service.js');

    const result = await processPendingMarketingOutboxEvents({ db: db as never, limit: 10 });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(mockRecordTrialCreditsFinishedNotionDashboardEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_4',
        organizationId: 'org_4',
        operationId: 'op_trial_org_1',
        feature: 'agent_x',
        baselineCents: 300,
        newBalanceCents: 0,
      })
    );
    expect(mockRecordB2CUsersTrialCreditsFinishedEntry).not.toHaveBeenCalled();
  });
});
