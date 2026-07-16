import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RosterEntryStatus } from '@nxt1/core/models';

const {
  assertCanMutateOwnSportsMock,
  provisionOnboardingProgramsMock,
  getActiveOrPendingRosterEntryMock,
  removeFromTeamMock,
  syncUserProfileToRosterEntriesMock,
  notifyMembershipRemovedMock,
  notifyTeamJoinedMock,
  invalidateProfileCachesMock,
} = vi.hoisted(() => ({
  assertCanMutateOwnSportsMock: vi.fn().mockResolvedValue(undefined),
  provisionOnboardingProgramsMock: vi.fn(),
  getActiveOrPendingRosterEntryMock: vi.fn(),
  removeFromTeamMock: vi.fn().mockResolvedValue(undefined),
  syncUserProfileToRosterEntriesMock: vi.fn().mockResolvedValue(undefined),
  notifyMembershipRemovedMock: vi.fn().mockResolvedValue(undefined),
  notifyTeamJoinedMock: vi.fn().mockResolvedValue(undefined),
  invalidateProfileCachesMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../middleware/auth/auth.middleware.js', () => ({
  appGuard: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { uid: 'athlete-1' } as never;
    next();
  },
}));

vi.mock('../../services/profile/profile-sport-governance.service.js', () => ({
  assertCanMutateOwnSports: assertCanMutateOwnSportsMock,
}));

vi.mock('../../services/platform/onboarding-program-provisioning.service.js', () => ({
  provisionOnboardingPrograms: provisionOnboardingProgramsMock,
}));

vi.mock('../../services/team/roster-entry.service.js', () => ({
  createRosterEntryService: vi.fn(() => ({
    getActiveOrPendingRosterEntry: getActiveOrPendingRosterEntryMock,
    removeFromTeam: removeFromTeamMock,
    syncUserProfileToRosterEntries: syncUserProfileToRosterEntriesMock,
  })),
}));

vi.mock('../../services/communications/team-join-notifications.js', () => ({
  notifyMembershipRemoved: notifyMembershipRemovedMock,
  notifyTeamJoined: notifyTeamJoinedMock,
}));

vi.mock('../profile/shared.js', () => ({
  USERS_COLLECTION: 'Users',
  FieldValue: {
    serverTimestamp: () => ({ __type: 'serverTimestamp' }),
  },
  invalidateProfileCaches: invalidateProfileCachesMock,
  generateUniqueTeamCode: vi.fn(),
  docToUser: vi.fn(),
}));

const { default: profileMutationRoutes } = await import('../profile/mutations.routes.js');

type SeedData = Record<string, Record<string, Record<string, unknown>>>;

function createDb(seed: SeedData) {
  return {
    collection: (collectionName: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          id,
          exists: seed[collectionName]?.[id] !== undefined,
          data: () => {
            const data = seed[collectionName]?.[id];
            return data ? { ...data } : undefined;
          },
        }),
        update: async (data: Record<string, unknown>) => {
          const existing = seed[collectionName]?.[id] ?? {};
          seed[collectionName] = seed[collectionName] ?? {};
          seed[collectionName][id] = { ...existing, ...data };
        },
      }),
    }),
  };
}

function buildApp(seed: SeedData) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.firebase = { db: createDb(seed) as never } as never;
    req.isStaging = false;
    next();
  });
  app.use('/api/v1/profile', profileMutationRoutes);
  return app;
}

describe('PUT /api/v1/profile/:userId/sport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCanMutateOwnSportsMock.mockResolvedValue(undefined);
    removeFromTeamMock.mockResolvedValue(undefined);
    syncUserProfileToRosterEntriesMock.mockResolvedValue(undefined);
    notifyMembershipRemovedMock.mockResolvedValue(undefined);
    notifyTeamJoinedMock.mockResolvedValue(undefined);
    invalidateProfileCachesMock.mockResolvedValue(undefined);
  });

  it('removes the previous roster entry and sends a fallback admin notification on team change', async () => {
    provisionOnboardingProgramsMock.mockResolvedValue({
      teamIds: ['team-new'],
      createdTeamIds: [],
      organizationIds: ['org-1'],
      sportTeamMap: new Map([
        ['football', { teamId: 'team-new', organizationId: 'org-1', orgName: 'New Team' }],
      ]),
      membershipTransitions: [],
    });
    getActiveOrPendingRosterEntryMock.mockImplementation(
      async (_userId: string, teamId: string) => {
        if (teamId === 'team-old') {
          return {
            id: 'entry-old',
            sport: 'Football',
            status: RosterEntryStatus.ACTIVE,
          };
        }

        if (teamId === 'team-new') {
          return {
            id: 'entry-new',
            sport: 'Football',
            status: RosterEntryStatus.PENDING,
          };
        }

        return null;
      }
    );

    const app = buildApp({
      Users: {
        'athlete-1': {
          role: 'athlete',
          firstName: 'Ava',
          lastName: 'Runner',
          displayName: 'Ava Runner',
          profileImgs: ['https://cdn.test/ava.png'],
          sports: [
            {
              sport: 'Football',
              order: 0,
              team: { teamId: 'team-old', organizationId: 'org-legacy', name: 'Old Team' },
            },
          ],
        },
      },
      Teams: {
        'team-new': { teamName: 'New Team' },
      },
    });

    const response = await request(app)
      .put('/api/v1/profile/athlete-1/sport')
      .send({
        sportIndex: 0,
        updates: {
          sport: 'Football',
          teamSelection: {
            teams: [
              { id: 'org-1', organizationId: 'org-1', name: 'New Team', teamType: 'high-school' },
            ],
          },
        },
      });

    expect(response.status).toBe(200);
    expect(removeFromTeamMock).toHaveBeenCalledWith('entry-old');
    expect(syncUserProfileToRosterEntriesMock).toHaveBeenCalled();
    expect(notifyTeamJoinedMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamId: 'team-new',
        organizationId: 'org-1',
        joinerUid: 'athlete-1',
        joinerName: 'Ava Runner',
        pending: true,
      })
    );
  });

  it('does not remove or re-notify when the selected team is unchanged', async () => {
    provisionOnboardingProgramsMock.mockResolvedValue({
      teamIds: ['team-old'],
      createdTeamIds: [],
      organizationIds: ['org-1'],
      sportTeamMap: new Map([
        ['football', { teamId: 'team-old', organizationId: 'org-1', orgName: 'Same Team' }],
      ]),
      membershipTransitions: [],
    });
    getActiveOrPendingRosterEntryMock.mockResolvedValue({
      id: 'entry-old',
      sport: 'Football',
      status: RosterEntryStatus.ACTIVE,
    });

    const app = buildApp({
      Users: {
        'athlete-1': {
          role: 'athlete',
          firstName: 'Ava',
          lastName: 'Runner',
          displayName: 'Ava Runner',
          sports: [
            {
              sport: 'Football',
              order: 0,
              team: { teamId: 'team-old', organizationId: 'org-1', name: 'Same Team' },
            },
          ],
        },
      },
      Teams: {
        'team-old': { teamName: 'Same Team' },
      },
    });

    const response = await request(app)
      .put('/api/v1/profile/athlete-1/sport')
      .send({
        sportIndex: 0,
        updates: {
          sport: 'Football',
          teamSelection: {
            teams: [
              { id: 'org-1', organizationId: 'org-1', name: 'Same Team', teamType: 'high-school' },
            ],
          },
        },
      });

    expect(response.status).toBe(200);
    expect(removeFromTeamMock).not.toHaveBeenCalled();
    expect(notifyTeamJoinedMock).not.toHaveBeenCalled();
  });
});
