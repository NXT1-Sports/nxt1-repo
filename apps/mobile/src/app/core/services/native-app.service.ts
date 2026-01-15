/**
 * @fileoverview NativeAppService - Native Platform Initialization
 * @module @nxt1/ui/services
 *
 * Centralized service for native app initialization and configuration.
 * Handles status bar, splash screen, keyboard, and app lifecycle.
 *
 * Features:
 * - Status bar styling (dark/light mode)
 * - Splash screen management
 * - Keyboard handling for better input UX
 * - App lifecycle events (pause, resume, backButton)
 * - Deep linking preparation
 * - SSR-safe (no-ops on web)
 *
 * Usage:
 * ```typescript
 * // In app.component.ts
 * export class AppComponent {
 *   private readonly nativeApp = inject(NativeAppService);
 *
 *   constructor() {
 *     afterNextRender(() => {
 *       this.nativeApp.initialize();
 *     });
 *   }
 * }
 * ```
 */

import { Injectable, inject, PLATFORM_ID, signal, computed, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';

/** Status bar style options */
export type StatusBarStyle = 'dark' | 'light' | 'default';

/** App lifecycle events */
export type AppLifecycleEvent = 'pause' | 'resume' | 'backButton';

/** Keyboard resize modes */
export type KeyboardResizeMode = 'body' | 'ionic' | 'native' | 'none';

/** Lifecycle handler type */
export interface AppLifecycleHandler {
  onPause?: () => void;
  onResume?: () => void;
  onBackButton?: () => boolean | void; // Return true to prevent default behavior
}

/** Status bar configuration */
export interface StatusBarConfig {
  style: StatusBarStyle;
  color: string;
}

/** Keyboard configuration */
export interface KeyboardConfig {
  resize: KeyboardResizeMode;
  accessoryBarHidden: boolean;
}

/** Configuration options for native initialization */
export interface NativeAppConfig {
  /** Status bar style - 'dark' for dark backgrounds, 'light' for light backgrounds */
  statusBarStyle?: StatusBarStyle;
  /** Status bar background color (hex) */
  statusBarColor?: string;
  /** Whether to hide splash screen automatically */
  autoHideSplash?: boolean;
  /** Delay before hiding splash screen (ms) */
  splashDelay?: number;
  /** Keyboard resize mode */
  keyboardResize?: KeyboardResizeMode;
  /** Whether keyboard accessory bar is hidden */
  keyboardAccessoryBarHidden?: boolean;
  /** App lifecycle callbacks */
  onPause?: () => void;
  onResume?: () => void;
  onBackButton?: () => boolean | void;
}

/** Default NXT1 native configuration */
const DEFAULT_CONFIG: Required<Omit<NativeAppConfig, 'onPause' | 'onResume' | 'onBackButton'>> = {
  statusBarStyle: 'light', // Light text for dark NXT1 theme
  statusBarColor: '#0a0a0a', // NXT1 dark background
  autoHideSplash: true,
  splashDelay: 500,
  keyboardResize: 'body',
  keyboardAccessoryBarHidden: false,
};

@Injectable({ providedIn: 'root' })
export class NativeAppService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly ngZone = inject(NgZone);

  // ============================================
  // PRIVATE STATE
  // ============================================

  private _isInitialized = signal(false);
  private _isNative = signal(false);
  private _statusBarVisible = signal(true);
  private _keyboardVisible = signal(false);
  private _keyboardHeight = signal(0);
  private _config: Required<Omit<NativeAppConfig, 'onPause' | 'onResume' | 'onBackButton'>> &
    Pick<NativeAppConfig, 'onPause' | 'onResume' | 'onBackButton'> = DEFAULT_CONFIG;

  /** Lifecycle events stream */
  private readonly _lifecycleEvents = new Subject<AppLifecycleEvent>();

  // ============================================
  // PUBLIC SIGNALS
  // ============================================

  /** Whether native initialization is complete */
  readonly isInitialized = computed(() => this._isInitialized());

  /** Whether running in native environment */
  readonly isNative = computed(() => this._isNative());

  /** Whether status bar is visible */
  readonly statusBarVisible = computed(() => this._statusBarVisible());

  /** Whether keyboard is currently visible */
  readonly keyboardVisible = computed(() => this._keyboardVisible());

  /** Current keyboard height in pixels */
  readonly keyboardHeight = computed(() => this._keyboardHeight());

  /** Lifecycle events observable */
  readonly lifecycleEvents$ = this._lifecycleEvents.asObservable();

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize native app features
   *
   * Call this in your root component's afterNextRender() callback.
   *
   * @param config - Optional configuration overrides
   */
  async initialize(config: Partial<NativeAppConfig> = {}): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return; // SSR no-op
    }

    if (this._isInitialized()) {
      console.debug('[NativeAppService] Already initialized');
      return;
    }

    // Merge config
    this._config = { ...DEFAULT_CONFIG, ...config };

    // Wait for platform ready
    await this.ionicPlatform.ready();

    // Check if native
    this._isNative.set(this.ionicPlatform.is('capacitor'));

    if (this._isNative()) {
      await this.initializeNativeFeatures();
    }

    this._isInitialized.set(true);
    console.debug('[NativeAppService] Initialized', { isNative: this._isNative() });
  }

  private async initializeNativeFeatures(): Promise<void> {
    await Promise.all([
      this.configureStatusBar(),
      this.configureKeyboard(),
      this.setupLifecycleListeners(),
    ]);

    // Hide splash screen after configured delay
    if (this._config.autoHideSplash) {
      setTimeout(() => this.hideSplashScreen(), this._config.splashDelay);
    }
  }

  // ============================================
  // STATUS BAR
  // ============================================

  private async configureStatusBar(): Promise<void> {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // Set style based on config
      const style = this._config.statusBarStyle === 'dark' ? Style.Dark : Style.Light;
      await StatusBar.setStyle({ style });

      // Set background color (Android only)
      if (this.ionicPlatform.is('android')) {
        await StatusBar.setBackgroundColor({ color: this._config.statusBarColor });
      }

      // Make status bar overlay content (iOS style)
      await StatusBar.setOverlaysWebView({ overlay: true });

      console.debug('[NativeAppService] Status bar configured');
    } catch (error) {
      console.warn('[NativeAppService] Status bar configuration failed:', error);
    }
  }

  /**
   * Set status bar style dynamically
   *
   * @param style - 'dark' (light content) or 'light' (dark content)
   */
  async setStatusBarStyle(style: StatusBarStyle): Promise<void> {
    if (!this._isNative()) return;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({
        style: style === 'dark' ? Style.Dark : Style.Light,
      });
    } catch (error) {
      console.warn('[NativeAppService] Failed to set status bar style:', error);
    }
  }

  /**
   * Show the status bar
   */
  async showStatusBar(): Promise<void> {
    if (!this._isNative()) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.show();
      this._statusBarVisible.set(true);
    } catch (error) {
      console.warn('[NativeAppService] Failed to show status bar:', error);
    }
  }

  /**
   * Hide the status bar (fullscreen mode)
   */
  async hideStatusBar(): Promise<void> {
    if (!this._isNative()) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.hide();
      this._statusBarVisible.set(false);
    } catch (error) {
      console.warn('[NativeAppService] Failed to hide status bar:', error);
    }
  }

  // ============================================
  // SPLASH SCREEN
  // ============================================

  /**
   * Hide the splash screen
   */
  async hideSplashScreen(): Promise<void> {
    if (!this._isNative()) return;

    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide({ fadeOutDuration: 300 });
      console.debug('[NativeAppService] Splash screen hidden');
    } catch (error) {
      console.warn('[NativeAppService] Failed to hide splash screen:', error);
    }
  }

  /**
   * Show the splash screen (useful for background operations)
   */
  async showSplashScreen(): Promise<void> {
    if (!this._isNative()) return;

    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.show({ autoHide: false });
    } catch (error) {
      console.warn('[NativeAppService] Failed to show splash screen:', error);
    }
  }

  // ============================================
  // KEYBOARD
  // ============================================

  private async configureKeyboard(): Promise<void> {
    try {
      const { Keyboard } = await import('@capacitor/keyboard');

      // Configure keyboard behavior
      await Keyboard.setAccessoryBarVisible({
        isVisible: !this._config.keyboardAccessoryBarHidden,
      });

      // Set resize mode (iOS only)
      if (this.ionicPlatform.is('ios')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Keyboard.setResizeMode({ mode: this._config.keyboardResize as any });
      }

      // Listen for keyboard events
      Keyboard.addListener('keyboardWillShow', (info) => {
        this.ngZone.run(() => {
          this._keyboardVisible.set(true);
          this._keyboardHeight.set(info.keyboardHeight);
        });
      });

      Keyboard.addListener('keyboardWillHide', () => {
        this.ngZone.run(() => {
          this._keyboardVisible.set(false);
          this._keyboardHeight.set(0);
        });
      });

      console.debug('[NativeAppService] Keyboard configured');
    } catch (error) {
      console.warn('[NativeAppService] Keyboard configuration failed:', error);
    }
  }

  /**
   * Programmatically show the keyboard
   */
  async showKeyboard(): Promise<void> {
    if (!this._isNative()) return;

    try {
      const { Keyboard } = await import('@capacitor/keyboard');
      await Keyboard.show();
    } catch (error) {
      console.warn('[NativeAppService] Failed to show keyboard:', error);
    }
  }

  /**
   * Programmatically hide the keyboard
   */
  async hideKeyboard(): Promise<void> {
    if (!this._isNative()) return;

    try {
      const { Keyboard } = await import('@capacitor/keyboard');
      await Keyboard.hide();
    } catch (error) {
      console.warn('[NativeAppService] Failed to hide keyboard:', error);
    }
  }

  // ============================================
  // APP LIFECYCLE
  // ============================================

  private async setupLifecycleListeners(): Promise<void> {
    try {
      const { App } = await import('@capacitor/app');

      // App pause (going to background)
      App.addListener('pause', () => {
        this.ngZone.run(() => {
          this._lifecycleEvents.next('pause');
          // Call config callback if provided
          this._config.onPause?.();
        });
      });

      // App resume (coming to foreground)
      App.addListener('resume', () => {
        this.ngZone.run(() => {
          this._lifecycleEvents.next('resume');
          // Call config callback if provided
          this._config.onResume?.();
        });
      });

      // Android back button
      App.addListener('backButton', ({ canGoBack }) => {
        this.ngZone.run(() => {
          this._lifecycleEvents.next('backButton');
          // Call config callback if provided
          const handled = this._config.onBackButton?.();
          // If callback returns true, don't do default behavior
          if (handled) return;
          // Let Ionic handle navigation by default
          if (!canGoBack) {
            // Could minimize app or show exit confirmation
          }
        });
      });

      console.debug('[NativeAppService] Lifecycle listeners configured');
    } catch (error) {
      console.warn('[NativeAppService] Lifecycle setup failed:', error);
    }
  }

  /**
   * Exit the app (Android only)
   */
  async exitApp(): Promise<void> {
    if (!this._isNative() || !this.ionicPlatform.is('android')) return;

    try {
      const { App } = await import('@capacitor/app');
      await App.exitApp();
    } catch (error) {
      console.warn('[NativeAppService] Failed to exit app:', error);
    }
  }

  /**
   * Get app info (version, build, etc.)
   */
  async getAppInfo(): Promise<{ name: string; version: string; build: string } | null> {
    if (!this._isNative()) return null;

    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      return {
        name: info.name,
        version: info.version,
        build: info.build,
      };
    } catch (error) {
      console.warn('[NativeAppService] Failed to get app info:', error);
      return null;
    }
  }
}
