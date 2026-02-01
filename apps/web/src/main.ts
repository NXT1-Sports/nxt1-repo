// Zone.js - MUST be imported before Angular
import 'zone.js';

import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';
import { PerformanceService } from './app/core/services/performance.service';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    // Expose performance test helper to window for staging verification
    // Usage: Open browser console and run: testPerformance()
    if (!environment.production) {
      const performanceService = appRef.injector.get(PerformanceService);
      (window as unknown as { testPerformance: () => Promise<unknown> }).testPerformance = () =>
        performanceService.testPerformance();

      console.log('🔧 Performance test available. Run: testPerformance()');
    }
  })
  .catch((err) => console.error('Bootstrap error:', err));
