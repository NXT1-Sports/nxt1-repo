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
      return event;
    },
  });
}

import { PerformanceService } from './app/core/services';
import { Auth } from '@angular/fire/auth';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    if (!environment.production) {
      const performanceService = appRef.injector.get(PerformanceService);
      (window as unknown as { testPerformance: () => Promise<unknown> }).testPerformance = () =>
        performanceService.testPerformance();

      // Dev helper: get fresh Firebase ID token and copy to clipboard.
      // Usage in browser console: await __getToken()
      const auth = appRef.injector.get(Auth);
      (window as unknown as { __getToken: () => Promise<string | null> }).__getToken = async () => {
        await auth.authStateReady();
        if (!auth.currentUser) {
          console.warn('Not logged in');
          return null;
        }
        const token = await auth.currentUser.getIdToken(true); // force refresh
        console.log(
          '%c✅ Copy token below (triple-click to select all):',
          'color: green; font-weight: bold'
        );
        console.log('Bearer ' + token);
        return token;
      };

      console.log('🔧 Dev tools: testPerformance() | await __getToken()');
    }
  })
  .catch((err) => console.error('Bootstrap error:', err));
