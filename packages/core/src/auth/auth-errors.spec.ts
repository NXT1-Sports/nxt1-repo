/**
 * @fileoverview Auth Errors Unit Tests
 * @module @nxt1/core/auth
 *
 * Comprehensive tests for platform-agnostic auth error handling utilities.
 * These tests verify error message mapping that works on both web and mobile.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  getAuthErrorMessage,
  getAuthErrorCode,
  isAuthError,
  isUserNotFoundError,
  isInvalidCredentialError,
  isNetworkError,
  requiresRecentLogin,
  AUTH_ERROR_MESSAGES,
  DEFAULT_AUTH_ERROR,
} from './auth-errors';
import { ERROR_FIXTURES, createMockFirebaseError } from '../testing/auth-fixtures';

describe('Auth Errors', () => {
  // ============================================
  // getAuthErrorMessage
  // ============================================

  describe('getAuthErrorMessage', () => {
    describe('Firebase error codes', () => {
      it('should return friendly message for auth/invalid-email', () => {
        const error = ERROR_FIXTURES.invalidEmail;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Please enter a valid email address.');
      });

      it('should return friendly message for auth/user-not-found', () => {
        const error = ERROR_FIXTURES.userNotFound;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('No account found with this email address.');
      });

      it('should return friendly message for auth/invalid-credential', () => {
        const error = ERROR_FIXTURES.invalidCredential;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Invalid email or password.');
      });

      it('should return friendly message for auth/email-already-in-use', () => {
        const error = ERROR_FIXTURES.emailInUse;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('An account with this email already exists.');
      });

      it('should return friendly message for auth/weak-password', () => {
        const error = ERROR_FIXTURES.weakPassword;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Password must be at least 6 characters long.');
      });

      it('should return friendly message for auth/too-many-requests', () => {
        const error = ERROR_FIXTURES.tooManyRequests;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Too many failed attempts. Please wait a moment and try again.');
      });

      it('should return friendly message for auth/network-request-failed', () => {
        const error = ERROR_FIXTURES.networkError;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Network error. Please check your connection and try again.');
      });

      it('should return friendly message for auth/popup-closed-by-user', () => {
        const error = ERROR_FIXTURES.popupClosed;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Sign-in was cancelled. Please try again.');
      });

      it('should return friendly message for auth/requires-recent-login', () => {
        const error = ERROR_FIXTURES.requiresRecentLogin;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('For security reasons, please sign in again to complete this action.');
      });

      it('should return friendly message for auth/user-disabled', () => {
        const error = ERROR_FIXTURES.userDisabled;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('This account has been disabled. Please contact support.');
      });

      it('should return friendly message for auth/expired-action-code', () => {
        const error = ERROR_FIXTURES.expiredActionCode;

        const message = getAuthErrorMessage(error);

        expect(message).toBe('This password reset link has expired. Please request a new one.');
      });
    });

    describe('all documented error codes', () => {
      it('should have friendly messages for all documented codes', () => {
        const documentedCodes = Object.keys(AUTH_ERROR_MESSAGES);

        for (const code of documentedCodes) {
          const error = createMockFirebaseError(code);
          const message = getAuthErrorMessage(error);

          // Should not be the default message
          expect(message).not.toBe(DEFAULT_AUTH_ERROR);
          // Should be a string
          expect(typeof message).toBe('string');
          // Should not contain 'Firebase' (user-friendly)
          expect(message.toLowerCase()).not.toContain('firebase');
        }
      });
    });

    describe('fallback behavior', () => {
      it('should return default message for unknown error code', () => {
        const error = createMockFirebaseError('auth/unknown-code');

        const message = getAuthErrorMessage(error);

        expect(message).toBe(DEFAULT_AUTH_ERROR);
      });

      it('should return default message for null error', () => {
        const message = getAuthErrorMessage(null);

        expect(message).toBe(DEFAULT_AUTH_ERROR);
      });

      it('should return default message for undefined error', () => {
        const message = getAuthErrorMessage(undefined);

        expect(message).toBe(DEFAULT_AUTH_ERROR);
      });

      it('should handle string error codes', () => {
        const message = getAuthErrorMessage('auth/invalid-email');

        expect(message).toBe('Please enter a valid email address.');
      });

      it('should return string error as-is if not a code', () => {
        const message = getAuthErrorMessage('Something went wrong');

        expect(message).toBe('Something went wrong');
      });

      it('should use error.message if user-friendly', () => {
        const error = {
          code: 'unknown',
          message: 'Custom user message',
        };

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Custom user message');
      });

      it('should not use error.message if contains Firebase', () => {
        const error = {
          code: 'unknown',
          message: 'Firebase: Some internal error (auth/internal)',
        };

        const message = getAuthErrorMessage(error);

        expect(message).toBe(DEFAULT_AUTH_ERROR);
      });
    });

    describe('edge cases', () => {
      it('should handle error object without code', () => {
        const error = { message: 'Generic error' };

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Generic error');
      });

      it('should handle error object without message', () => {
        const error = { code: 'auth/invalid-email' };

        const message = getAuthErrorMessage(error);

        expect(message).toBe('Please enter a valid email address.');
      });

      it('should handle empty object', () => {
        const message = getAuthErrorMessage({});

        expect(message).toBe(DEFAULT_AUTH_ERROR);
      });

      it('should handle number input', () => {
        const message = getAuthErrorMessage(404);

        expect(message).toBe(DEFAULT_AUTH_ERROR);
      });

      it('should handle array input', () => {
        const message = getAuthErrorMessage(['error']);

        expect(message).toBe(DEFAULT_AUTH_ERROR);
      });
    });
  });

  // ============================================
  // getAuthErrorCode
  // ============================================

  describe('getAuthErrorCode', () => {
    it('should extract code from Firebase error', () => {
      const error = ERROR_FIXTURES.invalidCredential;

      const code = getAuthErrorCode(error);

      expect(code).toBe('auth/invalid-credential');
    });

    it('should return undefined for null', () => {
      expect(getAuthErrorCode(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(getAuthErrorCode(undefined)).toBeUndefined();
    });

    it('should return undefined for string', () => {
      expect(getAuthErrorCode('error string')).toBeUndefined();
    });

    it('should return undefined for number', () => {
      expect(getAuthErrorCode(500)).toBeUndefined();
    });

    it('should return undefined for object without code', () => {
      expect(getAuthErrorCode({ message: 'error' })).toBeUndefined();
    });

    it('should return code even if empty string', () => {
      expect(getAuthErrorCode({ code: '' })).toBe('');
    });
  });

  // ============================================
  // isAuthError
  // ============================================

  describe('isAuthError', () => {
    it('should return true for matching error code', () => {
      const error = ERROR_FIXTURES.invalidCredential;

      expect(isAuthError(error, 'auth/invalid-credential')).toBe(true);
    });

    it('should return false for non-matching error code', () => {
      const error = ERROR_FIXTURES.invalidCredential;

      expect(isAuthError(error, 'auth/user-not-found')).toBe(false);
    });

    it('should return false for null error', () => {
      expect(isAuthError(null, 'auth/invalid-credential')).toBe(false);
    });

    it('should return false for error without code', () => {
      expect(isAuthError({ message: 'error' }, 'auth/invalid-credential')).toBe(false);
    });
  });

  // ============================================
  // Specific Error Checkers
  // ============================================

  describe('isUserNotFoundError', () => {
    it('should return true for user-not-found error', () => {
      const error = ERROR_FIXTURES.userNotFound;

      expect(isUserNotFoundError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isUserNotFoundError(ERROR_FIXTURES.invalidCredential)).toBe(false);
      expect(isUserNotFoundError(ERROR_FIXTURES.networkError)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isUserNotFoundError(null)).toBe(false);
    });
  });

  describe('isInvalidCredentialError', () => {
    it('should return true for invalid-credential error', () => {
      const error = ERROR_FIXTURES.invalidCredential;

      expect(isInvalidCredentialError(error)).toBe(true);
    });

    it('should return true for wrong-password error', () => {
      const error = createMockFirebaseError('auth/wrong-password');

      expect(isInvalidCredentialError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isInvalidCredentialError(ERROR_FIXTURES.userNotFound)).toBe(false);
      expect(isInvalidCredentialError(ERROR_FIXTURES.networkError)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isInvalidCredentialError(null)).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should return true for network error', () => {
      const error = ERROR_FIXTURES.networkError;

      expect(isNetworkError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isNetworkError(ERROR_FIXTURES.invalidCredential)).toBe(false);
      expect(isNetworkError(ERROR_FIXTURES.userNotFound)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isNetworkError(null)).toBe(false);
    });
  });

  describe('requiresRecentLogin', () => {
    it('should return true for requires-recent-login error', () => {
      const error = ERROR_FIXTURES.requiresRecentLogin;

      expect(requiresRecentLogin(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(requiresRecentLogin(ERROR_FIXTURES.invalidCredential)).toBe(false);
      expect(requiresRecentLogin(ERROR_FIXTURES.networkError)).toBe(false);
    });

    it('should return false for null', () => {
      expect(requiresRecentLogin(null)).toBe(false);
    });
  });

  // ============================================
  // Integration Scenarios
  // ============================================

  describe('real-world scenarios', () => {
    it('should handle sign-in failure flow', () => {
      // User enters wrong password
      const error = ERROR_FIXTURES.invalidCredential;

      const message = getAuthErrorMessage(error);
      const isCredentialError = isInvalidCredentialError(error);

      expect(message).toBe('Invalid email or password.');
      expect(isCredentialError).toBe(true);
    });

    it('should handle signup with existing email', () => {
      const error = ERROR_FIXTURES.emailInUse;

      const message = getAuthErrorMessage(error);

      expect(message).toBe('An account with this email already exists.');
    });

    it('should handle network failure during auth', () => {
      const error = ERROR_FIXTURES.networkError;

      const message = getAuthErrorMessage(error);
      const isNetwork = isNetworkError(error);

      expect(message).toBe('Network error. Please check your connection and try again.');
      expect(isNetwork).toBe(true);
    });

    it('should handle rate limiting', () => {
      const error = ERROR_FIXTURES.tooManyRequests;

      const message = getAuthErrorMessage(error);

      expect(message).toBe('Too many failed attempts. Please wait a moment and try again.');
    });

    it('should handle social auth popup closed', () => {
      const error = ERROR_FIXTURES.popupClosed;

      const message = getAuthErrorMessage(error);

      expect(message).toBe('Sign-in was cancelled. Please try again.');
    });

    it('should handle sensitive action requiring re-auth', () => {
      const error = ERROR_FIXTURES.requiresRecentLogin;

      const message = getAuthErrorMessage(error);
      const needsReauth = requiresRecentLogin(error);

      expect(message).toBe('For security reasons, please sign in again to complete this action.');
      expect(needsReauth).toBe(true);
    });
  });
});
