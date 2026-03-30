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
  InjectionToken,
  inject,
  signal,
  computed,
  effect,
  Injector,
  PLATFORM_ID,
  DestroyRef,
  TransferState,
  makeStateKey,
  afterNextRender,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';

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
  | 'track'
  | 'ice-hockey'
  | 'tennis'
  | 'golf'
  | 'swimming-diving'
  | 'wrestling'
  | 'gymnastics'
  | 'rowing';

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
  {
    id: 'ice-hockey',
    label: 'Ice Hockey',
    icon: 'sports',
    primaryColor: '#6ea8fe',
    description: 'Ice blue intensity',
  },
  {
    id: 'tennis',
    label: 'Tennis',
    icon: 'sports',
    primaryColor: '#c0ca33',
    description: 'Court green precision',
  },
  {
    id: 'golf',
    label: 'Golf',
    icon: 'sports',
    primaryColor: '#1f7a4c',
    description: 'Augusta green classic',
  },
  {
    id: 'swimming-diving',
    label: 'S&D',
    icon: 'sports',
    primaryColor: '#14b8a6',
    description: 'Aquatic cyan flow',
  },
  {
    id: 'wrestling',
    label: 'Wrestling',
    icon: 'sports',
    primaryColor: '#d81b60',
    description: 'Crimson championship grit',
  },
  {
    id: 'gymnastics',
    label: 'Gymnastics',
    icon: 'sports',
    primaryColor: '#5e35b1',
    description: 'Violet elegance',
  },
  {
    id: 'rowing',
    label: 'Rowing',
    icon: 'sports',
    primaryColor: '#ff7043',
    description: 'River blue rhythm',
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
  'sport-ice-hockey': '#0c1426',
  'sport-tennis': '#1e230e',
  'sport-golf': '#0f1c14',
  'sport-swimming-diving': '#071d1d',
  'sport-wrestling': '#1f0b15',
  'sport-gymnastics': '#140f24',
  'sport-rowing': '#2a120c',
};

// ============================================
// SSR INJECTION TOKENS & TRANSFER STATE
// ============================================

/**
 * Optional injection token for theme preference provided during SSR.
 * The web server extracts this from a cookie and provides it
 * so the server-rendered HTML already has the correct theme.
 */
export const SSR_INITIAL_THEME = new InjectionToken<string | undefined>('SSR_INITIAL_THEME');

/**
 * Optional injection token for sport theme provided during SSR.
 */
export const SSR_INITIAL_SPORT_THEME = new InjectionToken<string | undefined>(
  'SSR_INITIAL_SPORT_THEME'
);

/** TransferState key for theme preference (SSR → client) */
const THEME_TRANSFER_KEY = makeStateKey<string>('nxt1.theme.preference');

/** TransferState key for sport theme (SSR → client) */
const SPORT_THEME_TRANSFER_KEY = makeStateKey<string>('nxt1.theme.sport');

/** Cookie name for theme preference */
const THEME_COOKIE_NAME = 'nxt1-theme-preference';

/** Cookie name for sport theme */
const SPORT_COOKIE_NAME = 'nxt1-sport-theme';

/** Cookie max age (1 year in seconds) */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class NxtThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly transferState = inject(TransferState);
  private readonly doc = inject(DOCUMENT);

  /** SSR-provided theme preference (from cookie, optional) */
  private readonly ssrTheme = inject(SSR_INITIAL_THEME, { optional: true });

  /** SSR-provided sport theme (from cookie, optional) */
  private readonly ssrSportTheme = inject(SSR_INITIAL_SPORT_THEME, { optional: true });

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
    if (!this.isBrowser) {
      // ── SERVER: Read from SSR injection tokens (provided from cookies) ──
      this.initializeFromSsr();
    } else if (this.transferState.hasKey(THEME_TRANSFER_KEY)) {
      // ── CLIENT HYDRATION: Read TransferState synchronously before afterNextRender ──
      // This ensures the first client render matches the server-rendered theme.
      this.initializeFromTransferState();
    } else {
      // ── CLIENT (no TransferState): Defer to afterNextRender ──
      afterNextRender(() => {
        this.initialize();
      });
    }
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
   * Cycle through theme preferences: system → light → dark → system.
   * Preserves the 'system' option in the rotation so it is never lost.
   */
  toggle(): void {
    const pref = this._preference();
    const next = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
    this.setTheme(next);
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
        const sportTheme = this._sportTheme();
        void this.syncStatusBar(theme, sportTheme);
      },
      { injector: this.injector }
    );
  }

  /**
   * Manually sync the status bar with the current theme.
   * Usually not needed if enableStatusBarSync() has been called.
   */
  async syncStatusBar(theme?: EffectiveTheme, sportTheme?: SportTheme | null): Promise<void> {
    if (!this.isBrowser) return;

    const effectiveTheme = theme ?? this.effectiveTheme();
    const activeSportTheme = sportTheme ?? this._sportTheme();
    const useDarkStatusBarContent = effectiveTheme === 'light' && activeSportTheme === null;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // Light base theme = dark status bar content
      // Dark base theme OR any sport theme = light status bar content
      const style = useDarkStatusBarContent ? Style.Dark : Style.Light;
      await StatusBar.setStyle({ style });

      // On Android, also set the background color
      try {
        const activeTheme = activeSportTheme ? `sport-${activeSportTheme}` : effectiveTheme;
        const bgColor =
          THEME_BG_COLORS[activeTheme] ?? THEME_BG_COLORS[effectiveTheme] ?? '#0a0a0a';
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
   * Server-side initialization: read from injection tokens (cookies),
   * set signals, apply theme to the server-rendered DOM, and write
   * TransferState so the client can hydrate instantly.
   */
  private initializeFromSsr(): void {
    const validThemes: string[] = ['light', 'dark', 'system'];
    const validSports: readonly string[] = SPORT_THEME_OPTIONS.map((opt) => opt.id);

    // Read SSR-provided theme preference
    if (this.ssrTheme && validThemes.includes(this.ssrTheme)) {
      this._preference.set(this.ssrTheme as ThemePreference);
    } else {
      this._preference.set('dark'); // Default matches loadPreference() default
    }

    // Read SSR-provided sport theme
    if (this.ssrSportTheme && validSports.includes(this.ssrSportTheme)) {
      this._sportTheme.set(this.ssrSportTheme as SportTheme);
    }

    // Apply theme to server-rendered HTML via DOCUMENT token (SSR-safe)
    this.applyThemeToDocument();

    // Write to TransferState so client hydration is instant
    this.transferState.set(THEME_TRANSFER_KEY, this._preference());
    const sport = this._sportTheme();
    if (sport) {
      this.transferState.set(SPORT_THEME_TRANSFER_KEY, sport);
    }

    this._initialized.set(true);
  }

  /**
   * Client hydration initialization: read from TransferState synchronously
   * so the first client render matches the server-rendered theme.
   * Then schedule full browser initialization (listeners, matchMedia).
   */
  private initializeFromTransferState(): void {
    const validThemes: string[] = ['light', 'dark', 'system'];
    const validSports: readonly string[] = SPORT_THEME_OPTIONS.map((opt) => opt.id);

    // Read themes from TransferState (synchronous, no DOM needed)
    const transferred = this.transferState.get(THEME_TRANSFER_KEY, 'dark');
    if (validThemes.includes(transferred)) {
      this._preference.set(transferred as ThemePreference);
    }

    const transferredSport = this.transferState.get(SPORT_THEME_TRANSFER_KEY, '');
    if (transferredSport && validSports.includes(transferredSport)) {
      this._sportTheme.set(transferredSport as SportTheme);
    }

    this._initialized.set(true);

    // Schedule full browser initialization (system preference detection, listeners)
    afterNextRender(() => {
      this.detectSystemPreference();
      this.setupSystemPreferenceListener();

      // localStorage may have been updated since SSR; reconcile
      const localPref = this.loadPreference();
      const localSport = this.loadSportTheme();
      if (localPref !== this._preference()) {
        this._preference.set(localPref);
      }
      if (localSport !== this._sportTheme()) {
        this._sportTheme.set(localSport);
      }

      this.applyTheme('init');
    });
  }

  /**
   * Apply theme to the document element using DOCUMENT token (SSR-safe).
   * Used on the server where `document` global may not be the right document.
   */
  private applyThemeToDocument(): void {
    const effectiveTheme = this.effectiveTheme();
    const sportTheme = this._sportTheme();
    const activeTheme = this.activeTheme();

    const docElement = this.doc?.documentElement;
    if (!docElement) return;

    docElement.setAttribute(THEME_ATTRIBUTE, activeTheme);
    docElement.setAttribute(BASE_THEME_ATTRIBUTE, effectiveTheme);

    const colorScheme = sportTheme ? 'dark' : effectiveTheme;
    docElement.style.setProperty('color-scheme', colorScheme);

    const bgColor = THEME_BG_COLORS[activeTheme] ?? THEME_BG_COLORS[effectiveTheme] ?? '#0a0a0a';
    docElement.style.setProperty('background-color', bgColor);
  }

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

    // Sync cookies from localStorage so SSR works on next page load
    this.setCookie(THEME_COOKIE_NAME, savedPreference);
    if (savedSportTheme) {
      this.setCookie(SPORT_COOKIE_NAME, savedSportTheme);
    }

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
      // Storage access denied or unavailable — fall through to default
    }

    // Default to 'dark' — must match the inline script in index.html
    return 'dark';
  }

  /**
   * Save preference to storage and cookie.
   */
  private savePreference(preference: ThemePreference): void {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Storage unavailable — preference won't persist
    }

    // Also set cookie so SSR can read it on next page load
    this.setCookie(THEME_COOKIE_NAME, preference);
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
      // Storage unavailable — fall through to default
    }

    return null;
  }

  /**
   * Save sport theme to storage and cookie.
   */
  private saveSportTheme(sport: SportTheme): void {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(SPORT_STORAGE_KEY, sport);
    } catch {
      // Storage unavailable — sport theme won't persist
    }

    // Also set cookie so SSR can read it on next page load
    this.setCookie(SPORT_COOKIE_NAME, sport);
  }

  /**
   * Clear sport theme from storage and cookie.
   */
  private clearSportThemeStorage(): void {
    if (!this.isBrowser) return;

    try {
      localStorage.removeItem(SPORT_STORAGE_KEY);
    } catch {
      // Storage unavailable — non-critical
    }

    // Clear sport theme cookie
    this.setCookie(SPORT_COOKIE_NAME, '', 0);
  }

  /**
   * Set a cookie with SameSite=Lax and Secure flag.
   * @param name Cookie name
   * @param value Cookie value
   * @param maxAge Max age in seconds (default: COOKIE_MAX_AGE). Pass 0 to delete.
   */
  private setCookie(name: string, value: string, maxAge: number = COOKIE_MAX_AGE): void {
    if (!this.isBrowser) return;

    try {
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
    } catch {
      // Cookie access denied — non-critical
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
