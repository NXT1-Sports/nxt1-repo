/**
 * @fileoverview Explore Routes Tests
 * @module @nxt1/backend/routes/__tests__/explore
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Explore Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/explore.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the explore endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/search', method: 'get' },
        { path: '/suggestions', method: 'get' },
        { path: '/trending', method: 'get' },
        { path: '/counts', method: 'get' },
      ],
      4
    );
  });
});
