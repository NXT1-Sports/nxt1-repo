import { beforeEach, describe, expect, it, vi } from 'vitest';

const dispatchMock = vi.fn(async () => undefined);

vi.mock('../../../services/notification.service.js', () => ({
  dispatch: dispatchMock,
}));

import {
  MAX_REFERRAL_REWARDS,
  REFERRAL_REWARD_CENTS,
  creditReferralReward,
} from '../budget.service.js';

type CollectionName =
  | 'BillingContexts'
  | 'ReferralRewards'
  | 'AppConfig'
  | 'Teams'
  | 'Organizations';
type StoredDoc = Record<string, unknown>;

type MockDocRef = {
  readonly id: string;
  readonly path: string;
  get: () => Promise<{
    readonly exists: boolean;
    readonly id: string;
    readonly ref: MockDocRef;
    data: () => StoredDoc | undefined;
  }>;
  set: (payload: StoredDoc) => Promise<void>;
  update: (payload: StoredDoc) => Promise<void>;
};

type TransactionOperation =
  | {
      readonly type: 'update';
      readonly path: string;
      readonly payload: StoredDoc;
    }
  | {
      readonly type: 'set';
      readonly path: string;
      readonly payload: StoredDoc;
    };

function createMockFirestore(seed?: Partial<Record<CollectionName, Record<string, StoredDoc>>>) {
  const store = new Map<string, StoredDoc>();
  const transactionOperations: TransactionOperation[] = [];
  let transactionCount = 0;

  for (const [collectionName, docs] of Object.entries(seed ?? {})) {
    for (const [id, data] of Object.entries(docs ?? {})) {
      store.set(`${collectionName}/${id}`, structuredClone(data));
    }
  }

  const createDocRef = (collectionName: string, id: string): MockDocRef => ({
    id,
    path: `${collectionName}/${id}`,
    get: async () => {
      const data = store.get(`${collectionName}/${id}`);
      return {
        exists: data !== undefined,
        id,
        ref: createDocRef(collectionName, id),
        data: () => data,
      };
    },
    set: async (payload) => {
      store.set(`${collectionName}/${id}`, structuredClone(payload));
    },
    update: async (payload) => {
      const existing = store.get(`${collectionName}/${id}`) ?? {};
      store.set(`${collectionName}/${id}`, { ...existing, ...structuredClone(payload) });
    },
  });

  const db = {
    collection: (collectionName: string) => ({
      doc: (id: string) => createDocRef(collectionName, id),
    }),
    runTransaction: async <T>(
      callback: (txn: {
        get: (ref: MockDocRef) => ReturnType<MockDocRef['get']>;
        update: (ref: MockDocRef, payload: StoredDoc) => void;
        set: (ref: MockDocRef, payload: StoredDoc) => void;
      }) => Promise<T>
    ): Promise<T> => {
      transactionCount += 1;
      const operations: TransactionOperation[] = [];

      const result = await callback({
        get: (ref) => ref.get(),
        update: (ref, payload) => {
          operations.push({ type: 'update', path: ref.path, payload: structuredClone(payload) });
        },
        set: (ref, payload) => {
          operations.push({ type: 'set', path: ref.path, payload: structuredClone(payload) });
        },
      });

      for (const operation of operations) {
        transactionOperations.push(operation);

        if (operation.type === 'set') {
          store.set(operation.path, structuredClone(operation.payload));
          continue;
        }

        const existing = store.get(operation.path) ?? {};
        store.set(operation.path, { ...existing, ...structuredClone(operation.payload) });
      }

      return result;
    },
  };

  return {
    db,
    getDoc: (collectionName: CollectionName, id: string) => store.get(`${collectionName}/${id}`),
    getTransactionOperations: () => transactionOperations,
    getTransactionCount: () => transactionCount,
  };
}

describe('creditReferralReward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('credits the wallet and writes an idempotency record on the happy path', async () => {
    const firestore = createMockFirestore({
      BillingContexts: {
        inviter_1: {
          userId: 'inviter_1',
          walletBalanceCents: 1200,
          totalReferralRewards: 3,
        },
      },
      AppConfig: {
        referralReward: { amountCents: 700 },
      },
    });

    const result = await creditReferralReward(firestore.db as never, 'inviter_1', 'new_user_1');

    expect(result).toEqual({ success: true, newBalanceCents: 1900 });
    expect(firestore.getTransactionCount()).toBe(1);
    expect(firestore.getDoc('ReferralRewards', 'referral_inviter_1_new_user_1')).toMatchObject({
      referrerId: 'inviter_1',
      newUserId: 'new_user_1',
      amountCents: 700,
      type: 'referral_reward',
    });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith(
      firestore.db,
      expect.objectContaining({
        userId: 'inviter_1',
        type: 'credits_added',
        title: 'Credits Added',
      })
    );
  });

  it('returns current balance and performs no writes when the reward already exists', async () => {
    const firestore = createMockFirestore({
      BillingContexts: {
        inviter_2: {
          userId: 'inviter_2',
          walletBalanceCents: 2400,
          totalReferralRewards: 5,
        },
      },
      ReferralRewards: {
        referral_inviter_2_new_user_2: {
          referrerId: 'inviter_2',
          newUserId: 'new_user_2',
          amountCents: 500,
        },
      },
    });

    const result = await creditReferralReward(firestore.db as never, 'inviter_2', 'new_user_2');

    expect(result).toEqual({ success: true, newBalanceCents: 2400 });
    expect(firestore.getTransactionCount()).toBe(1);
    expect(firestore.getTransactionOperations()).toHaveLength(0);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('enforces the per-user referral cap without writing a reward', async () => {
    const firestore = createMockFirestore({
      BillingContexts: {
        inviter_3: {
          userId: 'inviter_3',
          walletBalanceCents: 3100,
          totalReferralRewards: MAX_REFERRAL_REWARDS,
        },
      },
      AppConfig: {
        referralReward: { amountCents: 500 },
      },
    });

    const result = await creditReferralReward(firestore.db as never, 'inviter_3', 'new_user_3');

    expect(result).toEqual({
      success: false,
      newBalanceCents: 3100,
      error: 'Referral reward limit reached',
    });
    expect(firestore.getTransactionCount()).toBe(1);
    expect(firestore.getTransactionOperations()).toHaveLength(0);
    expect(firestore.getDoc('ReferralRewards', 'referral_inviter_3_new_user_3')).toBeUndefined();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('falls back to the default reward amount when AppConfig is missing', async () => {
    const firestore = createMockFirestore({
      BillingContexts: {
        inviter_4: {
          userId: 'inviter_4',
          walletBalanceCents: 400,
          totalReferralRewards: 0,
        },
      },
    });

    const result = await creditReferralReward(firestore.db as never, 'inviter_4', 'new_user_4');

    expect(result).toEqual({
      success: true,
      newBalanceCents: 400 + REFERRAL_REWARD_CENTS,
    });
    expect(firestore.getDoc('ReferralRewards', 'referral_inviter_4_new_user_4')).toMatchObject({
      amountCents: REFERRAL_REWARD_CENTS,
    });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects self-referrals before any transaction work begins', async () => {
    const firestore = createMockFirestore({
      BillingContexts: {
        inviter_5: {
          userId: 'inviter_5',
          walletBalanceCents: 900,
          totalReferralRewards: 1,
        },
      },
    });

    const result = await creditReferralReward(firestore.db as never, 'inviter_5', 'inviter_5');

    expect(result).toEqual({
      success: false,
      newBalanceCents: 0,
      error: 'Cannot reward self-referral',
    });
    expect(firestore.getTransactionCount()).toBe(0);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
