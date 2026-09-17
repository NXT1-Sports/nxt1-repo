import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const notificationDispatchMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ activityId: 'activity_1', notificationId: 'notification_1' })
);

vi.mock('../../../utils/logger.js', () => ({
  logger: loggerMock,
}));

vi.mock('../../../services/domain-events/domain-events.service.js', () => ({
  publishWalletFundedDomainEvent: vi.fn(),
  publishTrialCreditsDepletedDomainEvent: vi.fn().mockResolvedValue({
    domainEventType: 'billing.trial_credits_depleted',
    projections: [],
  }),
}));

vi.mock('../../../services/platform/alert.service.js', () => ({
  sendSlackAlert: vi.fn(),
}));

vi.mock('../../../services/communications/notification.service.js', () => ({
  dispatch: notificationDispatchMock,
}));

import {
  ensureUserBillingState,
  getBillingState,
  addWalletTopUp,
  addFundsToOrgWallet,
  setWalletTrialInvoiceMode,
  initOrganizationBillingTargetForUser,
  sendTrialCreditNotifications,
} from '../budget.service.js';
import type { WalletDocument } from '../types/index.js';

type CollectionName =
  | 'AppConfig'
  | 'BillingPreferences'
  | 'Organizations'
  | 'PeriodLedgers'
  | 'RosterEntries'
  | 'Teams'
  | 'Users'
  | 'WalletHolds'
  | 'Wallets'
  | 'CheckoutSessionFinalizations';

type StoredDoc = Record<string, unknown>;

interface MockDocumentReference {
  readonly path: string;
  get(): Promise<MockDocumentSnapshot>;
  set(payload: StoredDoc, options?: { merge?: boolean }): Promise<void>;
  update(payload: StoredDoc): Promise<void>;
}

interface MockDocumentSnapshot {
  readonly exists: boolean;
  readonly id: string;
  readonly ref: MockDocumentReference;
  data(): StoredDoc | undefined;
}

interface MockTransaction {
  get(docRef: MockDocumentReference): Promise<MockDocumentSnapshot>;
  set(docRef: MockDocumentReference, data: StoredDoc, options?: { merge?: boolean }): Promise<void>;
  update(docRef: MockDocumentReference, data: StoredDoc): void;
  create(docRef: MockDocumentReference, data: StoredDoc): Promise<void>;
}

function getIncrementAmount(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;

  const transform = value as { isIncrement?: unknown; amount?: unknown };
  return transform.isIncrement === true && typeof transform.amount === 'number'
    ? transform.amount
    : null;
}

function createMockFirestore(
  seed: Partial<Record<CollectionName, Record<string, StoredDoc>>> = {}
) {
  const store = new Map<string, StoredDoc>();

  for (const [collectionName, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs ?? {})) {
      store.set(`${collectionName}/${id}`, { ...data });
    }
  }

  const readField = (data: StoredDoc, path: string): unknown =>
    path.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, data);

  const createDocRef = (collectionName: string, id: string): MockDocumentReference => ({
    id,
    path: `${collectionName}/${id}`,
    get: async () => {
      const data = store.get(`${collectionName}/${id}`);
      return {
        exists: data !== undefined,
        id,
        ref: createDocRef(collectionName, id),
        data: () => (data ? { ...data } : undefined),
      };
    },
    set: async (payload: StoredDoc, options?: { merge?: boolean }) => {
      const existing = store.get(`${collectionName}/${id}`);
      if (options?.merge && existing) {
        store.set(`${collectionName}/${id}`, { ...existing, ...payload });
      } else {
        store.set(`${collectionName}/${id}`, { ...payload });
      }
    },
    update: async (payload: StoredDoc) => {
      const existing = store.get(`${collectionName}/${id}`) ?? {};
      const updated = { ...existing };
      for (const [key, value] of Object.entries(payload)) {
        if (key.includes('.')) {
          const [parent, child] = key.split('.');
          const parentObj = (updated[parent!] as Record<string, unknown>) ?? {};
          updated[parent!] = { ...parentObj, [child!]: value };
        } else if (getIncrementAmount(value) !== null) {
          const prev = (updated[key] as number) ?? 0;
          updated[key] = prev + getIncrementAmount(value);
        } else {
          updated[key] = value;
        }
      }
      store.set(`${collectionName}/${id}`, updated);
    },
  });

  const createQuery = (
    collectionName: string,
    filters: Array<{ field: string; op: string; val: unknown }> = []
  ) => ({
    where: (field: string, op: string, val: unknown) =>
      createQuery(collectionName, [...filters, { field, op, val }]),
    orderBy: () => createQuery(collectionName, filters),
    limit: (count: number) => ({
      get: async () => {
        const docs = Array.from(store.entries())
          .filter(([path, data]) => {
            if (!path.startsWith(`${collectionName}/`)) return false;
            return filters.every((f) => {
              if (f.op === '==') return readField(data, f.field) === f.val;
              return true;
            });
          })
          .slice(0, count)
          .map(([path, data]) => {
            const id = path.slice(collectionName.length + 1);
            return {
              id,
              ref: createDocRef(collectionName, id),
              data: () => ({ ...data }),
            };
          });
        return { docs, empty: docs.length === 0 };
      },
    }),
    get: async () => {
      const docs = Array.from(store.entries())
        .filter(([path, data]) => {
          if (!path.startsWith(`${collectionName}/`)) return false;
          return filters.every((f) => {
            if (f.op === '==') return readField(data, f.field) === f.val;
            return true;
          });
        })
        .map(([path, data]) => {
          const id = path.slice(collectionName.length + 1);
          return {
            id,
            ref: createDocRef(collectionName, id),
            data: () => ({ ...data }),
          };
        });
      return { docs, empty: docs.length === 0 };
    },
  });

  const applyUpdates = (target: StoredDoc, payload: StoredDoc) => {
    const updated = { ...target };
    for (const [key, value] of Object.entries(payload)) {
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        const parentObj = (updated[parent!] as Record<string, unknown>) ?? {};
        updated[parent!] = { ...parentObj, [child!]: value };
      } else if (getIncrementAmount(value) !== null) {
        const prev = (updated[key] as number) ?? 0;
        updated[key] = prev + getIncrementAmount(value);
      } else {
        updated[key] = value;
      }
    }
    return updated;
  };

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => createDocRef(name, id),
      where: (field: string, op: string, val: unknown) => createQuery(name, [{ field, op, val }]),
      get: () => createQuery(name).get(),
    }),
    runTransaction: async <T>(
      updateFunction: (transaction: MockTransaction) => Promise<T>
    ): Promise<T> => {
      const transaction = {
        get: async (docRef: MockDocumentReference) => docRef.get(),
        set: (docRef: MockDocumentReference, data: StoredDoc, options?: { merge?: boolean }) =>
          docRef.set(data, options),
        update: (docRef: MockDocumentReference, data: StoredDoc) => {
          const existing = store.get(docRef.path) ?? {};
          store.set(docRef.path, applyUpdates(existing, data));
        },
        create: (docRef: MockDocumentReference, data: StoredDoc) => docRef.set(data),
      };

      return updateFunction(transaction);
    },
  };

  return { db, store };
}

describe('Introductory Trial Credit Grant ($100 / 30 Days)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provisions new individual users with a $100 starter balance and active 30-day trial state', async () => {
    const { db, store } = createMockFirestore({
      Users: {
        user_new_1: { role: 'athlete' },
      },
      AppConfig: {
        starterWallets: {
          individualAmountCents: 10000,
          organizationAmountCents: 2000,
        },
      },
    });

    const state = await ensureUserBillingState(db as never, 'user_new_1');

    expect(state.walletBalanceCents).toBe(10000);
    expect(state.trial).toBeDefined();
    expect(state.trial?.grantCents).toBe(10000);
    expect(state.trial?.status).toBe('active');
    expect(state.trial?.displayMode).toBe('credits');
    expect(state.trial?.convertedAt).toBeNull();

    const storedWallet = store.get('Wallets/user_new_1') as WalletDocument;
    expect(storedWallet.balanceCents).toBe(10000);
    expect(storedWallet.trial?.status).toBe('active');
  });

  it('expires unconverted trial to $0 when 30 days have passed', async () => {
    const pastStartedAt = new Date(Date.now() - 35 * 86_400_000).toISOString();
    const pastExpiresAt = new Date(Date.now() - 5 * 86_400_000).toISOString();

    const { db, store } = createMockFirestore({
      Users: {
        user_expired_1: {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user_expired_1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        user_expired_1: {
          id: 'user_expired_1',
          ownerId: 'user_expired_1',
          ownerType: 'individual',
          balanceCents: 8500,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: pastStartedAt,
            expiresAt: pastExpiresAt,
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        user_expired_1: {
          id: 'user_expired_1',
          ownerId: 'user_expired_1',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'user_expired_1:2026-09': {
          id: 'user_expired_1:2026-09',
          ownerId: 'user_expired_1',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    const state = await getBillingState(db as never, 'user_expired_1');

    expect(state).not.toBeNull();
    expect(state?.walletBalanceCents).toBe(0);
    expect(state?.trial?.status).toBe('expired');

    const updatedStored = store.get('Wallets/user_expired_1') as WalletDocument;
    expect(updatedStored.balanceCents).toBe(0);
    expect(updatedStored.trial?.status).toBe('expired');
  });

  it('does not expire an invoice-mode wallet even if its trial date is in the past', async () => {
    const pastStartedAt = new Date(Date.now() - 35 * 86_400_000).toISOString();
    const pastExpiresAt = new Date(Date.now() - 5 * 86_400_000).toISOString();

    const { db, store } = createMockFirestore({
      Users: {
        user_invoice_guard_1: {
          role: 'director',
          activeBillingTarget: {
            ownerId: 'user_invoice_guard_1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        user_invoice_guard_1: {
          id: 'user_invoice_guard_1',
          ownerId: 'user_invoice_guard_1',
          ownerType: 'individual',
          balanceCents: 8500,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: pastStartedAt,
            expiresAt: pastExpiresAt,
            status: 'active',
            convertedAt: null,
            conversionSource: 'invoice',
            displayMode: 'invoice',
          },
        },
      },
      BillingPreferences: {
        user_invoice_guard_1: {
          id: 'user_invoice_guard_1',
          ownerId: 'user_invoice_guard_1',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'user_invoice_guard_1:2026-09': {
          id: 'user_invoice_guard_1:2026-09',
          ownerId: 'user_invoice_guard_1',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    const state = await getBillingState(db as never, 'user_invoice_guard_1');

    expect(state?.walletBalanceCents).toBe(8500);
    expect(state?.trial?.status).toBe('active');
    expect(state?.trial?.displayMode).toBe('invoice');

    const stored = store.get('Wallets/user_invoice_guard_1') as WalletDocument;
    expect(stored.balanceCents).toBe(8500);
    expect(stored.trial?.status).toBe('active');
  });

  it('keeps the active trial balance intact if within the 30-day window', async () => {
    const futureExpiresAt = new Date(Date.now() + 15 * 86_400_000).toISOString();

    const { db, store } = createMockFirestore({
      Users: {
        user_active_1: {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user_active_1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        user_active_1: {
          id: 'user_active_1',
          ownerId: 'user_active_1',
          ownerType: 'individual',
          balanceCents: 6200,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date().toISOString(),
            expiresAt: futureExpiresAt,
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        user_active_1: {
          id: 'user_active_1',
          ownerId: 'user_active_1',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'user_active_1:2026-09': {
          id: 'user_active_1:2026-09',
          ownerId: 'user_active_1',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    const state = await getBillingState(db as never, 'user_active_1');

    expect(state?.walletBalanceCents).toBe(6200);
    expect(state?.trial?.status).toBe('active');

    const stored = store.get('Wallets/user_active_1') as WalletDocument;
    expect(stored.balanceCents).toBe(6200);
  });

  it('converts trial status to converted on credit purchase via addWalletTopUp', async () => {
    const pastExpiresAt = new Date(Date.now() - 2 * 86_400_000).toISOString();

    const { db, store } = createMockFirestore({
      Users: {
        user_purchasing_1: {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user_purchasing_1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        user_purchasing_1: {
          id: 'user_purchasing_1',
          ownerId: 'user_purchasing_1',
          ownerType: 'individual',
          balanceCents: 0,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date(Date.now() - 32 * 86_400_000).toISOString(),
            expiresAt: pastExpiresAt,
            status: 'expired',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        user_purchasing_1: {
          id: 'user_purchasing_1',
          ownerId: 'user_purchasing_1',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'user_purchasing_1:2026-09': {
          id: 'user_purchasing_1:2026-09',
          ownerId: 'user_purchasing_1',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    const result = await addWalletTopUp(db as never, 'user_purchasing_1', 2500, 'stripe');

    expect(result.newBalance).toBe(2500);

    const stored = store.get('Wallets/user_purchasing_1') as WalletDocument;
    expect(stored.trial?.status).toBe('converted');
    expect(stored.trial?.conversionSource).toBe('credit_purchase');
    expect(stored.trial?.displayMode).toBe('credits');
    expect(stored.trial?.convertedAt).toBeDefined();
  });

  it('creates a complete converted trial object when a legacy wallet without trial metadata pays', async () => {
    const { db, store } = createMockFirestore({
      Users: {
        user_legacy_paid_1: {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'user_legacy_paid_1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        user_legacy_paid_1: {
          id: 'user_legacy_paid_1',
          ownerId: 'user_legacy_paid_1',
          ownerType: 'individual',
          balanceCents: 1000,
          pendingHoldsCents: 0,
        },
      },
      BillingPreferences: {
        user_legacy_paid_1: {
          id: 'user_legacy_paid_1',
          ownerId: 'user_legacy_paid_1',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'user_legacy_paid_1:2026-09': {
          id: 'user_legacy_paid_1:2026-09',
          ownerId: 'user_legacy_paid_1',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    const result = await addWalletTopUp(db as never, 'user_legacy_paid_1', 2500, 'stripe');

    expect(result.newBalance).toBe(3500);

    const stored = store.get('Wallets/user_legacy_paid_1') as WalletDocument;
    expect(stored.trial).toMatchObject({
      grantCents: 10000,
      status: 'converted',
      conversionSource: 'credit_purchase',
      displayMode: 'credits',
    });
    expect(stored.trial.startedAt).toBeDefined();
    expect(stored.trial.expiresAt).toBeDefined();
    expect(stored.trial.convertedAt).toBeDefined();
  });

  it('converts trial to invoice billing mode via setWalletTrialInvoiceMode', async () => {
    const { db, store } = createMockFirestore({
      Users: {
        user_invoice_1: {
          role: 'coach',
          activeBillingTarget: {
            ownerId: 'user_invoice_1',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        user_invoice_1: {
          id: 'user_invoice_1',
          ownerId: 'user_invoice_1',
          ownerType: 'individual',
          balanceCents: 10000,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        user_invoice_1: {
          id: 'user_invoice_1',
          ownerId: 'user_invoice_1',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'user_invoice_1:2026-09': {
          id: 'user_invoice_1:2026-09',
          ownerId: 'user_invoice_1',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    await setWalletTrialInvoiceMode(db as never, 'user_invoice_1');

    const stored = store.get('Wallets/user_invoice_1') as WalletDocument;
    expect(stored.trial?.status).toBe('converted');
    expect(stored.trial?.conversionSource).toBe('invoice');
    expect(stored.trial?.displayMode).toBe('invoice');
  });

  it('provisions organization wallets with $100 starter balance and active 30-day trial', async () => {
    const { db, store } = createMockFirestore({
      Users: {
        director_1: {
          role: 'director',
        },
      },
      Organizations: {
        org_test_1: {
          ownerId: 'director_1',
          admins: [{ userId: 'director_1' }],
        },
      },
    });

    await initOrganizationBillingTargetForUser(db as never, 'director_1', 'org_test_1');

    const stored = store.get('Wallets/org:org_test_1') as WalletDocument;
    expect(stored).toBeDefined();
    expect(stored.balanceCents).toBe(10000);
    expect(stored.trial?.status).toBe('active');
    expect(stored.trial?.grantCents).toBe(10000);
  });

  it('converts organization trial on addFundsToOrgWallet', async () => {
    const { db, store } = createMockFirestore({
      Users: {
        director_2: {
          role: 'director',
          activeBillingTarget: {
            ownerId: 'org_test_2',
            ownerType: 'organization',
            organizationId: 'org_test_2',
            source: 'organization',
          },
        },
      },
      Organizations: {
        org_test_2: {
          ownerId: 'director_2',
          admins: [{ userId: 'director_2' }],
        },
      },
      Wallets: {
        'org:org_test_2': {
          id: 'org:org_test_2',
          ownerId: 'org_test_2',
          ownerType: 'organization',
          balanceCents: 10000,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 25 * 86_400_000).toISOString(),
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
    });

    const result = await addFundsToOrgWallet(db as never, 'org_test_2', 5000, 'stripe_checkout');

    expect(result.newBalance).toBe(15000);

    const stored = store.get('Wallets/org:org_test_2') as WalletDocument;
    expect(stored.trial?.status).toBe('converted');
    expect(stored.trial?.conversionSource).toBe('credit_purchase');
  });

  it('sends a 7-day trial reminder to personal wallet owners and marks the flag', async () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { db, store } = createMockFirestore({
      Wallets: {
        user_trial_notify_1: {
          id: 'user_trial_notify_1',
          ownerId: 'user_trial_notify_1',
          ownerType: 'individual',
          balanceCents: 9000,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date(Date.now() - 23 * 86_400_000).toISOString(),
            expiresAt,
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
    });

    const result = await sendTrialCreditNotifications(db as never);

    expect(result).toMatchObject({ scanned: 1, dispatched: 1, failed: 0 });
    expect(notificationDispatchMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: 'user_trial_notify_1',
        type: 'trial_expiring',
        deepLink: '/usage?section=overview',
        idempotencyKey: 'trial_expiring_user_trial_notify_1',
      })
    );

    const stored = store.get('Wallets/user_trial_notify_1') as WalletDocument;
    expect(stored.trial.notifiedExpiringAt).toBeDefined();
  });

  it('sends critical trial reminders to organization admins', async () => {
    const expiresAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const { db, store } = createMockFirestore({
      Organizations: {
        org_trial_notify_1: {
          ownerId: 'director_notify_1',
          admins: [{ userId: 'director_notify_1' }, { userId: 'coach_notify_1' }],
        },
      },
      Wallets: {
        'org:org_trial_notify_1': {
          id: 'org:org_trial_notify_1',
          ownerId: 'org_trial_notify_1',
          ownerType: 'organization',
          balanceCents: 9000,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date(Date.now() - 27 * 86_400_000).toISOString(),
            expiresAt,
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
    });

    const result = await sendTrialCreditNotifications(db as never);

    expect(result).toMatchObject({ scanned: 1, dispatched: 2, failed: 0 });
    expect(notificationDispatchMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: 'director_notify_1',
        type: 'trial_critical',
        priority: 'high',
        idempotencyKey: 'trial_critical_org_org_trial_notify_1',
      })
    );
    expect(notificationDispatchMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: 'coach_notify_1',
        type: 'trial_critical',
        priority: 'high',
        idempotencyKey: 'trial_critical_org_org_trial_notify_1',
      })
    );

    const stored = store.get('Wallets/org:org_trial_notify_1') as WalletDocument;
    expect(stored.trial.notifiedCriticalAt).toBeDefined();
  });

  it('does not notify converted or invoice-mode trials', async () => {
    const expiresAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const { db } = createMockFirestore({
      Wallets: {
        converted_trial_1: {
          id: 'converted_trial_1',
          ownerId: 'converted_trial_1',
          ownerType: 'individual',
          balanceCents: 9000,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date().toISOString(),
            expiresAt,
            status: 'converted',
            convertedAt: new Date().toISOString(),
            conversionSource: 'credit_purchase',
            displayMode: 'credits',
          },
        },
        invoice_trial_1: {
          id: 'invoice_trial_1',
          ownerId: 'invoice_trial_1',
          ownerType: 'individual',
          balanceCents: 9000,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date().toISOString(),
            expiresAt,
            status: 'active',
            convertedAt: null,
            conversionSource: 'invoice',
            displayMode: 'invoice',
          },
        },
      },
    });

    const result = await sendTrialCreditNotifications(db as never);

    expect(result).toMatchObject({ scanned: 1, dispatched: 0, skipped: 1, failed: 0 });
    expect(notificationDispatchMock).not.toHaveBeenCalled();
  });
});
