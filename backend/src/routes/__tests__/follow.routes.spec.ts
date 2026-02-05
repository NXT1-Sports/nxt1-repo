/**
 * @fileoverview Follow Routes Tests
 * @module @nxt1/backend/routes/__tests__/follow
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Follow Routes', () => {
  describe('Production Routes', () => {
    it('POST /api/v1/follow should return 501', async () => {
      const response = await request(app).post('/api/v1/follow');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('DELETE /api/v1/follow should return 501', async () => {
      const response = await request(app).delete('/api/v1/follow');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/follow/followers/:userId should return 501', async () => {
      const response = await request(app).get('/api/v1/follow/followers/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/follow/following/:userId should return 501', async () => {
      const response = await request(app).get('/api/v1/follow/following/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('POST /api/v1/staging/follow should return 501', async () => {
      const response = await request(app).post('/api/v1/staging/follow');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/staging/follow/followers/:userId should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/follow/followers/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
