/** Disposable (temporary) email domains — blocked during registration */
export const USER_SCHEMA_VERSION = 2;

export const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  'throwaway.com',
  'mailinator.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
  'fakeinbox.com',
  'tempail.com',
  'dispostable.com',
] as const;

// ============================================
// VALIDATION PATTERNS
// Source: packages/core/src/constants/validation.constants.ts
// ============================================

export const VALIDATION_PATTERNS = {
  /** Email (RFC 5322) */
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  /** US phone */
  PHONE_US: /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/,

  /** International phone (E.164) */
  PHONE_INTERNATIONAL: /^\+[1-9]\d{1,14}$/,

  /** URL */
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/,

  /** Username (alphanumeric + underscore, 3-30 ký tự) */
  USERNAME: /^[a-zA-Z0-9_]{3,30}$/,

  /** Alpha only */
  ALPHA: /^[a-zA-Z\s]+$/,

  /** Alphanumeric */
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,

  /** US Zip code */
  ZIP_US: /^\d{5}(-\d{4})?$/,

  /** Social handles */
  TWITTER_HANDLE: /^@?[a-zA-Z0-9_]{1,15}$/,
  INSTAGRAM_HANDLE: /^@?[a-zA-Z0-9_.]{1,30}$/,

  /** YouTube video ID */
  YOUTUBE_VIDEO_ID: /^[a-zA-Z0-9_-]{11}$/,

  /** Hudl video URL */
  HUDL_URL: /^https?:\/\/(www\.)?hudl\.com\/video\/\d+/,

  /** GPA (0.00–4.00) */
  GPA: /^[0-4]\.[0-9]{1,2}$/,

  /** Height */
  HEIGHT: /^[4-7]['′-]?\s*([0-9]|1[01])[""″]?$/,

  /** Weight (lbs, 80-400) */
  WEIGHT: /^([89][0-9]|[1-3][0-9]{2}|400)$/,

  /** Team code */
  TEAM_CODE: /^[A-Z0-9]{6,10}$/,
} as const;

// ============================================
// FIELD LENGTHS
// Source: packages/core/src/constants/validation.constants.ts
// ============================================

export const FIELD_LENGTHS = {
  FIRST_NAME: { min: 1, max: 50 },
  LAST_NAME: { min: 1, max: 50 },
  USERNAME: { min: 3, max: 30 },
  BIO: { min: 0, max: 500 },
  HEADLINE: { min: 0, max: 150 },
  POST_TEXT: { min: 1, max: 2000 },
  COMMENT: { min: 1, max: 500 },
  VIDEO_TITLE: { min: 1, max: 100 },
  VIDEO_DESCRIPTION: { min: 0, max: 1000 },
  MESSAGE: { min: 1, max: 2000 },
  SUBJECT: { min: 1, max: 200 },
  SEARCH_QUERY: { min: 1, max: 100 },
  TEAM_NAME: { min: 2, max: 100 },
  TEAM_DESCRIPTION: { min: 0, max: 500 },
} as const;

// ============================================
// RESERVED USERNAMES
// Source: packages/core/src/constants/validation.constants.ts
// ============================================

export const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'nxt1',
  'nxt1sports',
  'support',
  'help',
  'api',
  'www',
  'app',
  'mail',
  'email',
  'root',
  'system',
  'test',
  'info',
  'contact',
  'sales',
  'billing',
] as const;
