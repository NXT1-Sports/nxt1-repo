// Zone.js - MUST be imported before Angular
import 'zone.js';

import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

const isLocalDevHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if (environment.production && !isLocalDevHost) {
  Sentry.init({
    dsn: 'https://909f2af54678f48dce1d03035e1e93ff@o4510767487385600.ingest.us.sentry.io/4510767490859008',
    sendDefaultPii: true,
    beforeSend(event) {
      const url = event.request?.url ?? '';
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return null;
      }

      const exceptionValues = event.exception?.values ?? [];
      const nativeBridgeNoise = exceptionValues.some((value) => {
        const message = value.value ?? '';
        const frames = value.stacktrace?.frames ?? [];
        return (
          message.includes('window.webkit.messageHandlers') &&
          frames.some(
            (frame) =>
              frame.function === 'sendDataToNative' || frame.function === 'sendPageHideMessage'
          )
        );
      });

      if (nativeBridgeNoise) {
        return null;
      }

      const installationsFetchNoise = exceptionValues.some((value) => {
        const message = (value.value ?? '').toLowerCase();
        return (
          message.includes('failed to fetch') &&
          message.includes('firebaseinstallations.googleapis.com')
        );
      });

      if (installationsFetchNoise) {
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
