/**
 * @fileoverview SSR Auth Token - Injection Token for FirebaseServerApp
 * @module @nxt1/web/core/auth
 *
 * Provides the auth token from cookies to Angular during SSR.
 * This token is used by ServerAuthService to initialize FirebaseServerApp.
 *
 * Flow:
 * 1. server.ts extracts token from __session cookie
 * 2. Token is provided to Angular via SSR_AUTH_TOKEN injection token
 * 3. ServerAuthService reads token and initializes FirebaseServerApp
 * 4. Authenticated Firestore queries can be made during SSR
 */

import { InjectionToken } from '@angular/core';

/**
 * Injection token for the Firebase auth ID token during SSR
 *
 * This token is provided by the Express server from the __session cookie.
 * It's used to initialize FirebaseServerApp with user context.
 *
 * Value:
 * - string: The Firebase ID token from the cookie
 * - undefined: No auth cookie present (render as unauthenticated)
 */
export const SSR_AUTH_TOKEN = new InjectionToken<string | undefined>('SSR_AUTH_TOKEN', {
  providedIn: 'root',
  factory: () => undefined, // Default to undefined (no token)
});
