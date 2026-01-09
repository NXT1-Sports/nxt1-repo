/**
 * @fileoverview Validation Helpers - Pure TypeScript
 * @module @nxt1/core/helpers
 *
 * Pure validation functions with no platform dependencies.
 * 100% portable - works on Web, Mobile, Server.
 *
 * @version 2.0.0
 */

// ============================================
// EMAIL VALIDATION
// ============================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

// ============================================
// PHONE VALIDATION
// ============================================

const PHONE_REGEX = /^\+?[\d\s\-()]{10,}$/;

export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  return PHONE_REGEX.test(phone.trim());
}

/**
 * Format phone number to standard format
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

// ============================================
// URL VALIDATION
// ============================================

export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure URL has protocol
 */
export function ensureHttps(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

// ============================================
// SOCIAL MEDIA VALIDATION
// ============================================

const SOCIAL_PATTERNS = {
  twitter: /^@?[A-Za-z0-9_]{1,15}$/,
  instagram: /^@?[A-Za-z0-9_.]{1,30}$/,
  tiktok: /^@?[A-Za-z0-9_.]{2,24}$/,
} as const;

export function isValidSocialHandle(
  platform: keyof typeof SOCIAL_PATTERNS,
  handle: string
): boolean {
  if (!handle || typeof handle !== 'string') return false;
  const pattern = SOCIAL_PATTERNS[platform];
  return pattern ? pattern.test(handle.trim()) : true;
}

/**
 * Clean social media handle (remove @ if present)
 */
export function cleanSocialHandle(handle: string): string {
  return handle.trim().replace(/^@/, '');
}

// ============================================
// PASSWORD VALIDATION
// ============================================

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain a number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain a special character');
  }

  const score = 5 - errors.length;
  let strength: PasswordValidationResult['strength'] = 'weak';
  if (score >= 5) strength = 'strong';
  else if (score >= 4) strength = 'good';
  else if (score >= 3) strength = 'fair';

  return {
    isValid: errors.length === 0,
    errors,
    strength,
  };
}

// ============================================
// NAME VALIDATION
// ============================================

export function isValidName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 50 && /^[a-zA-Z\s'-]+$/.test(trimmed);
}

// ============================================
// TEAM CODE VALIDATION
// ============================================

const TEAM_CODE_REGEX = /^[A-Z0-9]{4,10}$/i;

export function isValidTeamCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  return TEAM_CODE_REGEX.test(code.trim().toUpperCase());
}

// ============================================
// GPA VALIDATION
// ============================================

export function isValidGpa(gpa: number): boolean {
  return typeof gpa === 'number' && gpa >= 0 && gpa <= 5.0;
}

// ============================================
// YEAR VALIDATION
// ============================================

export function isValidGraduationYear(year: number): boolean {
  const currentYear = new Date().getFullYear();
  return typeof year === 'number' && year >= currentYear - 2 && year <= currentYear + 12;
}

// ============================================
// CONTENT MODERATION
// ============================================

const PROFANITY_WORDS = new Set([
  // Common profanity patterns (simplified - use a proper library in production)
  'badword1',
  'badword2',
]);

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const words = text.toLowerCase().split(/\s+/);
  return words.some((word) => PROFANITY_WORDS.has(word));
}

/**
 * Sanitize text input
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>"']/g, ''); // Remove potentially dangerous characters
}

// ============================================
// FORM VALIDATION HELPERS
// ============================================

export interface ValidationRule {
  validate: (value: unknown) => boolean;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validate(value: unknown, rules: ValidationRule[]): ValidationResult {
  const errors: string[] = [];

  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Pre-built validation rules
export const required: ValidationRule = {
  validate: (value) => value !== null && value !== undefined && value !== '',
  message: 'This field is required',
};

export const email: ValidationRule = {
  validate: (value) => typeof value === 'string' && isValidEmail(value),
  message: 'Please enter a valid email address',
};

export const phone: ValidationRule = {
  validate: (value) => typeof value === 'string' && isValidPhone(value),
  message: 'Please enter a valid phone number',
};

export function minLength(min: number): ValidationRule {
  return {
    validate: (value) => typeof value === 'string' && value.length >= min,
    message: `Must be at least ${min} characters`,
  };
}

export function maxLength(max: number): ValidationRule {
  return {
    validate: (value) => typeof value === 'string' && value.length <= max,
    message: `Must be no more than ${max} characters`,
  };
}

export function minValue(min: number): ValidationRule {
  return {
    validate: (value) => typeof value === 'number' && value >= min,
    message: `Must be at least ${min}`,
  };
}

export function maxValue(max: number): ValidationRule {
  return {
    validate: (value) => typeof value === 'number' && value <= max,
    message: `Must be no more than ${max}`,
  };
}
