/**
 * @fileoverview Auth Constants
 * @module @nxt1/core/constants
 *
 * Authentication storage keys, routes, and error messages.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// STORAGE KEYS
// ============================================

/**
 * LocalStorage keys for auth persistence
 */
export const AUTH_STORAGE_KEYS = {
  /** Firebase auth user cache */
  AUTH_USER: 'nxt1_auth_user',

  /** Remember me preference */
  REMEMBER_ME: 'nxt1_remember_me',

  /** Last login email (convenience) */
  LAST_EMAIL: 'nxt1_last_email',

  /** Onboarding completion flag */
  ONBOARDING_COMPLETE: 'nxt1_onboarding_complete',

  /** Onboarding progress for resume */
  ONBOARDING_PROGRESS: 'nxt1_onboarding_progress',
} as const;

/**
 * SessionStorage keys for auth flow
 */
export const AUTH_SESSION_KEYS = {
  /** Return URL after auth redirect */
  RETURN_URL: 'nxt1_return_url',

  /** OAuth state parameter */
  OAUTH_STATE: 'nxt1_oauth_state',

  /** Pending social auth provider */
  PENDING_PROVIDER: 'nxt1_pending_provider',
} as const;

// ============================================
// AUTH ROUTES
// ============================================

/**
 * Auth module route paths
 * Note: /sign-in and /sign-up are combined into /auth with ?mode=signup query param
 */
export const AUTH_ROUTES = {
  /** Main auth page (login/signup combined) */
  ROOT: '/auth',
  /** Forgot password flow */
  FORGOT_PASSWORD: '/auth/forgot-password',
  /** Email verification */
  VERIFY_EMAIL: '/auth/verify-email',
  /** Onboarding flow */
  ONBOARDING: '/auth/onboarding',
  /** Explore page (public landing) */
  EXPLORE: '/explore',
  /** Home */
  HOME: '/home',
} as const;

/**
 * Post-auth redirect paths
 */
export const AUTH_REDIRECTS = {
  /** Default redirect after auth (existing users with completed onboarding) */
  DEFAULT: '/agent-x',
  /** Agent X landing after onboarding congratulations */
  AGENT: '/agent-x',
  /** Onboarding flow (new users or incomplete onboarding) */
  ONBOARDING: '/auth/onboarding',
} as const;

// ============================================
// AUTH METHODS (for analytics tracking)
// ============================================

/**
 * Authentication methods for analytics tracking
 */
export const AUTH_METHODS = {
  EMAIL: 'email',
  GOOGLE: 'google',
  APPLE: 'apple',
  MICROSOFT: 'microsoft',
  FACEBOOK: 'facebook',
  TWITTER: 'twitter',
  PHONE: 'phone',
  TEAM_CODE: 'team_code',
  ANONYMOUS: 'anonymous',
} as const;

export type AuthMethod = (typeof AUTH_METHODS)[keyof typeof AUTH_METHODS];

// ============================================
// ERROR MESSAGES
// ============================================

/**
 * User-facing auth error messages
 */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // Firebase error codes → friendly messages
  'auth/user-not-found': 'No account found with this email address.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/email-already-in-use': 'An account already exists with this email. Please sign in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  'auth/invalid-credential': 'Invalid email or password. Please check and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/requires-recent-login': 'Please sign out and sign in again for security.',
  'auth/credential-already-in-use': 'This credential is already associated with another account.',

  // Token/session errors
  'auth/expired-action-code': 'This link has expired. Please request a new one.',
  'auth/invalid-action-code': 'This link is invalid or has already been used.',

  // Popup/redirect errors
  'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups for this site.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',

  // MFA errors
  'auth/multi-factor-auth-required':
    'Additional verification required. Please complete 2-factor authentication.',

  // Backend error codes
  NOT_FOUND: 'Service temporarily unavailable. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  INVALID_UID: 'Invalid account data. Please try again.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  UNAUTHORIZED: 'Session expired. Please sign in again.',

  // Generic fallbacks
  SIGN_IN_FAILED: 'Sign in failed. Please try again.',
  SIGN_UP_FAILED: 'Account creation failed. Please try again.',
  PASSWORD_RESET_FAILED: 'Could not send reset email. Please try again.',
  SOCIAL_AUTH_FAILED: 'Social sign-in failed. Please try again.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
} as const;

/** Default error message for unknown errors */
const DEFAULT_AUTH_ERROR = AUTH_ERROR_MESSAGES['UNKNOWN'];

/**
 * Get user-friendly error message from Firebase error
 */
export function getAuthErrorMessage(error: unknown): string {
  if (!error) return DEFAULT_AUTH_ERROR;

  // Handle Firebase errors
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: string }).code;
    const message = (AUTH_ERROR_MESSAGES as Record<string, string>)[code];
    if (message) return message;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return (AUTH_ERROR_MESSAGES as Record<string, string>)[error] ?? error;
  }

  // Handle Error objects
  if (error instanceof Error) {
    return error.message;
  }

  return DEFAULT_AUTH_ERROR;
}

// ============================================
// SUCCESS MESSAGES
// ============================================

/**
 * User-facing auth success messages
 */
export const AUTH_SUCCESS_MESSAGES = {
  SIGN_IN: 'Welcome back!',
  SIGN_UP: 'Account created successfully!',
  SIGN_OUT: 'You have been signed out.',
  PASSWORD_RESET_SENT: 'Password reset email sent. Check your inbox.',
  EMAIL_VERIFIED: 'Email verified successfully!',
  ONBOARDING_COMPLETE: 'Profile setup complete!',
} as const;

// ============================================
// VALIDATION
// ============================================

/**
 * Auth form validation rules
 * Aligned with PASSWORD_RULES in validation.constants.ts
 */
export const AUTH_VALIDATION = {
  /** Minimum password length (matches PASSWORD_RULES.MIN_LENGTH) */
  PASSWORD_MIN_LENGTH: 8,

  /** Maximum password length */
  PASSWORD_MAX_LENGTH: 128,

  /** Require uppercase letter */
  PASSWORD_REQUIRE_UPPERCASE: true,

  /** Require lowercase letter */
  PASSWORD_REQUIRE_LOWERCASE: true,

  /** Require number */
  PASSWORD_REQUIRE_NUMBER: true,

  /** Require special character */
  PASSWORD_REQUIRE_SPECIAL: false,

  /** Email regex pattern */
  EMAIL_PATTERN: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  /** Username allowed characters */
  USERNAME_PATTERN: /^[a-zA-Z0-9_]{3,20}$/,

  /** Username min length */
  USERNAME_MIN_LENGTH: 3,

  /** Username max length */
  USERNAME_MAX_LENGTH: 20,

  /** Name min length */
  NAME_MIN_LENGTH: 2,

  /** Name max length */
  NAME_MAX_LENGTH: 50,

  /** Team code pattern (4-10 alphanumeric) */
  TEAM_CODE_PATTERN: /^[A-Z0-9]{4,10}$/i,
} as const;

/**
 * Validate email format
 */
export function isValidAuthEmail(email: string): boolean {
  return AUTH_VALIDATION.EMAIL_PATTERN.test(email);
}

/**
 * Validate password requirements (basic check)
 * For detailed password strength, use validatePassword from @nxt1/core/helpers
 */
export function isValidAuthPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;
  if (password.length < AUTH_VALIDATION.PASSWORD_MIN_LENGTH) return false;
  if (password.length > AUTH_VALIDATION.PASSWORD_MAX_LENGTH) return false;

  // Check required character classes
  if (AUTH_VALIDATION.PASSWORD_REQUIRE_LOWERCASE && !/[a-z]/.test(password)) return false;
  if (AUTH_VALIDATION.PASSWORD_REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) return false;
  if (AUTH_VALIDATION.PASSWORD_REQUIRE_NUMBER && !/\d/.test(password)) return false;
  if (AUTH_VALIDATION.PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password))
    return false;

  return true;
}

/**
 * Validate username format
 */
export function isValidUsername(username: string): boolean {
  return AUTH_VALIDATION.USERNAME_PATTERN.test(username);
}

// ============================================
// SOCIAL AUTH PROVIDERS
// ============================================

export const SOCIAL_AUTH_PROVIDERS = {
  GOOGLE: 'google.com',
  APPLE: 'apple.com',
  FACEBOOK: 'facebook.com',
  TWITTER: 'twitter.com',
} as const;

export type SocialAuthProvider = (typeof SOCIAL_AUTH_PROVIDERS)[keyof typeof SOCIAL_AUTH_PROVIDERS];
