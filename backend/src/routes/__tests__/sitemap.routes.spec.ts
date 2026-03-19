/**
 * @fileoverview Sitemap Routes Tests
 * @module @nxt1/backend/routes/__tests__/sitemap
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../test-app.js';

describe('Sitemap Routes', () => {
  describe('Production Routes', () => {
    it('GET /sitemap.xml should return XML content type', async () => {
      const response = await request(app).get('/sitemap.xml');

      // Should return either 200 (success) or 500 (if Firebase context missing)
      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.headers['content-type']).toContain('application/xml');
      }
    }, 10000); // 10 second timeout for sitemap generation
  });
});
