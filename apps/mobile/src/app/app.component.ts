/**
 * @fileoverview Root App Component
 * @module @nxt1/mobile
 *
 * Main application shell with native platform initialization.
 * Uses NativeAppService for all native features (StatusBar, SplashScreen, Keyboard, etc.)
 */

import { Component, afterNextRender, inject, effect } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { IonApp, IonRouterOutlet, Platform } from '@ionic/angular/standalone';
import { NxtPlatformService } from '@nxt1/ui';
import { NativeAppService, ThemeService } from './core/services';
import { BiometricService, AuthFlowService } from './features/auth/services';
import { NetworkService } from './services/network.service';
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
  private readonly nativeApp = inject(NativeAppService);
  private readonly network = inject(NetworkService);
  private readonly biometric = inject(BiometricService);
  private readonly platform = inject(NxtPlatformService);
  private readonly theme = inject(ThemeService);
  private readonly authFlow = inject(AuthFlowService);

  /** Track if we've performed initial navigation */
  private hasPerformedInitialNavigation = false;

  constructor() {
    // Log early to confirm app is loading
    console.log('[App] AppComponent constructor called');

    // Debug routing
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        console.log('[App] Navigation completed:', event.url);
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
      console.log('[App] afterNextRender called');
      console.log('[App] Current URL:', this.router.url);
      this.initializeApp();
    });
  }

  /**
   * Handle initial navigation based on auth state
   * Called once after auth initialization completes
   */
  private handleInitialNavigation(user: ReturnType<typeof this.authFlow.user>): void {
    const currentUrl = this.router.url;
    console.log('[App] Handling initial navigation. Current URL:', currentUrl, 'User:', user?.uid);

    // If already on a specific route (deep link), respect it
    if (currentUrl !== '/' && currentUrl !== '/auth' && currentUrl !== '/home') {
      console.log('[App] On specific route, respecting current navigation');
      return;
    }

    // Determine where to navigate
    if (!user) {
      // Not authenticated - go to auth
      console.log('[App] Not authenticated, navigating to auth');
      void this.router.navigate([AUTH_ROUTES.ROOT]);
    } else if (!user.hasCompletedOnboarding) {
      // Authenticated but onboarding incomplete - go to onboarding
      console.log('[App] Onboarding incomplete, navigating to onboarding');
      void this.router.navigate([AUTH_REDIRECTS.ONBOARDING]);
    } else {
      // Authenticated and onboarding complete - go to home
      console.log('[App] Authenticated and onboarded, navigating to home');
      void this.router.navigate([AUTH_REDIRECTS.DEFAULT]);
    }
  }

  /**
   * Initialize native platform features
   */
  private async initializeApp(): Promise<void> {
    try {
      console.log('[App] Initializing app...');
      await this.ionicPlatform.ready();
      console.log('[App] Platform ready');

      // Initialize native app features (StatusBar, SplashScreen, Keyboard, lifecycle)
      await this.nativeApp.initialize({
        // Dark theme status bar
        statusBarColor: '#0a0a0a',
        statusBarStyle: 'light',
        // Keyboard behavior - 'body' mode resizes the body element (2026 best practice)
        keyboardResize: 'body',
        keyboardAccessoryBarHidden: true, // Clean pro look - hide accessory bar
        // Lifecycle handlers
        onPause: () => console.debug('[App] Backgrounded'),
        onResume: () => {
          console.debug('[App] Resumed');
          // Refresh network status when app resumes
          this.network.checkStatus();
        },
        onBackButton: () => {
          // Custom back button behavior if needed
          // Return true to prevent default behavior
          return false;
        },
      });

      console.log('[App] Native app initialized');

      // Enable status bar sync with theme (2026 professional best practice)
      // This auto-updates status bar icons when theme changes
      this.theme.enableStatusBarSync();
      console.log('[App] Status bar theme sync enabled');

      // Services auto-initialize in their constructors
      // Just injecting them is enough to start monitoring

      console.debug('[App] Platform initialized', {
        device: this.platform.deviceType(),
        os: this.platform.os(),
        isNative: this.platform.isNative(),
        isOnline: this.network.isOnline(),
        connectionType: this.network.connectionType(),
        biometricAvailable: this.biometric.isAvailable(),
        biometricType: this.biometric.biometryType(),
      });
    } catch (error) {
      console.error('[App] Initialization error:', error);
    }
  }
}
