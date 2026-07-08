/**
 * @fileoverview Root App Component
 * @module @nxt1/mobile
 *
 * Main application shell with native platform initialization.
 * Uses NativeAppService for all native features (StatusBar, SplashScreen, Keyboard, etc.)
 */

import { Component, afterNextRender, inject, effect, signal, computed } from '@angular/core';
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
      @if (showAccessGate()) {
        <div class="app-access-gate">
          <div class="app-access-card">
            <div class="app-access-brand">NXT1</div>
            <h1>{{ accessGateTitle() }}</h1>
            <p>{{ accessGateMessage() }}</p>

            <div class="app-access-actions">
              <button
                type="button"
                class="app-access-primary"
                [disabled]="unlockInProgress()"
                (click)="onRetryUnlock()"
              >
                {{ unlockInProgress() ? 'Checking...' : 'Use ' + biometricLabel() }}
              </button>
              <button
                type="button"
                class="app-access-secondary"
                [disabled]="unlockInProgress()"
                (click)="onSignOutFromGate()"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      }
    </ion-app>
  `,
  styles: [
    `
      :host {
        /* Scoped token: primary color at 14% opacity, used for glow effects */
        --_primary-glow: color-mix(in srgb, var(--nxt1-color-primary, #c2ff00) 14%, transparent);
      }

      :host,
      ion-app {
        background:
          radial-gradient(circle at top, var(--_primary-glow), transparent 30%),
          var(--nxt1-color-bg-primary, #050505);
      }

      .app-access-gate {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: var(--nxt1-color-bg-overlay, rgba(0, 0, 0, 0.8));
        backdrop-filter: blur(14px);
      }

      .app-access-card {
        width: min(100%, 360px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 28px;
        padding: 28px 24px;
        background: var(--nxt1-color-bg-secondary, #131313);
        box-shadow: 0 24px 72px rgba(0, 0, 0, 0.45);
        text-align: center;
        color: var(--nxt1-color-text-primary, #f5f5f5);
      }

      .app-access-brand {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 68px;
        height: 34px;
        margin-bottom: 18px;
        border-radius: 999px;
        background: var(--_primary-glow);
        color: var(--nxt1-color-primary, #c2ff00);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.18em;
      }

      .app-access-card h1 {
        margin: 0;
        font-size: 1.7rem;
        font-weight: 700;
        letter-spacing: -0.03em;
      }

      .app-access-card p {
        margin: 12px 0 0;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 0.98rem;
        line-height: 1.45;
      }

      .app-access-actions {
        display: grid;
        gap: 12px;
        margin-top: 24px;
      }

      .app-access-primary,
      .app-access-secondary {
        width: 100%;
        border: 0;
        border-radius: 18px;
        padding: 14px 16px;
        font: inherit;
        font-weight: 600;
      }

      .app-access-primary {
        background: var(--nxt1-color-primary, #c2ff00);
        color: var(--nxt1-color-text-on-primary, #0a0a0a);
      }

      .app-access-secondary {
        background: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-primary, #f5f5f5);
      }

      .app-access-primary[disabled],
      .app-access-secondary[disabled] {
        opacity: 0.6;
      }
    `,
  ],
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
  /** Prevent duplicate initial access resolution */
  private hasStartedInitialAccess = false;

  protected readonly accessResolved = signal(false);
  protected readonly requiresBiometricUnlock = signal(false);
  protected readonly unlockInProgress = signal(false);
  protected readonly unlockError = signal<string | null>(null);
  protected readonly biometricLabel = computed(() => this.biometric.biometryName());
  protected readonly showAccessGate = computed(
    () => this.requiresBiometricUnlock() && !this.accessResolved()
  );
  protected readonly accessGateTitle = computed(() => 'Unlock NXT1');
  protected readonly accessGateMessage = computed(
    () => this.unlockError() ?? `Use ${this.biometricLabel()} to continue.`
  );

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

      if (this.hasStartedInitialAccess) {
        return;
      }

      this.hasStartedInitialAccess = true;
      void this.resolveInitialAccess(user);
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

  private async resolveInitialAccess(user: ReturnType<typeof this.authFlow.user>): Promise<void> {
    const unlocked = await this.unlockSessionIfNeeded(user);
    if (!unlocked) {
      return;
    }

    this.accessResolved.set(true);

    if (!this.hasPerformedInitialNavigation) {
      this.hasPerformedInitialNavigation = true;
      this.handleInitialNavigation(user);
    }
  }

  private async unlockSessionIfNeeded(
    user: ReturnType<typeof this.authFlow.user>
  ): Promise<boolean> {
    const requiresUnlock = await this.shouldRequireBiometricUnlock(user);
    this.requiresBiometricUnlock.set(requiresUnlock);

    if (!requiresUnlock) {
      this.unlockError.set(null);
      return true;
    }

    return this.promptForBiometricUnlock();
  }

  private async shouldRequireBiometricUnlock(
    user: ReturnType<typeof this.authFlow.user>
  ): Promise<boolean> {
    if (!user) {
      return false;
    }

    await this.biometric.initialize();
    await this.biometric.loadEnrollmentStatus();

    return this.biometric.isAvailable() && this.biometric.isEnrolled();
  }

  private async promptForBiometricUnlock(): Promise<boolean> {
    if (this.unlockInProgress()) {
      return false;
    }

    this.unlockInProgress.set(true);
    this.unlockError.set(null);

    try {
      const result = await this.biometric.authenticate({
        reason: `Use ${this.biometricLabel()} to unlock NXT1`,
        title: 'Unlock NXT1',
      });

      if (!result.success) {
        this.unlockError.set(result.error ?? `Use ${this.biometricLabel()} to continue.`);
        return false;
      }

      return true;
    } finally {
      this.unlockInProgress.set(false);
    }
  }

  protected async onRetryUnlock(): Promise<void> {
    const unlocked = await this.promptForBiometricUnlock();
    if (!unlocked) {
      return;
    }

    this.accessResolved.set(true);

    if (!this.hasPerformedInitialNavigation) {
      this.hasPerformedInitialNavigation = true;
      this.handleInitialNavigation(this.authFlow.user());
    }
  }

  protected async onSignOutFromGate(): Promise<void> {
    try {
      await this.authFlow.signOut();
    } finally {
      this.requiresBiometricUnlock.set(false);
      this.unlockError.set(null);
      this.accessResolved.set(true);
    }
  }

  private async reLockOnResumeIfNeeded(): Promise<void> {
    if (!this.hasPerformedInitialNavigation || !this.authFlow.user()) {
      return;
    }

    const requiresUnlock = await this.shouldRequireBiometricUnlock(this.authFlow.user());
    if (!requiresUnlock) {
      return;
    }

    this.requiresBiometricUnlock.set(true);
    this.accessResolved.set(false);

    const unlocked = await this.promptForBiometricUnlock();
    if (unlocked) {
      this.accessResolved.set(true);
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
          void this.reLockOnResumeIfNeeded();
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
