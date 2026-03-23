/**
 * @fileoverview App Configuration - Server (SSR)
 * @module @nxt1/web
 *
 * Server-side rendering configuration following 2026 Angular best practices.
 *
 * Key Differences from Browser Config:
 * - No Ionic providers (requires browser APIs)
 * - Uses FirebaseServerApp for authenticated SSR
 * - ServerAuthService with APP_INITIALIZER for auth state
 * - HTTP transfer state for seamless hydration
 *
 * FirebaseServerApp Pattern (2026):
 * 1. Client sends auth token via __session cookie
 * 2. server.ts extracts token and provides via SSR_AUTH_TOKEN
 * 3. ServerAuthService initializes FirebaseServerApp with token
 * 4. Authenticated Firestore queries run during SSR
 * 5. User-specific content rendered on first paint
 * 6. State transferred to client via hydration
 *
 * @see https://angular.dev/guide/ssr
 * @see https://firebase.google.com/docs/reference/js/app.firebaseserverapp
 */

import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
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

// Ionic SSR Support
// In Angular 21 standalone mode, provideIonicAngular() handles both browser and server
// @ionic/angular-server is installed for its server-safe component implementations
import { provideIonicAngular } from '@ionic/angular/standalone';

// Shared infrastructure from @nxt1/ui (granular import)
import { GLOBAL_CRASHLYTICS } from '@nxt1/ui/infrastructure';

// Crashlytics service (web uses GA4 fallback, SSR-safe)
import { CrashlyticsService } from './core/services/crashlytics.service';

// Auth service with injection token pattern
// IMPORTANT: Import directly from files, NOT from barrel export
// Barrel exports would pull in BrowserAuthService which imports Firebase Auth
import { AUTH_SERVICE } from './features/auth/services/auth.interface';
import {
  ServerAuthService,
  initializeServerAuth,
} from './features/auth/services/server-auth.service';
import { SSR_AUTH_TOKEN, SSR_FIREBASE_CONFIG } from './features/auth/services/ssr-tokens';
import { TEAM_PROFILE_API_BASE_URL } from '@nxt1/ui/team-profile';
import { AGENT_X_API_BASE_URL } from '@nxt1/ui/agent-x';

// Environment for Firebase config
import { environment } from '../environments/environment';

/**
 * Server Application Configuration
 *
 * Full-featured SSR with authenticated FirebaseServerApp.
 *
 * Features:
 * - FirebaseServerApp initialization with auth token
 * - Authenticated Firestore queries during SSR
 * - User profile fetching for personalized content
 * - Proper cleanup after request completes
 * - Ionic SSR via @ionic/angular-server
 *
 * Ionic SSR Notes:
 * - IonicServerModule provides server-safe versions of Ionic components
 * - provideIonicAngular() still needed for component configuration
 * - Hydration is handled by Angular's built-in system
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
    // IONIC SSR CONFIGURATION
    // ============================================
    // Ionic components are server-rendered via IonicServerModule
    // This provides server-safe implementations of Ionic web components
    provideIonicAngular({
      // Use 'md' on server to match client config and avoid
      // platform detection mismatches during hydration.
      mode: 'md',
      useSetInputAPI: true, // Required for Angular signal input() fields in Ionic modals/sheets
    }),

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
    // FIREBASE SERVER APP CONFIGURATION
    // ============================================

    // Team Profile API — must use absolute URL in SSR context
    // Default factory falls back to '/api/v1' (relative) which breaks SSR
    { provide: TEAM_PROFILE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Agent X API — required by AgentXService (providedIn: 'root')
    // Must use absolute URL in SSR context
    { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiURL },

    // Provide Firebase config for ServerAuthService
    // This is used to initialize FirebaseServerApp
    { provide: SSR_FIREBASE_CONFIG, useValue: environment.firebase },

    // SSR_AUTH_TOKEN is provided by server.ts via CommonEngine providers
    // It contains the auth token extracted from the __session cookie
    // Default to undefined if not provided (unauthenticated SSR)
    { provide: SSR_AUTH_TOKEN, useValue: undefined },

    // ============================================
    // AUTH SERVICE (Server Implementation)
    // ============================================

    // Provide ServerAuthService for AUTH_SERVICE token
    // This implementation uses FirebaseServerApp for authenticated SSR
    { provide: AUTH_SERVICE, useClass: ServerAuthService },

    // ============================================
    // CRASHLYTICS (SSR-Safe)
    // ============================================

    // Provide CrashlyticsService for GLOBAL_CRASHLYTICS token
    // CrashlyticsService is SSR-safe and uses no-op adapter on server
    { provide: GLOBAL_CRASHLYTICS, useExisting: CrashlyticsService },

    // Initialize auth BEFORE rendering starts
    // This ensures auth state is populated for all components
    {
      provide: APP_INITIALIZER,
      useFactory: initializeServerAuth,
      deps: [AUTH_SERVICE],
      multi: true,
    },
  ],
};
