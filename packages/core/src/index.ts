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
