/**
 * @fileoverview Users Routes Tests
 * @module @nxt1/backend/routes/__tests__/users
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('Users Routes', () => {
  describe('Production Routes', () => {
    it('GET /api/v1/users/search should return 501', async () => {
      const response = await request(app).get('/api/v1/users/search');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });

  describe('Staging Routes', () => {
    it('GET /api/v1/staging/users/search should return 501', async () => {
      const response = await request(app).get('/api/v1/staging/users/search');
      expect(response.status).toBe(501);
      expect(response.body).toEqual({ success: false, error: 'Not implemented' });
    });
  });
});
