/**
 * @fileoverview Feed Routes Tests
 * @module @nxt1/backend/routes/__tests__/feed
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Feed Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/feed.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the feed endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/', method: 'get' },
        { path: '/trending', method: 'get' },
        { path: '/discover', method: 'get' },
        { path: '/users/:uid', method: 'get' },
        { path: '/teams/:teamCode', method: 'get' },
      ],
      5
    );
  });
});
