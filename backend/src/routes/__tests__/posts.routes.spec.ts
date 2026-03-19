/**
 * @fileoverview Posts Routes Tests
 * @module @nxt1/backend/routes/__tests__/posts
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Posts Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/posts.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the post endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/drafts', method: 'get' },
        { path: '/drafts', method: 'post' },
        { path: '/drafts/:id', method: 'put' },
        { path: '/drafts/:id', method: 'delete' },
        { path: '/xp-preview', method: 'post' },
        { path: '/media', method: 'post' },
        { path: '/', method: 'post' },
        { path: '/:id', method: 'get' },
        { path: '/:id/like', method: 'post' },
        { path: '/:id/comments', method: 'get' },
      ],
      10
    );
  });
});
