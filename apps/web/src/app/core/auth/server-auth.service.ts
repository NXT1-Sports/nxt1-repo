/**
 * @fileoverview Server Auth Service - FirebaseServerApp Implementation
 * @module @nxt1/web/core/auth
 *
 * Server-side rendering authentication using FirebaseServerApp.
 *
 * 2026 Best Practice:
 * FirebaseServerApp allows authenticated SSR by:
 * 1. Reading auth token from cookie (set by client)
 * 2. Initializing Firebase with user context
 * 3. Making authenticated Firestore queries during SSR
 * 4. Rendering personalized content on first paint
 *
 * This implementation:
 * - Initializes FirebaseServerApp with auth token from cookie
 * - Waits for auth.authStateReady() to establish user context
 * - Fetches user profile from Firestore for personalized SSR
 * - Properly cleans up Firebase instance after request
 *
 * @see https://firebase.google.com/docs/reference/js/app.firebaseserverapp
 */

import { Injectable, signal, computed, Optional, Inject, OnDestroy } from '@angular/core';
import { FirebaseServerApp, initializeServerApp, FirebaseOptions } from 'firebase/app';
import { Auth, getAuth, User as FirebaseUser } from 'firebase/auth';
import { Firestore, getFirestore, doc, getDoc } from 'firebase/firestore';

import {
  IAuthService,
  AppUser,
  FirebaseUserInfo,
  SignInCredentials,
  SignUpCredentials,
} from './auth.interface';
import { SSR_AUTH_TOKEN, SSR_FIREBASE_CONFIG } from './ssr-tokens';
import type { UserRole } from '@nxt1/core';

// Re-export tokens for convenience (but import from ssr-tokens.ts for server.ts)
export { SSR_AUTH_TOKEN, SSR_FIREBASE_CONFIG } from './ssr-tokens';

// ============================================
// INITIALIZATION RESULT TYPE
// ============================================

interface ServerAuthState {
  firebaseUser: FirebaseUserInfo | null;
  appUser: AppUser | null;
  isAuthenticated: boolean;
}

/**
 * Server Authentication Service
 *
 * FirebaseServerApp-based implementation for authenticated SSR.
 * Initializes Firebase with user context from auth token cookie.
 *
 * Lifecycle:
 * 1. Constructor receives auth token and Firebase config via DI
 * 2. initialize() is called via APP_INITIALIZER before rendering
 * 3. Auth state is populated from FirebaseServerApp
 * 4. User profile is fetched from Firestore
 * 5. cleanup() is called after request completes via OnDestroy
 *
 * NOTE: This class does NOT use `providedIn: 'root'` because we need
 * different implementations for browser vs server. Instead, it's
 * provided via the AUTH_SERVICE token in app.config.server.ts.
 */
@Injectable()
export class ServerAuthService implements IAuthService, OnDestroy {
  // ============================================
  // FIREBASE INSTANCES (for cleanup)
  // ============================================
  private firebaseApp: FirebaseServerApp | null = null;
  private firebaseAuth: Auth | null = null;
  private firestore: Firestore | null = null;

  // ============================================
  // STATE SIGNALS (Private Writable)
  // ============================================
  private readonly _user = signal<AppUser | null>(null);
  private readonly _firebaseUser = signal<FirebaseUserInfo | null>(null);
  private readonly _isLoading = signal(true);
  private readonly _error = signal<string | null>(null);
  private readonly _isInitialized = signal(false);

  // ============================================
  // PUBLIC READONLY SIGNALS
  // ============================================
  readonly user = this._user.asReadonly();
  readonly firebaseUser = this._firebaseUser.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();

  /** Computed from firebase user state */
  readonly isAuthenticated = computed(() => this._firebaseUser() !== null);
  readonly userRole = computed<UserRole | null>(() => this._user()?.role ?? null);
  readonly isPremium = computed(() => this._user()?.isPremium ?? false);
  readonly hasCompletedOnboarding = computed(() => this._user()?.hasCompletedOnboarding ?? false);

  constructor(
    @Optional() @Inject(SSR_AUTH_TOKEN) private readonly authToken: string | undefined,
    @Optional() @Inject(SSR_FIREBASE_CONFIG) private readonly firebaseConfig: FirebaseOptions | null
  ) {
    // Initialization happens in initialize() called by APP_INITIALIZER
    // This allows async operations before rendering begins
  }

  // ============================================
  // INITIALIZATION (Called by APP_INITIALIZER)
  // ============================================

  /**
   * Initialize FirebaseServerApp and establish auth state
   *
   * This method is called by APP_INITIALIZER before Angular starts rendering.
   * It initializes FirebaseServerApp with the auth token from the cookie,
   * waits for auth state to be ready, and fetches the user profile.
   *
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    // If no Firebase config, skip initialization (shouldn't happen in production)
    if (!this.firebaseConfig) {
      console.warn('[ServerAuthService] No Firebase config provided - skipping initialization');
      this._isInitialized.set(true);
      this._isLoading.set(false);
      return;
    }

    // If no auth token, render as unauthenticated (valid case)
    if (!this.authToken) {
      console.log('[ServerAuthService] No auth token - rendering unauthenticated');
      this._isInitialized.set(true);
      this._isLoading.set(false);
      return;
    }

    try {
      console.log('[ServerAuthService] Initializing FirebaseServerApp with auth token...');

      // Initialize FirebaseServerApp with auth token
      // This creates a Firebase instance with the user's context
      this.firebaseApp = initializeServerApp(this.firebaseConfig, {
        authIdToken: this.authToken,
      });

      this.firebaseAuth = getAuth(this.firebaseApp);
      this.firestore = getFirestore(this.firebaseApp);

      // Wait for auth state to be ready
      // This is CRITICAL - authStateReady() resolves when Firebase has
      // validated the token and currentUser is populated
      await this.firebaseAuth.authStateReady();

      const currentUser = this.firebaseAuth.currentUser;

      if (currentUser) {
        console.log(`[ServerAuthService] Authenticated as: ${currentUser.uid}`);

        // Map Firebase user to our interface
        const firebaseUserInfo = this.mapFirebaseUser(currentUser);
        this._firebaseUser.set(firebaseUserInfo);

        // Fetch user profile from Firestore for personalized SSR
        const appUser = await this.fetchUserProfile(currentUser.uid);
        if (appUser) {
          this._user.set(appUser);
          console.log(`[ServerAuthService] User profile loaded: ${appUser.displayName}`);
        } else {
          // User exists in Firebase Auth but not in Firestore
          // Create minimal user from Firebase data
          this._user.set(this.createMinimalUser(currentUser));
          console.warn('[ServerAuthService] User profile not found in Firestore - using minimal data');
        }
      } else {
        // Token was invalid or expired
        console.warn('[ServerAuthService] Auth token invalid or expired - rendering unauthenticated');
      }
    } catch (err) {
      // Log error but don't fail SSR - render as unauthenticated
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[ServerAuthService] Initialization failed:', message);
      this._error.set(message);

      // Clean up partial initialization
      await this.cleanup();
    } finally {
      this._isLoading.set(false);
      this._isInitialized.set(true);
    }
  }

  // ============================================
  // CLEANUP (Called by OnDestroy)
  // ============================================

  /**
   * Clean up Firebase instances after SSR request completes
   */
  ngOnDestroy(): void {
    this.cleanup().catch((err) => {
      console.error('[ServerAuthService] Cleanup error:', err);
    });
  }

  /**
   * Clean up FirebaseServerApp resources
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.firebaseAuth) {
        // Sign out to release resources
        await this.firebaseAuth.signOut().catch(() => {});
      }
      // Note: FirebaseServerApp doesn't have a deleteApp method
      // Resources are garbage collected when references are released
      this.firebaseApp = null;
      this.firebaseAuth = null;
      this.firestore = null;
    } catch {
      // Ignore cleanup errors - request is ending anyway
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Map Firebase User to our FirebaseUserInfo interface
   */
  private mapFirebaseUser(user: FirebaseUser): FirebaseUserInfo {
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
      metadata: {
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
      },
      // On server, getIdToken returns the token we already have
      getIdToken: async () => this.authToken ?? '',
    };
  }

  /**
   * Fetch user profile from Firestore
   */
  private async fetchUserProfile(uid: string): Promise<AppUser | null> {
    if (!this.firestore) return null;

    try {
      const userDocRef = doc(this.firestore, 'Users', uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        return null;
      }

      const data = userDoc.data();

      return {
        uid,
        email: data['email'] ?? '',
        displayName: data['displayName'] ?? data['firstName'] ?? 'User',
        photoURL: data['photoURL'] ?? data['profilePhoto'] ?? undefined,
        role: (data['role'] as UserRole) ?? 'athlete',
        isPremium: data['isPremium'] ?? data['premium'] ?? false,
        hasCompletedOnboarding: data['hasCompletedOnboarding'] ?? data['onboardingComplete'] ?? false,
        createdAt: data['createdAt']?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        updatedAt: data['updatedAt']?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      };
    } catch (err) {
      console.error('[ServerAuthService] Failed to fetch user profile:', err);
      return null;
    }
  }

  /**
   * Create minimal AppUser from Firebase Auth data
   * Used when Firestore profile doesn't exist
   */
  private createMinimalUser(firebaseUser: FirebaseUser): AppUser {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: firebaseUser.displayName ?? 'User',
      photoURL: firebaseUser.photoURL ?? undefined,
      role: 'athlete' as UserRole,
      isPremium: false,
      hasCompletedOnboarding: false,
      createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the SSR auth token
   * Useful for components that need to make additional authenticated calls
   */
  getAuthToken(): string | undefined {
    return this.authToken;
  }

  /**
   * Get the Firestore instance for additional queries during SSR
   * Returns null if not initialized or unauthenticated
   */
  getFirestore(): Firestore | null {
    return this.firestore;
  }

  // ============================================
  // NOOP METHODS
  // Authentication actions happen on client after hydration
  // ============================================

  /**
   * Noop - authentication happens on client
   */
  async signInWithEmail(_credentials: SignInCredentials): Promise<boolean> {
    console.warn('[ServerAuthService] signInWithEmail called on server - noop');
    return false;
  }

  /**
   * Noop - OAuth requires browser
   */
  async signInWithGoogle(): Promise<boolean> {
    console.warn('[ServerAuthService] signInWithGoogle called on server - noop');
    return false;
  }

  /**
   * Noop - sign up happens on client
   */
  async signUpWithEmail(_credentials: SignUpCredentials): Promise<boolean> {
    console.warn('[ServerAuthService] signUpWithEmail called on server - noop');
    return false;
  }

  /**
   * Noop - sign out happens on client
   */
  async signOut(): Promise<void> {
    console.warn('[ServerAuthService] signOut called on server - noop');
  }

  /**
   * Noop - password reset happens on client
   */
  async sendPasswordResetEmail(_email: string): Promise<boolean> {
    console.warn('[ServerAuthService] sendPasswordResetEmail called on server - noop');
    return false;
  }

  /**
   * Noop - no errors to clear on server
   */
  clearError(): void {
    this._error.set(null);
  }

  /**
   * Returns the auth token if authenticated
   */
  async getIdToken(): Promise<string | null> {
    return this._firebaseUser() ? (this.authToken ?? null) : null;
  }

  /**
   * Noop - profile refresh happens on client
   */
  async refreshUserProfile(): Promise<void> {
    console.warn('[ServerAuthService] refreshUserProfile called on server - noop');
  }
}

// ============================================
// FACTORY FUNCTION FOR APP_INITIALIZER
// ============================================

/**
 * Factory function to initialize ServerAuthService
 * Used with APP_INITIALIZER to ensure auth is ready before rendering
 *
 * @example
 * ```typescript
 * // In app.config.server.ts
 * {
 *   provide: APP_INITIALIZER,
 *   useFactory: initializeServerAuth,
 *   deps: [AUTH_SERVICE],
 *   multi: true,
 * }
 * ```
 */
export function initializeServerAuth(authService: IAuthService): () => Promise<void> {
  return () => {
    // Type guard to check if this is ServerAuthService
    if ('initialize' in authService && typeof authService.initialize === 'function') {
      return (authService as ServerAuthService).initialize();
    }
    // Not ServerAuthService (shouldn't happen on server)
    return Promise.resolve();
  };
}
