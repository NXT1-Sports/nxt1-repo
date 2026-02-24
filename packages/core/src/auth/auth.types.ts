/**
 * @fileoverview Auth Types - Platform Agnostic
 * @module @nxt1/core/auth
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Canonical authentication type definitions used across all platforms.
 * These types define the contract for auth state and operations.
 */

import type { UserRole } from '../constants/user.constants';

// Re-export UserRole from single source of truth
export type { UserRole } from '../constants/user.constants';

/**
 * Authentication provider used for sign-in
 */
export type AuthProvider = 'email' | 'google' | 'apple' | 'anonymous';

/**
 * Core user profile - platform agnostic
 */
export interface AuthUser {
  /** Unique user identifier */
  uid: string;
  /** User's email address */
  email: string;
  /** Display name */
  displayName: string;
  /** Profile image URL from backend (source of truth for user profile photo) */
  profileImg?: string;
  /** User role in the application */
  role: UserRole;
  /** Premium subscription status */
  isPremium: boolean;
  /** Whether user has completed onboarding */
  hasCompletedOnboarding: boolean;
  /** Auth provider used */
  provider: AuthProvider;
  /** Email verification status */
  emailVerified: boolean;
  /** Account creation timestamp (ISO string) */
  createdAt: string;
  /** Last update timestamp (ISO string) */
  updatedAt: string;
}

/**
 * Minimal Firebase user info for SSR compatibility
 */
export interface FirebaseUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  metadata?: {
    creationTime?: string;
    lastSignInTime?: string;
  };
}

// ============================================
// CREDENTIALS
// ============================================

/**
 * Email/password sign-in credentials
 */
export interface SignInCredentials {
  email: string;
  password: string;
}

/**
 * Sign-up credentials with optional profile data
 */
export interface SignUpCredentials {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  userType?: UserRole;
  teamCode?: string;
  referralId?: string;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  email: string;
}

// ============================================
// AUTH STATE
// ============================================

/**
 * Authentication state - used by state managers
 */
export interface AuthState {
  /** Current authenticated user or null */
  user: AuthUser | null;
  /** Firebase user info (for token operations) */
  firebaseUser: FirebaseUserInfo | null;
  /** Whether auth state is being loaded/checked */
  isLoading: boolean;
  /** Whether initial auth check is complete */
  isInitialized: boolean;
  /** Current error message or null */
  error: string | null;
  /**
   * Flag to indicate signup is in progress.
   * Prevents auth state listeners from syncing profile before
   * backend user is created (race condition prevention).
   */
  signupInProgress: boolean;
}

/**
 * Initial auth state
 */
export const INITIAL_AUTH_STATE: AuthState = {
  user: null,
  firebaseUser: null,
  isLoading: true,
  isInitialized: false,
  error: null,
  signupInProgress: false,
};

// ============================================
// AUTH RESULTS
// ============================================

/**
 * Result of an authentication operation
 */
export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  errorCode?: string;
}

/**
 * Result of token refresh operation
 */
export interface TokenRefreshResult {
  success: boolean;
  token?: string;
  expiresAt?: number;
  error?: string;
}

// ============================================
// AUTH TOKEN
// ============================================

/**
 * Stored auth token with metadata
 */
export interface StoredAuthToken {
  /** The actual token value */
  token: string;
  /** Token expiration timestamp (ms since epoch) */
  expiresAt: number;
  /** Refresh token for getting new access tokens */
  refreshToken?: string;
  /** User ID associated with this token */
  userId: string;
}

/**
 * Check if a stored token is expired
 * @param token - Stored token to check
 * @param bufferMs - Buffer time before actual expiration (default: 5 minutes)
 */
export function isTokenExpired(token: StoredAuthToken, bufferMs = 5 * 60 * 1000): boolean {
  return Date.now() >= token.expiresAt - bufferMs;
}

// ============================================
// AUTH EVENTS
// ============================================

/**
 * Auth event types for state change notifications
 */
export type AuthEventType =
  | 'SIGN_IN'
  | 'SIGN_OUT'
  | 'TOKEN_REFRESH'
  | 'SESSION_EXPIRED'
  | 'USER_UPDATED'
  | 'ERROR';

/**
 * Auth event payload
 */
export interface AuthEvent {
  type: AuthEventType;
  user?: AuthUser;
  error?: string;
  timestamp: number;
}

// ============================================
// NATIVE AUTH (Capacitor)
// ============================================

/**
 * Supported native OAuth providers
 */
export type NativeAuthProvider = 'google' | 'apple' | 'microsoft';

/**
 * Result from native OAuth sign-in
 * Contains tokens needed to authenticate with Firebase
 */
export interface NativeAuthResult {
  /** OAuth provider used */
  provider: NativeAuthProvider;
  /** OAuth ID token for Firebase credential */
  idToken: string;
  /** OAuth access token (optional, provider-specific) */
  accessToken?: string;
  /** Server auth code (for Google Sign-In on iOS) */
  serverAuthCode?: string;
  /** Raw nonce for Apple Sign-In (required for Firebase) */
  rawNonce?: string;
  /** User info from OAuth provider */
  user: {
    /** User ID from provider */
    id: string;
    /** Email address */
    email: string | null;
    /** Display name */
    displayName: string | null;
    /** Given/first name (Apple specific) */
    givenName?: string | null;
    /** Family/last name (Apple specific) */
    familyName?: string | null;
    /** Profile photo URL */
    photoUrl?: string | null;
  };
}

/**
 * Native auth availability check result
 */
export interface NativeAuthAvailability {
  /** Whether Google Sign-In is available */
  google: boolean;
  /** Whether Apple Sign-In is available (iOS 13+ only) */
  apple: boolean;
  /** Whether Microsoft Sign-In is available */
  microsoft: boolean;
}

/**
 * Configuration for native auth initialization
 */
export interface NativeAuthConfig {
  /** Google OAuth client ID (web client ID from Firebase Console) */
  googleClientId?: string;
  /** Apple Service ID (for web fallback) */
  appleServiceId?: string;
  /** Microsoft client ID */
  microsoftClientId?: string;
}
