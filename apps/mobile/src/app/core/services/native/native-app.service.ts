/**
 * @fileoverview NativeAppService - Native Platform Initialization
 * @module @nxt1/ui/services
 *
 * Centralized service for native app initialization and configuration.
 * Handles status bar, splash screen, and app lifecycle.
 *
 * Features:
 * - Status bar styling (dark/light mode)
 * - Splash screen management
 * - App lifecycle events (pause, resume, backButton)
 * - Deep linking preparation
 * - SSR-safe (no-ops on web)
 *
 * Note: Keyboard handling is intentionally disabled.
 * Ionic and the native system handle keyboard behavior automatically.
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
import { NxtLoggingService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';

/** Status bar style options */
export type StatusBarStyle = 'dark' | 'light' | 'default';

/** App lifecycle events */
export type AppLifecycleEvent = 'pause' | 'resume' | 'backButton';

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

/** Configuration options for native initialization */
export interface NativeAppConfig {
  /** Status bar style - 'dark' (light content) or 'light' (dark content) */
  statusBarStyle?: StatusBarStyle;
  /** Status bar background color (hex) */
  statusBarColor?: string;
  /** Whether to hide splash screen automatically */
  autoHideSplash?: boolean;
  /** Delay before hiding splash screen (ms) */
  splashDelay?: number;
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
};

@Injectable({ providedIn: 'root' })
export class NativeAppService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);
  private readonly ngZone = inject(NgZone);
  private readonly logger: ILogger = inject(NxtLoggingService).child('NativeAppService');

  // ============================================
  // PRIVATE STATE
  // ============================================

  private _isInitialized = signal(false);
  private _isNative = signal(false);
  private _statusBarVisible = signal(true);
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
      this.logger.debug('Already initialized');
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
    this.logger.debug('Initialized', { isNative: this._isNative() });
  }

  private async initializeNativeFeatures(): Promise<void> {
    await Promise.all([this.configureStatusBar(), this.setupLifecycleListeners()]);

    // Wire keyboard awareness (sets CSS vars + class on <html>)
    this.setupKeyboardListeners();

    // Hide splash screen immediately after features are initialized
    // We control the timing rather than relying on Capacitor's auto-hide
    if (this._config.autoHideSplash) {
      await this.hideSplashScreen();
    }
  }

  // ============================================
  // STATUS BAR
  // ============================================

  private async configureStatusBar(): Promise<void> {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // Set style based on config
      // Capacitor Style.Dark = white icons (for dark bg), Style.Light = black icons (for light bg)
      // statusBarStyle 'light' = light/white text → Style.Dark
      // statusBarStyle 'dark'  = dark/black text  → Style.Light
      const style = this._config.statusBarStyle === 'dark' ? Style.Light : Style.Dark;
      await StatusBar.setStyle({ style });

      // Set background color (Android only)
      if (this.ionicPlatform.is('android')) {
        await StatusBar.setBackgroundColor({ color: this._config.statusBarColor });
      }

      // Make status bar overlay content (iOS style)
      await StatusBar.setOverlaysWebView({ overlay: true });

      this.logger.debug('Status bar configured');
    } catch (error) {
      this.logger.warn('Status bar configuration failed', { error });
    }
  }

  /**
   * Set status bar style dynamically
   *
   * @param style - 'dark' (dark/black icons) or 'light' (light/white icons)
   */
  async setStatusBarStyle(style: StatusBarStyle): Promise<void> {
    if (!this._isNative()) return;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      // Capacitor Style.Dark = white icons, Style.Light = black icons
      await StatusBar.setStyle({
        style: style === 'dark' ? Style.Light : Style.Dark,
      });
    } catch (error) {
      this.logger.warn('Failed to set status bar style', { error });
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
      this.logger.warn('Failed to show status bar', { error });
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
      this.logger.warn('Failed to hide status bar', { error });
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
      this.logger.debug('Splash screen hidden');
    } catch (error) {
      this.logger.warn('Failed to hide splash screen', { error });
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
      this.logger.warn('Failed to show splash screen', { error });
    }
  }

  // ============================================
  // KEYBOARD
  // ============================================

  /**
   * Set up keyboard visibility listeners.
   *
   * With `resize: "ionic"` in capacitor.config.json, the native webview does
   * NOT resize when the keyboard appears — Ionic only adjusts scroll inside
   * `<ion-content>`.  Elements like `<ion-footer>` stay at the full-viewport
   * bottom and get hidden behind the keyboard.
   *
   * This method listens for the Ionic keyboard lifecycle events and:
   *  1. Sets `--keyboard-height` CSS variable on `<html>` (px value).
   *  2. Toggles a `.keyboard-open` class on `<html>`.
   *
   * Feature components (e.g. Agent X shell) can then use
   * `:host-context(.keyboard-open)` to shift their footer above the keyboard.
   */
  private setupKeyboardListeners(): void {
    // ionKeyboardWillShow fires at the START of the keyboard animation so our
    // CSS transition runs in sync with the native keyboard — no visible lag.
    // event.detail.keyboardHeight contains the height in CSS pixels.
    window.addEventListener('ionKeyboardWillShow', ((
      ev: CustomEvent<{ keyboardHeight: number }>
    ) => {
      this.ngZone.run(() => {
        const height = ev.detail.keyboardHeight;
        document.documentElement.style.setProperty('--keyboard-height', `${height}px`);
        document.documentElement.classList.add('keyboard-open');
        this.logger.debug('Keyboard will show', { height });
      });
    }) as EventListener);

    // ionKeyboardWillHide fires at the START of the dismiss animation.
    window.addEventListener('ionKeyboardWillHide', () => {
      this.ngZone.run(() => {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.documentElement.classList.remove('keyboard-open');
        this.logger.debug('Keyboard will hide');
      });
    });

    this.logger.debug('Keyboard listeners configured');
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

      this.logger.debug('Lifecycle listeners configured');
    } catch (error) {
      this.logger.warn('Lifecycle setup failed', { error });
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
      this.logger.warn('Failed to exit app', { error });
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
      this.logger.warn('Failed to get app info', { error });
      return null;
    }
  }
}
