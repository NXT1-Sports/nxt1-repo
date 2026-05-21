/**
 * @fileoverview Root App Component
 * @module @nxt1/mobile
 *
 * Main application shell with native platform initialization.
 * Uses NativeAppService for all native features (StatusBar, SplashScreen, Keyboard, etc.)
 */

import { Component, afterNextRender, inject, effect } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { IonApp, IonRouterOutlet, Platform, NavController } from '@ionic/angular/standalone';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtThemeService } from '@nxt1/ui/services/theme';
import { UsageBottomSheetService } from '@nxt1/ui/usage';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import type { ILogger } from '@nxt1/core/logging';
import {
  NativeAppService,
  NetworkService,
  DeepLinkService,
  PushHandlerService,
  FcmRegistrationService,
  NativeBadgeService,
  IapService,
  LiveUpdateService,
} from './core/services';
import { BiometricService, AuthFlowService } from './core/services/auth';
import { AUTH_ROUTES, AUTH_REDIRECTS } from '@nxt1/core/constants';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly ionicPlatform = inject(Platform);
  private readonly navController = inject(NavController);
  private readonly nativeApp = inject(NativeAppService);
  private readonly network = inject(NetworkService);
  private readonly deepLink = inject(DeepLinkService);
  private readonly pushHandler = inject(PushHandlerService);
  private readonly fcmRegistration = inject(FcmRegistrationService);
  private readonly biometric = inject(BiometricService);
  private readonly platform = inject(NxtPlatformService);
  private readonly theme = inject(NxtThemeService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('AppComponent');
  private readonly breadcrumbs = inject(NxtBreadcrumbService);

  // Inject to activate the effect() that syncs totalUnread → native app icon badge
  private readonly nativeBadge = inject(NativeBadgeService);

  private readonly iap = inject(IapService);
  private readonly usageBottomSheet = inject(UsageBottomSheetService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly liveUpdate = inject(LiveUpdateService);

  /** Track if we've performed initial navigation */
  private hasPerformedInitialNavigation = false;

  constructor() {
    // Register Apple IAP on iOS so compatible buy-credits sheets can offer
    // both the normal Stripe path and the native IAP path.
    if (this.iap.isSupported) {
      this.usageBottomSheet.registerBuyCreditsHandler(() => this.iap.showProductsAndPurchase());
    }

    // Log early to confirm app is loading
    this.logger.info('AppComponent constructor called');

    // Debug routing
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.logger.debug('Navigation completed', { url: event.url });
        this.analytics?.trackPageView(event.urlAfterRedirects || event.url);
      });

    // Handle initial navigation after auth initializes
    effect(() => {
      const isInitialized = this.authFlow.isInitialized();
      const user = this.authFlow.user();
      const isLoading = this.authFlow.isLoading();

      // Skip if not initialized or still loading
      if (!isInitialized || isLoading) {
        return;
      }

      // Skip if we already navigated
      if (this.hasPerformedInitialNavigation) {
        return;
      }

      // Mark as navigated
      this.hasPerformedInitialNavigation = true;

      // Perform initial navigation based on auth state
      this.handleInitialNavigation(user);
    });

    // Use afterNextRender for proper SSR safety (though mobile doesn't have SSR, good practice)
    afterNextRender(() => {
      this.logger.debug('afterNextRender called', { currentUrl: this.router.url });
      this.initializeApp();
    });
  }

  /**
   * Handle initial navigation based on auth state
   * Called once after auth initialization completes
   */
  private handleInitialNavigation(user: ReturnType<typeof this.authFlow.user>): void {
    const currentUrl = this.router.url;
    this.logger.debug('Handling initial navigation', { currentUrl, userId: user?.uid });

    // If already on a specific route (deep link), respect it
    if (currentUrl !== '/' && currentUrl !== '/auth' && currentUrl !== '/agent-x') {
      this.logger.debug('On specific route, respecting current navigation');
      // Still mark complete so warm-start appUrlOpen events navigate directly from now on.
      this.deepLink.markInitialNavigationComplete();
      return;
    }

    // Determine where to navigate
    if (!user) {
      // Not authenticated - go to auth
      this.logger.info('Not authenticated, navigating to auth');
      this.navController
        .navigateRoot(AUTH_ROUTES.ROOT)
        .then(() => this.deepLink.markInitialNavigationComplete())
        .catch((err) => {
          this.logger.error('Navigation to auth failed', err);
          this.deepLink.markInitialNavigationComplete();
        });
    } else if (!user.hasCompletedOnboarding) {
      if (user._legacyId) {
        // Legacy migrated user — show congratulations/welcome screen directly,
        // skipping the full onboarding flow they don't need.
        this.logger.info('Legacy user: navigating directly to congratulations');
        this.navController
          .navigateRoot('/auth/onboarding/congratulations')
          .then(() => this.deepLink.markInitialNavigationComplete())
          .catch((err) => {
            this.logger.error('Navigation to legacy congratulations failed', err);
            this.deepLink.markInitialNavigationComplete();
          });
      } else {
        // Regular user who hasn't completed onboarding — full onboarding flow
        this.logger.info('Onboarding incomplete, navigating to onboarding');
        this.navController
          .navigateRoot(AUTH_REDIRECTS.ONBOARDING)
          .then(() => this.deepLink.markInitialNavigationComplete())
          .catch((err) => {
            this.logger.error('Navigation to onboarding failed', err);
            this.deepLink.markInitialNavigationComplete();
          });
      }
    } else {
      // Authenticated and onboarding complete - go to agent
      this.logger.info('Authenticated and onboarded, navigating to agent');

      // Refresh FCM token on cold start for already-onboarded users.
      // On resume this is handled by the onResume callback in initializeApp().
      // This call is safe: if permission isn't granted yet it returns silently.
      void this.fcmRegistration.registerTokenIfPermissionGranted();

      this.navController
        .navigateRoot(AUTH_REDIRECTS.DEFAULT)
        .then(() => {
          // ── TIMING FIX ────────────────────────────────────────────────────────
          // Delay 300 ms before marking navigation complete.
          // The Capacitor-retained appUrlOpen event (cold-start Universal Link)
          // is delivered asynchronously via the native bridge and can arrive
          // AFTER this .then() fires.  While _initialNavigationComplete is still
          // false the handler stores the URL as pending; processPendingDeepLink
          // then picks it up correctly.  Without the delay the event arrives with
          // _initialNavigationComplete=true → goes through handleDeepLink directly
          // → navigateForward may fail because the Ionic outlet is still settling.
          setTimeout(() => {
            this.deepLink.markInitialNavigationComplete();
            this.deepLink.processPendingDeepLink();
          }, 300);
          // ── END TIMING FIX ────────────────────────────────────────────────────
        })
        .catch((err) => {
          this.logger.error('Navigation to home failed', err);
          this.deepLink.markInitialNavigationComplete();
        });
    }
  }

  /**
   * Initialize native platform features
   */
  private async initializeApp(): Promise<void> {
    try {
      this.logger.info('Initializing app...');

      // Initialize breadcrumb tracking for crashlytics context (early as possible)
      this.breadcrumbs.initialize();

      await this.ionicPlatform.ready();
      this.logger.debug('Platform ready');

      // Initialize deep link handling FIRST — before the splash delay — so that the
      // Capacitor-retained `appUrlOpen` event (cold-start Universal Link) is captured
      // and stored as a pending deep link while _initialNavigationComplete is still false.
      // If we wait until after nativeApp.initialize() (900 ms splash), the auth effect
      // may have already fired, navigateRoot completed, and processPendingDeepLink()
      // found nothing to process — causing the deep link to be silently dropped.
      await this.deepLink.initialize();
      this.logger.debug('Deep link service initialized');

      // If auth initial navigation already completed before deepLink.initialize() ran
      // (e.g. Firebase resolved from cache before afterNextRender fired), mark it now
      // and process any launch URL that was captured by getLaunchUrl().
      if (this.hasPerformedInitialNavigation) {
        this.deepLink.markInitialNavigationComplete();
        this.deepLink.processPendingDeepLink();
      }

      // Initialize native app features (StatusBar, SplashScreen, lifecycle)
      // Keyboard handling is disabled - letting Ionic/system handle it natively
      await this.nativeApp.initialize({
        // Dark theme status bar
        statusBarColor: '#0a0a0a',
        statusBarStyle: 'light',
        // Keep the native launch visible long enough to avoid a blank handoff
        splashDelay: 900,
        // Lifecycle handlers
        onPause: () => this.logger.debug('Backgrounded'),
        onResume: () => {
          this.logger.debug('Resumed');
          // Refresh network status when app resumes
          this.network.checkStatus();
          // Refresh FCM silently on every resume when the user is authenticated.
          // Using `!== false` (not `=== true`) so users with hasCompletedOnboarding:
          // undefined (e.g. legacy accounts) also get their token refreshed.
          // registerTokenIfPermissionGranted() NEVER shows a native prompt — it is
          // safe to call at any time for any authenticated user.
          if (this.authFlow.user() && this.authFlow.user()?.hasCompletedOnboarding !== false) {
            void this.fcmRegistration.registerTokenIfPermissionGranted();
          }
        },
        onBackButton: () => {
          // Custom back button behavior if needed
          // Return true to prevent default behavior
          return false;
        },
      });

      this.logger.info('Native app initialized');

      // Initialize push notification handling (foreground + background)
      await this.pushHandler.initialize();
      this.logger.debug('Push handler service initialized');

      // Theme service auto-initializes and manages theme switching
      // (NxtThemeService from @nxt1/ui handles DOM updates automatically)
      this.logger.debug('Theme service active', {
        preference: this.theme.preference(),
        effectiveTheme: this.theme.effectiveTheme(),
      });

      // Enable automatic status bar sync with theme changes
      // This ensures status bar icons (light/dark) match the current theme on native
      this.theme.enableStatusBarSync();

      // Services auto-initialize in their constructors
      // Just injecting them is enough to start monitoring

      this.logger.debug('Platform initialized', {
        device: this.platform.deviceType(),
        os: this.platform.os(),
        isNative: this.platform.isNative(),
        isOnline: this.network.isOnline(),
        connectionType: this.network.connectionType(),
        biometricAvailable: this.biometric.isAvailable(),
        biometricType: this.biometric.biometryType(),
      });

      // Self-hosted OTA bundle update check (Firebase Storage + Firestore).
      // Runs in the background; failures are silent and won't block startup.
      this.liveUpdate.initialize().catch((err) => {
        this.logger.warn('Live update initialization failed', { err: String(err) });
      });
    } catch (error) {
      this.logger.error('Initialization error', error);
    } finally {
      await this.nativeApp.completeLaunch();
    }
  }
}
