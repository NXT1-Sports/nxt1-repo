/**
 * @fileoverview Posts Routes Tests
 * @module @nxt1/backend/routes/__tests__/posts
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../test-app.js';

describe('Posts Routes', () => {
  it('should export the single post lookup route', async () => {
    const module = await import('../../routes/feed/posts.routes.js');
    const router = module.default;

    type ExpressLayer = { route?: { path: string; methods: Record<string, boolean> } };
    const routes = (router.stack as ExpressLayer[])
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route!.path,
        methods: Object.keys(layer.route!.methods),
      }));

    const found = routes.find(
      (route) => route.path === '/:postId' && route.methods.includes('get')
    );
    expect(found, 'Expected GET /:postId').toBeTruthy();
  });

  it('mounts the production single post lookup route', async () => {
    const invalidPostId = 'x'.repeat(129);

    const response = await request(app).get(`/api/v1/feed/posts/${invalidPostId}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: 'Invalid postId' });
  });

  it('mounts the staging single post lookup route', async () => {
    const invalidPostId = 'x'.repeat(129);

    const response = await request(app).get(`/api/v1/staging/feed/posts/${invalidPostId}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: 'Invalid postId' });
  });
});
