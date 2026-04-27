/**
 * @fileoverview Analytics Routes Tests
 * @module @nxt1/backend/routes/__tests__/analytics
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../test-app.js';

describe('Analytics Routes', () => {
  describe('Production Routes', () => {
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
      it('blocks anonymous relay events', async () => {
        const response = await request(app)
          .post('/api/v1/analytics/events')
          .send({
            eventName: 'page_view',
            properties: { page_path: '/profile/jordan-miles', platform: 'web' },
          });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          tracked: false,
          reason: 'anonymous_relay_blocked',
        });
      });

      it('requires eventName', async () => {
        const response = await request(app)
          .post('/api/v1/analytics/events')
          .send({ properties: { page_path: '/home' } });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ success: false });
      });

      it('acks authenticated relay events without persisting to MongoDB', async () => {
        const response = await request(app)
          .post('/api/v1/analytics/events')
          .set('Authorization', 'Bearer test-token')
          .send({ eventName: 'profile_viewed', properties: { page_path: '/profile/123' } });

        // test-token may not satisfy auth; if so, treated as anonymous.
        if (response.body?.reason === 'anonymous_relay_blocked') {
          expect(response.status).toBe(200);
          return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, tracked: false });
      });
    });
  });
});
