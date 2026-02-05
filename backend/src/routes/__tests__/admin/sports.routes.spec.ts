/**
 * @fileoverview Admin Sports Routes Tests
 * @module @nxt1/backend/routes/__tests__/admin/sports
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../index.js';

describe('Admin Sports Routes', () => {
  describe('Production Routes', () => {
    it('POST /api/v1/admin/sports/add should return 501', async () => {
      const response = await request(app).post('/api/v1/admin/sports/add');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/admin/sports/logo should return 501', async () => {
      const response = await request(app).post('/api/v1/admin/sports/logo');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/admin/sports should return 501', async () => {
      const response = await request(app).get('/api/v1/admin/sports');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/admin/sports/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/admin/sports/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('PUT /api/v1/admin/sports/:id should return 501', async () => {
      const response = await request(app).put('/api/v1/admin/sports/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('POST /api/v1/staging/admin/sports/add should return 501', async () => {
      const response = await request(app).post('/api/v1/staging/admin/sports/add');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/staging/admin/sports should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/admin/sports');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
