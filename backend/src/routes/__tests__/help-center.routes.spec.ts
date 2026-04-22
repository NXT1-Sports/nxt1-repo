/**
 * @fileoverview Help Center Routes Tests
 * @module @nxt1/backend/routes/__tests__/help-center
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Help Center Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/platform/help-center.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the help center endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/', method: 'get' },
        { path: '/categories/:id', method: 'get' },
        { path: '/articles/:slug', method: 'get' },
        { path: '/search', method: 'get' },
        { path: '/faqs', method: 'get' },
        { path: '/articles/:id/feedback', method: 'post' },
        { path: '/chat', method: 'post' },
        { path: '/support', method: 'post' },
      ],
      8
    );
  });
});
