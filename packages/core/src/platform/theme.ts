/**
 * @fileoverview Theme Utilities
 * @module @nxt1/core/platform
 *
 * Pure TypeScript theme utilities for cross-platform theming.
 * Works on web, mobile, and SSR environments.
 *
 * Features:
 * - Theme persistence (localStorage)
 * - System preference detection
 * - No framework dependencies (pure JS)
 *
 * @example
 * ```typescript
 * import { getStoredTheme, setTheme, getSystemTheme } from '@nxt1/core';
 *
 * // Get user's stored preference
 * const theme = getStoredTheme(); // 'dark' | 'light' | null
 *
 * // Set theme
 * setTheme('dark');
 *
 * // Get system preference
 * const systemPref = getSystemTheme(); // 'dark' | 'light'
 * ```
 */

import { isBrowser } from './platform';

// ============================================
// TYPES
// ============================================

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'system';

export interface ThemeConfig {
  /** Storage key for persisting theme */
  storageKey: string;
  /** Default theme if no preference set */
  defaultTheme: Theme;
  /** Dark theme background color (for flash prevention) */
  darkBackground: string;
  /** Light theme background color (for flash prevention) */
  lightBackground: string;
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  storageKey: 'nxt1-theme',
  defaultTheme: 'dark',
  darkBackground: '#0a0a0a',
  lightBackground: '#ffffff',
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get the system's preferred color scheme.
 * Returns 'dark' if user's OS is set to dark mode.
 */
export function getSystemTheme(): Theme {
  if (!isBrowser()) {
    return 'dark'; // Default for SSR
  }

  if (typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get the stored theme preference from localStorage.
 * Returns null if no preference is stored.
 */
export function getStoredTheme(config: Partial<ThemeConfig> = {}): Theme | null {
  if (!isBrowser()) {
    return null;
  }

  const { storageKey } = { ...DEFAULT_THEME_CONFIG, ...config };

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    // localStorage may be disabled
  }

  return null;
}

/**
 * Get the effective theme (stored preference or default).
 */
export function getEffectiveTheme(config: Partial<ThemeConfig> = {}): Theme {
  const { defaultTheme } = { ...DEFAULT_THEME_CONFIG, ...config };
  return getStoredTheme(config) ?? defaultTheme;
}

/**
 * Persist theme preference to localStorage.
 */
export function storeTheme(theme: Theme, config: Partial<ThemeConfig> = {}): boolean {
  if (!isBrowser()) {
    return false;
  }

  const { storageKey } = { ...DEFAULT_THEME_CONFIG, ...config };

  try {
    localStorage.setItem(storageKey, theme);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply theme to the document.
 * Sets data-theme attribute, color-scheme CSS property, and meta theme-color.
 */
export function applyTheme(theme: Theme, config: Partial<ThemeConfig> = {}): void {
  if (!isBrowser()) {
    return;
  }

  const { darkBackground, lightBackground } = {
    ...DEFAULT_THEME_CONFIG,
    ...config,
  };

  const html = document.documentElement;
  const background = theme === 'dark' ? darkBackground : lightBackground;

  // Set data attribute for CSS selectors
  html.setAttribute('data-theme', theme);

  // Set color-scheme for native form controls
  html.style.colorScheme = theme;

  // Prevent flash on route changes
  html.style.backgroundColor = background;

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', background);
  }

  // Dispatch event for framework listeners
  window.dispatchEvent(new CustomEvent('nxt1-theme-change', { detail: { theme } }));
}

/**
 * Set and persist theme.
 */
export function setTheme(theme: Theme, config: Partial<ThemeConfig> = {}): void {
  storeTheme(theme, config);
  applyTheme(theme, config);
}

/**
 * Toggle between dark and light themes.
 */
export function toggleTheme(config: Partial<ThemeConfig> = {}): Theme {
  const current = getEffectiveTheme(config);
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next, config);
  return next;
}

/**
 * Initialize theme on page load.
 * This should be called as early as possible (ideally in a blocking script).
 */
export function initializeTheme(config: Partial<ThemeConfig> = {}): Theme {
  const theme = getEffectiveTheme(config);
  applyTheme(theme, config);
  return theme;
}

/**
 * Watch for system theme changes.
 * Returns a cleanup function.
 */
export function watchSystemTheme(
  callback: (theme: Theme) => void,
  config: Partial<ThemeConfig> = {}
): () => void {
  if (!isBrowser() || typeof window.matchMedia !== 'function') {
    // Return no-op cleanup when matchMedia is not available
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = (e: MediaQueryListEvent) => {
    // Only auto-switch if user hasn't set a preference
    if (getStoredTheme(config) === null) {
      const theme: Theme = e.matches ? 'dark' : 'light';
      applyTheme(theme, config);
      callback(theme);
    }
  };

  mediaQuery.addEventListener('change', handler);

  return () => {
    mediaQuery.removeEventListener('change', handler);
  };
}

// ============================================
// INLINE SCRIPT GENERATOR
// For use in index.html <head> to prevent flash
// ============================================

/**
 * Generate inline script for index.html to prevent theme flash.
 * This script runs before any CSS/JS loads.
 */
export function generateThemeInitScript(config: Partial<ThemeConfig> = {}): string {
  const { storageKey, defaultTheme, darkBackground, lightBackground } = {
    ...DEFAULT_THEME_CONFIG,
    ...config,
  };

  return `(function(){var t=localStorage.getItem('${storageKey}')||'${defaultTheme}';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;document.documentElement.style.backgroundColor=t==='dark'?'${darkBackground}':'${lightBackground}';})();`;
}
