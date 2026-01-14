/**
 * @fileoverview Test Data Constants
 * @module @nxt1/web/e2e/utils
 *
 * Reusable test data constants and factories.
 */

// ===========================================================================
// VALIDATION TEST DATA
// ===========================================================================

/**
 * Invalid email formats for validation testing
 */
export const INVALID_EMAILS = [
  '',
  'invalid',
  'invalid@',
  '@example.com',
  'invalid@.com',
  'invalid@example',
  'invalid email@example.com',
  'invalid..email@example.com',
];

/**
 * Valid email formats
 */
export const VALID_EMAILS = [
  'test@example.com',
  'test.user@example.com',
  'test+tag@example.com',
  'test_user@example.co.uk',
];

/**
 * Weak passwords for validation testing
 */
export const WEAK_PASSWORDS = [
  '',
  '12345',
  'password',
  'abc',
];

/**
 * Strong passwords
 */
export const STRONG_PASSWORDS = [
  'Password123!',
  'SecureP@ss1',
  'MyStr0ng!Pass',
];

// ===========================================================================
// AUTH ERROR MESSAGES
// ===========================================================================

export const AUTH_ERRORS = {
  INVALID_EMAIL: /invalid email/i,
  EMAIL_REQUIRED: /email.*required/i,
  PASSWORD_REQUIRED: /password.*required/i,
  PASSWORD_TOO_SHORT: /password.*short|minimum.*characters/i,
  INVALID_CREDENTIALS: /invalid.*credentials|wrong.*password|user.*not.*found/i,
  EMAIL_IN_USE: /email.*already.*use|account.*exists/i,
  NETWORK_ERROR: /network.*error|connection.*failed/i,
  TOO_MANY_ATTEMPTS: /too many.*attempts|try.*later/i,
};

// ===========================================================================
// TEST USER PROFILES
// ===========================================================================

export const TEST_PROFILES = {
  athlete: {
    role: 'athlete',
    displayName: 'Test Athlete',
    sport: 'Basketball',
    position: 'Point Guard',
    gradYear: 2026,
  },
  coach: {
    role: 'coach',
    displayName: 'Coach Test',
    sport: 'Basketball',
    team: 'Test High School',
  },
  parent: {
    role: 'parent',
    displayName: 'Parent Test',
    childName: 'Test Athlete Jr',
  },
};

// ===========================================================================
// TIMEOUTS
// ===========================================================================

export const TIMEOUTS = {
  /** Short timeout for quick operations */
  short: 5_000,
  /** Default timeout for most operations */
  default: 15_000,
  /** Long timeout for slow operations */
  long: 30_000,
  /** Extended timeout for very slow operations */
  extended: 60_000,
  /** Navigation timeout */
  navigation: 30_000,
  /** Animation timeout */
  animation: 1_000,
};

// ===========================================================================
// ROUTES
// ===========================================================================

export const ROUTES = {
  auth: {
    login: '/auth/login',
    signup: '/auth/signup',
    forgotPassword: '/auth/forgot-password',
    onboarding: '/auth/onboarding',
  },
  // Add more routes as features are developed:
  // home: '/home',
  // profile: '/profile',
  // settings: '/settings',
};
