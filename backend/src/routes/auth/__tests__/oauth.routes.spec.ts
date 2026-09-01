import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_OAUTH_SCOPES,
  OAUTH_TOKEN_SUBCOLLECTION,
  GOOGLE_OAUTH_TOKEN_DOC_ID,
} from '@nxt1/core/auth';
import { encodeOAuthState } from '../shared.js';

const invalidateProfileCaches = vi.fn();

vi.mock('../../../middleware/auth/auth.middleware.js', () => {
  const attachAdminUser: RequestHandler = (req, _res, next) => {
    req.user = {
      uid: 'admin-user',
      email: 'admin@nxt1sports.com',
      emailVerified: true,
      displayName: 'Admin User',
    };
    next();
  };

  return {
    appGuard: attachAdminUser,
    adminGuard: attachAdminUser,
  };
});

vi.mock('../../profile/shared.js', () => ({
  invalidateProfileCaches,
}));

interface FakeDocSnapshot {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

function createDocSnapshot(value: Record<string, unknown> | undefined): FakeDocSnapshot {
  return {
    exists: !!value,
    data: () => value,
  };
}

function createFakeDb() {
  const users = new Map<string, Record<string, unknown>>();
  const emailIndex = new Map<string, string>();
  const oauthStates = new Map<string, Record<string, unknown>>();
  const tokenSets: Array<{ path: string; value: Record<string, unknown> }> = [];
  const deletedPaths: string[] = [];
  const stateSets: Array<{ path: string; value: Record<string, unknown> }> = [];

  const getUserRef = (uid: string) => ({
    id: uid,
    path: `Users/${uid}`,
    async get() {
      return createDocSnapshot(users.get(uid));
    },
    collection(subcollection: string) {
      return {
        doc(docId: string) {
          const path = `Users/${uid}/${subcollection}/${docId}`;
          return {
            path,
            async get() {
              if (subcollection === 'oauthStates') {
                return createDocSnapshot(oauthStates.get(`${uid}:${docId}`));
              }
              return createDocSnapshot(undefined);
            },
            async set(value: Record<string, unknown>) {
              if (subcollection === 'oauthStates') {
                oauthStates.set(`${uid}:${docId}`, value);
                stateSets.push({ path, value });
                return;
              }
              tokenSets.push({ path, value });
            },
            async delete() {
              if (subcollection === 'oauthStates') {
                oauthStates.delete(`${uid}:${docId}`);
              }
              deletedPaths.push(path);
            },
          };
        },
      };
    },
  });

  const db = {
    collection(name: string) {
      if (name !== 'Users') {
        throw new Error(`Unexpected collection: ${name}`);
      }

      return {
        where(field: string, _operator: string, value: string) {
          if (field !== 'email') {
            throw new Error(`Unexpected where field: ${field}`);
          }

          return {
            limit(_count: number) {
              return {
                async get() {
                  const uid = emailIndex.get(value.toLowerCase());
                  return {
                    empty: !uid,
                    docs: uid ? [{ id: uid }] : [],
                  };
                },
              };
            },
          };
        },
        doc(uid: string) {
          return getUserRef(uid);
        },
      };
    },
    batch() {
      const operations: Array<() => Promise<void>> = [];
      return {
        set(
          ref: { set: (value: Record<string, unknown>, options?: unknown) => Promise<void> },
          value: Record<string, unknown>,
          options?: unknown
        ) {
          operations.push(() => ref.set(value, options));
        },
        update(ref: { path: string }, value: Record<string, unknown>) {
          operations.push(async () => {
            const uid = ref.path.split('/')[1];
            users.set(uid, { ...(users.get(uid) ?? {}), ...value });
          });
        },
        delete(ref: { delete: () => Promise<void> }) {
          operations.push(() => ref.delete());
        },
        async commit() {
          await Promise.all(operations.map((operation) => operation()));
        },
      };
    },
    __seedUser(uid: string, email: string, data: Record<string, unknown> = {}) {
      users.set(uid, { email, ...data });
      emailIndex.set(email.toLowerCase(), uid);
    },
    __seedOauthState(uid: string, stateId: string, value: Record<string, unknown>) {
      oauthStates.set(`${uid}:${stateId}`, value);
    },
    __tokenSets: tokenSets,
    __deletedPaths: deletedPaths,
    __stateSets: stateSets,
  };

  return db;
}

describe('OAuth Routes', () => {
  beforeEach(() => {
    vi.stubEnv('CLIENT_ID', 'google-client-id');
    vi.stubEnv('CLIENT_SECRET', 'google-client-secret');
    vi.stubEnv('BACKEND_URL', 'https://api.nxt1sports.com');
    invalidateProfileCaches.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function createApp(db: ReturnType<typeof createFakeDb>) {
    const app = express();
    app.use((_req, res, next) => {
      res.locals['db'] = db;
      next();
    });
    app.use((req, _res, next) => {
      req.firebase = {
        db: db as never,
        auth: {} as never,
        storage: {} as never,
      };
      req.isStaging = false;
      next();
    });

    return import('../oauth.routes.js').then((module) => {
      app.use(module.default);
      return app;
    });
  }

  it('creates a Google OAuth URL with the canonical workspace scopes', async () => {
    const db = createFakeDb();

    const app = await createApp(db);
    const response = await request(app).get('/google/connect-url?origin=https://nxt1sports.com');

    expect(response.status).toBe(200);

    const oauthUrl = new URL(response.body.url);
    expect(oauthUrl.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_OAUTH_SCOPES);
  });

  it('creates an admin mailbox OAuth URL targeting the mailbox user', async () => {
    const db = createFakeDb();
    db.__seedUser('mailbox-user', 'nxt1@nxt1sports.com');

    const app = await createApp(db);
    const response = await request(app).get(
      '/google/admin-connect-url?mailboxEmail=nxt1@nxt1sports.com&origin=https://nxt1sports.com'
    );

    expect(response.status).toBe(200);
    expect(response.body.mailboxEmail).toBe('nxt1@nxt1sports.com');
    expect(response.body.mailboxUserId).toBe('mailbox-user');

    const stateWrite = db.__stateSets[0];
    expect(stateWrite?.path).toMatch(/^Users\/admin-user\/oauthStates\//);
    expect(stateWrite?.value).toMatchObject({
      purpose: 'admin-google-mailbox-connect',
      targetUid: 'mailbox-user',
      mailboxEmail: 'nxt1@nxt1sports.com',
      createdByUid: 'admin-user',
    });

    const oauthUrl = new URL(response.body.url);
    expect(oauthUrl.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_OAUTH_SCOPES);
    const encodedState = oauthUrl.searchParams.get('state');
    expect(encodedState).toBeTruthy();
    const decodedState = JSON.parse(Buffer.from(encodedState!, 'base64url').toString()) as {
      uid: string;
      origin?: string;
      oauthStateId?: string;
    };

    expect(decodedState.uid).toBe('admin-user');
    expect(decodedState.origin).toBe('https://nxt1sports.com');
    expect(decodedState.oauthStateId).toBeTruthy();
  });

  it('writes callback Gmail tokens to the targeted mailbox user for admin flows', async () => {
    const db = createFakeDb();
    const oauthStateId = 'state-123';
    db.__seedOauthState('admin-user', oauthStateId, {
      purpose: 'admin-google-mailbox-connect',
      targetUid: 'mailbox-user',
      mailboxEmail: 'nxt1@nxt1sports.com',
      createdByUid: 'admin-user',
      createdAt: new Date().toISOString(),
    });

    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        refresh_token: 'refresh-123',
        id_token: `header.${Buffer.from(JSON.stringify({ email: 'nxt1@nxt1sports.com' })).toString(
          'base64url'
        )}.sig`,
      }),
    } as Response);

    const app = await createApp(db);
    const state = encodeOAuthState('admin-user', 'https://nxt1sports.com', undefined, oauthStateId);

    const response = await request(app).get(
      `/google/callback?code=test-code&state=${encodeURIComponent(state)}`
    );

    expect(response.status).toBe(302);
    expect(response.headers['location']).toContain('success=true');

    expect(db.__tokenSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: `Users/mailbox-user/${OAUTH_TOKEN_SUBCOLLECTION}/${GOOGLE_OAUTH_TOKEN_DOC_ID}`,
          value: expect.objectContaining({
            provider: GOOGLE_OAUTH_TOKEN_DOC_ID,
            refreshToken: 'refresh-123',
            email: 'nxt1@nxt1sports.com',
          }),
        }),
      ])
    );
    expect(db.__deletedPaths).toContain(`Users/admin-user/oauthStates/${oauthStateId}`);
    expect(invalidateProfileCaches).not.toHaveBeenCalled();
  });
});
