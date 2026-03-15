/**
 * API Module - Barrel Export
 *
 * ⭐ THIS MODULE IS 100% PORTABLE TO MOBILE ⭐
 *
 * This module provides the HttpAdapter interface - the foundation
 * for all platform-agnostic HTTP calls.
 *
 * API factories are now located in their respective feature folders:
 * - Auth API: @nxt1/core/auth
 * - Profile API: @nxt1/core/profile
 * - Onboarding API: @nxt1/core/onboarding
 * - Explore API: @nxt1/core/explore
 *
 * This module re-exports everything for backward compatibility.
 *
 * @module @nxt1/core/api
 * @version 3.0.0
 */

// ============================================
// HTTP ADAPTER (Core Infrastructure)
// ============================================
export * from './http-adapter';

// ============================================
// RE-EXPORTS FROM FEATURE FOLDERS
// For backward compatibility with existing imports
// ============================================

// Auth API (from auth/)
export {
  createAuthApi,
  type AuthApi,
  type ValidateTeamCodeRequest,
  type ValidateTeamCodeResponse,
  type ValidatedTeamInfo,
  type TeamCodeValidationState,
  type OnboardingProfileData,
  type OnboardingCompleteResponse,
  type ReferralSourceData,
  type HearAboutResponse,
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
  isCreateUserSuccess,
} from '../auth/auth.api';

// Profile API (from profile/)
export {
  createProfileApi,
  type ProfileApi,
  type ApiResponse,
  type PaginatedResponse,
  type UpdateProfileRequest,
  type UpdateSportProfileRequest,
  type ProfileSearchParams,
  type FollowResponse,
  type ProfileAnalytics,
} from '../profile/profile.api';

// File Upload API (pure TypeScript - backend-first pattern)
export {
  createFileUploadApi,
  type FileUploadApi,
  type FileCategory,
  type FileUploadMetadata,
  type FileUploadRequest,
  type FileUploadResult,
  type FileDeleteRequest,
  type UploadProgressCallback,
  type FileUploadHttpAdapter,
  type FileValidationError,
  FILE_UPLOAD_RULES,
  validateFileForUpload,
  formatFileSize,
} from './file-upload.api';

// Onboarding APIs (from onboarding/)
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
  // Analytics API (onboarding-specific)
  // NOTE: For AnalyticsAdapter, import from @nxt1/core/analytics
  createOnboardingAnalyticsApi,
  type OnboardingAnalyticsApi,
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
  type ProfileLocationData,
  type GenderOption,
  GENDER_OPTIONS,
  toUserLocation,
  type OnboardingTeamType,
  type CreateTeamProfileFormData,
  // Sport-centric types (v3.0)
  type SportTeamInfo,
  type SportEntry,
  type SportFormData,
  createEmptySportEntry,
  validateSportEntry,
  // Team selection types (v4.1)
  type TeamSelectionEntry,
  type TeamSelectionFormData,
  validateTeamSelection,
  // Legacy types (deprecated)
  type TeamFormData,
  type SchoolFormData, // @deprecated - use SportFormData
  type PositionsFormData, // @deprecated - use SportFormData
  type OrganizationFormData,
  type ContactFormData,
  // ReferralSourceData is NOT re-exported - use from auth/auth.api
  type OnboardingFormData,
  type NavigationState,
  type InitialStateOptions,
  type UserDataForDetection,
  type LinkSourcesFormData,
  type LinkSourceEntry,
  // Platform registry (sport-categorized link platforms)
  type PlatformConnectionType,
  type PlatformScope,
  type PlatformCategory,
  type PlatformDefinition,
  PLATFORM_REGISTRY,
  PLATFORM_CATEGORIES,
  RECOMMENDED_PLATFORMS_BY_ROLE,
  getPlatformsForSports,
  getRecommendedPlatforms,
  ROLE_SELECTION_STEP,
  ONBOARDING_STEPS,
  AGENT_X_ONBOARDING_MESSAGES,
  getAgentXMessage,
  validateStep,
  validateProfile,
  validateTeam,
  validateSchool, // @deprecated - use validateTeam
  validateOrganization,
  validateSport,
  validatePositions, // @deprecated - use validateSport
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
  // Session API (localStorage/sessionStorage persistence)
  createOnboardingSessionApi,
  type OnboardingSessionApi,
  type OnboardingSession,
  type SessionOptions,
  createSession,
  updateSession,
  isSessionValid,
  isSessionExpired,
  saveSession,
  loadSession,
  deleteSession,
  loadValidSession,
  saveOrCreateSession,
  // State Machine (Portable onboarding logic)
  createOnboardingStateMachine,
  type OnboardingStateMachine,
  type OnboardingMachineState,
  type StepAnimationDirection,
  type PartialOnboardingFormData,
  type OnboardingStateSnapshot,
  type OnboardingMachineEvent,
  type OnboardingEventListener,
  type OnboardingStateMachineConfig,
  type OnboardingMachineSession,
  isValidSession as isValidMachineSession,
  serializeSession,
  deserializeSession,
  // Welcome Slides Config (role-based onboarding slides)
  type WelcomeSlide,
  type WelcomeSlidesConfig,
  WELCOME_SLIDES_BY_ROLE,
  getWelcomeSlidesForRole,
  getPersonalizedGreeting,
  DEFAULT_WELCOME_SLIDES,
  WELCOME_SLIDES_COUNT,
} from '../onboarding';
