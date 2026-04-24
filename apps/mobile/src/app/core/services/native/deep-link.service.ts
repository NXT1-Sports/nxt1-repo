/**
 * @fileoverview Deep Link Service - Universal Links & App Links Handler
 * @module @nxt1/mobile/core
 *
 * Handles incoming deep links from:
 * - iOS Universal Links (https://nxt1sports.com/...)
 * - Android App Links (https://nxt1sports.com/...)
 * - Custom URL Schemes (nxt1://...)
 *
 * 2026 Best Practices:
 * - Centralizes all deep link routing logic
 * - SSR-safe (no-op on web)
 * - Integrates with Angular Router via NavController
 * - Logs all deep link activity for debugging
 *
 * Usage:
 * ```typescript
 * // In app.component.ts constructor
 * afterNextRender(() => {
 *   this.deepLink.initialize();
 * });
 * ```
 */

import { Injectable, inject, PLATFORM_ID, NgZone, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavController, Platform } from '@ionic/angular/standalone';
import { NxtLoggingService, NxtBreadcrumbService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import { environment } from '../../../../environments/environment';

/** Deep link event for tracking */
export interface DeepLinkEvent {
  readonly url: string;
  readonly path: string;
  readonly params: Record<string, string>;
  readonly timestamp: Date;
  readonly handled: boolean;
}

/** Route mapping for deep links */
interface DeepLinkRoute {
  /** URL path pattern (supports :param placeholders) */
  pattern: RegExp;
  /** App route to navigate to */
  route: string;
  /** Extract params from URL */
  extractParams?: (match: RegExpMatchArray) => Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly platform = inject(Platform);
  private readonly navController = inject(NavController);
  private readonly ngZone = inject(NgZone);
  private readonly breadcrumbs = inject(NxtBreadcrumbService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('DeepLinkService');
  private readonly webBaseUrl = environment.webUrl.replace(/\/+$/, '');
  private readonly supportedCustomSchemes = [
    'nxt1://',
    'nxt1sports://',
    'com.nxt1sports.app.twa://',
  ] as const;

  // ============================================
  // STATE
  // ============================================

  private _isInitialized = signal(false);
  private _lastDeepLink = signal<DeepLinkEvent | null>(null);
  private _pendingDeepLink = signal<string | null>(null);

  /** Whether deep link handling is initialized */
  readonly isInitialized = computed(() => this._isInitialized());

  /** Last processed deep link */
  readonly lastDeepLink = computed(() => this._lastDeepLink());

  /** Pending deep link waiting to be processed (e.g., during auth) */
  readonly pendingDeepLink = computed(() => this._pendingDeepLink());

  // ============================================
  // ROUTE MAPPING (2026 Clean URLs)
  // ============================================

  /**
   * Map of URL patterns to app routes
   * Order matters - first match wins
   * Uses clean URLs (no tabs prefix) matching web platform
   */
  private readonly routeMap: DeepLinkRoute[] = [
    // Canonical profile pages
    {
      pattern: /^\/profile\/([^/]+)\/([^/]+)\/([^/]+)\/?$/,
      route: '/profile/:sport/:name/:unicode',
      extractParams: (match) => ({
        sport: this.decodePathSegment(match[1]),
        name: this.decodePathSegment(match[2]),
        unicode: this.decodePathSegment(match[3]),
      }),
    },
    {
      pattern: /^\/profile\/([^/]+)\/?$/,
      route: '/profile/:unicode',
      extractParams: (match) => ({
        unicode: this.decodePathSegment(match[1]),
      }),
    },
    {
      pattern: /^\/athlete\/([^/]+)\/?$/,
      route: '/profile/:unicode',
      extractParams: (match) => ({
        unicode: this.decodePathSegment(match[1]),
      }),
    },

    // Canonical team pages (/team/:slug/:teamCode)
    {
      pattern: /^\/team\/([^/]+)\/([^/]+)\/?$/,
      route: '/team/:slug/:teamCode',
      extractParams: (match) => ({
        slug: this.decodePathSegment(match[1]),
        teamCode: this.decodePathSegment(match[2]),
      }),
    },

    // Post/Content
    {
      pattern: /^\/post\/([a-zA-Z0-9_-]+)\/?$/,
      route: '/post',
      extractParams: (m) => ({ postId: m[1] }),
    },

    // Rankings
    {
      pattern: /^\/rankings\/?$/,
      route: '/rankings',
    },
    {
      pattern: /^\/rankings\/([a-z-]+)\/(\d{4})\/?$/,
      route: '/rankings',
      extractParams: (m) => ({ sport: m[1], year: m[2] }),
    },

    // College pages
    {
      pattern: /^\/college\/([a-zA-Z0-9_-]+)\/?$/,
      route: '/college',
      extractParams: (m) => ({ collegeId: m[1] }),
    },

    // Settings
    {
      pattern: /^\/settings\/?$/,
      route: '/settings',
    },
    {
      pattern: /^\/settings\/([a-z-]+)\/?$/,
      route: '/settings',
      extractParams: (m) => ({ section: m[1] }),
    },

    // Auth routes (special handling)
    {
      pattern: /^\/__\/auth\/action\/?/,
      route: '/auth/action',
    },

    // Explore
    {
      pattern: /^\/explore\/?$/,
      route: '/explore',
    },
    {
      pattern: /^\/search\/?$/,
      route: '/explore',
    },

    // Team invite links — /join/<NXT-code>?type=team&teamCode=...&teamName=...
    {
      pattern: /^\/join\/([a-zA-Z0-9_-]+)\/?$/,
      route: '/join/:code',
      extractParams: (m) => ({ code: m[1] }),
    },

    // Home (default)
    {
      pattern: /^\/home\/?$/,
      route: '/home',
    },
    {
      pattern: /^\/?$/,
      route: '/home',
    },
  ];

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize deep link handling
   * Call this in app.component.ts afterNextRender()
   */
  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return; // SSR no-op
    }

    if (this._isInitialized()) {
      this.logger.debug('Already initialized');
      return;
    }

    await this.platform.ready();

    // Only set up listeners on native platforms
    if (this.platform.is('capacitor')) {
      await this.setupNativeListeners();
    }

    this._isInitialized.set(true);
    this.logger.info('Deep link service initialized');
  }

  /**
   * Set up Capacitor App plugin listeners for deep links
   */
  private async setupNativeListeners(): Promise<void> {
    try {
      const { App } = await import('@capacitor/app');

      // Listen for app opened via URL (Universal Links / App Links)
      App.addListener('appUrlOpen', ({ url }) => {
        if (url.includes('firebaseauth/link') || url.includes('firebaseauth')) {
          this.logger.debug(
            'Skipping Firebase auth redirect callback - handled by Firebase iOS SDK',
            { url: url.substring(0, 80) }
          );
          return;
        }

        this.ngZone.run(() => {
          this.logger.info('Deep link received', { url });
          void this.breadcrumbs.trackUserAction('Deep link received', { url });
          this.handleDeepLink(url);
        });
      });

      // Check if app was launched with a URL
      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) {
        if (!launchUrl.url.includes('firebaseauth')) {
          this.logger.info('App launched with URL', { url: launchUrl.url });
          this.handleDeepLink(launchUrl.url);
        }
      }

      this.logger.debug('Native deep link listeners configured');
    } catch (error) {
      this.logger.error('Failed to set up deep link listeners', { error });
    }
  }

  // ============================================
  // DEEP LINK HANDLING
  // ============================================

  /**
   * Process an incoming deep link URL
   */
  handleDeepLink(url: string): void {
    try {
      const parsed = this.parseDeepLink(url);
      const route = this.resolveRoute(parsed.path, parsed.params);

      const event: DeepLinkEvent = {
        url,
        path: parsed.path,
        params: parsed.params,
        timestamp: new Date(),
        handled: !!route,
      };

      this._lastDeepLink.set(event);

      if (route) {
        this.logger.info('Navigating to deep link route', { route, params: parsed.params });
        this.navigateToRoute(route, parsed.params);
      } else {
        this.logger.warn('No route found for deep link', { path: parsed.path });
        // Fall back to home
        void this.navController.navigateRoot('/home');
      }
    } catch (error) {
      this.logger.error('Error handling deep link', { url, error });
    }
  }

  private decodePathSegment(value: string | undefined): string {
    if (!value) return '';

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private normalizeIncomingUrl(url: string): string {
    const trimmedUrl = url.trim();
    const matchingScheme = this.supportedCustomSchemes.find((scheme) =>
      trimmedUrl.startsWith(scheme)
    );

    if (!matchingScheme) {
      return trimmedUrl;
    }

    const remainder = trimmedUrl.slice(matchingScheme.length);
    const normalizedPath = remainder.startsWith('/') ? remainder : `/${remainder}`;
    return `${this.webBaseUrl}${normalizedPath}`;
  }

  /**
   * Parse a deep link URL into path and params
   */
  private parseDeepLink(url: string): { path: string; params: Record<string, string> } {
    const parsedUrl = new URL(this.normalizeIncomingUrl(url));

    const path = parsedUrl.pathname;
    const params: Record<string, string> = {};

    // Extract query params
    parsedUrl.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // Extract hash fragment if present
    if (parsedUrl.hash) {
      params['_hash'] = parsedUrl.hash.slice(1);
    }

    return { path, params };
  }

  /**
   * Find matching route for a deep link path
   */
  private resolveRoute(path: string, queryParams: Record<string, string>): string | null {
    for (const route of this.routeMap) {
      const match = path.match(route.pattern);
      if (match) {
        // Merge extracted params with query params
        const extractedParams = route.extractParams?.(match) ?? {};
        Object.assign(queryParams, extractedParams);
        return route.route;
      }
    }
    return null;
  }

  /**
   * Navigate to resolved route with params
   */
  private navigateToRoute(route: string, params: Record<string, string>): void {
    // Build route with params
    let finalRoute = route;

    // Replace :param placeholders
    for (const [key, value] of Object.entries(params)) {
      finalRoute = finalRoute.replace(`:${key}`, value);
    }

    // Add remaining params as query string
    const routeParams = Object.entries(params)
      .filter(([key]) => !route.includes(`:${key}`))
      .filter(([key]) => !key.startsWith('_')); // Exclude internal params

    if (routeParams.length > 0) {
      const queryString = new URLSearchParams(Object.fromEntries(routeParams)).toString();
      finalRoute = `${finalRoute}?${queryString}`;
    }

    void this.navController.navigateRoot(finalRoute);
  }

  // ============================================
  // PENDING DEEP LINK (for auth flows)
  // ============================================

  /**
   * Store a pending deep link to process after auth
   */
  setPendingDeepLink(url: string): void {
    this._pendingDeepLink.set(url);
    this.logger.debug('Pending deep link stored', { url });
  }

  /**
   * Process and clear any pending deep link
   */
  processPendingDeepLink(): boolean {
    const pending = this._pendingDeepLink();
    if (pending) {
      this._pendingDeepLink.set(null);
      this.handleDeepLink(pending);
      return true;
    }
    return false;
  }

  /**
   * Clear pending deep link without processing
   */
  clearPendingDeepLink(): void {
    this._pendingDeepLink.set(null);
  }
}
