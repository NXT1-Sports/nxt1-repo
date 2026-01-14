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
  // Team code
  ROLE,
  TEAM_TYPE,
  type TeamTypeApi,
  type TeamMember,
  type TeamAnalytics,
  type Analytic,
  type Code,
  type TeamCode,
  // User model
  USER_SCHEMA_VERSION,
  type Location,
  type SocialLinks,
  type ContactInfo,
  type ConnectedAccounts,
  type AcademicInfo,
  type TeamInfo,
  type CoachContact,
  type AthleticMetrics,
  type SeasonStats,
  type GameStats,
  type SeasonRecord,
  type CollegeOffer,
  type CollegeInteraction,
  type Commitment,
  type SportProfile,
  type ProfileCard,
  type VideoMedia,
  type UserMedia,
  type PaymentMethod,
  type Subscription,
  type NotificationPreferences,
  type UserPreferences,
  type UserCounters,
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
  type FanData,
  type UserPost,
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
  createDefaultMedia,
  createEmptySportProfile,
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

/**
 * @deprecated UI Components and Services have moved to @nxt1/ui
 *
 * Import from @nxt1/ui instead:
 * ```typescript
 * // Components
 * import { NxtLogoComponent, AuthShellComponent } from '@nxt1/ui';
 * import { AuthEmailFormComponent, AuthSocialButtonsComponent } from '@nxt1/ui/auth';
 *
 * // Services
 * import { NxtPlatformService } from '@nxt1/ui/services';
 * ```
 *
 * This keeps @nxt1/core as pure TypeScript with no Angular/Ionic dependencies,
 * allowing it to be used in backend, functions, and any JavaScript environment.
 */
