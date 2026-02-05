/**
 * @fileoverview Help Routes Tests
 * @module @nxt1/backend/routes/__tests__/help
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Help Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/help/articles should return 501', async () => {
      const response = await request(app).get('/api/v1/help/articles');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/help/articles/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/help/articles/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/help/search should return 501', async () => {
      const response = await request(app).get('/api/v1/help/search');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/help/tickets should return 501', async () => {
      const response = await request(app).post('/api/v1/help/tickets');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/help/faq should return 501', async () => {
      const response = await request(app).get('/api/v1/help/faq');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/help/articles should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/help/articles');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/staging/help/articles/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/help/articles/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
