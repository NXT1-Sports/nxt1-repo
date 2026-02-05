/**
 * @fileoverview Posts Routes Tests
 * @module @nxt1/backend/routes/__tests__/posts
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Posts Routes', () => {
  describe('Production Routes', () => {
    it('POST /api/v1/posts should return 501', async () => {
      const response = await request(app).post('/api/v1/posts');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/posts/media should return 501', async () => {
      const response = await request(app).post('/api/v1/posts/media');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/posts/drafts should return 501', async () => {
      const response = await request(app).get('/api/v1/posts/drafts');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/posts/drafts should return 501', async () => {
      const response = await request(app).post('/api/v1/posts/drafts');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('DELETE /api/v1/posts/drafts/:id should return 501', async () => {
      const response = await request(app).delete('/api/v1/posts/drafts/test123');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('POST /api/v1/posts/xp-preview should return 501', async () => {
      const response = await request(app).post('/api/v1/posts/xp-preview');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('POST /api/v1/staging/posts should return 501', async () => {
      const response = await request(app).post('/api/v1/staging/posts');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });

    it('GET /api/v1/staging/posts/drafts should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/posts/drafts');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
