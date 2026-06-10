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
    collection: (name: string) => {
      if (name === 'Teams') {
        return {
          where: () => query,
          doc: () => ({ update: async () => undefined }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };
}

function createLegacyImportedTeamDb() {
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
    collection: (name: string) => {
      if (name === 'Teams') {
        return createQuery();
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
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
});
