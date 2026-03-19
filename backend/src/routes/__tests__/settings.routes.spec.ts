/**
 * @fileoverview Settings Routes Tests
 * @module @nxt1/backend/routes/__tests__/settings
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Settings Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/settings.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the settings endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/preferences', method: 'get' },
        { path: '/preferences/:key', method: 'patch' },
        { path: '/preferences', method: 'patch' },
        { path: '/subscription', method: 'get' },
        { path: '/usage', method: 'get' },
        { path: '/providers', method: 'get' },
        { path: '/password', method: 'post' },
        { path: '/account', method: 'delete' },
      ],
      8
    );
  });
});
