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
import { httpErrorInterceptor } from '@nxt1/ui/infrastructure/interceptors';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtLoggingService, LOGGING_CONFIG } from '@nxt1/ui/services/logging';
import { PERFORMANCE_ADAPTER } from '@nxt1/ui/services/performance';
import { AGENT_X_API_BASE_URL } from '@nxt1/ui/agent-x';

// Core infrastructure (app-specific)
import { httpCacheInterceptor } from './core/infrastructure/http/cache.interceptor';
import { authInterceptor } from './core/infrastructure/interceptors/auth.interceptor';
import { httpPerformanceInterceptor } from './core/infrastructure/performance-interceptor';

import { AnalyticsService } from './core/services/infrastructure/analytics.service';
import { PerformanceService } from './core/services/infrastructure/performance.service';
import { provideBrowserAuthProviders } from './core/providers/browser-auth.providers';

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

    // Ionic Framework - must be at root level so ModalController/AngularDelegate
    // are available to all providedIn:'root' services (NxtBottomSheetService etc.)
    provideIonicAngular({
      mode: 'md',
      useSetInputAPI: true,
    }),

    // Firebase Auth must be available from the root injector because
    // AuthFlowService is provided in root and initializes before route
    // providers are visible to its injector.
    provideBrowserAuthProviders(),

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
    { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiURL },

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
