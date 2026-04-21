/**
 * @fileoverview Browser Auth Service - Thin Delegation Layer
 * @module @nxt1/web/core/auth
 *
 * Satisfies the AUTH_SERVICE (IAuthService) token in the browser environment
 * by delegating all shared auth state and operations to AuthFlowService
 * (the single source of truth).
 *
 * BrowserAuthService owns only two browser-specific methods that require
 * direct Firebase Auth access: reauthenticateWithPassword and deleteAccount.
 * All other state and operations are delegated to AuthFlowService.
 *
 * This service is ONLY provided in the browser via app.config.ts.
 * The server uses ServerAuthService instead.
 */

import { Injectable, inject } from '@angular/core';
import { ProfileService } from '../api/profile-api.service';
import { Auth, EmailAuthProvider, signOut, reauthenticateWithCredential } from '@angular/fire/auth';

import { IAuthService, AppUser, SignInCredentials, SignUpCredentials } from './auth.interface';
import { AuthCookieService } from './auth-cookie.service';
import { AuthFlowService } from './auth-flow.service';
import { getErrorMessage } from '@nxt1/core/errors';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ILogger } from '@nxt1/core/logging';
import { environment } from '../../../../environments/environment';
import type { Signal } from '@angular/core';
import type { FirebaseUserInfo } from './auth.interface';

/**
 * Browser Authentication Service
 *
 * Thin wrapper around AuthFlowService (the single source of truth for all
 * auth state). This class satisfies the IAuthService token in the browser
 * and adds the two Firebase-specific methods that require a live Firebase
 * Auth instance: reauthenticateWithPassword and deleteAccount.
 *
 * NOTE: This class does NOT use `providedIn: 'root'` because we need
 * different implementations for browser vs server. Instead, it's
 * provided via the AUTH_SERVICE token in app.config.ts.
 */
@Injectable()
export class BrowserAuthService implements IAuthService {
  private readonly authFlow = inject(AuthFlowService);
  private readonly firebaseAuth = inject(Auth);
  private readonly authCookie = inject(AuthCookieService);
  private readonly profileService = inject(ProfileService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('BrowserAuthService');

  // ============================================
  // STATE — Single source of truth: AuthFlowService
  // ============================================

  // Cast: AuthUser (core) is structurally compatible with AppUser (web-local)
  // after connectedSources was added to AuthUser.
  readonly user = this.authFlow.user as unknown as Signal<AppUser | null>;
  readonly firebaseUser = this.authFlow.firebaseUser as unknown as Signal<FirebaseUserInfo | null>;
  readonly isLoading = this.authFlow.isLoading;
  readonly error = this.authFlow.error;
  readonly isInitialized = this.authFlow.isInitialized;
  readonly isAuthenticated = this.authFlow.isAuthenticated;
  readonly userRole = this.authFlow.userRole;
  readonly hasCompletedOnboarding = this.authFlow.hasCompletedOnboarding;

  // ============================================
  // AUTH OPERATIONS — Delegate to AuthFlowService
  // ============================================

  signInWithEmail(credentials: SignInCredentials): Promise<boolean> {
    return this.authFlow.signInWithEmail(credentials);
  }

  signInWithGoogle(): Promise<boolean> {
    return this.authFlow.signInWithGoogle();
  }

  signUpWithEmail(credentials: SignUpCredentials): Promise<boolean> {
    return this.authFlow.signUpWithEmail(credentials);
  }

  signOut(): Promise<void> {
    return this.authFlow.signOut();
  }

  sendPasswordResetEmail(email: string): Promise<boolean> {
    return this.authFlow.sendPasswordResetEmail(email);
  }

  clearError(): void {
    this.authFlow.clearError();
  }

  getIdToken(): Promise<string | null> {
    return this.authFlow.getIdToken();
  }

  refreshUserProfile(): Promise<void> {
    return this.authFlow.refreshUserProfile();
  }

  // ============================================
  // ACCOUNT OPERATIONS — Browser-specific (require live Firebase Auth)
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
      // Surface error through AuthFlowService so all state readers see it
      // (AuthFlowService doesn't expose a public setError, but clearError is enough for recovery)
      this.authFlow.clearError();
      // Propagate as thrown so caller can display the message
      throw err;
    }
  }

  async deleteAccount(): Promise<{ success: boolean; error?: string }> {
    const firebaseUser = this.firebaseAuth.currentUser;
    if (!firebaseUser) {
      return { success: false, error: 'Not authenticated' };
    }

    const userId = firebaseUser.uid;
    const deletedUser = this.authFlow.user();
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

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        this.logger.error('Backend returned error', {
          status: fetchResponse.status,
          body: errorText,
        });
        throw new Error(`Backend error: ${fetchResponse.status} - ${errorText}`);
      }

      const responseText = await fetchResponse.text();
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
      this.logger.error('Backend deletion failed', { error: err, message: backendError });
    }

    // ---- Step 2: Clear profile cache ----
    try {
      this.profileService.invalidateCache(userId, (deletedUser as AppUser | null)?.unicode);
      this.logger.debug('Profile cache invalidated', { userId });
    } catch (cacheErr) {
      this.logger.warn('Could not clear profile cache', {
        error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
      });
    }

    // ---- Step 3: Clear local storage ----
    try {
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
    } catch (storageErr) {
      this.logger.warn('Could not clear storage', {
        error: storageErr instanceof Error ? storageErr.message : String(storageErr),
      });
    }

    // ---- Step 4: Clear auth state and navigate ----
    // AuthFlowService.signOut() handles state clearing + navigation.
    // We also clear the cookie here before calling signOut so SSR sees
    // the unauthenticated state immediately.
    this.authCookie.clearAuthCookie();
    try {
      await signOut(this.firebaseAuth);
    } catch {
      // Ignore — AuthFlowService's onAuthStateChanged will clear state anyway.
    }
    // Trigger state clear + navigation via AuthFlowService
    await this.authFlow.signOut();

    return { success: backendSuccess, error: backendError };
  }
}
