/**
 * @fileoverview Test Setup for @nxt1/web
 * @module @nxt1/web
 *
 * Global test setup file that runs before each test file.
 * Configures jsdom, mocks, and any global test utilities.
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({
    elements: vi.fn(),
    createPaymentMethod: vi.fn(),
    confirmCardSetup: vi.fn(),
  }),
}));

// Initialize Angular TestBed environment globally (once per worker)
try {
  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch (e) {
  if (!String(e).includes('Cannot set base providers because it has already been called')) {
    throw e;
  }
}

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
  readonly scrollMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
    void _callback;
    void _options;
  }
  /* eslint-disable @typescript-eslint/no-empty-function */
  observe() {}
  unobserve() {}
  disconnect() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
};

const originalConsoleError = console.error.bind(console);

vi.spyOn(console, 'error').mockImplementation((...args: Parameters<typeof console.error>) => {
  const message = args
    .map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)))
    .join(' ');

  const isKnownAngularWarning =
    message.includes('NG0303:') &&
    (message.includes('OnboardingLinkDropStepComponent') || message.includes("'nxt1-news-list'"));
  const isKnownInputWarning =
    message.includes("Can't set value of the 'selectedSports' input") ||
    message.includes("Can't set value of the 'role' input");
  const isKnownStripeWarning =
    message.includes('Stripe') &&
    (message.includes('Failed to load') || message.includes('loadStripe'));

  if (isKnownAngularWarning || isKnownInputWarning || isKnownStripeWarning) {
    return;
  }

  originalConsoleError(...args);
});
