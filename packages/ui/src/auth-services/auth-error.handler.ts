/**
 * @fileoverview Auth Error Handler Service
 * @module @nxt1/ui/auth-services
 *
 * Enterprise-grade error handling for authentication flows.
 * Provides centralized error transformation, recovery strategies,
 * and user-friendly messaging using @nxt1/core/errors.
 *
 * Features:
 * - Firebase error code mapping to user messages
 * - Automatic retry for transient errors
 * - Reauthentication prompts for session expiry
 * - Rate limiting detection and handling
 * - Network error recovery
 * - Analytics integration for error tracking
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  parseApiError,
  isNxtApiError,
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApiErrorDetail,
  requiresAuth,
  shouldRetry,
  getRetryDelay,
  isValidationError,
  getFieldErrors,
} from '@nxt1/core/errors';

// ============================================
// ERROR TYPES
// ============================================

/**
 * Auth error with enhanced metadata
 */
export interface AuthError {
  /** Error code from Firebase or backend */
  code: string;
  /** User-friendly error message */
  message: string;
  /** Field that caused the error (for validation) */
  field?: 'email' | 'password' | 'firstName' | 'lastName' | 'teamCode' | 'general';
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** Suggested recovery action */
  recovery?: AuthRecoveryAction;
  /** Original error for debugging */
  originalError?: unknown;
  /** Retry count if applicable */
  retryCount?: number;
}

/**
 * Recovery action for auth errors
 */
export type AuthRecoveryAction =
  | { type: 'retry'; delay: number }
  | { type: 'reauthenticate' }
  | { type: 'reset_password' }
  | { type: 'contact_support' }
  | { type: 'dismiss' }
  | { type: 'redirect'; path: string }
  | { type: 'verify_email' };

// ============================================
// FIREBASE ERROR MAPPINGS
// ============================================

/**
 * Firebase Auth error codes mapped to user-friendly messages
 */
const FIREBASE_ERROR_MESSAGES: Record<string, { message: string; field?: AuthError['field'] }> = {
  // Email/Password errors
  'auth/invalid-email': { message: 'Please enter a valid email address.', field: 'email' },
  'auth/user-disabled': {
    message: 'This account has been disabled. Please contact support.',
    field: 'general',
  },
  'auth/user-not-found': { message: 'No account found with this email address.', field: 'email' },
  'auth/wrong-password': { message: 'Incorrect password. Please try again.', field: 'password' },
  'auth/invalid-credential': {
    message: 'Invalid email or password. Please try again.',
    field: 'general',
  },
  'auth/email-already-in-use': {
    message: 'An account with this email already exists.',
    field: 'email',
  },
  'auth/weak-password': {
    message: 'Password must be at least 6 characters long.',
    field: 'password',
  },
  'auth/operation-not-allowed': {
    message: 'This sign-in method is not enabled. Please contact support.',
    field: 'general',
  },

  // Token/session errors
  'auth/expired-action-code': {
    message: 'This link has expired. Please request a new one.',
    field: 'general',
  },
  'auth/invalid-action-code': {
    message: 'This link is invalid or has already been used.',
    field: 'general',
  },
  'auth/requires-recent-login': {
    message: 'Please sign in again to complete this action.',
    field: 'general',
  },

  // Rate limiting
  'auth/too-many-requests': {
    message: 'Too many failed attempts. Please try again later.',
    field: 'general',
  },

  // Network errors
  'auth/network-request-failed': {
    message: 'Network error. Please check your internet connection.',
    field: 'general',
  },

  // Popup/redirect errors
  'auth/popup-blocked': {
    message: 'Sign-in popup was blocked. Please allow popups for this site.',
    field: 'general',
  },
  'auth/popup-closed-by-user': {
    message: 'Sign-in was cancelled. Please try again.',
    field: 'general',
  },
  'auth/cancelled-popup-request': {
    message: 'Sign-in was cancelled. Please try again.',
    field: 'general',
  },
  'auth/account-exists-with-different-credential': {
    message: 'An account already exists with this email using a different sign-in method.',
    field: 'email',
  },

  // MFA errors
  'auth/multi-factor-auth-required': {
    message: 'Additional verification required. Please complete 2-factor authentication.',
    field: 'general',
  },
};

// ============================================
// AUTH ERROR HANDLER SERVICE
// ============================================

/**
 * Auth Error Handler Service
 *
 * Provides centralized error handling for all authentication flows.
 * Transforms raw errors into user-friendly AuthError objects with
 * recovery suggestions.
 *
 * @example
 * ```typescript
 * import { AuthErrorHandler } from '@nxt1/ui/auth-services';
 *
 * @Injectable()
 * export class AuthService {
 *   private readonly errorHandler = inject(AuthErrorHandler);
 *
 *   async signIn(email: string, password: string) {
 *     try {
 *       await this.firebase.signIn(email, password);
 *     } catch (err) {
 *       const error = this.errorHandler.handle(err);
 *       this.errorSignal.set(error.message);
 *     }
 *   }
 * }
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class AuthErrorHandler {
  private readonly platformId = inject(PLATFORM_ID);

  /** Track retry counts per error code */
  private retryCounts = new Map<string, number>();

  /** Maximum retry attempts for transient errors */
  private readonly MAX_RETRIES = 3;

  /** Retry delay in milliseconds (exponential backoff base) */
  private readonly RETRY_DELAY_BASE = 1000;

  // ============================================
  // MAIN ERROR HANDLER
  // ============================================

  /**
   * Transform any error into a standardized AuthError
   *
   * @param error - Raw error from Firebase or backend
   * @returns Standardized AuthError with user message and recovery
   */
  handle(error: unknown): AuthError {
    // Handle Firebase Auth errors
    if (this.isFirebaseAuthError(error)) {
      return this.handleFirebaseError(error);
    }

    // Handle NxtApiError from backend
    if (isNxtApiError(error)) {
      return this.handleApiError(error);
    }

    // Handle HTTP error responses - preserve original error
    if (this.isHttpError(error)) {
      const parsed = parseApiError(error);
      return this.handleApiError(parsed, error);
    }

    // Handle generic Error objects
    if (error instanceof Error) {
      return this.handleGenericError(error);
    }

    // Handle string errors
    if (typeof error === 'string') {
      return {
        code: 'UNKNOWN_ERROR',
        message: error,
        recoverable: false,
        originalError: error,
      };
    }

    // Fallback for unknown error types
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred. Please try again.',
      recoverable: false,
      originalError: error,
    };
  }

  /**
   * Handle error with automatic recovery attempt
   *
   * @param error - Raw error
   * @param onRetry - Callback to retry the operation
   * @returns AuthError with recovery info
   */
  async handleWithRecovery(error: unknown, onRetry?: () => Promise<void>): Promise<AuthError> {
    const authError = this.handle(error);

    // Check if we should auto-retry
    if (authError.recovery?.type === 'retry' && onRetry) {
      const retryCount = this.getRetryCount(authError.code);

      if (retryCount < this.MAX_RETRIES) {
        this.incrementRetryCount(authError.code);

        // Wait for retry delay
        await this.delay(authError.recovery.delay);

        // Attempt retry
        try {
          await onRetry();
          this.resetRetryCount(authError.code);
          // If retry succeeds, throw a "success" signal
          throw { success: true };
        } catch (retryError) {
          // If retry also fails, return the new error
          if ((retryError as { success?: boolean }).success) {
            throw retryError;
          }
          return this.handle(retryError);
        }
      }
    }

    return authError;
  }

  // ============================================
  // ERROR TYPE HANDLERS
  // ============================================

  /**
   * Handle Firebase Auth errors
   */
  private handleFirebaseError(error: { code: string; message?: string }): AuthError {
    const code = error.code;
    const mapping = FIREBASE_ERROR_MESSAGES[code];

    if (mapping) {
      return {
        code,
        message: mapping.message,
        field: mapping.field,
        recoverable: this.isRecoverableFirebaseError(code),
        recovery: this.getRecoveryAction(code),
        originalError: error,
      };
    }

    // Unknown Firebase error
    return {
      code,
      message: error.message || 'An authentication error occurred. Please try again.',
      recoverable: false,
      originalError: error,
    };
  }

  /**
   * Handle API errors from @nxt1/core
   *
   * @param error - Parsed API error details
   * @param originalError - Optional original error (e.g., raw HTTP response)
   */
  private handleApiError(error: ApiErrorDetail, originalError?: unknown): AuthError {
    const code = error.code;
    const original = originalError ?? error;

    // Handle validation errors with field mapping
    if (isValidationError(error)) {
      const fieldErrors = getFieldErrors(error);
      const firstError = fieldErrors[0];

      if (firstError) {
        return {
          code,
          message: firstError.message,
          field: this.mapFieldName(firstError.field),
          recoverable: true,
          recovery: { type: 'dismiss' },
          originalError: original,
        };
      }
    }

    // Handle auth-specific API errors
    const message = this.getApiErrorMessage(error);
    const field = this.getApiErrorField(error);

    return {
      code,
      message,
      field,
      recoverable: shouldRetry(error),
      recovery: shouldRetry(error)
        ? { type: 'retry', delay: getRetryDelay(error) }
        : this.getApiRecoveryAction(error),
      originalError: original,
    };
  }

  /**
   * Handle generic Error objects
   */
  private handleGenericError(error: Error): AuthError {
    // Network errors
    if (
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('fetch')
    ) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to the server. Please check your internet connection.',
        recoverable: true,
        recovery: { type: 'retry', delay: this.RETRY_DELAY_BASE },
        originalError: error,
      };
    }

    // Timeout errors
    if (error.message.toLowerCase().includes('timeout')) {
      return {
        code: 'TIMEOUT_ERROR',
        message: 'The request timed out. Please try again.',
        recoverable: true,
        recovery: { type: 'retry', delay: this.RETRY_DELAY_BASE },
        originalError: error,
      };
    }

    return {
      code: 'GENERIC_ERROR',
      message: error.message || 'An unexpected error occurred.',
      recoverable: false,
      originalError: error,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Check if error is a Firebase Auth error
   */
  private isFirebaseAuthError(error: unknown): error is { code: string; message?: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code: unknown }).code === 'string' &&
      (error as { code: string }).code.startsWith('auth/')
    );
  }

  /**
   * Check if error is an HTTP error response
   */
  private isHttpError(
    error: unknown
  ): error is { status: number; error?: unknown; message?: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status: unknown }).status === 'number'
    );
  }

  /**
   * Check if Firebase error is recoverable
   */
  private isRecoverableFirebaseError(code: string): boolean {
    const recoverableCodes = [
      'auth/network-request-failed',
      'auth/too-many-requests',
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request',
      'auth/popup-blocked',
    ];
    return recoverableCodes.includes(code);
  }

  /**
   * Get recovery action for Firebase error code
   */
  private getRecoveryAction(code: string): AuthRecoveryAction | undefined {
    switch (code) {
      case 'auth/network-request-failed':
        return { type: 'retry', delay: this.RETRY_DELAY_BASE };
      case 'auth/too-many-requests':
        return { type: 'retry', delay: 30000 }; // 30 second cooldown
      case 'auth/requires-recent-login':
        return { type: 'reauthenticate' };
      case 'auth/user-not-found':
        return { type: 'redirect', path: '/auth?mode=signup' };
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return { type: 'reset_password' };
      case 'auth/popup-blocked':
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return { type: 'retry', delay: 0 };
      case 'auth/user-disabled':
        return { type: 'contact_support' };
      default:
        return { type: 'dismiss' };
    }
  }

  /**
   * Get user-friendly message for API error
   */
  private getApiErrorMessage(error: ApiErrorDetail): string {
    const code = error.code;

    const messages: Partial<Record<ApiErrorCode, string>> = {
      [API_ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 'Invalid email or password. Please try again.',
      [API_ERROR_CODES.RES_EMAIL_EXISTS]: 'An account with this email already exists.',
      [API_ERROR_CODES.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please sign in again.',
      [API_ERROR_CODES.AUTH_TOKEN_INVALID]: 'Authentication failed. Please sign in again.',
      [API_ERROR_CODES.AUTHZ_FORBIDDEN]: 'You do not have permission to perform this action.',
      [API_ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait and try again.',
      [API_ERROR_CODES.SRV_INTERNAL_ERROR]: 'A server error occurred. Please try again later.',
      [API_ERROR_CODES.CLIENT_NETWORK_ERROR]:
        'Unable to connect. Please check your internet connection.',
    };

    return messages[code as ApiErrorCode] || error.message || 'An unexpected error occurred.';
  }

  /**
   * Get field from API error
   */
  private getApiErrorField(error: ApiErrorDetail): AuthError['field'] | undefined {
    if (error.code === API_ERROR_CODES.RES_EMAIL_EXISTS) return 'email';
    if (error.code === API_ERROR_CODES.AUTH_INVALID_CREDENTIALS) return 'general';
    return undefined;
  }

  /**
   * Get recovery action for API error
   */
  private getApiRecoveryAction(error: ApiErrorDetail): AuthRecoveryAction | undefined {
    if (requiresAuth(error)) {
      return { type: 'reauthenticate' };
    }
    return { type: 'dismiss' };
  }

  /**
   * Map API field name to AuthError field
   */
  private mapFieldName(field: string): AuthError['field'] {
    const mapping: Record<string, AuthError['field']> = {
      email: 'email',
      password: 'password',
      firstName: 'firstName',
      first_name: 'firstName',
      lastName: 'lastName',
      last_name: 'lastName',
      teamCode: 'teamCode',
      team_code: 'teamCode',
    };
    return mapping[field] || 'general';
  }

  // ============================================
  // RETRY MANAGEMENT
  // ============================================

  private getRetryCount(code: string): number {
    return this.retryCounts.get(code) || 0;
  }

  private incrementRetryCount(code: string): void {
    const count = this.getRetryCount(code);
    this.retryCounts.set(code, count + 1);
  }

  private resetRetryCount(code: string): void {
    this.retryCounts.delete(code);
  }

  /**
   * Reset all retry counts
   */
  resetAllRetryCounts(): void {
    this.retryCounts.clear();
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Track error for analytics
   */
  trackError(error: AuthError): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // TODO: Integrate with analytics service
    console.debug('[AuthErrorHandler] Tracking error:', {
      code: error.code,
      field: error.field,
      recoverable: error.recoverable,
      retryCount: error.retryCount,
    });
  }
}
