/**
 * @fileoverview App Configuration - Server (SSR)
 * @module @nxt1/web
 *
 * Server-side rendering configuration following 2026 Angular best practices.
 *
 * Key Differences from Browser Config:
 * - No Ionic providers (requires browser APIs)
 * - No Firebase providers (uses FirebaseServerApp pattern)
 * - ServerAuthService instead of BrowserAuthService
 * - HTTP transfer state for seamless hydration
 *
 * FirebaseServerApp Pattern (2026):
 * For authenticated SSR, the recommended approach is:
 * 1. Client sends auth token via cookie/header
 * 2. Server initializes FirebaseServerApp with that token
 * 3. Server can make authenticated Firebase calls
 * 4. State is transferred to client via HTTP cache
 *
 * However, for initial implementation, we use a simpler approach:
 * - Server renders unauthenticated state
 * - Client hydrates and initializes Firebase Auth
 * - Protected routes use RenderMode.Client
 *
 * @see https://angular.dev/guide/ssr
 * @see https://firebase.google.com/docs/reference/js/app.firebaseserverapp
 */

import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
  withHttpTransferCacheOptions,
} from '@angular/platform-browser';
// CRITICAL: Import provideServerRendering from @angular/ssr (NOT @angular/platform-server)
// This version supports withRoutes() for proper RenderMode handling
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';

// Auth service with injection token pattern
// IMPORTANT: Import directly from files, NOT from barrel export
// Barrel exports would pull in BrowserAuthService which imports Firebase Auth
import { AUTH_SERVICE } from './core/auth/auth.interface';
import { ServerAuthService } from './core/auth/server-auth.service';

/**
 * Server Application Configuration
 *
 * Minimal providers for server-side rendering.
 *
 * Does NOT include:
 * - Ionic (requires DOM/window)
 * - Firebase Auth/Firestore/Storage (browser SDKs)
 * - ServiceWorker (browser-only)
 * - RouteReuseStrategy (Ionic-specific)
 *
 * Uses ServerAuthService which:
 * - Returns unauthenticated state
 * - All methods are no-ops
 * - No Firebase imports
 */
export const config: ApplicationConfig = {
  providers: [
    // ============================================
    // SSR CORE PROVIDERS
    // ============================================

    // CRITICAL: provideServerRendering from @angular/ssr (NOT @angular/platform-server)
    // This integrates with RenderMode in serverRoutes for proper hydration serialization
    provideServerRendering(withRoutes(serverRoutes)),

    // Zone.js change detection
    provideZoneChangeDetection({ eventCoalescing: true }),

    // Router - same routes, no view transitions on server
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'disabled',
        anchorScrolling: 'disabled',
      })
    ),

    // HTTP client for API calls during SSR
    // Data fetched here is transferred to client via HttpTransferCache
    provideHttpClient(withFetch()),

    // ============================================
    // HYDRATION - MUST MATCH CLIENT CONFIG
    // ============================================
    // Without this, NG0505 error occurs because client expects
    // serialized hydration data that server didn't provide
    provideClientHydration(
      withEventReplay(),
      withIncrementalHydration(),
      withHttpTransferCacheOptions({
        includePostRequests: false,
        includeHeaders: ['Authorization'],
      })
    ),

    // Animations (noop on server)
    provideAnimationsAsync(),

    // ============================================
    // AUTH SERVICE (Server Implementation)
    // ============================================

    // Provide ServerAuthService for AUTH_SERVICE token
    // This is the SSR-safe noop implementation
    { provide: AUTH_SERVICE, useClass: ServerAuthService },
  ],
};
