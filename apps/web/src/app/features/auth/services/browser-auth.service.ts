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
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  Auth,
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
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
import { getErrorMessage } from '@nxt1/core/errors';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ILogger } from '@nxt1/core/logging';
import { environment } from '../../../../environments/environment';

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
  private readonly http = inject(HttpClient);
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
      providerData: user.providerData.map((p) => ({ providerId: p.providerId })),
      getIdToken: () => user.getIdToken(),
    };
  }

  /**
   * Sync user profile from backend.
   * Fetches real Firestore data so that `hasCompletedOnboarding` reflects
   * the actual `onboardingCompleted` flag stored in the database.
   * Falls back to Firebase-only data (hasCompletedOnboarding: false) only
   * when the backend call fails (e.g. offline / cold-start).
   */
  private async syncUserProfile(firebaseUser: FirebaseUser): Promise<void> {
    this._user.set({
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: firebaseUser.displayName ?? 'User',
      profileImg: firebaseUser.photoURL ?? undefined,
      role: 'athlete' as UserRole,
      isPremium: false,
      hasCompletedOnboarding: false,
      createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      // Fetch real profile — this is the only source of truth for
      // onboardingCompleted, role, isPremium, unicode, etc.
      const profile = await this.authApi.getUserProfile(firebaseUser.uid);

      // Backend User model uses `onboardingCompleted` (+ legacy `completeSignUp`)
      const hasCompletedOnboarding =
        profile.onboardingCompleted === true ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (profile as any).completeSignUp === true;

      const profileRecord = profile as unknown as Record<string, unknown>;
      const followingCount =
        typeof profileRecord['followingCount'] === 'number'
          ? profileRecord['followingCount']
          : undefined;
      const followingIds = Array.isArray(profileRecord['following'])
        ? profileRecord['following'].filter(
            (item: unknown): item is string => typeof item === 'string'
          )
        : undefined;
      const connectedEmails = Array.isArray(profileRecord['connectedEmails'])
        ? profileRecord['connectedEmails']
        : undefined;
      this.logger.debug('🔍 [Auth] Syncing user profile with connectedEmails', {
        uid: firebaseUser.uid,
        connectedEmailsCount: connectedEmails?.length ?? 0,
        connectedEmails,
      });

      this._user.set({
        uid: firebaseUser.uid,
        email: profile.email ?? firebaseUser.email ?? '',
        displayName:
          (profile.displayName ?? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()) ||
          (firebaseUser.displayName ?? 'User'),
        profileImg: profile.profileImgs?.[0] ?? firebaseUser.photoURL ?? undefined,
        followingCount,
        followingIds,
        role: (profile.role as UserRole) ?? 'athlete',
        isPremium: false, // extend when backend exposes isPremium
        hasCompletedOnboarding,
        unicode: profile.unicode ?? undefined,
        connectedEmails,
        selectedSports: Array.isArray(profile.sports)
          ? profile.sports.map((s) => s.sport).filter(Boolean)
          : undefined,
        connectedSources: Array.isArray(profile.connectedSources)
          ? profile.connectedSources
          : undefined,
        state: profile.location?.state ?? null,
        city: profile.location?.city ?? null,
        createdAt:
          profile.createdAt instanceof Date
            ? profile.createdAt.toISOString()
            : (profile.createdAt ?? firebaseUser.metadata.creationTime ?? new Date().toISOString()),
        updatedAt:
          profile.updatedAt instanceof Date
            ? profile.updatedAt.toISOString()
            : (profile.updatedAt ?? new Date().toISOString()),
      });

      this.logger.info('User profile synced from backend', {
        uid: firebaseUser.uid,
        hasCompletedOnboarding,
        role: profile.role,
      });
    } catch (err) {
      // Keep the optimistic baseline — user is still authenticated.
      // They'll hit onboarding if hasCompletedOnboarding stays false,
      // which is safer than letting a broken backend silently skip onboarding.
      this.logger.warn('Failed to fetch backend profile — using Firebase fallback', {
        uid: firebaseUser.uid,
        error: err,
      });
    }
  }

  // ============================================
  // SIGN IN METHODS
  // ============================================

  async signInWithEmail(credentials: SignInCredentials): Promise<boolean> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const result = await signInWithEmailAndPassword(
        this.firebaseAuth,
        credentials.email,
        credentials.password
      );

      // Fetch real profile to get onboardingCompleted — do NOT rely on
      // this.hasCompletedOnboarding() here because syncUserProfile() via
      // onAuthStateChanged may not have finished yet (race condition).
      let completed = false;
      try {
        const profile = await this.authApi.getUserProfile(result.user.uid);
        completed =
          profile.onboardingCompleted === true ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (profile as any).completeSignUp === true;
      } catch {
        // If backend is unreachable, fall back to local signal (best effort)
        completed = this.hasCompletedOnboarding();
      }

      const redirectPath = completed ? '/home' : '/auth/onboarding';
      await this.router.navigate([redirectPath], { replaceUrl: true });
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
        // Fetch real profile to get onboardingCompleted — do NOT rely on
        // this.hasCompletedOnboarding() here because syncUserProfile() via
        // onAuthStateChanged may not have finished yet (race condition).
        let completed = false;
        try {
          const profile = await this.authApi.getUserProfile(result.user.uid);
          completed =
            profile.onboardingCompleted === true ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (profile as any).completeSignUp === true;
        } catch {
          // If backend is unreachable, fall back to local signal (best effort)
          completed = this.hasCompletedOnboarding();
        }

        const redirectPath = completed ? '/home' : '/auth/onboarding';
        await this.router.navigate([redirectPath], { replaceUrl: true });
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
      await this.router.navigate(['/explore'], { replaceUrl: true });
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

  // ============================================
  // ACCOUNT DELETION
  // ============================================

  async reauthenticateWithPassword(password: string): Promise<boolean> {
    const firebaseUser = this.firebaseAuth.currentUser;
    if (!firebaseUser?.email) return false;

    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, password);
      await reauthenticateWithCredential(firebaseUser, credential);
      return true;
    } catch (err) {
      this.logger.warn('Re-authentication failed', { error: err });
      this._error.set(getAuthErrorMessage(err));
      return false;
    }
  }

  async deleteAccount(): Promise<{ success: boolean; error?: string }> {
    const firebaseUser = this.firebaseAuth.currentUser;
    if (!firebaseUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const userId = firebaseUser.uid;
    this.logger.info('Starting account deletion', { userId });

    try {
      // Step 1: Get fresh token
      const token = await firebaseUser.getIdToken();
      this.logger.debug('Got ID token for deletion');

      // Step 2: Call backend API to delete everything
      // Use native fetch with ABSOLUTE URL to backend server
      const apiUrl = `${environment.apiURL}/settings/account`;
      this.logger.debug('Calling DELETE with absolute URL', { apiUrl });

      const fetchResponse = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      this.logger.info('Fetch response received', {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        ok: fetchResponse.ok,
        headers: Object.fromEntries(fetchResponse.headers.entries()),
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        this.logger.error('Backend returned error', {
          status: fetchResponse.status,
          body: errorText,
        });
        throw new Error(`Backend error: ${fetchResponse.status} - ${errorText}`);
      }

      const responseText = await fetchResponse.text();
      this.logger.info('Response body (text)', { responseText });

      let response: { success: boolean; data: { deleted: boolean } };
      try {
        response = JSON.parse(responseText);
        this.logger.info('Response parsed', { response });
      } catch (parseError) {
        this.logger.error('Failed to parse response JSON', {
          responseText,
          parseError,
        });
        throw new Error('Invalid response format');
      }

      if (!response.success) {
        throw new Error('Backend returned success=false');
      }

      this.logger.info('Backend deletion successful', { response });

      // Step 3: Clear local auth state
      // Backend has already deleted the Firebase Auth user via Admin SDK
      // So signOut() may fail - we handle it gracefully
      this.logger.debug('Clearing local state');

      this._user.set(null);
      this._firebaseUser.set(null);
      this.authCookie.clearAuthCookie();

      // Step 4: Try to sign out from Firebase (may fail if user already deleted)
      try {
        this.logger.debug('Attempting Firebase signOut');
        await signOut(this.firebaseAuth);
        this.logger.debug('Firebase signOut completed');
      } catch (signOutError) {
        // This is expected - backend deleted the user, so signOut may fail
        this.logger.info('Firebase signOut skipped (user already deleted by backend)', {
          error: signOutError instanceof Error ? signOutError.message : String(signOutError),
        });
      }

      this.logger.info('Account deletion completed successfully');
      return { success: true };
    } catch (err) {
      // This catches ONLY HTTP errors from the delete API call
      const message = getErrorMessage(err);

      this.logger.error('Account deletion failed at API call', {
        error: err,
        message,
        status: (err as any)?.status,
        errorName: (err as any)?.name,
        errorCode: (err as any)?.code,
      });

      return { success: false, error: message };
    }
  }
}
