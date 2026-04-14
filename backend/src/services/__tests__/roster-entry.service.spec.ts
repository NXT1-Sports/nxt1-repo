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
  readonly ref?: MockDocRef;
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
    ref: createDocRef('RosterEntries', id),
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
    where: (field: string, op: string, value: unknown) =>
      buildRosterQuery([...filters, { field, op, value }]),
    limit: (_count: number) => ({
      get: async () => buildRosterQuery(filters).get(),
    }),
  });

  const db = {
    batch: () => {
      const operations: Array<() => Promise<void>> = [];

      return {
        update: (ref: MockDocRef, payload: Record<string, unknown>) => {
          operations.push(() => ref.update(payload));
        },
        commit: async () => {
          await Promise.all(operations.map((operation) => operation()));
        },
      };
    },
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
        sport: 'Basketball',
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
      sport: 'Basketball',
      title: 'Head Coach',
      status: RosterEntryStatus.ACTIVE,
      displayName: 'Pat Summitt',
    });
    expect(payload).not.toHaveProperty('positions');
    expect(result.sport).toBe('Basketball');
    expect(result.title).toBe('Head Coach');
    expect(result.displayName).toBe('Pat Summitt');
  });

  it('writes sport and positions for athlete roster entries', async () => {
    const { db } = createMockFirestore();
    const service = new RosterEntryService(db as never);
    const batch = {
      set: vi.fn(),
      update: vi.fn(),
    };

    await service.createRosterEntry(
      {
        userId: 'athlete-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'athlete',
        sport: 'Football',
        positions: ['QB', 'QB', ' Safety '],
        status: RosterEntryStatus.PENDING,
        firstName: 'Peyton',
        lastName: 'Manning',
      },
      batch as never
    );

    const payload = batch.set.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      role: 'athlete',
      sport: 'Football',
      positions: ['QB', 'Safety'],
      status: RosterEntryStatus.PENDING,
      displayName: 'Peyton Manning',
    });
  });

  it('updates cached displayName across roster entries', async () => {
    const { db, rosterEntries } = createMockFirestore({
      'entry-1': {
        userId: 'user-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'coach',
        status: RosterEntryStatus.ACTIVE,
        firstName: 'Pat',
        lastName: 'Summitt',
        displayName: 'Pat Summitt',
        joinedAt: new Date().toISOString(),
      },
    });
    const service = new RosterEntryService(db as never);

    await service.updateCachedUserData('user-1', {
      firstName: 'Patricia',
      lastName: 'Summitt',
      displayName: 'Coach Summitt',
    });

    expect(rosterEntries.get('entry-1')).toMatchObject({
      firstName: 'Patricia',
      lastName: 'Summitt',
      displayName: 'Coach Summitt',
    });
  });

  it('syncs cached roster fields and athlete sport data from a user profile document', async () => {
    const { db, rosterEntries } = createMockFirestore({
      'entry-1': {
        userId: 'athlete-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'athlete',
        sport: 'Football',
        positions: ['QB'],
        jerseyNumber: '12',
        status: RosterEntryStatus.ACTIVE,
        joinedAt: new Date().toISOString(),
      },
      'entry-2': {
        userId: 'athlete-1',
        teamId: 'team-2',
        organizationId: 'org-1',
        role: 'athlete',
        sport: 'Baseball',
        positions: ['P'],
        jerseyNumber: '8',
        status: RosterEntryStatus.ACTIVE,
        joinedAt: new Date().toISOString(),
      },
    });
    const service = new RosterEntryService(db as never);

    await service.syncUserProfileToRosterEntries('athlete-1', {
      role: 'athlete',
      firstName: 'Peyton',
      lastName: 'Manning',
      displayName: 'Peyton Manning',
      email: 'peyton@test.com',
      contact: { phone: '555-111-2222' },
      profileImgs: ['https://cdn.test/avatar.jpg'],
      classOf: 2028,
      athlete: { academics: { gpa: 3.9 } },
      measurables: [
        { field: 'height', value: '6\'4"' },
        { field: 'weight', value: '225' },
      ],
      sports: [
        {
          sport: 'Football',
          positions: ['QB', ' Safety '],
          jerseyNumber: '18',
          order: 0,
        },
      ],
    });

    expect(rosterEntries.get('entry-1')).toMatchObject({
      firstName: 'Peyton',
      lastName: 'Manning',
      displayName: 'Peyton Manning',
      email: 'peyton@test.com',
      phoneNumber: '555-111-2222',
      profileImgs: ['https://cdn.test/avatar.jpg'],
      classOf: 2028,
      gpa: 3.9,
      height: '6\'4"',
      weight: '225',
      positions: ['QB', 'Safety'],
      jerseyNumber: '18',
    });
    expect(rosterEntries.get('entry-2')).not.toHaveProperty('positions');
    expect(rosterEntries.get('entry-2')).not.toHaveProperty('jerseyNumber');
  });

  it('syncs team sport changes across roster entries', async () => {
    const { db, rosterEntries } = createMockFirestore({
      'entry-1': {
        userId: 'coach-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'coach',
        sport: 'Football',
        status: RosterEntryStatus.ACTIVE,
        joinedAt: new Date().toISOString(),
      },
      'entry-2': {
        userId: 'athlete-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'athlete',
        sport: 'Football',
        status: RosterEntryStatus.ACTIVE,
        joinedAt: new Date().toISOString(),
      },
    });
    const service = new RosterEntryService(db as never);

    await service.syncTeamSport('team-1', 'Basketball');

    expect(rosterEntries.get('entry-1')).toMatchObject({ sport: 'Basketball' });
    expect(rosterEntries.get('entry-2')).toMatchObject({ sport: 'Basketball' });
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

  it('removes positions when a roster entry is updated to a non-athlete role', async () => {
    const { db } = createMockFirestore({
      'entry-1': {
        userId: 'user-1',
        teamId: 'team-1',
        organizationId: 'org-1',
        role: 'athlete',
        sport: 'Football',
        positions: ['QB'],
        status: RosterEntryStatus.ACTIVE,
        joinedAt: new Date().toISOString(),
      },
    });
    const service = new RosterEntryService(db as never);

    const result = await service.updateRosterEntry('entry-1', {
      role: 'coach',
      title: 'Assistant Coach',
      positions: ['QB'],
    });

    expect(result.role).toBe('coach');
    expect(result.title).toBe('Assistant Coach');
    expect(result.positions).toEqual([]);
  });
});
