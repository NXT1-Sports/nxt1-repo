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
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { APP_BASE_HREF, IMAGE_CONFIG } from '@angular/common';
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
  getDocs as firestoreGetDocs,
  getDoc as firestoreGetDoc,
  doc as firestoreDoc,
  limit as firestoreLimit,
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
  USAGE_API_BASE_URL,
  PERFORMANCE_ADAPTER,
  INTEL_API_BASE_URL,
  HELP_CENTER_API,
  TEAM_PROFILE_API_BASE_URL,
  NXT_USE_IONIC_TOASTS,
} from '@nxt1/ui';
import { FEED_ENGAGEMENT } from '@nxt1/ui/feed';
import { MANAGE_TEAM_API_BASE_URL, TEAM_LOGO_UPLOADER } from '@nxt1/ui/manage-team';
// Mobile-specific Activity API adapter (uses CapacitorHttpAdapter + auth)
// Settings persistence adapter (connects SettingsService → backend API)
// Email connection service (OAuth connect flow for linked accounts in settings)
// Edit Profile API configuration
import { EditProfileService } from '@nxt1/ui/edit-profile';
import {
  ActivityApiService as MobileActivityApiService,
  HelpCenterApiService,
  SettingsApiService,
  MobileEmailConnectionService,
  EditProfileApiService,
  FeedEngagementApiService,
  CrashlyticsService,
  AnalyticsService,
  PerformanceService,
} from './core/services';

import { mobileAuthInterceptor } from './core/infrastructure/interceptors/auth.interceptor';
import { NxtLoggingService, LOGGING_CONFIG } from '@nxt1/ui';

import { SETTINGS_PERSISTENCE_ADAPTER, APP_VERSION } from '@nxt1/ui/settings';
import {
  CONNECTED_ACCOUNTS_OAUTH_HANDLER,
  CONNECTED_ACCOUNTS_FIREBASE_USER,
} from '@nxt1/ui/components/connected-sources';
import { BROWSER_TRACKING_BASE_URL } from '@nxt1/ui/services/browser';

import { routes } from './app.routes';
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

    // NgOptimizedImage configuration for Capacitor.
    // Disables responsive srcset generation since Capacitor serves local assets
    // from capacitor://localhost/ where width-variant URLs don't exist.
    // The built-in noop loader (default) is kept — no custom loader override needed.
    {
      provide: IMAGE_CONFIG,
      useValue: { disableImageSizeWarning: true, disableOptimizedSrcset: true },
    },

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

    // Mobile app uses Ionic overlays for every shared NxtToastService call.
    { provide: NXT_USE_IONIC_TOASTS, useValue: true },

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

    // Browser tracking base URL — native link opens can safely route through the backend.
    { provide: BROWSER_TRACKING_BASE_URL, useFactory: () => environment.apiUrl },

    // Team Profile API base URL (team/timeline endpoints)
    { provide: TEAM_PROFILE_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Manage Team API base URL (editing team data)
    { provide: MANAGE_TEAM_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Agent X Auth Token Factory (for SSE uploads and fallback requests)
    {
      provide: AGENT_X_AUTH_TOKEN_FACTORY,
      useFactory: (auth: Auth) => () => auth.currentUser?.getIdToken() ?? Promise.resolve(null),
      deps: [Auth],
    },

    // Agent X live background operation events (onSnapshot adapter)
    // Wrap Firebase modular calls in runInInjectionContext to keep them associated
    // with the AngularFire injector even when invoked from outside Angular's
    // injection context (rehydrate paths, async tails, sheet reopen flows).
    {
      provide: FIRESTORE_ADAPTER,
      useFactory: (firestore: Firestore, injector: EnvironmentInjector) => ({
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
          return runInInjectionContext(injector, () => {
            const ref = collection(firestore, path);
            const boundedLimit =
              options?.limit === undefined
                ? null
                : Math.max(1, Math.min(100, Math.floor(options.limit)));
            const q =
              boundedLimit !== null
                ? query(
                    ref,
                    firestoreOrderBy(orderByField, options?.direction ?? 'asc'),
                    firestoreLimit(boundedLimit)
                  )
                : query(ref, firestoreOrderBy(orderByField, options?.direction ?? 'asc'));
            return firestoreOnSnapshot(
              q,
              (snap) => {
                onNext(snap.docs.map((d) => normalizeFirestoreSnapshotDoc(d.id, d.data())));
              },
              onError
            );
          });
        },
        getDocs: async (
          path: string,
          orderByField: string,
          options?: { readonly direction?: 'asc' | 'desc'; readonly limit?: number }
        ): Promise<ReadonlyArray<Record<string, unknown>>> => {
          if (!isSupportedFirestoreCollectionPath(path)) {
            throw new Error(`Unsupported Firestore query path: ${path}`);
          }
          return runInInjectionContext(injector, async () => {
            const ref = collection(firestore, path);
            const boundedLimit =
              options?.limit === undefined
                ? null
                : Math.max(1, Math.min(100, Math.floor(options.limit)));
            const q =
              boundedLimit !== null
                ? query(
                    ref,
                    firestoreOrderBy(orderByField, options?.direction ?? 'asc'),
                    firestoreLimit(boundedLimit)
                  )
                : query(ref, firestoreOrderBy(orderByField, options?.direction ?? 'asc'));
            const snap = await firestoreGetDocs(q);
            return snap.docs.map((d) => normalizeFirestoreSnapshotDoc(d.id, d.data()));
          });
        },
        getDoc: async (path: string): Promise<Record<string, unknown> | null> => {
          if (!isSupportedFirestoreDocumentPath(path)) {
            throw new Error(`Unsupported Firestore document path: ${path}`);
          }
          return runInInjectionContext(injector, async () => {
            const ref = firestoreDoc(firestore, path);
            const snap = await firestoreGetDoc(ref);
            return snap.exists() ? normalizeFirestoreSnapshotDoc(snap.id, snap.data()) : null;
          });
        },
      }),
      deps: [Firestore, EnvironmentInjector],
    },

    // Activity API base URL
    { provide: ACTIVITY_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Activity API adapter — use the mobile Capacitor adapter (auth headers, native SSL)
    { provide: ACTIVITY_API_ADAPTER, useExisting: MobileActivityApiService },

    // Invite API base URL
    { provide: INVITE_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Usage API base URL
    { provide: USAGE_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Intel API base URL
    { provide: INTEL_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Help Center API adapter
    { provide: HELP_CENTER_API, useExisting: HelpCenterApiService },

    // Feed engagement adapter — powers share tap + scroll-view impressions on feed card shell
    { provide: FEED_ENGAGEMENT, useExisting: FeedEngagementApiService },

    // Team logo uploader — bridges TEAM_LOGO_UPLOADER token → EditProfileApiService
    {
      provide: TEAM_LOGO_UPLOADER,
      useFactory:
        (editProfileApi: EditProfileApiService, auth: Auth) => (teamId: string, file: File) => {
          const userId = auth.currentUser?.uid;
          if (!userId) return Promise.resolve(null);
          return editProfileApi.uploadTeamLogo(userId, teamId, file);
        },
      deps: [EditProfileApiService, Auth],
    },

    // Settings persistence adapter (connects SettingsService → backend API)
    { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService },

    // App version — drives the version string shown in Settings footer
    { provide: APP_VERSION, useFactory: () => environment.appVersion },

    // Firebase provider data for Connected Accounts sheet — enables email display for
    // already-connected Google / Microsoft accounts without a new OAuth flow.
    {
      provide: CONNECTED_ACCOUNTS_FIREBASE_USER,
      useFactory: (auth: Auth) => () => {
        const user = auth.currentUser;
        if (!user) return [];
        // Only use the email from providerData itself — do NOT fall back to user.email
        // for Microsoft because user.email is the primary sign-in email (e.g. Google)
        // and would incorrectly override the real Microsoft email stored in connectedEmails.
        return user.providerData.map((p) => ({
          providerId: p.providerId,
          email: p.email ?? null,
          displayName: p.displayName,
        }));
      },
      deps: [Auth],
    },

    // OAuth handler for Connected Accounts sheet (settings context)
    // Launches Google/Microsoft account picker and saves tokens to oauthTokens subcollection.
    // Does NOT sign the user in — pure token acquisition via system browser.
    {
      provide: CONNECTED_ACCOUNTS_OAUTH_HANDLER,
      useFactory:
        (emailSvc: MobileEmailConnectionService, auth: Auth) =>
        (platform: 'google' | 'microsoft') => {
          const uid = auth.currentUser?.uid;
          if (!uid) return Promise.resolve({ success: false });
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
