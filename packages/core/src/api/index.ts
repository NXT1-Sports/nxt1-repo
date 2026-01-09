/**
 * API Barrel Export
 *
 * ⭐ THIS MODULE IS 100% PORTABLE TO MOBILE ⭐
 *
 * Exports all pure TypeScript API functions.
 * NO framework dependencies - works everywhere.
 *
 * NOTE: ReferralSourceData exists in both auth.api and onboarding - we re-export
 * from auth.api as the canonical version
 *
 * @module @nxt1/core/api
 * @version 2.0.0
 */

// HTTP Adapter (platform abstraction)
export * from './http-adapter';

// Auth API - all exports
export * from './auth.api';

// Profile API
export * from './profile.api';

// Onboarding APIs - re-export with aliases to avoid ReferralSourceData conflict
export {
  // Persistence API
  createOnboardingPersistenceApi,
  type OnboardingPersistenceApi,
  type FirestoreAdapter,
  type RetryConfig,
  type OperationResult,
  type RetryErrorType,
  type OnboardingPersistenceState,
  type PersistenceTeamCodePrefillData,
  type PersistenceReferralSourceData,
  type PersistenceProfileFormData,
  type PersistenceSchoolFormData,
  type PersistenceOrganizationFormData,
  type PersistenceSportFormData,
  type PersistencePositionsFormData,
  type PersistenceContactFormData,
  type PersistenceFormData,
  type PersistenceUserType,
  DEFAULT_RETRY_CONFIG,
  categorizeError,
  calculateBackoffDelay,
  delay,
  withRetry,
  buildUserUpdatePayload,
  buildReferralSourcePayload,
  // Analytics API
  createOnboardingAnalyticsApi,
  type OnboardingAnalyticsApi,
  type AnalyticsAdapter,
  type AnalyticsUserType,
  type OnboardingAnalyticsEvent,
  type StepTrackingPayload,
  type CompletionTrackingPayload,
  type StartedTrackingParams,
  type StepTrackingParams,
  type CompletionTrackingParams,
  type AnalyticsOnboardingStep,
  type AnalyticsOnboardingStepId,
  type AnalyticsUserTypeBase,
  toAnalyticsUserType,
  buildStepPayload,
  buildCompletionPayload,
  buildUserProperties,
  // Navigation API
  createOnboardingNavigationApi,
  type OnboardingNavigationApi,
  type OnboardingUserType,
  type OnboardingStepId,
  type OnboardingStep,
  type TeamCodePrefillData,
  type ProfileFormData,
  type SchoolFormData,
  type OrganizationFormData,
  type SportFormData,
  type PositionsFormData,
  type ContactFormData,
  // ReferralSourceData is NOT re-exported - use from auth.api
  type OnboardingFormData,
  type NavigationState,
  type InitialStateOptions,
  type UserDataForDetection,
  ROLE_SELECTION_STEP,
  ONBOARDING_STEPS,
  validateStep,
  validateProfile,
  validateSchool,
  validateOrganization,
  validateSport,
  validatePositions,
  validateContact,
  canNavigateNext,
  canNavigatePrevious,
  canNavigateToStep,
  getNextStepIndex,
  getPreviousStepIndex,
  isLastStep,
  isFirstStep,
  calculateProgress,
  mapTeamCodeRole,
  detectUserTypeFromTeamCode,
  detectUserTypeFromUserData,
  mapTeamType,
  getStepsForUserType,
  configureStepsForUserType,
  buildInitialFormDataFromTeamCode,
  buildInitialFormDataFromUser,
  getRedirectPath,
} from './onboarding';


