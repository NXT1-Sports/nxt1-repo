/**
 * @fileoverview PII Scrubber - GDPR/CCPA Compliant Data Sanitization
 * @module @nxt1/core/crashlytics
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Enterprise-grade PII (Personally Identifiable Information) scrubbing
 * for crash reports. Ensures GDPR and CCPA compliance by removing or
 * masking sensitive data before it reaches Firebase Crashlytics.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// SENSITIVE DATA PATTERNS
// ============================================

/**
 * Regex patterns for detecting sensitive data in strings
 */
export const PII_PATTERNS = {
  /** Email addresses */
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,

  /** Phone numbers (various formats) */
  PHONE: /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,

  /** Social Security Numbers */
  SSN: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,

  /** Credit card numbers (basic patterns) */
  CREDIT_CARD: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,

  /** JWT tokens */
  JWT: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,

  /** Bearer tokens in headers */
  BEARER_TOKEN: /Bearer\s+[a-zA-Z0-9_-]+/gi,

  /** API keys (common patterns) */
  API_KEY: /(?:api[_-]?key|apikey)[=:]\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/gi,

  /** Firebase tokens */
  FIREBASE_TOKEN: /(?:firebase|fcm)[_-]?token[=:]\s*['"]?[a-zA-Z0-9:_-]{100,}['"]?/gi,

  /** IP addresses */
  IP_ADDRESS: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

  /** URLs with potential auth params */
  AUTH_URL_PARAMS: /(?:token|key|password|secret|auth)[=][^&\s]+/gi,

  /** Base64-encoded data (potential secrets) */
  BASE64_SECRET: /(?:password|secret|key|token)[=:]\s*['"]?[A-Za-z0-9+/=]{20,}['"]?/gi,

  /** Street addresses (basic US format) */
  STREET_ADDRESS:
    /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|way|court|ct|boulevard|blvd)\b/gi,

  /** Date of birth patterns */
  DOB: /(?:dob|birth|birthday|born)[=:]\s*['"]?\d{1,2}[-/]\d{1,2}[-/]\d{2,4}['"]?/gi,
} as const;

/**
 * Keys that should be completely removed or masked
 */
export const SENSITIVE_KEY_PATTERNS = [
  // Authentication
  'password',
  'passwd',
  'secret',
  'token',
  'jwt',
  'bearer',
  'authorization',
  'auth',
  'credential',
  'private_key',
  'privateKey',
  'api_key',
  'apiKey',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'session_id',
  'sessionId',

  // Personal info
  'ssn',
  'social_security',
  'socialSecurity',
  'dob',
  'date_of_birth',
  'dateOfBirth',
  'birth_date',
  'birthDate',

  // Financial
  'credit_card',
  'creditCard',
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',
  'bank_account',
  'bankAccount',
  'routing_number',
  'routingNumber',
  'account_number',
  'accountNumber',

  // Contact info (partial masking preferred)
  'phone',
  'mobile',
  'telephone',
  'address',
  'street',
  'zip',
  'postal',
] as const;

/**
 * Keys that should be partially masked (show domain for email, last 4 for phone)
 */
export const PARTIAL_MASK_KEYS = ['email', 'phone', 'mobile'] as const;

// ============================================
// SCRUBBING FUNCTIONS
// ============================================

/**
 * Check if a key name indicates sensitive data
 */
export function isSensitiveKeyName(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern.toLowerCase()));
}

/**
 * Check if a key should be partially masked instead of fully redacted
 */
export function shouldPartialMask(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return PARTIAL_MASK_KEYS.some((pattern) => lowerKey.includes(pattern.toLowerCase()));
}

/**
 * Mask an email address (show first 2 chars + domain)
 * john.doe@example.com → jo***@example.com
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '[REDACTED_EMAIL]';

  const localPart = email.substring(0, atIndex);
  const domain = email.substring(atIndex);
  const visibleChars = Math.min(2, localPart.length);

  return localPart.substring(0, visibleChars) + '***' + domain;
}

/**
 * Mask a phone number (show last 4 digits)
 * +1-555-123-4567 → ***-***-4567
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '[REDACTED_PHONE]';

  const lastFour = digits.slice(-4);
  return `***-***-${lastFour}`;
}

/**
 * Scrub PII from a string
 */
export function scrubString(value: string): string {
  let scrubbed = value;

  // Replace emails with masked versions
  scrubbed = scrubbed.replace(PII_PATTERNS.EMAIL, (match) => maskEmail(match));

  // Replace phone numbers
  scrubbed = scrubbed.replace(PII_PATTERNS.PHONE, (match) => maskPhone(match));

  // Redact other sensitive patterns
  scrubbed = scrubbed.replace(PII_PATTERNS.SSN, '[REDACTED_SSN]');
  scrubbed = scrubbed.replace(PII_PATTERNS.CREDIT_CARD, '[REDACTED_CARD]');
  scrubbed = scrubbed.replace(PII_PATTERNS.JWT, '[REDACTED_JWT]');
  scrubbed = scrubbed.replace(PII_PATTERNS.BEARER_TOKEN, 'Bearer [REDACTED]');
  scrubbed = scrubbed.replace(PII_PATTERNS.API_KEY, 'api_key=[REDACTED]');
  scrubbed = scrubbed.replace(PII_PATTERNS.FIREBASE_TOKEN, 'firebase_token=[REDACTED]');
  scrubbed = scrubbed.replace(PII_PATTERNS.AUTH_URL_PARAMS, (match) => {
    const key = match.split('=')[0];
    return `${key}=[REDACTED]`;
  });
  scrubbed = scrubbed.replace(PII_PATTERNS.BASE64_SECRET, (match) => {
    const key = match.split(/[=:]/)[0];
    return `${key}=[REDACTED]`;
  });
  scrubbed = scrubbed.replace(PII_PATTERNS.STREET_ADDRESS, '[REDACTED_ADDRESS]');
  scrubbed = scrubbed.replace(PII_PATTERNS.DOB, 'dob=[REDACTED]');

  // Optionally redact IP addresses (uncomment if needed)
  // scrubbed = scrubbed.replace(PII_PATTERNS.IP_ADDRESS, '[REDACTED_IP]');

  return scrubbed;
}

/**
 * Scrub PII from an object (deep)
 *
 * @param data - Object to scrub
 * @param depth - Current recursion depth (prevents infinite loops)
 * @returns Scrubbed copy of the object
 */
export function scrubObject<T extends Record<string, unknown>>(data: T, depth = 0): T {
  const MAX_DEPTH = 10;

  if (depth > MAX_DEPTH) {
    return { '[MAX_DEPTH_EXCEEDED]': true } as unknown as T;
  }

  const scrubbed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    // Check if key indicates sensitive data
    if (isSensitiveKeyName(key)) {
      // Partial mask for emails/phones
      if (shouldPartialMask(key) && typeof value === 'string') {
        if (key.toLowerCase().includes('email')) {
          scrubbed[key] = maskEmail(value);
        } else if (key.toLowerCase().includes('phone') || key.toLowerCase().includes('mobile')) {
          scrubbed[key] = maskPhone(value);
        } else {
          scrubbed[key] = '[REDACTED]';
        }
      } else {
        scrubbed[key] = '[REDACTED]';
      }
      continue;
    }

    // Process value based on type
    if (value === null || value === undefined) {
      scrubbed[key] = value;
    } else if (typeof value === 'string') {
      scrubbed[key] = scrubString(value);
    } else if (typeof value === 'object') {
      if (Array.isArray(value)) {
        scrubbed[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? scrubObject(item as Record<string, unknown>, depth + 1)
            : typeof item === 'string'
              ? scrubString(item)
              : item
        );
      } else {
        scrubbed[key] = scrubObject(value as Record<string, unknown>, depth + 1);
      }
    } else {
      // Primitives (numbers, booleans) are safe
      scrubbed[key] = value;
    }
  }

  return scrubbed as T;
}

/**
 * Scrub PII from an Error object
 *
 * @param error - Error to scrub
 * @returns Scrubbed copy of error details
 */
export function scrubError(error: Error): {
  name: string;
  message: string;
  stack?: string;
} {
  return {
    name: error.name,
    message: scrubString(error.message),
    stack: error.stack ? scrubStackTrace(error.stack) : undefined,
  };
}

/**
 * Scrub PII from a stack trace
 */
export function scrubStackTrace(stack: string): string {
  let scrubbed = stack;

  // Scrub any PII that might appear in stack traces
  scrubbed = scrubString(scrubbed);

  // Remove absolute file paths that might reveal usernames
  // /Users/john.doe/projects/app/src/file.ts → /[USER]/projects/app/src/file.ts
  scrubbed = scrubbed.replace(/\/Users\/[^/]+\//g, '/[USER]/');
  scrubbed = scrubbed.replace(/C:\\Users\\[^\\]+\\/gi, 'C:\\[USER]\\');

  // Remove home directory references
  scrubbed = scrubbed.replace(/~\/[^/]+\//g, '~/[USER]/');

  return scrubbed;
}

/**
 * Create a scrubbed version of AppError context
 */
export function scrubAppErrorContext(context: Record<string, unknown>): Record<string, unknown> {
  return scrubObject(context);
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * Scrubber configuration options
 */
export interface ScrubberConfig {
  /** Whether to mask IP addresses (default: false) */
  maskIpAddresses?: boolean;

  /** Whether to mask URLs (default: false) */
  maskUrls?: boolean;

  /** Additional key patterns to treat as sensitive */
  additionalSensitiveKeys?: string[];

  /** Keys to exclude from scrubbing */
  excludeKeys?: string[];
}

/**
 * Create a configured scrubber function
 */
export function createScrubber(config: ScrubberConfig = {}) {
  const { maskIpAddresses = false, additionalSensitiveKeys = [], excludeKeys = [] } = config;

  const allSensitiveKeys = [...SENSITIVE_KEY_PATTERNS, ...additionalSensitiveKeys];

  return {
    scrubString: (value: string) => {
      let scrubbed = scrubString(value);
      if (maskIpAddresses) {
        scrubbed = scrubbed.replace(PII_PATTERNS.IP_ADDRESS, '[REDACTED_IP]');
      }
      return scrubbed;
    },

    scrubObject: <T extends Record<string, unknown>>(data: T): T => {
      // Filter out excluded keys first
      const filtered = Object.fromEntries(
        Object.entries(data).filter(([key]) => !excludeKeys.includes(key))
      ) as T;

      return scrubObject(filtered);
    },

    isSensitive: (key: string) => {
      const lowerKey = key.toLowerCase();
      return allSensitiveKeys.some((pattern) => lowerKey.includes(pattern.toLowerCase()));
    },
  };
}
