/**
 * @fileoverview Auth Routes Tests
 * @module @nxt1/backend/routes/__tests__/auth
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../test-app.js';

describe('Auth Routes', () => {
  describe('Production Routes', () => {
    describe('Team Code Validation', () => {
      it('GET /api/v1/auth/validate-team-code should return 400 when teamCode is missing', async () => {
        const response = await request(app).get('/api/v1/auth/validate-team-code');
        expect(response.status).toBe(400);
      });
    });

    describe('User Creation', () => {
      it('POST /api/v1/auth/users should return 400 when request body is invalid', async () => {
        const response = await request(app).post('/api/v1/auth/users').send({});
        expect(response.status).toBe(400);
      });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/auth/validate-team-code should return 400 when teamCode is missing', async () => {
      const response = await request(app).get('/api/v1/staging/auth/validate-team-code');
      expect(response.status).toBe(400);
    });

    it('POST /api/v1/staging/auth/users should return 400 when request body is invalid', async () => {
      const response = await request(app).post('/api/v1/staging/auth/users').send({});
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
    });
  });
});
