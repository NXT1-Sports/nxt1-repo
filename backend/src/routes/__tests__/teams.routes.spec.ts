/**
 * @fileoverview Teams Routes Tests
 * @module @nxt1/backend/routes/__tests__/teams
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Teams Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/teams.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the team endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/', method: 'get' },
        { path: '/all', method: 'get' },
        { path: '/:id', method: 'get' },
        { path: '/code/:teamCode', method: 'get' },
        { path: '/by-slug/:slug', method: 'get' },
        { path: '/:id', method: 'patch' },
        { path: '/:teamCode/join', method: 'post' },
        { path: '/:id/invite', method: 'post' },
        { path: '/user/my-teams', method: 'get' },
        { path: '/:teamId/events', method: 'get' },
        { path: '/:id/view', method: 'post' },
      ],
      11
    );
  });
});
