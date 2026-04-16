/**
 * @fileoverview App Configuration - Browser (Client-Side)
 * @module @nxt1/web
 *
 * Production application configuration following 2026 Angular + Firebase best practices.
 *
 * Key Features:
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
  APP_INITIALIZER,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
  withInMemoryScrolling,
  withPreloading,
  PreloadingStrategy,
  Route,
  Router,
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
  HTTP_ERROR_INTERCEPTOR_FIREBASE_AUTH,
} from '@nxt1/ui/infrastructure';
import {
  ANALYTICS_ADAPTER,
  NxtLoggingService,
  LOGGING_CONFIG,
  PERFORMANCE_ADAPTER,
} from '@nxt1/ui/services';

// Core infrastructure (app-specific)
import { httpCacheInterceptor, authInterceptor } from './core/infrastructure';
import { httpPerformanceInterceptor } from './core/infrastructure/performance-interceptor';

import { AnalyticsService } from './core/services';
import { PerformanceService } from './core/services';
import { ShareService } from './core/services';

// Badge bridge: connects ActivityService (from @nxt1/ui) → BadgeCountService
import { provideBadgeBridge } from './core/services';

// Web push notifications: FCM token management + foreground message handling
import { provideWebPush } from './core/services';

import { TEAM_PROFILE_API_BASE_URL } from '@nxt1/ui/team-profile';
import { INTEL_API_BASE_URL } from '@nxt1/ui/intel';
import { MANAGE_TEAM_API_BASE_URL } from '@nxt1/ui/manage-team';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  FIRESTORE_ADAPTER,
} from '@nxt1/ui/agent-x';
import {
  CONNECTED_ACCOUNTS_FIREBASE_USER,
  CONNECTED_ACCOUNTS_OAUTH_HANDLER,
} from '@nxt1/ui/components/connected-sources';
import { ACTIVITY_API_BASE_URL, ACTIVITY_API_ADAPTER } from '@nxt1/ui/activity';
import { INVITE_API_BASE_URL } from '@nxt1/ui/invite';
import { MESSAGES_API_BASE_URL } from '@nxt1/ui/messages';
import { USAGE_API_BASE_URL, STRIPE_PUBLISHABLE_KEY } from '@nxt1/ui/usage';

// Help Center API adapter — wired at root so the shared HelpCenterService
// (providedIn: 'root') can resolve the token when it's first injected.
import { HELP_CENTER_API } from '@nxt1/ui/help-center';
import { HelpCenterApiService } from './core/services/api/help-center-api.service';
import { ActivityApiService as WebActivityApiService } from './core/services/api/activity-api.service';

// Firebase
// IMPORTANT: Only import what's actually used in browser bundle
// - FirebaseApp: Required for Firebase initialization
// - Auth: Required for authentication (BrowserAuthService uses it)
// - Firestore: Required for Agent X live operation events (onSnapshot)
// - Storage: NOT imported - file uploads go through backend API (security)
// - Analytics/Performance: Lazy-loaded after LCP (see AppComponent)
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { providePerformance, getPerformance } from '@angular/fire/performance';
import {
  provideFirestore,
  getFirestore,
  Firestore,
  collection,
  query,
  orderBy as firestoreOrderBy,
  onSnapshot as firestoreOnSnapshot,
} from '@angular/fire/firestore';

// Auth service with injection token pattern
import { AUTH_SERVICE, BrowserAuthService } from './core/services/auth';
import { AuthFlowService, type IAuthService } from './core/services/auth';
import { WebEmailConnectionService } from './core/services/web/email-connection.service';

// Settings persistence adapter (connects SettingsService → backend API)
import { SETTINGS_PERSISTENCE_ADAPTER, APP_VERSION } from '@nxt1/ui/settings';
import { SettingsApiService } from './core/services/api/settings-api.service';

// Provider for Sentry
import { SentryCrashlyticsAdapter } from './core/infrastructure/sentry-crashlytics.adapter';

// Helps with tracking initial load / routing performance
import * as Sentry from '@sentry/angular';

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
          skipPatterns: [/\/agent-x\//, /\/activity\/badges/, /\/activity\/summary/],
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

      // Incremental hydration — only hydrate @defer blocks on demand on the client.
      // Safe in production (no HMR), dev is CSR-only (ssr: false in angular.json).
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
      useSetInputAPI: true, // Required for Angular signal input() fields in Ionic modals/sheets
    }),

    // ============================================
    // FIREBASE
    // ============================================

    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    // Provide Firebase Auth instance to the HTTP error interceptor so it can
    // attempt a token force-refresh on 401 before redirecting to /auth.
    { provide: HTTP_ERROR_INTERCEPTOR_FIREBASE_AUTH, useFactory: () => getAuth() },
    providePerformance(() => getPerformance()),
    provideFirestore(() => getFirestore()),
    // NOTE: Storage is NOT provided in browser bundle —
    // file uploads go through backend API for security

    // Firestore adapter for Agent X live operation events (onSnapshot)
    {
      provide: FIRESTORE_ADAPTER,
      useFactory: (firestore: Firestore) => ({
        onSnapshot: (
          path: string,
          orderByField: string,
          onNext: (docs: ReadonlyArray<Record<string, unknown>>) => void,
          onError: (error: Error) => void
        ) => {
          const ref = collection(firestore, path);
          const q = query(ref, firestoreOrderBy(orderByField));
          return firestoreOnSnapshot(
            q,
            (snap) => {
              onNext(snap.docs.map((d) => d.data()));
            },
            onError
          );
        },
      }),
      deps: [Firestore],
    },

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

    // Team Profile API base URL
    { provide: TEAM_PROFILE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Intel API base URL
    { provide: INTEL_API_BASE_URL, useFactory: () => environment.apiURL },

    // Manage Team API base URL
    { provide: MANAGE_TEAM_API_BASE_URL, useFactory: () => environment.apiURL },

    // Agent X API base URL
    { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiURL },

    // Agent X SSE auth token factory — provides a Firebase ID token for the
    // raw fetch() SSE connection (bypasses the Angular authInterceptor).
    // Uses AuthFlowService.getIdToken() for cache-first token resolution,
    // the same strategy as the auth interceptor to avoid race conditions.
    {
      provide: AGENT_X_AUTH_TOKEN_FACTORY,
      useFactory: (authFlow: AuthFlowService) => () => authFlow.getIdToken(),
      deps: [AuthFlowService],
    },

    // Connected Accounts OAuth state — provides Firebase providerData so the
    // modal service can auto-mark Google / Microsoft as connected when the user
    // is signed in with those providers (without every call-site doing it manually).
    {
      provide: CONNECTED_ACCOUNTS_FIREBASE_USER,
      useFactory: (auth: IAuthService) => () => auth.firebaseUser()?.providerData ?? [],
      deps: [AUTH_SERVICE],
    },

    // Connected Accounts OAuth handler — launches the real Google / Microsoft account-picker
    // popup when the user taps those platforms in the "Signed In" tab from the settings overlay.
    {
      provide: CONNECTED_ACCOUNTS_OAUTH_HANDLER,
      useFactory:
        (emailSvc: WebEmailConnectionService, auth: IAuthService) =>
        (platform: 'google' | 'microsoft') => {
          const userId = (auth as IAuthService).user?.()?.uid;
          if (!userId) return Promise.resolve(false);
          return emailSvc.connectForLinkedAccounts(platform, userId);
        },
      deps: [WebEmailConnectionService, AUTH_SERVICE],
    },

    // Activity API base URL
    { provide: ACTIVITY_API_BASE_URL, useFactory: () => environment.apiURL },

    // Activity API adapter — use the web-specific service with performance tracing
    { provide: ACTIVITY_API_ADAPTER, useExisting: WebActivityApiService },

    // Invite API base URL
    { provide: INVITE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Messages API base URL
    { provide: MESSAGES_API_BASE_URL, useFactory: () => environment.apiURL },

    // Usage/Billing API base URL
    { provide: USAGE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Stripe publishable key — env-specific (test for staging, live for production)
    { provide: STRIPE_PUBLISHABLE_KEY, useFactory: () => environment.stripePublishableKey },

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

    // Provide Sentry service for crash reporting (replaces GA4 fallback)
    { provide: GLOBAL_CRASHLYTICS, useClass: SentryCrashlyticsAdapter },

    // Provide analytics adapter for shared services (@nxt1/ui)
    { provide: ANALYTICS_ADAPTER, useExisting: AnalyticsService },

    {
      provide: Sentry.TraceService,
      deps: [Router],
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => undefined,
      deps: [Sentry.TraceService],
      multi: true,
    },

    // Provide performance adapter for shared services (@nxt1/ui)
    { provide: PERFORMANCE_ADAPTER, useExisting: PerformanceService },

    // Provide settings persistence adapter (web: HTTP → backend API)
    { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService },

    // App version — drives the version string shown in Settings footer
    { provide: APP_VERSION, useFactory: () => environment.appVersion },

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
