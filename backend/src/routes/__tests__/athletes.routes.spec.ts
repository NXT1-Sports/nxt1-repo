/**
 * @fileoverview Athletes Routes Tests
 * @module @nxt1/backend/routes/__tests__/athletes
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Athletes Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/athletes/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/athletes/test-athlete-id');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/athletes/:id should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/athletes/test-athlete-id');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
