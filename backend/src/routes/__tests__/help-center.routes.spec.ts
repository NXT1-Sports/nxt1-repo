/**
 * @fileoverview Help Center Routes Tests
 * @module @nxt1/backend/routes/__tests__/help-center
 */

import { describe, it } from 'vitest';
import { expectExpressRouter } from './route-test.utils.js';

// Imported statically so the (large) route dependency graph loads during
// collection instead of inside a timeout-bounded hook.
import router from '../../routes/platform/help-center.routes.js';

describe('Help Center Routes', () => {
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
