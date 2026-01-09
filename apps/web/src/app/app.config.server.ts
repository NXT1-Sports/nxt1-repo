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
import { provideServerRendering } from '@angular/platform-server';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';

// Auth service with injection token pattern
import { AUTH_SERVICE, ServerAuthService } from './core/auth';

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

    // Required for Angular Universal SSR
    provideServerRendering(),

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
