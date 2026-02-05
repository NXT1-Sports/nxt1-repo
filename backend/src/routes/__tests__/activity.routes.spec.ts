/**
 * @fileoverview Activity Routes Tests
 * @module @nxt1/backend/routes/__tests__/activity
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Activity Routes', () => {
  describe('Production Routes', () => {
    describe('GET /api/v1/activity/feed', () => {
      it('should return 501 Not Implemented', async () => {
        const response = await request(app).get('/api/v1/activity/feed');
        expect(response.status).toBe(501);
        expect(response.body).toEqual({
          success: false,
          error: 'Not implemented',
        });
      });
    });

    describe('GET /api/v1/activity/badges', () => {
      it('should return 501 Not Implemented', async () => {
        const response = await request(app).get('/api/v1/activity/badges');
        expect(response.status).toBe(501);
        expect(response.body).toEqual({
          success: false,
          error: 'Not implemented',
        });
      });
    });

    describe('POST /api/v1/activity/read', () => {
      it('should return 501 Not Implemented', async () => {
        const response = await request(app).post('/api/v1/activity/read');
        expect(response.status).toBe(501);
        expect(response.body).toEqual({
          success: false,
          error: 'Not implemented',
        });
      });
    });

    describe('POST /api/v1/activity/read-all', () => {
      it('should return 501 Not Implemented', async () => {
        const response = await request(app).post('/api/v1/activity/read-all');
        expect(response.status).toBe(501);
        expect(response.body).toEqual({
          success: false,
          error: 'Not implemented',
        });
      });
    });
  });

  describe('Staging Routes', () => {
    describe('GET /api/v1/staging/activity/feed', () => {
      it('should return 501 Not Implemented', async () => {
        const response = await request(app).get('/api/v1/staging/activity/feed');
        expect(response.status).toBe(501);
        expect(response.body).toEqual({
          success: false,
          error: 'Not implemented',
        });
      });
    });

    describe('GET /api/v1/staging/activity/badges', () => {
      it('should return 501 Not Implemented', async () => {
        const response = await request(app).get('/api/v1/staging/activity/badges');
        expect(response.status).toBe(501);
        expect(response.body).toEqual({
          success: false,
          error: 'Not implemented',
        });
      });
    });

    describe('POST /api/v1/staging/activity/read', () => {
      it('should return 501 Not Implemented', async () => {
        const response = await request(app).post('/api/v1/staging/activity/read');
        expect(response.status).toBe(501);
        expect(response.body).toEqual({
          success: false,
          error: 'Not implemented',
        });
      });
    });
  });
});
