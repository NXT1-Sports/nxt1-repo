/**
 * @fileoverview Invite Routes Tests
 * @module @nxt1/backend/routes/__tests__/invite
 */

import { describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

// Imported statically so the (large) route dependency graph loads during
// collection instead of inside a timeout-bounded hook.
import router from '../../routes/core/invite.routes.js';

describe('Invite Routes', () => {
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
