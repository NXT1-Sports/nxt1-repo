/**
 * @fileoverview Profile Routes Tests
 * @module @nxt1/backend/routes/__tests__/profile
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Profile Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/auth/profile/search should return 501 or 500', async () => {
      const response = await request(app).get('/api/v1/auth/profile/search');
      // Allow 500 (no Firebase in test env) or 501 (not implemented)
      expect([500, 501]).toContain(response.status);
    }, 12000); // 12 second timeout for Firestore queries

    it('GET /api/v1/auth/profile/username/:username should return 501', async () => {
      const response = await request(app).get('/api/v1/auth/profile/username/testuser');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/auth/profile/:userId should return 501 or 500', async () => {
      const response = await request(app).get('/api/v1/auth/profile/test-user-id');
      // Allow 500 (no Firebase in test env) or 501 (not implemented)
      expect([500, 501]).toContain(response.status);
    }, 12000); // 12 second timeout for Firestore queries

    it('PUT /api/v1/auth/profile/:userId should return 501', async () => {
      const response = await request(app).put('/api/v1/auth/profile/test-user-id');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/auth/profile/:userId/image should return 501', async () => {
      const response = await request(app).post('/api/v1/auth/profile/test-user-id/image');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/auth/profile/search should return 501 or 500', async () => {
      const response = await request(app).get('/api/v1/staging/auth/profile/search');
      // Allow 500 (no Firebase in test env) or 501 (not implemented)
      expect([500, 501]).toContain(response.status);
    }, 12000); // 12 second timeout for Firestore queries

    it('GET /api/v1/staging/auth/profile/:userId should return 501 or 500', async () => {
      const response = await request(app).get('/api/v1/staging/auth/profile/test-user-id');
      // Allow 500 (no Firebase in test env) or 501 (not implemented)
      expect([500, 501]).toContain(response.status);
    });
  });
});
