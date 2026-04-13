import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheDel = vi.fn(async () => undefined);

vi.mock('../cache.service.js', () => ({
  getCacheService: () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    del: cacheDel,
  }),
}));

import { RosterEntryStatus } from '@nxt1/core/models';
import { RosterEntryService } from '../roster-entry.service.js';

type MockSnapshot = {
  readonly exists: boolean;
  readonly id: string;
  readonly empty?: boolean;
  readonly docs?: MockSnapshot[];
  readonly data: () => Record<string, unknown> | undefined;
};

type MockDocRef = {
  readonly id: string;
  get: () => Promise<MockSnapshot>;
  set: (payload: Record<string, unknown>) => Promise<void>;
  update: (payload: Record<string, unknown>) => Promise<void>;
};

function isDeleteTransform(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && value.constructor?.name === 'DeleteTransform'
  );
}

function applyUpdate(
  current: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...current };

  for (const [key, value] of Object.entries(payload)) {
    if (isDeleteTransform(value)) {
      delete next[key];
      continue;
    }

    next[key] = value;
  }

  return next;
}

function createMockFirestore(initialRosterEntries?: Record<string, Record<string, unknown>>) {
  const rosterEntries = new Map(Object.entries(initialRosterEntries ?? {}));

  const createDocSnapshot = (id: string, data?: Record<string, unknown>): MockSnapshot => ({
    exists: data !== undefined,
    id,
    data: () => data,
  });

  const createDocRef = (collectionName: string, id: string): MockDocRef => ({
    id,
    get: async () => createDocSnapshot(id, rosterEntries.get(id)),
    set: async (payload) => {
      if (collectionName === 'RosterEntries') {
        rosterEntries.set(id, applyUpdate({}, payload));
      }
    },
    update: async (payload) => {
      if (collectionName === 'RosterEntries') {
        const existing = rosterEntries.get(id) ?? {};
        rosterEntries.set(id, applyUpdate(existing, payload));
      }
    },
  });

  const buildRosterQuery = (filters: Array<{ field: string; op: string; value: unknown }>) => ({
    where: (field: string, op: string, value: unknown) =>
      buildRosterQuery([...filters, { field, op, value }]),
    limit: (_count: number) => ({
      get: async () => {
        const docs = [...rosterEntries.entries()]
          .filter(([, data]) =>
            filters.every(({ field, op, value }) => {
              if (op === '==') {
                return data[field] === value;
              }
              if (op === 'in' && Array.isArray(value)) {
                return value.includes(data[field]);
              }
              return false;
            })
          )
          .map(([id, data]) => createDocSnapshot(id, data));

        return {
          empty: docs.length === 0,
          docs,
        };
      },
    }),
  });

  const db = {
    collection: (name: string) => {
      if (name === 'RosterEntries') {
        return {
          doc: (id?: string) => createDocRef(name, id ?? 'entry-created'),
          where: (field: string, op: string, value: unknown) =>
            buildRosterQuery([{ field, op, value }]),
        };
      }

      if (name === 'Teams') {
        return {
          doc: (id: string) => ({ id }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };

  return {
    db,
    rosterEntries,
  };
}

describe('RosterEntryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes staff title for non-athlete roster entries', async () => {
    const { db } = createMockFirestore();
    const service = new RosterEntryService(db as never);
    const batch = {
      set: vi.fn(),
      update: vi.fn(),
    };

    const result = await service.createRosterEntry(
      {
        userId: 'coach-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'coach',
        title: 'Head Coach',
        status: RosterEntryStatus.ACTIVE,
        firstName: 'Pat',
        lastName: 'Summitt',
      },
      batch as never
    );

    const payload = batch.set.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      role: 'coach',
      title: 'Head Coach',
      status: RosterEntryStatus.ACTIVE,
    });
    expect(payload).not.toHaveProperty('positions');
    expect(result.title).toBe('Head Coach');
  });

  it('updates stored title for an existing roster entry', async () => {
    const { db } = createMockFirestore({
      'entry-1': {
        userId: 'coach-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'coach',
        title: 'Assistant Coach',
        status: RosterEntryStatus.ACTIVE,
        joinedAt: new Date().toISOString(),
        firstName: 'Pat',
        lastName: 'Summitt',
      },
    });
    const service = new RosterEntryService(db as never);

    const result = await service.updateRosterEntry('entry-1', {
      role: 'coach',
      title: 'Head Coach',
      status: RosterEntryStatus.ACTIVE,
    });

    expect(result.title).toBe('Head Coach');
  });
});
