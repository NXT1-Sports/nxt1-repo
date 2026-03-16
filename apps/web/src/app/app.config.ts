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
  Injectable,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
  withInMemoryScrolling,
  withPreloading,
  PreloadingStrategy,
  Route,
} from '@angular/router';
import { Observable } from 'rxjs';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
  withHttpTransferCacheOptions,
} from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app.routes';

// Shared Angular infrastructure from @nxt1/ui (granular imports for tree-shaking)
import {
  GlobalErrorHandler,
  GLOBAL_ERROR_LOGGER,
  GLOBAL_CRASHLYTICS,
  httpErrorInterceptor,
} from '@nxt1/ui/infrastructure';
import { ANALYTICS_ADAPTER, NxtLoggingService, LOGGING_CONFIG } from '@nxt1/ui/services';

// Core infrastructure (app-specific)
import { httpCacheInterceptor, authInterceptor } from './core/infrastructure';
import { httpPerformanceInterceptor } from './core/infrastructure/performance-interceptor';

// Crashlytics service (web uses GA4 fallback)
import { CrashlyticsService } from './core/services/crashlytics.service';
import { AnalyticsService } from './core/services/analytics.service';

// Badge bridge: connects ActivityService (from @nxt1/ui) → BadgeCountService
import { provideBadgeBridge } from './core/services';

// Web push notifications: FCM token management + foreground message handling
import { provideWebPush } from './core/services/web-push.service';

// News API base URL (uses environment.apiURL — same origin + /api/v1/staging in dev)
import {
  NEWS_API_BASE_URL,
  TEAM_PROFILE_API_BASE_URL,
  AGENT_X_API_BASE_URL,
  ACTIVITY_API_BASE_URL,
  INVITE_API_BASE_URL,
  MESSAGES_API_BASE_URL,
  USAGE_API_BASE_URL,
} from '@nxt1/ui';

// Help Center API adapter — wired at root so the shared HelpCenterService
// (providedIn: 'root') can resolve the token when it's first injected.
import { HELP_CENTER_API } from '@nxt1/ui/help-center';
import { HelpCenterApiService } from './features/help-center/services/help-center-api.service';

// Firebase
// IMPORTANT: Only import what's actually used in browser bundle
// - FirebaseApp: Required for Firebase initialization
// - Auth: Required for authentication (BrowserAuthService uses it)
// - Firestore: NOT imported - only used in SSR via firebase/firestore SDK
// - Storage: NOT imported - file uploads go through backend API (security)
// - Analytics/Performance: Lazy-loaded after LCP (see AppComponent)
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideAnalytics, getAnalytics } from '@angular/fire/analytics';
import { providePerformance, getPerformance } from '@angular/fire/performance';

// Auth service with injection token pattern
import { AUTH_SERVICE, BrowserAuthService } from './features/auth';

// Settings persistence adapter (connects SettingsService → backend API)
import { SETTINGS_PERSISTENCE_ADAPTER } from '@nxt1/ui/settings';
import { SettingsApiService } from './features/settings/services/settings-api.service';

import { environment } from '../environments/environment';

/**
 * Custom preloading strategy that waits until the browser is idle
 * before preloading lazy routes. This prevents chunk loading from
 * competing with LCP-critical rendering during the initial load.
 *
 * On browsers without requestIdleCallback, falls back to a 3-second delay.
 */
@Injectable({ providedIn: 'root' })
class IdlePreloadStrategy implements PreloadingStrategy {
  preload(_route: Route, load: () => Observable<unknown>): Observable<unknown> {
    // Wait for browser idle or 3s timeout, then preload
    return new Observable((subscriber) => {
      const callback = () => {
        load().subscribe(subscriber);
      };

      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(callback, { timeout: 5000 });
      } else {
        setTimeout(callback, 3000);
      }

      return undefined; // No cleanup needed
    });
  }
}

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
      // Idle-based preloading: defer chunk loading until browser is idle
      // Prevents preloaded JS from competing with LCP-critical rendering
      withPreloading(IdlePreloadStrategy)
    ),

    // HTTP client with fetch API, error handling, and caching
    provideHttpClient(
      withFetch(),
      withInterceptors([
        // Performance monitoring - tracks ALL HTTP requests automatically
        httpPerformanceInterceptor({ apiOnly: true }),
        // Auth interceptor - adds Firebase ID token to API requests
        // MUST run FIRST before error/cache interceptors
        authInterceptor,
        // Global HTTP error handling (401 redirect, rate limiting, network errors)
        // Order matters: error interceptor runs after auth to catch all errors
        httpErrorInterceptor({
          redirectOnUnauthorized: true,
          unauthorizedRedirectPath: '/auth',
          // Skip 401 redirect for fire-and-forget background requests
          skipPatterns: [/\/agent-x\//],
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
    // IONIC FRAMEWORK (UI Components Only — routing uses Angular Router)
    // ============================================

    provideIonicAngular({
      // Explicitly set 'md' for web to avoid Ionic's platform detection
      // which triggers forced reflows (reads layout properties synchronously).
      // Mobile app uses 'ios'/'md' auto-detection via Capacitor.
      mode: 'md',
      animated: true,
      rippleEffect: true,
    }),

    // ============================================
    // FIREBASE
    // ============================================

    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideAnalytics(() => getAnalytics()),
    providePerformance(() => getPerformance()),
    // NOTE: Firestore and Storage are NOT provided in browser bundle:
    // - Firestore: Only used during SSR via firebase/firestore SDK (ServerAuthService)
    // - Storage: File uploads go through backend API for security

    // ============================================
    // AUTH SERVICE (Injection Token Pattern)
    // ============================================

    // Provide BrowserAuthService for AUTH_SERVICE token
    // Server uses ServerAuthService instead (see app.config.server.ts)
    { provide: AUTH_SERVICE, useClass: BrowserAuthService },

    // ============================================
    // BADGE COUNT BRIDGE
    // ============================================

    // Bridges ActivityService.totalUnread → BadgeCountService.activityBadge
    // So the shell reads from BadgeCountService without importing ActivityService
    provideBadgeBridge(),

    // ============================================
    // WEB PUSH NOTIFICATIONS
    // ============================================

    // FCM token registration, foreground message handling, background click routing
    provideWebPush(),

    // News API base URL — uses the same environment.apiURL as other services.
    // The news constants use /news/* paths (without /api/v1/ prefix),
    // so baseUrl + path = e.g. http://localhost:3000/api/v1/staging/news
    { provide: NEWS_API_BASE_URL, useFactory: () => environment.apiURL },

    // Team Profile API base URL
    { provide: TEAM_PROFILE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Agent X API base URL
    { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiURL },

    // Activity API base URL
    { provide: ACTIVITY_API_BASE_URL, useFactory: () => environment.apiURL },

    // Invite API base URL
    { provide: INVITE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Messages API base URL
    { provide: MESSAGES_API_BASE_URL, useFactory: () => environment.apiURL },

    // Usage/Billing API base URL
    { provide: USAGE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Help Center API adapter — root-level so shared HelpCenterService resolves it
    { provide: HELP_CENTER_API, useExisting: HelpCenterApiService },

    // ============================================
    // LOGGING & ERROR HANDLING
    // ============================================

    // Logging configuration (optional - defaults are sensible)
    {
      provide: LOGGING_CONFIG,
      useValue: {
        appVersion: environment.version || '1.0.0',
        environment: environment.production ? 'production' : 'development',
        remoteEndpoint: environment.production ? environment.loggingEndpoint : undefined,
      },
    },

    // Provide shared logging service to GlobalErrorHandler
    { provide: GLOBAL_ERROR_LOGGER, useExisting: NxtLoggingService },

    // Provide Crashlytics service for crash reporting (web uses GA4 fallback)
    { provide: GLOBAL_CRASHLYTICS, useExisting: CrashlyticsService },

    // Provide analytics adapter for shared services (@nxt1/ui)
    { provide: ANALYTICS_ADAPTER, useExisting: AnalyticsService },

    // Provide settings persistence adapter (web: HTTP → backend API)
    { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService },

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
