/**
 * @fileoverview Colleges Routes Tests
 * @module @nxt1/backend/routes/__tests__/colleges
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Colleges Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/colleges/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/colleges/test-college-id');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/colleges/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/colleges/test-college-id');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
