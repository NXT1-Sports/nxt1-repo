/**
 * @fileoverview End-to-End User Journey Simulation for 30-Day $100 Trial Credits
 * @module @nxt1/backend/modules/billing/__tests__/trial-credits-e2e.spec
 *
 * Simulates a real user going through each stage in real time:
 * 1. Signup -> $100 starter wallet with 30-day trial metadata
 * 2. Active usage -> Agent X checks & spend deductions
 * 3. Approaching expiry -> 5 days remaining warning state
 * 4. Day 31 lapsed trial -> Auto-expiration to $0 & Agent X gate block
 * 5. Credit purchase conversion -> Restores wallet & permanently removes trial expiry
 * 6. Director & organization team wallet trial & conversion
 * 7. Invoice / PO conversion -> Sets invoice display mode & protects from expiry
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: loggerMock,
}));

vi.mock('../../../services/domain-events/domain-events.service.js', () => ({
  publishWalletFundedDomainEvent: vi.fn(),
  publishTrialCreditsDepletedDomainEvent: vi.fn(),
  publishIndividualWalletFundingDomainEvent: vi.fn(),
  publishOrganizationWalletFundingDomainEvent: vi.fn(),
}));

vi.mock('../../../services/platform/alert.service.js', () => ({
  sendSlackAlert: vi.fn(),
  sendSalesBillingAlert: vi.fn(),
}));

vi.mock('../../../services/communications/notification.service.js', () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

import {
  ensureUserBillingState,
  getBillingState,
  resolveBillingTarget,
  checkBudgetForResolvedTarget,
  addWalletTopUp,
  addFundsToOrgWallet,
  setWalletTrialInvoiceMode,
  initOrganizationBillingTargetForUser,
} from '../budget.service.js';
import type { WalletDocument } from '../types/index.js';

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

  const transform = value as {
    isIncrement?: unknown;
    operand?: unknown;
    amount?: unknown;
  };
  if (typeof transform.operand === 'number') return transform.operand;
  if (transform.isIncrement === true && typeof transform.amount === 'number') {
    return transform.amount;
  }
  return null;
}

function createMockFirestore(seed: Record<string, Record<string, StoredDoc>> = {}) {
  const store = new Map<string, StoredDoc>();

  for (const [collectionName, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs ?? {})) {
      store.set(`${collectionName}/${id}`, { ...data });
    }
  }

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
              if (f.op === '==') return data[f.field] === f.val;
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
            if (f.op === '==') return data[f.field] === f.val;
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

describe('Real-Time User Journey Simulation: $100 / 30-Day Trial Credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Step 1: New athlete user registers -> gets $100 wallet and active 30-day trial', async () => {
    const { db, store } = createMockFirestore({
      Users: {
        athlete_john: { role: 'athlete', email: 'john@example.com' },
      },
    });

    // 1. User signs up and accesses the platform
    const billingState = await ensureUserBillingState(db as never, 'athlete_john');

    // 2. Verify initial spendable balance and trial parameters
    expect(billingState.walletBalanceCents).toBe(10000); // $100.00
    expect(billingState.trial).toBeDefined();
    expect(billingState.trial?.grantCents).toBe(10000);
    expect(billingState.trial?.status).toBe('active');
    expect(billingState.trial?.displayMode).toBe('credits');
    expect(billingState.trial?.convertedAt).toBeNull();

    // Verify Firestore persistence
    const walletDoc = store.get('Wallets/athlete_john') as WalletDocument;
    expect(walletDoc.balanceCents).toBe(10000);
    expect(walletDoc.trial?.status).toBe('active');
  });

  it('Step 2: Active trial user performs Agent X actions -> balance decrements correctly', async () => {
    const { db, store } = createMockFirestore({
      Users: {
        athlete_john: {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'athlete_john',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        athlete_john: {
          id: 'athlete_john',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          balanceCents: 10000,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 29 * 86_400_000).toISOString(),
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        athlete_john: {
          id: 'athlete_john',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'athlete_john:2026-09': {
          id: 'athlete_john:2026-09',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    // 1. Agent X pre-admission check for a graphic generation task (cost: $0.60 / 60 cents)
    const target = await resolveBillingTarget(db as never, 'athlete_john');
    const check = await checkBudgetForResolvedTarget(db as never, target, 60);

    expect(check.allowed).toBe(true);

    // 2. Simulate deduction of 60 cents
    const wallet = store.get('Wallets/athlete_john') as WalletDocument;
    store.set('Wallets/athlete_john', { ...wallet, balanceCents: 9940 });

    // 3. Check updated billing state
    const state = await getBillingState(db as never, 'athlete_john');
    expect(state?.walletBalanceCents).toBe(9940); // $99.40 remaining
    expect(state?.trial?.status).toBe('active');
  });

  it('Step 3: Simulating Day 25 (5 days remaining) -> trial is active and within warning window', async () => {
    const fiveDaysFromNow = new Date(Date.now() + 5 * 86_400_000).toISOString();

    const { db } = createMockFirestore({
      Users: {
        athlete_john: {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'athlete_john',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        athlete_john: {
          id: 'athlete_john',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          balanceCents: 7500, // $75.00 left
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date(Date.now() - 25 * 86_400_000).toISOString(),
            expiresAt: fiveDaysFromNow,
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        athlete_john: {
          id: 'athlete_john',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'athlete_john:2026-09': {
          id: 'athlete_john:2026-09',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 2500,
        },
      },
    });

    const state = await getBillingState(db as never, 'athlete_john');
    expect(state?.walletBalanceCents).toBe(7500);
    expect(state?.trial?.status).toBe('active');

    // Server calculates days remaining
    const daysRemaining = Math.ceil(
      (new Date(state!.trial!.expiresAt).getTime() - Date.now()) / 86_400_000
    );
    expect(daysRemaining).toBeLessThanOrEqual(5);
    expect(daysRemaining).toBeGreaterThan(0);
  });

  it('Step 4: Simulating Day 31 -> Unconverted trial auto-expires to $0 and blocks Agent X', async () => {
    const expiredDate = new Date(Date.now() - 1 * 86_400_000).toISOString(); // Expired yesterday

    const { db, store } = createMockFirestore({
      Users: {
        athlete_john: {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'athlete_john',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        athlete_john: {
          id: 'athlete_john',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          balanceCents: 5400, // Still had $54 unspent
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date(Date.now() - 31 * 86_400_000).toISOString(),
            expiresAt: expiredDate,
            status: 'active', // Stored as active, but expiration engine will evaluate it
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        athlete_john: {
          id: 'athlete_john',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'athlete_john:2026-09': {
          id: 'athlete_john:2026-09',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 4600,
        },
      },
    });

    // 1. Target resolution triggers maybeExpireTrial transactionally
    const target = await resolveBillingTarget(db as never, 'athlete_john');
    expect(target.context.walletBalanceCents).toBe(0);
    expect(target.context.trial?.status).toBe('expired');

    // 2. Verify database was transactionally updated to $0
    const stored = store.get('Wallets/athlete_john') as WalletDocument;
    expect(stored.balanceCents).toBe(0);
    expect(stored.trial?.status).toBe('expired');

    // 3. Agent X attempts operation -> gate denies request
    const check = await checkBudgetForResolvedTarget(db as never, target, 40);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Wallet balance of $0.00 (available) is insufficient.');
  });

  it('Step 5: Expired user purchases credits -> converts trial and restores full Agent X access', async () => {
    const expiredDate = new Date(Date.now() - 2 * 86_400_000).toISOString();

    const { db, store } = createMockFirestore({
      Users: {
        athlete_john: {
          role: 'athlete',
          activeBillingTarget: {
            ownerId: 'athlete_john',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        athlete_john: {
          id: 'athlete_john',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          balanceCents: 0,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date(Date.now() - 32 * 86_400_000).toISOString(),
            expiresAt: expiredDate,
            status: 'expired',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        athlete_john: {
          id: 'athlete_john',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'athlete_john:2026-09': {
          id: 'athlete_john:2026-09',
          ownerId: 'athlete_john',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    // 1. User purchases $25.00 (2500 cents) in credits
    const topUpResult = await addWalletTopUp(db as never, 'athlete_john', 2500, 'stripe');
    expect(topUpResult.newBalance).toBe(2500);

    // 2. Verify trial status is converted and displayMode remains credits
    const stored = store.get('Wallets/athlete_john') as WalletDocument;
    expect(stored.trial?.status).toBe('converted');
    expect(stored.trial?.conversionSource).toBe('credit_purchase');
    expect(stored.trial?.displayMode).toBe('credits');
    expect(stored.trial?.convertedAt).toBeDefined();

    // 3. Agent X gate check now passes cleanly
    const target = await resolveBillingTarget(db as never, 'athlete_john');
    const check = await checkBudgetForResolvedTarget(db as never, target, 40);
    expect(check.allowed).toBe(true);
    expect(target.context.walletBalanceCents).toBe(2500);
  });

  it('Step 6: Director onboards team -> team wallet receives $100 trial and converts upon org funding', async () => {
    const { db, store } = createMockFirestore({
      Users: {
        coach_smith: {
          role: 'director',
          email: 'smith@highschool.edu',
        },
      },
      Organizations: {
        org_tigers: {
          ownerId: 'coach_smith',
          admins: [{ userId: 'coach_smith' }],
        },
      },
    });

    // 1. Director onboarded and team billing target initialized
    await initOrganizationBillingTargetForUser(db as never, 'coach_smith', 'org_tigers');

    // 2. Check team wallet in Firestore
    const orgWallet = store.get('Wallets/org:org_tigers') as WalletDocument;
    expect(orgWallet).toBeDefined();
    expect(orgWallet.balanceCents).toBe(10000); // $100.00 team starter
    expect(orgWallet.trial?.status).toBe('active');
    expect(orgWallet.trial?.grantCents).toBe(10000);

    // 3. School admin adds $100 to the team wallet
    const fundingResult = await addFundsToOrgWallet(
      db as never,
      'org_tigers',
      10000,
      'stripe_checkout'
    );
    expect(fundingResult.newBalance).toBe(20000); // $200.00 total

    // 4. Verify org trial converted
    const fundedWallet = store.get('Wallets/org:org_tigers') as WalletDocument;
    expect(fundedWallet.trial?.status).toBe('converted');
    expect(fundedWallet.trial?.conversionSource).toBe('credit_purchase');
  });

  it('Step 7: User converted to Invoice Billing -> displayMode switches to invoice and hides credit countdown', async () => {
    const { db } = createMockFirestore({
      Users: {
        school_director: {
          role: 'director',
          activeBillingTarget: {
            ownerId: 'school_director',
            ownerType: 'individual',
            source: 'default',
          },
        },
      },
      Wallets: {
        school_director: {
          id: 'school_director',
          ownerId: 'school_director',
          ownerType: 'individual',
          balanceCents: 10000,
          pendingHoldsCents: 0,
          trial: {
            grantCents: 10000,
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 15 * 86_400_000).toISOString(),
            status: 'active',
            convertedAt: null,
            conversionSource: null,
            displayMode: 'credits',
          },
        },
      },
      BillingPreferences: {
        school_director: {
          id: 'school_director',
          ownerId: 'school_director',
          ownerType: 'individual',
          paymentProvider: 'stripe',
          hardStop: true,
        },
      },
      PeriodLedgers: {
        'school_director:2026-09': {
          id: 'school_director:2026-09',
          ownerId: 'school_director',
          ownerType: 'individual',
          periodKey: '2026-09',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-09-30T23:59:59.999Z',
          monthlyBudget: 0,
          currentPeriodSpend: 0,
        },
      },
    });

    // 1. Admin approves invoice / PO billing for the school
    await setWalletTrialInvoiceMode(db as never, 'school_director');

    // 2. Fetch billing state
    const state = await getBillingState(db as never, 'school_director');

    // 3. Verify conversion and invoice display mode
    expect(state?.trial?.status).toBe('converted');
    expect(state?.trial?.conversionSource).toBe('invoice');
    expect(state?.trial?.displayMode).toBe('invoice');

    // 4. Agent X operations continue without hindrance
    const target = await resolveBillingTarget(db as never, 'school_director');
    const check = await checkBudgetForResolvedTarget(db as never, target, 100);
    expect(check.allowed).toBe(true);
  });
});
