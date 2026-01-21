/**
 * @fileoverview Theme Service
 * @module @nxt1/mobile
 *
 * Angular service wrapper for @nxt1/core theme utilities.
 * Provides reactive signals for theme state.
 * Automatically syncs status bar style with theme on native devices.
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

import { Injectable, signal, computed, inject, PLATFORM_ID, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';
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
  private readonly ionicPlatform = inject(Platform);
  private readonly config: ThemeConfig = DEFAULT_THEME_CONFIG;

  // Reactive signals
  private readonly _current = signal<Theme>('dark');
  private readonly _statusBarSynced = signal(false);

  // Public computed signals
  readonly current = computed(() => this._current());
  readonly isDark = computed(() => this._current() === 'dark');
  readonly isLight = computed(() => this._current() === 'light');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // TEMPORARY: Force light theme for testing status bar sync
      // TODO: Remove this after testing - revert to getEffectiveTheme(this.config)
      const theme: Theme = 'light';
      this._current.set(theme);

      // Apply immediately and save to storage
      setTheme(theme, this.config);
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

      // Auto-sync status bar with theme changes (2026 professional best practice)
      effect(() => {
        const theme = this._current();
        if (this._statusBarSynced()) {
          this.syncStatusBarWithTheme(theme);
        }
      });
    }
  }

  /**
   * Enable status bar syncing with theme.
   * Call this after NativeAppService is initialized.
   */
  enableStatusBarSync(): void {
    this._statusBarSynced.set(true);
    // Immediately sync current theme
    this.syncStatusBarWithTheme(this._current());
  }

  /**
   * Sync status bar style with current theme.
   * Dark theme = white icons (Style.Dark)
   * Light theme = black icons (Style.Light)
   */
  private async syncStatusBarWithTheme(theme: Theme): Promise<void> {
    if (!this.ionicPlatform.is('capacitor')) {
      return;
    }

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // Dark theme needs light/white icons (Style.Dark)
      // Light theme needs dark/black icons (Style.Light)
      // Note: Style naming refers to background intent, not icon color
      const style = theme === 'dark' ? Style.Dark : Style.Light;
      await StatusBar.setStyle({ style });

      console.debug(`[ThemeService] Status bar synced to ${theme} theme (${style})`);
    } catch (error) {
      console.warn('[ThemeService] Failed to sync status bar:', error);
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
