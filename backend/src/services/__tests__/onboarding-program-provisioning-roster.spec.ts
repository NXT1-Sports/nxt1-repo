import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addAdminMock,
  incrementTeamCountMock,
  getActiveOrPendingRosterEntryMock,
  createRosterEntryMock,
  updateRosterEntryMock,
} = vi.hoisted(() => ({
  addAdminMock: vi.fn(async () => undefined),
  incrementTeamCountMock: vi.fn(async () => undefined),
  getActiveOrPendingRosterEntryMock: vi.fn(async () => null),
  createRosterEntryMock: vi.fn(async () => undefined),
  updateRosterEntryMock: vi.fn(async () => undefined),
}));

vi.mock('../organization.service.js', () => ({
  createOrganizationService: () => ({
    addAdmin: addAdminMock,
    getOrganizationById: vi.fn(async () => ({ admins: [] })),
    incrementTeamCount: incrementTeamCountMock,
  }),
}));

vi.mock('../roster-entry.service.js', () => ({
  createRosterEntryService: () => ({
    getActiveOrPendingRosterEntry: getActiveOrPendingRosterEntryMock,
    createRosterEntry: createRosterEntryMock,
    updateRosterEntry: updateRosterEntryMock,
  }),
}));

vi.mock('../team-code.service.js', () => ({
  getTeamCodeByCode: vi.fn(async () => ({ team: null })),
  createTeamCode: vi.fn(async () => ({ id: 'created-team' })),
}));

vi.mock('../name-normalizer.service.js', () => ({
  normalizeProgramName: vi.fn(async (value: string) => value),
}));

import { RosterEntryStatus } from '@nxt1/core/models';
import { provisionOnboardingPrograms } from '../onboarding-program-provisioning.service.js';

function createMockDb() {
  const existingTeamDoc = {
    id: 'team-1',
    data: () => ({ organizationId: 'org-1' }),
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

describe('provisionOnboardingPrograms roster sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        title: 'Head Coach',
        status: RosterEntryStatus.ACTIVE,
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
        title: 'Head Coach',
        status: RosterEntryStatus.ACTIVE,
      })
    );
    expect(createRosterEntryMock).not.toHaveBeenCalled();
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
});
