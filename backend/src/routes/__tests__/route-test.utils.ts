import { expect } from 'vitest';

export interface ExpectedRoute {
  path: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
}

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: RouterLayer[] };
  stack?: RouterLayer[];
}

/** Recursively flatten all route layers from a router (including sub-routers). */
function flattenRoutes(stack: RouterLayer[]): { path: string; methods: string[] }[] {
  const result: { path: string; methods: string[] }[] = [];
  for (const layer of stack) {
    if (layer.route) {
      result.push({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      });
    } else {
      // Sub-router registered via router.use()
      const subStack = layer.handle?.stack ?? layer.stack;
      if (Array.isArray(subStack)) {
        result.push(...flattenRoutes(subStack));
      }
    }
  }
  return result;
}

export function expectExpressRouter(
  router: unknown,
  expectedRoutes: ExpectedRoute[],
  minimumRouteCount = 1
): void {
  expect(router).toBeDefined();
  expect(typeof router).toBe('function');

  const stack = (router as { stack?: RouterLayer[] }).stack;
  expect(Array.isArray(stack)).toBe(true);

  const routes = flattenRoutes(stack!);
  expect(routes.length).toBeGreaterThanOrEqual(minimumRouteCount);

  for (const expected of expectedRoutes) {
    const found = routes.find(
      (route) => route.path === expected.path && route.methods.includes(expected.method)
    );
    expect(found, `Expected ${expected.method.toUpperCase()} ${expected.path}`).toBeTruthy();
  }
}
