/**
 * @fileoverview NxtBrowserService - Professional In-App Browser
 * @module @nxt1/ui/services
 *
 * Enterprise-grade in-app browser service using Capacitor Browser API.
 * Provides native-style browser experience like professional apps:
 *
 * iOS: SFSafariViewController with custom toolbar color
 * Android: Chrome Custom Tabs with branded toolbar
 * Web: Opens in new tab with proper security attributes
 *
 * Features:
 * - 🎨 Custom toolbar colors (brand integration)
 * - 📱 Native presentation styles (fullscreen/popover)
 * - 🔊 Haptic feedback on open/close
 * - 📊 Analytics integration
 * - 🛡️ URL sanitization and validation
 * - 🔗 Semantic link type detection
 * - ⚡ Lazy-loaded Capacitor plugin (SSR-safe)
 * - 🎯 Breadcrumb tracking for crash reports
 *
 * @example
 * ```typescript
 * import { NxtBrowserService } from '@nxt1/ui';
 *
 * @Component({...})
 * export class ProfileComponent {
 *   private readonly browser = inject(NxtBrowserService);
 *
 *   async openCollegeWebsite(url: string): Promise<void> {
 *     await this.browser.openLink({
 *       url,
 *       linkType: 'college',
 *       source: 'profile_college_card',
 *     });
 *   }
 *
 *   async openPrivacyPolicy(): Promise<void> {
 *     await this.browser.openPrivacyPolicy();
 *   }
 * }
 * ```
 */

import { Injectable, inject, PLATFORM_ID, signal, computed, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import {
  type InAppBrowserOptions,
  type OpenLinkOptions,
  BROWSER_COLORS,
  DEFAULT_BROWSER_OPTIONS,
  sanitizeUrl,
  detectLinkType,
  extractDomain,
  shouldOpenInExternalApp,
} from '@nxt1/core';

import { HapticsService } from '../haptics';
import { NxtLoggingService } from '../logging';
import { NxtBreadcrumbService } from '../breadcrumb';

// Type-only import to avoid SSR issues
import type { BrowserPlugin } from '@capacitor/browser';

// ============================================
// TYPES
// ============================================

/**
 * Browser state information
 */
export interface BrowserState {
  /** Whether a browser instance is currently open */
  readonly isOpen: boolean;
  /** URL currently being viewed */
  readonly currentUrl: string | null;
  /** When the browser was opened */
  readonly openedAt: number | null;
}

/**
 * Browser open result
 */
export interface BrowserOpenResult {
  /** Whether the browser was opened successfully */
  readonly success: boolean;
  /** Error message if failed */
  readonly error?: string;
  /** URL that was opened */
  readonly url?: string;
}

/**
 * Configuration for the browser service
 */
export interface BrowserServiceConfig {
  /** Default toolbar color */
  readonly defaultToolbarColor: string;
  /** Enable haptic feedback */
  readonly enableHaptics: boolean;
  /** Enable analytics tracking */
  readonly enableAnalytics: boolean;
  /** Enable breadcrumb logging */
  readonly enableBreadcrumbs: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BrowserServiceConfig = {
  defaultToolbarColor: BROWSER_COLORS.TOOLBAR_DARK,
  enableHaptics: true,
  enableAnalytics: true,
  enableBreadcrumbs: true,
};

// ============================================
// SERVICE
// ============================================

/**
 * Professional In-App Browser Service
 *
 * Provides native-style browser experience using platform-appropriate
 * implementations (SFSafariViewController/Chrome Custom Tabs).
 */
@Injectable({ providedIn: 'root' })
export class NxtBrowserService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ngZone = inject(NgZone);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService);
  private readonly breadcrumbs = inject(NxtBreadcrumbService);

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Lazy-loaded Capacitor plugin
  private browserPlugin: BrowserPlugin | null = null;
  private isNativePlatform = false;
  private isInitialized = false;

  // State management
  private readonly _state = signal<BrowserState>({
    isOpen: false,
    currentUrl: null,
    openedAt: null,
  });

  // Public readonly state
  readonly state = computed(() => this._state());
  readonly isOpen = computed(() => this._state().isOpen);
  readonly currentUrl = computed(() => this._state().currentUrl);

  // Configuration
  private config: BrowserServiceConfig = DEFAULT_CONFIG;

  // Event listeners cleanup
  private finishedListener: { remove: () => Promise<void> } | null = null;
  private pageLoadedListener: { remove: () => Promise<void> } | null = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Lazy-load Capacitor Browser plugin
   * SSR-safe - only loads in browser environment
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.isBrowser) {
      this.isInitialized = true;
      return;
    }

    try {
      // Dynamic imports to avoid SSR errors
      const [{ Browser }, { Capacitor }] = await Promise.all([
        import('@capacitor/browser'),
        import('@capacitor/core'),
      ]);

      this.browserPlugin = Browser;
      this.isNativePlatform = Capacitor.isNativePlatform();

      // Set up event listeners
      await this.setupListeners();

      this.logger.debug('Browser service initialized', {
        isNative: this.isNativePlatform,
      });
    } catch (error) {
      // Expected on web platform without Capacitor
      this.logger.debug('Capacitor Browser not available, using web fallback');
    }

    this.isInitialized = true;
  }

  /**
   * Set up browser event listeners
   */
  private async setupListeners(): Promise<void> {
    if (!this.browserPlugin) return;

    try {
      // Browser closed event
      this.finishedListener = await this.browserPlugin.addListener('browserFinished', () => {
        this.ngZone.run(() => {
          this.handleBrowserClosed();
        });
      });

      // Page loaded event
      this.pageLoadedListener = await this.browserPlugin.addListener('browserPageLoaded', () => {
        this.ngZone.run(() => {
          this.handlePageLoaded();
        });
      });
    } catch (error) {
      this.logger.warn('Failed to set up browser listeners', { error });
    }
  }

  /**
   * Handle browser closed event
   */
  private handleBrowserClosed(): void {
    const state = this._state();
    const duration = state.openedAt ? Date.now() - state.openedAt : undefined;

    this.logger.debug('Browser closed', {
      url: state.currentUrl,
      duration,
    });

    // Haptic feedback on close
    if (this.config.enableHaptics) {
      void this.haptics.impact('light');
    }

    // Reset state
    this._state.set({
      isOpen: false,
      currentUrl: null,
      openedAt: null,
    });
  }

  /**
   * Handle page loaded event
   */
  private handlePageLoaded(): void {
    const currentUrl = this._state().currentUrl;
    this.logger.debug('Browser page loaded', { url: currentUrl });
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Configure the browser service
   */
  configure(config: Partial<BrowserServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Open a URL in the in-app browser
   *
   * @param options - Browser options or URL string
   * @returns Result indicating success/failure
   *
   * @example
   * ```typescript
   * // Simple URL
   * await browser.open('https://example.com');
   *
   * // With options
   * await browser.open({
   *   url: 'https://example.com',
   *   toolbarColor: '#1a1a1a',
   *   presentationStyle: 'fullscreen',
   * });
   * ```
   */
  async open(options: InAppBrowserOptions | string): Promise<BrowserOpenResult> {
    await this.initialize();

    // Normalize options
    const opts: InAppBrowserOptions = typeof options === 'string' ? { url: options } : options;

    // Validate and sanitize URL
    const sanitizedUrl = sanitizeUrl(opts.url);
    if (!sanitizedUrl) {
      this.logger.warn('Invalid URL provided to browser', { url: opts.url });
      return {
        success: false,
        error: 'Invalid URL',
      };
    }

    // Check if should open in external app (App Store, etc.)
    if (shouldOpenInExternalApp(sanitizedUrl)) {
      return this.openExternal(sanitizedUrl);
    }

    // Build full options
    const fullOptions: InAppBrowserOptions = {
      ...DEFAULT_BROWSER_OPTIONS,
      ...opts,
      url: sanitizedUrl,
      toolbarColor: opts.toolbarColor ?? this.config.defaultToolbarColor,
    };

    try {
      // Haptic feedback on open
      if (this.config.enableHaptics) {
        await this.haptics.impact('light');
      }

      // Log breadcrumb
      if (this.config.enableBreadcrumbs) {
        void this.breadcrumbs.trackUserAction('browser_open', {
          url: sanitizedUrl,
          domain: extractDomain(sanitizedUrl),
        });
      }

      // Open browser
      if (this.isNativePlatform && this.browserPlugin) {
        await this.browserPlugin.open(fullOptions);
      } else {
        // Web fallback: open in new tab
        this.openInNewTab(sanitizedUrl);
      }

      // Update state
      this._state.set({
        isOpen: true,
        currentUrl: sanitizedUrl,
        openedAt: Date.now(),
      });

      this.logger.debug('Browser opened', {
        url: sanitizedUrl,
        isNative: this.isNativePlatform,
      });

      return {
        success: true,
        url: sanitizedUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to open browser';

      this.logger.error('Failed to open browser', {
        url: sanitizedUrl,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        url: sanitizedUrl,
      };
    }
  }

  /**
   * Open a semantic link with automatic type detection
   *
   * @param options - Link options with metadata
   * @returns Result indicating success/failure
   *
   * @example
   * ```typescript
   * await browser.openLink({
   *   url: 'https://stanford.edu/athletics',
   *   linkType: 'college',
   *   source: 'college_card',
   * });
   * ```
   */
  async openLink(options: OpenLinkOptions): Promise<BrowserOpenResult> {
    const linkType = options.linkType ?? detectLinkType(options.url);

    // Log analytics event
    if (this.config.enableAnalytics) {
      this.logger.info('link_opened', {
        linkType,
        domain: extractDomain(options.url),
        source: options.source,
        ...options.metadata,
      });
    }

    return this.open({
      url: options.url,
      toolbarColor: options.toolbarColor,
    });
  }

  /**
   * Open URL in external browser/app (bypasses in-app browser)
   * Used for App Store links, deep links, etc.
   */
  private async openExternal(url: string): Promise<BrowserOpenResult> {
    if (!this.isBrowser) {
      return { success: false, error: 'Not in browser environment' };
    }

    try {
      window.open(url, '_system');

      this.logger.debug('Opened external URL', { url });

      return { success: true, url };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open',
        url,
      };
    }
  }

  /**
   * Web fallback: open URL in new tab
   */
  private openInNewTab(url: string): void {
    if (!this.isBrowser) return;

    // Security: noopener prevents the new page from accessing window.opener
    // noreferrer prevents the Referer header from being sent
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Close the in-app browser (if open)
   * Note: Only works on native platforms
   */
  async close(): Promise<void> {
    if (!this.isNativePlatform || !this.browserPlugin) {
      return;
    }

    try {
      await this.browserPlugin.close();
      this.logger.debug('Browser closed programmatically');
    } catch (error) {
      this.logger.warn('Failed to close browser', { error });
    }
  }

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  /**
   * Open NXT1 Privacy Policy
   */
  async openPrivacyPolicy(): Promise<BrowserOpenResult> {
    return this.openLink({
      url: 'https://nxt1sports.com/privacy',
      linkType: 'legal',
      source: 'privacy_policy_link',
    });
  }

  /**
   * Open NXT1 Terms of Service
   */
  async openTermsOfService(): Promise<BrowserOpenResult> {
    return this.openLink({
      url: 'https://nxt1sports.com/terms',
      linkType: 'legal',
      source: 'terms_of_service_link',
    });
  }

  /**
   * Open college website
   */
  async openCollegeWebsite(url: string, collegeName?: string): Promise<BrowserOpenResult> {
    return this.openLink({
      url,
      linkType: 'college',
      source: 'college_website',
      metadata: collegeName ? { collegeName } : undefined,
    });
  }

  /**
   * Open social media profile
   */
  async openSocialProfile(url: string, platform?: string): Promise<BrowserOpenResult> {
    return this.openLink({
      url,
      linkType: 'social',
      source: 'social_profile',
      metadata: platform ? { platform } : undefined,
    });
  }

  /**
   * Open video content (YouTube, Hudl, etc.)
   */
  async openVideo(url: string, source?: string): Promise<BrowserOpenResult> {
    return this.openLink({
      url,
      linkType: 'video',
      source: source ?? 'video_link',
    });
  }

  /**
   * Open news article
   */
  async openNewsArticle(url: string, source?: string): Promise<BrowserOpenResult> {
    return this.openLink({
      url,
      linkType: 'news',
      source: source ?? 'news_article',
    });
  }

  /**
   * Open App Store page
   */
  async openAppStore(platform: 'ios' | 'android'): Promise<BrowserOpenResult> {
    const url =
      platform === 'ios'
        ? 'https://apps.apple.com/app/nxt1-sports/id1234567890'
        : 'https://play.google.com/store/apps/details?id=com.nxt1sports.app';

    return this.openLink({
      url,
      linkType: 'store',
      source: 'app_store_link',
      metadata: { platform },
    });
  }

  /**
   * Open support/help page
   */
  async openSupport(): Promise<BrowserOpenResult> {
    return this.openLink({
      url: 'https://nxt1sports.com/help',
      linkType: 'support',
      source: 'support_link',
    });
  }

  /**
   * Open native email composer with pre-filled fields.
   *
   * On Capacitor native (iOS/Android), triggers the WebView's URL scheme
   * handler which delegates mailto: to the platform email app via
   * UIApplication.open (iOS) or Intent.ACTION_VIEW (Android).
   *
   * On web, navigates to mailto: URL which opens the default email client.
   *
   * @param options - Email composition options
   * @returns Result indicating success/failure
   */
  async openMailto(options: {
    to: string;
    subject?: string;
    body?: string;
  }): Promise<BrowserOpenResult> {
    if (!this.isBrowser) {
      return { success: false, error: 'Not in browser environment' };
    }

    await this.initialize();

    // Build mailto: URL with RFC 6068 encoding
    const params: string[] = [];
    if (options.subject) params.push(`subject=${encodeURIComponent(options.subject)}`);
    if (options.body) params.push(`body=${encodeURIComponent(options.body)}`);
    const mailto = `mailto:${options.to}${params.length ? '?' + params.join('&') : ''}`;

    if (this.config.enableHaptics) {
      await this.haptics.impact('light');
    }

    if (this.config.enableBreadcrumbs) {
      void this.breadcrumbs.trackUserAction('email_compose', {
        to: options.to,
        hasSubject: !!options.subject,
      });
    }

    try {
      if (this.isNativePlatform) {
        // On Capacitor native, window.open with _blank target triggers the
        // WebView's WKUIDelegate (iOS) / shouldOverrideUrlLoading (Android)
        // which recognizes mailto: as a non-http scheme and delegates to the
        // native email app through the OS URL handler
        window.open(mailto, '_blank');
      } else {
        // On web, direct navigation to mailto: opens the default email client
        window.location.href = mailto;
      }

      this.logger.debug('Email composer opened', { to: options.to });
      return { success: true, url: mailto };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to open email';
      this.logger.error('Failed to open email composer', { error: msg });
      return { success: false, error: msg, url: mailto };
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Clean up listeners (call in ngOnDestroy if using in component)
   */
  async destroy(): Promise<void> {
    try {
      await this.finishedListener?.remove();
      await this.pageLoadedListener?.remove();
      await this.browserPlugin?.removeAllListeners();
    } catch {
      // Ignore cleanup errors
    }

    this.finishedListener = null;
    this.pageLoadedListener = null;
  }
}
