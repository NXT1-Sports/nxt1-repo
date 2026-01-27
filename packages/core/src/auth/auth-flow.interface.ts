/**
 * @fileoverview IAuthFlowService Interface
 * @module @nxt1/core/auth
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Defines the contract for AuthFlowService implementations across platforms.
 * Both web and mobile AuthFlowService classes should implement this interface
 * to ensure consistent API surface.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │              LoginComponent, SignUpComponent               │
 * ├────────────────────────────────────────────────────────────┤
 * │         ⭐ IAuthFlowService (THIS INTERFACE) ⭐            │
 * │           Consistent contract across platforms             │
 * ├────────────────────────────────────────────────────────────┤
 * │   Web: AuthFlowService      Mobile: AuthFlowService        │
 * │   Platform-specific implementations                        │
 * └────────────────────────────────────────────────────────────┘
 *
 * @example
 * ```typescript
 * // Both web and mobile implement this interface
 * @Injectable({ providedIn: 'root' })
 * export class AuthFlowService implements IAuthFlowService {
 *   readonly user: Signal<AuthUser | null>;
 *   readonly isLoading: Signal<boolean>;
 *   // ... all other members
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { AuthUser, UserRole, AuthProvider, FirebaseUserInfo } from './auth.types';

// ============================================
// CREDENTIAL TYPES
// ============================================

/**
 * Email/password sign-in credentials
 */
export interface SignInCredentials {
  readonly email: string;
  readonly password: string;
  /** Skip auto-navigation after success (for biometric enrollment flow) */
  readonly skipNavigation?: boolean;
}

/**
 * Sign-up credentials with optional profile data
 */
export interface SignUpCredentials {
  readonly email: string;
  readonly password: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly teamCode?: string;
  readonly referralId?: string;
  /** Skip auto-navigation after success (for biometric enrollment flow) */
  readonly skipNavigation?: boolean;
}

/**
 * OAuth provider options
 */
export interface OAuthOptions {
  /** Team code to associate with new account */
  readonly teamCode?: string;
  /** Referral ID for tracking */
  readonly referralId?: string;
  /** Skip auto-navigation after success */
  readonly skipNavigation?: boolean;
}

// ============================================
// SIGNAL TYPES (Platform-agnostic)
// ============================================

/**
 * Generic read-only signal interface
 * Works with Angular signals, SolidJS signals, etc.
 */
export interface ReadonlySignal<T> {
  (): T;
}

// ============================================
// AUTH FLOW SERVICE INTERFACE
// ============================================

/**
 * Core authentication flow service interface.
 *
 * Defines the contract that both web and mobile AuthFlowService
 * implementations must follow. This ensures consistent API surface
 * for auth operations across all platforms.
 *
 * @example
 * ```typescript
 * class LoginComponent {
 *   private auth = inject(AuthFlowService);
 *
 *   readonly isLoading = this.auth.isLoading;
 *   readonly error = this.auth.error;
 *
 *   async onSubmit(email: string, password: string) {
 *     const success = await this.auth.signInWithEmail({ email, password });
 *     // Navigation handled by service
 *   }
 * }
 * ```
 */
export interface IAuthFlowService {
  // ============================================
  // STATE SIGNALS (Read-only)
  // ============================================

  /** Current authenticated user, or null if not signed in */
  readonly user: ReadonlySignal<AuthUser | null>;

  /** Firebase user info (for advanced use cases) */
  readonly firebaseUser: ReadonlySignal<FirebaseUserInfo | null>;

  /** Whether an auth operation is in progress */
  readonly isLoading: ReadonlySignal<boolean>;

  /** Current error message, or null if no error */
  readonly error: ReadonlySignal<string | null>;

  /** Whether auth state has been initialized */
  readonly isInitialized: ReadonlySignal<boolean>;

  /** Whether user is currently authenticated */
  readonly isAuthenticated: ReadonlySignal<boolean>;

  /** Current user's role */
  readonly userRole: ReadonlySignal<UserRole | null>;

  /** Whether user has premium subscription */
  readonly isPremium: ReadonlySignal<boolean>;

  /** Whether user has completed onboarding */
  readonly hasCompletedOnboarding: ReadonlySignal<boolean>;

  // ============================================
  // EMAIL/PASSWORD AUTHENTICATION
  // ============================================

  /**
   * Sign in with email and password
   *
   * @param credentials - Email and password
   * @returns Promise resolving to true on success, false on failure
   */
  signInWithEmail(credentials: SignInCredentials): Promise<boolean>;

  /**
   * Sign up with email and password
   *
   * @param credentials - Email, password, and optional profile data
   * @returns Promise resolving to true on success, false on failure
   */
  signUpWithEmail(credentials: SignUpCredentials): Promise<boolean>;

  /**
   * Send password reset email
   *
   * @param email - Email address
   * @returns Promise resolving to true on success, false on failure
   */
  sendPasswordResetEmail(email: string): Promise<boolean>;

  // ============================================
  // OAUTH AUTHENTICATION
  // ============================================

  /**
   * Sign in with Google
   *
   * @param options - Optional OAuth options (teamCode, referralId)
   * @returns Promise resolving to true on success, false on failure
   */
  signInWithGoogle(options?: OAuthOptions): Promise<boolean>;

  /**
   * Sign in with Apple
   *
   * @param options - Optional OAuth options
   * @returns Promise resolving to true on success, false on failure
   */
  signInWithApple(options?: OAuthOptions): Promise<boolean>;

  /**
   * Sign in with Microsoft
   *
   * @param options - Optional OAuth options
   * @returns Promise resolving to true on success, false on failure
   */
  signInWithMicrosoft?(options?: OAuthOptions): Promise<boolean>;

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /**
   * Sign out the current user
   *
   * @returns Promise resolving when sign-out is complete
   */
  signOut(): Promise<void>;

  /**
   * Refresh the current auth token
   *
   * @returns Promise resolving to true if token was refreshed
   */
  refreshToken?(): Promise<boolean>;

  /**
   * Get the current ID token for API calls
   *
   * @param forceRefresh - Force token refresh
   * @returns Promise resolving to token string or null
   */
  getIdToken?(forceRefresh?: boolean): Promise<string | null>;

  // ============================================
  // USER PROFILE
  // ============================================

  /**
   * Refresh user profile from backend
   *
   * @returns Promise resolving when profile is refreshed
   */
  refreshUserProfile?(): Promise<void>;

  /**
   * Update the local user state
   * Used after onboarding completion to sync state
   *
   * @param updates - Partial user updates
   */
  updateLocalUser?(updates: Partial<AuthUser>): void;

  // ============================================
  // ERROR HANDLING
  // ============================================

  /**
   * Clear the current error
   */
  clearError(): void;

  // ============================================
  // NAVIGATION (Optional)
  // ============================================

  /**
   * Navigate to post-auth destination
   * Call this after showing biometric enrollment prompt
   */
  navigateToPostAuthDestination?(): Promise<void>;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a service implements IAuthFlowService
 */
export function isAuthFlowService(service: unknown): service is IAuthFlowService {
  if (!service || typeof service !== 'object') return false;

  const s = service as Partial<IAuthFlowService>;
  return (
    typeof s.user === 'function' &&
    typeof s.isLoading === 'function' &&
    typeof s.isAuthenticated === 'function' &&
    typeof s.signInWithEmail === 'function' &&
    typeof s.signOut === 'function'
  );
}

// ============================================
// AUTH EVENT TYPES
// ============================================

/**
 * Auth flow event types for analytics and logging
 */
export const AUTH_FLOW_EVENTS = {
  SIGN_IN_STARTED: 'SIGN_IN_STARTED',
  SIGN_IN_SUCCESS: 'SIGN_IN_SUCCESS',
  SIGN_IN_FAILED: 'SIGN_IN_FAILED',
  SIGN_UP_STARTED: 'SIGN_UP_STARTED',
  SIGN_UP_SUCCESS: 'SIGN_UP_SUCCESS',
  SIGN_UP_FAILED: 'SIGN_UP_FAILED',
  SIGN_OUT: 'SIGN_OUT',
  PASSWORD_RESET_SENT: 'PASSWORD_RESET_SENT',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  PROFILE_SYNCED: 'PROFILE_SYNCED',
} as const;

export type AuthFlowEvent = (typeof AUTH_FLOW_EVENTS)[keyof typeof AUTH_FLOW_EVENTS];

/**
 * Auth flow event payload
 */
export interface AuthFlowEventPayload {
  readonly event: AuthFlowEvent;
  readonly method?: AuthProvider | 'email';
  readonly errorCode?: string;
  readonly userId?: string;
  readonly timestamp: number;
}

/**
 * Create an auth flow event payload with current timestamp
 */
export function createAuthFlowEvent(
  event: AuthFlowEvent,
  options?: Omit<AuthFlowEventPayload, 'event' | 'timestamp'>
): AuthFlowEventPayload {
  return {
    event,
    timestamp: Date.now(),
    ...options,
  };
}
