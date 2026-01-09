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
 */
export const AUTH_ROUTES = {
  ROOT: '/auth',
  SIGN_IN: '/auth/sign-in',
  SIGN_UP: '/auth/sign-up',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password',
  VERIFY_EMAIL: '/auth/verify-email',
  ONBOARDING: '/auth/onboarding',
} as const;

/**
 * Post-auth redirect paths by user type
 */
export const AUTH_REDIRECTS = {
  DEFAULT: '/home',
  ATHLETE: '/home',
  COACH: '/teams',
  PARENT: '/home',
  ADMIN: '/admin',
  ONBOARDING: '/auth/onboarding',
} as const;

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
  'auth/email-already-in-use':
    'An account already exists with this email. Please sign in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  'auth/invalid-credential':
    'Invalid email or password. Please check and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/requires-recent-login':
    'Please sign out and sign in again for security.',
  'auth/credential-already-in-use':
    'This credential is already associated with another account.',

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
 */
export const AUTH_VALIDATION = {
  /** Minimum password length */
  PASSWORD_MIN_LENGTH: 6,

  /** Maximum password length */
  PASSWORD_MAX_LENGTH: 128,

  /** Email regex pattern */
  EMAIL_PATTERN: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  /** Username allowed characters */
  USERNAME_PATTERN: /^[a-zA-Z0-9_]{3,20}$/,

  /** Username min length */
  USERNAME_MIN_LENGTH: 3,

  /** Username max length */
  USERNAME_MAX_LENGTH: 20,
} as const;

/**
 * Validate email format
 */
export function isValidAuthEmail(email: string): boolean {
  return AUTH_VALIDATION.EMAIL_PATTERN.test(email);
}

/**
 * Validate password requirements
 */
export function isValidAuthPassword(password: string): boolean {
  return (
    password.length >= AUTH_VALIDATION.PASSWORD_MIN_LENGTH &&
    password.length <= AUTH_VALIDATION.PASSWORD_MAX_LENGTH
  );
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
