/**
 * @fileoverview Theme Utilities Tests
 * @module @nxt1/core/platform
 *
 * Tests for theme utilities.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getSystemTheme,
  getStoredTheme,
  getEffectiveTheme,
  storeTheme,
  applyTheme,
  setTheme,
  toggleTheme,
  initializeTheme,
  watchSystemTheme,
  generateThemeInitScript,
  DEFAULT_THEME_CONFIG,
} from './theme';

// ============================================
// MOCK HELPERS
// ============================================

function createMockMatchMedia(prefersDark: boolean): typeof window.matchMedia {
  return vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : !prefersDark,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function createMockWindow(prefersDark: boolean = false) {
  return {
    matchMedia: createMockMatchMedia(prefersDark),
    dispatchEvent: vi.fn(),
  };
}

function createMockLocalStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    length: 0,
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    getItem: vi.fn((key: string) => store[key] ?? null),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
  };
}

function createMockDocument(): Document {
  const mockElement = {
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    style: {} as CSSStyleDeclaration,
  };

  return {
    documentElement: mockElement,
    head: {
      querySelector: vi.fn().mockReturnValue(null),
      appendChild: vi.fn(),
    },
    createElement: vi.fn().mockReturnValue({
      setAttribute: vi.fn(),
      content: '',
    }),
    querySelector: vi.fn().mockReturnValue(null),
  } as unknown as Document;
}

class MockCustomEvent {
  type: string;
  detail: unknown;
  constructor(type: string, options?: { detail?: unknown }) {
    this.type = type;
    this.detail = options?.detail;
  }
}

function setupBrowserMocks(options: { prefersDark?: boolean; storedTheme?: string } = {}) {
  const { prefersDark = false, storedTheme } = options;
  const mockDoc = createMockDocument();
  const mockStorage = createMockLocalStorage();

  if (storedTheme) {
    mockStorage.setItem('nxt1-theme', storedTheme);
  }

  vi.stubGlobal('window', createMockWindow(prefersDark));
  vi.stubGlobal('document', mockDoc);
  vi.stubGlobal('navigator', { userAgent: 'test' });
  vi.stubGlobal('localStorage', mockStorage);
  vi.stubGlobal('CustomEvent', MockCustomEvent);

  return { mockDoc, mockStorage };
}

// ============================================
// TESTS
// ============================================

describe('Theme Utilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('DEFAULT_THEME_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_THEME_CONFIG.storageKey).toBe('nxt1-theme');
      expect(DEFAULT_THEME_CONFIG.defaultTheme).toBe('dark');
      expect(DEFAULT_THEME_CONFIG.darkBackground).toBe('#0a0a0a');
      expect(DEFAULT_THEME_CONFIG.lightBackground).toBe('#ffffff');
    });
  });

  describe('getSystemTheme', () => {
    it('should return "dark" when system prefers dark mode', () => {
      setupBrowserMocks({ prefersDark: true });
      expect(getSystemTheme()).toBe('dark');
    });

    it('should return "light" when system prefers light mode', () => {
      setupBrowserMocks({ prefersDark: false });
      expect(getSystemTheme()).toBe('light');
    });

    it('should return "dark" in server environment (default)', () => {
      vi.unstubAllGlobals();
      const originalWindow = globalThis.window;
      // @ts-expect-error - intentionally deleting window for server simulation
      delete globalThis.window;

      expect(getSystemTheme()).toBe('dark');

      if (originalWindow) {
        globalThis.window = originalWindow;
      }
    });

    it('should return "dark" if matchMedia is not a function', () => {
      vi.stubGlobal('window', { matchMedia: undefined });
      vi.stubGlobal('document', createMockDocument());
      vi.stubGlobal('navigator', { userAgent: 'test' });

      expect(getSystemTheme()).toBe('dark');
    });
  });

  describe('getStoredTheme', () => {
    it('should return stored theme', () => {
      setupBrowserMocks({ storedTheme: 'light' });
      expect(getStoredTheme()).toBe('light');
    });

    it('should return null when no theme stored', () => {
      setupBrowserMocks();
      expect(getStoredTheme()).toBeNull();
    });

    it('should return null for invalid stored value', () => {
      const { mockStorage } = setupBrowserMocks();
      mockStorage.setItem('nxt1-theme', 'invalid-value');
      expect(getStoredTheme()).toBeNull();
    });

    it('should return null in server environment', () => {
      vi.unstubAllGlobals();
      const originalWindow = globalThis.window;
      // @ts-expect-error - intentionally deleting window for server simulation
      delete globalThis.window;

      expect(getStoredTheme()).toBeNull();

      if (originalWindow) {
        globalThis.window = originalWindow;
      }
    });

    it('should use custom storage key', () => {
      const { mockStorage } = setupBrowserMocks();
      mockStorage.setItem('custom-key', 'light');
      expect(getStoredTheme({ storageKey: 'custom-key' })).toBe('light');
    });
  });

  describe('getEffectiveTheme', () => {
    it('should return stored theme when available', () => {
      setupBrowserMocks({ storedTheme: 'light' });
      expect(getEffectiveTheme()).toBe('light');
    });

    it('should return default theme when no stored theme', () => {
      setupBrowserMocks();
      expect(getEffectiveTheme()).toBe('dark');
    });

    it('should use custom default theme', () => {
      setupBrowserMocks();
      expect(getEffectiveTheme({ defaultTheme: 'light' })).toBe('light');
    });
  });

  describe('storeTheme', () => {
    it('should store theme in localStorage', () => {
      const { mockStorage } = setupBrowserMocks();
      const result = storeTheme('dark');
      expect(result).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith('nxt1-theme', 'dark');
    });

    it('should use custom storage key', () => {
      const { mockStorage } = setupBrowserMocks();
      storeTheme('light', { storageKey: 'custom-key' });
      expect(mockStorage.setItem).toHaveBeenCalledWith('custom-key', 'light');
    });

    it('should return false in server environment', () => {
      vi.unstubAllGlobals();
      const originalWindow = globalThis.window;
      // @ts-expect-error - intentionally deleting window for server simulation
      delete globalThis.window;

      expect(storeTheme('dark')).toBe(false);

      if (originalWindow) {
        globalThis.window = originalWindow;
      }
    });
  });

  describe('applyTheme', () => {
    it('should apply dark theme to document', () => {
      const { mockDoc } = setupBrowserMocks({ prefersDark: true });
      applyTheme('dark');
      expect(mockDoc.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
      expect(mockDoc.documentElement.style.colorScheme).toBe('dark');
    });

    it('should apply light theme to document', () => {
      const { mockDoc } = setupBrowserMocks({ prefersDark: false });
      applyTheme('light');
      expect(mockDoc.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
      expect(mockDoc.documentElement.style.colorScheme).toBe('light');
    });

    it('should not throw in server environment', () => {
      vi.unstubAllGlobals();
      const originalWindow = globalThis.window;
      // @ts-expect-error - intentionally deleting window for server simulation
      delete globalThis.window;

      expect(() => applyTheme('dark')).not.toThrow();

      if (originalWindow) {
        globalThis.window = originalWindow;
      }
    });
  });

  describe('setTheme', () => {
    it('should store and apply theme', () => {
      const { mockDoc, mockStorage } = setupBrowserMocks();
      setTheme('light');
      expect(mockStorage.setItem).toHaveBeenCalledWith('nxt1-theme', 'light');
      expect(mockDoc.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('toggleTheme', () => {
    it('should toggle from dark to light', () => {
      const { mockStorage } = setupBrowserMocks({ storedTheme: 'dark', prefersDark: true });
      const result = toggleTheme();
      expect(result).toBe('light');
      expect(mockStorage.setItem).toHaveBeenCalledWith('nxt1-theme', 'light');
    });

    it('should toggle from light to dark', () => {
      const { mockStorage } = setupBrowserMocks({ storedTheme: 'light', prefersDark: false });
      const result = toggleTheme();
      expect(result).toBe('dark');
      expect(mockStorage.setItem).toHaveBeenCalledWith('nxt1-theme', 'dark');
    });
  });

  describe('initializeTheme', () => {
    it('should initialize with stored theme', () => {
      const { mockDoc } = setupBrowserMocks({ storedTheme: 'light' });
      const result = initializeTheme();
      expect(result).toBe('light');
      expect(mockDoc.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should fall back to default theme', () => {
      setupBrowserMocks({ prefersDark: true });
      const result = initializeTheme();
      expect(result).toBe('dark');
    });

    it('should return default theme in server environment', () => {
      vi.unstubAllGlobals();
      const originalWindow = globalThis.window;
      // @ts-expect-error - intentionally deleting window for server simulation
      delete globalThis.window;

      const result = initializeTheme();
      expect(result).toBe('dark');

      if (originalWindow) {
        globalThis.window = originalWindow;
      }
    });
  });

  describe('watchSystemTheme', () => {
    it('should set up media query listener', () => {
      setupBrowserMocks();
      const callback = vi.fn();
      const cleanup = watchSystemTheme(callback);
      expect(typeof cleanup).toBe('function');
    });

    it('should return noop cleanup in server environment', () => {
      vi.unstubAllGlobals();
      const originalWindow = globalThis.window;
      // @ts-expect-error - intentionally deleting window for server simulation
      delete globalThis.window;

      const callback = vi.fn();
      const cleanup = watchSystemTheme(callback);
      expect(cleanup).toBeDefined();
      expect(() => cleanup()).not.toThrow();

      if (originalWindow) {
        globalThis.window = originalWindow;
      }
    });
  });

  describe('generateThemeInitScript', () => {
    it('should generate script with default config', () => {
      const script = generateThemeInitScript();
      expect(script).toContain('nxt1-theme');
      expect(script).toContain('#0a0a0a');
      expect(script).toContain('#ffffff');
      expect(script).toContain('localStorage');
      expect(script).toContain('data-theme');
    });

    it('should use custom config values', () => {
      const script = generateThemeInitScript({
        storageKey: 'custom-theme',
        defaultTheme: 'light',
        darkBackground: '#000000',
        lightBackground: '#f0f0f0',
      });
      expect(script).toContain('custom-theme');
      expect(script).toContain('#000000');
      expect(script).toContain('#f0f0f0');
    });

    it('should be a valid IIFE', () => {
      const script = generateThemeInitScript();
      expect(script).toMatch(/^\(function\(\)\{/);
      expect(script).toMatch(/\}\)\(\);$/);
    });
  });
});
