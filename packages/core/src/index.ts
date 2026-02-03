/**
 * @fileoverview @nxt1/core - Main Entry Point
 *
 * Pure TypeScript shared library for NXT1 platform.
 * 100% portable - NO platform dependencies.
 *
 * Works on:
 * - Angular (Web)
 * - Ionic/Capacitor (Mobile)
 * - Node.js (Backend/Functions)
 * - Any JavaScript environment
 *
 * @example
 * ```typescript
 * // Import everything
 * import { User, createAuthApi, formatDate, validateEmail } from '@nxt1/core';
 *
 * // Import specific modules
 * import { User, SportProfile } from '@nxt1/core/models';
 * import { USER_ROLES, PLAN_TIERS } from '@nxt1/core/constants';
 * import { createAuthApi, HttpAdapter } from '@nxt1/core/api';
 * import { formatDate, truncate } from '@nxt1/core/helpers';
 * import { validateRegistration } from '@nxt1/core/validation';
 * ```
 *
 * @version 2.0.0
 */

// ============================================
// CONSTANTS
// ============================================

export * from './constants';

// ============================================
// AI (Agent X)
// ============================================

export * from './ai';

// ============================================
// MODELS
// ============================================

export {
  // Network model
  type ConnectionType,
  type NetworkStatus,
  type NetworkChangeEvent,
  // Team code
  ROLE,
  type TeamTypeApi,
  type TeamMember,
  type TeamAnalytics,
  type Code,
  type TeamCode,
  // User model
  USER_SCHEMA_VERSION,
  type StatData,
  type SportInfo,
  type PlayerTag,
  type primarySportStat,
  type GameStat,
  type LegacyCollege,
  type CollegeVisits,
  type CollegeCamp,
  type recentGame,
  type Event,
  type Award,
  type personalBest,
  type Session,
  type TeamCustomLink,
  type OwnTemplate,
  type OwnMixtape,
  type OwnProfile,
  type UserPost,
  type GameClipsCollection,
  type Location,
  type SocialLinks,
  type ContactInfo,
  type ConnectedAccounts,
  type AcademicInfo,
  type TeamInfo,
  type CoachContact,
  type AthleticMetrics,
  type SeasonStats,
  type SeasonRecord,
  type CollegeOffer,
  type CollegeInteraction,
  type Commitment,
  type SportProfile,
  type ProfileCard,
  type VideoMedia,
  type UserMediaLibrary,
  type PaymentMethod,
  type Subscription,
  type NotificationPreferences,
  type UserPreferences,
  type UserCounters,
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
  type FanData,
  type Post,
  type Referral,
  type User,
  isAthlete,
  isCoach,
  isCollegeCoach,
  isOnboarded,
  getPrimarySport,
  getActiveSport,
  type UserUpdate,
  type UserCreate,
  type UserSummary,
  toUserSummary,
  createDefaultPreferences,
  createDefaultSubscription,
  createDefaultCounters,
  createDefaultMediaLibrary,
  createEmptySportProfile,
  // Notification model
  NOTIFICATION_SCHEMA_VERSION,
  type NotificationRecipient,
  type NotificationPayload,
  type Notification,
  type NotificationQueueItem,
  type UserNotificationSettings,
  isNotificationRead,
  isNotificationExpired,
  hasActor,
  createNotification,
  createDefaultNotificationSettings,
  type GetNotificationsQuery,
  type GetNotificationsResponse,
  type MarkNotificationsReadRequest,
  type RegisterPushTokenRequest,
  type UpdateNotificationSettingsRequest,
  // Navigation model - Mobile Footer
  type NavIconName,
  type FooterTabItem,
  type FooterVariant,
  type FooterIndicatorStyle,
  type FooterConfig,
  type FooterTabSelectEvent,
  type FooterScrollToTopEvent,
  DEFAULT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
  // Navigation model - Desktop Top Nav
  type TopNavIconName,
  type TopNavItem,
  type TopNavDropdownItem,
  type TopNavUserMenuItem,
  type TopNavUserData,
  type TopNavVariant,
  type TopNavConfig,
  type TopNavActionEvent,
  type TopNavSearchEvent,
  DEFAULT_TOP_NAV_ITEMS,
  DEFAULT_USER_MENU_ITEMS,
  TOP_NAV_HEIGHTS,
  TOP_NAV_ANIMATION,
  createTopNavConfig,
  findTopNavItemById,
  findTopNavItemByRoute,
  updateTopNavBadge,
  // Navigation model - Sidenav / Drawer
  type SidenavIconName,
  type SocialLink,
  type SidenavItem,
  type SidenavSection,
  type SidenavSportProfile,
  type SidenavUserData,
  type SidenavVariant,
  type SidenavPosition,
  type SidenavMode,
  type SidenavConfig,
  type SidenavSelectEvent,
  type SidenavToggleEvent,
  type SidenavSectionToggleEvent,
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SIDENAV_ITEMS,
  SIDENAV_WIDTHS,
  SIDENAV_Z_INDEX,
  SIDENAV_ANIMATION,
  SIDENAV_GESTURE,
  createSidenavConfig,
  findSidenavItemById,
  findSidenavItemByRoute,
  updateSidenavBadge,
  toggleSidenavSection,
  filterSidenavByRoles,
} from './models';

// ============================================
// API
// ============================================

export * from './api';

// ============================================
// HELPERS
// ============================================

export {
  // Validators
  isValidEmail,
  isValidPhone,
  formatPhone,
  isValidUrl,
  ensureHttps,
  isValidSocialHandle,
  cleanSocialHandle,
  validatePassword,
  type PasswordValidationResult,
  isValidName,
  isValidTeamCode,
  isValidGpa,
  isValidGraduationYear,
  containsProfanity,
  sanitizeText,
  type ValidationRule,
  type ValidationResult,
  validate,
  required,
  email,
  phone,
  minLength,
  maxLength,
  minValue,
  maxValue,
  // Formatters
  type DateFormat,
  formatDate,
  getRelativeTime,
  formatDuration,
  formatNumber,
  formatCompactNumber,
  formatCurrency,
  formatPercentage,
  truncate,
  capitalize,
  titleCase,
  slugify,
  camelToTitle,
  kebabToTitle,
  formatFullName,
  getInitials,
  formatAthleteName,
  formatLocation,
  formatHeight,
  formatWeight,
  formatTime,
  formatDistance,
} from './helpers';

// Validation - export avoiding duplicates with helpers
export {
  type ValidationError,
  // ValidationResult is also in helpers - use validation version for schema validation
  type ValidationResult as SchemaValidationResult,
  type Validator,
  createValidator,
  type RegistrationData,
  validateRegistration,
  type OnboardingData,
  validateOnboarding,
  type ProfileUpdateData,
  validateProfileUpdate,
  type TeamCodeData as ValidationTeamCodeData,
  validateTeamCode as validateTeamCodeSchema,
  hasFieldError,
  getFieldError,
  getErrorMap,
  combineValidations,
} from './validation';

// Auth - state management and guards (NEW)
export {
  // Types
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
  // State Manager
  type AuthStateListener,
  type AuthEventListener,
  type AuthStateManager,
  createAuthStateManager,
  // Guards
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
  // Error Handling
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
} from './auth';

// Storage - platform adapters (NEW)
export {
  type StorageAdapter,
  STORAGE_KEYS,
  createBrowserStorageAdapter,
  createMemoryStorageAdapter,
  createCapacitorStorageAdapter,
} from './storage';

// Platform - detection utilities
export {
  type Platform,
  type DeviceType,
  type Environment,
  type PlatformInfo,
  isBrowser,
  isServer,
  isSSR,
  isWorker,
  isCapacitor,
  isIOS,
  isAndroid,
  isMobileApp,
  isMobileDevice,
  isTouchDevice,
  isTablet,
  getPlatform,
  getDeviceType,
  getEnvironment,
  getPlatformInfo,
  runInBrowser,
  runOnServer,
  runInNative,
} from './platform';

// Theme - cross-platform theming utilities
export {
  type Theme,
  type ThemePreference,
  type ThemeConfig,
  DEFAULT_THEME_CONFIG,
  getSystemTheme,
  getStoredTheme,
  getEffectiveTheme,
  storeTheme,
  applyTheme,
  setTheme,
  toggleTheme,
  initializeTheme,
  watchSystemTheme,
  generateThemeInitScript,
} from './platform/theme';

// ============================================
// GEOLOCATION
// ============================================

export {
  // Position types
  type GeolocationCoordinates,
  type GeolocationPosition,
  type GeolocationError,
  type GeolocationErrorCode,
  type GeolocationOptions,
  type GeolocationPermissionStatus,
  type GeolocationResult,
  // Location data
  type ReverseGeocodedLocation,
  type LocationData,
  // Adapter interfaces
  type GeolocationAdapter,
  type ReverseGeocodingAdapter,
  type GeolocationService,
  // Factory
  createGeolocationService,
  // Browser adapter (web)
  BrowserGeolocationAdapter,
  // Capacitor adapter factory (mobile)
  createCapacitorGeolocationAdapter,
  type CapacitorGeolocationPlugin,
  // Geocoding adapters
  NominatimGeocodingAdapter,
  CachedGeocodingAdapter,
  type NominatimConfig,
  // Error utilities
  createGeolocationError,
  mapBrowserGeolocationError,
  // Location helpers
  formatLocation as formatGeoLocation,
  formatLocationShort,
  calculateDistance,
  calculateDistanceMiles,
  // Default options
  GEOLOCATION_DEFAULTS,
} from './geolocation';

// ============================================
// CACHE
// ============================================

export {
  // Types
  type CacheOptions,
  type CacheEntry,
  type CacheStats,
  type Cache,
  type CacheKeyGenerator,
  type HttpCacheOptions,
  type MemoryCacheOptions,
  type MemoryCache,
  type PersistentCacheOptions,
  type PersistentCache,
  type LRUCacheOptions,
  type LRUCache,
  // Constants
  CACHE_CONFIG,
  CACHE_KEYS,
  type CacheKeyPrefix,
  // Factories
  createMemoryCache,
  createPersistentCache,
  createLRUCache,
  // Utilities
  generateCacheKey,
  isExpired,
  createCacheKeyGenerator,
} from './cache';

// ============================================
// SEO & SOCIAL SHARING
// ============================================

export {
  // Types
  type OpenGraphType,
  type TwitterCardType,
  type PageMetadata,
  type OpenGraphMetadata,
  type TwitterMetadata,
  type SeoConfig,
  type ShareableContent,
  type ShareableProfile,
  type ShareableTeam,
  type ShareableVideo,
  type ShareablePost,
  // Functions
  buildShareUrl,
  buildProfileSeoConfig,
  buildTeamSeoConfig,
  buildVideoSeoConfig,
  truncateDescription,
  sanitizeMetaText,
} from './seo';

// ============================================
// ERRORS (Enterprise Error Handling)
// ============================================

export {
  // Types
  type ErrorSeverity,
  type ErrorCategory,
  type ErrorAction,
  type RetryInfo,
  type FieldError,
  type ApiErrorDetail,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ApiResponse,
  type ResponseMeta,
  type ApiErrorCode,
  type ErrorCodeConfig,
  type CreateApiErrorOptions,
  // Class
  NxtApiError,
  // Constants
  API_ERROR_CODES,
  ERROR_CONFIG,
  // Type guards
  isApiErrorResponse,
  isApiSuccessResponse,
  isNxtApiError,
  hasErrorCode,
  // Factory functions
  createApiError,
  validationError,
  fieldError,
  notFoundError,
  conflictError,
  unauthorizedError,
  forbiddenError,
  rateLimitError,
  internalError,
  externalServiceError,
  successResponse,
  errorResponse,
  // Parsing & handling
  parseApiError,
  getErrorMessage,
  getErrorCode,
  shouldRetry,
  getRetryDelay,
  requiresAuth,
  requiresUpgrade,
  isValidationError,
  getFieldErrors,
  getApiFieldError,
  // Config utilities
  getErrorConfig,
  getHttpStatus,
  getDefaultMessage,
  isRetryable,
  generateTraceId,
} from './errors';

// ============================================
// CREATE POST (Post Creation & Publishing)
// ============================================

export {
  // Types
  type PostType,
  type PostPrivacy,
  type UploadStatus,
  type CreatePostStatus,
  type MediaType,
  type PostMedia,
  type PostPoll,
  type PollOption,
  type PostLocation,
  type TaggableUser,
  type PostDraft,
  type CreatePostState,
  type CreatePostRequest,
  type CreatePostResponse,
  type MediaUploadRequest,
  type MediaUploadResponse,
  type PostXpBreakdown,
  type XpRewardTier,
  type PostValidationResult,
  type PostValidationError,
  type PrivacyOption,
  // Constants
  POST_MAX_CHARACTERS,
  POST_MAX_MEDIA,
  POST_MAX_TAGS,
  POST_TYPE_OPTIONS,
  PRIVACY_OPTIONS,
  XP_REWARD_TIERS,
  XP_BONUSES,
  CREATE_POST_API_ENDPOINTS,
  CREATE_POST_UI_CONFIG,
  // API Factory
  createCreatePostApi,
  type CreatePostApi,
  // Validation
  validatePost,
  validatePostContent,
  validatePostMedia,
  validateMediaItem,
  validatePoll,
  getRemainingCharacters,
} from './create-post';

// ============================================
// ACTIVITY (Notifications & Activity Feed)
// ============================================

export {
  // Types
  type ActivityTabId,
  type ActivityTab,
  type ActivityType,
  type ActivityPriority,
  type ActivitySource,
  type ActivityAction,
  type ActivityItem,
  type ActivityFilter,
  type ActivityPagination,
  type ActivityFeedResponse,
  type ActivityMarkReadResponse,
  type ActivitySummary,
  type ActivityState,
  // Constants
  ACTIVITY_TABS,
  ACTIVITY_DEFAULT_TAB,
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_COLORS,
  ACTIVITY_PRIORITY_WEIGHTS,
  ACTIVITY_PAGINATION_DEFAULTS,
  ACTIVITY_CACHE_KEYS,
  ACTIVITY_CACHE_TTL,
  ACTIVITY_EMPTY_STATES,
  ACTIVITY_API_ENDPOINTS,
  ACTIVITY_UI_CONFIG,
  // API Factory
  createActivityApi,
  type ActivityApi,
} from './activity';

// ============================================
// EXPLORE (Search & Discovery)
// ============================================

export {
  // Types
  type ExploreTabId,
  type ExploreTab,
  type ExploreSearchQuery,
  type ExploreSortOption,
  type ExploreFilters,
  type ExploreItemBase,
  type ExploreCollegeItem,
  type ExploreVideoItem,
  type ExploreAthleteItem,
  type ExploreTeamItem,
  type ExploreItem,
  type ExplorePagination,
  type ExploreSearchResponse,
  type ExploreTabCounts,
  type ExploreState,
  // Constants
  EXPLORE_TABS,
  EXPLORE_DEFAULT_TAB,
  EXPLORE_SORT_OPTIONS,
  EXPLORE_DEFAULT_SORT,
  EXPLORE_PAGINATION_DEFAULTS,
  EXPLORE_CACHE_KEYS,
  EXPLORE_CACHE_TTL,
  EXPLORE_SEARCH_CONFIG,
  EXPLORE_EMPTY_STATES,
  EXPLORE_INITIAL_STATES,
  EXPLORE_API_ENDPOINTS,
  EXPLORE_UI_CONFIG,
  EXPLORE_INITIAL_TAB_COUNTS,
  // API Factory
  createExploreApi,
  type ExploreApi,
} from './explore';

// ============================================
// PROFILE (User Profile Management)
// ============================================

export {
  // Factory
  createProfileApi,
  type ProfileApi,
  // Types (avoid conflicts with ApiResponse from errors)
  type ApiResponse as ProfileApiResponse,
  type PaginatedResponse,
  type UpdateProfileRequest,
  type UpdateSportProfileRequest,
  type ProfileSearchParams,
  type FollowResponse,
  type ProfileAnalytics,
} from './profile';

// ============================================
// ONBOARDING (User Onboarding Flow)
// ============================================

// NOTE: ReferralSourceData is already exported from auth/auth.api.
// Onboarding's ReferralSourceData is aliased to avoid conflict.
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
  type ProfileFormData as OnboardingProfileFormData,
  type OnboardingTeamType,
  type GenderOption,
  GENDER_OPTIONS,
  type ProfileLocationData,
  toUserLocation,
  // Sport-centric types (v3.0)
  type SportTeamInfo,
  type SportEntry,
  type SportFormData,
  createEmptySportEntry,
  validateSportEntry,
  // Legacy types (deprecated)
  type TeamFormData,
  type SchoolFormData,
  type PositionsFormData,
  type OrganizationFormData,
  type ContactFormData,
  // ReferralSourceData aliased to avoid conflict with auth export
  type ReferralSourceData as OnboardingReferralSourceData,
  type OnboardingFormData,
  type NavigationState,
  type InitialStateOptions,
  type UserDataForDetection,
  ROLE_SELECTION_STEP,
  ONBOARDING_STEPS,
  validateStep,
  validateProfile,
  validateTeam,
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
  // Session API
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
  // State Machine
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
  // Welcome Slides Config
  type WelcomeSlide,
  type WelcomeSlidesConfig,
  WELCOME_SLIDES_BY_ROLE,
  getWelcomeSlidesForRole,
  getPersonalizedGreeting,
  DEFAULT_WELCOME_SLIDES,
  WELCOME_SLIDES_COUNT,
} from './onboarding';

// ============================================
// PROFILE
// ============================================

export * from './profile';

// ============================================
// SETTINGS
// ============================================

export * from './settings';

// ============================================
// ANALYTICS DASHBOARD
// ============================================

export * from './analytics-dashboard';

// ============================================
// MISSIONS (Gamified Tasks & Achievements)
// ============================================

export {
  // Types - User & Role
  type MissionUserRole,
  // Types - Category
  type AthleteMissionCategory,
  type CoachMissionCategory,
  type MissionCategory,
  type MissionCategoryConfig,
  // Types - Mission
  type MissionStatus,
  type MissionPriority,
  type MissionRecurrence,
  type MissionQuickAction,
  type MissionReward,
  type Mission,
  // Types - Level
  type LevelId,
  type LevelConfig,
  // Types - Badge
  type BadgeId,
  type BadgeRarity,
  type Badge,
  type EarnedBadge,
  // Types - Streak
  type StreakStatus,
  type Streak,
  // Types - Progress
  type MissionProgress,
  type CategoryProgress,
  // Types - State & Filter
  type MissionFilter,
  type MissionSortBy,
  type SortDirection,
  type MissionsState,
  // Types - API Response
  type MissionsResponse,
  type MissionCompleteResponse,
  // Types - Celebration
  type CelebrationType,
  type CelebrationConfig,
  // Constants
  MISSION_LEVELS,
  getLevelById,
  getLevelByXp,
  calculateLevelProgress,
  ATHLETE_CATEGORIES,
  COACH_CATEGORIES,
  ALL_CATEGORIES,
  getCategoryById,
  MISSION_BADGES,
  getBadgeById,
  POINTS_CONFIG,
  CELEBRATION_CONFIGS,
  MISSIONS_UI_CONFIG,
  MISSIONS_API_ENDPOINTS,
  MISSIONS_CACHE_KEYS,
  MISSIONS_CACHE_TTL,
  // API Factory
  createMissionsApi,
  type MissionsApi,
} from './missions';

// ============================================
// SCOUT REPORTS
// ============================================

export * from './scout-reports';

// ============================================
// NEWS (Sports Recruiting News)
// ============================================

export {
  // Types
  type NewsCategoryId,
  type NewsCategory,
  type NewsSource,
  type NewsArticle,
  type ReadingProgress,
  type ReadingStats,
  type XpRewardType,
  type NewsFilter,
  type NewsPagination,
  type NewsFeedResponse,
  type NewsArticleResponse,
  type NewsBookmarkResponse,
  type NewsProgressResponse,
  type NewsState,
  // Constants
  NEWS_CATEGORIES,
  NEWS_DEFAULT_CATEGORY,
  NEWS_XP_REWARDS,
  NEWS_PAGINATION_DEFAULTS,
  NEWS_CACHE_KEYS,
  NEWS_CACHE_TTL,
  NEWS_EMPTY_STATES,
  NEWS_API_ENDPOINTS,
  NEWS_UI_CONFIG,
  NEWS_CATEGORY_BG_COLORS,
  NEWS_ANIMATION_CONFIG,
  // API Factory
  createNewsApi,
  type NewsApi,
  // Validation
  validateArticle,
  validateCategory,
  validateFilter,
  calculateReadingTime,
} from './news';

// ============================================
// EDIT PROFILE (Profile Editing)
// ============================================

export {
  // Types
  type EditProfileSectionId,
  type EditProfileSection,
  type EditProfileFieldType,
  type EditProfileField,
  type EditProfileFieldOption,
  type EditProfileFieldValidation,
  type ProfileCompletionTier,
  type ProfileCompletionData,
  type SectionCompletionData,
  type ProfileAchievement,
  type EditProfileBasicInfo,
  type EditProfilePhotos,
  type EditProfileSportsInfo,
  type EditProfileAcademics,
  type EditProfilePhysical,
  type EditProfileSocialLinks,
  type EditProfileContact,
  type EditProfileFormData,
  type EditProfileUpdateResponse,
  type EditProfileData,
  type EditProfileState,
  // Constants
  PROFILE_COMPLETION_TIERS,
  getCompletionTier,
  getNextTier,
  EDIT_PROFILE_SECTIONS,
  getEditProfileSection,
  EDIT_PROFILE_XP_REWARDS,
  EDIT_PROFILE_VALIDATION,
  // API Factory
  createEditProfileApi,
  type EditProfileApi,
} from './edit-profile';

// ============================================
// INVITE (Referral & Sharing)
// ============================================

export * from './invite';
