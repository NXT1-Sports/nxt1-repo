/**
 * @fileoverview Edit Profile Routes Tests
 * @module @nxt1/backend/routes/__tests__/edit-profile
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Edit Profile Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/edit-profile.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the edit profile endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/:uid/edit', method: 'get' },
        { path: '/:uid/section/:sectionId', method: 'put' },
        { path: '/:uid/completion', method: 'get' },
        { path: '/:uid/photo', method: 'post' },
        { path: '/:uid/photo/:type', method: 'delete' },
        { path: '/:uid/active-sport-index', method: 'put' },
      ],
      6
    );
  });
});
