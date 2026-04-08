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

// ============================================
// LINK SOURCES / CONNECTED ACCOUNTS TEST IDS
// Defined in packages/ui/src/onboarding/onboarding-link-drop-step/
// and packages/ui/src/components/connected-sources/
// ============================================

/**
 * Test IDs for the Link Sources onboarding step and connected sources UI.
 */
export const LINK_SOURCES_TEST_IDS = {
  /** Step container */
  CONTAINER: 'link-sources-container',
  /** Mode toggle wrapper */
  MODE_TOGGLE: 'link-sources-mode-toggle',
  /** Linked mode button */
  MODE_LINK_BTN: 'link-sources-mode-link',
  /** Signed In mode button */
  MODE_SIGNIN_BTN: 'link-sources-mode-signin',
  /** Sport filter bar */
  SPORT_FILTER: 'link-sources-sport-filter',
  /** Individual sport pill */
  SPORT_PILL: 'link-sources-sport-pill',
  /** Platform group wrapper */
  GROUP: 'link-sources-group',
  /** Group header / accordion title */
  GROUP_HEADER: 'link-sources-group-header',
  /** Individual source row */
  SOURCE_ROW: 'link-sources-source-row',
  /** Add custom link button */
  ADD_CUSTOM_LINK_BUTTON: 'link-sources-add-custom-link-button',
  /** Empty state */
  EMPTY_STATE: 'link-sources-empty-state',
  /** Quick-add URL bar (mobile sticky footer) */
  QUICK_ADD_CONTAINER: 'link-sources-quick-add-container',
  /** Quick-add URL input */
  QUICK_ADD_INPUT: 'link-sources-quick-add-input',
  /** Quick-add submit button */
  QUICK_ADD_SUBMIT: 'link-sources-quick-add-submit',
  /** Connected accounts manual re-sync button */
  RESYNC_BUTTON: 'link-sources-resync-button',
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

// ============================================
// PROFILE GENERATION TEST IDS
// Used by: ProfileGenerationOverlayComponent
// ============================================

export const PROFILE_GENERATION_TEST_IDS = {
  /** Root overlay container */
  OVERLAY: 'profile-generation-overlay',
  /** Progress bar container */
  PROGRESS: 'profile-generation-progress',
  /** Phase message text */
  PHASE_MESSAGE: 'profile-generation-phase-message',
  /** Platform badge list */
  PLATFORM_BADGES: 'profile-generation-platform-badges',
  /** Skip/continue button */
  SKIP_BUTTON: 'profile-generation-skip-btn',
} as const;

// ============================================
// ACTIVITY TEST IDS
// ============================================

/**
 * Test IDs for the Activity / Notifications feature (web and mobile)
 */
export const ACTIVITY_TEST_IDS = {
  // Shell
  SHELL: 'activity-shell',
  TABS: 'activity-tabs',
  TAB_ITEM: 'activity-tab', // suffixed with -{tabId}

  // List
  LIST_CONTAINER: 'activity-list-container',
  LIST_ITEM: 'activity-list-item', // suffixed with -{id}

  // States
  LOADING_SKELETON: 'activity-loading-skeleton',
  EMPTY_STATE: 'activity-empty-state',
  ERROR_STATE: 'activity-error-state',

  // Actions
  MARK_ALL_READ_BUTTON: 'activity-mark-all-read',
  REFRESH_BUTTON: 'activity-refresh',
  LOAD_MORE_BUTTON: 'activity-load-more',

  // Item details
  ITEM_TITLE: 'activity-item-title',
  ITEM_BODY: 'activity-item-body',
  ITEM_AVATAR: 'activity-item-avatar',
  ITEM_TIMESTAMP: 'activity-item-timestamp',
  ITEM_ACTION: 'activity-item-action',
  ITEM_UNREAD_DOT: 'activity-item-unread-dot',

  // Badge
  BADGE_COUNT: 'activity-badge-count',

  // Analytics Panel
  ANALYTICS_PANEL: 'activity-analytics-panel',
  ANALYTICS_PERIOD_ROW: 'activity-analytics-period-row',
  ANALYTICS_PERIOD_BTN: 'activity-analytics-period-btn',
  ANALYTICS_LOADING: 'activity-analytics-loading',
  ANALYTICS_ERROR: 'activity-analytics-error',
  ANALYTICS_RETRY_BTN: 'activity-analytics-retry-btn',
  ANALYTICS_KPI_GRID: 'activity-analytics-kpi-grid',
  ANALYTICS_KPI_CARD: 'activity-analytics-kpi-card',
  ANALYTICS_FUNNEL: 'activity-analytics-funnel',
  ANALYTICS_FUNNEL_ROW: 'activity-analytics-funnel-row',
  ANALYTICS_CHART_PROFILE_VIEWS: 'activity-analytics-chart-profile-views',
  ANALYTICS_CHART_TEAM_VIEWS: 'activity-analytics-chart-team-views',
  ANALYTICS_NIL_GRID: 'activity-analytics-nil-grid',
  ANALYTICS_COLLEGE_LIST: 'activity-analytics-college-list',
  ANALYTICS_COLLEGE_ROW: 'activity-analytics-college-row',
  ANALYTICS_SPOTLIGHT: 'activity-analytics-spotlight',
  ANALYTICS_ROSTER_LIST: 'activity-analytics-roster-list',
  ANALYTICS_ROSTER_ROW: 'activity-analytics-roster-row',
  ANALYTICS_INSIGHTS: 'activity-analytics-insights',
  ANALYTICS_INSIGHT_CARD: 'activity-analytics-insight-card',
} as const;

// ============================================
// USAGE / BILLING DASHBOARD TEST IDS
// ============================================

export const USAGE_TEST_IDS = {
  // Page containers
  DASHBOARD_CONTAINER: 'usage-dashboard-container',
  LOADING_SKELETON: 'usage-loading-skeleton',
  ERROR_STATE: 'usage-error-state',

  // Overview section
  OVERVIEW_SECTION: 'usage-overview-section',
  OVERVIEW_METERED_USAGE: 'usage-overview-metered-usage',
  OVERVIEW_NEXT_PAYMENT: 'usage-overview-next-payment',
  OVERVIEW_PERIOD_LABEL: 'usage-overview-period-label',
  OVERVIEW_WALLET_BALANCE: 'usage-overview-wallet-balance',
  OVERVIEW_PENDING_HOLDS: 'usage-overview-pending-holds',
  OVERVIEW_SPENT_THIS_MONTH: 'usage-overview-spent-this-month',
  OVERVIEW_BUY_CREDITS: 'usage-overview-buy-credits',
  OVERVIEW_VIEW_HISTORY: 'usage-overview-view-history',

  // Timeframe filter
  TIMEFRAME_SELECT: 'usage-timeframe-select',

  // Chart section
  CHART_SECTION: 'usage-chart-section',
  CHART_CONTAINER: 'usage-chart-container',
  CHART_VIEW_BREAKDOWN: 'usage-chart-view-breakdown',

  // Product category tabs (legacy — removed, kept for backward compat tests)
  CATEGORY_TABS: 'usage-category-tabs',
  CATEGORY_TAB: 'usage-category-tab',

  // Breakdown section
  BREAKDOWN_SECTION: 'usage-breakdown-section',
  BREAKDOWN_ROW: 'usage-breakdown-row',
  BREAKDOWN_SEARCH: 'usage-breakdown-search',
  BREAKDOWN_TIMEFRAME_SELECT: 'usage-breakdown-timeframe-select',

  // Payment history section
  HISTORY_SECTION: 'usage-history-section',
  HISTORY_ROW: 'usage-history-row',
  HISTORY_LOAD_MORE: 'usage-history-load-more',
  HISTORY_RECEIPT_BTN: 'usage-history-receipt-btn',
  HISTORY_INVOICE_BTN: 'usage-history-invoice-btn',

  // Budget section
  BUDGET_SECTION: 'usage-budget-section',
  BUDGET_CARD: 'usage-budget-card',
  BUDGET_EDIT_BUTTON: 'usage-budget-edit-button',
  BUDGET_NEW_BTN: 'usage-budget-new-btn',

  // Payment methods section
  PAYMENT_METHODS_SECTION: 'usage-payment-methods-section',
  PAYMENT_METHOD_CARD: 'usage-payment-method-card',
  PAYMENT_METHOD_ADD: 'usage-payment-method-add',
  PAYMENT_METHOD_REMOVE: 'usage-payment-method-remove',
  PAYMENT_METHOD_DEFAULT: 'usage-payment-method-default',

  // Billing info section
  BILLING_INFO_SECTION: 'usage-billing-info-section',
  BILLING_INFO_EDIT: 'usage-billing-info-edit',

  // Payment info section
  PAYMENT_INFO_SECTION: 'usage-payment-info-section',
  PAYMENT_INFO_EDIT_BILLING: 'usage-payment-info-edit-billing',
  PAYMENT_INFO_EDIT_PAYMENT: 'usage-payment-info-edit-payment',
  PAYMENT_INFO_EDIT_ADDITIONAL: 'usage-payment-info-edit-additional',
  PAYMENT_INFO_REDEEM_COUPON: 'usage-payment-info-redeem-coupon',

  // Subscriptions section
  SUBSCRIPTIONS_SECTION: 'usage-subscriptions-section',
  SUBSCRIPTIONS_MANAGE: 'usage-subscriptions-manage',

  // Coupon section
  COUPON_INPUT: 'usage-coupon-input',
  COUPON_REDEEM: 'usage-coupon-redeem',

  // Section navigation
  SECTION_NAV: 'usage-section-nav',
  SECTION_NAV_ITEM: 'usage-section-nav-item',

  // Shell-level
  HELP_BTN: 'usage-help-btn',
} as const;

/**
 * Agent X Action Card test IDs (HITL approval / input cards).
 */
export const AGENT_X_ACTION_CARD_TEST_IDS = {
  CARD: 'agent-action-card',
  HEADER: 'agent-action-card-header',
  PROMPT: 'agent-action-card-prompt',
  DETAILS_TOGGLE: 'agent-action-card-details',
  TOOL_ARGS: 'agent-action-card-tool-args',
  BTN_APPROVE: 'agent-action-card-btn-approve',
  BTN_REJECT: 'agent-action-card-btn-reject',
  TEXTAREA: 'agent-action-card-textarea',
  BTN_REPLY: 'agent-action-card-btn-reply',
  LOADING: 'agent-action-card-loading',
  RESOLVED: 'agent-action-card-resolved',
} as const;

/**
 * Agent X Billing Action Card test IDs.
 */
export const AGENT_X_BILLING_CARD_TEST_IDS = {
  CARD: 'agent-billing-card',
  HEADER: 'agent-billing-card-header',
  REASON_BADGE: 'agent-billing-card-reason',
  BALANCE_DISPLAY: 'agent-billing-card-balance',
  AMOUNT_NEEDED: 'agent-billing-card-amount-needed',
  DESCRIPTION: 'agent-billing-card-description',
  CTA_PRIMARY: 'agent-billing-card-cta-primary',
  CTA_SECONDARY: 'agent-billing-card-cta-secondary',
} as const;

/**
 * Agent X Operation Chat failure banner test IDs.
 */
export const AGENT_X_OPERATION_CHAT_TEST_IDS = {
  FAILURE_BANNER: 'agent-op-chat-failure-banner',
  FAILURE_TITLE: 'agent-op-chat-failure-title',
  FAILURE_MESSAGE: 'agent-op-chat-failure-message',
  BTN_RETRY: 'agent-op-chat-btn-retry',
  BTN_DISMISS: 'agent-op-chat-btn-dismiss',
  DROP_OVERLAY: 'agent-op-chat-drop-overlay',
} as const;

/**
 * All test IDs combined for easy import
 */
// ============================================
// NEWS / PULSE TEST IDS
// ============================================

export const NEWS_TEST_IDS = {
  /** Feed list container */
  LIST_CONTAINER: 'news-list-container',
  /** Feed list component */
  LIST: 'news-list',
  /** Individual article card */
  LIST_ITEM: 'news-list-item',
  /** Article detail view */
  ARTICLE_DETAIL: 'news-article-detail',
  /** Back button in detail view */
  ARTICLE_DETAIL_BACK: 'news-article-detail-back',
  /** Share button in detail view */
  ARTICLE_DETAIL_SHARE: 'news-article-detail-share',
  /** Read full story link */
  ARTICLE_DETAIL_READ_FULL: 'news-article-detail-read-full',
  /** Skeleton loader */
  SKELETON: 'news-skeleton',
  /** Empty state */
  EMPTY_STATE: 'news-empty-state',
  /** Error state */
  ERROR_STATE: 'news-error-state',
  /** Load more trigger */
  LOAD_MORE: 'news-load-more',
  /** Retry button */
  RETRY_BTN: 'news-retry',
} as const;

// ============================================
// FEED CARD TEST IDS (Smart Shell + Atomic Cards)
// ============================================

export const FEED_CARD_TEST_IDS = {
  /** Feed Card Shell */
  SHELL_ARTICLE: 'feed-shell-article',
  SHELL_AVATAR_BTN: 'feed-shell-avatar-btn',
  SHELL_AUTHOR_INFO: 'feed-shell-author-info',
  SHELL_TYPE_BADGE: 'feed-shell-type-badge',
  SHELL_MENU_BTN: 'feed-shell-menu-btn',
  SHELL_CONTENT: 'feed-shell-content',
  SHELL_PINNED_BADGE: 'feed-shell-pinned-badge',
  SHELL_STATS: 'feed-shell-stats',
  SHELL_STAT_REACT: 'feed-shell-stat-react',
  SHELL_STAT_REPOST: 'feed-shell-stat-repost',
  SHELL_STAT_SHARES: 'feed-shell-stat-shares',
  SHELL_STAT_VIEWS: 'feed-shell-stat-views',
  SHELL_VIEW_PROFILE_BTN: 'feed-shell-view-profile-btn',

  /** Stat Card */
  STAT_CARD: 'feed-stat-card',
  STAT_HEADER: 'feed-stat-header',
  STAT_RESULT: 'feed-stat-result',
  STAT_GRID: 'feed-stat-grid',
  STAT_CELL: 'feed-stat-cell',

  /** Event Card */
  EVENT_CARD: 'feed-event-card',
  EVENT_STATUS_BADGE: 'feed-event-status-badge',
  EVENT_MATCHUP: 'feed-event-matchup',
  EVENT_RESULT: 'feed-event-result',
  EVENT_VENUE: 'feed-event-venue',

  /** Metrics Card */
  METRICS_CARD: 'feed-metrics-card',
  METRICS_HEADER: 'feed-metrics-header',
  METRICS_GRID: 'feed-metrics-grid',
  METRICS_CELL: 'feed-metrics-cell',

  /** Award Card */
  AWARD_CARD: 'feed-award-card',
  AWARD_ICON: 'feed-award-icon',
  AWARD_INFO: 'feed-award-info',

  /** News Card */
  NEWS_CARD: 'feed-news-card',
  NEWS_IMAGE: 'feed-news-image',
  NEWS_CATEGORY: 'feed-news-category',
  NEWS_BODY: 'feed-news-body',
  NEWS_HEADLINE: 'feed-news-headline',
  NEWS_SOURCE: 'feed-news-source',

  /** Post Content Card */
  POST_MEDIA_CAROUSEL: 'feed-post-media-carousel',
  POST_MEDIA_TRACK: 'feed-post-media-track',
  POST_MEDIA_SLIDE: 'feed-post-media-slide',
  POST_MEDIA_DOTS: 'feed-post-media-dots',
  POST_MEDIA_DOT: 'feed-post-media-dot',
  POST_TITLE: 'feed-post-title',
  POST_CONTENT: 'feed-post-content',
  POST_EXTERNAL: 'feed-post-external',
  POST_TAGS: 'feed-post-tags',
  POST_TAG: 'feed-post-tag',
  POST_LOCATION: 'feed-post-location',
} as const;

// ============================================
// PROFILE TIMELINE TEST IDS
// ============================================

export const PROFILE_TIMELINE_TEST_IDS = {
  CONTAINER: 'profile-timeline',
  FILTERS_NAV: 'profile-timeline-filters',
  FILTER_TAB: 'profile-timeline-filter-tab',
  FILTER_BADGE: 'profile-timeline-filter-badge',
  LOADING: 'profile-timeline-loading',
  ERROR: 'profile-timeline-error',
  RETRY_BTN: 'profile-timeline-retry-btn',
  EMPTY: 'profile-timeline-empty',
  EMPTY_CTA: 'profile-timeline-empty-cta',
  POSTS_PANEL: 'profile-timeline-posts',
  LOAD_MORE: 'profile-timeline-load-more',
  LOAD_MORE_BTN: 'profile-timeline-load-more-btn',
} as const;

// ============================================
// EXPLORE / DISCOVER TEST IDS
// ============================================

export const EXPLORE_TEST_IDS = {
  // Shell
  SHELL: 'explore-shell',
  SEARCH_INPUT: 'explore-search-input',
  TAB_SCROLLER: 'explore-tab-scroller',
  TAB_BUTTON: 'explore-tab', // suffixed with -{tabId}

  // Lists & Items
  LIST_CONTAINER: 'explore-list-container',
  LIST_ITEM: 'explore-list-item', // suffixed with -{id}
  ITEM_NAME: 'explore-item-name',
  ITEM_IMAGE: 'explore-item-image',

  // States
  LOADING_SKELETON: 'explore-loading-skeleton',
  EMPTY_STATE: 'explore-empty-state',
  ERROR_STATE: 'explore-error-state',
  LOAD_MORE_TRIGGER: 'explore-load-more-trigger',

  // Search Suggestions
  SUGGESTIONS_SECTION: 'explore-suggestions-section',
  RECENT_SEARCHES: 'explore-recent-searches',
  TRENDING_SEARCHES: 'explore-trending-searches',
  SUGGESTION_ITEM: 'explore-suggestion-item', // suffixed with -{index}

  // Sidebar / Filters
  SIDEBAR: 'explore-sidebar',
  FILTER_SPORT: 'explore-filter-sport',
  FILTER_STATE: 'explore-filter-state',
  FILTER_DIVISION: 'explore-filter-division',
  FILTER_APPLY_BTN: 'explore-filter-apply',
  FILTER_CLEAR_BTN: 'explore-filter-clear',
  DETECT_LOCATION_BTN: 'explore-detect-location',

  // Content Panels
  FEED_PANEL: 'explore-feed-panel',
  NEWS_PANEL: 'explore-news-panel',
  SCOUT_REPORTS_PANEL: 'explore-scout-reports-panel',
} as const;

// ============================================
// INVITE TEST IDS
// ============================================

export const INVITE_TEST_IDS = {
  /** Invite shell container */
  SHELL: 'invite-shell',
  /** QR code section */
  QR_SECTION: 'invite-qr-section',
  /** QR code image */
  QR_IMAGE: 'invite-qr-image',
  /** QR loading spinner */
  QR_LOADING: 'invite-qr-loading',
  /** QR error state */
  QR_ERROR: 'invite-qr-error',
  /** Value proposition card */
  VALUE_CARD: 'invite-value-card',
  /** How it works explainer */
  EXPLAINER: 'invite-explainer',
  /** Invite CTA / share button */
  INVITE_CTA: 'invite-cta',
  /** Stats card container */
  STATS_CARD: 'invite-stats-card',
  /** Stats sent count */
  STATS_SENT: 'invite-stats-sent',
  /** Stats joined count */
  STATS_JOINED: 'invite-stats-joined',
  /** Stats conversion rate */
  STATS_RATE: 'invite-stats-rate',
  /** Stats streak */
  STATS_STREAK: 'invite-stats-streak',
  /** Channel grid container */
  CHANNEL_GRID: 'invite-channel-grid',
  /** Individual channel button */
  CHANNEL_ITEM: 'invite-channel-item',
  /** Achievements container */
  ACHIEVEMENTS: 'invite-achievements',
  /** Celebration overlay */
  CELEBRATION: 'invite-celebration',
  /** Skeleton loading */
  LOADING_SKELETON: 'invite-loading-skeleton',
  /** Error state */
  ERROR_STATE: 'invite-error-state',
  /** Empty state */
  EMPTY_STATE: 'invite-empty-state',
} as const;

// ============================================
// ADD SPORT TEST IDS
// Used by: AddSportComponent (web), AddSportShellComponent (mobile)
// ============================================

export const ADD_SPORT_TEST_IDS = {
  /** Page / shell container */
  SHELL: 'add-sport-shell',
  /** Page title heading */
  TITLE: 'add-sport-title',
  /** Step content wrapper */
  STEP_CONTENT: 'add-sport-step-content',
  /** Sport selection step */
  STEP_SPORT: 'add-sport-step-sport',
  /** Connected accounts step */
  STEP_LINK_SOURCES: 'add-sport-step-link-sources',
  /** Desktop footer / navigation buttons area */
  DESKTOP_FOOTER: 'add-sport-desktop-footer',
  /** Mobile footer area */
  MOBILE_FOOTER: 'add-sport-mobile-footer',
  /** Quick-add link form (mobile) */
  QUICK_ADD_FORM: 'add-sport-quick-add-form',
  /** Quick-add link input */
  QUICK_ADD_INPUT: 'add-sport-quick-add-input',
  /** Quick-add submit button */
  QUICK_ADD_SUBMIT: 'add-sport-quick-add-submit',
  /** Loading state overlay */
  LOADING: 'add-sport-loading',
  /** Error state */
  ERROR_STATE: 'add-sport-error-state',
} as const;

export const INTEL_TEST_IDS = {
  /** Athlete Intel section container */
  ATHLETE_SECTION: 'intel-athlete-section',
  /** Team Intel section container */
  TEAM_SECTION: 'intel-team-section',
  /** Loading skeleton */
  LOADING_SKELETON: 'intel-loading-skeleton',
  /** Empty state (no report) */
  EMPTY_STATE: 'intel-empty-state',
  /** Error state */
  ERROR_STATE: 'intel-error-state',
  /** Generate Intel CTA button */
  GENERATE_BUTTON: 'intel-generate-button',
  /** Regenerate button (on existing report) */
  REGENERATE_BUTTON: 'intel-regenerate-button',
  /** Intel report container (visible when report loaded) */
  REPORT_CONTAINER: 'intel-report-container',
  /** Overall score ring */
  SCORE_RING: 'intel-score-ring',
  /** Tier badge */
  TIER_BADGE: 'intel-tier-badge',
  /** Scout ratings card */
  RATINGS_CARD: 'intel-ratings-card',
  /** Percentile rankings card */
  PERCENTILE_CARD: 'intel-percentile-card',
  /** AI brief card */
  BRIEF_CARD: 'intel-brief-card',
  /** Strengths list */
  STRENGTHS_CARD: 'intel-strengths-card',
  /** Areas for improvement list */
  IMPROVEMENTS_CARD: 'intel-improvements-card',
  /** Level projections card */
  PROJECTIONS_CARD: 'intel-projections-card',
  /** Measurables grid */
  MEASURABLES_CARD: 'intel-measurables-card',
  /** Stats grid */
  STATS_CARD: 'intel-stats-card',
  /** Recruiting summary card */
  RECRUITING_CARD: 'intel-recruiting-card',
  /** Missing data section */
  MISSING_DATA_SECTION: 'intel-missing-data-section',
  /** Missing data CTA button */
  MISSING_DATA_CTA: 'intel-missing-data-cta',
  /** Citations section */
  CITATIONS_SECTION: 'intel-citations-section',
  /** Quick commands section */
  QUICK_COMMANDS_SECTION: 'intel-quick-commands-section',
  /** Quick command button */
  QUICK_COMMAND_BUTTON: 'intel-quick-command-button',
  /** Report footer with timestamp */
  REPORT_FOOTER: 'intel-report-footer',
  /** Team season outlook card */
  SEASON_OUTLOOK_CARD: 'intel-season-outlook-card',
  /** Team identity card */
  TEAM_IDENTITY_CARD: 'intel-team-identity-card',
  /** Top prospects section */
  TOP_PROSPECTS_SECTION: 'intel-top-prospects-section',
  /** Prospect row (clickable) */
  PROSPECT_ROW: 'intel-prospect-row',
  /** Roster depth card */
  ROSTER_DEPTH_CARD: 'intel-roster-depth-card',
  /** Season history card */
  SEASON_HISTORY_CARD: 'intel-season-history-card',
  /** Recruiting pipeline card */
  RECRUITING_PIPELINE_CARD: 'intel-recruiting-pipeline-card',
} as const;

// ============================================
// MEDIA VIEWER TEST IDS
// ============================================

export const MEDIA_VIEWER_TEST_IDS = {
  /** Root overlay container */
  CONTAINER: 'media-viewer-container',
  /** Close / dismiss button */
  CLOSE_BUTTON: 'media-viewer-close-button',
  /** Share button */
  SHARE_BUTTON: 'media-viewer-share-button',
  /** Horizontal scroll track holding all items */
  TRACK: 'media-viewer-track',
  /** Individual media slide (image or video) */
  SLIDE: 'media-viewer-slide',
  /** Currently visible image element */
  IMAGE: 'media-viewer-image',
  /** Currently visible video element */
  VIDEO: 'media-viewer-video',
  /** Counter indicator (e.g. "2 / 5") */
  COUNTER: 'media-viewer-counter',
  /** Previous navigation arrow */
  PREV_BUTTON: 'media-viewer-prev-button',
  /** Next navigation arrow */
  NEXT_BUTTON: 'media-viewer-next-button',
  /** Error state when media fails to load */
  ERROR_STATE: 'media-viewer-error-state',
  /** Loading skeleton placeholder */
  LOADING_SKELETON: 'media-viewer-loading-skeleton',
  /** Caption / alt text display */
  CAPTION: 'media-viewer-caption',
} as const;

// ============================================
// LIVE VIEW TEST IDS
// ============================================

export const LIVE_VIEW_TEST_IDS = {
  /** Root container for the expanded live-view panel */
  PANEL_CONTAINER: 'live-view-panel-container',
  /** The interactive iframe element */
  IFRAME: 'live-view-iframe',
  /** Panel header with title + action buttons */
  HEADER: 'live-view-header',
  /** Refresh button (live-view panels only) */
  REFRESH_BUTTON: 'live-view-refresh-btn',
  /** Close button to dismiss the panel */
  CLOSE_BUTTON: 'live-view-close-btn',
  /** Copy-link button */
  COPY_LINK_BUTTON: 'live-view-copy-link-btn',
  /** Open-in-new-tab link */
  OPEN_EXTERNAL_LINK: 'live-view-open-external',
  /** Fullscreen toggle button */
  FULLSCREEN_BUTTON: 'live-view-fullscreen-btn',
  /** Download / export button */
  DOWNLOAD_BUTTON: 'live-view-download-btn',
  /** Loading spinner overlay */
  LOADING_STATE: 'live-view-loading',
  /** Error state banner */
  ERROR_STATE: 'live-view-error-state',
} as const;

export const TEST_IDS = {
  AUTH: AUTH_TEST_IDS,
  AUTH_PAGE: AUTH_PAGE_TEST_IDS,
  ONBOARDING: ONBOARDING_TEST_IDS,
  ONBOARDING_PAGE: ONBOARDING_PAGE_TEST_IDS,
  COMMON: COMMON_TEST_IDS,
  AGENT_ONBOARDING: AGENT_ONBOARDING_TEST_IDS,
  LINK_SOURCES: LINK_SOURCES_TEST_IDS,
  BRAND: BRAND_TEST_IDS,
  SETTINGS: SETTINGS_TEST_IDS,
  PROFILE_GENERATION: PROFILE_GENERATION_TEST_IDS,
  ACTIVITY: ACTIVITY_TEST_IDS,
  USAGE: USAGE_TEST_IDS,
  AGENT_X_ACTION_CARD: AGENT_X_ACTION_CARD_TEST_IDS,
  AGENT_X_BILLING_CARD: AGENT_X_BILLING_CARD_TEST_IDS,
  AGENT_X_OPERATION_CHAT: AGENT_X_OPERATION_CHAT_TEST_IDS,
  NEWS: NEWS_TEST_IDS,
  FEED_CARD: FEED_CARD_TEST_IDS,
  PROFILE_TIMELINE: PROFILE_TIMELINE_TEST_IDS,
  EXPLORE: EXPLORE_TEST_IDS,
  INVITE: INVITE_TEST_IDS,
  ADD_SPORT: ADD_SPORT_TEST_IDS,
  INTEL: INTEL_TEST_IDS,
  MEDIA_VIEWER: MEDIA_VIEWER_TEST_IDS,
  LIVE_VIEW: LIVE_VIEW_TEST_IDS,
} as const;

// Type exports for TypeScript
export type AuthTestId = (typeof AUTH_TEST_IDS)[keyof typeof AUTH_TEST_IDS];
export type AuthPageTestId = (typeof AUTH_PAGE_TEST_IDS)[keyof typeof AUTH_PAGE_TEST_IDS];
export type OnboardingTestId = (typeof ONBOARDING_TEST_IDS)[keyof typeof ONBOARDING_TEST_IDS];
export type OnboardingPageTestId =
  (typeof ONBOARDING_PAGE_TEST_IDS)[keyof typeof ONBOARDING_PAGE_TEST_IDS];
export type CommonTestId = (typeof COMMON_TEST_IDS)[keyof typeof COMMON_TEST_IDS];
export type LinkSourcesTestId = (typeof LINK_SOURCES_TEST_IDS)[keyof typeof LINK_SOURCES_TEST_IDS];
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
