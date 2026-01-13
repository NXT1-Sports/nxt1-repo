/**
 * @fileoverview Firebase Analytics Adapter Tests
 * @module @nxt1/core/analytics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock firebase modules
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ name: '[DEFAULT]' })),
}));

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({})),
  logEvent: vi.fn(),
  setUserId: vi.fn(),
  setUserProperties: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
  setConsent: vi.fn(),
  isSupported: vi.fn(() => Promise.resolve(true)),
}));

describe('Firebase Analytics Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state by re-importing
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createFirebaseAnalyticsAdapter', () => {
    it('should create an adapter with all required methods', async () => {
      // Mock window for browser environment
      const originalWindow = globalThis.window;
      globalThis.window = {} as Window & typeof globalThis;

      const { createFirebaseAnalyticsAdapter } = await import('./firebase-analytics');

      const adapter = await createFirebaseAnalyticsAdapter({
        firebaseConfig: {
          apiKey: 'test-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123',
          appId: '1:123:web:abc',
          measurementId: 'G-TEST',
        },
      });

      expect(adapter).toBeDefined();
      expect(adapter.trackEvent).toBeDefined();
      expect(adapter.trackPageView).toBeDefined();
      expect(adapter.setUserId).toBeDefined();
      expect(adapter.setUserProperties).toBeDefined();
      expect(adapter.clearUser).toBeDefined();
      expect(adapter.isInitialized).toBeDefined();
      expect(adapter.getUserId).toBeDefined();
      expect(adapter.setEnabled).toBeDefined();

      globalThis.window = originalWindow;
    });

    it('should return memory adapter behavior on server', async () => {
      // Ensure window is undefined (server environment)
      const originalWindow = globalThis.window;
      // @ts-expect-error - simulating server
      delete globalThis.window;

      const { createFirebaseAnalyticsAdapter } = await import('./firebase-analytics');

      const adapter = await createFirebaseAnalyticsAdapter({
        firebaseConfig: {
          apiKey: 'test-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123',
          appId: '1:123:web:abc',
        },
      });

      // On server, adapter should be created but not initialized
      expect(adapter.isInitialized()).toBe(false);

      globalThis.window = originalWindow;
    });
  });

  describe('createFirebaseAnalyticsAdapterSync', () => {
    it('should create an adapter synchronously', async () => {
      const originalWindow = globalThis.window;
      globalThis.window = {} as Window & typeof globalThis;

      const { createFirebaseAnalyticsAdapterSync } = await import('./firebase-analytics');

      const adapter = createFirebaseAnalyticsAdapterSync({
        firebaseConfig: {
          apiKey: 'test-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123',
          appId: '1:123:web:abc',
        },
      });

      expect(adapter).toBeDefined();
      expect(adapter.trackEvent).toBeDefined();

      globalThis.window = originalWindow;
    });
  });
});

describe('Universal Analytics Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('detectPlatform', () => {
    it('should detect server when window is undefined', async () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error - simulating server
      delete globalThis.window;

      const { detectPlatform } = await import('./universal-analytics');
      expect(detectPlatform()).toBe('server');

      globalThis.window = originalWindow;
    });

    it('should detect web when in browser without Capacitor', async () => {
      const originalWindow = globalThis.window;
      globalThis.window = {} as Window & typeof globalThis;

      const { detectPlatform } = await import('./universal-analytics');
      expect(detectPlatform()).toBe('web');

      globalThis.window = originalWindow;
    });

    it('should detect ios when Capacitor platform is ios', async () => {
      const originalWindow = globalThis.window;
      globalThis.window = {
        Capacitor: {
          getPlatform: () => 'ios',
        },
      } as unknown as Window & typeof globalThis;

      const { detectPlatform } = await import('./universal-analytics');
      expect(detectPlatform()).toBe('ios');

      globalThis.window = originalWindow;
    });

    it('should detect android when Capacitor platform is android', async () => {
      const originalWindow = globalThis.window;
      globalThis.window = {
        Capacitor: {
          getPlatform: () => 'android',
        },
      } as unknown as Window & typeof globalThis;

      const { detectPlatform } = await import('./universal-analytics');
      expect(detectPlatform()).toBe('android');

      globalThis.window = originalWindow;
    });
  });

  describe('isNativeApp', () => {
    it('should return true for ios', async () => {
      const originalWindow = globalThis.window;
      globalThis.window = {
        Capacitor: {
          getPlatform: () => 'ios',
        },
      } as unknown as Window & typeof globalThis;

      const { isNativeApp } = await import('./universal-analytics');
      expect(isNativeApp()).toBe(true);

      globalThis.window = originalWindow;
    });

    it('should return false for web', async () => {
      const originalWindow = globalThis.window;
      globalThis.window = {} as Window & typeof globalThis;

      const { isNativeApp } = await import('./universal-analytics');
      expect(isNativeApp()).toBe(false);

      globalThis.window = originalWindow;
    });
  });

  describe('createAnalyticsSync', () => {
    it('should return memory adapter on server', async () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error - simulating server
      delete globalThis.window;

      const { createAnalyticsSync } = await import('./universal-analytics');

      const adapter = createAnalyticsSync({
        firebaseConfig: {
          apiKey: 'test',
          authDomain: 'test',
          projectId: 'test',
          storageBucket: 'test',
          messagingSenderId: 'test',
          appId: 'test',
        },
      });

      expect(adapter).toBeDefined();
      expect(adapter.isInitialized()).toBe(false); // Memory adapter returns false when disabled

      globalThis.window = originalWindow;
    });
  });
});
