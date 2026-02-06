/**
 * @fileoverview Help Center Routes Tests
 * @module @nxt1/backend/routes/__tests__/help-center
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Help Center Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/help-center/articles should return 501', async () => {
      const response = await request(app).get('/api/v1/help-center/articles');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/help-center/articles/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/help-center/articles/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/help-center/search should return 501', async () => {
      const response = await request(app).get('/api/v1/help-center/search');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/help-center/tickets should return 501', async () => {
      const response = await request(app).post('/api/v1/help-center/tickets');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/help-center/faq should return 501', async () => {
      const response = await request(app).get('/api/v1/help-center/faq');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/help-center/articles should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/help-center/articles');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/staging/help-center/articles/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/help-center/articles/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
