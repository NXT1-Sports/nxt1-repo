/**
 * Onboarding Module - Barrel Export
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
 * @module @nxt1/core/onboarding
 * @version 3.0.0
 */

// ============================================
// PERSISTENCE API
// ============================================

// Platform registry re-exported here for backward compat (@nxt1/core/onboarding imports still work)
export type {
  PlatformConnectionType,
  PlatformScope,
  PlatformCategory,
  PlatformDefinition,
} from '../platforms';
export {
  PLATFORM_REGISTRY,
  PLATFORM_CATEGORIES,
  PLATFORM_FAVICON_DOMAINS,
  getPlatformFaviconUrl,
} from '../platforms';

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
  type PositionsFormData as PersistencePositionsFormData, // @deprecated - kept for persistence backward compat
  type ContactFormData as PersistenceContactFormData, // @deprecated - kept for persistence backward compat
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
  type CreateTeamProfileFormData,

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

  // Team selection types (v4.1)
  type TeamSelectionEntry,
  type TeamSelectionFormData,
  validateTeamSelection,

  // Legacy types (deprecated)
  type PositionsFormData,
  type ContactFormData,
  type TeamFormData,
  type SchoolFormData, // @deprecated - use SportFormData
  type OrganizationFormData,
  type ReferralSourceData,
  type LinkSourcesFormData,
  type LinkSourceEntry,
  RECOMMENDED_PLATFORMS_BY_ROLE,
  getPlatformsForSports,
  getRecommendedPlatforms,
  type OnboardingFormData,
  type NavigationState,
  type InitialStateOptions,
  type UserDataForDetection,

  // Constants
  ROLE_SELECTION_STEP,
  ONBOARDING_STEPS,
  AGENT_X_ONBOARDING_MESSAGES,
  getAgentXMessage,

  // Validation functions
  validateStep,
  validateProfile,
  validateTeam,
  validateCreateTeamProfile,
  validateSchool, // @deprecated - use validateTeam
  validateOrganization,
  validateSport,
  validateSportEntry,

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

  // Invite team-skip helpers
  getSkipStepIdsForInviteUser,
  INVITE_TEAM_JOINED_KEY,
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

// ============================================
// STATE MACHINE (Portable onboarding logic)
// ============================================
export {
  // Factory
  createOnboardingStateMachine,
  type OnboardingStateMachine,

  // Types
  type OnboardingMachineState,
  type StepAnimationDirection,
  type PartialOnboardingFormData,
  type OnboardingStateSnapshot,
  type OnboardingMachineEvent,
  type OnboardingEventListener,
  type OnboardingStateMachineConfig,
  type OnboardingMachineSession,

  // Utility functions
  isValidSession,
  serializeSession,
  deserializeSession,
} from './onboarding-state-machine';

// ============================================
// WELCOME SLIDES CONFIG (Role-based content)
// ============================================
export {
  // Types
  type WelcomeSlide,
  type WelcomeSlidesConfig,
  type WelcomeSlideType,

  // Config map
  WELCOME_SLIDES_BY_ROLE,

  // Helper functions
  getWelcomeSlidesForRole,
  getPersonalizedGreeting,

  // Constants
  DEFAULT_WELCOME_SLIDES,
  WELCOME_SLIDES_COUNT,
} from './onboarding-welcome-slides.config';
