/**
 * @fileoverview App Configuration - Browser (Client-Side)
 * @module @nxt1/web
 *
 * Production application configuration following 2026 Angular + Firebase best practices.
 *
 * Key Features:
 * - Incremental Hydration: Components hydrate progressively as needed
 * - HTTP Transfer Cache: Server-fetched data transferred to client
 * - Event Replay: User interactions during hydration are replayed
 * - Platform-specific Auth: Uses injection token pattern for SSR safety
 * - Global Error Handling: Enterprise-grade error recovery and tracking
 *
 * Architecture:
 * - app.config.ts: Browser providers (Ionic, Firebase, full functionality)
 * - app.config.server.ts: Server providers (SSR-safe, no browser APIs)
 *
 * @see https://angular.dev/guide/ssr
 * @see https://firebase.google.com/docs/hosting/app-hosting
 */

import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
  ErrorHandler,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
  withInMemoryScrolling,
  withPreloading,
  PreloadAllModules,
  RouteReuseStrategy,
} from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
  withHttpTransferCacheOptions,
} from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular/standalone';

import { routes } from './app.routes';

// Shared Angular infrastructure from @nxt1/ui
import { GlobalErrorHandler, GLOBAL_ERROR_LOGGER, httpErrorInterceptor } from '@nxt1/ui';
import { NxtLoggingService, LOGGING_CONFIG } from '@nxt1/ui';

// Core infrastructure (app-specific)
import { httpCacheInterceptor } from './core/infrastructure';

// Firebase
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAnalytics, getAnalytics } from '@angular/fire/analytics';
import { provideStorage, getStorage } from '@angular/fire/storage';

// Auth service with injection token pattern
import { AUTH_SERVICE, BrowserAuthService } from './features/auth';

import { environment } from '../environments/environment';

/**
 * Browser Application Configuration
 *
 * Full-featured configuration for client-side rendering with:
 * - Ionic Framework for mobile-ready UI
 * - Firebase for auth, database, storage
 * - Modern hydration with incremental loading
 * - HTTP state transfer from SSR
 */
export const appConfig: ApplicationConfig = {
  providers: [
    // ============================================
    // CORE ANGULAR PROVIDERS
    // ============================================

    // Zone.js change detection with event coalescing for performance
    provideZoneChangeDetection({ eventCoalescing: true }),

    // Router with modern features
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      // Preload all lazy routes for faster navigation
      withPreloading(PreloadAllModules)
    ),

    // HTTP client with fetch API, error handling, and caching
    provideHttpClient(
      withFetch(),
      withInterceptors([
        // Global HTTP error handling (401 redirect, rate limiting, network errors)
        // Order matters: error interceptor runs first to catch all errors
        httpErrorInterceptor({
          redirectOnUnauthorized: true,
          unauthorizedRedirectPath: '/auth',
        }),
        // HTTP response caching (LRU, TTL-based)
        httpCacheInterceptor({
          maxSize: 100,
          staleWhileRevalidate: true,
        }),
      ])
    ),

    // ============================================
    // HYDRATION - 2026 Best Practices
    // ============================================

    provideClientHydration(
      // Replay user events that occurred during hydration
      withEventReplay(),

      // Incremental hydration - only hydrate visible/interacted components
      // Drastically improves Time to Interactive (TTI)
      withIncrementalHydration(),

      // Transfer HTTP cache from server to client
      // Prevents duplicate API calls for data already fetched during SSR
      withHttpTransferCacheOptions({
        includePostRequests: false,
        includeHeaders: ['Authorization'],
      })
    ),

    // Async animations for better performance
    provideAnimationsAsync(),

    // ============================================
    // IONIC FRAMEWORK
    // ============================================

    provideIonicAngular({
      mode: undefined, // Auto-detect platform (ios/md)
      animated: true,
      rippleEffect: true,
      hardwareBackButton: true,
      statusTap: true,
      swipeBackEnabled: true,
    }),

    // Ionic route reuse strategy for navigation stack
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    // ============================================
    // FIREBASE
    // ============================================

    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    provideAnalytics(() => getAnalytics()), // GA4 - Auto-tracks performance & page views

    // ============================================
    // AUTH SERVICE (Injection Token Pattern)
    // ============================================

    // Provide BrowserAuthService for AUTH_SERVICE token
    // Server uses ServerAuthService instead (see app.config.server.ts)
    { provide: AUTH_SERVICE, useClass: BrowserAuthService },

    // ============================================
    // LOGGING & ERROR HANDLING
    // ============================================

    // Logging configuration (optional - defaults are sensible)
    {
      provide: LOGGING_CONFIG,
      useValue: {
        appVersion: environment.version || '1.0.0',
        remoteEndpoint: environment.loggingEndpoint,
      },
    },

    // Provide shared logging service to GlobalErrorHandler
    { provide: GLOBAL_ERROR_LOGGER, useExisting: NxtLoggingService },

    // Global error handler - catches all unhandled errors
    // Handles chunk loading failures, tracks errors, provides recovery
    { provide: ErrorHandler, useClass: GlobalErrorHandler },

    // ============================================
    // PWA SERVICE WORKER
    // ============================================

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
