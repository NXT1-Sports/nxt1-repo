/**
 * @fileoverview API Error Constants - Platform Agnostic
 * @module @nxt1/core/errors
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Centralized error code definitions shared across all platforms.
 * Each code maps to a specific HTTP status, category, and default message.
 *
 * Naming Convention: [CATEGORY]_[SPECIFIC_ERROR]
 * - AUTH_*: Authentication errors (401)
 * - AUTHZ_*: Authorization errors (403)
 * - VAL_*: Validation errors (400)
 * - RES_*: Resource errors (404, 409)
 * - RATE_*: Rate limiting (429)
 * - PAY_*: Payment errors (402)
 * - EXT_*: External service errors (502, 503)
 * - SRV_*: Server errors (500)
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import type { ErrorCategory, ErrorSeverity, ErrorAction } from './error.types';

// ============================================
// ERROR CODE DEFINITIONS
// ============================================

/**
 * All possible API error codes
 * Use these for type-safe error handling across the stack
 */
export const API_ERROR_CODES = {
  // ==========================================
  // AUTHENTICATION ERRORS (401)
  // ==========================================

  /** No authentication token provided */
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  /** Token is malformed or invalid */
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  /** Token has expired */
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  /** Token has been revoked */
  AUTH_TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  /** Invalid email or password */
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  /** Account not found */
  AUTH_ACCOUNT_NOT_FOUND: 'AUTH_ACCOUNT_NOT_FOUND',
  /** Account is disabled */
  AUTH_ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  /** Account is locked (too many attempts) */
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  /** Email not verified */
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  /** MFA required */
  AUTH_MFA_REQUIRED: 'AUTH_MFA_REQUIRED',
  /** MFA verification failed */
  AUTH_MFA_FAILED: 'AUTH_MFA_FAILED',
  /** Session expired, re-login required */
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  /** Refresh token is invalid or expired */
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',

  // ==========================================
  // AUTHORIZATION ERRORS (403)
  // ==========================================

  /** User lacks permission for this action */
  AUTHZ_FORBIDDEN: 'AUTHZ_FORBIDDEN',
  /** Resource belongs to another user */
  AUTHZ_NOT_OWNER: 'AUTHZ_NOT_OWNER',
  /** Feature requires premium subscription */
  AUTHZ_PREMIUM_REQUIRED: 'AUTHZ_PREMIUM_REQUIRED',
  /** User role cannot perform this action */
  AUTHZ_ROLE_INSUFFICIENT: 'AUTHZ_ROLE_INSUFFICIENT',
  /** Action blocked by organization policy */
  AUTHZ_POLICY_VIOLATION: 'AUTHZ_POLICY_VIOLATION',
  /** Team membership required */
  AUTHZ_TEAM_REQUIRED: 'AUTHZ_TEAM_REQUIRED',
  /** Admin access required */
  AUTHZ_ADMIN_REQUIRED: 'AUTHZ_ADMIN_REQUIRED',

  // ==========================================
  // VALIDATION ERRORS (400)
  // ==========================================

  /** Generic validation failure */
  VAL_INVALID_INPUT: 'VAL_INVALID_INPUT',
  /** Required field is missing */
  VAL_REQUIRED_FIELD: 'VAL_REQUIRED_FIELD',
  /** Field format is invalid */
  VAL_INVALID_FORMAT: 'VAL_INVALID_FORMAT',
  /** Value is out of allowed range */
  VAL_OUT_OF_RANGE: 'VAL_OUT_OF_RANGE',
  /** String exceeds max length */
  VAL_TOO_LONG: 'VAL_TOO_LONG',
  /** String is below min length */
  VAL_TOO_SHORT: 'VAL_TOO_SHORT',
  /** Invalid email format */
  VAL_INVALID_EMAIL: 'VAL_INVALID_EMAIL',
  /** Invalid phone format */
  VAL_INVALID_PHONE: 'VAL_INVALID_PHONE',
  /** Invalid URL format */
  VAL_INVALID_URL: 'VAL_INVALID_URL',
  /** Invalid date format */
  VAL_INVALID_DATE: 'VAL_INVALID_DATE',
  /** Password doesn't meet requirements */
  VAL_WEAK_PASSWORD: 'VAL_WEAK_PASSWORD',
  /** Passwords don't match */
  VAL_PASSWORD_MISMATCH: 'VAL_PASSWORD_MISMATCH',
  /** Invalid file type */
  VAL_INVALID_FILE_TYPE: 'VAL_INVALID_FILE_TYPE',
  /** File size exceeds limit */
  VAL_FILE_TOO_LARGE: 'VAL_FILE_TOO_LARGE',
  /** Invalid JSON payload */
  VAL_INVALID_JSON: 'VAL_INVALID_JSON',
  /** Invalid enum value */
  VAL_INVALID_ENUM: 'VAL_INVALID_ENUM',
  /** Invalid team code format */
  VAL_INVALID_TEAM_CODE: 'VAL_INVALID_TEAM_CODE',

  // ==========================================
  // RESOURCE ERRORS (404, 409, 410)
  // ==========================================

  /** Generic resource not found */
  RES_NOT_FOUND: 'RES_NOT_FOUND',
  /** User not found */
  RES_USER_NOT_FOUND: 'RES_USER_NOT_FOUND',
  /** Profile not found */
  RES_PROFILE_NOT_FOUND: 'RES_PROFILE_NOT_FOUND',
  /** Team not found */
  RES_TEAM_NOT_FOUND: 'RES_TEAM_NOT_FOUND',
  /** Post not found */
  RES_POST_NOT_FOUND: 'RES_POST_NOT_FOUND',
  /** Team code not found or expired */
  RES_TEAM_CODE_NOT_FOUND: 'RES_TEAM_CODE_NOT_FOUND',
  /** College not found */
  RES_COLLEGE_NOT_FOUND: 'RES_COLLEGE_NOT_FOUND',
  /** Resource already exists (conflict) */
  RES_ALREADY_EXISTS: 'RES_ALREADY_EXISTS',
  /** Email already registered */
  RES_EMAIL_EXISTS: 'RES_EMAIL_EXISTS',
  /** Username already taken */
  RES_USERNAME_EXISTS: 'RES_USERNAME_EXISTS',
  /** Resource was deleted (gone) */
  RES_DELETED: 'RES_DELETED',
  /** Resource version conflict (optimistic locking) */
  RES_CONFLICT: 'RES_CONFLICT',
  /** Team code already used */
  RES_TEAM_CODE_USED: 'RES_TEAM_CODE_USED',
  /** Team code expired */
  RES_TEAM_CODE_EXPIRED: 'RES_TEAM_CODE_EXPIRED',

  // ==========================================
  // RATE LIMITING ERRORS (429)
  // ==========================================

  /** Generic rate limit exceeded */
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  /** Too many login attempts */
  RATE_LOGIN_ATTEMPTS: 'RATE_LOGIN_ATTEMPTS',
  /** Too many API requests */
  RATE_API_REQUESTS: 'RATE_API_REQUESTS',
  /** Too many password reset requests */
  RATE_PASSWORD_RESET: 'RATE_PASSWORD_RESET',
  /** Too many email sends */
  RATE_EMAIL_SENDS: 'RATE_EMAIL_SENDS',
  /** Daily limit reached */
  RATE_DAILY_LIMIT: 'RATE_DAILY_LIMIT',

  // ==========================================
  // PAYMENT ERRORS (402)
  // ==========================================

  /** Generic payment required */
  PAY_PAYMENT_REQUIRED: 'PAY_PAYMENT_REQUIRED',
  /** Subscription expired */
  PAY_SUBSCRIPTION_EXPIRED: 'PAY_SUBSCRIPTION_EXPIRED',
  /** Payment method declined */
  PAY_CARD_DECLINED: 'PAY_CARD_DECLINED',
  /** Payment method expired */
  PAY_CARD_EXPIRED: 'PAY_CARD_EXPIRED',
  /** Insufficient funds */
  PAY_INSUFFICIENT_FUNDS: 'PAY_INSUFFICIENT_FUNDS',
  /** Credits exhausted */
  PAY_NO_CREDITS: 'PAY_NO_CREDITS',
  /** Invalid coupon code */
  PAY_INVALID_COUPON: 'PAY_INVALID_COUPON',
  /** Plan upgrade required */
  PAY_UPGRADE_REQUIRED: 'PAY_UPGRADE_REQUIRED',

  // ==========================================
  // EXTERNAL SERVICE ERRORS (502, 503)
  // ==========================================

  /** Generic external service error */
  EXT_SERVICE_ERROR: 'EXT_SERVICE_ERROR',
  /** Firebase service error */
  EXT_FIREBASE_ERROR: 'EXT_FIREBASE_ERROR',
  /** Stripe service error */
  EXT_STRIPE_ERROR: 'EXT_STRIPE_ERROR',
  /** PayPal service error */
  EXT_PAYPAL_ERROR: 'EXT_PAYPAL_ERROR',
  /** Email service error */
  EXT_EMAIL_ERROR: 'EXT_EMAIL_ERROR',
  /** Storage service error */
  EXT_STORAGE_ERROR: 'EXT_STORAGE_ERROR',
  /** AI/OpenRouter service error */
  EXT_AI_ERROR: 'EXT_AI_ERROR',
  /** Third-party API timeout */
  EXT_TIMEOUT: 'EXT_TIMEOUT',
  /** Third-party API unavailable */
  EXT_UNAVAILABLE: 'EXT_UNAVAILABLE',

  // ==========================================
  // SERVER ERRORS (500, 503)
  // ==========================================

  /** Generic internal server error */
  SRV_INTERNAL_ERROR: 'SRV_INTERNAL_ERROR',
  /** Database error */
  SRV_DATABASE_ERROR: 'SRV_DATABASE_ERROR',
  /** Configuration error */
  SRV_CONFIG_ERROR: 'SRV_CONFIG_ERROR',
  /** Service temporarily unavailable */
  SRV_UNAVAILABLE: 'SRV_UNAVAILABLE',
  /** Maintenance mode */
  SRV_MAINTENANCE: 'SRV_MAINTENANCE',
  /** Feature not implemented */
  SRV_NOT_IMPLEMENTED: 'SRV_NOT_IMPLEMENTED',
  /** Unknown error */
  SRV_UNKNOWN: 'SRV_UNKNOWN',

  // ==========================================
  // CLIENT ERRORS
  // ==========================================

  /** Network request failed */
  CLIENT_NETWORK_ERROR: 'CLIENT_NETWORK_ERROR',
  /** Request timeout */
  CLIENT_TIMEOUT: 'CLIENT_TIMEOUT',
  /** Request cancelled */
  CLIENT_CANCELLED: 'CLIENT_CANCELLED',
  /** Offline mode */
  CLIENT_OFFLINE: 'CLIENT_OFFLINE',
} as const;

/** Type for all error codes */
export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

// ============================================
// ERROR METADATA CONFIGURATION
// ============================================

/**
 * Configuration for each error code
 */
export interface ErrorCodeConfig {
  /** HTTP status code */
  statusCode: number;
  /** Error category */
  category: ErrorCategory;
  /** Default severity */
  severity: ErrorSeverity;
  /** Default user-friendly message */
  defaultMessage: string;
  /** Suggested action for client */
  action: ErrorAction;
  /** Whether error is retryable */
  retryable: boolean;
  /** Retry delay in ms (if retryable) */
  retryAfter?: number;
}

/**
 * Complete error configuration map
 * Each error code maps to its metadata
 */
export const ERROR_CONFIG: Record<ApiErrorCode, ErrorCodeConfig> = {
  // Authentication errors
  [API_ERROR_CODES.AUTH_TOKEN_MISSING]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'warning',
    defaultMessage: 'Please sign in to continue.',
    action: 'login',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_TOKEN_INVALID]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'warning',
    defaultMessage: 'Your session is invalid. Please sign in again.',
    action: 'login',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_TOKEN_EXPIRED]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'info',
    defaultMessage: 'Your session has expired. Please sign in again.',
    action: 'refresh_auth',
    retryable: true,
    retryAfter: 0,
  },
  [API_ERROR_CODES.AUTH_TOKEN_REVOKED]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'warning',
    defaultMessage: 'Your session was revoked. Please sign in again.',
    action: 'login',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_INVALID_CREDENTIALS]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'info',
    defaultMessage: 'Invalid email or password.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_ACCOUNT_NOT_FOUND]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'info',
    defaultMessage: 'No account found with this email.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_ACCOUNT_DISABLED]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'warning',
    defaultMessage: 'Your account has been disabled. Please contact support.',
    action: 'contact_support',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_ACCOUNT_LOCKED]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'warning',
    defaultMessage: 'Account temporarily locked. Please try again later.',
    action: 'wait',
    retryable: true,
    retryAfter: 300000, // 5 minutes
  },
  [API_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'info',
    defaultMessage: 'Please verify your email address to continue.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_MFA_REQUIRED]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'info',
    defaultMessage: 'Multi-factor authentication required.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_MFA_FAILED]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'info',
    defaultMessage: 'Invalid verification code. Please try again.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_SESSION_EXPIRED]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'info',
    defaultMessage: 'Your session has expired. Please sign in again.',
    action: 'login',
    retryable: false,
  },
  [API_ERROR_CODES.AUTH_REFRESH_TOKEN_INVALID]: {
    statusCode: 401,
    category: 'authentication',
    severity: 'warning',
    defaultMessage: 'Unable to refresh session. Please sign in again.',
    action: 'login',
    retryable: false,
  },

  // Authorization errors
  [API_ERROR_CODES.AUTHZ_FORBIDDEN]: {
    statusCode: 403,
    category: 'authorization',
    severity: 'warning',
    defaultMessage: "You don't have permission to perform this action.",
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.AUTHZ_NOT_OWNER]: {
    statusCode: 403,
    category: 'authorization',
    severity: 'warning',
    defaultMessage: 'You can only modify your own resources.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.AUTHZ_PREMIUM_REQUIRED]: {
    statusCode: 403,
    category: 'authorization',
    severity: 'info',
    defaultMessage: 'This feature requires a premium subscription.',
    action: 'upgrade',
    retryable: false,
  },
  [API_ERROR_CODES.AUTHZ_ROLE_INSUFFICIENT]: {
    statusCode: 403,
    category: 'authorization',
    severity: 'warning',
    defaultMessage: 'Your account type cannot access this feature.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.AUTHZ_POLICY_VIOLATION]: {
    statusCode: 403,
    category: 'authorization',
    severity: 'warning',
    defaultMessage: 'This action is not allowed by your organization.',
    action: 'contact_support',
    retryable: false,
  },
  [API_ERROR_CODES.AUTHZ_TEAM_REQUIRED]: {
    statusCode: 403,
    category: 'authorization',
    severity: 'info',
    defaultMessage: 'You must be part of a team to access this feature.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.AUTHZ_ADMIN_REQUIRED]: {
    statusCode: 403,
    category: 'authorization',
    severity: 'warning',
    defaultMessage: 'Administrator access required.',
    action: 'none',
    retryable: false,
  },

  // Validation errors
  [API_ERROR_CODES.VAL_INVALID_INPUT]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Please check your input and try again.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_REQUIRED_FIELD]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Please fill in all required fields.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_FORMAT]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Invalid format. Please check your input.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_OUT_OF_RANGE]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Value is outside the allowed range.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_TOO_LONG]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Input exceeds maximum length.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_TOO_SHORT]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Input is too short.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_EMAIL]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Please enter a valid email address.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_PHONE]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Please enter a valid phone number.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_URL]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Please enter a valid URL.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_DATE]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Please enter a valid date.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_WEAK_PASSWORD]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Password must be at least 8 characters with a mix of letters and numbers.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_PASSWORD_MISMATCH]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Passwords do not match.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_FILE_TYPE]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'File type not supported.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_FILE_TOO_LARGE]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'File size exceeds the maximum limit.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_JSON]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Invalid request format.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_ENUM]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Invalid selection.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.VAL_INVALID_TEAM_CODE]: {
    statusCode: 400,
    category: 'validation',
    severity: 'info',
    defaultMessage: 'Invalid team code format.',
    action: 'fix_input',
    retryable: false,
  },

  // Resource errors
  [API_ERROR_CODES.RES_NOT_FOUND]: {
    statusCode: 404,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'The requested resource was not found.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_USER_NOT_FOUND]: {
    statusCode: 404,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'User not found.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_PROFILE_NOT_FOUND]: {
    statusCode: 404,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'Profile not found.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_TEAM_NOT_FOUND]: {
    statusCode: 404,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'Team not found.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_POST_NOT_FOUND]: {
    statusCode: 404,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'Post not found.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_TEAM_CODE_NOT_FOUND]: {
    statusCode: 404,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'Team code not found or has expired.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_COLLEGE_NOT_FOUND]: {
    statusCode: 404,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'College not found.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_ALREADY_EXISTS]: {
    statusCode: 409,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'This resource already exists.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_EMAIL_EXISTS]: {
    statusCode: 409,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'An account with this email already exists.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_USERNAME_EXISTS]: {
    statusCode: 409,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'This username is already taken.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.RES_DELETED]: {
    statusCode: 410,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'This resource has been deleted.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_CONFLICT]: {
    statusCode: 409,
    category: 'resource',
    severity: 'warning',
    defaultMessage: 'Resource was modified. Please refresh and try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 0,
  },
  [API_ERROR_CODES.RES_TEAM_CODE_USED]: {
    statusCode: 409,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'This team code has already been used.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.RES_TEAM_CODE_EXPIRED]: {
    statusCode: 410,
    category: 'resource',
    severity: 'info',
    defaultMessage: 'This team code has expired.',
    action: 'none',
    retryable: false,
  },

  // Rate limiting errors
  [API_ERROR_CODES.RATE_LIMIT_EXCEEDED]: {
    statusCode: 429,
    category: 'rate_limit',
    severity: 'warning',
    defaultMessage: 'Too many requests. Please wait a moment and try again.',
    action: 'wait',
    retryable: true,
    retryAfter: 60000, // 1 minute
  },
  [API_ERROR_CODES.RATE_LOGIN_ATTEMPTS]: {
    statusCode: 429,
    category: 'rate_limit',
    severity: 'warning',
    defaultMessage: 'Too many login attempts. Please wait before trying again.',
    action: 'wait',
    retryable: true,
    retryAfter: 300000, // 5 minutes
  },
  [API_ERROR_CODES.RATE_API_REQUESTS]: {
    statusCode: 429,
    category: 'rate_limit',
    severity: 'warning',
    defaultMessage: 'API rate limit exceeded. Please try again later.',
    action: 'wait',
    retryable: true,
    retryAfter: 60000,
  },
  [API_ERROR_CODES.RATE_PASSWORD_RESET]: {
    statusCode: 429,
    category: 'rate_limit',
    severity: 'info',
    defaultMessage: 'Password reset limit reached. Please check your email or try again later.',
    action: 'wait',
    retryable: true,
    retryAfter: 3600000, // 1 hour
  },
  [API_ERROR_CODES.RATE_EMAIL_SENDS]: {
    statusCode: 429,
    category: 'rate_limit',
    severity: 'warning',
    defaultMessage: 'Email sending limit reached. Please try again later.',
    action: 'wait',
    retryable: true,
    retryAfter: 3600000,
  },
  [API_ERROR_CODES.RATE_DAILY_LIMIT]: {
    statusCode: 429,
    category: 'rate_limit',
    severity: 'info',
    defaultMessage: 'Daily limit reached. Limit resets at midnight.',
    action: 'wait',
    retryable: true,
    retryAfter: 86400000, // 24 hours
  },

  // Payment errors
  [API_ERROR_CODES.PAY_PAYMENT_REQUIRED]: {
    statusCode: 402,
    category: 'payment',
    severity: 'info',
    defaultMessage: 'Payment required to continue.',
    action: 'upgrade',
    retryable: false,
  },
  [API_ERROR_CODES.PAY_SUBSCRIPTION_EXPIRED]: {
    statusCode: 402,
    category: 'payment',
    severity: 'info',
    defaultMessage: 'Your subscription has expired. Please renew to continue.',
    action: 'upgrade',
    retryable: false,
  },
  [API_ERROR_CODES.PAY_CARD_DECLINED]: {
    statusCode: 402,
    category: 'payment',
    severity: 'warning',
    defaultMessage: 'Your card was declined. Please try a different payment method.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.PAY_CARD_EXPIRED]: {
    statusCode: 402,
    category: 'payment',
    severity: 'warning',
    defaultMessage: 'Your card has expired. Please update your payment method.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.PAY_INSUFFICIENT_FUNDS]: {
    statusCode: 402,
    category: 'payment',
    severity: 'warning',
    defaultMessage: 'Insufficient funds. Please try a different payment method.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.PAY_NO_CREDITS]: {
    statusCode: 402,
    category: 'payment',
    severity: 'info',
    defaultMessage: 'You have run out of credits. Purchase more to continue.',
    action: 'upgrade',
    retryable: false,
  },
  [API_ERROR_CODES.PAY_INVALID_COUPON]: {
    statusCode: 400,
    category: 'payment',
    severity: 'info',
    defaultMessage: 'Invalid or expired coupon code.',
    action: 'fix_input',
    retryable: false,
  },
  [API_ERROR_CODES.PAY_UPGRADE_REQUIRED]: {
    statusCode: 402,
    category: 'payment',
    severity: 'info',
    defaultMessage: 'Please upgrade your plan to access this feature.',
    action: 'upgrade',
    retryable: false,
  },

  // External service errors
  [API_ERROR_CODES.EXT_SERVICE_ERROR]: {
    statusCode: 502,
    category: 'external',
    severity: 'error',
    defaultMessage: 'A service is temporarily unavailable. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.EXT_FIREBASE_ERROR]: {
    statusCode: 502,
    category: 'external',
    severity: 'error',
    defaultMessage: 'Authentication service temporarily unavailable.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.EXT_STRIPE_ERROR]: {
    statusCode: 502,
    category: 'external',
    severity: 'error',
    defaultMessage: 'Payment service temporarily unavailable. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.EXT_PAYPAL_ERROR]: {
    statusCode: 502,
    category: 'external',
    severity: 'error',
    defaultMessage: 'PayPal service temporarily unavailable. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.EXT_EMAIL_ERROR]: {
    statusCode: 502,
    category: 'external',
    severity: 'error',
    defaultMessage: 'Email service temporarily unavailable. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.EXT_STORAGE_ERROR]: {
    statusCode: 502,
    category: 'external',
    severity: 'error',
    defaultMessage: 'Storage service temporarily unavailable. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.EXT_AI_ERROR]: {
    statusCode: 502,
    category: 'external',
    severity: 'error',
    defaultMessage: 'AI service temporarily unavailable. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.EXT_TIMEOUT]: {
    statusCode: 504,
    category: 'external',
    severity: 'error',
    defaultMessage: 'Request timed out. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.EXT_UNAVAILABLE]: {
    statusCode: 503,
    category: 'external',
    severity: 'error',
    defaultMessage: 'Service temporarily unavailable. Please try again later.',
    action: 'retry',
    retryable: true,
    retryAfter: 30000,
  },

  // Server errors
  [API_ERROR_CODES.SRV_INTERNAL_ERROR]: {
    statusCode: 500,
    category: 'server',
    severity: 'error',
    defaultMessage: 'Something went wrong. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.SRV_DATABASE_ERROR]: {
    statusCode: 500,
    category: 'server',
    severity: 'critical',
    defaultMessage: 'Database error. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
  [API_ERROR_CODES.SRV_CONFIG_ERROR]: {
    statusCode: 500,
    category: 'server',
    severity: 'critical',
    defaultMessage: 'Service configuration error. Please contact support.',
    action: 'contact_support',
    retryable: false,
  },
  [API_ERROR_CODES.SRV_UNAVAILABLE]: {
    statusCode: 503,
    category: 'server',
    severity: 'error',
    defaultMessage: 'Service temporarily unavailable. Please try again later.',
    action: 'retry',
    retryable: true,
    retryAfter: 30000,
  },
  [API_ERROR_CODES.SRV_MAINTENANCE]: {
    statusCode: 503,
    category: 'server',
    severity: 'info',
    defaultMessage: "We're performing maintenance. Please check back soon.",
    action: 'wait',
    retryable: true,
    retryAfter: 300000,
  },
  [API_ERROR_CODES.SRV_NOT_IMPLEMENTED]: {
    statusCode: 501,
    category: 'server',
    severity: 'info',
    defaultMessage: 'This feature is not yet available.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.SRV_UNKNOWN]: {
    statusCode: 500,
    category: 'server',
    severity: 'error',
    defaultMessage: 'An unexpected error occurred. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },

  // Client errors
  [API_ERROR_CODES.CLIENT_NETWORK_ERROR]: {
    statusCode: 0,
    category: 'network',
    severity: 'warning',
    defaultMessage: 'Network error. Please check your connection.',
    action: 'retry',
    retryable: true,
    retryAfter: 3000,
  },
  [API_ERROR_CODES.CLIENT_TIMEOUT]: {
    statusCode: 0,
    category: 'network',
    severity: 'warning',
    defaultMessage: 'Request timed out. Please try again.',
    action: 'retry',
    retryable: true,
    retryAfter: 3000,
  },
  [API_ERROR_CODES.CLIENT_CANCELLED]: {
    statusCode: 0,
    category: 'client',
    severity: 'info',
    defaultMessage: 'Request was cancelled.',
    action: 'none',
    retryable: false,
  },
  [API_ERROR_CODES.CLIENT_OFFLINE]: {
    statusCode: 0,
    category: 'network',
    severity: 'warning',
    defaultMessage: "You're offline. Please check your internet connection.",
    action: 'retry',
    retryable: true,
    retryAfter: 5000,
  },
};

/**
 * Get error configuration for a given code
 */
export function getErrorConfig(code: ApiErrorCode): ErrorCodeConfig {
  return ERROR_CONFIG[code] ?? ERROR_CONFIG[API_ERROR_CODES.SRV_UNKNOWN];
}

/**
 * Get HTTP status code for an error code
 */
export function getHttpStatus(code: ApiErrorCode): number {
  return getErrorConfig(code).statusCode;
}

/**
 * Get default message for an error code
 */
export function getDefaultMessage(code: ApiErrorCode): string {
  return getErrorConfig(code).defaultMessage;
}

/**
 * Check if an error code is retryable
 */
export function isRetryable(code: ApiErrorCode): boolean {
  return getErrorConfig(code).retryable;
}

/**
 * Get retry delay for an error code (in ms)
 */
export function getRetryDelay(code: ApiErrorCode): number {
  return getErrorConfig(code).retryAfter ?? 5000;
}
