/**
 * @fileoverview Platform Detection Tests
 * @module @nxt1/core/platform
 *
 * Tests for platform detection utilities.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isBrowser,
  isServer,
  isSSR,
  isWorker,
  isCapacitor,
  isIOS,
  isAndroid,
  isMobileApp,
  isMobileDevice,
  isTouchDevice,
  isTablet,
  getPlatform,
  getDeviceType,
  getEnvironment,
  getPlatformInfo,
  runInBrowser,
  runOnServer,
  runInNative,
} from './platform';

// ============================================
// MOCK SETUP
// ============================================

function mockBrowserEnvironment(
  options: {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    matchMedia?: (query: string) => { matches: boolean };
  } = {}
) {
  const {
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    platform = 'Win32',
    maxTouchPoints = 0,
    Capacitor,
    matchMedia,
  } = options;

  vi.stubGlobal('window', {
    Capacitor,
    matchMedia: matchMedia ?? (() => ({ matches: false })),
  });
  vi.stubGlobal('document', {});
  vi.stubGlobal('navigator', {
    userAgent,
    platform,
    maxTouchPoints,
  });
}

function mockServerEnvironment() {
  vi.unstubAllGlobals();
  // Explicitly delete to ensure undefined
  const g = globalThis as Record<string, unknown>;
  delete g['window'];
  delete g['document'];
  delete g['navigator'];
}

function mockWorkerEnvironment() {
  vi.unstubAllGlobals();
  const g = globalThis as Record<string, unknown>;
  delete g['window'];
  vi.stubGlobal('self', {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    importScripts: () => {},
  });
}

// ============================================
// TESTS
// ============================================

describe('Platform Detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isBrowser', () => {
    it('should return true in browser environment', () => {
      mockBrowserEnvironment();
      expect(isBrowser()).toBe(true);
    });

    it('should return false in server environment', () => {
      mockServerEnvironment();
      expect(isBrowser()).toBe(false);
    });
  });

  describe('isServer', () => {
    it('should return true in server environment', () => {
      mockServerEnvironment();
      expect(isServer()).toBe(true);
    });

    it('should return false in browser environment', () => {
      mockBrowserEnvironment();
      expect(isServer()).toBe(false);
    });
  });

  describe('isSSR', () => {
    it('should be an alias for isServer', () => {
      mockServerEnvironment();
      expect(isSSR()).toBe(isServer());

      mockBrowserEnvironment();
      expect(isSSR()).toBe(isServer());
    });
  });

  describe('isWorker', () => {
    it('should return true in worker environment', () => {
      mockWorkerEnvironment();
      expect(isWorker()).toBe(true);
    });

    it('should return false in browser environment', () => {
      mockBrowserEnvironment();
      expect(isWorker()).toBe(false);
    });

    it('should return false in server environment', () => {
      mockServerEnvironment();
      expect(isWorker()).toBe(false);
    });
  });

  describe('isCapacitor', () => {
    it('should return true when Capacitor is native', () => {
      mockBrowserEnvironment({
        Capacitor: { isNativePlatform: () => true },
      });
      expect(isCapacitor()).toBe(true);
    });

    it('should return false when Capacitor is not present', () => {
      mockBrowserEnvironment();
      expect(isCapacitor()).toBe(false);
    });

    it('should return false in server environment', () => {
      mockServerEnvironment();
      expect(isCapacitor()).toBe(false);
    });
  });

  describe('isIOS', () => {
    it('should return true for Capacitor iOS', () => {
      mockBrowserEnvironment({
        Capacitor: { getPlatform: () => 'ios' },
      });
      expect(isIOS()).toBe(true);
    });

    it('should return true for iPhone user agent', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      });
      expect(isIOS()).toBe(true);
    });

    it('should return true for iPad user agent', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
      });
      expect(isIOS()).toBe(true);
    });

    it('should return true for iPad Pro (desktop mode)', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      });
      expect(isIOS()).toBe(true);
    });

    it('should return false for desktop browsers', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        platform: 'Win32',
        maxTouchPoints: 0,
      });
      expect(isIOS()).toBe(false);
    });

    it('should return false in server environment', () => {
      mockServerEnvironment();
      expect(isIOS()).toBe(false);
    });
  });

  describe('isAndroid', () => {
    it('should return true for Capacitor Android', () => {
      mockBrowserEnvironment({
        Capacitor: { getPlatform: () => 'android' },
      });
      expect(isAndroid()).toBe(true);
    });

    it('should return true for Android user agent', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
      });
      expect(isAndroid()).toBe(true);
    });

    it('should return false for iOS user agent', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      });
      expect(isAndroid()).toBe(false);
    });

    it('should return false in server environment', () => {
      mockServerEnvironment();
      expect(isAndroid()).toBe(false);
    });
  });

  describe('isMobileApp', () => {
    it('should return true for Capacitor iOS', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
      });
      expect(isMobileApp()).toBe(true);
    });

    it('should return true for Capacitor Android', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Linux; Android 13)',
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      });
      expect(isMobileApp()).toBe(true);
    });

    it('should return false for mobile web', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      });
      expect(isMobileApp()).toBe(false);
    });
  });

  describe('isMobileDevice', () => {
    it('should return true for iOS devices', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('should return true for Android devices', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('should return false for desktop', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      });
      expect(isMobileDevice()).toBe(false);
    });
  });

  describe('isTouchDevice', () => {
    it('should return true when maxTouchPoints > 0', () => {
      mockBrowserEnvironment({ maxTouchPoints: 5 });
      expect(isTouchDevice()).toBe(true);
    });

    it('should return false when maxTouchPoints is 0', () => {
      mockBrowserEnvironment({ maxTouchPoints: 0 });
      expect(isTouchDevice()).toBe(false);
    });

    it('should return false in server environment', () => {
      mockServerEnvironment();
      expect(isTouchDevice()).toBe(false);
    });
  });

  describe('isTablet', () => {
    it('should return true for iPad', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
      });
      expect(isTablet()).toBe(true);
    });

    it('should return true for iPad Pro in desktop mode', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      });
      expect(isTablet()).toBe(true);
    });

    it('should return true for Android tablet', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X900)',
      });
      expect(isTablet()).toBe(true);
    });

    it('should return false for Android phone', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile',
      });
      expect(isTablet()).toBe(false);
    });

    it('should return false for iPhone', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      });
      expect(isTablet()).toBe(false);
    });
  });

  describe('getPlatform', () => {
    it('should return "server" in server environment', () => {
      mockServerEnvironment();
      expect(getPlatform()).toBe('server');
    });

    // Note: getPlatform checks isServer() before isWorker(), so in a Node.js test
    // environment where we delete window, it returns "server" not "worker".
    // The worker detection is only for actual Web Worker contexts where
    // self.importScripts exists but the server check returns false.
    it('should return "server" when window is undefined (server takes precedence)', () => {
      mockWorkerEnvironment(); // This deletes window and sets self.importScripts
      // isServer() checks typeof window === 'undefined' first, so this returns server
      expect(getPlatform()).toBe('server');
    });

    it('should return "ios" for Capacitor iOS', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
      });
      expect(getPlatform()).toBe('ios');
    });

    it('should return "android" for Capacitor Android', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Linux; Android 13)',
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      });
      expect(getPlatform()).toBe('android');
    });

    it('should return "browser" for web browsers', () => {
      mockBrowserEnvironment();
      expect(getPlatform()).toBe('browser');
    });
  });

  describe('getDeviceType', () => {
    it('should return "tablet" for tablets', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
      });
      expect(getDeviceType()).toBe('tablet');
    });

    it('should return "mobile" for phones', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      });
      expect(getDeviceType()).toBe('mobile');
    });

    it('should return "desktop" for desktop browsers', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      });
      expect(getDeviceType()).toBe('desktop');
    });
  });

  describe('getEnvironment', () => {
    it('should return "server" in server environment', () => {
      mockServerEnvironment();
      expect(getEnvironment()).toBe('server');
    });

    it('should return "native" for Capacitor apps', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
      });
      expect(getEnvironment()).toBe('native');
    });

    it('should return "browser" for web browsers', () => {
      mockBrowserEnvironment();
      expect(getEnvironment()).toBe('browser');
    });
  });

  describe('getPlatformInfo', () => {
    it('should return comprehensive platform info', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        maxTouchPoints: 0,
      });

      const info = getPlatformInfo();

      expect(info).toEqual({
        platform: 'browser',
        deviceType: 'desktop',
        environment: 'browser',
        isCapacitor: false,
        isIOS: false,
        isAndroid: false,
        isBrowser: true,
        isServer: false,
        isWorker: false,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isTouchDevice: false,
      });
    });

    it('should return correct info for iOS native app', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        maxTouchPoints: 5,
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
      });

      const info = getPlatformInfo();

      expect(info.platform).toBe('ios');
      expect(info.deviceType).toBe('mobile');
      expect(info.environment).toBe('native');
      expect(info.isCapacitor).toBe(true);
      expect(info.isIOS).toBe(true);
      expect(info.isMobile).toBe(true);
      expect(info.isTouchDevice).toBe(true);
    });
  });

  describe('runInBrowser', () => {
    it('should execute function in browser environment', () => {
      mockBrowserEnvironment();
      const fn = vi.fn().mockReturnValue('result');

      const result = runInBrowser(fn);

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should not execute function in server environment', () => {
      mockServerEnvironment();
      const fn = vi.fn();

      const result = runInBrowser(fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('runOnServer', () => {
    it('should execute function in server environment', () => {
      mockServerEnvironment();
      const fn = vi.fn().mockReturnValue('result');

      const result = runOnServer(fn);

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should not execute function in browser environment', () => {
      mockBrowserEnvironment();
      const fn = vi.fn();

      const result = runOnServer(fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('runInNative', () => {
    it('should execute function in native app', () => {
      mockBrowserEnvironment({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
      });
      const fn = vi.fn().mockReturnValue('result');

      const result = runInNative(fn);

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should not execute function in web browser', () => {
      mockBrowserEnvironment();
      const fn = vi.fn();

      const result = runInNative(fn);

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });
});
