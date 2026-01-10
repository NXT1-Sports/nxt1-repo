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
 * NOTE: Uses explicit exports to avoid duplicate symbol conflicts.
 * Some symbols (PLANS, PostType, UserReaction) exist in both models and constants.
 * We export the constants versions by default.
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

// Constants - all exports (includes PLANS, PostType, UserReaction)
export * from './constants';

// Models - export avoiding duplicates with constants
// PLANS is in both common.types and user.constants - use constants version
// PostType/UserReaction in both user.model and user.constants - use constants version
export {
  // Common types (excluding PLANS - use from constants)
  type FirestoreTimestamp,
  type StatType,
  type CompetitionLevel,
  type PrimarySportStat,
  type GameStat,
  type SocialLinks,
  type ContactInfo,
  type TeamLinks,
  type TeamCustomLink,
  type RecentGame,
  type PersonalBest,
  type Session,
  type Award,
  type UserEvent,
  type SeasonRecord,
  type PaymentInfo,
  type Referral,
  type AiCopilotUsage,
  type TeamCodeTrial,
  type VideoParam,
  type GameClip,
  type GameClipsCollection,
  // Legacy aliases
  type primarySportStat,
  type recentGame,
  type personalBest,
  // Team code model
  ROLE,
  TEAM_TYPE,
  type TeamTypeApi,
  type TeamMember,
  type TeamAnalytics,
  type Analytic,
  type Code,
  type TeamCode,
  // User model (excluding PostType, UserReaction - use from constants)
  type College,
  type CollegeVisit,
  type CollegeCamp,
  type CollegeVisits,
  type OwnTemplate,
  type OwnMixtape,
  type OwnProfile,
  type MentionData,
  type AttachedProfileData,
  type VideoMetadata,
  type UserPost,
  type User,
  type Social,
  type SocialResponse,
  type GoogleAdditionalUserInfo,
  type GoogleProfile,
  type AuthCredential,
  // User V2 model
  USER_SCHEMA_VERSION,
  type Location,
  type SocialLinksV2,
  type ContactInfoV2,
  type ConnectedAccounts,
  type AcademicInfo,
  type TeamInfo,
  type CoachContact,
  type AthleticMetrics,
  type SeasonStats,
  type GameStats,
  type SeasonRecordV2,
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
  type UserCountersV2,
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
  type FanData,
  type UserPostV2,
  type ReferralV2,
  type UserV2,
  isAthlete,
  isCoach,
  isCollegeCoach,
  isOnboarded,
  getPrimarySport,
  getActiveSport,
  type UserV2Update,
  type UserV2Create,
  type UserV2Summary,
  toUserSummary,
  createDefaultPreferences,
  createDefaultSubscription,
  createDefaultCounters,
  createDefaultMedia,
  createEmptySportProfile,
} from './models';

// API - all unique exports
export * from './api';

// Helpers - export avoiding duplicates with validation.constants
// isValidEmail and isValidUrl are in both - use helpers versions for this export
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

// Components - shared Angular components
export { NxtLogoComponent, type LogoSize, type LogoVariant } from './components';
export { AuthShellComponent, type AuthShellVariant } from './components';
export { AuthSocialButtonsComponent, type SocialProvidersConfig } from './components';
export { AuthDividerComponent } from './components';
export {
  AuthEmailFormComponent,
  type AuthEmailFormData,
  type AuthEmailFormMode,
} from './components';

// Services - Angular injectable services (requires Ionic)
export {
  NxtPlatformService,
  type DeviceType as PlatformDeviceType,
  type OperatingSystem,
  type Orientation,
  type IonicMode,
  type PlatformCapabilities,
  type ViewportInfo,
  BREAKPOINTS,
} from './services';
