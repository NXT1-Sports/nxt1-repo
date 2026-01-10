/**
 * @fileoverview Mobile App Configuration
 * @module @nxt1/mobile
 *
 * Main application configuration for mobile app.
 */

import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular/standalone';

// Firebase
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),

    provideRouter(routes, withComponentInputBinding()),

    provideHttpClient(withFetch()),

    provideAnimationsAsync(),

    // Ionic Configuration
    // - Disable automatic dark mode (we control theming via NXT1 design tokens)
    // - Use iOS mode for consistent cross-platform look
    provideIonicAngular({
      mode: 'ios',
    }),

    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    // Firebase
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
  ],
};
