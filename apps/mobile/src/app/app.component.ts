/**
 * @fileoverview Root App Component
 * @module @nxt1/mobile
 *
 * Main application shell with Ionic setup and platform initialization.
 */

import { Component, OnInit, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, Platform } from '@ionic/angular/standalone';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

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
export class AppComponent implements OnInit {
  private readonly platform = inject(Platform);

  async ngOnInit(): Promise<void> {
    await this.initializeApp();
  }

  /**
   * Initialize native platform features
   */
  private async initializeApp(): Promise<void> {
    await this.platform.ready();

    if (Capacitor.isNativePlatform()) {
      await this.configureStatusBar();
      await this.hideSplashScreen();
    }
  }

  /**
   * Configure status bar appearance
   */
  private async configureStatusBar(): Promise<void> {
    try {
      // Use dark content on light backgrounds
      await StatusBar.setStyle({ style: Style.Dark });

      // Make status bar overlay the app (iOS)
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch (error) {
      console.warn('StatusBar not available:', error);
    }
  }

  /**
   * Hide the native splash screen
   */
  private async hideSplashScreen(): Promise<void> {
    try {
      await SplashScreen.hide();
    } catch (error) {
      console.warn('SplashScreen not available:', error);
    }
  }
}
