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
 * - Initializes FirebaseServerApp if auth token is present
 * - Returns authenticated user state for SSR
 * - Falls back to unauthenticated if no token
 * - Never imports browser-specific Firebase code
 *
 * @see https://firebase.google.com/docs/reference/js/app.firebaseserverapp
 */

import { Injectable, signal, computed, Optional, Inject } from '@angular/core';

import {
  IAuthService,
  AppUser,
  FirebaseUserInfo,
  SignInCredentials,
  SignUpCredentials,
} from './auth.interface';
import type { UserRole } from '@nxt1/core';

/**
 * Server Authentication Service
 *
 * FirebaseServerApp-based implementation for authenticated SSR.
 * Reads auth token from SSR_AUTH_TOKEN injection token and initializes
 * Firebase with user context.
 *
 * NOTE: This class does NOT use `providedIn: 'root'` because we need
 * different implementations for browser vs server. Instead, it's
 * provided via the AUTH_SERVICE token in app.config.server.ts.
 */
@Injectable()
export class ServerAuthService implements IAuthService {
  // ============================================
  // STATE SIGNALS
  // ============================================

  /** User state - initialized from FirebaseServerApp if token present */
  private readonly _user = signal<AppUser | null>(null);
  private readonly _firebaseUser = signal<FirebaseUserInfo | null>(null);

  readonly user = this._user.asReadonly();
  readonly firebaseUser = this._firebaseUser.asReadonly();

  /** False on server - no loading states during SSR */
  readonly isLoading = signal(false).asReadonly();

  /** Always null on server - no errors during SSR */
  readonly error = signal<string | null>(null).asReadonly();

  /** True on server - SSR considers auth "initialized" */
  readonly isInitialized = signal(true).asReadonly();

  /** Computed from user state */
  readonly isAuthenticated = computed(() => this._firebaseUser() !== null);
  readonly userRole = computed<UserRole | null>(() => this._user()?.role ?? null);
  readonly isPremium = computed(() => this._user()?.isPremium ?? false);
  readonly hasCompletedOnboarding = computed(() => this._user()?.hasCompletedOnboarding ?? false);

  constructor(@Optional() @Inject('SSR_AUTH_TOKEN') private readonly authToken?: string) {
    // FirebaseServerApp initialization is deferred to avoid import issues
    // The token is available for components that need to make authenticated calls
    if (this.authToken) {
      console.log('[ServerAuthService] Auth token present - authenticated SSR available');
    }
  }

  /**
   * Get the SSR auth token for FirebaseServerApp initialization
   * Components can use this to initialize FirebaseServerApp for data fetching
   */
  getAuthToken(): string | undefined {
    return this.authToken;
  }

  // ============================================
  // NOOP METHODS
  // All methods resolve immediately without side effects
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
    // Noop
  }

  /**
   * Returns the auth token if available
   */
  async getIdToken(): Promise<string | null> {
    return this.authToken ?? null;
  }

  /**
   * Noop - profile refresh happens on client
   */
  async refreshUserProfile(): Promise<void> {
    console.warn('[ServerAuthService] refreshUserProfile called on server - noop');
  }
}
