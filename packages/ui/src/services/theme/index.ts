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
import { NxtLoggingService } from '../logging/logging.service';

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

type TeamThemeReturnState = {
  readonly preference: ThemePreference;
  readonly sportTheme: SportTheme | null;
};

// ============================================
// CONSTANTS
// ============================================

/** Storage key for theme preference */
const THEME_STORAGE_KEY = 'nxt1-theme-preference';

/** Storage key for sport theme */
const SPORT_STORAGE_KEY = 'nxt1-sport-theme';

/** Storage key for stored Team brand colors */
const TEAM_BRAND_STORAGE_KEY = 'nxt1-team-brand';

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
  team: '#0a0a0a',
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

const GENERIC_TEAM_PRIMARY = '#4f8cff';
const GENERIC_TEAM_SECONDARY = '#f7c948';

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

/** Cookie name for stored Team brand colors */
const TEAM_BRAND_COOKIE_NAME = 'nxt1-team-brand';

/** Cookie max age (1 year in seconds) */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Custom properties applied for org-specific page theming. */
const ORG_THEME_CUSTOM_PROPERTIES = [
  '--team-primary',
  '--team-primary-rgb',
  '--team-primary-light',
  '--team-primary-dark',
  '--team-secondary',
  '--team-secondary-light',
  '--team-secondary-dark',
  '--team-accent',
  '--team-accent-light',
  '--team-accent-dark',
  '--team-text-on-primary',
  '--team-text-on-primary-rgb',
  '--nxt1-color-primary-400',
  '--nxt1-color-primary',
  '--nxt1-color-primaryLight',
  '--nxt1-color-primary-light',
  '--nxt1-color-primaryDark',
  '--nxt1-color-primary-dark',
  '--nxt1-color-secondary',
  '--nxt1-color-secondaryLight',
  '--nxt1-color-secondary-light',
  '--nxt1-color-secondaryDark',
  '--nxt1-color-secondary-dark',
  '--nxt1-color-accent',
  '--nxt1-color-accentLight',
  '--nxt1-color-accent-light',
  '--nxt1-color-accentDark',
  '--nxt1-color-accent-dark',
  '--nxt1-color-bg-primary',
  '--nxt1-color-bg-secondary',
  '--nxt1-color-bg-tertiary',
  '--nxt1-color-bg-elevated',
  '--nxt1-color-bg-overlay',
  '--nxt1-color-surface-100',
  '--nxt1-color-surface-200',
  '--nxt1-color-surface-300',
  '--nxt1-color-surface-400',
  '--nxt1-color-surface-500',
  '--nxt1-color-text-primary',
  '--nxt1-color-text-secondary',
  '--nxt1-color-text-tertiary',
  '--nxt1-color-text-disabled',
  '--nxt1-color-text-inverse',
  '--nxt1-color-text-on-primary',
  '--nxt1-color-text-on-Primary',
  '--nxt1-color-border',
  '--nxt1-color-border-subtle',
  '--nxt1-color-border-default',
  '--nxt1-color-border-strong',
  '--nxt1-color-border-primary',
  '--nxt1-color-state-hover',
  '--nxt1-color-state-pressed',
  '--nxt1-color-state-focus',
  '--nxt1-color-state-disabled',
  '--nxt1-color-alpha-primary5',
  '--nxt1-color-alpha-primary10',
  '--nxt1-color-alpha-primary20',
  '--nxt1-color-alpha-primary30',
  '--nxt1-color-alpha-primary50',
  '--nxt1-color-focus-ring',
  '--nxt1-color-focus-ringOffset',
  '--nxt1-color-loading-spinner',
  '--nxt1-color-loading-skeleton',
  '--nxt1-color-loading-skeletonShimmer',
  '--ion-color-primary',
  '--ion-color-primary-rgb',
  '--ion-color-primary-contrast',
  '--ion-color-primary-contrast-rgb',
  '--ion-color-primary-shade',
  '--ion-color-primary-tint',
  '--ion-ripple-color',
] as const;

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
  private readonly logger = inject(NxtLoggingService).child('NxtThemeService');

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

  /** Whether org/team palette custom properties are currently applied. */
  private readonly _orgThemeApplied = signal(false);

  /** Stored org theme source colors for rebuilding the active team palette. */
  private readonly _orgThemePrimary = signal<string | null>(null);
  private readonly _orgThemeSecondary = signal<string | null>(null);

  /** Page-scoped sources that want the team theme mode active. */
  private readonly _teamThemeSources = signal<readonly string[]>([]);

  /** Whether Team is the currently selected theme option. */
  private readonly _teamThemeSelected = signal(false);

  /** Previous non-team theme to restore when a scoped team page unmounts. */
  private readonly _teamThemeReturnState = signal<TeamThemeReturnState | null>(null);

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

  /** Whether the Team slot should be rendered in the selector UI. */
  readonly hasTeamThemeOption = computed(() => true);

  /** Stable team brand color for selector chips and off-page Team selection. */
  readonly teamThemePrimaryColor = computed(() => this._orgThemePrimary() ?? GENERIC_TEAM_PRIMARY);

  /** Stable team secondary color for future UI consumers. */
  readonly teamThemeSecondaryColor = computed(
    () => this._orgThemeSecondary() ?? GENERIC_TEAM_SECONDARY
  );

  /** Whether the current page is supplying contextual team colors. */
  readonly hasScopedTeamPalette = computed(
    () => this._orgThemeApplied() && this._teamThemeSources().length > 0
  );

  /** Whether Team is the currently active theme option. */
  readonly isTeamThemeActive = computed(() => this._teamThemeSelected());

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
   * Returns team theme if active, otherwise sport theme, otherwise effective theme.
   */
  readonly activeTheme = computed<string>(() => {
    if (this.isTeamThemeActive()) {
      return 'team';
    }

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

  /** Whether any page currently requests the team theme mode. */
  readonly hasScopedTeamTheme = computed(() => this._teamThemeSources().length > 0);

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
    this._teamThemeSelected.set(false);
    this._preference.set(preference);
    this.savePreference(preference);
    this.applyTheme('user');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
      void this.syncKeyboard();
      void this.syncNavigationBar();
      void this.syncIOSAppearance();
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
      void this.syncKeyboard();
      void this.syncNavigationBar();
      void this.syncIOSAppearance();
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
      void this.syncKeyboard();
      void this.syncNavigationBar();
      void this.syncIOSAppearance();
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
    this._teamThemeSelected.set(false);
    this._sportTheme.set(sport);
    this.saveSportTheme(sport);
    this.applyTheme('sport');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
      void this.syncKeyboard();
      void this.syncNavigationBar();
      void this.syncIOSAppearance();
    }
  }

  /**
   * Activate the page-scoped team theme mode.
   * This does not persist anything; it only changes the rendered theme while
   * the caller remains mounted.
   */
  activateTeamTheme(source: string): void {
    const normalizedSource = source.trim();
    if (!normalizedSource) return;

    const sources = this._teamThemeSources();
    if (sources.includes(normalizedSource)) return;

    const shouldAutoActivate = sources.length === 0;
    this._teamThemeSources.set([...sources, normalizedSource]);
    if (shouldAutoActivate) {
      if (!this._teamThemeSelected()) {
        this.captureTeamReturnState();
        this._teamThemeSelected.set(true);
      } else {
        this._teamThemeReturnState.set(null);
      }
    }
    this.applyTheme('sport');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
      void this.syncKeyboard();
      void this.syncNavigationBar();
      void this.syncIOSAppearance();
    }
  }

  /**
   * Deactivate the page-scoped team theme mode for a specific caller.
   */
  deactivateTeamTheme(source: string): void {
    const normalizedSource = source.trim();
    if (!normalizedSource) return;

    const nextSources = this._teamThemeSources().filter(
      (activeSource) => activeSource !== normalizedSource
    );

    if (nextSources.length === this._teamThemeSources().length) return;

    const shouldRestorePreviousTheme =
      nextSources.length === 0 &&
      this._teamThemeSelected() &&
      this._teamThemeReturnState() !== null;

    this._teamThemeSources.set(nextSources);

    if (nextSources.length === 0) {
      if (shouldRestorePreviousTheme) {
        this.restoreThemeAfterTeamScope();
        this._teamThemeSelected.set(false);
      }
      this._teamThemeReturnState.set(null);
    }
    this.applyTheme('sport');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
      void this.syncKeyboard();
      void this.syncNavigationBar();
      void this.syncIOSAppearance();
    }
  }

  /**
   * Select the Team theme when a contextual team palette is available.
   */
  selectTeamTheme(): void {
    this._teamThemeReturnState.set(null);
    this._teamThemeSelected.set(true);
    this.applyTheme('sport');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
      void this.syncKeyboard();
      void this.syncNavigationBar();
      void this.syncIOSAppearance();
    }
  }

  /**
   * Seed Team brand colors without marking the current route as a scoped team surface.
   */
  setStoredTeamBrand(primary: string, secondary?: string | null): void {
    const normalizedPrimary = primary.trim();
    if (!normalizedPrimary) return;

    this._orgThemePrimary.set(normalizedPrimary);
    this._orgThemeSecondary.set(secondary?.trim() || null);

    this.saveStoredTeamBrand(normalizedPrimary, secondary?.trim() || null);

    if (this.isBrowser && !this._orgThemeApplied()) {
      this.applyTheme('sport');
    }
  }

  /**
   * Clear Team brand colors stored for off-page Team selection.
   */
  clearStoredTeamBrand(): void {
    this._orgThemePrimary.set(null);
    this._orgThemeSecondary.set(null);

    this.clearStoredTeamBrandStorage();

    if (this.isBrowser && !this._orgThemeApplied()) {
      this.applyTheme('sport');
    }
  }

  // ============================================
  // PUBLIC API - Org / Team Brand Colors
  // ============================================

  /**
   * Apply an organisation's brand colors to the document-level design token
   * custom properties (`--team-primary`, `--team-secondary`, `--team-accent`,
   * `--team-text-on-primary`).
   *
   * This is the correct, token-system-native way to activate organisation
   * colors.  Every component that references `var(--team-primary)` or
   * `var(--team-accent)` — including all surface/border/gradient tokens in
   * `semantic.tokens.json` — will automatically pick up the injected value
   * through the CSS cascade without any per-component inline style hacks.
   *
   * @param primary   - Hex color, e.g. `"#003087"`
   * @param secondary - Optional hex color, e.g. `"#FFB612"`
   *
   * @example
   * ```typescript
   * // Called when profile / team data resolves
   * this.theme.applyOrgTheme('#003087', '#FFB612');
   * ```
   */
  applyOrgTheme(primary: string, secondary?: string | null): void {
    const normalizedPrimary = primary.trim();
    if (!normalizedPrimary) return;

    this.setStoredTeamBrand(normalizedPrimary, secondary ?? null);
    this._orgThemeApplied.set(true);

    if (!this.isBrowser) return;

    this.applyTheme('sport');

    this.logger.debug('Org theme applied', {
      primary: normalizedPrimary,
      secondary: secondary ?? null,
    });
  }

  /**
   * Remove organisation brand colors from the document, restoring the
   * default NXT1 volt palette fallbacks defined in the token system.
   *
   * Call this whenever leaving a profile or team page.
   */
  clearOrgTheme(): void {
    if (!this.isBrowser) return;

    const root = this.doc?.documentElement;
    if (!root) return;

    this._orgThemeApplied.set(false);
    this.clearTeamPalette(root);
    this.applyTheme('sport');

    this.logger.debug('Org theme cleared');
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Return `#000000` or `#ffffff` — whichever gives better contrast
   * against `hex` per the WCAG simplified luminance formula.
   */
  private contrastColor(hex: string): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '#000000';
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  private buildOrgThemePalette(primary: string, secondary?: string): Record<string, string> {
    const safeSecondary = secondary || this.mixHex(primary, '#ffffff', 0.4);
    const textOnPrimary = this.contrastColor(primary);
    const primaryRgb = this.hexToRgb(primary);
    const textOnPrimaryRgb = this.hexToRgb(textOnPrimary);

    const primaryLight = this.mixHex(primary, '#ffffff', 0.24);
    const primaryDark = this.mixHex(primary, '#000000', 0.24);
    const secondaryLight = this.mixHex(safeSecondary, '#ffffff', 0.22);
    const secondaryDark = this.mixHex(safeSecondary, '#000000', 0.22);
    const accent = safeSecondary;
    const accentLight = this.mixHex(accent, '#ffffff', 0.18);
    const accentDark = this.mixHex(accent, '#000000', 0.18);

    const bgPrimary = this.mixHex(primary, '#000000', 0.9);
    const bgSecondary = this.mixHex(primary, '#000000', 0.85);
    const bgTertiary = this.mixHex(primary, '#000000', 0.8);
    const bgElevated = this.mixHex(primary, '#000000', 0.75);
    const surface100 = this.mixHex(bgPrimary, '#ffffff', 0.04);
    const surface200 = this.mixHex(bgPrimary, '#ffffff', 0.07);
    const surface300 = this.mixHex(bgPrimary, '#ffffff', 0.1);
    const surface400 = this.mixHex(bgPrimary, '#ffffff', 0.14);
    const surface500 = this.mixHex(bgPrimary, '#ffffff', 0.18);

    return {
      '--team-primary': primary,
      '--team-primary-rgb': primaryRgb,
      '--team-primary-light': primaryLight,
      '--team-primary-dark': primaryDark,
      '--team-secondary': safeSecondary,
      '--team-secondary-light': secondaryLight,
      '--team-secondary-dark': secondaryDark,
      '--team-accent': primary,
      '--team-accent-light': primaryLight,
      '--team-accent-dark': primaryDark,
      '--team-text-on-primary': textOnPrimary,
      '--team-text-on-primary-rgb': textOnPrimaryRgb,
      '--nxt1-color-primary-400': primary,
      '--nxt1-color-primary': primary,
      '--nxt1-color-primaryLight': primaryLight,
      '--nxt1-color-primary-light': primaryLight,
      '--nxt1-color-primaryDark': primaryDark,
      '--nxt1-color-primary-dark': primaryDark,
      '--nxt1-color-secondary': safeSecondary,
      '--nxt1-color-secondaryLight': secondaryLight,
      '--nxt1-color-secondary-light': secondaryLight,
      '--nxt1-color-secondaryDark': secondaryDark,
      '--nxt1-color-secondary-dark': secondaryDark,
      '--nxt1-color-accent': accent,
      '--nxt1-color-accentLight': accentLight,
      '--nxt1-color-accent-light': accentLight,
      '--nxt1-color-accentDark': accentDark,
      '--nxt1-color-accent-dark': accentDark,
      '--nxt1-color-bg-primary': bgPrimary,
      '--nxt1-color-bg-secondary': bgSecondary,
      '--nxt1-color-bg-tertiary': bgTertiary,
      '--nxt1-color-bg-elevated': bgElevated,
      '--nxt1-color-bg-overlay': 'rgba(0, 0, 0, 0.85)',
      '--nxt1-color-surface-100': surface100,
      '--nxt1-color-surface-200': surface200,
      '--nxt1-color-surface-300': surface300,
      '--nxt1-color-surface-400': surface400,
      '--nxt1-color-surface-500': surface500,
      '--nxt1-color-text-primary': '#ffffff',
      '--nxt1-color-text-secondary': 'rgba(255, 255, 255, 0.75)',
      '--nxt1-color-text-tertiary': 'rgba(255, 255, 255, 0.55)',
      '--nxt1-color-text-disabled': 'rgba(255, 255, 255, 0.35)',
      '--nxt1-color-text-inverse': bgPrimary,
      '--nxt1-color-text-on-primary': textOnPrimary,
      '--nxt1-color-text-on-Primary': textOnPrimary,
      '--nxt1-color-border': 'rgba(255, 255, 255, 0.12)',
      '--nxt1-color-border-subtle': 'rgba(255, 255, 255, 0.08)',
      '--nxt1-color-border-default': 'rgba(255, 255, 255, 0.12)',
      '--nxt1-color-border-strong': 'rgba(255, 255, 255, 0.22)',
      '--nxt1-color-border-primary': this.rgba(primaryRgb, 0.4),
      '--nxt1-color-state-hover': this.rgba(primaryRgb, 0.08),
      '--nxt1-color-state-pressed': this.rgba(primaryRgb, 0.16),
      '--nxt1-color-state-focus': this.rgba(primaryRgb, 0.24),
      '--nxt1-color-state-disabled': 'rgba(255, 255, 255, 0.12)',
      '--nxt1-color-alpha-primary5': this.rgba(primaryRgb, 0.05),
      '--nxt1-color-alpha-primary10': this.rgba(primaryRgb, 0.1),
      '--nxt1-color-alpha-primary20': this.rgba(primaryRgb, 0.2),
      '--nxt1-color-alpha-primary30': this.rgba(primaryRgb, 0.3),
      '--nxt1-color-alpha-primary50': this.rgba(primaryRgb, 0.5),
      '--nxt1-color-focus-ring': this.rgba(primaryRgb, 0.5),
      '--nxt1-color-focus-ringOffset': surface100,
      '--nxt1-color-loading-spinner': primary,
      '--nxt1-color-loading-skeleton': 'rgba(255, 255, 255, 0.08)',
      '--nxt1-color-loading-skeletonShimmer': 'rgba(255, 255, 255, 0.15)',
      '--ion-color-primary': primary,
      '--ion-color-primary-rgb': primaryRgb,
      '--ion-color-primary-contrast': textOnPrimary,
      '--ion-color-primary-contrast-rgb': textOnPrimaryRgb,
      '--ion-color-primary-shade': primaryDark,
      '--ion-color-primary-tint': primaryLight,
      '--ion-ripple-color': primary,
    };
  }

  private hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '204, 255, 0';
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }

  private mixHex(source: string, target: string, targetWeight: number): string {
    const sourceRgb = this.parseHex(source);
    const targetRgb = this.parseHex(target);
    if (!sourceRgb || !targetRgb) return source;

    const mix = (start: number, end: number) =>
      Math.round(start + (end - start) * Math.min(Math.max(targetWeight, 0), 1));

    return this.rgbToHex(
      mix(sourceRgb[0], targetRgb[0]),
      mix(sourceRgb[1], targetRgb[1]),
      mix(sourceRgb[2], targetRgb[2])
    );
  }

  private rgba(rgb: string, alpha: number): string {
    return `rgba(${rgb}, ${alpha})`;
  }

  private parseHex(hex: string): [number, number, number] | null {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return null;
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b]
      .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  /**
   * Clear the sport theme, reverting to default NXT1 volt colors.
   */
  clearSportTheme(): void {
    this._teamThemeSelected.set(false);
    this._sportTheme.set(null);
    this.clearSportThemeStorage();
    this.applyTheme('sport');

    if (this.statusBarSyncEnabled) {
      void this.syncStatusBar();
      void this.syncKeyboard();
      void this.syncNavigationBar();
      void this.syncIOSAppearance();
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

  private captureTeamReturnState(): void {
    this._teamThemeReturnState.set({
      preference: this._preference(),
      sportTheme: this._sportTheme(),
    });
  }

  private restoreThemeAfterTeamScope(): void {
    const previousState = this._teamThemeReturnState();
    if (!previousState) return;

    this._preference.set(previousState.preference);
    this._sportTheme.set(previousState.sportTheme);
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
    void this.syncKeyboard();
    void this.syncNavigationBar();
    void this.syncIOSAppearance();

    // Auto-sync all native chrome whenever theme changes
    effect(
      () => {
        const theme = this.effectiveTheme();
        const sportTheme = this._sportTheme();
        void this.syncStatusBar(theme, sportTheme);
        void this.syncKeyboard(theme);
        void this.syncNavigationBar(theme, sportTheme);
        void this.syncIOSAppearance(theme);
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
    const useDarkStatusBarContent =
      effectiveTheme === 'light' && activeSportTheme === null && !this.isTeamThemeActive();

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // Capacitor Style naming is counterintuitive:
      //   Style.Dark  = "Light text for dark backgrounds" (WHITE icons)
      //   Style.Light = "Dark text for light backgrounds" (BLACK icons)
      // Light base theme → dark/black icons (Style.Light)
      // Dark base theme OR any sport theme → light/white icons (Style.Dark)
      const style = useDarkStatusBarContent ? Style.Light : Style.Dark;
      await StatusBar.setStyle({ style });

      // On Android, also set the background color
      try {
        const activeTheme = this.activeTheme();
        const bgColor = this.resolveThemeBackgroundColor(activeTheme, effectiveTheme);
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
   * Sync the iOS/Android keyboard appearance with the current theme.
   * Uses KeyboardStyle.Dark for dark/sport themes, KeyboardStyle.Light for light theme.
   * Silent no-op on web (Keyboard plugin not available).
   */
  /**
   * Persist the current theme to @capacitor/preferences so AppDelegate.swift
   * can read it from UserDefaults and apply `window?.overrideUserInterfaceStyle`
   * on cold launch. Also calls the NxtThemePlugin synchronously so the current
   * session's native iOS system sheets (share sheet, camera, date picker, and
   * UIAlertController from @capacitor/dialog) reflect the theme immediately
   * without requiring an app relaunch.
   *
   * UserDefaults key written: `CapacitorStorage.nxt1-native-ui-style` ('light' | 'dark')
   */
  private async syncIOSAppearance(theme?: EffectiveTheme): Promise<void> {
    if (!this.isBrowser) return;

    const effectiveTheme = theme ?? this.effectiveTheme();

    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: 'nxt1-native-ui-style', value: effectiveTheme });
    } catch {
      // Preferences plugin not available (web browser) - silently ignore
    }

    // Apply immediately to the live UIWindow so UIAlertController and other
    // native overlays in this session pick up the new style without a relaunch.
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const NxtTheme = registerPlugin<{ setStyle: (opts: { style: string }) => Promise<void> }>(
        'NxtTheme'
      );
      this.logger.debug('Calling NxtTheme.setStyle', { theme: effectiveTheme });
      await NxtTheme.setStyle({ style: effectiveTheme });
      this.logger.debug('NxtTheme.setStyle resolved');
    } catch (e) {
      this.logger.error('NxtTheme.setStyle failed', e);
    }
  }

  private async syncKeyboard(theme?: EffectiveTheme): Promise<void> {
    if (!this.isBrowser) return;

    const effectiveTheme = theme ?? this.effectiveTheme();

    try {
      const { Keyboard, KeyboardStyle } = await import('@capacitor/keyboard');
      const style = effectiveTheme === 'light' ? KeyboardStyle.Light : KeyboardStyle.Dark;
      await Keyboard.setStyle({ style });
    } catch {
      // Keyboard plugin not available (web browser) or setStyle unsupported - silently ignore
    }
  }

  /**
   * Sync the Android navigation bar (back/home/recents) with the current theme.
   * iOS does not expose a navigation bar — the call is safely ignored there.
   * Silent no-op on web.
   */
  private async syncNavigationBar(
    theme?: EffectiveTheme,
    sportTheme?: SportTheme | null
  ): Promise<void> {
    if (!this.isBrowser) return;

    const effectiveTheme = theme ?? this.effectiveTheme();
    const activeSportTheme = sportTheme ?? this._sportTheme();

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // NavigationBar style follows same logic as status bar:
      // Light theme → dark icons; dark/sport theme → light icons
      const useDarkContent =
        effectiveTheme === 'light' && activeSportTheme === null && !this.isTeamThemeActive();
      const style = useDarkContent ? Style.Light : Style.Dark;

      // setNavigationBarColor + setNavigationBarStyle are Android-only; throws on iOS (caught below)
      const activeTheme = this.activeTheme();
      const bgColor = this.resolveThemeBackgroundColor(activeTheme, effectiveTheme);

      await (
        StatusBar as unknown as { setNavigationBarColor: (o: { color: string }) => Promise<void> }
      ).setNavigationBarColor({ color: bgColor });

      await (
        StatusBar as unknown as {
          setNavigationBarStyle: (o: { style: typeof style }) => Promise<void>;
        }
      ).setNavigationBarStyle({ style });
    } catch {
      // iOS throws for navigation bar calls - expected behavior, silently ignore
    }
  }

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

    const storedTeamBrand = this.loadStoredTeamBrand();
    if (storedTeamBrand) {
      this._orgThemePrimary.set(storedTeamBrand.primary);
      this._orgThemeSecondary.set(storedTeamBrand.secondary);
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

      const latestStoredTeamBrand = this.loadStoredTeamBrand();
      this._orgThemePrimary.set(latestStoredTeamBrand?.primary ?? null);
      this._orgThemeSecondary.set(latestStoredTeamBrand?.secondary ?? null);

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

    const colorScheme = activeTheme === 'team' || sportTheme ? 'dark' : effectiveTheme;
    docElement.style.setProperty('color-scheme', colorScheme);

    const bgColor = this.resolveThemeBackgroundColor(activeTheme, effectiveTheme);
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
    const storedTeamBrand = this.loadStoredTeamBrand();

    this._preference.set(savedPreference);
    this._sportTheme.set(savedSportTheme);
    this._orgThemePrimary.set(storedTeamBrand?.primary ?? null);
    this._orgThemeSecondary.set(storedTeamBrand?.secondary ?? null);

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
    const root = document.documentElement;

    this.clearTeamPalette(root);

    if (activeTheme === 'team') {
      if (this._orgThemePrimary()) {
        this.applyFullTeamPalette(
          root,
          this._orgThemePrimary()!,
          this._orgThemeSecondary() ?? undefined
        );
      } else {
        this.applyGenericTeamPalette(root);
      }
    } else if (this._orgThemeApplied() && this._orgThemePrimary()) {
      this.applyTeamMarkerPalette(
        root,
        this._orgThemePrimary()!,
        this._orgThemeSecondary() ?? undefined
      );
    }

    // Set data-theme attribute (main theme selector)
    root.setAttribute(THEME_ATTRIBUTE, activeTheme);

    // Set base theme attribute (for components that need light/dark regardless of sport)
    root.setAttribute(BASE_THEME_ATTRIBUTE, effectiveTheme);

    // Set color-scheme for browser UI (scrollbars, form controls)
    const colorScheme = activeTheme === 'team' || sportTheme ? 'dark' : effectiveTheme;
    root.style.colorScheme = colorScheme;

    // Set background color to prevent flash
    const bgColor = this.resolveThemeBackgroundColor(activeTheme, effectiveTheme);
    root.style.backgroundColor = bgColor;

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

  private resolveThemeBackgroundColor(activeTheme: string, effectiveTheme: EffectiveTheme): string {
    if (activeTheme === 'team') {
      const teamBg = this.doc?.documentElement?.style
        .getPropertyValue('--nxt1-color-bg-primary')
        .trim();

      if (teamBg) {
        return teamBg;
      }
    }

    return THEME_BG_COLORS[activeTheme] ?? THEME_BG_COLORS[effectiveTheme] ?? '#0a0a0a';
  }

  private applyGenericTeamPalette(root: HTMLElement): void {
    this.applyFullTeamPalette(root, GENERIC_TEAM_PRIMARY, GENERIC_TEAM_SECONDARY);
  }

  private clearTeamPalette(root: HTMLElement): void {
    for (const property of ORG_THEME_CUSTOM_PROPERTIES) {
      root.style.removeProperty(property);
    }
  }

  private applyFullTeamPalette(root: HTMLElement, primary: string, secondary?: string): void {
    const palette = this.buildOrgThemePalette(primary, secondary);
    this.applyProperties(root, palette);
  }

  private applyTeamMarkerPalette(root: HTMLElement, primary: string, secondary?: string): void {
    const palette = this.buildOrgThemePalette(primary, secondary);
    const markerPalette = Object.fromEntries(
      Object.entries(palette).filter(([property]) => property.startsWith('--team-'))
    );

    this.applyProperties(root, markerPalette);
  }

  private applyProperties(root: HTMLElement, properties: Record<string, string>): void {
    for (const [property, value] of Object.entries(properties)) {
      root.style.setProperty(property, value);
    }
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
   * Load stored Team brand colors from storage.
   */
  private loadStoredTeamBrand(): { primary: string; secondary: string | null } | null {
    if (!this.isBrowser) return null;

    try {
      const saved = localStorage.getItem(TEAM_BRAND_STORAGE_KEY);
      if (!saved) {
        return null;
      }

      const parsed = JSON.parse(saved) as { primary?: unknown; secondary?: unknown };
      const primary = typeof parsed.primary === 'string' ? parsed.primary.trim() : '';
      const secondary = typeof parsed.secondary === 'string' ? parsed.secondary.trim() : '';

      if (!primary) {
        return null;
      }

      return {
        primary,
        secondary: secondary || null,
      };
    } catch {
      return null;
    }
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
   * Save stored Team brand colors to storage and cookie.
   */
  private saveStoredTeamBrand(primary: string, secondary: string | null): void {
    if (!this.isBrowser) return;

    const payload = JSON.stringify({ primary, secondary });

    try {
      localStorage.setItem(TEAM_BRAND_STORAGE_KEY, payload);
    } catch {
      // Storage unavailable — Team brand won't persist
    }

    this.setCookie(TEAM_BRAND_COOKIE_NAME, payload);
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
   * Clear stored Team brand colors from storage and cookie.
   */
  private clearStoredTeamBrandStorage(): void {
    if (!this.isBrowser) return;

    try {
      localStorage.removeItem(TEAM_BRAND_STORAGE_KEY);
    } catch {
      // Storage unavailable — non-critical
    }

    this.setCookie(TEAM_BRAND_COOKIE_NAME, '', 0);
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
