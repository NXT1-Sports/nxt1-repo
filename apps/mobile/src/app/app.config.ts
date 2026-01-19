/**
 * @fileoverview Mobile App Configuration
 * @module @nxt1/mobile
 *
 * Main application configuration for mobile app.
 * Uses shared infrastructure from @nxt1/ui for consistency with web.
 */

import { ApplicationConfig, provideZoneChangeDetection, ErrorHandler } from '@angular/core';
import { provideRouter, withComponentInputBinding, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular/standalone';

// Firebase
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';

// Shared Angular infrastructure from @nxt1/ui
import {
  GlobalErrorHandler,
  GLOBAL_ERROR_LOGGER,
  httpErrorInterceptor,
} from '@nxt1/ui/infrastructure';
import { NxtLoggingService, LOGGING_CONFIG } from '@nxt1/ui/services';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),

    provideRouter(routes, withComponentInputBinding()),

    // HTTP client with error handling
    provideHttpClient(
      withFetch(),
      withInterceptors([
        // Global HTTP error handling (shared with web)
        httpErrorInterceptor({
          redirectOnUnauthorized: true,
          unauthorizedRedirectPath: '/auth',
        }),
      ])
    ),

    provideAnimationsAsync(),

    // Ionic Configuration
    // - Platform-adaptive: iOS gets iOS design, Android gets Material Design
    // - Dark mode controlled via NXT1 design tokens
    provideIonicAngular({
      // No mode specified = auto-detect platform (iOS/MD)
    }),

    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    // Firebase
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),

    // ============================================
    // LOGGING & ERROR HANDLING (same as web)
    // ============================================

    // Logging configuration
    {
      provide: LOGGING_CONFIG,
      useValue: {
        appVersion: environment.appVersion || '1.0.0',
        // remoteEndpoint: environment.loggingEndpoint, // Enable when ready
      },
    },

    // Provide shared logging service to GlobalErrorHandler
    { provide: GLOBAL_ERROR_LOGGER, useExisting: NxtLoggingService },

    // Global error handler (shared with web)
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
