/**
 * @fileoverview Auth Routes Tests
 * @module @nxt1/backend/routes/__tests__/auth
 */

import { beforeEach, describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import request from 'supertest';

vi.mock('../../services/core/cache.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/core/cache.service.js')>();
  return {
    ...actual,
    getCacheService: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined),
      delByPrefix: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('../../routes/profile/shared.js', () => ({
  invalidateProfileCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/platform/alert.service.js', () => ({
  sendSlackAlert: vi.fn(),
}));

vi.mock(
  '../../services/marketing/email/campaigns/welcome/welcome-onboarding-email.service.js',
  () => ({
    sendWelcomeOnboardingEmail: vi.fn(),
  })
);

vi.mock('../../services/marketing/lifecycle/signup-notion-dashboard.service.js', () => ({
  enqueueSignupNotionDashboardEntry: vi.fn(),
}));

vi.mock('../../services/domain-events/domain-events.service.js', () => ({
  publishAccountStartedDomainEvent: vi.fn(),
  publishSignupCompletedDomainEvent: vi.fn(),
}));

vi.mock('../../services/team/roster-entry.service.js', async () => {
  const createRosterEntry = vi.fn().mockResolvedValue(undefined);
  const syncUserProfileToRosterEntries = vi.fn().mockResolvedValue(undefined);
  return {
    createRosterEntryService: vi.fn(() => ({
      createRosterEntry,
      syncUserProfileToRosterEntries,
    })),
    RosterEntryService: class {
      syncUserProfileToRosterEntries = syncUserProfileToRosterEntries;
    },
  };
});

vi.mock('../../services/platform/firecrawl-monitor-enrollment.service.js', () => ({
  ensureFirecrawlMonitorsForConnectedSources: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../modules/agent/services/agent-scrape.service.js', () => ({
  enqueueLinkedAccountScrape: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../modules/agent/services/agent-welcome.service.js', () => ({
  enqueueWelcomeGraphicIfReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../modules/billing/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/billing/index.js')>();
  return {
    ...actual,
    resolveBillingTarget: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../services/communications/team-join-notifications.js', () => ({
  notifyTeamJoined: vi.fn().mockResolvedValue(undefined),
}));

import { sendSlackAlert } from '../../services/platform/alert.service.js';
import { sendWelcomeOnboardingEmail } from '../../services/marketing/email/campaigns/welcome/welcome-onboarding-email.service.js';
import { enqueueSignupNotionDashboardEntry } from '../../services/marketing/lifecycle/signup-notion-dashboard.service.js';
import { publishAccountStartedDomainEvent } from '../../services/domain-events/domain-events.service.js';
import { publishSignupCompletedDomainEvent } from '../../services/domain-events/domain-events.service.js';
import {
  __getMockFirestoreDocument,
  __getMockFirestoreWrites,
  __resetMockFirestore,
  __seedMockFirestoreDocument,
} from '../../test-app.js';
import app from '../../test-app.js';

function authHeader(uid: string, email: string): string {
  const token = Buffer.from(JSON.stringify({ uid, email }), 'utf8').toString('base64url');
  return `Bearer test-auth:${token}`;
}

describe('Auth Routes', () => {
  beforeEach(() => {
    __resetMockFirestore();
    vi.clearAllMocks();
    vi.mocked(sendSlackAlert).mockResolvedValue(true);
    vi.mocked(sendWelcomeOnboardingEmail).mockResolvedValue({
      status: 'sent',
      email: 'test@example.com',
      campaignKey: 'welcome_intro_athlete',
    });
    vi.mocked(enqueueSignupNotionDashboardEntry).mockResolvedValue({ status: 'queued' });
    vi.mocked(publishAccountStartedDomainEvent).mockResolvedValue({
      domainEventType: 'auth.user_created',
      projections: [
        {
          projector: 'marketing',
          eventKey: 'signup.started::test',
          eventType: 'signup.started',
          deduplicated: false,
        },
      ],
    });
    vi.mocked(publishSignupCompletedDomainEvent).mockResolvedValue({
      domainEventType: 'auth.user_onboarded',
      projections: [
        {
          projector: 'marketing',
          eventKey: 'signup.completed::test',
          eventType: 'signup.completed',
          deduplicated: false,
        },
      ],
    });
  });

  describe('Production Routes', () => {
    describe('Team Code Validation', () => {
      it('GET /api/v1/auth/validate-team-code should return 400 when teamCode is missing', async () => {
        const response = await request(app).get('/api/v1/auth/validate-team-code');
        expect(response.status).toBe(400);
      });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/auth/validate-team-code should return 400 when teamCode is missing', async () => {
      const response = await request(app).get('/api/v1/staging/auth/validate-team-code');
      expect(response.status).toBe(400);
    });
  });

  describe('Onboarding DTO Validation', () => {
    describe('POST /api/v1/auth/create-user', () => {
      it('rejects create-user without a Firebase token', async () => {
        const response = await request(app).post('/api/v1/auth/create-user').send({
          uid: 'createdUserUid00000000000001',
          email: 'created@example.com',
          firstName: 'Created',
          lastName: 'User',
        });

        expect(response.status).toBe(401);
      });

      it('publishes account-started after the user record is created', async () => {
        const uid = 'createdUserUid00000000000001';
        const email = 'created@example.com';
        const response = await request(app)
          .post('/api/v1/auth/create-user')
          .set('Authorization', authHeader(uid, email))
          .send({
            uid,
            email,
            firstName: 'Created',
            lastName: 'User',
          });

        expect(response.status).toBe(201);
        expect(publishAccountStartedDomainEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'createdUserUid00000000000001',
            environment: 'production',
          })
        );

        const storedUser = __getMockFirestoreDocument('Users/createdUserUid00000000000001');
        expect(storedUser?.['email']).toBe('created@example.com');
        expect(storedUser?.['onboardingCompleted']).toBe(false);
      });

      it('keeps create-user successful when the account-started outbox enqueue fails', async () => {
        vi.mocked(publishAccountStartedDomainEvent).mockRejectedValueOnce(
          new Error('Outbox unavailable')
        );

        const uid = 'createdUserUid00000000000002';
        const email = 'created-2@example.com';
        const response = await request(app)
          .post('/api/v1/auth/create-user')
          .set('Authorization', authHeader(uid, email))
          .send({
            uid,
            email,
            firstName: 'Created',
            lastName: 'Again',
          });

        expect(response.status).toBe(201);
        expect(response.body?.success).toBe(true);

        const storedUser = __getMockFirestoreDocument('Users/createdUserUid00000000000002');
        expect(storedUser?.['email']).toBe('created-2@example.com');
      });

      it('rejects create-user when the body UID does not match the Firebase token', async () => {
        const response = await request(app)
          .post('/api/v1/auth/create-user')
          .set('Authorization', authHeader('tokenUserUid0000000000000001', 'created@example.com'))
          .send({
            uid: 'bodyUserUid00000000000000001',
            email: 'created@example.com',
            firstName: 'Created',
            lastName: 'User',
          });

        expect(response.status).toBe(403);
        expect(__getMockFirestoreDocument('Users/bodyUserUid00000000000000001')).toBeUndefined();
      });

      it('rejects create-user when the body email does not match the Firebase token', async () => {
        const uid = 'createdUserUid00000000000003';
        const response = await request(app)
          .post('/api/v1/auth/create-user')
          .set('Authorization', authHeader(uid, 'token@example.com'))
          .send({
            uid,
            email: 'body@example.com',
            firstName: 'Created',
            lastName: 'User',
          });

        expect(response.status).toBe(403);
        expect(__getMockFirestoreDocument(`Users/${uid}`)).toBeUndefined();
      });
    });

    describe('POST /api/v1/auth/join-team', () => {
      it('rejects join-team without a Firebase token', async () => {
        const response = await request(app).post('/api/v1/auth/join-team').send({
          userId: 'joinUserUid00000000000000001',
          code: 'TEAM123',
        });

        expect(response.status).toBe(401);
      });

      it('rejects join-team when the body userId does not match the Firebase token', async () => {
        __seedMockFirestoreDocument('Users/bodyJoinUserUid0000000000001', {
          email: 'body@example.com',
        });

        const response = await request(app)
          .post('/api/v1/auth/join-team')
          .set('Authorization', authHeader('tokenJoinUserUid0000000000001', 'token@example.com'))
          .send({
            userId: 'bodyJoinUserUid0000000000001',
            code: 'TEAM123',
          });

        expect(response.status).toBe(403);
        const storedUser = __getMockFirestoreDocument('Users/bodyJoinUserUid0000000000001');
        expect(storedUser?.['teamCode']).toBeUndefined();
      });

      it('allows a signed-in user to join a team for their own UID', async () => {
        const uid = 'joinUserUid00000000000000001';
        __seedMockFirestoreDocument(`Users/${uid}`, {
          email: 'join@example.com',
          firstName: 'Join',
          lastName: 'User',
          role: 'athlete',
        });
        __seedMockFirestoreDocument('Teams/team-123', {
          teamCode: 'TEAM123',
          teamName: 'Demo Team',
          isActive: true,
          organizationId: 'org-123',
          sport: 'Basketball',
        });

        const response = await request(app)
          .post('/api/v1/auth/join-team')
          .set('Authorization', authHeader(uid, 'join@example.com'))
          .send({
            userId: uid,
            code: 'TEAM123',
          });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, teamName: 'Demo Team' });

        const storedUser = __getMockFirestoreDocument(`Users/${uid}`);
        expect(storedUser?.['teamCode']).toMatchObject({
          teamCode: 'TEAM123',
          teamName: 'Demo Team',
          teamId: 'team-123',
        });
      });
    });

    describe('POST /api/v1/auth/profile/onboarding', () => {
      it('should return 400 when body is empty', async () => {
        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({});
        expect(response.status).toBe(400);
      });

      it('should return 400 when userId is missing', async () => {
        const response = await request(app)
          .post('/api/v1/auth/profile/onboarding')
          .send({ firstName: 'John', lastName: 'Doe' });
        expect(response.status).toBe(400);
      });

      it('backfills missing preference defaults without overriding existing opt-outs', async () => {
        __seedMockFirestoreDocument('Users/prefs123', {
          id: 'prefs123',
          role: 'athlete',
          onboardingCompleted: false,
          preferences: {
            notifications: {
              push: true,
              email: true,
            },
            activityTracking: false,
            theme: 'dark',
          },
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'prefs123',
          userType: 'athlete',
          sport: 'Basketball',
        });

        expect(response.status).toBe(200);

        const userUpdate = __getMockFirestoreWrites().find(
          (write) => write.path === 'Users/prefs123' && write.operation === 'update'
        );

        expect(userUpdate).toBeDefined();
        expect(userUpdate?.payload).toMatchObject({
          preferences: {
            notifications: {
              push: true,
              email: true,
              marketing: true,
            },
            activityTracking: false,
            analyticsTracking: true,
            biometricLogin: false,
            theme: 'dark',
          },
        });

        const storedUser = __getMockFirestoreDocument('Users/prefs123');
        expect(storedUser?.['preferences']).toMatchObject({
          notifications: {
            push: true,
            email: true,
            marketing: true,
          },
          activityTracking: false,
          analyticsTracking: true,
          biometricLogin: false,
          theme: 'dark',
        });
      });

      it('does not persist placeholder teams for coach onboarding without a selected program', async () => {
        __seedMockFirestoreDocument('Users/coach123', {
          id: 'coach123',
          role: 'coach',
          coachTitle: 'Legacy Root Title',
          onboardingCompleted: false,
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'coach123',
          userType: 'coach',
          sport: 'Football',
          organization: 'Alcoa Football',
          coachTitle: 'Head Coach',
          city: 'Alcoa',
          state: 'TN',
        });

        expect(response.status).toBe(200);

        const userUpdate = __getMockFirestoreWrites().find(
          (write) => write.path === 'Users/coach123' && write.operation === 'update'
        );

        expect(userUpdate).toBeDefined();
        expect(userUpdate?.payload).toMatchObject({
          sports: [
            {
              sport: 'Football',
              order: 0,
            },
          ],
          activeSportIndex: 0,
        });
        expect(userUpdate?.payload).not.toHaveProperty('primarySport');
        expect(
          (userUpdate?.payload?.['sports'] as Array<Record<string, unknown>>)[0]
        ).not.toHaveProperty('positions');
        expect(
          (userUpdate?.payload?.['sports'] as Array<Record<string, unknown>>)[0]
        ).not.toHaveProperty('team');
        expect(userUpdate?.payload).toHaveProperty('coachTitle');
        expect(userUpdate?.payload?.['coachTitle']).not.toBe('Head Coach');
        expect(response.body?.user).not.toHaveProperty('primarySport');

        const storedUser = __getMockFirestoreDocument('Users/coach123');
        expect(storedUser?.['coachTitle']).toBeUndefined();
        expect(storedUser?.['sports']).toMatchObject([
          {
            sport: 'Football',
            order: 0,
          },
        ]);
        expect((storedUser?.['sports'] as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
          'team'
        );
        expect((storedUser?.['sports'] as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
          'positions'
        );
      });

      it('drops placeholder teams on onboarding retries without userType', async () => {
        __seedMockFirestoreDocument('Users/coach123', {
          id: 'coach123',
          role: 'coach',
          onboardingCompleted: false,
          sports: [
            {
              sport: 'Football',
              order: 0,
              team: {
                title: 'Head Coach',
                type: 'high-school',
              },
            },
          ],
        });

        const response = await request(app)
          .post('/api/v1/auth/profile/onboarding')
          .send({
            userId: 'coach123',
            sport: 'Football',
            positions: ['Quarterback'],
            city: 'Alcoa',
            state: 'TN',
          });

        expect(response.status).toBe(200);

        const userUpdate = __getMockFirestoreWrites().find(
          (write) => write.path === 'Users/coach123' && write.operation === 'update'
        );

        expect(userUpdate).toBeDefined();
        const updatedSport = (userUpdate?.payload?.['sports'] as Array<Record<string, unknown>>)[0];
        expect(updatedSport).not.toHaveProperty('positions');
        expect(updatedSport).toMatchObject({ sport: 'Football' });
        expect(updatedSport).not.toHaveProperty('team');
      });

      it('preserves athlete classOf on onboarding retries without userType', async () => {
        __seedMockFirestoreDocument('Users/athlete123', {
          id: 'athlete123',
          role: 'athlete',
          onboardingCompleted: false,
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'athlete123',
          sport: 'Basketball',
          classOf: 2027,
        });

        expect(response.status).toBe(200);

        const userUpdate = __getMockFirestoreWrites().find(
          (write) => write.path === 'Users/athlete123' && write.operation === 'update'
        );

        expect(userUpdate).toBeDefined();
        expect(userUpdate?.payload).toMatchObject({
          classOf: 2027,
        });
      });

      it('routes completed athlete signups to the athlete Slack target and welcome campaign', async () => {
        __seedMockFirestoreDocument('Users/athlete-alert-1', {
          id: 'athlete-alert-1',
          email: 'athlete@example.com',
          role: 'athlete',
          onboardingCompleted: false,
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'athlete-alert-1',
          userType: 'athlete',
          firstName: 'Ava',
          lastName: 'Stone',
          sport: 'Basketball',
        });

        expect(response.status).toBe(200);
        expect(publishSignupCompletedDomainEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'athlete-alert-1',
            role: 'athlete',
            primarySport: 'Basketball',
            email: 'athlete@example.com',
          })
        );
        expect(sendSlackAlert).not.toHaveBeenCalled();
        expect(sendWelcomeOnboardingEmail).not.toHaveBeenCalled();
        expect(enqueueSignupNotionDashboardEntry).not.toHaveBeenCalled();
      });

      it('routes completed team-role signups to the team Slack target and team welcome variant', async () => {
        __seedMockFirestoreDocument('Users/coach-alert-1', {
          id: 'coach-alert-1',
          email: 'coach@example.com',
          role: 'coach',
          onboardingCompleted: false,
        });

        vi.mocked(sendWelcomeOnboardingEmail).mockResolvedValue({
          status: 'sent',
          email: 'coach@example.com',
          campaignKey: 'welcome_intro_team',
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'coach-alert-1',
          userType: 'coach',
          firstName: 'Jordan',
          lastName: 'Reed',
          sport: 'Football',
          organization: 'Alcoa Football',
        });

        expect(response.status).toBe(200);
        expect(publishSignupCompletedDomainEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'coach-alert-1',
            role: 'coach',
            primarySport: 'Football',
          })
        );
        expect(sendSlackAlert).not.toHaveBeenCalled();
        expect(sendWelcomeOnboardingEmail).not.toHaveBeenCalled();
      });

      it('uses the staging environment when staging onboarding completes', async () => {
        __seedMockFirestoreDocument('Users/staging-alert-1', {
          id: 'staging-alert-1',
          email: 'staging@example.com',
          role: 'athlete',
          onboardingCompleted: false,
        });

        const response = await request(app).post('/api/v1/staging/auth/profile/onboarding').send({
          userId: 'staging-alert-1',
          userType: 'athlete',
          firstName: 'Taylor',
          lastName: 'North',
          sport: 'Basketball',
        });

        expect(response.status).toBe(200);
        expect(publishSignupCompletedDomainEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'staging-alert-1',
            environment: 'staging',
          })
        );
      });

      it('keeps onboarding successful when the signup outbox enqueue fails', async () => {
        vi.mocked(publishSignupCompletedDomainEvent).mockRejectedValueOnce(
          new Error('Outbox unavailable')
        );
        __seedMockFirestoreDocument('Users/notion-fail-1', {
          id: 'notion-fail-1',
          email: 'notion-fail@example.com',
          role: 'athlete',
          onboardingCompleted: false,
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'notion-fail-1',
          userType: 'athlete',
          firstName: 'Morgan',
          lastName: 'Vale',
          sport: 'Soccer',
        });

        expect(response.status).toBe(200);
        expect(response.body?.success).toBe(true);

        const storedUser = __getMockFirestoreDocument('Users/notion-fail-1');
        expect(storedUser?.['onboardingCompleted']).toBe(true);
      });

      it('does not resend signup Slack or welcome email when lifecycle markers already exist', async () => {
        __seedMockFirestoreDocument('Users/retry-alert-1', {
          id: 'retry-alert-1',
          email: 'retry@example.com',
          role: 'athlete',
          onboardingCompleted: false,
          lifecycle: {
            signup: {
              completedSlackAlertSentAt: { seconds: 1, nanoseconds: 0 },
              welcomeEmailSentAt: { seconds: 1, nanoseconds: 0 },
            },
          },
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'retry-alert-1',
          userType: 'athlete',
          firstName: 'Casey',
          lastName: 'Lane',
          sport: 'Basketball',
        });

        expect(response.status).toBe(200);
        expect(sendSlackAlert).not.toHaveBeenCalled();
        expect(sendWelcomeOnboardingEmail).not.toHaveBeenCalled();
        expect(publishSignupCompletedDomainEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'retry-alert-1',
          })
        );
      });

      it('does not duplicate the signup outbox event when the signup dashboard marker exists', async () => {
        __seedMockFirestoreDocument('Users/retry-notion-1', {
          id: 'retry-notion-1',
          email: 'retry-notion@example.com',
          role: 'athlete',
          onboardingCompleted: false,
          lifecycle: {
            signup: {
              notionDashboard: {
                status: 'created',
                createdAt: { seconds: 1, nanoseconds: 0 },
                pageId: 'notion-page-1',
              },
            },
          },
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'retry-notion-1',
          userType: 'athlete',
          firstName: 'Riley',
          lastName: 'Cole',
          sport: 'Basketball',
        });

        expect(response.status).toBe(200);
        expect(publishSignupCompletedDomainEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'retry-notion-1',
            firstName: 'Riley',
            lastName: 'Cole',
            primarySport: 'Basketball',
          })
        );
      });

      it('reuses existing sports on bulk retries without preserving placeholder teams', async () => {
        __seedMockFirestoreDocument('Users/coach123', {
          id: 'coach123',
          role: 'coach',
          onboardingCompleted: false,
          sports: [
            {
              sport: 'Football',
              order: 0,
              positions: ['Quarterback'],
              team: {
                title: 'Head Coach',
                type: 'high-school',
              },
            },
          ],
        });

        const response = await request(app).post('/api/v1/auth/profile/onboarding').send({
          userId: 'coach123',
        });

        expect(response.status).toBe(200);

        const userUpdate = __getMockFirestoreWrites().find(
          (write) => write.path === 'Users/coach123' && write.operation === 'update'
        );

        expect(userUpdate).toBeDefined();
        const updatedSport = (userUpdate?.payload?.['sports'] as Array<Record<string, unknown>>)[0];
        expect(updatedSport).not.toHaveProperty('positions');
        expect(updatedSport).toMatchObject({ sport: 'Football' });
        expect(updatedSport).not.toHaveProperty('team');
      });
    });

    describe('POST /api/v1/auth/profile/onboarding-step', () => {
      it('should return 400 when body is empty', async () => {
        const response = await request(app).post('/api/v1/auth/profile/onboarding-step').send({});
        expect(response.status).toBe(400);
      });

      it('should return 400 when stepId is missing', async () => {
        const response = await request(app)
          .post('/api/v1/auth/profile/onboarding-step')
          .send({ userId: 'user123', stepData: { role: 'athlete' } });
        expect(response.status).toBe(400);
      });

      it('should return 400 when stepData is missing', async () => {
        const response = await request(app)
          .post('/api/v1/auth/profile/onboarding-step')
          .send({ userId: 'user123', stepId: 'role' });
        expect(response.status).toBe(400);
      });

      it('strips stale positions for team-role users on organization step updates', async () => {
        __seedMockFirestoreDocument('Users/coach123', {
          id: 'coach123',
          role: 'coach',
          onboardingCompleted: false,
          sports: [
            {
              sport: 'Football',
              order: 0,
              positions: ['Quarterback'],
              team: {
                name: 'Alcoa',
                title: 'Head Coach',
                type: 'high-school',
              },
            },
          ],
        });

        const response = await request(app)
          .post('/api/v1/auth/profile/onboarding-step')
          .send({
            userId: 'coach123',
            stepId: 'organization',
            stepData: {
              organization: 'Alcoa Football',
            },
          });

        expect(response.status).toBe(200);

        const userUpdate = __getMockFirestoreWrites().find(
          (write) => write.path === 'Users/coach123' && write.operation === 'update'
        );

        expect(userUpdate).toBeDefined();
        const updatedSport = (userUpdate?.payload?.['sports'] as Array<Record<string, unknown>>)[0];
        expect(updatedSport).not.toHaveProperty('positions');
        expect(userUpdate?.payload).not.toHaveProperty('primarySport');
        expect(updatedSport).toMatchObject({
          sport: 'Football',
          team: {
            name: 'Alcoa Football',
            title: 'Head Coach',
            type: 'high-school',
          },
        });
      });

      it('does not persist the legacy primarySport field on sport step updates', async () => {
        __seedMockFirestoreDocument('Users/athlete123', {
          id: 'athlete123',
          role: 'athlete',
          onboardingCompleted: false,
        });

        const response = await request(app)
          .post('/api/v1/auth/profile/onboarding-step')
          .send({
            userId: 'athlete123',
            stepId: 'sport',
            stepData: {
              primarySport: 'Basketball',
            },
          });

        expect(response.status).toBe(200);

        const userUpdate = __getMockFirestoreWrites().find(
          (write) => write.path === 'Users/athlete123' && write.operation === 'update'
        );

        expect(userUpdate).toBeDefined();
        expect(userUpdate?.payload).toMatchObject({
          sports: [
            {
              sport: 'Basketball',
              order: 0,
            },
          ],
          activeSportIndex: 0,
        });
        expect(userUpdate?.payload).not.toHaveProperty('primarySport');
      });

      it('does not persist placeholder team data on coach sport step updates without a selected program', async () => {
        __seedMockFirestoreDocument('Users/coach123', {
          id: 'coach123',
          role: 'coach',
          coachTitle: 'Head Coach',
          onboardingCompleted: false,
        });

        const response = await request(app)
          .post('/api/v1/auth/profile/onboarding-step')
          .send({
            userId: 'coach123',
            stepId: 'sport',
            stepData: {
              primarySport: 'Football',
            },
          });

        expect(response.status).toBe(200);

        const userUpdate = __getMockFirestoreWrites().find(
          (write) => write.path === 'Users/coach123' && write.operation === 'update'
        );

        expect(userUpdate).toBeDefined();
        const updatedSport = (userUpdate?.payload?.['sports'] as Array<Record<string, unknown>>)[0];
        expect(updatedSport).toMatchObject({
          sport: 'Football',
          order: 0,
        });
        expect(updatedSport).not.toHaveProperty('team');
      });
    });
  });
});
