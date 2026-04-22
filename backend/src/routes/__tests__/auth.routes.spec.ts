/**
 * @fileoverview Auth Routes Tests
 * @module @nxt1/backend/routes/__tests__/auth
 */

import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  __getMockFirestoreDocument,
  __getMockFirestoreWrites,
  __resetMockFirestore,
  __seedMockFirestoreDocument,
} from '../../test-app.js';
import app from '../../test-app.js';

describe('Auth Routes', () => {
  beforeEach(() => {
    __resetMockFirestore();
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
            dismissedPrompts: [],
            defaultSportIndex: 0,
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
          dismissedPrompts: [],
          defaultSportIndex: 0,
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
