/**
 * @fileoverview Auth Module Barrel Export
 * @module @nxt1/core/auth
 *
 * Platform-agnostic authentication infrastructure.
 *
 * This module provides:
 * - Type definitions for auth state and users
 * - State management primitives
 * - Guard functions for route protection
 * - Error handling utilities
 *
 * Platform-specific implementations (Firebase SDK integration)
 * should be in the app layer, not here.
 *
 * @example
 * ```typescript
 * // Import types
 * import { AuthUser, AuthState, UserRole } from '@nxt1/core/auth';
 *
 * // Import state manager
 * import { createAuthStateManager } from '@nxt1/core/auth';
 *
 * // Import guards
 * import { requireAuth, requireRole } from '@nxt1/core/auth';
 *
 * // Import error helpers
 * import { getAuthErrorMessage } from '@nxt1/core/auth';
 * ```
 */

// Types
export {
  type UserRole,
  type AuthProvider,
  type AuthUser,
  type FirebaseUserInfo,
  type SignInCredentials,
  type SignUpCredentials,
  type PasswordResetRequest,
  type AuthState,
  type AuthResult,
  type TokenRefreshResult,
  type StoredAuthToken,
  type AuthEventType,
  type AuthEvent,
  // Native Auth Types (Capacitor)
  type NativeAuthProvider,
  type NativeAuthResult,
  type NativeAuthAvailability,
  type NativeAuthConfig,
  INITIAL_AUTH_STATE,
  isTokenExpired,
} from './auth.types';

// State Manager
export {
  type AuthStateListener,
  type AuthEventListener,
  type AuthStateManager,
  createAuthStateManager,
} from './auth-state-manager';

// Guards
export {
  type GuardResult,
  type AuthGuardOptions,
  requireAuth,
  requireGuest,
  requireRole,
  requirePremium,
  requireOnboarding,
  hasAnyRole,
  isFullyAuthenticated,
  isAuthLoading,
} from './auth-guards';

// Error Handling
export {
  type FirebaseAuthErrorCode,
  AUTH_ERROR_MESSAGES,
  DEFAULT_AUTH_ERROR,
  getAuthErrorMessage,
  getAuthErrorCode,
  isAuthError,
  isUserNotFoundError,
  isInvalidCredentialError,
  isNetworkError,
  requiresRecentLogin,
} from './auth-errors';

// Auth Flow Interface (Platform-agnostic contract)
export {
  type IAuthFlowService,
  type SignInCredentials as FlowSignInCredentials,
  type SignUpCredentials as FlowSignUpCredentials,
  type OAuthOptions,
  type ReadonlySignal,
  type AuthFlowEvent,
  type AuthFlowEventPayload,
  AUTH_FLOW_EVENTS,
  isAuthFlowService,
  createAuthFlowEvent,
} from './auth-flow.interface';

// Auth User Cache (Performance optimization)
export {
  type CachedUserProfile,
  type CachedSportData,
  type MergedUserProfile,
  type AuthUserCacheOptions,
  type AuthUserCache,
  createAuthUserCache,
  globalAuthUserCache,
} from './auth-user-cache';

// Biometric Configuration
export {
  type BiometricMethod,
  type BiometricAvailability,
  type BiometricConfig,
  type BiometricEnrollmentState,
  type BiometricSessionState,
  BIOMETRIC_METHODS,
  BIOMETRIC_AVAILABILITY,
  DEFAULT_BIOMETRIC_CONFIG,
  INITIAL_BIOMETRIC_ENROLLMENT,
  INITIAL_BIOMETRIC_SESSION,
  BIOMETRIC_STORAGE_PREFIX,
  getBiometricEnrollmentKey,
  getBiometricSettingsKey,
  shouldShowBiometricPrompt,
  hasExceededDismissals,
  getBiometricDisplayName,
  mergeBiometricConfig,
} from './biometric-config';

// Auth API - Backend HTTP calls
export {
  // Factory
  createAuthApi,
  type AuthApi,
  // Types
  type ValidateTeamCodeRequest,
  type ValidateTeamCodeResponse,
  type ValidatedTeamInfo,
  type TeamCodeValidationState,
  type OnboardingProfileData,
  type OnboardingCompleteResponse,
  type ReferralSourceData,
  type ReferralSourceResponse,
  type UserProfileResponse,
  type SendVerificationEmailRequest,
  type SendVerificationEmailResponse,
  type UsernameCheckResponse,
  type ReferralValidationResponse,
  type ApiError,
  type ApiMeta,
  type CreateUserRequest,
  type CreateUserResponse,
  type CreateUserErrorResponse,
  type CreateUserResult,
  type OnboardingStepResponse,
  // Type guards
  isCreateUserSuccess,
} from './auth.api';
