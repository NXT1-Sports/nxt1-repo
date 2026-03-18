/**
 * @fileoverview Auth Service Interface & Injection Token
 * @module @nxt1/web/core/auth
 *
 * Platform-agnostic authentication interface following 2026 best practices.
 *
 * Architecture:
 * - IAuthService: Contract for all auth implementations
 * - AUTH_SERVICE: Injection token for DI
 * - BrowserAuthService: Full Firebase implementation (browser)
 * - ServerAuthService: Noop implementation (SSR)
 *
 * This pattern allows:
 * - Different implementations for browser vs server
 * - Testable code with mock implementations
 * - No Firebase imports on the server bundle
 */

import { InjectionToken, Signal } from '@angular/core';
import type { ConnectedEmail, UserRole } from '@nxt1/core';

// ============================================
// USER TYPES
// ============================================

/**
 * Application user with business-level properties
 */
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  profileImg?: string;
  followingCount?: number;
  followingIds?: string[];
  role: UserRole;
  isPremium: boolean;
  hasCompletedOnboarding: boolean;
  createdAt: string;
  updatedAt: string;
  unicode?: string | null;
  username?: string | null;
  referralCode?: string | null;
  connectedEmails?: ConnectedEmail[];
}

/**
 * Firebase user type (minimal interface for SSR compatibility)
 */
export interface FirebaseUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
  getIdToken(): Promise<string>;
}

// ============================================
// AUTH CREDENTIALS
// ============================================

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  teamCode?: string;
  referralId?: string;
}

// ============================================
// AUTH SERVICE INTERFACE
// ============================================

/**
 * Authentication Service Interface
 *
 * Defines the contract for all authentication implementations.
 * Both browser and server implementations must satisfy this interface.
 *
 * @example
 * ```typescript
 * // In component
 * private readonly auth = inject(AUTH_SERVICE);
 *
 * readonly isLoading = this.auth.isLoading;
 * readonly user = this.auth.user;
 *
 * async login() {
 *   await this.auth.signInWithEmail({ email, password });
 * }
 * ```
 */
export interface IAuthService {
  // ============================================
  // STATE (Signals for reactive UI)
  // ============================================

  /** Current application user (with business properties) */
  readonly user: Signal<AppUser | null>;

  /** Current Firebase user (raw auth state) */
  readonly firebaseUser: Signal<FirebaseUserInfo | null>;

  /** Whether auth operations are in progress */
  readonly isLoading: Signal<boolean>;

  /** Current error message, if any */
  readonly error: Signal<string | null>;

  /** Whether auth state has been determined */
  readonly isInitialized: Signal<boolean>;

  /** Whether user is authenticated */
  readonly isAuthenticated: Signal<boolean>;

  /** User's role (athlete, coach, etc.) */
  readonly userRole: Signal<UserRole | null>;

  /** Whether user has premium subscription */
  readonly isPremium: Signal<boolean>;

  /** Whether user has completed onboarding */
  readonly hasCompletedOnboarding: Signal<boolean>;

  // ============================================
  // SIGN IN METHODS
  // ============================================

  /**
   * Sign in with email and password
   * @returns true if successful, false if failed (check error signal)
   */
  signInWithEmail(credentials: SignInCredentials): Promise<boolean>;

  /**
   * Sign in with Google OAuth
   * @returns true if successful, false if failed
   */
  signInWithGoogle(): Promise<boolean>;

  // ============================================
  // SIGN UP METHODS
  // ============================================

  /**
   * Create new account with email and password
   * @returns true if successful, false if failed
   */
  signUpWithEmail(credentials: SignUpCredentials): Promise<boolean>;

  // ============================================
  // SIGN OUT
  // ============================================

  /**
   * Sign out current user and navigate to explore page
   */
  signOut(): Promise<void>;

  // ============================================
  // PASSWORD RESET
  // ============================================

  /**
   * Send password reset email
   * @returns true if email sent successfully
   */
  sendPasswordResetEmail(email: string): Promise<boolean>;

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Clear current error
   */
  clearError(): void;

  /**
   * Get ID token for authenticated API requests
   * @returns Token string or null if not authenticated
   */
  getIdToken(): Promise<string | null>;

  /**
   * Refresh user profile from backend
   */
  refreshUserProfile(): Promise<void>;

  // ============================================
  // ACCOUNT DELETION
  // ============================================

  /**
   * Re-authenticate with email/password before sensitive operations.
   * @returns true if re-auth succeeded
   */
  reauthenticateWithPassword(password: string): Promise<boolean>;

  /**
   * Permanently delete the current user's account.
   * Caller must call reauthenticateWithPassword first for email/password users.
   * @returns success flag and optional error message
   */
  deleteAccount(): Promise<{ success: boolean; error?: string }>;
}

// ============================================
// INJECTION TOKEN
// ============================================

/**
 * Injection token for the auth service
 *
 * Use this token to inject the appropriate auth implementation:
 * - BrowserAuthService in browser (app.config.ts)
 * - ServerAuthService on server (app.config.server.ts)
 *
 * @example
 * ```typescript
 * // In component or service
 * private readonly auth = inject(AUTH_SERVICE);
 * ```
 */
export const AUTH_SERVICE = new InjectionToken<IAuthService>('AUTH_SERVICE');
