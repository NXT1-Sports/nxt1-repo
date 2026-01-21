/**
 * @fileoverview Mobile App Entry Point
 * @module @nxt1/mobile
 *
 * Bootstrap the Angular application for mobile.
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { enableProdMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';
// TODO: Uncomment when @codetrix-studio/capacitor-google-auth is installed
// import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

console.log('[Bootstrap] Starting app bootstrap...');
console.log('[Bootstrap] Environment:', { production: environment.production });
console.log('[Bootstrap] Platform:', Capacitor.getPlatform());
console.log('[Bootstrap] Is native:', Capacitor.isNativePlatform());

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

  console.log('[Bootstrap] Base URL set to:', baseUrl);
  console.log('[Bootstrap] Fetch interceptor installed');
  console.log('[Bootstrap] URL constructor patched for native');
}

if (environment.production) {
  enableProdMode();
  console.log('[Bootstrap] Production mode enabled');
}

// Note: Ionicons are bundled with @ionic/angular web components
// No need to configure SVG paths for Capacitor

// TODO: Uncomment when @codetrix-studio/capacitor-google-auth is installed
// Initialize Google Auth plugin ONLY on native platforms
// if (Capacitor.isNativePlatform()) {
//   try {
//     console.log('[Bootstrap] Initializing GoogleAuth...');
//     GoogleAuth.initialize({
//       clientId: environment.googleClientId,
//       scopes: ['profile', 'email'],
//       grantOfflineAccess: true,
//     });
//     console.log('[Bootstrap] GoogleAuth initialized');
//   } catch (error) {
//     console.error('[Bootstrap] GoogleAuth initialization error:', error);
//   }
// }

console.log('[Bootstrap] Bootstrapping Angular application...');
bootstrapApplication(AppComponent, appConfig)
  .then(() => console.log('[Bootstrap] Application bootstrapped successfully'))
  .catch((err) => console.error('[Bootstrap] Bootstrap error:', err));
