/**
 * @fileoverview Profile Routes Tests
 * @module @nxt1/backend/routes/__tests__/profile
 */

import 'reflect-metadata';
import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Profile Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/profile/index.js');
    router = module.default;
  }, 15_000);

  it('should register the profile endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/me', method: 'get' },
        { path: '/unicode/:unicode', method: 'get' },
        { path: '/search', method: 'get' },
        { path: '/:userId', method: 'get' },
        { path: '/:userId', method: 'put' },
        { path: '/:userId/image', method: 'post' },
        { path: '/:userId/sport', method: 'put' },
        { path: '/:userId/sport', method: 'post' },
        { path: '/:userId/sport/:sportIndex', method: 'delete' },
      ],
      9
    );
  });
});
