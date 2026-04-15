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
 * import { USER_ROLES, BILLING_INTERVALS } from '@nxt1/core/constants';
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
// BROWSER (In-App Browser Types & Utilities)
// ============================================

export * from './browser';

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
  type Location,
  type SocialLinks,
  type UserSocialLink,
  type ContactInfo,
  type ConnectedSource,
  type EmailProvider,
  type ConnectedEmail,
  type EmailTokenData,
  type AcademicInfo,
  type TeamInfo,
  type CoachContact,
  // 2026 Agentic Architecture (schema-driven, self-describing)
  type DataSource,
  type VerifiedMetric,
  type VerifiedStat,
  type ScheduleEvent,
  // Agent X & Scouting (source-of-truth domain types)
  type PlayerArchetype,
  type AgentXTrait,
  type SeasonStats,
  type SeasonRecord,
  // Recruiting (2026 unified architecture)
  type RecruitingActivity,
  type RecruitingCategory,
  type RecruitingSummary,
  type SportProfile,
  type SportVerification,
  type DataVerification,
  type VerificationScope,
  type TeamHistoryEntry,
  type UserAward,
  type VideoMedia,
  type UserMediaLibrary,
  type PaymentMethod,
  type Subscription,
  type NotificationPreferences,
  type UserPreferences,
  type UserCounters,
  type AthleteData,
  type CoachData,
  type DirectorData,
  type RecruiterData,
  type ParentData,
  type Post,
  type User,
  type UserSummary,
  isAthlete,
  isCoach,
  isCollegeCoach,
  isOnboarded,
  isVerified,
  getPrimarySport,
  getActiveSport,
  getSportByName,
  playsSport,
  getTotalOffers,
  getAllAwards,
  isMultiSport,
  isCommitted,
  getDisplayName,
  getProfileImg,
  getProfileImages,
  getGalleryImages,
  getSocialUrl,
  getClassOf,
  getConnectedSource,
  createDefaultSubscription,
  createDefaultMediaLibrary,
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
  type DispatchNotificationInput,
  // Navigation model - Mobile Footer
  type NavIconName,
  type FooterTabItem,
  type FooterVariant,
  type FooterIndicatorStyle,
  type FooterConfig,
  type FooterTabSelectEvent,
  type FooterScrollToTopEvent,
  DEFAULT_NAVIGATION_SURFACE_CONFIG,
  DEFAULT_FOOTER_TABS,
  CENTERED_CREATE_FOOTER_TABS,
  AGENT_X_CENTER_FOOTER_TABS,
  AGENT_X_LEFT_FOOTER_TABS,
  type FooterTabContext,
  buildDynamicFooterTabs,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  MAIN_PAGE_ROUTES,
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
  isMainPageRoute,
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
  shouldShowUsage,
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
  // User Display Context
  type UserDisplayInput,
  type UserDisplayFallback,
  type UserDisplayContext,
  buildUserDisplayContext,
  deduplicateSportProfiles,
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
  normalizeName,
  slugify,
  buildTeamSlug,
  type CanonicalProfilePathInput,
  type CanonicalTeamPathInput,
  buildCanonicalProfilePath,
  buildCanonicalTeamPath,
  camelToTitle,
  kebabToTitle,
  formatFullName,
  getInitials,
  formatAthleteName,
  formatLocation,
  formatHeight,
  formatWeight,
  normalizeWeightDisplay,
  isFemaleGender,
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
  type ShareableArticle,
  type ProfileShareSource,
  type TeamShareSource,
  type PostShareSource,
  type ArticleShareSource,
  type InviteShareSource,
  type InviteUiCopy,
  // Functions
  buildShareUrl,
  buildProfileSeoConfig,
  buildTeamSeoConfig,
  buildVideoSeoConfig,
  truncateDescription,
  sanitizeMetaText,
  buildProfileShareTitle,
  buildProfileShareText,
  buildProfileShareDescription,
  buildTeamShareTitle,
  buildTeamShareText,
  buildTeamShareDescription,
  buildPostShareTitle,
  buildPostShareText,
  buildPostShareDescription,
  buildArticleShareTitle,
  buildArticleShareText,
  buildArticleShareDescription,
  buildInviteShareTitle,
  buildInviteShareText,
  buildInviteUiCopy,
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
  type AgentTaskActivityMetadata,
  // Constants
  ACTIVITY_TABS,
  ACTIVITY_TABS_ALERTS_ONLY,
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
  INBOX_EMAIL_PROVIDERS,
  type InboxEmailProvider,
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
  EXPLORE_FEED_TAB_IDS,
  isFeedTab,
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
  EXPLORE_FILTER_SPORT_OPTIONS,
  EXPLORE_FILTER_DIVISION_OPTIONS,
  EXPLORE_FILTER_STATE_OPTIONS,
  resolveStateToAbbreviation,
  EXPLORE_FILTER_RADIUS_CONFIG,
  EXPLORE_FILTER_CLASS_YEAR_SPAN,
  getExploreFilterClassYearOptions,
  EXPLORE_TAB_FILTER_FIELDS,
  // API Factory
  createExploreApi,
  type ExploreApi,
} from './explore';

// ============================================
// MESSAGES (Conversations & Direct Messages)
// ============================================

export {
  // Types
  type MessageStatus,
  type ConversationType,
  type ParticipantRole,
  type ConversationParticipant,
  type MessageAttachment,
  type Message,
  type Conversation,
  type MessagesFilterId,
  type MessagesFilter,
  type MessagesPagination,
  type ConversationsResponse,
  type MessagesThreadResponse,
  type SendMessageRequest,
  type CreateConversationRequest,
  type MessagesState,
  // Constants
  MESSAGES_FILTERS,
  MESSAGES_DEFAULT_FILTER,
  MESSAGES_PAGINATION_DEFAULTS,
  MESSAGES_CACHE_KEYS,
  MESSAGES_CACHE_TTL,
  MESSAGES_SEARCH_CONFIG,
  MESSAGES_EMPTY_STATES,
  MESSAGES_API_ENDPOINTS,
  MESSAGES_UI_CONFIG,
  MESSAGES_INITIAL_PAGINATION,
  // API Factory
  createMessagesApi,
  type MessagesApi,
} from './messages';

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
  type ProfileAnalytics,
  type ProfileSeasonGameLog,
  // Verification helpers
  getVerification,
  getAllVerifications,
  getVerificationScopesForTab,
  // Schedule helpers (pure functions)
  mapProfileEventsToScheduleRows,
  filterScheduleEvents,
  getScheduleSeasons,
  getSeasonForDate,
  type ProfileScheduleContext,
} from './profile';

// ============================================
// TEAM PROFILE (Public-Facing Team Pages)
// ============================================

export {
  // Factory
  createTeamProfileApi,
  type TeamProfileApi,
  // Types
  type TeamProfileApiResponse,
  type TeamProfilePaginatedResponse,
  type TeamProfileSearchParams,
  // Core types
  type TeamProfileTabId,
  type TeamProfileTab,
  type TeamProfileType,
  type TeamProfileTeam,
  type TeamProfileRecord,
  type TeamProfileBranding,
  type TeamProfileSocialLink,
  type TeamProfileContact,
  type TeamProfileLinks,
  type TeamProfileSponsor,
  type TeamProfileRosterMember,
  type TeamProfileRosterSortOption,
  type TeamProfileScheduleEvent,
  type TeamProfileGameResult,
  type TeamProfileStat,
  type TeamProfileStatsCategory,
  type TeamProfileStaffMember,
  type TeamProfileRecruitingActivity,
  type TeamProfileRecruitingCategory,
  type TeamProfileQuickStats,
  type TeamProfilePostType,
  type TeamProfilePost,
  type TeamProfileHeaderAction,
  type TeamProfilePageData,
  // Constants
  TEAM_PROFILE_TABS,
  TEAM_PROFILE_DEFAULT_TAB,
  TEAM_PROFILE_EMPTY_STATES,
  TEAM_PROFILE_CACHE_KEYS,
  TEAM_PROFILE_UI_CONFIG,
  TEAM_PROFILE_ROSTER_SORT_LABELS,
  TEAM_PROFILE_TYPE_LABELS,
  TEAM_PROFILE_TYPE_ICONS,
  TEAM_PROFILE_POST_TYPE_ICONS,
  TEAM_PROFILE_POST_TYPE_LABELS,
  TEAM_PROFILE_VERIFICATION_HIDDEN_TABS,
  TEAM_PROFILE_QUICK_STATS_CONFIG,
  TEAM_PROFILE_ADMIN_HEADER_ACTIONS,
  TEAM_PROFILE_VISITOR_HEADER_ACTIONS,
  TEAM_RECRUITING_CATEGORY_ICONS,
  TEAM_RECRUITING_CATEGORY_LABELS,
  // Stats helpers
  mapTeamStatsToGameLogs,
  formatSeasonLabel,
  buildSeasonRecordMap,
  // News helpers
  mapTeamPostsToNewsBoardItems,
} from './team-profile';

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
  type PersistenceFormData,
  type PersistenceUserType,
  DEFAULT_RETRY_CONFIG,
  categorizeError,
  calculateBackoffDelay,
  delay,
  withRetry,
  buildUserUpdatePayload,
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
  type OrganizationFormData,
  type PositionsFormData,
  type ContactFormData,
  // ReferralSourceData aliased to avoid conflict with auth export
  type ReferralSourceData as OnboardingReferralSourceData,
  type OnboardingFormData,
  type NavigationState,
  type InitialStateOptions,
  type UserDataForDetection,
  ROLE_SELECTION_STEP,
  ONBOARDING_STEPS,
  AGENT_X_ONBOARDING_MESSAGES,
  validateStep,
  validateProfile,
  validateTeam,
  validateSchool,
  validateOrganization,
  validateSport,
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
  // Invite team-skip helpers
  getSkipStepIdsForInviteUser,
  INVITE_TEAM_JOINED_KEY,
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
// TIMELINE (Shared vertical-timeline types)
// ============================================

export * from './timeline';

// ============================================
// CONTENT CARD (Unified activity content primitive)
// ============================================

export * from './content-card';

// ============================================
// SETTINGS
// ============================================

export * from './settings';

// ============================================
// SCOUT REPORTS
// ============================================

export * from './scout-reports';

// ============================================
// FEED (Home Feed / Social Posts)
// ============================================

export {
  // Post types
  type FeedPostType,
  type FeedPostVisibility,
  type FeedAuthorRole,
  type FeedVerificationStatus,
  // Author types
  type FeedAuthor,
  // Media types
  type FeedMedia,
  type FeedOfferData,
  type FeedCommitmentData,
  type FeedMilestoneData,
  // Activity data types (unified timeline)
  type FeedVisitData,
  type FeedCampData,
  type FeedStatUpdateData,
  type FeedStatLine,
  type FeedMetricsData,
  type FeedMetricLine,
  type FeedAwardData,
  type FeedNewsData,
  type FeedScheduleData,
  type FeedExternalSource,
  type FeedAcademicData,
  // Engagement types
  type FeedEngagement,
  type FeedUserEngagement,
  type FeedReactionType,
  // Tag types
  type FeedPostTagType,
  type FeedPostTag,
  // Repost types
  type FeedRepostData,
  // Main post type
  type FeedPost,
  // Filter types
  type FeedFilter,
  type FeedPagination,
  // Response types
  type FeedResponse,
  type FeedPostResponse,
  type FeedActionResponse,
  // Comment types
  type FeedCommentAuthor,
  type FeedComment,
  type FeedCommentsResponse,
  // Polymorphic feed item types (2026 standard)
  type FeedItemType,
  type FeedItemBase,
  type FeedItemPost,
  type FeedItemEvent,
  type FeedItemStat,
  type FeedItemMetric,
  type FeedItemOffer,
  type FeedItemCommitment,
  type FeedItemVisit,
  type FeedItemCamp,
  type FeedItemAward,
  type FeedItemNews,
  type FeedItemScoutReport,
  type FeedItemAcademic,
  type FeedItemSharedReference,
  type FeedItem,
  isFeedItemPost,
  isFeedItemEvent,
  isFeedItemStat,
  isFeedItemSharedReference,
  type FeedItemResponse,
  type FeedPointer,
  // Constants
  FEED_API_ENDPOINTS,
  FEED_PAGINATION_DEFAULTS,
  FEED_POST_TYPE_ICONS,
  FEED_POST_TYPE_LABELS,
  FEED_POST_TYPE_COLORS,
  FEED_TAG_TYPE_ICONS,
  FEED_MAX_VISIBLE_TAGS,
  type FeedEngagementAction,
  FEED_ENGAGEMENT_ICONS,
  FEED_UI_CONFIG,
  FEED_CACHE_KEYS,
  FEED_CACHE_TTLS,
  // API Factory
  createFeedApi,
  type FeedApi,
  // Mappers
  profileUserToFeedAuthor,
  profilePostToFeedPost,
  teamToFeedAuthor,
  teamPostToFeedPost,
  teamPostsToFeedPosts,
  profilePostsToFeedPosts,
  profileOfferToFeedPost,
  profileEventToFeedPost,
  buildUnifiedActivityFeed,
  // Polymorphic mappers (2026 standard)
  feedPostToFeedItem,
  eventDocToFeedItemEvent,
  statDocToFeedItemStat,
  recruitingDocToFeedItemVariant,
  metricGroupToFeedItemMetric,
  rankingDocToFeedItemAward,
  profileOfferToFeedItemOffer,
  profileEventToFeedItemVariant,
  buildPolymorphicActivityFeed,
} from './feed';

// ============================================
// NEWS (Sports Recruiting News)
// ============================================

export {
  // Types
  type NewsCategoryId,
  type NewsCategory,
  type NewsArticle,
  type NewsFilter,
  type NewsPagination,
  type NewsFeedResponse,
  type NewsArticleResponse,
  type NewsState,
  // Constants
  NEWS_CATEGORIES,
  NEWS_DEFAULT_CATEGORY,
  NEWS_PAGINATION_DEFAULTS,
  NEWS_CACHE_KEYS,
  NEWS_CACHE_TTL,
  ARTICLE_TTL_DAYS,
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
  // News Board (shared display adapter)
  type NewsBoardCategory,
  type NewsBoardItem,
  mapNewsArticlesToBoardItems,
  resolveNewsFaviconUrl,
} from './news';

// ============================================
// HELP CENTER (AI-Powered Help & Documentation)
// ============================================

export {
  // Types
  type HelpCategoryId,
  type HelpCategory,
  type HelpContentType,
  type HelpUserType,
  type ArticleTableOfContents,
  type RelatedContent,
  type HelpArticle,
  type FaqItem,
  type FaqSection,
  type ChatMessageRole,
  type ChatAttachmentType,
  type ChatAttachment,
  type ChatMessage,
  type ChatSession,
  type ChatQuickAction,
  type HelpSearchResult,
  type HelpSearchFilter,
  type TicketPriority,
  type TicketStatus,
  type TicketCategory,
  type SupportTicketRequest,
  type SupportTicket,
  type ArticleFeedback,
  type HelpCenterHome,
  type HelpCategoryDetail,
  type HelpSearchResponse,
  type HelpPagination,
  type HelpCenterHomeResponse,
  type HelpCategoryDetailResponse,
  type HelpArticleResponse,
  type HelpSearchApiResponse,
  type ChatMessageResponse,
  type SupportTicketResponse,
  type ArticleFeedbackResponse,
  // Constants
  HELP_CATEGORIES,
  HELP_DEFAULT_CATEGORY,
  HELP_CATEGORY_COLORS,
  HELP_CATEGORY_ICON_CLASSES,
  HELP_CONTENT_TYPES,
  HELP_USER_TYPES,
  HELP_AI_CONFIG,
  HELP_QUICK_ACTIONS,
  HELP_SEARCH_CONFIG,
  HELP_API_ENDPOINTS,
  HELP_PAGINATION_DEFAULTS,
  HELP_CACHE_KEYS,
  HELP_CACHE_TTL,
  HELP_SUPPORT_CONFIG,
  HELP_ANALYTICS_EVENTS,
  // API Factory
  createHelpCenterApi,
  type HelpCenterApi,
  // Validation
  validateSearchFilter,
  validateSupportTicket,
  validateArticleFeedback,
  validateChatMessage,
  sanitizeHtml,
  htmlToPlainText,
  type ValidationResult as HelpValidationResult,
  type ValidationError as HelpValidationError,
  // Helpers
  getCategoryById as getHelpCategoryById,
  getCategoriesForUser,
  sortCategories,
  isArticleNew,
  isArticleUpdated,
  formatVideoDuration,
  formatReadingTime as formatHelpReadingTime,
  getContentTypeConfig,
  calculateHelpfulnessPercent,
  filterArticlesByUserType,
  sortArticles,
  highlightSearchMatches,
  generateSearchExcerpt,
  calculateSearchScore,
  generateMessageId,
  generateSessionId,
  createUserMessage,
  createAssistantMessage,
  createStreamingMessage,
  extractSessionTitle,
  generateSlug,
  buildArticlePath,
  buildCategoryPath,
  buildSearchPath,
  formatRelativeTime as formatHelpRelativeTime,
  formatArticleDate,
} from './help-center';

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
  type EditProfileSocialLinkEntry,
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

// ============================================
// MANAGE TEAM (Team Management)
// ============================================

export * from './manage-team';

// ============================================
// USAGE (Payments Usage Dashboard)
// ============================================

export * from './usage';

// ============================================
// SPORT LANDING (Sport-Vertical Marketing Pages)
// ============================================

export * from './sport-landing';

// ============================================
// ANALYTICS (Analytics Types)
// ============================================

export * from './analytics/analytics.types';

// ============================================
// INTEL (AI-Generated Profile Intelligence)
// ============================================

export * from './intel';
