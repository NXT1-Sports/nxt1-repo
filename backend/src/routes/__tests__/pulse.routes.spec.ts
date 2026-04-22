/**
 * @fileoverview Pulse Routes Tests
 * @module @nxt1/backend/routes/__tests__/pulse
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Pulse Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/feed/pulse.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the pulse endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/', method: 'get' },
        { path: '/trending', method: 'get' },
        { path: '/search', method: 'get' },
        { path: '/:id', method: 'get' },
      ],
      4
    );
  });
});
