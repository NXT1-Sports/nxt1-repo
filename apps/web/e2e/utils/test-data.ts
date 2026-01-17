/**
 * @fileoverview Test Data Constants (Re-exports from @nxt1/core/testing)
 * @module @nxt1/web/e2e/utils
 *
 * ⭐ SINGLE SOURCE OF TRUTH ⭐
 *
 * All test data is now centralized in @nxt1/core/testing
 * and re-exported here for E2E test convenience.
 *
 * This ensures consistency between:
 * - Unit tests
 * - Integration tests
 * - E2E tests (web)
 * - E2E tests (mobile)
 * - Backend tests
 *
 * @example
 * ```typescript
 * import { INVALID_EMAILS, ROUTES, AUTH_ERRORS } from '../utils';
 *
 * test('validate email', async () => {
 *   for (const email of INVALID_EMAILS) {
 *     // test validation
 *   }
 * });
 * ```
 */

// Re-export all test data from @nxt1/core/testing
export {
  // Validation data
  INVALID_EMAILS,
  VALID_EMAILS,
  WEAK_PASSWORDS,
  STRONG_PASSWORDS,
  VALIDATION_DATA,
  // Error patterns (for E2E assertions)
  AUTH_ERROR_PATTERNS,
  AUTH_ERRORS,
  // Test profiles
  TEST_PROFILES,
  type TestProfile,
  // Timeouts (new format - uppercase keys)
  TIMEOUTS as TIMEOUTS_NEW,
  TIMEOUT_VALUES,
  // Routes (new format - uppercase keys)
  ROUTES as ROUTES_NEW,
  // Environment
  TEST_ENV,
  // Factory functions
  generateTestEmail,
  generateTestCredentials,
  generateTestProfile,
  // Combined export
  TEST_DATA,
} from '@nxt1/core/testing';

import { ROUTES as ROUTES_SHARED, TIMEOUTS as TIMEOUTS_SHARED } from '@nxt1/core/testing';

// =============================================================================
// BACKWARDS COMPATIBILITY ALIASES
// Existing E2E tests use lowercase keys (e.g., ROUTES.auth.login)
// New code should use uppercase keys (e.g., ROUTES.AUTH.LOGIN)
// =============================================================================

/**
 * Routes with backwards-compatible lowercase aliases
 * @example
 * // Old format (deprecated but supported):
 * ROUTES.auth.login
 *
 * // New format (preferred):
 * ROUTES.AUTH.LOGIN
 */
export const ROUTES = {
  // New format (uppercase) - from shared
  ...ROUTES_SHARED,

  // Backwards compatibility (lowercase)
  auth: {
    login: ROUTES_SHARED.AUTH.LOGIN,
    signup: ROUTES_SHARED.AUTH.SIGNUP,
    forgotPassword: ROUTES_SHARED.AUTH.FORGOT_PASSWORD,
    onboarding: ROUTES_SHARED.AUTH.ONBOARDING,
    verifyEmail: ROUTES_SHARED.AUTH.VERIFY_EMAIL,
    resetPassword: ROUTES_SHARED.AUTH.RESET_PASSWORD,
  },
  app: {
    home: ROUTES_SHARED.APP.HOME,
    profile: ROUTES_SHARED.APP.PROFILE,
    profileEdit: ROUTES_SHARED.APP.PROFILE_EDIT,
    settings: ROUTES_SHARED.APP.SETTINGS,
    notifications: ROUTES_SHARED.APP.NOTIFICATIONS,
  },
  explore: {
    index: ROUTES_SHARED.EXPLORE.INDEX,
    athletes: ROUTES_SHARED.EXPLORE.ATHLETES,
    teams: ROUTES_SHARED.EXPLORE.TEAMS,
    colleges: ROUTES_SHARED.EXPLORE.COLLEGES,
    rankings: ROUTES_SHARED.EXPLORE.RANKINGS,
  },
  team: {
    list: ROUTES_SHARED.TEAM.LIST,
    create: ROUTES_SHARED.TEAM.CREATE,
    detail: ROUTES_SHARED.TEAM.DETAIL,
  },
  static: {
    terms: ROUTES_SHARED.STATIC.TERMS,
    privacy: ROUTES_SHARED.STATIC.PRIVACY,
    about: ROUTES_SHARED.STATIC.ABOUT,
    contact: ROUTES_SHARED.STATIC.CONTACT,
  },
} as const;

/**
 * Timeouts with backwards-compatible lowercase aliases
 * @example
 * // Old format (deprecated but supported):
 * TIMEOUTS.short
 *
 * // New format (preferred):
 * TIMEOUTS.SHORT
 */
export const TIMEOUTS = {
  // New format (uppercase) - from shared
  ...TIMEOUTS_SHARED,

  // Backwards compatibility (lowercase)
  short: TIMEOUTS_SHARED.SHORT,
  default: TIMEOUTS_SHARED.DEFAULT,
  long: TIMEOUTS_SHARED.LONG,
  extended: TIMEOUTS_SHARED.EXTENDED,
  navigation: TIMEOUTS_SHARED.NAVIGATION,
  animation: TIMEOUTS_SHARED.ANIMATION,
} as const;
