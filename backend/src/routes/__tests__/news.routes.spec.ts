/**
 * @fileoverview News Routes Tests
 * @module @nxt1/backend/routes/__tests__/news
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('News Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/news.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the news endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/', method: 'get' },
        { path: '/trending', method: 'get' },
        { path: '/search', method: 'get' },
        { path: '/stats', method: 'get' },
        { path: '/:id', method: 'get' },
        { path: '/:id/bookmark', method: 'post' },
        { path: '/generate', method: 'post' },
      ],
      7
    );
  });
});
