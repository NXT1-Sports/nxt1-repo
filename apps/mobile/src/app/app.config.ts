/**
 * @fileoverview Mobile App Configuration
 * @module @nxt1/mobile
 *
 * Main application configuration for mobile app.
 */

import { ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular/standalone';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),

    provideRouter(routes, withComponentInputBinding()),

    provideHttpClient(withFetch()),

    provideAnimationsAsync(),

    // Ionic configured for mobile-first experience
    provideIonicAngular({
      mode: undefined, // Auto-detect (iOS on iPhone, MD on Android)
      animated: true,
      rippleEffect: true,
      hardwareBackButton: true,
      statusTap: true,
      swipeBackEnabled: true,
      backButtonText: '',
      backButtonIcon: 'chevron-back',
    }),

    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
  ],
};
