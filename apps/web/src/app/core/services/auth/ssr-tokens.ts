/**
 * @fileoverview SSR Injection Tokens & TransferState Keys
 * @module @nxt1/web/core/auth
 *
 * Injection tokens for server-side rendering authentication.
 * This file is intentionally kept separate from server-auth.service.ts
 * to avoid pulling in Firebase SDK imports when server.ts imports these tokens.
 *
 * These tokens are used to pass configuration from the Express server
 * to Angular's dependency injection during SSR.
 *
 * TransferState keys are used to bridge auth state from server → client
 * so the browser boots with the correct authenticated state on frame 1
 * (no "Sign In" flash).
 */

import { InjectionToken, makeStateKey } from '@angular/core';
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

// ============================================
// TRANSFER STATE KEYS (SSR → Browser Hydration)
// ============================================

/**
 * Serializable auth user — plain data subset of AppUser/AuthUser.
 * Functions (e.g. getIdToken) are stripped because TransferState only
 * supports JSON-serializable values.
 */
export interface SerializedAuthUser {
  uid: string;
  email: string;
  displayName: string;
  profileImg?: string;
  role: string;
  hasCompletedOnboarding: boolean;
  _legacyId?: string;
  legacyOnboardingCompleted?: boolean;
  createdAt: string;
  updatedAt: string;
  connectedEmails?: unknown[];
  selectedSports?: string[];
  unicode?: string | null;
  username?: string | null;
}

/**
 * Serializable Firebase user info (no methods).
 */
export interface SerializedFirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  metadata?: { creationTime?: string; lastSignInTime?: string };
  providerData?: Array<{ providerId: string }>;
}

/**
 * Combined auth state transferred from server to client.
 */
export interface TransferredAuthState {
  user: SerializedAuthUser | null;
  firebaseUser: SerializedFirebaseUser | null;
}

/**
 * TransferState key for SSR → browser auth state hydration.
 *
 * ServerAuthService writes this after APP_INITIALIZER resolves.
 * AuthFlowService reads it in its constructor so the first render
 * on the client matches the server's authenticated state.
 */
export const AUTH_TRANSFER_STATE_KEY = makeStateKey<TransferredAuthState>('nxt1.auth.state');
