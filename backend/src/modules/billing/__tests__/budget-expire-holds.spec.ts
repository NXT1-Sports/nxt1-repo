import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: loggerMock,
}));

import { expireStaleHolds } from '../budget.service.js';

type CollectionName = 'AppConfig' | 'WalletHolds' | 'Wallets';
type StoredDoc = Record<string, unknown>;
type QueryOperator = '==' | '<=' | '<';

type MockDocRef = {
  readonly id: string;
  readonly path: string;
  get: () => Promise<{
    readonly exists: boolean;
    readonly id: string;
    readonly ref: MockDocRef;
    data: () => StoredDoc | undefined;
  }>;
};

type TransactionOperation = {
  readonly type: 'update';
  readonly path: string;
  readonly payload: StoredDoc;
};

type QueryFilter = {
  readonly field: string;
  readonly operator: QueryOperator;
  readonly value: unknown;
};

function compareValues(left: unknown, operator: QueryOperator, right: unknown): boolean {
  if (operator === '==') {
    return left === right;
  }

  const leftMillis =
    left instanceof Timestamp ? left.toMillis() : left instanceof Date ? left.getTime() : left;
  const rightMillis =
    right instanceof Timestamp ? right.toMillis() : right instanceof Date ? right.getTime() : right;

  if (typeof leftMillis !== 'number' || typeof rightMillis !== 'number') {
    return false;
  }

  return operator === '<=' ? leftMillis <= rightMillis : leftMillis < rightMillis;
}

function createMockFirestore(seed: Partial<Record<CollectionName, Record<string, StoredDoc>>>) {
  const store = new Map<string, StoredDoc>();
  const transactionOperations: TransactionOperation[] = [];
  const transactionReadOrder: string[] = [];
  let transactionCount = 0;
  let readAfterWriteViolationCount = 0;

  for (const [collectionName, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs ?? {})) {
      store.set(`${collectionName}/${id}`, { ...data });
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
  });

  const createQuery = (
    collectionName: string,
    filters: QueryFilter[] = [],
    limitCount?: number
  ): {
    where: (
      field: string,
      operator: QueryOperator,
      value: unknown
    ) => ReturnType<typeof createQuery>;
    limit: (count: number) => ReturnType<typeof createQuery>;
    get: () => Promise<{
      readonly docs: Array<{
        readonly id: string;
        readonly ref: MockDocRef;
        data: () => StoredDoc;
      }>;
    }>;
  } => ({
    where: (field, operator, value) =>
      createQuery(collectionName, [...filters, { field, operator, value }], limitCount),
    limit: (count) => createQuery(collectionName, filters, count),
    get: async () => {
      const docs = Array.from(store.entries())
        .filter(([path, data]) => {
          if (!path.startsWith(`${collectionName}/`)) return false;
          return filters.every((filter) =>
            compareValues(data[filter.field], filter.operator, filter.value)
          );
        })
        .slice(0, limitCount)
        .map(([path, data]) => {
          const id = path.slice(collectionName.length + 1);
          return {
            id,
            ref: createDocRef(collectionName, id),
            data: () => data,
          };
        });

      return { docs };
    },
  });

  const db = {
    collection: (collectionName: string) => ({
      doc: (id: string) => createDocRef(collectionName, id),
      where: (field: string, operator: QueryOperator, value: unknown) =>
        createQuery(collectionName).where(field, operator, value),
    }),
    runTransaction: async <T>(
      callback: (txn: {
        get: (ref: MockDocRef) => ReturnType<MockDocRef['get']>;
        update: (ref: MockDocRef, payload: StoredDoc) => void;
      }) => Promise<T>
    ): Promise<T> => {
      transactionCount += 1;
      let hasWritten = false;
      const operations: TransactionOperation[] = [];

      const result = await callback({
        get: (ref) => {
          if (hasWritten) {
            readAfterWriteViolationCount += 1;
            throw new Error(
              'Firestore transactions require all reads to be executed before all writes.'
            );
          }

          transactionReadOrder.push(ref.path);
          return ref.get();
        },
        update: (ref, payload) => {
          hasWritten = true;
          operations.push({ type: 'update', path: ref.path, payload: { ...payload } });
        },
      });

      for (const operation of operations) {
        transactionOperations.push(operation);
        const existing = store.get(operation.path) ?? {};
        store.set(operation.path, { ...existing, ...operation.payload });
      }

      return result;
    },
  };

  return {
    db,
    getDoc: (collectionName: CollectionName, id: string) => store.get(`${collectionName}/${id}`),
    getTransactionCount: () => transactionCount,
    getTransactionOperations: () => transactionOperations,
    getTransactionReadOrder: () => transactionReadOrder,
    getReadAfterWriteViolationCount: () => readAfterWriteViolationCount,
  };
}

describe('expireStaleHolds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads all wallet documents before writing expired holds for multiple owners', async () => {
    const staleTimestamp = Timestamp.fromMillis(Date.now() - 20 * 60 * 1000);
    const firestore = createMockFirestore({
      Wallets: {
        user_1: {
          ownerId: 'user_1',
          ownerType: 'individual',
          pendingHoldsCents: 500,
        },
        'org:org_1': {
          ownerId: 'org_1',
          ownerType: 'organization',
          pendingHoldsCents: 800,
        },
      },
      WalletHolds: {
        hold_user_1: {
          userId: 'user_1',
          ownerId: 'user_1',
          ownerType: 'individual',
          amountCents: 500,
          status: 'active',
          createdAt: staleTimestamp,
          expiresAt: staleTimestamp,
        },
        hold_org_1: {
          userId: 'user_2',
          ownerId: 'org_1',
          ownerType: 'organization',
          organizationId: 'org_1',
          amountCents: 800,
          status: 'active',
          createdAt: staleTimestamp,
          expiresAt: staleTimestamp,
        },
      },
    });

    const result = await expireStaleHolds(firestore.db as never);

    expect(result).toBe(2);
    expect(firestore.getTransactionCount()).toBe(1);
    expect(firestore.getReadAfterWriteViolationCount()).toBe(0);
    expect(firestore.getTransactionReadOrder()).toEqual(['Wallets/user_1', 'Wallets/org:org_1']);
    expect(firestore.getDoc('WalletHolds', 'hold_user_1')).toMatchObject({ status: 'expired' });
    expect(firestore.getDoc('WalletHolds', 'hold_org_1')).toMatchObject({ status: 'expired' });
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});
