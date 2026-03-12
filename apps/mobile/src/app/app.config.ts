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
} from '@angular/fire/auth';
import { Capacitor } from '@capacitor/core';

// Shared Angular infrastructure from @nxt1/ui
import {
  GlobalErrorHandler,
  GLOBAL_ERROR_LOGGER,
  GLOBAL_CRASHLYTICS,
  ANALYTICS_ADAPTER,
  httpErrorInterceptor,
  AGENT_X_API_BASE_URL,
  ACTIVITY_API_BASE_URL,
  INVITE_API_BASE_URL,
  MESSAGES_API_BASE_URL,
} from '@nxt1/ui';
import { mobileAuthInterceptor } from './core/infrastructure/interceptors/auth.interceptor';
import { NxtLoggingService, LOGGING_CONFIG } from '@nxt1/ui';

// Settings persistence adapter (connects SettingsService → backend API)
import { SETTINGS_PERSISTENCE_ADAPTER } from '@nxt1/ui/settings';
import { SettingsApiService } from './core/services/settings-api.service';

// Edit Profile API configuration
import { EditProfileService } from '@nxt1/ui/edit-profile';
import { EditProfileApiService } from './core/services/edit-profile-api.service';

// Local services
import { CrashlyticsService } from './core/services/crashlytics.service';
import { AnalyticsService } from './core/services/analytics.service';

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
      uploadPhoto: (userId: string, type: 'profile' | 'banner', file: File | Blob) =>
        apiService.uploadPhoto(userId, type, file),
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
    }),

    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    // Firebase - use custom auth initialization for native platforms
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuthWithPersistence()),

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

    // Analytics adapter (used by @nxt1/ui shared services like FeedService)
    { provide: ANALYTICS_ADAPTER, useExisting: AnalyticsService },

    // Agent X API base URL
    { provide: AGENT_X_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Activity API base URL
    { provide: ACTIVITY_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Invite API base URL
    { provide: INVITE_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Messages API base URL
    { provide: MESSAGES_API_BASE_URL, useFactory: () => environment.apiUrl },

    // Settings persistence adapter (connects SettingsService → backend API)
    { provide: SETTINGS_PERSISTENCE_ADAPTER, useExisting: SettingsApiService },

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
