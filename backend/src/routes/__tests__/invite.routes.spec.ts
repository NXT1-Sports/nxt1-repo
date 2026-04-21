/**
 * @fileoverview Invite Routes Tests
 * @module @nxt1/backend/routes/__tests__/invite
 */

import { beforeAll, describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

describe('Invite Routes', () => {
  let router: unknown;

  beforeAll(async () => {
    const module = await import('../../routes/invite.routes.js');
    router = module.default;
  }, 15_000);

  it('should register the invite endpoints', () => {
    expectExpressRouter(
      router,
      [
        { path: '/link', method: 'post' },
        { path: '/send', method: 'post' },
        { path: '/send-bulk', method: 'post' },
        { path: '/history', method: 'get' },
        { path: '/validate', method: 'post' },
        { path: '/accept', method: 'post' },
        { path: '/team/:teamId/members', method: 'get' },
      ],
      7
    );
  });
});
