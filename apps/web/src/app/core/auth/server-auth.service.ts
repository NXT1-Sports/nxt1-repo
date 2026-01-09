/**
 * @fileoverview Server Auth Service - SSR Noop Implementation
 * @module @nxt1/web/core/auth
 *
 * Server-side rendering safe authentication service.
 *
 * This implementation:
 * - Returns sensible defaults for all state
 * - All methods are no-ops that return immediately
 * - Never imports Firebase or browser-specific code
 * - Allows SSR to complete without errors
 *
 * The actual authentication happens on the client after hydration,
 * using the BrowserAuthService.
 */

import { Injectable, signal, computed } from '@angular/core';

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
 * Noop implementation for server-side rendering.
 * All state returns "unauthenticated" defaults.
 * All methods resolve immediately without side effects.
 *
 * NOTE: This class does NOT use `providedIn: 'root'` because we need
 * different implementations for browser vs server. Instead, it's
 * provided via the AUTH_SERVICE token in app.config.server.ts.
 */
@Injectable()
export class ServerAuthService implements IAuthService {
  // ============================================
  // STATE SIGNALS (Fixed values for SSR)
  // ============================================

  /** Always null on server - user state determined after hydration */
  readonly user = signal<AppUser | null>(null).asReadonly();

  /** Always null on server - Firebase not available */
  readonly firebaseUser = signal<FirebaseUserInfo | null>(null).asReadonly();

  /** False on server - no loading states during SSR */
  readonly isLoading = signal(false).asReadonly();

  /** Always null on server - no errors during SSR */
  readonly error = signal<string | null>(null).asReadonly();

  /** True on server - SSR considers auth "initialized" (as unauthenticated) */
  readonly isInitialized = signal(true).asReadonly();

  /** False on server - assume unauthenticated for SSR */
  readonly isAuthenticated = computed(() => false);

  /** Null on server - no user role */
  readonly userRole = computed<UserRole | null>(() => null);

  /** False on server - assume not premium */
  readonly isPremium = computed(() => false);

  /** False on server - assume not onboarded */
  readonly hasCompletedOnboarding = computed(() => false);

  // ============================================
  // NOOP METHODS
  // All methods resolve immediately without side effects
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
   * Always returns null on server - no auth token available
   */
  async getIdToken(): Promise<string | null> {
    return null;
  }

  /**
   * Noop - profile refresh happens on client
   */
  async refreshUserProfile(): Promise<void> {
    // Noop
  }
}
