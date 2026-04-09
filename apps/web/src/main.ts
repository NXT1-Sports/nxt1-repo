// Zone.js - MUST be imported before Angular
import 'zone.js';

import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';
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
