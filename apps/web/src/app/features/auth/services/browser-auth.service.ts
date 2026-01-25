/**
 * @fileoverview Browser Auth Service - Full Firebase Implementation
 * @module @nxt1/web/core/auth
 *
 * Production Firebase authentication service for browser environment.
 *
 * Features:
 * - Full Firebase Auth integration
 * - Google OAuth sign-in
 * - Email/password authentication
 * - Reactive state with signals
 * - Backend API integration for user profiles
 *
 * This service is ONLY provided in the browser via app.config.ts.
 * The server uses ServerAuthService instead.
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  Auth,
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  sendPasswordResetEmail,
} from '@angular/fire/auth';
// GoogleAuthProvider must be imported from firebase/auth, not @angular/fire/auth
import { GoogleAuthProvider } from 'firebase/auth';

import {
  IAuthService,
  AppUser,
  FirebaseUserInfo,
  SignInCredentials,
  SignUpCredentials,
} from './auth.interface';
import { AuthApiService } from './auth-api.service';
import { AuthCookieService } from './auth-cookie.service';
import { type UserRole, getAuthErrorMessage } from '@nxt1/core';
import { NxtLoggingService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';

/**
 * Browser Authentication Service
 *
 * Full Firebase implementation for client-side authentication.
 * This service is ONLY instantiated in the browser environment.
 *
 * NOTE: This class does NOT use `providedIn: 'root'` because we need
 * different implementations for browser vs server. Instead, it's
 * provided via the AUTH_SERVICE token in app.config.ts.
 */
@Injectable()
export class BrowserAuthService implements IAuthService {
  private readonly router = inject(Router);
  private readonly firebaseAuth = inject(Auth);
  private readonly authApi = inject(AuthApiService);
  private readonly authCookie = inject(AuthCookieService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('BrowserAuthService');

  // ============================================
  // STATE SIGNALS (Private Writable)
  // ============================================
  private readonly _user = signal<AppUser | null>(null);
  private readonly _firebaseUser = signal<FirebaseUserInfo | null>(null);
  private readonly _isLoading = signal(true);
  private readonly _error = signal<string | null>(null);
  private readonly _isInitialized = signal(false);

  // ============================================
  // PUBLIC COMPUTED SIGNALS (Read-only)
  // ============================================
  readonly user = computed(() => this._user());
  readonly firebaseUser = computed(() => this._firebaseUser());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly isInitialized = computed(() => this._isInitialized());

  readonly isAuthenticated = computed(() => this._firebaseUser() !== null);
  readonly userRole = computed(() => this._user()?.role ?? null);
  readonly isPremium = computed(() => this._user()?.isPremium ?? false);
  readonly hasCompletedOnboarding = computed(() => this._user()?.hasCompletedOnboarding ?? false);

  // ============================================
  // INITIALIZATION
  // ============================================

  constructor() {
    this.initAuthStateListener();
  }

  /**
   * Initialize Firebase auth state listener
   */
  private initAuthStateListener(): void {
    onAuthStateChanged(this.firebaseAuth, async (firebaseUser) => {
      this._isLoading.set(true);

      try {
        if (firebaseUser) {
          // Convert to our FirebaseUserInfo interface
          this._firebaseUser.set(this.mapFirebaseUser(firebaseUser));
          await this.syncUserProfile(firebaseUser);

          // Set auth cookie for SSR (FirebaseServerApp pattern)
          // This allows the server to authenticate the user during SSR
          await this.updateAuthCookie(firebaseUser);
        } else {
          this._firebaseUser.set(null);
          this._user.set(null);
          // Clear auth cookie when user signs out
          this.authCookie.clearAuthCookie();
        }
      } catch (err) {
        this.logger.error('Auth state sync failed', err);
        this._error.set(err instanceof Error ? err.message : 'Authentication error');
      } finally {
        this._isLoading.set(false);
        this._isInitialized.set(true);
      }
    });
  }

  /**
   * Update the auth cookie with current user's ID token
   * This enables FirebaseServerApp to authenticate during SSR
   */
  private async updateAuthCookie(user: FirebaseUser): Promise<void> {
    try {
      const idToken = await user.getIdToken();
      // Firebase ID tokens expire in 1 hour
      this.authCookie.setAuthCookie(idToken, 3600000);
    } catch (err) {
      this.logger.warn('Failed to set auth cookie', { error: err });
    }
  }

  /**
   * Map Firebase User to our interface
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
      getIdToken: () => user.getIdToken(),
    };
  }

  /**
   * Sync user profile from backend
   */
  private async syncUserProfile(firebaseUser: FirebaseUser): Promise<void> {
    try {
      // Note: Full profile data will be fetched from backend API
      // For now, create basic user from Firebase data
      this._user.set({
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName ?? 'User',
        photoURL: firebaseUser.photoURL ?? undefined,
        role: 'athlete' as UserRole,
        isPremium: false,
        hasCompletedOnboarding: false,
        createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error('Failed to sync user profile', err);
    }
  }

  // ============================================
  // SIGN IN METHODS
  // ============================================

  async signInWithEmail(credentials: SignInCredentials): Promise<boolean> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      await signInWithEmailAndPassword(this.firebaseAuth, credentials.email, credentials.password);

      const redirectPath = this.hasCompletedOnboarding() ? '/home' : '/auth/onboarding';

      await this.router.navigate([redirectPath]);
      return true;
    } catch (err) {
      const message = getAuthErrorMessage(err);
      this._error.set(message);
      return false;
    } finally {
      this._isLoading.set(false);
    }
  }

  async signInWithGoogle(): Promise<boolean> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.firebaseAuth, provider);

      // Check if this is a new user
      // @ts-expect-error additionalUserInfo is on the result
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      if (isNewUser) {
        await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
        });
        await this.router.navigate(['/auth/onboarding']);
      } else {
        const redirectPath = this.hasCompletedOnboarding() ? '/home' : '/auth/onboarding';
        await this.router.navigate([redirectPath]);
      }

      return true;
    } catch (err) {
      const message = getAuthErrorMessage(err);
      this._error.set(message);
      return false;
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================
  // SIGN UP METHODS
  // ============================================

  async signUpWithEmail(credentials: SignUpCredentials): Promise<boolean> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const result = await createUserWithEmailAndPassword(
        this.firebaseAuth,
        credentials.email,
        credentials.password
      );

      const createResult = await this.authApi.createUser({
        uid: result.user.uid,
        email: credentials.email,
        teamCode: credentials.teamCode,
        referralId: credentials.referralId,
      });

      if (!createResult.success) {
        throw new Error(
          'error' in createResult ? createResult.error.message : 'Failed to create user'
        );
      }

      await this.router.navigate(['/auth/onboarding']);
      return true;
    } catch (err) {
      const message = getAuthErrorMessage(err);
      this._error.set(message);
      return false;
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================
  // SIGN OUT
  // ============================================

  async signOut(): Promise<void> {
    this._isLoading.set(true);

    try {
      // Clear auth cookie BEFORE signing out of Firebase
      // This ensures SSR will render unauthenticated state
      this.authCookie.clearAuthCookie();

      await signOut(this.firebaseAuth);
      this._user.set(null);
      this._firebaseUser.set(null);
      await this.router.navigate(['/explore']);
    } catch (err) {
      this.logger.error('Sign out failed', err);
      this._error.set('Failed to sign out');
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================
  // PASSWORD RESET
  // ============================================

  async sendPasswordResetEmail(email: string): Promise<boolean> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      await sendPasswordResetEmail(this.firebaseAuth, email);
      return true;
    } catch (err) {
      const message = getAuthErrorMessage(err);
      this._error.set(message);
      return false;
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================
  // UTILITY
  // ============================================

  clearError(): void {
    this._error.set(null);
  }

  async getIdToken(): Promise<string | null> {
    const user = this._firebaseUser();
    if (!user) return null;

    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }

  async refreshUserProfile(): Promise<void> {
    const firebaseUser = this.firebaseAuth.currentUser;
    if (firebaseUser) {
      await this.syncUserProfile(firebaseUser);
    }
  }
}
