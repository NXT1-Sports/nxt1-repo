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
import {
  NxtPlatformService,
  NxtLoggingService,
  NxtBreadcrumbService,
  NxtThemeService,
  UsageBottomSheetService,
} from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import {
  NativeAppService,
  NetworkService,
  DeepLinkService,
  PushHandlerService,
  FcmRegistrationService,
  NativeBadgeService,
} from './core/services';
import { BiometricService, AuthFlowService } from './features/auth/services';
import { IapService } from './core/services/iap.service';
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

  /** Track if we've performed initial navigation */
  private hasPerformedInitialNavigation = false;

  constructor() {
    // Register Apple IAP as the global buy-credits handler on iOS.
    // All surfaces (Agent X, Usage page, billing card) will use IAP instead of basic Stripe flow.
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
    if (
      currentUrl !== '/' &&
      currentUrl !== '/auth' &&
      currentUrl !== '/home' &&
      currentUrl !== '/agent'
    ) {
      this.logger.debug('On specific route, respecting current navigation');
      return;
    }

    // Determine where to navigate
    if (!user) {
      // Not authenticated - go to auth
      this.logger.info('Not authenticated, navigating to auth');
      this.navController
        .navigateRoot(AUTH_ROUTES.ROOT)
        .catch((err) => this.logger.error('Navigation to auth failed', err));
    } else if (!user.hasCompletedOnboarding) {
      // Authenticated but onboarding incomplete - go to onboarding
      this.logger.info('Onboarding incomplete, navigating to onboarding');
      this.navController
        .navigateRoot(AUTH_REDIRECTS.ONBOARDING)
        .catch((err) => this.logger.error('Navigation to onboarding failed', err));
    } else {
      // Authenticated and onboarding complete - go to agent
      this.logger.info('Authenticated and onboarded, navigating to agent');
      this.navController
        .navigateRoot(AUTH_REDIRECTS.DEFAULT)
        .catch((err) => this.logger.error('Navigation to home failed', err));
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

      // Initialize native app features (StatusBar, SplashScreen, lifecycle)
      // Keyboard handling is disabled - letting Ionic/system handle it natively
      await this.nativeApp.initialize({
        // Dark theme status bar
        statusBarColor: '#0a0a0a',
        statusBarStyle: 'light',
        // Lifecycle handlers
        onPause: () => this.logger.debug('Backgrounded'),
        onResume: () => {
          this.logger.debug('Resumed');
          // Refresh network status when app resumes
          this.network.checkStatus();
          // Re-register FCM token if user is authenticated
          if (this.authFlow.isAuthenticated()) {
            void this.fcmRegistration.registerToken();
          }
        },
        onBackButton: () => {
          // Custom back button behavior if needed
          // Return true to prevent default behavior
          return false;
        },
      });

      this.logger.info('Native app initialized');

      // Initialize deep link handling (Universal Links / App Links)
      await this.deepLink.initialize();
      this.logger.debug('Deep link service initialized');

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
    } catch (error) {
      this.logger.error('Initialization error', error);
    }
  }
}
