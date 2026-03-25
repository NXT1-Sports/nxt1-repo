import { InjectionToken } from '@angular/core';

/**
 * Injection token for the app version string.
 *
 * Provide this in each app's `app.config.ts` using the environment's
 * `appVersion` value so the settings footer reflects the real build version
 * (e.g. `'2.0.0-dev'`, `'2.0.0-staging'`, `'2.0.0'`).
 *
 * @example
 * // apps/web/src/app/app.config.ts
 * { provide: APP_VERSION, useFactory: () => environment.appVersion }
 */
export const APP_VERSION = new InjectionToken<string>('APP_VERSION');
