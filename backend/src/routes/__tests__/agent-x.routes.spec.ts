/**
 * @fileoverview Agent X Routes Tests
 * @module @nxt1/backend/routes/__tests__/agent-x
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Agent X Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/agent-x.routes.js');
    router = module.default;
  }, 15_000);

  it('should export a valid Express router', () => {
    expectExpressRouter(
      router,
      [
        { path: '/ask', method: 'post' },
        { path: '/status/:id', method: 'get' },
        { path: '/cancel/:id', method: 'post' },
        { path: '/history', method: 'get' },
        { path: '/operations-log', method: 'get' },
        { path: '/dashboard', method: 'get' },
        { path: '/threads', method: 'get' },
      ],
      7
    );
  });
});
