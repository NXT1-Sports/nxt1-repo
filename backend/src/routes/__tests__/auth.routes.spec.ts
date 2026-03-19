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
});
