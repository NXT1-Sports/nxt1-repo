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
  let router: ReturnType<typeof import('express').Router>;

  beforeAll(async () => {
    const module = await import('../../routes/feed/activity.routes.js');
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
    type ExpressLayer = { route?: { path: string; methods: Record<string, boolean> } };
    const routes = (stack as ExpressLayer[])
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route!.path,
        methods: Object.keys(layer.route!.methods),
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
        (r) => r.path === expected.path && r.methods.includes(expected.method)
      );
      expect(found, `Expected ${expected.method.toUpperCase()} ${expected.path}`).toBeTruthy();
    }
  });
});
