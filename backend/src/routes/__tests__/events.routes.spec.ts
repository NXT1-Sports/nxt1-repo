/**
 * @fileoverview Events Routes Tests
 * @module @nxt1/backend/routes/__tests__/events
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Events Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/events.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the event detail route', () => {
    expectExpressRouter(router, [{ path: '/:id', method: 'get' }]);
  });
});
