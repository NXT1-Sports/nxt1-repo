/**
 * @fileoverview Colleges Routes Tests
 * @module @nxt1/backend/routes/__tests__/colleges
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Colleges Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/colleges.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the filter route', () => {
    expectExpressRouter(router, [{ path: '/filter', method: 'get' }]);
  });
});
