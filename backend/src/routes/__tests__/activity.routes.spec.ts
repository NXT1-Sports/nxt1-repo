/**
 * @fileoverview Activity Routes Tests
 * @module @nxt1/backend/routes/__tests__/activity
 *
 * Unit tests for the activity router module.
 * Integration tests (supertest) require a running database and Redis
 * and are exercised in the CI/staging environment.
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('Activity Routes', () => {
  let router: any;

  beforeAll(async () => {
    const module = await import('../../routes/activity.routes.js');
    router = module.default;
  }, 15_000);

  it('should export a valid Express router', () => {
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  it('should have route handlers registered', () => {
    // Express Router stores routes in router.stack
    const stack = router.stack;
    expect(Array.isArray(stack)).toBe(true);
    expect(stack.length).toBeGreaterThan(0);
  });

  it('should have all expected route paths', () => {
    const stack = router.stack;

    // Extract route paths from the router stack
    const routes = stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));

    // Verify all expected endpoints exist
    const expectedRoutes = [
      { path: '/feed', method: 'get' },
      { path: '/badges', method: 'get' },
      { path: '/summary', method: 'get' },
      { path: '/:id', method: 'get' },
      { path: '/read', method: 'post' },
      { path: '/read-all', method: 'post' },
      { path: '/archive', method: 'post' },
      { path: '/archived', method: 'get' },
      { path: '/archived/restore', method: 'post' },
    ];

    for (const expected of expectedRoutes) {
      const found = routes.find(
        (r: any) => r.path === expected.path && r.methods.includes(expected.method)
      );
      expect(found, `Expected ${expected.method.toUpperCase()} ${expected.path}`).toBeTruthy();
    }
  });
});
