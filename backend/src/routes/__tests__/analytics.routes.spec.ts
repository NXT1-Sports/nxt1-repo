/**
 * @fileoverview Analytics Routes Tests
 * @module @nxt1/backend/routes/__tests__/analytics
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../test-app.js';

describe('Analytics Routes', () => {
  describe('Production Routes', () => {
    describe('GET /api/v1/analytics/report', () => {
      it('should require authentication', async () => {
        const response = await request(app).get('/api/v1/analytics/report');
        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/v1/analytics/overview', () => {
      it('should require authentication', async () => {
        const response = await request(app).get('/api/v1/analytics/overview');
        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/v1/analytics/engagement', () => {
      it('should require authentication', async () => {
        const response = await request(app).get('/api/v1/analytics/engagement');
        expect(response.status).toBe(401);
      });
    });

    describe('POST /api/v1/analytics/export', () => {
      it('should require authentication', async () => {
        const response = await request(app).post('/api/v1/analytics/export');
        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/v1/analytics/track/open', () => {
      it('should return a tracking pixel without authentication', async () => {
        const response = await request(app).get(
          '/api/v1/analytics/track/open?subjectId=test-user&messageId=msg_123'
        );

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('image/gif');
      });
    });

    describe('GET /api/v1/analytics/track/click', () => {
      it('should redirect to the provided destination without authentication', async () => {
        const response = await request(app).get(
          '/api/v1/analytics/track/click?subjectId=test-user&destination=https%3A%2F%2Fexample.com%2Fprofile'
        );

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('https://example.com/profile');
      });

      it('should reject unsafe destinations', async () => {
        const response = await request(app).get(
          '/api/v1/analytics/track/click?subjectId=test-user&destination=javascript%3Aalert(1)'
        );

        expect(response.status).toBe(400);
      });
    });

    describe('POST /api/v1/analytics/events', () => {
      it('accepts backend-owned web analytics relay events without Firebase dependencies', async () => {
        const response = await request(app)
          .post('/api/v1/analytics/events')
          .send({
            eventName: 'page_view',
            userId: 'user-123',
            properties: {
              page_path: '/profile/jordan-miles',
              platform: 'web',
            },
          });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, tracked: true });
      });
    });
  });

  describe('Staging Routes', () => {
    describe('GET /api/v1/staging/analytics/report', () => {
      it('should require authentication', async () => {
        const response = await request(app).get('/api/v1/staging/analytics/report');
        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/v1/staging/analytics/overview', () => {
      it('should require authentication', async () => {
        const response = await request(app).get('/api/v1/staging/analytics/overview');
        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/v1/staging/analytics/engagement', () => {
      it('should require authentication', async () => {
        const response = await request(app).get('/api/v1/staging/analytics/engagement');
        expect(response.status).toBe(401);
      });
    });
  });
});
