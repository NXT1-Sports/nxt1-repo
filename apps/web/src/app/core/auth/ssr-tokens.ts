/**
 * @fileoverview SSR Injection Tokens
 * @module @nxt1/web/core/auth
 *
 * Injection tokens for server-side rendering authentication.
 * This file is intentionally kept separate from server-auth.service.ts
 * to avoid pulling in Firebase SDK imports when server.ts imports these tokens.
 *
 * These tokens are used to pass configuration from the Express server
 * to Angular's dependency injection during SSR.
 */

import { InjectionToken } from '@angular/core';
import type { FirebaseOptions } from 'firebase/app';

/**
 * Injection token for Firebase configuration on server
 * Provided in app.config.server.ts with environment.firebase
 */
export const SSR_FIREBASE_CONFIG = new InjectionToken<FirebaseOptions>('SSR_FIREBASE_CONFIG');

/**
 * Injection token for SSR auth token from cookie
 * Provided by server.ts via CommonEngine providers
 *
 * Flow:
 * 1. User signs in → BrowserAuthService sets __session cookie
 * 2. SSR request arrives → server.ts extracts cookie value
 * 3. server.ts provides token via CommonEngine providers
 * 4. ServerAuthService receives token and initializes FirebaseServerApp
 */
export const SSR_AUTH_TOKEN = new InjectionToken<string | undefined>('SSR_AUTH_TOKEN');
