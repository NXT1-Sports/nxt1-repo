/**
 * @fileoverview Follow Routes Tests
 * @module @nxt1/backend/routes/__tests__/follow
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Follow Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/follow.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the follow endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/', method: 'post' },
        { path: '/', method: 'delete' },
        { path: '/followers/:userId', method: 'get' },
        { path: '/following/:userId', method: 'get' },
      ],
      4
    );
  });
});
