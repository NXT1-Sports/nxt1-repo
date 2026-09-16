// Zone.js - MUST be imported before Angular
import 'zone.js';

// Polyfill for HTML5 Drag and Drop on mobile/touch devices
import { polyfill } from 'mobile-drag-drop';
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';

if (typeof window !== 'undefined') {
  polyfill({
    dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
    holdToDrag: 250, // 250ms long-press to drag, allows all native scrolling
  });
}

import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { isIgnorableRuntimeError } from '@nxt1/core/crashlytics';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

function isIgnorableSentryEvent(event: Sentry.ErrorEvent): boolean {
  const exceptionValues = event.exception?.values ?? [];

  return exceptionValues.some((value) => {
    const frames = value.stacktrace?.frames ?? [];
    const stack = frames
      .map((frame) => `${frame.filename ?? ''} ${frame.function ?? ''}`)
      .join(' ');

    return isIgnorableRuntimeError({
      message: value.value,
      name: value.type,
      stack,
    });
  });
}

const isLocalDevHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if (environment.production && !isLocalDevHost) {
  Sentry.init({
    dsn: 'https://909f2af54678f48dce1d03035e1e93ff@o4510767487385600.ingest.us.sentry.io/4510767490859008',
    // Must match the release name used by the sourcemaps:upload script so
    // Sentry can symbolicate minified stack traces back to TypeScript.
    release: `nxt1-web@${environment.version}`,
    dist: environment.version,
    sendDefaultPii: true,
    beforeSend(event) {
      const url = event.request?.url ?? '';
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return null;
      }

      if (isIgnorableSentryEvent(event)) {
        return null;
      }

      return event;
    },
  });
}

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    if (!environment.production) {
      (window as unknown as { testPerformance: () => Promise<unknown> }).testPerformance =
        async () => {
          const [{ PerformanceService }] = await Promise.all([import('./app/core/services')]);
          const performanceService = appRef.injector.get(PerformanceService);
          return performanceService.testPerformance();
        };

      // Dev helper: get fresh Firebase ID token and copy to clipboard.
      // Usage in browser console: await __getToken()
      (window as unknown as { __getToken: () => Promise<string | null> }).__getToken = async () => {
        const [{ Auth }] = await Promise.all([import('@angular/fire/auth')]);
        const auth = appRef.injector.get(Auth);
        await auth.authStateReady();
        if (!auth.currentUser) {
          console.warn('Not logged in');
          return null;
        }
        const token = await auth.currentUser.getIdToken(true); // force refresh
        console.log(
          '%cCopy token below (triple-click to select all):',
          'color: green; font-weight: bold'
        );
        console.log('Bearer ' + token);
        return token;
      };

      console.log('Dev tools: testPerformance() | await __getToken()');
    }
  })
  .catch((err) => console.error('Bootstrap error:', err));
