import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { creditReferralRewardMock, getUserMock, findOneMock, findOneAndUpdateMock } = vi.hoisted(
  () => ({
    creditReferralRewardMock: vi.fn().mockResolvedValue({ success: true, newBalanceCents: 1500 }),
    getUserMock: vi.fn(),
    findOneMock: vi.fn().mockReturnValue({ lean: () => ({ exec: async () => null }) }),
    findOneAndUpdateMock: vi.fn().mockReturnValue({ lean: () => ({ exec: async () => null }) }),
  })
);

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    getUser: getUserMock,
  }),
}));

vi.mock('../../models/core/invite-event.model.js', () => ({
  InviteEventModel: {
    findOne: findOneMock,
    findOneAndUpdate: findOneAndUpdateMock,
  },
}));

vi.mock('../../services/team/team-code.service.js', () => ({
  getTeamCodeByCode: vi.fn(),
  joinTeam: vi.fn(),
}));

vi.mock('../../services/team/roster-entry.service.js', () => ({
  RosterEntryService: vi.fn().mockImplementation(() => ({
    createRosterEntry: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../services/core/cache.service.js', () => ({
  invalidateTeamProfileCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/team/roster-sport-profile.service.js', () => ({
  resolveRosterPositions: vi.fn().mockReturnValue([]),
}));

vi.mock('../../services/communications/notification.service.js', () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/communications/team-join-notifications.js', () => ({
  notifyTeamJoined: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../modules/billing/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../modules/billing/index.js')>(
    '../../modules/billing/index.js'
  );

  return {
    ...actual,
    creditReferralReward: creditReferralRewardMock,
  };
});

const { default: inviteRoutes } = await import('../core/invite.routes.js');

type FirestoreUser = {
  readonly id: string;
  readonly data: Record<string, unknown>;
};

function buildMockFirestore(users: readonly FirestoreUser[]) {
  const emptySnapshot = {
    empty: true,
    docs: [],
    size: 0,
    forEach: () => undefined,
  };

  const createDocRef = (path: string) => ({
    collection: (name: string) => createCollectionRef(`${path}/${name}`),
    doc: (id: string) => createDocRef(`${path}/${id}`),
    get: async () => ({
      exists: false,
      empty: true,
      docs: [],
      size: 0,
      forEach: () => undefined,
      data: () => undefined,
    }),
    set: async () => undefined,
    update: async () => undefined,
    delete: async () => undefined,
  });

  const createCollectionRef = (
    name: string,
    filters: ReadonlyArray<{ field: string; value: unknown }> = []
  ) => ({
    collection: (nested: string) => createCollectionRef(`${name}/${nested}`),
    doc: (id: string) => createDocRef(`${name}/${id}`),
    where: (field: string, _operator: string, value: unknown) =>
      createCollectionRef(name, [...filters, { field, value }]),
    orderBy: () => createCollectionRef(name, filters),
    limit: () => createCollectionRef(name, filters),
    get: async () => {
      if (name !== 'Users') return emptySnapshot;

      const referralCode = filters.find((filter) => filter.field === 'referralCode')?.value;
      if (typeof referralCode !== 'string') return emptySnapshot;

      const matches = users
        .filter((user) => user.data.referralCode === referralCode)
        .map((user) => ({
          id: user.id,
          data: () => user.data,
        }));

      return {
        empty: matches.length === 0,
        docs: matches,
        size: matches.length,
        forEach: (callback: (doc: (typeof matches)[number]) => void) => {
          matches.forEach(callback);
        },
      };
    },
    add: async () => ({ id: 'generated-id' }),
    set: async () => undefined,
    update: async () => undefined,
    delete: async () => undefined,
  });

  return {
    collection: (name: string) => createCollectionRef(name),
    batch: () => ({
      set: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      commit: async () => undefined,
    }),
  };
}

function buildApp(users: readonly FirestoreUser[]) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.isStaging = false;
    req.firebase = {
      db: buildMockFirestore(users) as never,
      auth: {
        verifyIdToken: async () => ({
          uid: 'new-user-id',
          email: 'new-user@nxt1.test',
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

describe('POST /invite/accept referral reward window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOneMock.mockReturnValue({ lean: () => ({ exec: async () => null }) });
    findOneAndUpdateMock.mockReturnValue({ lean: () => ({ exec: async () => null }) });
  });

  it('credits a general referral after a longer onboarding flow', async () => {
    getUserMock.mockResolvedValue({
      metadata: {
        creationTime: new Date(Date.now() - 45 * 60_000).toISOString(),
      },
    });

    const app = buildApp([
      {
        id: 'inviter-user-id',
        data: {
          referralCode: 'NXT-REF123',
          firstName: 'Invite',
          lastName: 'Sender',
        },
      },
    ]);

    const response = await request(app)
      .post('/api/v1/invite/accept')
      .set('Authorization', 'Bearer test-token')
      .send({
        code: 'NXT-REF123',
        isNewUser: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(creditReferralRewardMock).toHaveBeenCalledWith(
      expect.anything(),
      'inviter-user-id',
      'new-user-id'
    );
  });

  it('still skips rewards once the account is clearly stale', async () => {
    getUserMock.mockResolvedValue({
      metadata: {
        creationTime: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
      },
    });

    const app = buildApp([
      {
        id: 'inviter-user-id',
        data: {
          referralCode: 'NXT-REF123',
          firstName: 'Invite',
          lastName: 'Sender',
        },
      },
    ]);

    const response = await request(app)
      .post('/api/v1/invite/accept')
      .set('Authorization', 'Bearer test-token')
      .send({
        code: 'NXT-REF123',
        isNewUser: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(creditReferralRewardMock).not.toHaveBeenCalled();
  });
});
