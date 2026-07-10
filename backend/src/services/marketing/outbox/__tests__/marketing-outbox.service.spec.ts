import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordB2CUsersOrganizationModeEntry = vi.fn();
const mockRecordB2CUsersUsageStartedEntry = vi.fn();
const mockRecordUsageStartedNotionDashboardEntry = vi.fn();

vi.mock('../../lifecycle/b2c-users.service.js', () => ({
  recordB2CUsersOrganizationModeEntry: mockRecordB2CUsersOrganizationModeEntry,
  recordB2CUsersUsageStartedEntry: mockRecordB2CUsersUsageStartedEntry,
}));

vi.mock('../../lifecycle/usage-started-notion-dashboard.service.js', () => ({
  recordUsageStartedNotionDashboardEntry: mockRecordUsageStartedNotionDashboardEntry,
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
    mockRecordB2CUsersOrganizationModeEntry.mockResolvedValue({ status: 'created' });
    mockRecordB2CUsersUsageStartedEntry.mockResolvedValue({ status: 'created' });
    mockRecordUsageStartedNotionDashboardEntry.mockResolvedValue({ status: 'created' });
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
});
