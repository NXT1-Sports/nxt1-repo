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
import { Router } from '@angular/router';
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
  private readonly router = inject(Router);
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

  /**
   * Set to true after the auth-based initial navigation completes.
   * Used by the appUrlOpen handler to decide:
   *   - false → cold start, store URL as pending (avoids race with navigateRoot)
   *   - true  → warm start, navigate directly
   */
  private _initialNavigationComplete = false;

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

    // Canonical post links from web share URLs.
    // Mobile app has no standalone /post route, so route to owner profile and
    // carry postId in query params for downstream handling.
    {
      pattern: /^\/post\/([^/]+)\/([^/]+)\/?$/,
      route: '/profile/:unicode',
      extractParams: (m) => ({
        unicode: this.decodePathSegment(m[1]),
        postId: this.decodePathSegment(m[2]),
      }),
    },

    // Legacy one-segment post links: keep users in-app (avoid 404 route).
    {
      pattern: /^\/post\/([a-zA-Z0-9_-]+)\/?$/,
      route: '/agent-x',
      extractParams: (m) => ({ postId: this.decodePathSegment(m[1]) }),
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

    // Home (default) — /home is not a real mobile route, redirect to agent-x
    {
      pattern: /^\/home\/?$/,
      route: '/agent-x',
    },

    // Developer settings (hidden, deep-link only)
    {
      pattern: /^\/dev-settings\/?$/,
      route: '/dev-settings',
    },

    // Root path — redirect to agent-x
    {
      pattern: /^\/?$/,
      route: '/agent-x',
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

        // Skip OAuth callback URLs — handled by MobileEmailConnectionService's
        // own App.addListener('appUrlOpen') listener via a short-lived promise.
        // Routing these through DeepLinkService would navigate the user away from
        // the Connected Accounts sheet before the OAuth promise resolves.
        if (url.includes('/oauth/callback')) {
          this.logger.debug('Skipping OAuth callback URL - handled by email-connection service', {
            url: url.substring(0, 80),
          });
          return;
        }

        // Wait for the platform to be fully ready before navigating.
        // This prevents silent navigation failures caused by Ionic's view-transition
        // still running when the app is brought to the foreground via a Universal Link.
        void this.platform.ready().then(() => {
          this.ngZone.run(() => {
            this.logger.info('Deep link received', { url });
            void this.breadcrumbs.trackUserAction('Deep link received', { url });

            if (this._initialNavigationComplete) {
              // Warm start — auth-based navigation already finished, navigate directly.
              this.handleDeepLink(url);
            } else {
              // Cold start — initial auth navigation hasn't completed yet.
              // Store as pending so it's processed after navigateRoot('/agent-x') settles,
              // preventing the auth navigation from overriding this one.
              this.logger.info('Cold start: storing appUrlOpen URL as pending', { url });
              this.setPendingDeepLink(url);
            }
          });
        });
      });

      // Check if app was launched with a URL (cold start via Universal Link).
      // Store as pending instead of navigating immediately — the auth-based initial
      // navigation (handleInitialNavigation) will process it once complete, avoiding
      // the race condition where auth navigation overwrites the deep link destination.
      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) {
        if (!launchUrl.url.includes('firebaseauth')) {
          this.logger.info('App cold-started with URL, storing as pending deep link', {
            url: launchUrl.url,
          });
          this.setPendingDeepLink(launchUrl.url);
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
    // Debounce: skip if the same URL was already navigated within 2 seconds.
    // This prevents double-navigation on cold start when both the Capacitor
    // retained `appUrlOpen` event AND the `getLaunchUrl()` fallback both fire
    // for the same launch URL in rapid succession.
    const lastEvent = this._lastDeepLink();
    if (lastEvent && lastEvent.url === url && Date.now() - lastEvent.timestamp.getTime() < 2000) {
      this.logger.debug('Skipping duplicate deep link within 2s', { url });
      return;
    }

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
        // Fall back to agent-x (mobile has no /home route)
        void this.navController.navigateRoot('/agent-x');
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
   * Navigate to resolved route with params.
   *
   * Uses navigateForward with animated:false so that:
   * 1. No Ionic animation conflict when the app is being foregrounded via Universal Link.
   * 2. The user's previous navigation stack is preserved (back button works).
   * Falls back to router.navigateByUrl if NavController rejects.
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

    this.logger.debug('Executing deep link navigation', { finalRoute });

    // navigateForward with animated:false avoids Ionic view-transition conflicts
    // that can silently swallow navigateRoot when the app is being foregrounded.
    this.navController
      .navigateForward(finalRoute, { animated: false })
      .then((success) => {
        if (!success) {
          this.logger.warn('navigateForward returned false, retrying with router.navigateByUrl', {
            finalRoute,
          });
          void this.router.navigateByUrl(finalRoute);
        }
      })
      .catch((error) => {
        this.logger.error('Deep link navigation failed, retrying with router.navigateByUrl', {
          error,
          finalRoute,
        });
        void this.router.navigateByUrl(finalRoute);
      });
  }

  // ============================================
  // PENDING DEEP LINK (for auth flows)
  // ============================================

  /**
   * Signal to DeepLinkService that the initial auth-based navigation is complete.
   * Must be called by AppComponent after every navigateRoot branch in
   * handleInitialNavigation() so that subsequent appUrlOpen events (warm start)
   * navigate directly instead of being stored as pending.
   */
  markInitialNavigationComplete(): void {
    this._initialNavigationComplete = true;
    this.logger.debug(
      'Initial navigation marked complete — warm start deep links will navigate directly'
    );
  }

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
