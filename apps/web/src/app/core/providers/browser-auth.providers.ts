import { makeEnvironmentProviders } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth, Auth } from '@angular/fire/auth';
import { providePerformance, getPerformance } from '@angular/fire/performance';
import { HTTP_ERROR_INTERCEPTOR_FIREBASE_AUTH } from '@nxt1/ui/infrastructure/interceptors';
import { environment } from '../../../environments/environment';
import { AUTH_SERVICE } from '../services/auth/auth.interface';
import { BrowserAuthService } from '../services/auth/browser-auth.service';

export function provideBrowserAuthProviders() {
  return makeEnvironmentProviders([
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    {
      provide: HTTP_ERROR_INTERCEPTOR_FIREBASE_AUTH,
      useFactory: (auth: Auth) => auth,
      deps: [Auth],
    },
    providePerformance(() => getPerformance()),
    { provide: AUTH_SERVICE, useClass: BrowserAuthService },
  ]);
}
