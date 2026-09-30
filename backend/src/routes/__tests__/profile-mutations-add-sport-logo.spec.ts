import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assertCanMutateOwnSportsMock,
  provisionOnboardingProgramsMock,
  getActiveOrPendingRosterEntryMock,
  createRosterEntryMock,
  syncUserProfileToRosterEntriesMock,
  invalidateProfileCachesMock,
  createTeamCodeMock,
  invalidateOrgCacheMock,
} = vi.hoisted(() => ({
  assertCanMutateOwnSportsMock: vi.fn().mockResolvedValue(undefined),
  provisionOnboardingProgramsMock: vi.fn(),
  getActiveOrPendingRosterEntryMock: vi.fn().mockResolvedValue(null),
  createRosterEntryMock: vi.fn().mockResolvedValue({ id: 're-new' }),
  syncUserProfileToRosterEntriesMock: vi.fn().mockResolvedValue(undefined),
  invalidateProfileCachesMock: vi.fn().mockResolvedValue(undefined),
  createTeamCodeMock: vi.fn(),
  invalidateOrgCacheMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const authedUserId = 'coach-1';
vi.mock('../../middleware/auth/auth.middleware.js', () => ({
  appGuard: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { uid: authedUserId } as never;
    next();
  },
}));

vi.mock('../../services/profile/profile-sport-governance.service.js', () => ({
  assertCanMutateOwnSports: assertCanMutateOwnSportsMock,
}));

vi.mock('../../services/platform/onboarding-program-provisioning.service.js', () => ({
  provisionOnboardingPrograms: provisionOnboardingProgramsMock,
}));

vi.mock('../../services/team/team-code.service.js', () => ({
  createTeamCode: createTeamCodeMock,
  generateUniqueTeamCode: vi.fn().mockResolvedValue('NEWCODE1'),
}));

vi.mock('../../services/team/organization.service.js', () => ({
  createOrganizationService: vi.fn(() => ({
    invalidateCache: invalidateOrgCacheMock,
  })),
}));

vi.mock('../../services/team/roster-entry.service.js', () => ({
  createRosterEntryService: vi.fn(() => ({
    getActiveOrPendingRosterEntry: getActiveOrPendingRosterEntryMock,
    createRosterEntry: createRosterEntryMock,
    syncUserProfileToRosterEntries: syncUserProfileToRosterEntriesMock,
  })),
}));

vi.mock('../../services/communications/team-join-notifications.js', () => ({
  notifyMembershipRemoved: vi.fn().mockResolvedValue(undefined),
  notifyTeamJoined: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../profile/shared.js', () => ({
  USERS_COLLECTION: 'Users',
  FieldValue: {
    serverTimestamp: () => ({ __type: 'serverTimestamp' }),
    arrayUnion: (...elements: unknown[]) => ({ __type: 'arrayUnion', elements }),
  },
  invalidateProfileCaches: invalidateProfileCachesMock,
  generateUniqueTeamCode: vi.fn().mockResolvedValue('NEWCODE1'),
  docToUser: vi.fn(),
}));

const { default: profileMutationRoutes } = await import('../profile/mutations.routes.js');

type SeedData = Record<string, Record<string, Record<string, unknown>>>;

function createDb(seed: SeedData) {
  const batchUpdates: Array<() => void> = [];
  return {
    batch: () => ({
      update: (
        ref: { update: (data: Record<string, unknown>) => Promise<void> },
        data: Record<string, unknown>
      ) => {
        batchUpdates.push(() => {
          void ref.update(data);
        });
      },
      set: (
        ref: { set: (data: Record<string, unknown>) => Promise<void> },
        data: Record<string, unknown>
      ) => {
        batchUpdates.push(() => {
          void ref.set(data);
        });
      },
      commit: async () => {
        for (const fn of batchUpdates) fn();
      },
    }),
    collection: (col: string) => {
      const colObj: Record<string, unknown> = {
        doc: (id?: string) => {
          const docId = id ?? `auto-${Math.random().toString(36).substring(2, 9)}`;
          return {
            id: docId,
            get: async () => ({
              id: docId,
              exists: seed[col]?.[docId] !== undefined,
              data: () => (seed[col]?.[docId] ? { ...seed[col][docId] } : undefined),
            }),
            set: async (data: Record<string, unknown>) => {
              seed[col] = seed[col] ?? {};
              seed[col][docId] = { ...data };
            },
            update: async (data: Record<string, unknown>) => {
              seed[col] = seed[col] ?? {};
              seed[col][docId] = { ...(seed[col][docId] ?? {}), ...data };
            },
          };
        },
        where: (field: string, _op: string, val: unknown) => {
          const createQuery = (
            currentDocs: Array<{ id: string; data: () => Record<string, unknown> }>
          ) => {
            const filtered = currentDocs.filter((doc) => doc.data()[field] === val);
            const queryObj: Record<string, unknown> = {
              limit: () => queryObj,
              where: (nextField: string, _nextOp: string, nextVal: unknown) => {
                const nextDocs = filtered.filter((doc) => doc.data()[nextField] === nextVal);
                return createQuery(nextDocs);
              },
              get: async () => ({
                empty: filtered.length === 0,
                docs: filtered,
              }),
            };
            return queryObj;
          };
          const allDocs = Object.entries(seed[col] ?? {}).map(([id, d]) => ({
            id,
            data: () => ({ ...d }),
          }));
          return createQuery(allDocs);
        },
      };
      return colObj;
    },
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

describe('POST /api/v1/profile/:userId/sport (Coach/Director logo inheritance)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCanMutateOwnSportsMock.mockResolvedValue(undefined);
    createRosterEntryMock.mockResolvedValue({ id: 're-new' });
    syncUserProfileToRosterEntriesMock.mockResolvedValue(undefined);
    invalidateProfileCachesMock.mockResolvedValue(undefined);
    invalidateOrgCacheMock.mockResolvedValue(undefined);
  });

  it('inherits organization logo on newly created team doc and sport entry', async () => {
    const orgLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test/o/Organizations%2Forg-1%2Flogo?alt=media&token=123';
    createTeamCodeMock.mockResolvedValue({
      id: 'team-basketball',
      teamCode: 'BB1234',
      teamName: 'Westlake Basketball',
      teamType: 'high-school',
      sport: 'Basketball',
    });

    const seed: SeedData = {
      Users: {
        'coach-1': {
          role: 'coach',
          firstName: 'Gary',
          lastName: 'Joseph',
          unicode: 'gary-joseph',
          sports: [
            {
              sport: 'Football',
              order: 0,
              team: {
                name: 'Westlake Football',
                teamId: 'team-football',
                organizationId: 'org-1',
                logoUrl: orgLogoUrl,
              },
            },
          ],
        },
      },
      RosterEntries: {
        'roster-1': {
          userId: 'coach-1',
          teamId: 'team-football',
          organizationId: 'org-1',
          sport: 'Football',
        },
      },
      Teams: {
        'team-football': {
          teamName: 'Westlake Football',
          teamType: 'high-school',
          organizationId: 'org-1',
          logoUrl: orgLogoUrl,
          teamLogoImg: orgLogoUrl,
        },
        'team-basketball': {
          teamName: 'Westlake Basketball',
        },
      },
      Organizations: {
        'org-1': {
          name: 'Westlake High School',
          logoUrl: orgLogoUrl,
        },
      },
    };

    const app = buildApp(seed);

    const response = await request(app).post('/api/v1/profile/coach-1/sport').send({
      sport: 'Basketball',
      positions: [],
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    // Verify createTeamCode was called with inherited logoUrl
    expect(createTeamCodeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sport: 'Basketball',
        logoUrl: orgLogoUrl,
      }),
      expect.anything()
    );

    // Verify the newly created team document was updated with the organization logo
    expect(seed.Teams['team-basketball']?.['logoUrl']).toBe(orgLogoUrl);
    expect(seed.Teams['team-basketball']?.['teamLogoImg']).toBe(orgLogoUrl);

    // Verify the user profile update includes the logo on newSport.team
    const updatedUser = seed.Users['coach-1'];
    expect(updatedUser).toBeDefined();
    const arrayUnionCall = updatedUser?.['sports'] as {
      __type: string;
      elements: Array<{ sport: string; team: { logoUrl: string } }>;
    };
    expect(arrayUnionCall.__type).toBe('arrayUnion');
    expect(arrayUnionCall.elements[0]?.team.logoUrl).toBe(orgLogoUrl);

    // Verify organization cache invalidation was called
    expect(invalidateOrgCacheMock).toHaveBeenCalledWith('org-1');
  });

  it('inherits organization logo when teamSelection is used by coach', async () => {
    const orgLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test/o/Organizations%2Forg-2%2Flogo?alt=media&token=456';
    provisionOnboardingProgramsMock.mockResolvedValue({
      teamIds: ['team-volleyball'],
      createdTeamIds: ['team-volleyball'],
      organizationIds: ['org-2'],
      sportTeamMap: new Map([
        [
          'volleyball',
          {
            teamId: 'team-volleyball',
            organizationId: 'org-2',
            orgName: 'Westlake Volleyball',
            logoUrl: orgLogoUrl,
          },
        ],
      ]),
      membershipTransitions: [],
    });

    const seed: SeedData = {
      Users: {
        'coach-1': {
          role: 'coach',
          firstName: 'Gary',
          lastName: 'Joseph',
          unicode: 'gary-joseph',
          sports: [
            {
              sport: 'Football',
              order: 0,
              team: {
                name: 'Westlake Football',
                teamId: 'team-football',
                organizationId: 'org-2',
                logoUrl: orgLogoUrl,
              },
            },
          ],
        },
      },
      Teams: {
        'team-volleyball': {
          teamName: 'Westlake Volleyball',
          organizationId: 'org-2',
        },
      },
      Organizations: {
        'org-2': {
          name: 'Westlake High School',
          logoUrl: orgLogoUrl,
        },
      },
    };

    const app = buildApp(seed);

    const response = await request(app)
      .post('/api/v1/profile/coach-1/sport')
      .send({
        sport: 'Volleyball',
        positions: [],
        teamSelection: {
          teams: [
            {
              id: 'org-2',
              organizationId: 'org-2',
              name: 'Westlake High School',
              teamType: 'high-school',
              logoUrl: orgLogoUrl,
            },
          ],
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    // Verify team doc was updated with logoUrl
    expect(seed.Teams['team-volleyball']?.['logoUrl']).toBe(orgLogoUrl);
    expect(seed.Teams['team-volleyball']?.['teamLogoImg']).toBe(orgLogoUrl);

    // Verify user sports update contains the logo on newSport.team
    const updatedUser = seed.Users['coach-1'];
    expect(updatedUser).toBeDefined();
    const arrayUnionCall = updatedUser?.['sports'] as {
      __type: string;
      elements: Array<{ sport: string; team: { logoUrl: string } }>;
    };
    expect(arrayUnionCall.__type).toBe('arrayUnion');
    expect(arrayUnionCall.elements[0]?.team.logoUrl).toBe(orgLogoUrl);

    // Verify organization cache invalidation
    expect(invalidateOrgCacheMock).toHaveBeenCalledWith('org-2');
  });
});
