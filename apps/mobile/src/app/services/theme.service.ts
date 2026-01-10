/**
 * @fileoverview Theme Service
 * @module @nxt1/mobile
 *
 * Angular service wrapper for @nxt1/core theme utilities.
 * Provides reactive signals for theme state.
 *
 * @example
 * ```typescript
 * export class MyComponent {
 *   private theme = inject(ThemeService);
 *
 *   currentTheme = this.theme.current;
 *   isDark = this.theme.isDark;
 *
 *   toggle() {
 *     this.theme.toggle();
 *   }
 * }
 * ```
 */

import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Theme,
  ThemeConfig,
  DEFAULT_THEME_CONFIG,
  getEffectiveTheme,
  setTheme,
  toggleTheme,
  watchSystemTheme,
  applyTheme,
} from '@nxt1/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly config: ThemeConfig = DEFAULT_THEME_CONFIG;

  // Reactive signals
  private readonly _current = signal<Theme>('dark');

  // Public computed signals
  readonly current = computed(() => this._current());
  readonly isDark = computed(() => this._current() === 'dark');
  readonly isLight = computed(() => this._current() === 'light');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Initialize from stored preference
      const theme = getEffectiveTheme(this.config);
      this._current.set(theme);

      // Apply immediately (in case blocking script didn't run)
      applyTheme(theme, this.config);

      // Watch for system preference changes
      watchSystemTheme((newTheme) => {
        this._current.set(newTheme);
      }, this.config);

      // Listen for theme changes from other sources (e.g., other tabs)
      window.addEventListener('storage', (e) => {
        if (e.key === this.config.storageKey && e.newValue) {
          const theme = e.newValue as Theme;
          this._current.set(theme);
          applyTheme(theme, this.config);
        }
      });

      // Listen for custom theme change events
      window.addEventListener('nxt1-theme-change', ((e: CustomEvent) => {
        this._current.set(e.detail.theme);
      }) as EventListener);
    }
  }

  /**
   * Set theme explicitly.
   */
  set(theme: Theme): void {
    if (!isPlatformBrowser(this.platformId)) return;

    setTheme(theme, this.config);
    this._current.set(theme);
  }

  /**
   * Toggle between dark and light themes.
   */
  toggle(): Theme {
    if (!isPlatformBrowser(this.platformId)) {
      return this._current();
    }

    const newTheme = toggleTheme(this.config);
    this._current.set(newTheme);
    return newTheme;
  }

  /**
   * Set to dark theme.
   */
  setDark(): void {
    this.set('dark');
  }

  /**
   * Set to light theme.
   */
  setLight(): void {
    this.set('light');
  }
}
