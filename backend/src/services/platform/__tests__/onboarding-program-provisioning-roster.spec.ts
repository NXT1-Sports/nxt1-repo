import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addAdminMock,
  createOrganizationMock,
  incrementTeamCountMock,
  getTeamCodeByCodeMock,
  createTeamCodeMock,
  initOrganizationBillingTargetForUserMock,
  getActiveOrPendingRosterEntryMock,
  createRosterEntryMock,
  updateRosterEntryMock,
} = vi.hoisted(() => ({
  addAdminMock: vi.fn(async () => undefined),
  createOrganizationMock: vi.fn(async () => ({ id: 'org-created', name: 'Created Org' })),
  incrementTeamCountMock: vi.fn(async () => undefined),
  getTeamCodeByCodeMock: vi.fn(async () => ({ team: null })),
  createTeamCodeMock: vi.fn(async () => ({ id: 'created-team' })),
  initOrganizationBillingTargetForUserMock: vi.fn(async () => undefined),
  getActiveOrPendingRosterEntryMock: vi.fn(async () => null),
  createRosterEntryMock: vi.fn(async () => undefined),
  updateRosterEntryMock: vi.fn(async () => undefined),
}));

vi.mock('../../team/organization.service.js', () => ({
  createOrganizationService: () => ({
    addAdmin: addAdminMock,
    createOrganization: createOrganizationMock,
    incrementTeamCount: incrementTeamCountMock,
  }),
}));

vi.mock('../../team/roster-entry.service.js', () => ({
  createRosterEntryService: () => ({
    getActiveOrPendingRosterEntry: getActiveOrPendingRosterEntryMock,
    createRosterEntry: createRosterEntryMock,
    updateRosterEntry: updateRosterEntryMock,
  }),
}));

vi.mock('../../team/team-code.service.js', () => ({
  getTeamCodeByCode: getTeamCodeByCodeMock,
  createTeamCode: createTeamCodeMock,
  buildTeamSlug: (teamName: string) =>
    teamName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, ''),
}));

vi.mock('../../core/name-normalizer.service.js', () => ({
  normalizeProgramName: vi.fn(async (value: string) => value),
}));

vi.mock('../../../modules/billing/budget.service.js', () => ({
  initOrganizationBillingTargetForUser: initOrganizationBillingTargetForUserMock,
}));

import { RosterEntryStatus } from '@nxt1/core/models';
import { provisionOnboardingPrograms } from '../onboarding-program-provisioning.service.js';

function createMockDb() {
  const lockDocs = new Map<string, Record<string, unknown>>();
  const existingTeamDoc = {
    id: 'team-1',
    data: () => ({ organizationId: 'org-1', sport: 'Football', level: '', isActive: true }),
  };

  const query = {
    where: () => query,
    limit: () => ({
      get: async () => ({
        empty: false,
        docs: [existingTeamDoc],
      }),
    }),
    get: async () => ({
      empty: false,
      docs: [existingTeamDoc],
    }),
  };

  return {
    runTransaction: async <T>(
      callback: (transaction: {
        get: (target: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (
          ref: { set: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => void;
        update: (
          ref: { update: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => void;
      }) => Promise<T>
    ) => {
      const writes: Array<() => Promise<void>> = [];
      const transaction = {
        get: async (target: { get: () => Promise<unknown> }) => target.get(),
        set: (
          ref: { set: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => {
          writes.push(() => ref.set(value));
        },
        update: (
          ref: { update: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => {
          writes.push(() => ref.update(value));
        },
      };
      const result = await callback(transaction);
      for (const write of writes) {
        await write();
      }
      return result;
    },
    collection: (name: string) => {
      if (name === 'Teams') {
        return {
          where: () => query,
          doc: () => ({ update: async () => undefined }),
        };
      }

      if (name === 'Organizations') {
        return {
          doc: () => ({ update: async () => undefined }),
          where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
        };
      }

      if (name === 'ProvisioningLocks') {
        return {
          doc: (id: string) => ({
            get: async () => ({ exists: lockDocs.has(id), data: () => lockDocs.get(id) }),
            set: async (value: Record<string, unknown>) => {
              lockDocs.set(id, value);
            },
          }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

function createLegacyImportedTeamDb() {
  const lockDocs = new Map<string, Record<string, unknown>>();
  const legacyTeamDoc = {
    id: 'legacy-akron-east-football',
    data: () => ({
      organizationId: 'org-1',
      teamName: 'Akron East',
      sport: 'football',
      level: null,
      isActive: true,
      source: 'import',
    }),
  };

  const createQuery = (filters: Array<{ field: string; value: unknown }> = []) => ({
    where: (field: string, _op: string, value: unknown) =>
      createQuery([...filters, { field, value }]),
    get: async () => {
      const hasExactSportQuery = filters.some(
        (filter) => filter.field === 'sport' && filter.value === 'Football'
      );
      const hasExactSportNameQuery = filters.some(
        (filter) => filter.field === 'sportName' && filter.value === 'Football'
      );
      const hasOrgQuery = filters.some(
        (filter) => filter.field === 'organizationId' && filter.value === 'org-1'
      );

      if (hasExactSportQuery || hasExactSportNameQuery || !hasOrgQuery) {
        return { empty: true, docs: [] };
      }

      return { empty: false, docs: [legacyTeamDoc] };
    },
  });

  return {
    runTransaction: async <T>(
      callback: (transaction: {
        get: (target: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (
          ref: { set: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => void;
        update: (
          ref: { update: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => void;
      }) => Promise<T>
    ) => {
      const writes: Array<() => Promise<void>> = [];
      const transaction = {
        get: async (target: { get: () => Promise<unknown> }) => target.get(),
        set: (
          ref: { set: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => {
          writes.push(() => ref.set(value));
        },
        update: (
          ref: { update: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => {
          writes.push(() => ref.update(value));
        },
      };
      const result = await callback(transaction);
      for (const write of writes) {
        await write();
      }
      return result;
    },
    collection: (name: string) => {
      if (name === 'Teams') {
        return {
          ...createQuery(),
          doc: () => ({ update: async () => undefined }),
        };
      }

      if (name === 'Organizations') {
        return {
          doc: () => ({ update: async () => undefined }),
          where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
        };
      }

      if (name === 'ProvisioningLocks') {
        return {
          doc: (id: string) => ({
            get: async () => ({ exists: lockDocs.has(id), data: () => lockDocs.get(id) }),
            set: async (value: Record<string, unknown>) => {
              lockDocs.set(id, value);
            },
          }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

function createDraftProvisioningDb() {
  const stores = {
    Organizations: new Map<string, Record<string, unknown>>(),
    Teams: new Map<string, Record<string, unknown>>(),
    ProvisioningLocks: new Map<string, Record<string, unknown>>(),
  };
  const counters = {
    Organizations: 0,
    Teams: 0,
  };
  let transactionChain = Promise.resolve();

  const matchesFilters = (
    data: Record<string, unknown>,
    filters: Array<{ field: string; op: string; value: unknown }>
  ) =>
    filters.every((filter) => {
      const currentValue = data[filter.field];
      if (filter.op === '==') {
        return currentValue === filter.value;
      }

      return false;
    });

  const createQuery = (
    name: keyof typeof stores,
    filters: Array<{ field: string; op: string; value: unknown }> = [],
    limitCount?: number
  ) => ({
    where: (field: string, op: string, value: unknown) =>
      createQuery(name, [...filters, { field, op, value }], limitCount),
    limit: (count: number) => createQuery(name, filters, count),
    get: async () => {
      const docs = Array.from(stores[name].entries())
        .filter(([, value]) => matchesFilters(value, filters))
        .slice(0, limitCount ?? Number.POSITIVE_INFINITY)
        .map(([id, value]) => ({
          id,
          exists: true,
          data: () => value,
          ref: createDocRef(name, id),
        }));

      return { empty: docs.length === 0, docs };
    },
  });

  const createDocRef = (name: keyof typeof stores, explicitId?: string) => {
    const id = explicitId ?? `${name === 'Organizations' ? 'org' : 'team'}-${++counters[name]}`;
    return {
      id,
      get: async () => ({
        exists: stores[name].has(id),
        id,
        data: () => stores[name].get(id),
        ref: createDocRef(name, id),
      }),
      set: async (value: Record<string, unknown>) => {
        stores[name].set(id, value);
      },
      update: async (value: Record<string, unknown>) => {
        const current = stores[name].get(id) ?? {};
        stores[name].set(id, { ...current, ...value });
      },
    };
  };

  return {
    stores,
    runTransaction: async <T>(
      callback: (transaction: {
        get: (target: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (
          ref: { set: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => void;
        update: (
          ref: { update: (value: Record<string, unknown>) => Promise<void> },
          value: Record<string, unknown>
        ) => void;
      }) => Promise<T>
    ) => {
      const execute = async () => {
        const writes: Array<() => Promise<void>> = [];
        const transaction = {
          get: async (target: { get: () => Promise<unknown> }) => target.get(),
          set: (
            ref: { set: (value: Record<string, unknown>) => Promise<void> },
            value: Record<string, unknown>
          ) => {
            writes.push(() => ref.set(value));
          },
          update: (
            ref: { update: (value: Record<string, unknown>) => Promise<void> },
            value: Record<string, unknown>
          ) => {
            writes.push(() => ref.update(value));
          },
        };
        const result = await callback(transaction);
        for (const write of writes) {
          await write();
        }
        return result;
      };

      transactionChain = transactionChain.then(execute, execute);
      return transactionChain;
    },
    collection: (name: keyof typeof stores) => ({
      ...createQuery(name),
      doc: (id?: string) => createDocRef(name, id),
    }),
  };
}

describe('provisionOnboardingPrograms roster sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses an imported team when onboarding sport casing differs', async () => {
    const db = createLegacyImportedTeamDb();

    const result = await provisionOnboardingPrograms({
      db: db as never,
      userId: 'coach-1',
      role: 'coach',
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: { type: 'high-school', name: 'Akron East', title: 'Head Coach' },
        },
      ],
      currentUser: { email: 'coach@test.com' },
      updateData: {
        firstName: 'Pat',
        lastName: 'Summitt',
        coachTitle: 'Head Coach',
      },
      teamSelection: {
        teams: [
          { id: 'org-1', name: 'Akron East', organizationId: 'org-1', teamType: 'high-school' },
        ],
      },
    });

    expect(result.teamIds).toEqual(['legacy-akron-east-football']);
    expect(result.createdTeamIds).toEqual([]);
    expect(result.membershipTransitions).toEqual([
      {
        teamId: 'legacy-akron-east-football',
        organizationId: 'org-1',
        sport: 'Football',
        pending: false,
      },
    ]);
    expect(createTeamCodeMock).not.toHaveBeenCalled();
    expect(incrementTeamCountMock).not.toHaveBeenCalled();
    expect(createRosterEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'legacy-akron-east-football',
        organizationId: 'org-1',
        sport: 'Football',
      })
    );
  });

  it('creates staff roster entries with coach title', async () => {
    const db = createMockDb();

    await provisionOnboardingPrograms({
      db: db as never,
      userId: 'coach-1',
      role: 'coach',
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: { type: 'high-school', name: 'Alcoa', title: 'Head Coach' },
        },
      ],
      currentUser: { email: 'coach@test.com' },
      updateData: {
        firstName: 'Pat',
        lastName: 'Summitt',
        coachTitle: 'Head Coach',
      },
      teamSelection: {
        teams: [{ id: 'org-1', name: 'Alcoa', organizationId: 'org-1', teamType: 'high-school' }],
      },
    });

    expect(createRosterEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'coach',
        sport: 'Football',
        title: 'Head Coach',
        status: RosterEntryStatus.ACTIVE,
        displayName: 'Pat Summitt',
      })
    );
    expect(createRosterEntryMock.mock.calls[0]?.[0]).not.toHaveProperty('positions');
    expect(addAdminMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'coach-1',
      role: 'coach',
      addedBy: 'coach-1',
    });
  });

  it('creates athlete roster entries with sport-matched positions only', async () => {
    const db = createMockDb();

    await provisionOnboardingPrograms({
      db: db as never,
      userId: 'athlete-1',
      role: 'athlete',
      sports: [
        {
          sport: 'Football',
          order: 0,
          positions: ['QB', 'Safety'],
          team: { type: 'high-school', name: 'Alcoa' },
        },
      ],
      currentUser: { email: 'athlete@test.com' },
      updateData: {
        firstName: 'Peyton',
        lastName: 'Manning',
        athlete: { classOf: 2028 },
      },
      teamSelection: {
        teams: [{ id: 'org-1', name: 'Alcoa', organizationId: 'org-1', teamType: 'high-school' }],
      },
    });

    expect(createRosterEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'athlete',
        sport: 'Football',
        positions: ['QB', 'Safety'],
        status: RosterEntryStatus.PENDING,
        displayName: 'Peyton Manning',
      })
    );
  });

  it('updates an existing roster entry title on onboarding retry', async () => {
    const db = createMockDb();
    getActiveOrPendingRosterEntryMock.mockResolvedValueOnce({
      id: 'entry-1',
      userId: 'coach-1',
      teamId: 'team-1',
      organizationId: 'org-1',
      role: 'coach',
      title: 'Assistant Coach',
      status: RosterEntryStatus.ACTIVE,
      joinedAt: new Date().toISOString(),
    });

    await provisionOnboardingPrograms({
      db: db as never,
      userId: 'coach-1',
      role: 'coach',
      sports: [
        {
          sport: 'Football',
          order: 0,
          team: { type: 'high-school', name: 'Alcoa', title: 'Head Coach' },
        },
      ],
      currentUser: { email: 'coach@test.com' },
      updateData: {
        firstName: 'Pat',
        lastName: 'Summitt',
        coachTitle: 'Head Coach',
      },
      teamSelection: {
        teams: [{ id: 'org-1', name: 'Alcoa', organizationId: 'org-1', teamType: 'high-school' }],
      },
    });

    expect(updateRosterEntryMock).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({
        role: 'coach',
        sport: 'Football',
        title: 'Head Coach',
        status: RosterEntryStatus.ACTIVE,
      })
    );
    expect(createRosterEntryMock).not.toHaveBeenCalled();
  });

  it('returns only newly created membership transitions for athlete onboarding', async () => {
    const db = createMockDb();

    const result = await provisionOnboardingPrograms({
      db: db as never,
      userId: 'athlete-1',
      role: 'athlete',
      sports: [
        {
          sport: 'Football',
          order: 0,
          positions: ['QB'],
          team: { type: 'high-school', name: 'Alcoa' },
        },
      ],
      currentUser: { email: 'athlete@test.com' },
      updateData: {
        firstName: 'Peyton',
        lastName: 'Manning',
      },
      teamSelection: {
        teams: [{ id: 'org-1', name: 'Alcoa', organizationId: 'org-1', teamType: 'high-school' }],
      },
    });

    expect(result.membershipTransitions).toEqual([
      {
        teamId: 'team-1',
        organizationId: 'org-1',
        sport: 'Football',
        pending: true,
      },
    ]);
  });

  it('fails provisioning when roster synchronization fails', async () => {
    const db = createMockDb();
    createRosterEntryMock.mockRejectedValueOnce(new Error('roster write failed'));

    await expect(
      provisionOnboardingPrograms({
        db: db as never,
        userId: 'coach-1',
        role: 'coach',
        sports: [
          {
            sport: 'Football',
            order: 0,
            team: { type: 'high-school', name: 'Alcoa', title: 'Head Coach' },
          },
        ],
        currentUser: { email: 'coach@test.com' },
        updateData: {
          firstName: 'Pat',
          lastName: 'Summitt',
          coachTitle: 'Head Coach',
        },
        teamSelection: {
          teams: [{ id: 'org-1', name: 'Alcoa', organizationId: 'org-1', teamType: 'high-school' }],
        },
      })
    ).rejects.toThrow('roster write failed');
  });

  it('does not assign org admins during athlete onboarding', async () => {
    const db = createMockDb();

    await provisionOnboardingPrograms({
      db: db as never,
      userId: 'athlete-1',
      role: 'athlete',
      sports: [
        {
          sport: 'Football',
          order: 0,
          positions: ['QB'],
          team: { type: 'high-school', name: 'Alcoa' },
        },
      ],
      currentUser: { email: 'athlete@test.com' },
      updateData: {
        firstName: 'Peyton',
        lastName: 'Manning',
      },
      teamSelection: {
        teams: [{ id: 'org-1', name: 'Alcoa', organizationId: 'org-1', teamType: 'high-school' }],
      },
    });

    expect(addAdminMock).not.toHaveBeenCalled();
  });

  it('reuses the same draft organization and team across concurrent provisioning calls', async () => {
    const db = createDraftProvisioningDb();

    const createInput = () => ({
      db: db as never,
      userId: 'athlete-1',
      role: 'athlete' as const,
      sports: [
        {
          sport: 'Football',
          order: 0,
          positions: ['QB'],
          team: { type: 'high-school', name: 'North Dallas' },
        },
      ],
      currentUser: { email: 'athlete@test.com' },
      updateData: {
        firstName: 'Peyton',
        lastName: 'Manning',
      },
      teamSelection: {
        teams: [
          {
            id: 'draft_north_dallas',
            name: 'North Dallas',
            teamType: 'high-school',
            isDraft: true,
          },
        ],
      },
      createTeamProfile: {
        programName: 'North Dallas',
        teamType: 'high-school',
      },
    });

    const [first, second] = await Promise.all([
      provisionOnboardingPrograms(createInput()),
      provisionOnboardingPrograms(createInput()),
    ]);

    expect(new Set([...first.organizationIds, ...second.organizationIds]).size).toBe(1);
    expect(new Set([...first.teamIds, ...second.teamIds]).size).toBe(1);
    expect(db.stores.Organizations.size).toBe(1);
    expect(db.stores.Teams.size).toBe(1);
  });
});
