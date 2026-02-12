/**
 * @fileoverview Theme Service - Professional Theme Management (2026)
 * @module @nxt1/ui/services/theme
 * @version 2.0.0
 *
 * Enterprise-grade theme service for managing app appearance with:
 * - Light/Dark/System automatic theme modes
 * - Sport-specific color themes (Football, Basketball, Baseball, Softball)
 * - System preference detection and auto-sync
 * - Persistent storage with graceful fallbacks
 * - Real-time theme switching with CSS custom properties
 * - SSR-safe implementation
 * - Cross-platform support (Web, iOS, Android)
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  User Preferences (localStorage)                           │
 * │  ├── nxt1-theme-preference: 'light' | 'dark' | 'system'   │
 * │  └── nxt1-sport-theme: 'football' | 'basketball' | null    │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Theme Resolution                                          │
 * │  ├── preference + system → effectiveTheme (light/dark)     │
 * │  └── sportTheme → data-theme attribute override            │
 * ├─────────────────────────────────────────────────────────────┤
 * │  DOM Application                                           │
 * │  ├── <html data-theme="dark|light|sport-football">         │
 * │  ├── <html data-base-theme="dark|light">                   │
 * │  └── color-scheme CSS property                             │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Usage:
 * ```typescript
 * const theme = inject(NxtThemeService);
 *
 * // Basic theme control
 * theme.setTheme('dark');
 * theme.setTheme('system'); // Follow OS preference
 *
 * // Sport themes (accent colors)
 * theme.setSportTheme('football');
 * theme.clearSportTheme();
 *
 * // Reactive state
 * theme.effectiveTheme(); // 'light' | 'dark'
 * theme.sportTheme(); // 'football' | null
 * theme.isDark(); // boolean
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Injectable,
  inject,
  signal,
  computed,
  effect,
  Injector,
  PLATFORM_ID,
  DestroyRef,
  afterNextRender,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// ============================================
// TYPES
// ============================================

/** User's theme preference setting */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Actual rendered theme (resolved from preference) */
export type EffectiveTheme = 'light' | 'dark';

/** Available sport themes */
export type SportTheme =
  | 'football'
  | 'basketball'
  | 'baseball'
  | 'softball'
  | 'soccer'
  | 'volleyball'
  | 'lacrosse'
  | 'track';

/** Theme change event */
export interface ThemeChangeEvent {
  /** Previous effective theme */
  previous: EffectiveTheme;
  /** New effective theme */
  current: EffectiveTheme;
  /** User's preference setting */
  preference: ThemePreference;
  /** Active sport theme (if any) */
  sportTheme: SportTheme | null;
  /** What triggered the change */
  trigger: 'user' | 'system' | 'sport' | 'init';
  /** Event timestamp */
  timestamp: number;
}

/** Theme option for UI display */
export interface ThemeOption {
  /** Unique identifier */
  id: ThemePreference;
  /** Display label */
  label: string;
  /** Icon name (for nxt1-icon or ion-icon) */
  icon: string;
  /** Description text */
  description: string;
}

/** Sport theme option for UI display */
export interface SportThemeOption {
  /** Unique identifier */
  id: SportTheme;
  /** Display label */
  label: string;
  /** Icon name or emoji */
  icon: string;
  /** Primary color (hex) */
  primaryColor: string;
  /** Description text */
  description: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Storage key for theme preference */
const THEME_STORAGE_KEY = 'nxt1-theme-preference';

/** Storage key for sport theme */
const SPORT_STORAGE_KEY = 'nxt1-sport-theme';

/** HTML attribute for theme */
const THEME_ATTRIBUTE = 'data-theme';

/** HTML attribute for base theme (used when sport theme is active) */
const BASE_THEME_ATTRIBUTE = 'data-base-theme';

/** Default theme options for UI */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: 'system',
    label: 'System',
    icon: 'smartphone',
    description: 'Match device settings',
  },
  {
    id: 'light',
    label: 'Light',
    icon: 'sun',
    description: 'Light appearance',
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: 'moon',
    description: 'Dark appearance',
  },
] as const;

/** Sport theme options for UI */
export const SPORT_THEME_OPTIONS: readonly SportThemeOption[] = [
  {
    id: 'football',
    label: 'Football',
    icon: 'football',
    primaryColor: '#00c853',
    description: 'Green field colors',
  },
  {
    id: 'basketball',
    label: 'Basketball',
    icon: 'basketball',
    primaryColor: '#ff6d00',
    description: 'Hardwood orange',
  },
  {
    id: 'baseball',
    label: 'Baseball',
    icon: 'baseball',
    primaryColor: '#2575ff',
    description: 'Diamond blue',
  },
  {
    id: 'softball',
    label: 'Softball',
    icon: 'baseball',
    primaryColor: '#ffed4e',
    description: 'Softball yellow',
  },
  {
    id: 'soccer',
    label: 'Soccer',
    icon: 'soccer',
    primaryColor: '#e10600',
    description: 'Red & black pitch',
  },
  {
    id: 'volleyball',
    label: 'Volleyball',
    icon: 'volleyball',
    primaryColor: '#ff4fb3',
    description: 'Pink & black energy',
  },
  {
    id: 'lacrosse',
    label: 'Lacrosse',
    icon: 'lacrosse',
    primaryColor: '#00bcd4',
    description: 'Teal & white precision',
  },
  {
    id: 'track',
    label: 'Track & Field',
    icon: 'track',
    primaryColor: '#7c4dff',
    description: 'Purple speed',
  },
] as const;

/** Background colors for each theme (for flash prevention) */
const THEME_BG_COLORS: Record<string, string> = {
  light: '#ffffff',
  dark: '#0a0a0a',
  'sport-football': '#0d1a0f',
  'sport-basketball': '#3d2000',
  'sport-baseball': '#1a1424',
  'sport-softball': '#1a1818',
  'sport-soccer': '#120909',
  'sport-volleyball': '#140a12',
  'sport-lacrosse': '#08181c',
  'sport-track': '#120a1c',
};

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class NxtThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  /** Whether running in browser */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Media query for system dark mode preference */
  private mediaQuery: MediaQueryList | null = null;

  /** Whether status bar sync is enabled */
  private statusBarSyncEnabled = false;

  // ============================================
  // STATE (Signals)
  // ============================================

  /** User's theme preference (what they selected) */
  private readonly _preference = signal<ThemePreference>('system');

  /** Active sport theme (null = default NXT1 volt theme) */
  private readonly _sportTheme = signal<SportTheme | null>(null);

  /** System's preferred color scheme */
  private readonly _systemPrefersDark = signal<boolean>(false);

  /**
   * Temporary theme override (e.g., for onboarding flow).
   * When set, this takes precedence over user preference.
   * Does NOT persist to storage - resets on page reload.
   */
  private readonly _temporaryOverride = signal<EffectiveTheme | null>(null);

  /** Whether service has initialized */
  private readonly _initialized = signal<boolean>(false);

  // ============================================
  // PUBLIC COMPUTED SIGNALS
  // ============================================

  /** User's theme preference */
  readonly preference = computed(() => this._preference());

  /** Active sport theme */
  readonly sportTheme = computed(() => this._sportTheme());

  /** System prefers dark mode */
  readonly systemPrefersDark = computed(() => this._systemPrefersDark());

  /** Whether service has initialized */
  readonly initialized = computed(() => this._initialized());

  /** Whether a temporary theme override is active */
  readonly hasTemporaryOverride = computed(() => this._temporaryOverride() !== null);

  /**
   * The actual base theme being displayed (light/dark).
   * Priority: temporaryOverride > preference > system
   * Resolves 'system' preference to actual light/dark based on OS settings.
   */
  readonly effectiveTheme = computed<EffectiveTheme>(() => {
    // Temporary override takes precedence (e.g., during onboarding)
    const override = this._temporaryOverride();
    if (override !== null) {
      return override;
    }

    const pref = this._preference();
    if (pref === 'system') {
      return this._systemPrefersDark() ? 'dark' : 'light';
    }
    return pref;
  });

  /**
   * The actual data-theme attribute value.
   * Returns sport theme if active, otherwise effective theme.
   */
  readonly activeTheme = computed<string>(() => {
    const sport = this._sportTheme();
    if (sport) {
      return `sport-${sport}`;
    }
    return this.effectiveTheme();
  });

  /** Whether dark mode is currently active (base theme) */
  readonly isDark = computed(() => this.effectiveTheme() === 'dark');

  /** Whether light mode is currently active (base theme) */
  readonly isLight = computed(() => this.effectiveTheme() === 'light');

  /** Whether system preference is selected */
  readonly isSystemPreference = computed(() => this._preference() === 'system');

  /** Whether a sport theme is active */
  readonly hasSportTheme = computed(() => this._sportTheme() !== null);

  constructor() {
    // Initialize after render (browser-only)
    afterNextRender(() => {
      this.initialize();
    });
  }

  // ============================================
  // PUBLIC API - Theme Control
  // ============================================

  /**
   * Set the theme preference.
   * @param preference - 'light', 'dark', or 'system'
   */
  setTheme(preference: ThemePreference): void {
    this._preference.set(preference);
    this.savePreference(preference);
    this.applyTheme('user');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
    }
  }

  /**
   * Toggle between light and dark mode.
   * If currently on 'system', switches to the opposite of current effective theme.
   */
  toggle(): void {
    const current = this.effectiveTheme();
    this.setTheme(current === 'dark' ? 'light' : 'dark');
  }

  /**
   * Reset to system preference.
   */
  resetToSystem(): void {
    this.setTheme('system');
  }

  /**
   * Get the current theme option object.
   */
  getCurrentOption(): ThemeOption {
    const pref = this._preference();
    return THEME_OPTIONS.find((opt) => opt.id === pref) ?? THEME_OPTIONS[0];
  }

  // ============================================
  // PUBLIC API - Temporary Theme Override
  // ============================================

  /**
   * Set a temporary theme override that takes precedence over user preference.
   * Used for controlled experiences like onboarding flows.
   *
   * This does NOT modify the user's saved preference - it's purely visual.
   * Call `clearTemporaryOverride()` to restore normal theme behavior.
   *
   * @param theme - The theme to force ('light' or 'dark')
   *
   * @example
   * ```typescript
   * // During onboarding, force light theme
   * theme.setTemporaryOverride('light');
   *
   * // On completion, transition to dark, then clear
   * theme.setTemporaryOverride('dark');
   * await delay(300); // Allow smooth transition
   * theme.clearTemporaryOverride();
   * ```
   */
  setTemporaryOverride(theme: EffectiveTheme): void {
    this._temporaryOverride.set(theme);
    this.applyTheme('user');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
    }

    this.logChange('Temporary override set', { theme });
  }

  /**
   * Clear the temporary theme override, restoring normal theme behavior.
   * The theme will return to the user's saved preference.
   */
  clearTemporaryOverride(): void {
    this._temporaryOverride.set(null);
    this.applyTheme('user');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
    }

    this.logChange('Temporary override cleared', { restoredTo: this.effectiveTheme() });
  }

  // ============================================
  // PUBLIC API - Sport Themes
  // ============================================

  /**
   * Set the sport theme (accent colors).
   * Sport themes are dark-based with sport-specific colors.
   * @param sport - Sport theme to apply
   */
  setSportTheme(sport: SportTheme): void {
    this._sportTheme.set(sport);
    this.saveSportTheme(sport);
    this.applyTheme('sport');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
    }
  }

  /**
   * Clear the sport theme, reverting to default NXT1 volt colors.
   */
  clearSportTheme(): void {
    this._sportTheme.set(null);
    this.clearSportThemeStorage();
    this.applyTheme('sport');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
    }
  }

  /**
   * Get the current sport theme option object (if active).
   */
  getCurrentSportOption(): SportThemeOption | null {
    const sport = this._sportTheme();
    if (!sport) return null;
    return SPORT_THEME_OPTIONS.find((opt) => opt.id === sport) ?? null;
  }

  /**
   * Check if a specific sport theme is active.
   */
  isSportThemeActive(sport: SportTheme): boolean {
    return this._sportTheme() === sport;
  }

  // ============================================
  // PUBLIC API - Native Platform Integration
  // ============================================

  /**
   * Enable automatic status bar synchronization on native platforms (iOS/Android).
   *
   * When enabled, the status bar style (light/dark icons) will automatically
   * sync with the current theme.
   *
   * Call this once in your app's root component (e.g., AppComponent)
   * for native mobile apps.
   *
   * @example
   * ```typescript
   * export class AppComponent {
   *   private readonly theme = inject(NxtThemeService);
   *
   *   constructor() {
   *     afterNextRender(() => {
   *       this.theme.enableStatusBarSync();
   *     });
   *   }
   * }
   * ```
   */
  enableStatusBarSync(): void {
    if (!this.isBrowser) return;

    this.statusBarSyncEnabled = true;
    void this.syncStatusBar();

    // Auto-sync status bar whenever theme changes
    effect(
      () => {
        const theme = this.effectiveTheme();
        void this.syncStatusBar(theme);
      },
      { injector: this.injector }
    );
  }

  /**
   * Manually sync the status bar with the current theme.
   * Usually not needed if enableStatusBarSync() has been called.
   */
  async syncStatusBar(theme?: EffectiveTheme): Promise<void> {
    if (!this.isBrowser) return;

    const effectiveTheme = theme ?? this.effectiveTheme();

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // Dark theme = light/white status bar icons (Style.Dark)
      // Light theme = dark/black status bar icons (Style.Light)
      const style = effectiveTheme === 'dark' ? Style.Dark : Style.Light;
      await StatusBar.setStyle({ style });

      // On Android, also set the background color
      try {
        const bgColor = effectiveTheme === 'dark' ? '#0a0a0a' : '#ffffff';
        await StatusBar.setBackgroundColor({ color: bgColor });
      } catch {
        // setBackgroundColor throws on iOS - expected behavior
      }
    } catch {
      // StatusBar plugin not available (web browser) - silently ignore
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Initialize the theme service.
   * - Load saved preference
   * - Detect system preference
   * - Set up listeners
   */
  private initialize(): void {
    if (!this.isBrowser) {
      this._initialized.set(true);
      return;
    }

    this.detectSystemPreference();

    const savedPreference = this.loadPreference();
    const savedSportTheme = this.loadSportTheme();

    this._preference.set(savedPreference);
    this._sportTheme.set(savedSportTheme);

    this.applyTheme('init');
    this.setupSystemPreferenceListener();

    this._initialized.set(true);
  }

  /**
   * Detect system's preferred color scheme.
   */
  private detectSystemPreference(): void {
    if (!this.isBrowser) return;

    try {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._systemPrefersDark.set(this.mediaQuery.matches);
    } catch {
      // Fallback if matchMedia not supported
      this._systemPrefersDark.set(false);
    }
  }

  /**
   * Set up listener for system preference changes.
   */
  private setupSystemPreferenceListener(): void {
    if (!this.isBrowser || !this.mediaQuery) return;

    const handler = (event: MediaQueryListEvent) => {
      this._systemPrefersDark.set(event.matches);

      // Only apply if user has 'system' preference and no sport theme
      if (this._preference() === 'system') {
        this.applyTheme('system');
        this.logChange('System preference changed', {
          prefersDark: event.matches,
          effective: this.effectiveTheme(),
        });
      }
    };

    // Modern API (addEventListener)
    try {
      this.mediaQuery.addEventListener('change', handler);
      this.destroyRef.onDestroy(() => {
        this.mediaQuery?.removeEventListener('change', handler);
      });
    } catch {
      // Fallback for older browsers (deprecated but needed for Safari < 14)
      this.mediaQuery.addListener(handler);
      this.destroyRef.onDestroy(() => {
        this.mediaQuery?.removeListener(handler);
      });
    }
  }

  /**
   * Apply the current theme to the DOM.
   */
  private applyTheme(_trigger: ThemeChangeEvent['trigger']): void {
    if (!this.isBrowser) {
      return;
    }

    const effectiveTheme = this.effectiveTheme();
    const sportTheme = this._sportTheme();
    const activeTheme = this.activeTheme();

    // Set data-theme attribute (main theme selector)
    document.documentElement.setAttribute(THEME_ATTRIBUTE, activeTheme);

    // Set base theme attribute (for components that need light/dark regardless of sport)
    document.documentElement.setAttribute(BASE_THEME_ATTRIBUTE, effectiveTheme);

    // Set color-scheme for browser UI (scrollbars, form controls)
    const colorScheme = sportTheme ? 'dark' : effectiveTheme;
    document.documentElement.style.colorScheme = colorScheme;

    // Set background color to prevent flash
    const bgColor = THEME_BG_COLORS[activeTheme] ?? THEME_BG_COLORS[effectiveTheme] ?? '#0a0a0a';
    document.documentElement.style.backgroundColor = bgColor;

    // Update meta theme-color for mobile browsers
    this.updateMetaThemeColor(bgColor);
  }

  /**
   * Update the meta theme-color tag for mobile browser chrome.
   */
  private updateMetaThemeColor(color: string): void {
    if (!this.isBrowser) return;

    let metaThemeColor = document.querySelector('meta[name="theme-color"]');

    if (!metaThemeColor) {
      // Create if doesn't exist
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }

    metaThemeColor.setAttribute('content', color);
  }

  /**
   * Load saved preference from storage.
   */
  private loadPreference(): ThemePreference {
    if (!this.isBrowser) return 'dark';

    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && ['light', 'dark', 'system'].includes(saved)) {
        return saved as ThemePreference;
      }
    } catch {
      // Storage access denied or unavailable
      console.warn('[NxtThemeService] Could not access localStorage');
    }

    // Default to 'dark' — must match the inline script in index.html
    return 'dark';
  }

  /**
   * Save preference to storage.
   */
  private savePreference(preference: ThemePreference): void {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      console.warn('[NxtThemeService] Could not save to localStorage');
    }
  }

  /**
   * Load saved sport theme from storage.
   */
  private loadSportTheme(): SportTheme | null {
    if (!this.isBrowser) return null;

    try {
      const saved = localStorage.getItem(SPORT_STORAGE_KEY);
      // Validate against ALL supported sport themes
      const validSports: readonly string[] = SPORT_THEME_OPTIONS.map((opt) => opt.id);
      if (saved && validSports.includes(saved)) {
        return saved as SportTheme;
      }
    } catch {
      console.warn('[NxtThemeService] Could not access localStorage');
    }

    return null;
  }

  /**
   * Save sport theme to storage.
   */
  private saveSportTheme(sport: SportTheme): void {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(SPORT_STORAGE_KEY, sport);
    } catch {
      console.warn('[NxtThemeService] Could not save to localStorage');
    }
  }

  /**
   * Clear sport theme from storage.
   */
  private clearSportThemeStorage(): void {
    if (!this.isBrowser) return;

    try {
      localStorage.removeItem(SPORT_STORAGE_KEY);
    } catch {
      console.warn('[NxtThemeService] Could not clear localStorage');
    }
  }

  /**
   * Log debug information (development only).
   */
  private logChange(message: string, data?: Record<string, unknown>): void {
    if (!this.isBrowser) return;

    // Only log in development
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      console.debug(`[NxtThemeService] ${message}`, data ?? '');
    }
  }
}
