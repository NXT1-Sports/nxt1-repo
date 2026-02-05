/**
 * @fileoverview Admin Users Routes Tests
 * @module @nxt1/backend/routes/__tests__/admin/users
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../index.js';

describe('Admin Users Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/admin/users should return 501', async () => {
      const response = await request(app).get('/api/v1/admin/users');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('PUT /api/v1/admin/users/:uid should return 501', async () => {
      const response = await request(app).put('/api/v1/admin/users/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('DELETE /api/v1/admin/users/:uid should return 501', async () => {
      const response = await request(app).delete('/api/v1/admin/users/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/admin/users should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/admin/users');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('PUT /api/v1/staging/admin/users/:uid should return 501', async () => {
      const response = await request(app).put('/api/v1/staging/admin/users/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('DELETE /api/v1/staging/admin/users/:uid should return 501', async () => {
      const response = await request(app).delete('/api/v1/staging/admin/users/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
