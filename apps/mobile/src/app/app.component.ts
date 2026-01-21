/**
 * @fileoverview Root App Component
 * @module @nxt1/mobile
 *
 * Main application shell with native platform initialization.
 * Uses NativeAppService for all native features (StatusBar, SplashScreen, Keyboard, etc.)
 */

import { Component, afterNextRender, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { IonApp, IonRouterOutlet, Platform } from '@ionic/angular/standalone';
import { NxtPlatformService } from '@nxt1/ui';
import { NativeAppService } from './core/services';
import { BiometricService } from './features/auth/services';
import { NetworkService } from './services/network.service';
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

  constructor() {
    // Log early to confirm app is loading
    console.log('[App] AppComponent constructor called');

    // Debug routing
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        console.log('[App] Navigation completed:', event.url);
      });

    // Use afterNextRender for proper SSR safety (though mobile doesn't have SSR, good practice)
    afterNextRender(() => {
      console.log('[App] afterNextRender called');
      console.log('[App] Current URL:', this.router.url);
      this.initializeApp();
    });
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
        // Keyboard behavior
        keyboardResize: 'body',
        keyboardAccessoryBarHidden: false,
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
