/**
 * @fileoverview Admin Dashboard Routes Tests
 * @module @nxt1/backend/routes/__tests__/admin/dashboard
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../index.js';

describe('Admin Dashboard Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/admin/dashboard should return 501', async () => {
      const response = await request(app).get('/api/v1/admin/dashboard');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/admin/migrate/offer-logos should return 501', async () => {
      const response = await request(app).post('/api/v1/admin/migrate/offer-logos');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/admin/dashboard should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/admin/dashboard');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/staging/admin/migrate/offer-logos should return 501', async () => {
      const response = await request(app).post('/api/v1/staging/admin/migrate/offer-logos');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
