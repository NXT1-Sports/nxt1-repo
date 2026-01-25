/**
 * @fileoverview Theme Service
 * @module @nxt1/mobile
 *
 * Angular service wrapper for @nxt1/core theme utilities.
 * Provides reactive signals for theme state.
 * Automatically syncs status bar style with theme on native devices.
 *
 * Features:
 * - Dark/Light mode toggle
 * - Sport theme overlay (e.g., 'sport-football', 'sport-basketball')
 * - Status bar color sync on native devices
 * - Theme persistence via localStorage
 *
 * @example
 * ```typescript
 * export class MyComponent {
 *   private theme = inject(ThemeService);
 *
 *   currentTheme = this.theme.current;
 *   isDark = this.theme.isDark;
 *   currentSportTheme = this.theme.sportTheme;
 *
 *   toggle() {
 *     this.theme.toggle();
 *   }
 *
 *   setSport(sport: string) {
 *     this.theme.setSportTheme(sport); // 'football' → 'sport-football'
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

// ============================================
// TYPES
// ============================================

/** Valid sport theme names (maps to [data-theme="sport-*"] CSS selectors) */
export type SportTheme =
  | 'sport-basketball'
  | 'sport-football'
  | 'sport-baseball'
  | 'sport-softball'
  | 'sport-soccer'
  | 'sport-lacrosse'
  | 'sport-volleyball'
  | 'sport-hockey'
  | 'sport-tennis'
  | 'sport-golf'
  | 'sport-swimming'
  | 'sport-track'
  | null;

/** Map of sport names to their theme identifiers */
const SPORT_TO_THEME: Record<string, SportTheme> = {
  basketball: 'sport-basketball',
  football: 'sport-football',
  baseball: 'sport-baseball',
  softball: 'sport-softball',
  soccer: 'sport-soccer',
  lacrosse: 'sport-lacrosse',
  volleyball: 'sport-volleyball',
  hockey: 'sport-hockey',
  'ice hockey': 'sport-hockey',
  tennis: 'sport-tennis',
  golf: 'sport-golf',
  swimming: 'sport-swimming',
  'track and field': 'sport-track',
  track: 'sport-track',
};

/** Storage key for sport theme persistence */
const SPORT_THEME_STORAGE_KEY = 'nxt1-sport-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly config: ThemeConfig = DEFAULT_THEME_CONFIG;

  // Reactive signals for base theme (dark/light)
  private readonly _current = signal<Theme>('dark');
  private readonly _statusBarSynced = signal(false);

  // Sport theme signal (overlays on top of dark/light)
  private readonly _sportTheme = signal<SportTheme>(null);

  // Public computed signals
  readonly current = computed(() => this._current());
  readonly isDark = computed(() => this._current() === 'dark');
  readonly isLight = computed(() => this._current() === 'light');
  readonly sportTheme = computed(() => this._sportTheme());
  readonly hasSportTheme = computed(() => this._sportTheme() !== null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Get effective theme from storage or system preference
      const theme: Theme = getEffectiveTheme(this.config);
      this._current.set(theme);

      // Apply immediately and save to storage
      setTheme(theme, this.config);
      applyTheme(theme, this.config);

      // Restore sport theme from storage
      const storedSportTheme = localStorage.getItem(SPORT_THEME_STORAGE_KEY);
      if (storedSportTheme && this.isValidSportTheme(storedSportTheme)) {
        this._sportTheme.set(storedSportTheme as SportTheme);
        this.applySportTheme(storedSportTheme as SportTheme);
      }

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
        // Also handle sport theme changes from storage
        if (e.key === SPORT_THEME_STORAGE_KEY) {
          const sportTheme = e.newValue as SportTheme;
          this._sportTheme.set(sportTheme);
          this.applySportTheme(sportTheme);
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

  // ============================================
  // SPORT THEME METHODS
  // ============================================

  /**
   * Set the sport theme overlay based on sport name.
   * Converts common sport names to their theme identifiers.
   *
   * @param sport - Sport name (e.g., 'football', 'Basketball', 'SOCCER')
   *
   * @example
   * ```typescript
   * theme.setSportTheme('football'); // → data-theme="sport-football"
   * theme.setSportTheme('Basketball'); // → data-theme="sport-basketball"
   * ```
   */
  setSportTheme(sport: string | null): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (!sport) {
      this.clearSportTheme();
      return;
    }

    // Normalize to lowercase and look up theme
    const normalizedSport = sport.toLowerCase().trim();
    const sportTheme = SPORT_TO_THEME[normalizedSport] || null;

    if (sportTheme) {
      this._sportTheme.set(sportTheme);
      localStorage.setItem(SPORT_THEME_STORAGE_KEY, sportTheme);
      this.applySportTheme(sportTheme);
      console.debug(`[ThemeService] Sport theme set to ${sportTheme}`);
    } else {
      console.warn(`[ThemeService] Unknown sport "${sport}", no theme applied`);
      this.clearSportTheme();
    }
  }

  /**
   * Set sport theme directly using the theme identifier.
   *
   * @param sportTheme - Theme identifier (e.g., 'sport-football')
   */
  setSportThemeDirect(sportTheme: SportTheme): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (sportTheme && this.isValidSportTheme(sportTheme)) {
      this._sportTheme.set(sportTheme);
      localStorage.setItem(SPORT_THEME_STORAGE_KEY, sportTheme);
      this.applySportTheme(sportTheme);
    } else {
      this.clearSportTheme();
    }
  }

  /**
   * Clear the sport theme overlay.
   * Reverts to base dark/light theme styling.
   */
  clearSportTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this._sportTheme.set(null);
    localStorage.removeItem(SPORT_THEME_STORAGE_KEY);
    this.applySportTheme(null);
    console.debug('[ThemeService] Sport theme cleared');
  }

  /**
   * Apply sport theme to the document.
   * Sport theme adds a secondary data-sport-theme attribute.
   */
  private applySportTheme(sportTheme: SportTheme): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const html = document.documentElement;

    if (sportTheme) {
      // Apply sport theme as the primary data-theme attribute
      // This allows sport themes to override base theme variables
      html.setAttribute('data-theme', sportTheme);
    } else {
      // Revert to base dark/light theme
      html.setAttribute('data-theme', this._current());
    }

    // Dispatch event for framework listeners
    window.dispatchEvent(new CustomEvent('nxt1-sport-theme-change', { detail: { sportTheme } }));
  }

  /**
   * Check if a sport theme value is valid.
   */
  private isValidSportTheme(theme: string): boolean {
    const validThemes = Object.values(SPORT_TO_THEME).filter(Boolean) as string[];
    return validThemes.includes(theme);
  }

  /**
   * Get the sport theme for a given sport name.
   *
   * @param sport - Sport name (e.g., 'football')
   * @returns SportTheme or null if not found
   */
  getSportThemeForSport(sport: string): SportTheme {
    if (!sport) return null;
    return SPORT_TO_THEME[sport.toLowerCase().trim()] || null;
  }
}
