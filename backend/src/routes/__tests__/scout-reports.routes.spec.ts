/**
 * @fileoverview Scout Reports Routes Tests
 * @module @nxt1/backend/routes/__tests__/scout-reports
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../test-app.js';

describe('Scout Reports Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/scout-reports should return 501', async () => {
      const response = await request(app).get('/api/v1/scout-reports');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/scout-reports/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/scout-reports/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/scout-reports/search should return 501', async () => {
      const response = await request(app).get('/api/v1/scout-reports/search');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/scout-reports/:id/bookmark should return 501', async () => {
      const response = await request(app).post('/api/v1/scout-reports/test123/bookmark');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('DELETE /api/v1/scout-reports/:id/bookmark should return 501', async () => {
      const response = await request(app).delete('/api/v1/scout-reports/test123/bookmark');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/scout-reports should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/scout-reports');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/staging/scout-reports/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/scout-reports/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
