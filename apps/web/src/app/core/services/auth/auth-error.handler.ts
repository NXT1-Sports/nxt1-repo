/**
 * @fileoverview Auth Error Handler Service
 * @module @nxt1/web/features/auth
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
import { Router } from '@angular/router';
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
import { getAuthErrorMessage } from '@nxt1/core';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ILogger } from '@nxt1/core/logging';

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
// FIREBASE ERROR FIELD MAPPINGS
// ============================================

/**
 * Firebase Auth error codes mapped to form fields
 * Messages are sourced from @nxt1/core via getAuthErrorMessage()
 */
const FIREBASE_ERROR_FIELDS: Record<string, AuthError['field']> = {
  // Email-related errors
  'auth/invalid-email': 'email',
  'auth/user-not-found': 'email',
  'auth/email-already-in-use': 'email',
  'auth/account-exists-with-different-credential': 'email',

  // Password-related errors
  'auth/wrong-password': 'password',
  'auth/weak-password': 'password',

  // General errors (no specific field)
  'auth/user-disabled': 'general',
  'auth/invalid-credential': 'general',
  'auth/operation-not-allowed': 'general',
  'auth/expired-action-code': 'general',
  'auth/invalid-action-code': 'general',
  'auth/requires-recent-login': 'general',
  'auth/too-many-requests': 'general',
  'auth/network-request-failed': 'general',
  'auth/popup-blocked': 'general',
  'auth/popup-closed-by-user': 'general',
  'auth/cancelled-popup-request': 'general',
  'auth/multi-factor-auth-required': 'general',
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
 */
@Injectable({
  providedIn: 'root',
})
export class AuthErrorHandler {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger: ILogger = inject(NxtLoggingService).child('AuthErrorHandler');

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

    // Handle HTTP error responses
    if (this.isHttpError(error)) {
      const parsed = parseApiError(error);
      return this.handleApiError(parsed);
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
   * Uses shared getAuthErrorMessage() from @nxt1/core for consistent messaging
   */
  private handleFirebaseError(error: { code: string; message?: string }): AuthError {
    const code = error.code;

    // Get user-friendly message from shared @nxt1/core utility
    const message = getAuthErrorMessage(error);

    // Get field mapping for form validation highlighting
    const field = FIREBASE_ERROR_FIELDS[code];

    return {
      code,
      message,
      field,
      recoverable: this.isRecoverableFirebaseError(code),
      recovery: this.getRecoveryAction(code),
      originalError: error,
    };
  }

  /**
   * Handle API errors from @nxt1/core
   */
  private handleApiError(error: ApiErrorDetail): AuthError {
    const code = error.code;

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
          originalError: error,
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
      originalError: error,
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
    this.logger.debug('Tracking error', {
      code: error.code,
      field: error.field,
      recoverable: error.recoverable,
      retryCount: error.retryCount,
    });
  }
}
