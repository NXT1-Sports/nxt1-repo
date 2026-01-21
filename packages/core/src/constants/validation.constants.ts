/**
 * @fileoverview Validation Constants
 * @module @nxt1/core/constants
 *
 * Centralized validation rules for forms and data.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

/**
 * Regex patterns for common validations
 */
export const VALIDATION_PATTERNS = {
  /** Email validation (RFC 5322 compliant) */
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  /** Phone number (US format, flexible) */
  PHONE_US: /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/,

  /** International phone (E.164) */
  PHONE_INTERNATIONAL: /^\+[1-9]\d{1,14}$/,

  /** URL validation */
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/,

  /** Username (alphanumeric, underscore, 3-30 chars) */
  USERNAME: /^[a-zA-Z0-9_]{3,30}$/,

  /** Alpha only (letters and spaces) */
  ALPHA: /^[a-zA-Z\s]+$/,

  /** Alphanumeric */
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,

  /** Zip code (US) */
  ZIP_US: /^\d{5}(-\d{4})?$/,

  /** Social media handles */
  TWITTER_HANDLE: /^@?[a-zA-Z0-9_]{1,15}$/,
  INSTAGRAM_HANDLE: /^@?[a-zA-Z0-9_.]{1,30}$/,

  /** YouTube video ID */
  YOUTUBE_VIDEO_ID: /^[a-zA-Z0-9_-]{11}$/,

  /** Hudl video URL */
  HUDL_URL: /^https?:\/\/(www\.)?hudl\.com\/video\/\d+/,

  /** GPA (0.00 - 4.00) */
  GPA: /^[0-4]\.[0-9]{1,2}$/,

  /** Height (e.g., 6'2" or 6-2) */
  HEIGHT: /^[4-7]['′-]?\s*([0-9]|1[01])[""″]?$/,

  /** Weight (lbs, 80-400) */
  WEIGHT: /^([89][0-9]|[1-3][0-9]{2}|400)$/,

  /** Team code format */
  TEAM_CODE: /^[A-Z0-9]{6,10}$/,
} as const;

/**
 * Password requirements
 */
export const PASSWORD_RULES = {
  /** Minimum length */
  MIN_LENGTH: 8,

  /** Maximum length */
  MAX_LENGTH: 128,

  /** Require uppercase letter */
  REQUIRE_UPPERCASE: true,

  /** Require lowercase letter */
  REQUIRE_LOWERCASE: true,

  /** Require number */
  REQUIRE_NUMBER: true,

  /** Require special character */
  REQUIRE_SPECIAL: false,

  /** Pattern for strong password */
  PATTERN: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
} as const;

/**
 * Field length constraints
 */
export const FIELD_LENGTHS = {
  // User profile
  FIRST_NAME: { min: 1, max: 50 },
  LAST_NAME: { min: 1, max: 50 },
  USERNAME: { min: 3, max: 30 },
  BIO: { min: 0, max: 500 },
  HEADLINE: { min: 0, max: 150 },

  // Content
  POST_TEXT: { min: 1, max: 2000 },
  COMMENT: { min: 1, max: 500 },
  VIDEO_TITLE: { min: 1, max: 100 },
  VIDEO_DESCRIPTION: { min: 0, max: 1000 },

  // Messaging
  MESSAGE: { min: 1, max: 2000 },
  SUBJECT: { min: 1, max: 200 },

  // Search
  SEARCH_QUERY: { min: 1, max: 100 },

  // Team
  TEAM_NAME: { min: 2, max: 100 },
  TEAM_DESCRIPTION: { min: 0, max: 500 },
} as const;

/**
 * Numeric constraints for athlete stats
 */
export const ATHLETE_STATS = {
  // Physical
  HEIGHT_INCHES: { min: 48, max: 96 }, // 4'0" to 8'0"
  WEIGHT_LBS: { min: 80, max: 400 },

  // Academic
  GPA: { min: 0.0, max: 4.0 },
  SAT: { min: 400, max: 1600 },
  ACT: { min: 1, max: 36 },

  // Class year
  GRAD_YEAR: { min: 2020, max: 2035 },

  // Jersey number
  JERSEY_NUMBER: { min: 0, max: 99 },
} as const;

/**
 * Validation error messages
 */
export const VALIDATION_MESSAGES = {
  REQUIRED: 'This field is required',
  EMAIL_INVALID: 'Please enter a valid email address',
  PASSWORD_WEAK: 'Password must be at least 8 characters with uppercase, lowercase, and number',
  PASSWORD_MISMATCH: 'Passwords do not match',
  PHONE_INVALID: 'Please enter a valid phone number',
  URL_INVALID: 'Please enter a valid URL',
  USERNAME_TAKEN: 'This username is already taken',
  USERNAME_INVALID: 'Username can only contain letters, numbers, and underscores',
  MIN_LENGTH: (min: number) => `Must be at least ${min} characters`,
  MAX_LENGTH: (max: number) => `Must be no more than ${max} characters`,
  MIN_VALUE: (min: number) => `Must be at least ${min}`,
  MAX_VALUE: (max: number) => `Must be no more than ${max}`,
  PATTERN_MISMATCH: 'Please enter a valid value',
  FILE_TOO_LARGE: 'File is too large',
  FILE_TYPE_INVALID: 'File type not supported',
} as const;

// ============================================
// VALIDATION HELPER FUNCTIONS
// ============================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return VALIDATION_PATTERNS.EMAIL.test(email);
}

/**
 * Validate US phone number
 */
export function isValidPhoneUS(phone: string): boolean {
  return VALIDATION_PATTERNS.PHONE_US.test(phone);
}

/**
 * Validate URL
 */
export function isValidUrl(url: string): boolean {
  return VALIDATION_PATTERNS.URL.test(url);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): boolean {
  if (password.length < PASSWORD_RULES.MIN_LENGTH) return false;
  if (password.length > PASSWORD_RULES.MAX_LENGTH) return false;
  return PASSWORD_RULES.PATTERN.test(password);
}

/**
 * Validate field length
 */
export function isValidLength(value: string, field: keyof typeof FIELD_LENGTHS): boolean {
  const constraints = FIELD_LENGTHS[field];
  return value.length >= constraints.min && value.length <= constraints.max;
}
