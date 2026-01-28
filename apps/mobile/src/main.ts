/**
 * @fileoverview Mobile App Entry Point
 * @module @nxt1/mobile
 *
 * Bootstrap the Angular application for mobile.
 * Initializes Crashlytics early to catch startup crashes.
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { enableProdMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// Import Crashlytics for early initialization
import { CrashlyticsService } from './app/services/crashlytics.service';

// Fix document base URL for Capacitor
if (Capacitor.isNativePlatform()) {
  const baseUrl =
    Capacitor.getPlatform() === 'android' ? 'https://localhost/' : 'capacitor://localhost/';

  // Remove existing base tags
  const existingBase = document.querySelector('base');
  if (existingBase) {
    existingBase.remove();
  }

  // Add new base with full URL
  const base = document.createElement('base');
  base.href = baseUrl;
  document.head.insertBefore(base, document.head.firstChild);

  // WORKAROUND: Prevent Ionicons from trying to fetch SVG files
  // Intercept fetch calls and reject those for SVG icons silently
  // const originalFetch = window.fetch;
  // window.fetch = function (input: RequestInfo | URL): Promise<Response> {
  //   const url =
  //     typeof input === 'string'
  //       ? input
  //       : input instanceof URL
  //         ? input.href
  //         : (input as Request).url;

  //   // If it's an SVG icon request, return rejected promise silently
  //   if (url && (url.includes('.svg') || url.includes('svg/'))) {
  //     console.warn('[Bootstrap] Blocked SVG fetch:', url);
  //     // Return a failed fetch that Ionicons can handle gracefully
  //     return Promise.reject(new Error('SVG loading disabled'));
  //   }

  //   return originalFetch.apply(this, arguments as IArguments);
  // };
}

if (environment.production) {
  enableProdMode();
}

// Note: Ionicons are bundled with @ionic/angular web components
// No need to configure SVG paths for Capacitor

// ============================================
// CRASHLYTICS - Initialize early to catch startup crashes
// ============================================

/**
 * Initialize Crashlytics before Angular bootstrap to capture any early errors.
 * This is critical for debugging startup issues on native platforms.
 */
async function initializeCrashlytics(): Promise<void> {
  try {
    const crashlytics = new CrashlyticsService();
    await crashlytics.initialize({
      enabled: environment.production,
      debug: !environment.production,
      collectNavigationBreadcrumbs: true,
      collectHttpBreadcrumbs: true,
      initialCustomKeys: {
        app_version: environment.appVersion || '1.0.0',
        environment: environment.production ? 'production' : 'development',
        platform: Capacitor.getPlatform(),
      },
    });

    // Check if we crashed on previous execution
    const didCrash = await crashlytics.didCrashOnPreviousExecution();
    if (didCrash) {
      console.log('[Bootstrap] App crashed on previous execution - reports will be sent');
    }

    console.log('[Bootstrap] Crashlytics initialized successfully');
  } catch (error) {
    // Don't fail app startup if Crashlytics fails
    console.error('[Bootstrap] Crashlytics initialization error:', error);
  }
}

// Initialize Crashlytics, then bootstrap Angular
initializeCrashlytics()
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => {
    console.error('[Bootstrap] Bootstrap error:', err);
    // Try to record error if Crashlytics was initialized
    try {
      const crashlytics = new CrashlyticsService();
      if (crashlytics.isReady()) {
        crashlytics.recordException({
          message: err.message || 'Bootstrap failed',
          stacktrace: err.stack,
          severity: 'fatal',
          category: 'javascript',
        });
      }
    } catch {
      // Ignore - already logging to console
    }
  });
