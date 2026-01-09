/**
 * @fileoverview Firebase Server App Service - SSR Authentication
 * @module @nxt1/web/core/auth
 *
 * Provides FirebaseServerApp initialization for authenticated SSR.
 *
 * FirebaseServerApp (2026 Pattern):
 * - Runs with user context (not admin privileges)
 * - Reuses initialized app instances for performance
 * - Supports App Check for backend protection
 * - Seamless session continuation from client
 *
 * Usage:
 * - Initialized once per SSR request with auth token from cookie
 * - Provides Auth and Firestore instances for server-side queries
 * - Automatically destroys app instance after request completes
 *
 * @see https://firebase.google.com/docs/reference/js/app.firebaseserverapp
 */

import { FirebaseServerApp, initializeServerApp, FirebaseOptions } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

/**
 * Configuration for FirebaseServerApp
 */
export interface FirebaseServerConfig {
  /** Firebase project configuration */
  firebaseConfig: FirebaseOptions;
  /** Auth ID token from client cookie */
  authIdToken?: string;
}

/**
 * Result of FirebaseServerApp initialization
 */
export interface FirebaseServerAppResult {
  /** The initialized FirebaseServerApp instance */
  app: FirebaseServerApp;
  /** Auth instance (may have authenticated user) */
  auth: Auth;
  /** Firestore instance for database queries */
  firestore: Firestore;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Cleanup function to call when request completes */
  cleanup: () => Promise<void>;
}

/**
 * Initialize FirebaseServerApp for SSR
 *
 * Creates a Firebase app instance configured for server-side rendering.
 * If an auth token is provided, the user context is established.
 *
 * @param config - Firebase configuration and optional auth token
 * @returns Promise resolving to Firebase instances and cleanup function
 *
 * @example
 * ```typescript
 * const { auth, firestore, cleanup } = await initializeFirebaseServer({
 *   firebaseConfig: environment.firebase,
 *   authIdToken: req.cookies.__session,
 * });
 *
 * try {
 *   const user = auth.currentUser;
 *   const data = await getDoc(doc(firestore, 'users', user.uid));
 *   // Render with authenticated data
 * } finally {
 *   await cleanup();
 * }
 * ```
 */
export async function initializeFirebaseServer(
  config: FirebaseServerConfig
): Promise<FirebaseServerAppResult> {
  const { firebaseConfig, authIdToken } = config;

  // Initialize FirebaseServerApp with auth token if available
  // This creates a Firebase app that runs with user context
  const app = initializeServerApp(firebaseConfig, {
    authIdToken,
  });

  const auth = getAuth(app);
  const firestore = getFirestore(app);

  let isAuthenticated = false;

  // If we have an auth token, wait for auth state to be ready
  if (authIdToken) {
    try {
      // Wait for auth state to initialize
      await auth.authStateReady();
      isAuthenticated = auth.currentUser !== null;
    } catch (error) {
      console.warn('[FirebaseServerApp] Auth state initialization failed:', error);
      isAuthenticated = false;
    }
  }

  // Cleanup function to destroy the app instance
  const cleanup = async (): Promise<void> => {
    try {
      // FirebaseServerApp doesn't have deleteApp, but we should sign out
      await auth.signOut();
    } catch {
      // Ignore cleanup errors
    }
  };

  return {
    app,
    auth,
    firestore,
    isAuthenticated,
    cleanup,
  };
}

/**
 * Extract auth token from request cookies
 *
 * @param cookieHeader - The Cookie header string from the request
 * @param cookieName - Name of the auth cookie (default: __session)
 * @returns The auth token or undefined if not found
 */
export function extractAuthTokenFromCookies(
  cookieHeader: string | undefined,
  cookieName: string = '__session'
): string | undefined {
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === cookieName && value) {
      return decodeURIComponent(value);
    }
  }
  return undefined;
}
