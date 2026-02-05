/**
 * @fileoverview Admin Plans Routes Tests
 * @module @nxt1/backend/routes/__tests__/admin/plans
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../index.js';

describe('Admin Plans Routes', () => {
  describe('Production Routes', () => {
    it('POST /api/v1/admin/plan/create should return 501', async () => {
      const response = await request(app).post('/api/v1/admin/plan/create');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/admin/plan/list should return 501', async () => {
      const response = await request(app).get('/api/v1/admin/plan/list');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/admin/plan/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/admin/plan/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('PUT /api/v1/admin/plan/:id should return 501', async () => {
      const response = await request(app).put('/api/v1/admin/plan/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('POST /api/v1/staging/admin/plan/create should return 501', async () => {
      const response = await request(app).post('/api/v1/staging/admin/plan/create');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/staging/admin/plan/list should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/admin/plan/list');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
