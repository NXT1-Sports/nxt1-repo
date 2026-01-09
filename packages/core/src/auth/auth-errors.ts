/**
 * @fileoverview Auth Error Handler - Platform Agnostic
 * @module @nxt1/core/auth
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Converts Firebase auth error codes to user-friendly messages.
 * Used by both web and mobile to provide consistent error handling.
 *
 * @example
 * ```typescript
 * import { getAuthErrorMessage } from '@nxt1/core/auth';
 *
 * try {
 *   await signInWithEmail(email, password);
 * } catch (error) {
 *   const message = getAuthErrorMessage(error);
 *   showToast(message); // "Invalid email or password"
 * }
 * ```
 */

/**
 * Firebase auth error codes
 */
export type FirebaseAuthErrorCode =
  | 'auth/invalid-email'
  | 'auth/user-disabled'
  | 'auth/user-not-found'
  | 'auth/wrong-password'
  | 'auth/invalid-credential'
  | 'auth/email-already-in-use'
  | 'auth/weak-password'
  | 'auth/operation-not-allowed'
  | 'auth/account-exists-with-different-credential'
  | 'auth/credential-already-in-use'
  | 'auth/requires-recent-login'
  | 'auth/popup-closed-by-user'
  | 'auth/cancelled-popup-request'
  | 'auth/popup-blocked'
  | 'auth/network-request-failed'
  | 'auth/too-many-requests'
  | 'auth/expired-action-code'
  | 'auth/invalid-action-code'
  | 'auth/missing-email'
  | string;

/**
 * User-friendly error messages for Firebase auth errors
 */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // Sign In Errors
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/user-not-found': 'No account found with this email address.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/invalid-credential': 'Invalid email or password.',

  // Sign Up Errors
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters long.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',

  // Social Auth Errors
  'auth/account-exists-with-different-credential':
    'An account already exists with this email using a different sign-in method.',
  'auth/credential-already-in-use': 'This credential is already associated with another account.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
  'auth/cancelled-popup-request': 'Only one sign-in popup can be open at a time.',
  'auth/popup-blocked': 'Sign-in popup was blocked. Please enable popups and try again.',

  // Session Errors
  'auth/requires-recent-login':
    'For security reasons, please sign in again to complete this action.',

  // Network Errors
  'auth/network-request-failed': 'Network error. Please check your connection and try again.',
  'auth/too-many-requests': 'Too many failed attempts. Please wait a moment and try again.',

  // Password Reset Errors
  'auth/expired-action-code': 'This password reset link has expired. Please request a new one.',
  'auth/invalid-action-code': 'This password reset link is invalid. Please request a new one.',

  // Other
  'auth/missing-email': 'Please enter your email address.',
};

/**
 * Default error message when code is not recognized
 */
export const DEFAULT_AUTH_ERROR = 'An error occurred. Please try again.';

/**
 * Get user-friendly error message from Firebase auth error
 *
 * @param error - Error object (typically from Firebase)
 * @returns User-friendly error message
 */
export function getAuthErrorMessage(error: unknown): string {
  if (!error) return DEFAULT_AUTH_ERROR;

  // Handle Firebase error objects
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as { code?: string; message?: string };

    // Try to get message from error code
    if (errorObj.code && AUTH_ERROR_MESSAGES[errorObj.code]) {
      return AUTH_ERROR_MESSAGES[errorObj.code];
    }

    // Fall back to error message if it's user-friendly
    if (errorObj.message && !errorObj.message.includes('Firebase')) {
      return errorObj.message;
    }
  }

  // Handle string errors
  if (typeof error === 'string') {
    if (AUTH_ERROR_MESSAGES[error]) {
      return AUTH_ERROR_MESSAGES[error];
    }
    return error;
  }

  return DEFAULT_AUTH_ERROR;
}

/**
 * Extract error code from Firebase error
 *
 * @param error - Error object
 * @returns Error code or undefined
 */
export function getAuthErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as { code?: string }).code;
}

/**
 * Check if error is a specific Firebase auth error
 *
 * @param error - Error object
 * @param code - Error code to check
 * @returns True if error matches code
 */
export function isAuthError(error: unknown, code: FirebaseAuthErrorCode): boolean {
  return getAuthErrorCode(error) === code;
}

/**
 * Check if error is a user-not-found error
 */
export function isUserNotFoundError(error: unknown): boolean {
  return isAuthError(error, 'auth/user-not-found');
}

/**
 * Check if error is an invalid credential error
 */
export function isInvalidCredentialError(error: unknown): boolean {
  const code = getAuthErrorCode(error);
  return code === 'auth/wrong-password' || code === 'auth/invalid-credential';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  return isAuthError(error, 'auth/network-request-failed');
}

/**
 * Check if error requires user to re-authenticate
 */
export function requiresRecentLogin(error: unknown): boolean {
  return isAuthError(error, 'auth/requires-recent-login');
}
