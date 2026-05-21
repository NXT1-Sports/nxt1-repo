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
  inject,
  NgZone,
  APP_INITIALIZER,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
  PreloadingStrategy,
  Route,
  Router,
} from '@angular/router';
import { EMPTY, Observable } from 'rxjs';
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
} from '@nxt1/ui/infrastructure/error-handling';
import {
  httpErrorInterceptor,
  HTTP_ERROR_INTERCEPTOR_FIREBASE_AUTH,
} from '@nxt1/ui/infrastructure/interceptors';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtLoggingService, LOGGING_CONFIG } from '@nxt1/ui/services/logging';
import { PERFORMANCE_ADAPTER } from '@nxt1/ui/services/performance';

// Core infrastructure (app-specific)
import { httpCacheInterceptor, authInterceptor } from './core/infrastructure';
import { httpPerformanceInterceptor } from './core/infrastructure/performance-interceptor';

import { AnalyticsService } from './core/services/infrastructure/analytics.service';
import { PerformanceService } from './core/services/infrastructure/performance.service';

import { TEAM_PROFILE_API_BASE_URL } from '@nxt1/ui/team-profile/tokens';
import { INTEL_API_BASE_URL } from '@nxt1/ui/intel/tokens';
import { MANAGE_TEAM_API_BASE_URL, TEAM_LOGO_UPLOADER } from '@nxt1/ui/manage-team/tokens';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  FIRESTORE_ADAPTER,
} from '@nxt1/ui/agent-x/tokens';
import {
  CONNECTED_ACCOUNTS_FIREBASE_USER,
  CONNECTED_ACCOUNTS_OAUTH_HANDLER,
} from '@nxt1/ui/components/connected-sources/tokens';
import {
  ACTIVITY_API_BASE_URL,
  ACTIVITY_API_ADAPTER,
  ACTIVITY_FIREBASE_CONTEXT,
} from '@nxt1/ui/activity/tokens';
import { INVITE_API_BASE_URL } from '@nxt1/ui/invite/tokens';
import { USAGE_API_BASE_URL, STRIPE_PUBLISHABLE_KEY } from '@nxt1/ui/usage/tokens';
import { BROWSER_TRACKING_BASE_URL } from '@nxt1/ui/services/browser';

// Help Center API adapter — wired at root so the shared HelpCenterService
// (providedIn: 'root') can resolve the token when it's first injected.
import { HELP_CENTER_API } from '@nxt1/ui/help-center/tokens';
import { HelpCenterApiService } from './core/services/api/help-center-api.service';
// Feed engagement adapter — provides share + view impression tracking to FeedCardShellComponent
import { FEED_ENGAGEMENT } from '@nxt1/ui/feed/tokens';
import { FeedEngagementWebService } from './core/services/web/feed-engagement.service';
import { ActivityApiService as WebActivityApiService } from './core/services/api/activity-api.service';

// Firebase
// IMPORTANT: Only import what's actually used in browser bundle
// - FirebaseApp: Required for Firebase initialization
// - Auth: Required for authentication (BrowserAuthService uses it)
// - Firestore: Lazy-loaded for Agent X live operation events
// - Storage: NOT imported - file uploads go through backend API (security)
// - Analytics/Performance: Lazy-loaded after LCP (see AppComponent)
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth, Auth } from '@angular/fire/auth';
import { providePerformance, getPerformance } from '@angular/fire/performance';

// Auth service with injection token pattern
import { AUTH_SERVICE, BrowserAuthService } from './core/services/auth';
import { AuthFlowService, type IAuthService } from './core/services/auth';
import { FileUploadService } from './core/services/web/file-upload.service';
import { WebEmailConnectionService } from './core/services/web/email-connection.service';
import { provideBadgeBridge } from './core/services';

// Settings persistence adapter (connects SettingsService → backend API)
import { SETTINGS_PERSISTENCE_ADAPTER, APP_VERSION } from '@nxt1/ui/settings/tokens';
import { SettingsApiService } from './core/services/api/settings-api.service';

// Provider for Sentry
import { SentryCrashlyticsAdapter } from './core/infrastructure/sentry-crashlytics.adapter';

// Helps with tracking initial load / routing performance
import * as Sentry from '@sentry/angular';

import { environment } from '../environments/environment';

function normalizeFirestoreSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFirestoreSnapshotValue(entry));
  }

  if (value && typeof value === 'object') {
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        normalizeFirestoreSnapshotValue(entry),
      ])
    );
  }

  return value;
}

function normalizeFirestoreSnapshotDoc(id: string, value: unknown): Record<string, unknown> {
  const data = normalizeFirestoreSnapshotValue(value) as Record<string, unknown>;
  return {
    ...data,
    id: typeof data['id'] === 'string' ? data['id'] : id,
    __id: id,
  };
}

function isSupportedFirestoreCollectionPath(path: string): boolean {
  return /^(AgentJobs\/[^/]+\/events|Users\/[^/]+\/activity)$/.test(path);
}

function isSupportedFirestoreDocumentPath(path: string): boolean {
  return /^AgentJobs\/[^/]+$/.test(path);
}

let firestoreRuntimePromise: Promise<
  typeof import('firebase/app') & typeof import('firebase/firestore')
> | null = null;

function loadFirestoreRuntime() {
  if (!firestoreRuntimePromise) {
    firestoreRuntimePromise = Promise.all([
      import('firebase/app'),
      import('firebase/firestore'),
    ]).then(([firebaseApp, firestore]) => ({
      ...firebaseApp,
      ...firestore,
    }));
  }

  return firestoreRuntimePromise;
}

/**
 * Custom preloading strategy that waits until the browser is idle
 * before preloading lazy routes. This prevents chunk loading from
 * competing with LCP-critical rendering during the initial load.
 *
 * On browsers without requestIdleCallback, falls back to a 3-second delay.
 */
@Injectable({ providedIn: 'root' })
class IdlePreloadStrategy implements PreloadingStrategy {
  private readonly ngZone = inject(NgZone);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.data?.['preload'] !== true) {
      return EMPTY;
    }

    // Schedule the delay OUTSIDE NgZone so Zone.js does not track the
    // setTimeout/requestIdleCallback as a pending macrotask. Without this
    // the app can never stabilize during the delay window.
    return new Observable((subscriber) => {
      this.ngZone.runOutsideAngular(() => {
        const callback = () => {
          // Re-enter NgZone for the actual chunk load so Angular
          // change detection picks up the new module correctly.
          this.ngZone.run(() => load().subscribe(subscriber));
        };

        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(callback, { timeout: 5000 });
        } else {
          setTimeout(callback, 3000);
        }
      });

      return undefined;
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
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      // Idle-based preloading: defer chunk loading until browser is idle
      // Prevents preloaded JS from competing with LCP-critical rendering
      withPreloading(IdlePreloadStrategy)
    ),

    // Ionic providers are required on browser for ModalController-based services
    // used across app-shell features (activity/settings/usage/agent-x helpers).
    provideIonicAngular({
      mode: 'md',
      useSetInputAPI: true,
    }),

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
    // FIREBASE
    // ============================================

    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    // Provide Firebase Auth instance to the HTTP error interceptor so it can
    // attempt a token force-refresh on 401 before redirecting to /auth.
    {
      provide: HTTP_ERROR_INTERCEPTOR_FIREBASE_AUTH,
      useFactory: (auth: Auth) => auth,
      deps: [Auth],
    },
    providePerformance(() => getPerformance()),
    // NOTE: Storage is NOT provided in browser bundle —
    // file uploads go through backend API for security

    // Firestore adapter for Agent X live operation events (lazy runtime import)
    // Avoids pulling Firestore into the shared public-route startup bundle.
    {
      provide: FIRESTORE_ADAPTER,
      useFactory: (ngZone: NgZone) => ({
        onSnapshot: (
          path: string,
          orderByField: string,
          onNext: (docs: ReadonlyArray<Record<string, unknown>>) => void,
          onError: (error: Error) => void,
          options?: { readonly direction?: 'asc' | 'desc'; readonly limit?: number }
        ) => {
          if (!isSupportedFirestoreCollectionPath(path)) {
            throw new Error(`Unsupported Firestore subscription path: ${path}`);
          }

          let unsubscribe = () => {
            // intentionally empty
          };
          let disposed = false;

          void loadFirestoreRuntime()
            .then(({ getApp, getFirestore, collection, query, orderBy, limit, onSnapshot }) => {
              const firestore = getFirestore(getApp());
              const ref = collection(firestore, path);
              const boundedLimit =
                options?.limit === undefined
                  ? null
                  : Math.max(1, Math.min(100, Math.floor(options.limit)));
              const snapshotQuery =
                boundedLimit !== null
                  ? query(
                      ref,
                      orderBy(orderByField, options?.direction ?? 'asc'),
                      limit(boundedLimit)
                    )
                  : query(ref, orderBy(orderByField, options?.direction ?? 'asc'));
              const release = onSnapshot(
                snapshotQuery,
                (snap) => {
                  const docs = snap.docs.map((doc) =>
                    normalizeFirestoreSnapshotDoc(doc.id, doc.data())
                  );
                  ngZone.run(() => onNext(docs));
                },
                (error) => {
                  ngZone.run(() => onError(error));
                }
              );

              if (disposed) {
                release();
                return;
              }

              unsubscribe = release;
            })
            .catch((error: unknown) => {
              const firestoreError =
                error instanceof Error ? error : new Error('Failed to load Firestore runtime');
              ngZone.run(() => onError(firestoreError));
            });

          return () => {
            disposed = true;
            unsubscribe();
          };
        },
        getDocs: async (
          path: string,
          orderByField: string,
          options?: { readonly direction?: 'asc' | 'desc'; readonly limit?: number }
        ): Promise<ReadonlyArray<Record<string, unknown>>> => {
          if (!isSupportedFirestoreCollectionPath(path)) {
            throw new Error(`Unsupported Firestore query path: ${path}`);
          }

          const { getApp, getFirestore, collection, query, orderBy, limit, getDocs } =
            await loadFirestoreRuntime();
          const firestore = getFirestore(getApp());
          const ref = collection(firestore, path);
          const boundedLimit =
            options?.limit === undefined
              ? null
              : Math.max(1, Math.min(100, Math.floor(options.limit)));
          const snapshotQuery =
            boundedLimit !== null
              ? query(ref, orderBy(orderByField, options?.direction ?? 'asc'), limit(boundedLimit))
              : query(ref, orderBy(orderByField, options?.direction ?? 'asc'));
          const snap = await getDocs(snapshotQuery);
          return snap.docs.map((doc) => normalizeFirestoreSnapshotDoc(doc.id, doc.data()));
        },
        getDoc: async (path: string): Promise<Record<string, unknown> | null> => {
          if (!isSupportedFirestoreDocumentPath(path)) {
            throw new Error(`Unsupported Firestore document path: ${path}`);
          }

          const { getApp, getFirestore, doc, getDoc } = await loadFirestoreRuntime();
          const firestore = getFirestore(getApp());
          const snap = await getDoc(doc(firestore, path));
          return snap.exists() ? normalizeFirestoreSnapshotDoc(snap.id, snap.data()) : null;
        },
      }),
      deps: [NgZone],
    },

    // ============================================
    // AUTH SERVICE (Injection Token Pattern)
    // ============================================

    // Provide BrowserAuthService for AUTH_SERVICE token
    // Server uses ServerAuthService instead (see app.config.server.ts)
    { provide: AUTH_SERVICE, useClass: BrowserAuthService },

    // Team Profile API base URL
    { provide: TEAM_PROFILE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Intel API base URL
    { provide: INTEL_API_BASE_URL, useFactory: () => environment.apiURL },

    // Manage Team API base URL
    { provide: MANAGE_TEAM_API_BASE_URL, useFactory: () => environment.apiURL },

    // Team logo uploader — bridges TEAM_LOGO_UPLOADER token → FileUploadService
    {
      provide: TEAM_LOGO_UPLOADER,
      useFactory:
        (upload: FileUploadService, auth: IAuthService) => (teamId: string, file: File) => {
          const userId = auth.user?.()?.uid;
          if (!userId) return Promise.resolve(null);
          return upload.uploadTeamLogo(userId, teamId, file);
        },
      deps: [FileUploadService, AUTH_SERVICE],
    },

    // Agent X API base URL
    { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiURL },

    // Browser tracking base URL — markdown/download links should route through the backend,
    // not the current Angular origin.
    { provide: BROWSER_TRACKING_BASE_URL, useFactory: () => environment.apiURL },

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
      useFactory: (auth: IAuthService) => () => {
        const fbUser = auth.firebaseUser();
        if (!fbUser) return [];
        // Only use the email from providerData itself — do NOT fall back to fbUser.email
        // for Microsoft because fbUser.email is the primary sign-in email (e.g. Google)
        // and would incorrectly override the real Microsoft email stored in connectedEmails.
        return fbUser.providerData.map((p) => ({
          providerId: p.providerId,
          email: p.email ?? null,
          displayName: p.displayName,
        }));
      },
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
          if (!userId) return Promise.resolve({ success: false });
          return emailSvc.connectForLinkedAccounts(platform, userId);
        },
      deps: [WebEmailConnectionService, AUTH_SERVICE],
    },

    // Activity API base URL
    { provide: ACTIVITY_API_BASE_URL, useFactory: () => environment.apiURL },

    // Activity API adapter — use the web-specific service with performance tracing
    { provide: ACTIVITY_API_ADAPTER, useExisting: WebActivityApiService },

    // Activity realtime diagnostics context (auth/project visibility in permission errors)
    {
      provide: ACTIVITY_FIREBASE_CONTEXT,
      useFactory: (auth: Auth) => ({
        getCurrentUserId: () => auth.currentUser?.uid ?? null,
        getProjectId: () => auth.app.options.projectId ?? null,
        isAuthReady: () => auth.currentUser !== null,
      }),
      deps: [Auth],
    },

    // Bridge @nxt1/ui ActivityService unread counts into shell badge state.
    provideBadgeBridge(),

    // Invite API base URL
    { provide: INVITE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Usage/Billing API base URL
    { provide: USAGE_API_BASE_URL, useFactory: () => environment.apiURL },

    // Stripe publishable key — env-specific (test for staging, live for production)
    { provide: STRIPE_PUBLISHABLE_KEY, useFactory: () => environment.stripePublishableKey },

    // Help Center API adapter — root-level so shared HelpCenterService resolves it
    { provide: HELP_CENTER_API, useExisting: HelpCenterApiService },

    // Feed engagement adapter — powers share tap + scroll-view impressions on feed card shell
    { provide: FEED_ENGAGEMENT, useExisting: FeedEngagementWebService },

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
      useFactory: () => () => {
        // intentionally empty
      },
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
