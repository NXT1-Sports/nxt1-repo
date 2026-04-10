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
import { ProfileService } from '../api/profile-api.service';
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
  private readonly profileService = inject(ProfileService);

  // ============================================
  // STATE SIGNALS (Private Writable)
  // ============================================
  private readonly _user = signal<AppUser | null>(null);
  private readonly _firebaseUser = signal<FirebaseUserInfo | null>(null);
  private readonly _isLoading = signal(true);
  private readonly _error = signal<string | null>(null);
  private readonly _isInitialized = signal(false);
  private _isDeletingAccount = false;

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
      if (this._isDeletingAccount) return;
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
      profileImg: undefined,
      role: 'athlete' as UserRole,

      hasCompletedOnboarding: false,
      createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      // Fetch real profile — this is the only source of truth for
      const profile = await this.authApi.getUserProfile(firebaseUser.uid);

      // Backend User model uses `onboardingCompleted` (+ legacy `completeSignUp`)
      const hasCompletedOnboarding =
        profile.onboardingCompleted === true ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (profile as any).completeSignUp === true;

      const profileRecord = profile as unknown as Record<string, unknown>;
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
        profileImg: profile.profileImgs?.[0] ?? undefined,
        role: (profile.role as UserRole) ?? 'athlete',

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

      try {
        const profile = await this.authApi.getUserProfile(result.user.uid);
        const completed =
          profile.onboardingCompleted === true ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (profile as any).completeSignUp === true;
        await this.router.navigate([completed ? '/home' : '/auth/onboarding'], {
          replaceUrl: true,
        });
      } catch {
        const createResult = await this.authApi.createUser({
          uid: result.user.uid,
          email: result.user.email!,
        });

        if (!createResult.success) {
          try {
            const retryProfile = await this.authApi.getUserProfile(result.user.uid);
            const completed =
              retryProfile.onboardingCompleted === true ||
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (retryProfile as any).completeSignUp === true;
            await this.router.navigate([completed ? '/home' : '/auth/onboarding'], {
              replaceUrl: true,
            });
          } catch {
            await this.router.navigate(['/auth/onboarding'], { replaceUrl: true });
          }
        } else {
          await this.router.navigate(['/auth/onboarding'], { replaceUrl: true });
        }
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
    const deletedUser = this._user();
    this.logger.info('Starting account deletion', { userId });

    // ---- Step 1: Backend API ----
    let backendSuccess = false;
    let backendError: string | undefined;
    try {
      const token = await firebaseUser.getIdToken();
      const apiUrl = `${environment.apiURL}/settings/account`;
      this.logger.debug('Calling DELETE', { apiUrl });

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
        ok: fetchResponse.ok,
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
      this.logger.info('Response body', { responseText });

      let response: { success: boolean; data: { deleted: boolean } };
      try {
        response = JSON.parse(responseText);
      } catch {
        throw new Error('Invalid response format');
      }

      if (!response.success) throw new Error('Backend returned success=false');

      backendSuccess = true;
      this.logger.info('Backend deletion successful');
    } catch (err) {
      backendError = getErrorMessage(err);
      this.logger.error('Backend deletion failed', {
        error: err,
        message: backendError,
        status: (err as Record<string, unknown>)?.['status'],
      });
    }

    // ---- Step 2: Clear profile cache (always) ----
    // Runs even if backend failed — stale data must never be served.
    try {
      this.profileService.invalidateCache(
        userId,
        deletedUser?.username ?? undefined,
        deletedUser?.unicode
      );
      this.logger.debug('Profile cache invalidated', { userId });
    } catch (cacheErr) {
      this.logger.warn('Could not clear profile cache', {
        error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
      });
    }

    // Removes all nxt1_* and nxt1:* keys so stale auth/profile/onboarding data
    try {
      // Collect keys first — modifying storage while iterating is unsafe.
      const localKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('nxt1_') || k.startsWith('nxt1:'))) localKeys.push(k);
      }
      localKeys.forEach((k) => localStorage.removeItem(k));

      const sessionKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith('nxt1_') || k.startsWith('nxt1:') || k === 'chunk_error_count'))
          sessionKeys.push(k);
      }
      sessionKeys.forEach((k) => sessionStorage.removeItem(k));

      this.logger.debug('Storage cleared', {
        localKeys: localKeys.length,
        sessionKeys: sessionKeys.length,
      });
    } catch (storageErr) {
      this.logger.warn('Could not clear storage', {
        error: storageErr instanceof Error ? storageErr.message : String(storageErr),
      });
    }

    // ---- Step 3: Clear auth state and navigate away ----
    this._isDeletingAccount = true;
    try {
      this.authCookie.clearAuthCookie();
      this._user.set(null);
      this._firebaseUser.set(null);
      await this.router.navigate(['/auth'], { replaceUrl: true });

      try {
        await signOut(this.firebaseAuth);
      } catch {
        // Ignore — state is already cleared above.
      }
    } finally {
      this._isDeletingAccount = false;
    }

    return { success: backendSuccess, error: backendError };
  }
}
