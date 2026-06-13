/**
 * @fileoverview Mobile App Entry Point
 * @module @nxt1/mobile
 *
 * Bootstrap the Angular application for mobile.
 * Initializes Crashlytics early to catch startup crashes.
 */

import { bootstrapApplication, ɵBrowserDomAdapter } from '@angular/platform-browser';
import { enableProdMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// Icons: Each @nxt1/ui component registers its own icons via addIcons() in its constructor.
// No global registration needed — this avoids bundling all 1,357 ionicon SVG paths (~800 KB).

// Eagerly initialize the DOM adapter before bootstrap. Angular 21's Vite dev
// server can isolate @angular/common chunks so the internal _DOM adapter stays
// null, crashing PathLocationStrategy. makeCurrent() is idempotent (uses ??=).
ɵBrowserDomAdapter.makeCurrent();

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

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  console.error('[Bootstrap] Bootstrap error:', err);
});
