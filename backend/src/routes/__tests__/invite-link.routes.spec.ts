import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getReferralRewardCentsMock } = vi.hoisted(() => ({
  getReferralRewardCentsMock: vi.fn().mockResolvedValue(500),
}));

vi.mock('../../services/team/team-code.service.js', () => ({}));

vi.mock('../../models/core/invite-event.model.js', () => ({
  InviteEventModel: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock('../../modules/billing/index.js', () => ({
  creditReferralReward: vi.fn().mockResolvedValue(undefined),
  getReferralRewardCents: getReferralRewardCentsMock,
  NEW_USER_MAX_AGE_MINUTES: 30,
}));

vi.mock('../../services/communications/team-join-notifications.js', () => ({
  notifyTeamJoined: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/communications/notification.service.js', () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/team/roster-entry.service.js', () => ({
  RosterEntryService: vi.fn(),
}));

vi.mock('../../services/core/cache.service.js', () => ({
  invalidateTeamProfileCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/team/roster-sport-profile.service.js', () => ({
  resolveRosterPositions: vi.fn().mockReturnValue([]),
}));

const { default: inviteRoutes } = await import('../core/invite.routes.js');

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

function buildApp(seed: FirestoreSeedMap, writes: FirestoreWrite[] = []) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.isStaging = false;
    req.firebase = {
      db: buildMockFirestore(seed, writes) as never,
      auth: {
        verifyIdToken: async () => ({
          uid: 'coach-user-id',
          email: 'coach@test.com',
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

describe('POST /invite/link — canonical host handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('canonicalizes a legacy APP_URL to the public production host', async () => {
    vi.stubEnv('APP_URL', 'https://nxt-1-v2.firebaseapp.com');

    const app = buildApp(new Map([['Users/coach-user-id', { referralCode: 'NXT-ABC123' }]]));
    const res = await request(app)
      .post('/api/v1/invite/link')
      .set('Authorization', 'Bearer test-token')
      .send({ type: 'general' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toBe('https://nxt1sports.com/join/NXT-ABC123');
    expect(res.body.data.shortUrl).toBe('https://nxt1sports.com/join/NXT-ABC123');
  });

  it('canonicalizes legacy Firebase Hosting origins to the public production host', async () => {
    const app = buildApp(new Map([['Users/coach-user-id', { referralCode: 'NXT-ABC123' }]]));
    const res = await request(app)
      .post('/api/v1/invite/link')
      .set('Authorization', 'Bearer test-token')
      .set('Origin', 'https://nxt-1-v2.web.app')
      .send({ type: 'general' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toBe('https://nxt1sports.com/join/NXT-ABC123');
    expect(res.body.data.shortUrl).toBe('https://nxt1sports.com/join/NXT-ABC123');
  });
});
