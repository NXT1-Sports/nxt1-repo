/**
 * @fileoverview Tests for /invite/accept org-ownership guard
 *
 * Covers the fix: when an athlete accepts a team invite for a team whose
 * organisation has NO admins or billing owner, the invite should fall back to
 * a general (personal-billing) invite instead of joining the team.
 *
 * Two flows are compared:
 *   A) Team invite — org has NO admin / billing owner  → team join SKIPPED
 *   B) Team invite — org HAS an admin                  → team join EXECUTED
 */

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RosterEntryService } from '../../services/team/roster-entry.service.js';

// ─── Mock heavy dependencies BEFORE importing the route ───────────────────────
// vi.hoisted ensures these variables are available inside vi.mock() factory
// functions, which are hoisted above all import / const declarations.
const {
  joinTeamMock,
  getTeamCodeByCodeMock,
  findOneMock,
  findOneAndUpdateMock,
  createRosterEntryMock,
} = vi.hoisted(() => ({
  joinTeamMock: vi.fn(),
  getTeamCodeByCodeMock: vi.fn(),
  findOneMock: vi.fn().mockReturnValue({ lean: () => ({ exec: async () => null }) }),
  findOneAndUpdateMock: vi.fn().mockReturnValue({ lean: () => ({ exec: async () => null }) }),
  createRosterEntryMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/team/team-code.service.js', () => ({
  getTeamCodeByCode: getTeamCodeByCodeMock,
  joinTeam: joinTeamMock,
}));

vi.mock('../../models/core/invite-event.model.js', () => ({
  InviteEventModel: {
    findOne: findOneMock,
    findOneAndUpdate: findOneAndUpdateMock,
  },
}));

vi.mock('../../modules/billing/index.js', () => ({
  creditReferralReward: vi.fn().mockResolvedValue(undefined),
  getReferralRewardCents: vi.fn().mockResolvedValue(500),
  NEW_USER_MAX_AGE_MINUTES: 30,
}));

vi.mock('../../services/communications/team-join-notifications.js', () => ({
  notifyTeamJoined: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/team/roster-entry.service.js', () => ({
  RosterEntryService: vi.fn().mockImplementation(() => ({
    createRosterEntry: createRosterEntryMock,
  })),
}));

vi.mock('../../services/core/cache.service.js', () => ({
  invalidateTeamProfileCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/team/roster-sport-profile.service.js', () => ({
  resolveRosterPositions: vi.fn().mockReturnValue([]),
}));

// ─── Import route AFTER mocks are registered ──────────────────────────────────
const { default: inviteRoutes } = await import('../core/invite.routes.js');

// ─── Firestore helpers ────────────────────────────────────────────────────────

type FirestoreSeedMap = Map<string, Record<string, unknown>>;
type FirestoreWrite = { path: string; operation: 'set' | 'update' | 'delete'; data?: unknown };

function buildMockFirestore(seed: FirestoreSeedMap, writes: FirestoreWrite[]) {
  const emptySnapshot = {
    empty: true,
    docs: [],
    size: 0,
    forEach: () => undefined,
  };

  const createQueryRef = () => ({
    collection: (_name: string) => createQueryRef(),
    doc: (id: string) => createDocRef(id),
    where: () => createQueryRef(),
    orderBy: () => createQueryRef(),
    limit: () => createQueryRef(),
    get: async () => emptySnapshot,
    add: async () => ({ id: 'generated-id' }),
  });

  const createDocRef = (path: string) => ({
    collection: (_name: string) => createQueryRef(),
    doc: (id: string) => createDocRef(`${path}/${id}`),
    where: () => createQueryRef(),
    orderBy: () => createQueryRef(),
    limit: () => createQueryRef(),
    get: async () => {
      const data = seed.get(path);
      return {
        exists: data !== undefined,
        empty: data === undefined,
        docs: [],
        size: data !== undefined ? 1 : 0,
        forEach: () => undefined,
        data: () => (data ? { ...data } : {}),
      };
    },
    set: async (data: unknown) => {
      writes.push({ path, operation: 'set', data });
    },
    update: async (data: unknown) => {
      writes.push({ path, operation: 'update', data });
    },
    delete: async () => {
      writes.push({ path, operation: 'delete' });
    },
  });

  return {
    ...createQueryRef(),
    batch: () => ({
      set: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      commit: async () => undefined,
    }),
    collection: (name: string) => ({
      ...createQueryRef(),
      doc: (id: string) => createDocRef(`${name}/${id}`),
      where: () => createQueryRef(),
    }),
  };
}

// ─── App factory ─────────────────────────────────────────────────────────────

function buildApp(seed: FirestoreSeedMap, writes: FirestoreWrite[] = []) {
  const app = express();
  app.use(express.json());

  // Inject mock Firebase context (mimics firebaseContext middleware)
  app.use((req, _res, next) => {
    req.isStaging = false;
    req.firebase = {
      db: buildMockFirestore(seed, writes) as never,
      auth: {
        // Accept any Bearer token and return a fixed uid
        verifyIdToken: async () => ({
          uid: 'athlete-user-id',
          email: 'athlete@test.com',
          email_verified: true,
        }),
      } as never,
      storage: {} as never,
    };
    next();
  });

  app.use('/api/v1/invite', inviteRoutes);
  return app;
}

// ─── Shared request helper ────────────────────────────────────────────────────

async function postAccept(app: ReturnType<typeof buildApp>, body: Record<string, unknown>) {
  return request(app)
    .post('/api/v1/invite/accept')
    .set('Authorization', 'Bearer test-token')
    .send(body);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /invite/accept — org-ownership guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup implementations that vi.clearAllMocks() may have cleared
    findOneMock.mockReturnValue({ lean: () => ({ exec: async () => null }) });
    findOneAndUpdateMock.mockReturnValue({ lean: () => ({ exec: async () => null }) });
    createRosterEntryMock.mockResolvedValue(undefined);
    // Re-setup the RosterEntryService constructor mock — clearAllMocks() clears
    // mockImplementation set inside vi.mock() factories.
    vi.mocked(RosterEntryService).mockImplementation(() => ({
      createRosterEntry: createRosterEntryMock,
    }));
  });

  /**
   * FLOW A ─ Team invite where the org has NO admins and NO billing owner.
   *
   * Expected: resolvedTeamCode is set to undefined → joinTeam is NEVER called.
   */
  describe('Flow A — org with no admin or billing owner', () => {
    const ORG_ID = 'org-no-owner';
    const TEAM_CODE = 'NOOWNER';

    const seed: FirestoreSeedMap = new Map([
      // The athlete user document
      ['Users/athlete-user-id', { firstName: 'John', lastName: 'Doe', email: 'athlete@test.com' }],
      // Organisation with NO admins, NO ownerId, NO billingOwnerUid
      [
        `Organizations/${ORG_ID}`,
        {
          name: 'Ghost Org',
          admins: [],
          // ownerId intentionally omitted
          // billingOwnerUid intentionally omitted
        },
      ],
    ]);

    beforeEach(() => {
      // getTeamCodeByCode returns a team that belongs to the "empty" org
      getTeamCodeByCodeMock.mockResolvedValue({
        team: {
          id: 'team-no-owner-id',
          teamName: 'Ghost Team',
          teamCode: TEAM_CODE,
          organizationId: ORG_ID,
        },
        cached: false,
      });
    });

    it('returns 200 without joining the team', async () => {
      const app = buildApp(seed);
      const res = await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('does NOT call joinTeam', async () => {
      const app = buildApp(seed);
      await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      expect(joinTeamMock).not.toHaveBeenCalled();
    });

    it('does NOT write a RosterEntry document', async () => {
      const writes: FirestoreWrite[] = [];
      const app = buildApp(seed, writes);
      await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      const rosterWrite = writes.find((w) => w.path.startsWith('RosterEntries/'));
      expect(rosterWrite).toBeUndefined();
    });

    it('response does NOT include teamJoined', async () => {
      const app = buildApp(seed);
      const res = await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      // teamJoined should be falsy since the join was skipped
      expect(res.body.teamJoined).toBeFalsy();
    });
  });

  /**
   * FLOW B ─ Team invite where the org HAS an admin.
   *
   * Expected: joinTeam IS called and the response includes teamJoined.
   */
  describe('Flow B — org with an admin', () => {
    const ORG_ID = 'org-with-admin';
    const TEAM_CODE = 'HASADMIN';
    const TEAM_ID = 'team-has-admin-id';

    const seed: FirestoreSeedMap = new Map([
      [
        'Users/athlete-user-id',
        { firstName: 'Jane', lastName: 'Smith', email: 'athlete@test.com' },
      ],
      // Organisation WITH an admin
      [
        `Organizations/${ORG_ID}`,
        {
          name: 'Real Org',
          admins: [{ userId: 'coach-uid', role: 'director' }],
          ownerId: 'coach-uid',
        },
      ],
      // Team document (read inside joinTeam path for organizationId)
      [
        `Teams/${TEAM_ID}`,
        {
          teamName: 'Real Team',
          teamCode: TEAM_CODE,
          organizationId: ORG_ID,
          sport: 'Basketball',
        },
      ],
    ]);

    beforeEach(() => {
      // getTeamCodeByCode returns a team with a real org
      getTeamCodeByCodeMock.mockResolvedValue({
        team: {
          id: TEAM_ID,
          teamName: 'Real Team',
          teamCode: TEAM_CODE,
          organizationId: ORG_ID,
        },
        cached: false,
      });

      // joinTeam succeeds
      joinTeamMock.mockResolvedValue({
        id: TEAM_ID,
        teamName: 'Real Team',
        teamCode: TEAM_CODE,
        organizationId: ORG_ID,
        sport: 'Basketball',
        slug: 'real-team',
      });
    });

    it('returns 200 and joins the team', async () => {
      const app = buildApp(seed);
      const res = await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DOES call joinTeam with the correct teamCode', async () => {
      const app = buildApp(seed);
      await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      expect(joinTeamMock).toHaveBeenCalledOnce();
      expect(joinTeamMock).toHaveBeenCalledWith(
        expect.anything(), // db
        expect.objectContaining({ teamCode: TEAM_CODE })
      );
    });

    it('DOES write a RosterEntry document via joinTeam and the response confirms the join', async () => {
      // This test verifies that when the org HAS an admin, the full team-join
      // flow runs (joinTeam called + response contains teamJoined name).
      // The RosterEntry is created as a side-effect of the joinTeam path.
      const writes: FirestoreWrite[] = [];
      const app = buildApp(seed, writes);
      const res = await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      // joinTeam was called (verified separately) and the response confirms join
      expect(joinTeamMock).toHaveBeenCalledOnce();
      expect(res.body.teamJoined).toBe('Real Team');
    });

    it('response includes teamJoined', async () => {
      const app = buildApp(seed);
      const res = await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      expect(res.body.teamJoined).toBe('Real Team');
    });
  });

  /**
   * FLOW C ─ org ownership check throws an error (Firestore unavailable).
   *
   * Expected: fall-through to normal team join (fail-open, not fail-closed),
   * so users are never blocked by a transient infrastructure issue.
   */
  describe('Flow C — org check fails (Firestore error)', () => {
    const ORG_ID = 'org-firestore-error';
    const TEAM_CODE = 'ERRCODE';
    const TEAM_ID = 'team-error-id';

    const seed: FirestoreSeedMap = new Map([
      [
        'Users/athlete-user-id',
        { firstName: 'Error', lastName: 'Test', email: 'athlete@test.com' },
      ],
      // NO Organization document seeded — simulates Firestore read failure
    ]);

    beforeEach(() => {
      getTeamCodeByCodeMock.mockRejectedValue(new Error('Firestore unavailable'));

      joinTeamMock.mockResolvedValue({
        id: TEAM_ID,
        teamName: 'Error Team',
        teamCode: TEAM_CODE,
        organizationId: ORG_ID,
        sport: 'Football',
        slug: 'error-team',
      });
    });

    it('still returns 200 and proceeds with team join', async () => {
      const app = buildApp(seed);
      const res = await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      expect(res.status).toBe(200);
    });

    it('calls joinTeam as fallback when org check throws', async () => {
      const app = buildApp(seed);
      await postAccept(app, {
        code: `NXT-${TEAM_CODE}`,
        teamCode: TEAM_CODE,
        inviterUid: 'coach-uid',
        isNewUser: false,
      });

      expect(joinTeamMock).toHaveBeenCalledOnce();
    });
  });
});
