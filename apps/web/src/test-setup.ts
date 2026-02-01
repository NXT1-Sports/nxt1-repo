/**
 * @fileoverview Test Setup for @nxt1/web
 * @module @nxt1/web
 *
 * Global test setup file that runs before each test file.
 * Configures jsdom, mocks, and any global test utilities.
 */

import '@testing-library/jest-dom/vitest';

// Mock window.matchMedia (not implemented in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    /* eslint-disable @typescript-eslint/no-empty-function */
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    /* eslint-enable @typescript-eslint/no-empty-function */
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver (not implemented in jsdom)
global.ResizeObserver = class ResizeObserver {
  /* eslint-disable @typescript-eslint/no-empty-function */
  observe() {}
  unobserve() {}
  disconnect() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
};

// Mock IntersectionObserver (not implemented in jsdom)
global.IntersectionObserver = class IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  /* eslint-disable @typescript-eslint/no-empty-function */
  observe() {}
  unobserve() {}
  disconnect() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
};

// Suppress console errors during tests (optional)
// Uncomment if you want cleaner test output
// vi.spyOn(console, 'error').mockImplementation(() => {});
