/**
 * @fileoverview Mobile App Configuration
 * @module @nxt1/mobile
 *
 * Main application configuration for mobile app.
 * Uses shared infrastructure from @nxt1/ui for consistency with web.
 */

import {
  ApplicationConfig,
  provideZoneChangeDetection,
  ErrorHandler,
  APP_INITIALIZER,
} from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { provideRouter, withComponentInputBinding, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular/standalone';
import { iosTransitionAnimation } from '@ionic/core';

// Firebase
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import {
  provideAuth,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  Auth,
} from '@angular/fire/auth';
import { provideFunctions, getFunctions } from '@angular/fire/functions';
import {
  provideFirestore,
  getFirestore,
  Firestore,
  collection,
  query,
  orderBy as firestoreOrderBy,
  onSnapshot as firestoreOnSnapshot,
} from '@angular/fire/firestore';
import { Capacitor } from '@capacitor/core';

// Shared Angular infrastructure from @nxt1/ui
import {
  GlobalErrorHandler,
  GLOBAL_ERROR_LOGGER,
  GLOBAL_CRASHLYTICS,
  ANALYTICS_ADAPTER,
  httpErrorInterceptor,
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
  FIRESTORE_ADAPTER,
  ACTIVITY_API_BASE_URL,
  ACTIVITY_API_ADAPTER,
  INVITE_API_BASE_URL,
  MESSAGES_API_BASE_URL,
  USAGE_API_BASE_URL,
  PERFORMANCE_ADAPTER,
  INTEL_API_BASE_URL,
} from '@nxt1/ui';
// Mobile-specific Activity API adapter (uses CapacitorHttpAdapter + auth)
// Settings persistence adapter (connects SettingsService → backend API)
// Email connection service (OAuth connect flow for linked accounts in settings)
// Edit Profile API configuration
import { EditProfileService } from '@nxt1/ui/edit-profile';
import {
  ActivityApiService as MobileActivityApiService,
  SettingsApiService,
  MobileEmailConnectionService,
  EditProfileApiService,
  CrashlyticsService,
  AnalyticsService,
  PerformanceService,
  ShareService,
} from './core/services';

import { mobileAuthInterceptor } from './core/infrastructure/interceptors/auth.interceptor';
import { NxtLoggingService, LOGGING_CONFIG } from '@nxt1/ui';

import { SETTINGS_PERSISTENCE_ADAPTER, APP_VERSION } from '@nxt1/ui/settings';
import { CONNECTED_ACCOUNTS_OAUTH_HANDLER } from '@nxt1/ui/components/connected-sources';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

/**
 * Configure Edit Profile API for mobile platform
 */
function configureEditProfileApi(
  editProfileService: EditProfileService,
  apiService: EditProfileApiService
): () => void {
  return () => {
    editProfileService.setApiService({
      getProfile: (userId, sportIndex) => apiService.getProfile(userId, sportIndex),
      updateSection: (userId, sectionId, data, sportIndex) =>
        apiService.updateSection(userId, sectionId, data, sportIndex),
      updateActiveSportIndex: (userId, activeSportIndex) =>
        apiService.updateActiveSportIndex(userId, activeSportIndex),
      uploadPhoto: (userId: string, file: File | Blob) => apiService.uploadPhoto(userId, file),
    });
  };
}

/**
 * Get Firebase Auth with proper persistence for the platform.
 * iOS WebView has issues with IndexedDB use browserLocalPersistence.
 */
function getAuthWithPersistence() {
  const app = initializeApp(environment.firebase);

  if (Capacitor.isNativePlatform()) {
    // Use indexedDB persistence on native - it works better than the default
    return initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
    });
  }

  return getAuth(app);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),

    // Explicit base href for Capacitor and Vite dev server compatibility
    { provide: APP_BASE_HREF, useValue: '/' },

    provideRouter(routes, withComponentInputBinding()),

    // HTTP client with error handling
    provideHttpClient(
      withFetch(),
      withInterceptors([
        // Auth interceptor — adds Firebase ID token to HttpClient requests
        // Required for shared @nxt1/ui services (e.g. AgentXJobService)
        mobileAuthInterceptor,
        // Global HTTP error handling (shared with web)
        httpErrorInterceptor({
          redirectOnUnauthorized: true,
          unauthorizedRedirectPath: '/auth',
          // Skip 401 redirect for fire-and-forget background requests
          skipPatterns: [/\/agent-x\//],
        }),
      ])
    ),

    provideAnimations(),

    // Ionic Configuration
    // - iOS mode for consistent horizontal slide animations across all platforms
    // - Dark mode controlled via NXT1 design tokens
    // - swipeBackEnabled: false = disable iOS back gesture (use sidenav instead)
    // - gestureEnablers: use custom swipe handling in shell component
    provideIonicAngular({
      mode: 'ios', // iOS mode = horizontal slide animations (like Instagram/TikTok)
      navAnimation: iosTransitionAnimation, // Eagerly provide transition to avoid Vite dynamic import failure
      innerHTMLTemplatesEnabled: true,
      swipeBackEnabled: false, // Disable iOS back gesture - we use sidenav instead (Twitter/X pattern)
      useSetInputAPI: true, // Required for Angular signal-based inputs (input()) to work with componentProps in modals
      scrollAssist: true, // Auto-scroll focused inputs into view when keyboard opens
      scrollPadding: true, // Add padding to content when keyboard opens to prevent overlap
    }),

    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    // Firebase - use custom auth initialization for native platforms
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuthWithPersistence()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => {
      const functions = getFunctions();
      // Connect to emulator in development if needed
      // if (!environment.production) {
      //   connectFunctionsEmulator(functions, 'localhost', 5001);
      // }
      return functions;
    }),

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

    // Provide Crashlytics service for crash reporting
    { provide: GLOBAL_CRASHLYTICS, useExisting: CrashlyticsService },

    // Global error handler (shared with web)
    { provide: ErrorHandler, useClass: GlobalErrorHandler },

    // Analytics adapter (used by @nxt1/ui shared services)
    { provide: ANALYTICS_ADAPTER, useExisting: AnalyticsService },

    // Performance adapter (used by @nxt1/ui shared services like ActivityService)
    { provide: PERFORMANCE_ADAPTER, useExisting: PerformanceService },

    // Agent X API base URL
    { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Agent X Auth Token Factory (for SSE uploads and fallback requests)
    {
      provide: AGENT_X_AUTH_TOKEN_FACTORY,
      useFactory: (auth: Auth) => () => auth.currentUser?.getIdToken() ?? Promise.resolve(null),
      deps: [Auth],
    },

    // Agent X live background operation events (onSnapshot adapter)
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

    // Activity API base URL
    { provide: ACTIVITY_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Activity API adapter — use the mobile Capacitor adapter (auth headers, native SSL)
    { provide: ACTIVITY_API_ADAPTER, useExisting: MobileActivityApiService },

    // Invite API base URL
    { provide: INVITE_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Messages API base URL
    { provide: MESSAGES_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Usage API base URL
    { provide: USAGE_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Intel API base URL
    { provide: INTEL_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Settings persistence adapter (connects SettingsService → backend API)
    { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService },

    // App version — drives the version string shown in Settings footer
    { provide: APP_VERSION, useFactory: () => environment.appVersion },

    // OAuth handler for Connected Accounts sheet (settings context)
    // Launches Google/Microsoft account picker and saves tokens to emailTokens subcollection.
    // Does NOT sign the user in — pure token acquisition via system browser.
    {
      provide: CONNECTED_ACCOUNTS_OAUTH_HANDLER,
      useFactory:
        (emailSvc: MobileEmailConnectionService, auth: Auth) =>
        (platform: 'google' | 'microsoft') => {
          const uid = auth.currentUser?.uid;
          if (!uid) return Promise.resolve(false);
          return emailSvc.connectForLinkedAccounts(platform, uid);
        },
      deps: [MobileEmailConnectionService, Auth],
    },

    // ============================================
    // EDIT PROFILE API CONFIGURATION
    // ============================================

    // Configure Edit Profile API on app initialization
    {
      provide: APP_INITIALIZER,
      useFactory: configureEditProfileApi,
      deps: [EditProfileService, EditProfileApiService],
      multi: true,
    },
  ],
};
