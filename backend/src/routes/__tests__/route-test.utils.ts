import { expect } from 'vitest';

export interface ExpectedRoute {
  path: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
}

export function expectExpressRouter(
  router: unknown,
  expectedRoutes: ExpectedRoute[],
  minimumRouteCount = 1
): void {
  expect(router).toBeDefined();
  expect(typeof router).toBe('function');

  const stack = (router as { stack?: unknown[] }).stack;
  expect(Array.isArray(stack)).toBe(true);
  expect(stack!.length).toBeGreaterThanOrEqual(minimumRouteCount);

  const routes = stack!
    .filter((layer): layer is { route: { path: string; methods: Record<string, boolean> } } =>
      Boolean((layer as { route?: unknown }).route)
    )
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  for (const expected of expectedRoutes) {
    const found = routes.find(
      (route) => route.path === expected.path && route.methods.includes(expected.method)
    );
    expect(found, `Expected ${expected.method.toUpperCase()} ${expected.path}`).toBeTruthy();
  }
}
