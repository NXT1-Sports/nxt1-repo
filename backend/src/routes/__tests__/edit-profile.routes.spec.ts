/**
 * @fileoverview Edit Profile Routes Tests
 * @module @nxt1/backend/routes/__tests__/edit-profile
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Edit Profile Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/profile/:uid/edit should return 501', async () => {
      const response = await request(app).get('/api/v1/profile/test-uid/edit');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('PUT /api/v1/profile/:uid/section/:sectionId should return 501', async () => {
      const response = await request(app).put('/api/v1/profile/test-uid/section/about');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/profile/:uid/completion should return 501', async () => {
      const response = await request(app).get('/api/v1/profile/test-uid/completion');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/profile/:uid/photo should return 501', async () => {
      const response = await request(app).post('/api/v1/profile/test-uid/photo');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('DELETE /api/v1/profile/:uid/photo/:type should return 501', async () => {
      const response = await request(app).delete('/api/v1/profile/test-uid/photo/profile');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/profile/:uid/edit should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/profile/test-uid/edit');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('PUT /api/v1/staging/profile/:uid/section/:sectionId should return 501', async () => {
      const response = await request(app).put('/api/v1/staging/profile/test-uid/section/about');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
