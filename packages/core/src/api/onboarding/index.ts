/**
 * Onboarding API - Barrel Export
 *
 * ⭐ THIS MODULE IS 100% PORTABLE TO MOBILE ⭐
 *
 * Exports all pure TypeScript functions for onboarding operations.
 * These APIs have NO framework dependencies and can be used in:
 * - Angular (Web)
 * - React Native (Mobile)
 * - Node.js (Server/Testing)
 * - Any JavaScript environment
 *
 * NOTE: For AnalyticsAdapter and platform-agnostic analytics,
 * import from '@nxt1/core/analytics' directly.
 *
 * @module @nxt1/core/api/onboarding
 * @version 3.0.0
 */

// ============================================
// PERSISTENCE API
// ============================================
export {
  // Factory
  createOnboardingPersistenceApi,
  type OnboardingPersistenceApi,

  // Adapter interface
  type FirestoreAdapter,

  // Types
  type RetryConfig,
  type OperationResult,
  type RetryErrorType,
  type OnboardingPersistenceState,
  type TeamCodePrefillData as PersistenceTeamCodePrefillData,
  type ReferralSourceData as PersistenceReferralSourceData,
  type ProfileFormData as PersistenceProfileFormData,
  type SchoolFormData as PersistenceSchoolFormData,
  type OrganizationFormData as PersistenceOrganizationFormData,
  type SportFormData as PersistenceSportFormData,
  type PositionsFormData as PersistencePositionsFormData,
  type ContactFormData as PersistenceContactFormData,
  type OnboardingFormData as PersistenceFormData,
  type OnboardingUserType as PersistenceUserType,

  // Constants
  DEFAULT_RETRY_CONFIG,

  // Pure functions
  categorizeError,
  calculateBackoffDelay,
  delay,
  withRetry,
  buildUserUpdatePayload,
  buildReferralSourcePayload,
} from './onboarding-persistence.api';

// ============================================
// ANALYTICS API (Onboarding-specific)
// Uses AnalyticsAdapter from @nxt1/core/analytics
// ============================================
export {
  // Factory
  createOnboardingAnalyticsApi,
  type OnboardingAnalyticsApi,

  // Types
  type OnboardingAnalyticsEvent,
  type StepTrackingPayload,
  type CompletionTrackingPayload,
  type StartedTrackingParams,
  type StepTrackingParams,
  type CompletionTrackingParams,
  type OnboardingStep as AnalyticsOnboardingStep,
  type OnboardingStepId as AnalyticsOnboardingStepId,
  type OnboardingUserType as AnalyticsUserTypeBase,

  // Pure functions
  toAnalyticsUserType,
  buildStepPayload,
  buildCompletionPayload,
  buildUserProperties,
} from './onboarding-analytics.api';

// ============================================
// NAVIGATION API
// ============================================
export {
  // Factory
  createOnboardingNavigationApi,
  type OnboardingNavigationApi,

  // Types
  type OnboardingUserType,
  type OnboardingStepId,
  type OnboardingStep,
  type TeamCodePrefillData,
  type ProfileFormData,
  type OnboardingTeamType,

  // Gender & Location types (v3.1)
  type GenderOption,
  GENDER_OPTIONS,
  type ProfileLocationData,
  toUserLocation,

  // Sport-centric types (v3.0)
  type SportTeamInfo,
  type SportEntry,
  type SportFormData,
  createEmptySportEntry,

  // Legacy types (deprecated)
  type TeamFormData,
  type SchoolFormData, // @deprecated - use SportFormData
  type PositionsFormData, // @deprecated - use SportFormData
  type OrganizationFormData,
  type ContactFormData,
  type ReferralSourceData,
  type OnboardingFormData,
  type NavigationState,
  type InitialStateOptions,
  type UserDataForDetection,

  // Constants
  ROLE_SELECTION_STEP,
  ONBOARDING_STEPS,

  // Validation functions
  validateStep,
  validateProfile,
  validateTeam,
  validateSchool, // @deprecated - use validateTeam
  validateOrganization,
  validateSport,
  validateSportEntry,
  validatePositions, // @deprecated - use validateSport
  validateContact,

  // Navigation functions
  canNavigateNext,
  canNavigatePrevious,
  canNavigateToStep,
  getNextStepIndex,
  getPreviousStepIndex,
  isLastStep,
  isFirstStep,
  calculateProgress,

  // User type detection
  mapTeamCodeRole,
  detectUserTypeFromTeamCode,
  detectUserTypeFromUserData,
  mapTeamType,

  // Step configuration
  getStepsForUserType,
  configureStepsForUserType,
  buildInitialFormDataFromTeamCode,
  buildInitialFormDataFromUser,
  getRedirectPath,
} from './onboarding-navigation.api';

// ============================================
// SESSION API (localStorage/sessionStorage)
// ============================================
export {
  // Factory
  createOnboardingSessionApi,
  type OnboardingSessionApi,

  // Types
  type OnboardingSession,
  type SessionOptions,

  // Pure functions
  createSession,
  updateSession,
  isSessionValid,
  isSessionExpired,
  saveSession,
  loadSession,
  deleteSession,
  loadValidSession,
  saveOrCreateSession,
} from './onboarding-session.api';
