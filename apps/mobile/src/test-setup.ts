/**
 * @fileoverview Test Setup for @nxt1/mobile
 * @module @nxt1/mobile
 *
 * Global test setup file that runs before each test file.
 * Configures jsdom, mocks, and any global test utilities.
 */

import '@testing-library/jest-dom/vitest';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

// Initialize Angular TestBed environment globally (once per worker)
try {
  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch (e) {
  if (!String(e).includes('Cannot set base providers because it has already been called')) {
    throw e;
  }
}

// Mock window.matchMedia (not implemented in jsdom/node)
if (typeof window !== 'undefined') {
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
}

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
  readonly scrollMargin: string = '';
  /* eslint-disable @typescript-eslint/no-empty-function */
  observe() {}
  unobserve() {}
  disconnect() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
} as unknown as typeof IntersectionObserver;

// Mock Capacitor plugins for unit tests
(globalThis as Record<string, unknown>)['Capacitor'] = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  isPluginAvailable: () => false,
};
