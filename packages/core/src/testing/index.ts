/**
 * @fileoverview Testing Constants & Utilities
 * @module @nxt1/core/testing
 *
 * ⭐ SHARED TESTING INFRASTRUCTURE FOR WEB AND MOBILE ⭐
 *
 * This module provides:
 * - Test ID constants for E2E testing (Playwright, Appium, Detox)
 * - Auth test fixtures (mock users, states, tokens, credentials)
 * - Auth test mocks (storage adapter, state manager)
 * - Helper utilities (deferred promises, spies, assertions)
 *
 * @example Unit Tests
 * ```typescript
 * import {
 *   createMockStorageAdapter,
 *   createMockAuthStateManager,
 *   USER_FIXTURES,
 *   STATE_FIXTURES,
 * } from '@nxt1/core/testing';
 *
 * const storage = createMockStorageAdapter();
 * const authManager = createMockAuthStateManager(storage);
 * await authManager.setUser(USER_FIXTURES.athlete);
 * ```
 *
 * @example E2E Tests
 * ```typescript
 * import { AUTH_TEST_IDS } from '@nxt1/core/testing';
 *
 * this.googleButton = page.getByTestId(AUTH_TEST_IDS.BTN_GOOGLE);
 * this.emailInput = page.getByTestId(AUTH_TEST_IDS.INPUT_EMAIL);
 * ```
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// AUTH TEST FIXTURES
// ============================================

export {
  // Time constants
  TEST_BASE_TIMESTAMP,
  ONE_HOUR,
  ONE_DAY,
  TOKEN_TTL,
  // ID generators
  generateTestUserId,
  resetFixtureCounters,
  // User fixtures
  DEFAULT_MOCK_USER,
  createMockAuthUser,
  USER_FIXTURES,
  createMockFirebaseUser,
  // State fixtures
  createMockAuthState,
  STATE_FIXTURES,
  // Token fixtures
  createMockToken,
  TOKEN_FIXTURES,
  // Credential fixtures
  createMockSignInCredentials,
  createMockSignUpCredentials,
  CREDENTIAL_FIXTURES,
  // Error fixtures
  createMockFirebaseError,
  ERROR_FIXTURES,
  // Combined export
  AUTH_FIXTURES,
  // Types
  type MockFirebaseError,
} from './auth-fixtures';

// ============================================
// AUTH TEST MOCKS
// ============================================

export {
  // Storage adapter mock
  createMockStorageAdapter,
  type MockStorageAdapter,
  type MockStorageData,
  // Auth state manager mock
  createMockAuthStateManager,
  type MockAuthStateManager,
  // Helper utilities
  delay,
  createDeferredPromise,
  flushPromises,
  createSpy,
  // Assertion helpers
  assertAuthState,
  assertEventEmitted,
  // Factory functions
  createTestAuthSetup,
} from './auth-mocks';

// ============================================
// AUTH COMPONENT TEST IDS
// Defined in packages/ui/src/auth/
// ============================================

/**
 * Test IDs for shared auth components from @nxt1/ui
 * These are used across web and mobile platforms
 */
export const AUTH_TEST_IDS = {
  // -------------------------
  // Social Buttons Component
  // packages/ui/src/auth/auth-social-buttons/
  // -------------------------
  SOCIAL_BUTTONS: 'auth-social-buttons',
  BTN_GOOGLE: 'auth-btn-google',
  BTN_APPLE: 'auth-btn-apple',
  BTN_MICROSOFT: 'auth-btn-microsoft',

  // -------------------------
  // Action Buttons Component
  // packages/ui/src/auth/auth-action-buttons/
  // -------------------------
  ACTION_BUTTONS: 'auth-action-buttons',
  BTN_EMAIL: 'auth-btn-email',
  BTN_TEAM_CODE: 'auth-btn-team-code',

  // -------------------------
  // Email Form Component
  // packages/ui/src/auth/auth-email-form/
  // -------------------------
  EMAIL_FORM: 'auth-email-form',
  INPUT_EMAIL: 'auth-input-email',
  INPUT_PASSWORD: 'auth-input-password',
  INPUT_FIRST_NAME: 'auth-input-first-name',
  INPUT_LAST_NAME: 'auth-input-last-name',
  TOGGLE_PASSWORD: 'auth-toggle-password',
  SUBMIT_BUTTON: 'auth-submit-button',
  LINK_FORGOT_PASSWORD: 'auth-link-forgot-password',
  FORM_ERROR: 'auth-form-error',
  FORM_ERROR_MESSAGE: 'auth-form-error-message',
  LOADING_SPINNER: 'auth-loading-spinner',
  EMAIL_ERROR: 'auth-email-error',
  PASSWORD_ERROR: 'auth-password-error',
  FIRSTNAME_ERROR: 'auth-firstname-error',
  LASTNAME_ERROR: 'auth-lastname-error',
  PASSWORD_STRENGTH: 'auth-password-strength-bar',

  // -------------------------
  // Mode Switcher Component
  // packages/ui/src/auth/auth-mode-switcher/
  // -------------------------
  MODE_SWITCHER: 'auth-mode-switcher',
  TAB_LOGIN: 'auth-tab-login',
  TAB_SIGNUP: 'auth-tab-signup',

  // -------------------------
  // Auth Shell Component
  // packages/ui/src/auth/auth-shell/
  // -------------------------
  SHELL: 'auth-shell',
  BACK_BUTTON: 'back-button',

  // -------------------------
  // Team Code Components
  // packages/ui/src/auth/auth-team-code/
  // -------------------------
  TEAM_CODE_INPUT: 'auth-team-code-input',
  TEAM_CODE_VALIDATE: 'auth-team-code-validate',
  TEAM_CODE_BANNER: 'auth-team-code-banner',

  // -------------------------
  // Terms Disclaimer Component
  // packages/ui/src/auth/auth-terms-disclaimer/
  // -------------------------
  TERMS_DISCLAIMER: 'auth-terms-disclaimer',
  TERMS_LINK: 'terms-link',
  PRIVACY_LINK: 'privacy-link',

  // -------------------------
  // Divider Component
  // packages/ui/src/auth/auth-divider/
  // -------------------------
  DIVIDER: 'auth-divider',

  // -------------------------
  // App Download Component
  // packages/ui/src/auth/auth-app-download/
  // -------------------------
  APP_DOWNLOAD: 'auth-app-download',
  QR_IOS: 'auth-qr-ios',
  QR_ANDROID: 'auth-qr-android',
  BTN_APP_STORE: 'auth-btn-app-store',
  BTN_PLAY_STORE: 'auth-btn-play-store',

  // -------------------------
  // Additional form fields (signup mode)
  // -------------------------
  INPUT_CONFIRM_PASSWORD: 'auth-input-confirm-password',
  TOGGLE_CONFIRM_PASSWORD: 'auth-toggle-confirm-password',
  INPUT_TEAM_CODE: 'auth-input-teamcode',
  FORM_ERROR_CLOSE: 'auth-form-error-close',

  // -------------------------
  // Container aliases (for backwards compatibility)
  // -------------------------
  SOCIAL_BUTTONS_CONTAINER: 'auth-social-buttons',
  ACTION_BUTTONS_CONTAINER: 'auth-action-buttons',
} as const;

/**
 * Page-level test IDs for auth pages
 * These are defined in the app-specific page components (web/mobile)
 */
export const AUTH_PAGE_TEST_IDS = {
  // Login page (mode='login')
  LOGIN_PAGE: 'login-page',
  LOGIN_TITLE: 'login-title',
  LOGIN_SUBTITLE: 'login-subtitle',
  LOGIN_LINK_SIGNUP: 'login-link-signup',

  // Signup page (mode='signup')
  SIGNUP_PAGE: 'signup-page',
  SIGNUP_TITLE: 'signup-title',
  SIGNUP_SUBTITLE: 'signup-subtitle',
  SIGNUP_LINK_LOGIN: 'signup-link-login',
  SIGNUP_LOGO: 'signup-logo',
  SIGNUP_INPUT_TEAMCODE: 'signup-input-teamcode',

  // Forgot Password page
  FORGOT_PASSWORD_PAGE: 'forgot-password-page',
  FORGOT_PASSWORD_TITLE: 'forgot-password-title',
  FORGOT_PASSWORD_SUBTITLE: 'forgot-password-subtitle',
  FORGOT_PASSWORD_FORM: 'forgot-password-form',
  FORGOT_PASSWORD_LOGO: 'forgot-password-logo',
  FORGOT_PASSWORD_FOOTER: 'forgot-password-footer',
  FORGOT_PASSWORD_LINK_BACK: 'forgot-password-link-back',
  FORGOT_PASSWORD_SUCCESS: 'forgot-password-success',
  FORGOT_PASSWORD_SUCCESS_ICON: 'forgot-password-success-icon',
  FORGOT_PASSWORD_SUCCESS_TITLE: 'forgot-password-success-title',
  FORGOT_PASSWORD_SUCCESS_MESSAGE: 'forgot-password-success-message',
  FORGOT_PASSWORD_BTN_BACK: 'forgot-password-btn-back-to-login',
} as const;

/**
 * Common/shared test IDs used across multiple features
 */
export const COMMON_TEST_IDS = {
  // Loading indicators
  LOADING: 'loading',
  SPINNER: 'spinner',
  TIMESTAMP: 'timestamp',
} as const;

// ============================================
// ONBOARDING TEST IDS
// Defined in packages/ui/src/onboarding/
// ============================================

/**
 * Test IDs for shared onboarding components from @nxt1/ui
 * These are used across web and mobile platforms for E2E testing
 *
 * @example
 * ```typescript
 * import { ONBOARDING_TEST_IDS } from '@nxt1/core/testing';
 *
 * // Playwright
 * this.continueButton = page.getByTestId(ONBOARDING_TEST_IDS.BTN_CONTINUE);
 * this.profileStep = page.getByTestId(ONBOARDING_TEST_IDS.STEP_PROFILE);
 *
 * // Detox/Appium (mobile)
 * element(by.id(ONBOARDING_TEST_IDS.STEP_SPORT));
 * ```
 */
export const ONBOARDING_TEST_IDS = {
  // -------------------------
  // Progress Bar Component
  // packages/ui/src/onboarding/onboarding-progress-bar/
  // -------------------------
  PROGRESS_BAR: 'onboarding-progress-bar',
  STEP_INDICATOR: 'onboarding-step', // suffixed with -1, -2, etc.

  // -------------------------
  // Navigation Buttons Component
  // packages/ui/src/onboarding/onboarding-navigation-buttons/
  // -------------------------
  BTN_SKIP: 'onboarding-skip',
  BTN_CONTINUE: 'onboarding-continue',
  BTN_COMPLETE: 'onboarding-complete',

  // -------------------------
  // Step Card Component
  // packages/ui/src/onboarding/onboarding-step-card/
  // -------------------------
  STEP_CARD: 'onboarding-step-card',
  STEP_ERROR: 'onboarding-error',

  // -------------------------
  // Profile Step Component
  // packages/ui/src/onboarding/onboarding-profile-step/
  // -------------------------
  STEP_PROFILE: 'onboarding-profile-step',
  INPUT_FIRST_NAME: 'onboarding-input-first-name',
  INPUT_LAST_NAME: 'onboarding-input-last-name',
  PHOTO_UPLOAD: 'onboarding-photo-upload',
  PHOTO_INPUT: 'onboarding-photo-input',
  LOCATION_DETECT: 'onboarding-location-detect',

  // -------------------------
  // Sport Step Component (v3.0)
  // packages/ui/src/onboarding/onboarding-sport-step/
  // -------------------------
  STEP_SPORT: 'onboarding-sport-step',
  SPORT_CHIP: 'sport-chip', // suffixed with -{sport-name}

  // -------------------------
  // Sport Entry Component
  // packages/ui/src/onboarding/onboarding-sport-entry/
  // -------------------------
  SPORT_ENTRY: 'sport-entry', // suffixed with -{sport-name}
  SPORT_ENTRY_TEAM_NAME: 'sport-entry-team-name', // suffixed with -{sport-name}
  SPORT_ENTRY_TEAM_TYPE: 'sport-entry-team-type', // suffixed with -{sport-name}
  SPORT_ENTRY_POSITION: 'sport-entry-position', // suffixed with -{sport-name}
  SPORT_ENTRY_DELETE: 'sport-entry-delete', // suffixed with -{sport-name}

  // -------------------------
  // Position Step Component (Legacy)
  // packages/ui/src/onboarding/onboarding-position-step/
  // -------------------------
  STEP_POSITION: 'onboarding-position-step',

  // -------------------------
  // Role Selection Component
  // packages/ui/src/onboarding/onboarding-role-selection/
  // -------------------------
  STEP_ROLE: 'onboarding-role-selection',
  ROLE_OPTION: 'onboarding-role-option', // suffixed with -{role}

  // -------------------------
  // Referral Step Component
  // packages/ui/src/onboarding/onboarding-referral-step/
  // -------------------------
  STEP_REFERRAL: 'onboarding-referral-step',
  REFERRAL_OPTION: 'onboarding-referral-option', // suffixed with -{type}
  REFERRAL_INPUT: 'onboarding-referral-input', // suffixed with -{type}

  // -------------------------
  // Gender Step Component
  // packages/ui/src/onboarding/onboarding-gender-step/
  // -------------------------
  STEP_GENDER: 'onboarding-gender-step',
  GENDER_OPTION: 'onboarding-gender-option', // suffixed with -{gender}

  // -------------------------
  // Birthdate Step Component
  // packages/ui/src/onboarding/onboarding-birthdate-step/
  // -------------------------
  STEP_BIRTHDATE: 'onboarding-birthdate-step',
  INPUT_BIRTHDATE: 'onboarding-input-birthdate',
} as const;

/**
 * Page-level test IDs for onboarding pages (web/mobile specific)
 */
export const ONBOARDING_PAGE_TEST_IDS = {
  // Page container
  ONBOARDING_PAGE: 'onboarding-page',
  ONBOARDING_TITLE: 'onboarding-title',
  ONBOARDING_SUBTITLE: 'onboarding-subtitle',

  // Success/completion
  ONBOARDING_SUCCESS: 'onboarding-success',
  ONBOARDING_CELEBRATION: 'onboarding-celebration',
} as const;

// ============================================
// AGENT ONBOARDING TEST IDS
// ============================================

export const AGENT_ONBOARDING_TEST_IDS = {
  // Shell
  SHELL: 'agent-onboarding-shell',
  PROGRESS_BAR: 'agent-onboarding-progress-bar',

  // Welcome Step
  WELCOME_STEP: 'agent-onboarding-welcome',
  WELCOME_TITLE: 'agent-onboarding-welcome-title',
  WELCOME_CTA: 'agent-onboarding-welcome-cta',

  // Program Search Step
  PROGRAM_STEP: 'agent-onboarding-program',
  PROGRAM_SEARCH_INPUT: 'agent-onboarding-program-search',
  PROGRAM_RESULT: 'agent-onboarding-program-result',
  PROGRAM_CREATE_BTN: 'agent-onboarding-program-create',
  PROGRAM_CLAIM_BTN: 'agent-onboarding-program-claim',
  PROGRAM_ROLE_SELECT: 'agent-onboarding-program-role',

  // Goals Step
  GOALS_STEP: 'agent-onboarding-goals',
  GOAL_OPTION: 'agent-onboarding-goal-option',
  GOAL_CUSTOM_INPUT: 'agent-onboarding-goal-custom',
  GOALS_COUNT: 'agent-onboarding-goals-count',

  // Connections Step
  CONNECTIONS_STEP: 'agent-onboarding-connections',
  CONNECTIONS_SEARCH: 'agent-onboarding-connections-search',
  CONNECTION_CARD: 'agent-onboarding-connection-card',
  CONNECTION_ADD_BTN: 'agent-onboarding-connection-add',

  // Loading Step
  LOADING_STEP: 'agent-onboarding-loading',
  LOADING_MESSAGE: 'agent-onboarding-loading-message',
  LOADING_PROGRESS: 'agent-onboarding-loading-progress',

  // Navigation
  BTN_CONTINUE: 'agent-onboarding-continue',
  BTN_BACK: 'agent-onboarding-back',
  BTN_SKIP: 'agent-onboarding-skip',
} as const;

// ============================================
// SETTINGS TEST IDS
// Defined in packages/ui/src/settings/
// ============================================

/**
 * Test IDs for the Settings feature (web and mobile)
 */
export const SETTINGS_TEST_IDS = {
  // Page containers
  PAGE: 'settings-page',
  ACCOUNT_INFO_PAGE: 'settings-account-info-page',

  // Shell & sections
  SHELL: 'settings-shell',
  LOADING_SKELETON: 'settings-loading-skeleton',

  // Account Information items (match item IDs)
  EMAIL_ITEM: 'accountEmail',
  CHANGE_PASSWORD_ITEM: 'accountChangePassword',
  SIGN_OUT_ITEM: 'accountSignOut',
  DELETE_ACCOUNT_ITEM: 'accountDelete',
} as const;

/**
 * Brand Vault test IDs
 */
export const BRAND_TEST_IDS = {
  /** Brand page container */
  CONTAINER: 'brand-container',
  /** Brand page header */
  HEADER: 'brand-header',
  /** Brand category grid */
  GRID: 'brand-category-grid',
  /** Individual brand category card */
  CARD: 'brand-category-card',
  /** Loading skeleton */
  SKELETON: 'brand-skeleton',
  /** Empty state */
  EMPTY_STATE: 'brand-empty-state',
} as const;

/**
 * All test IDs combined for easy import
 */
export const TEST_IDS = {
  AUTH: AUTH_TEST_IDS,
  AUTH_PAGE: AUTH_PAGE_TEST_IDS,
  ONBOARDING: ONBOARDING_TEST_IDS,
  ONBOARDING_PAGE: ONBOARDING_PAGE_TEST_IDS,
  COMMON: COMMON_TEST_IDS,
  AGENT_ONBOARDING: AGENT_ONBOARDING_TEST_IDS,
  BRAND: BRAND_TEST_IDS,
  SETTINGS: SETTINGS_TEST_IDS,
} as const;

// Type exports for TypeScript
export type AuthTestId = (typeof AUTH_TEST_IDS)[keyof typeof AUTH_TEST_IDS];
export type AuthPageTestId = (typeof AUTH_PAGE_TEST_IDS)[keyof typeof AUTH_PAGE_TEST_IDS];
export type OnboardingTestId = (typeof ONBOARDING_TEST_IDS)[keyof typeof ONBOARDING_TEST_IDS];
export type OnboardingPageTestId =
  (typeof ONBOARDING_PAGE_TEST_IDS)[keyof typeof ONBOARDING_PAGE_TEST_IDS];
export type CommonTestId = (typeof COMMON_TEST_IDS)[keyof typeof COMMON_TEST_IDS];
export type BrandTestId = (typeof BRAND_TEST_IDS)[keyof typeof BRAND_TEST_IDS];

// ============================================
// SHARED TEST DATA
// Single source of truth for all platforms
// ============================================

export {
  // Validation data
  INVALID_EMAILS,
  VALID_EMAILS,
  WEAK_PASSWORDS,
  STRONG_PASSWORDS,
  VALIDATION_DATA,
  // Error patterns (for E2E assertions)
  AUTH_ERROR_PATTERNS,
  AUTH_ERRORS, // deprecated alias
  // Test profiles
  TEST_PROFILES,
  type TestProfile,
  // Timeouts
  TIMEOUTS,
  TIMEOUT_VALUES, // deprecated alias
  // Routes
  ROUTES,
  // Environment
  TEST_ENV,
  // Factory functions
  generateTestEmail,
  generateTestCredentials,
  generateTestProfile,
  // Combined export
  TEST_DATA,
} from './test-data';
