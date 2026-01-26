/**
 * @fileoverview Unit Tests for Validators
 * @module @nxt1/core/helpers
 *
 * Comprehensive tests for all validation functions.
 * Coverage target: 100%
 *
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidPhone,
  formatPhone,
  isValidUrl,
  ensureHttps,
  isValidSocialHandle,
  cleanSocialHandle,
  validatePassword,
  isValidName,
  isValidTeamCode,
  isValidGpa,
  isValidGraduationYear,
  containsProfanity,
  sanitizeText,
  validate,
  required,
  email,
  phone,
  minLength,
  maxLength,
  minValue,
  maxValue,
} from './validators';

// ============================================
// EMAIL VALIDATION
// ============================================

describe('isValidEmail', () => {
  describe('valid emails', () => {
    it('should accept standard email format', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    it('should accept email with subdomain', () => {
      expect(isValidEmail('user@mail.example.com')).toBe(true);
    });

    it('should accept email with plus sign', () => {
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should accept email with dots in local part', () => {
      expect(isValidEmail('user.name@example.com')).toBe(true);
    });

    it('should accept email with numbers', () => {
      expect(isValidEmail('user123@example456.com')).toBe(true);
    });

    it('should accept email with hyphens in domain', () => {
      expect(isValidEmail('user@my-domain.com')).toBe(true);
    });

    it('should accept email with various TLDs', () => {
      expect(isValidEmail('user@example.co.uk')).toBe(true);
      expect(isValidEmail('user@example.io')).toBe(true);
      expect(isValidEmail('user@example.edu')).toBe(true);
    });

    it('should accept email with leading/trailing whitespace (trimmed)', () => {
      expect(isValidEmail('  user@example.com  ')).toBe(true);
    });
  });

  describe('invalid emails', () => {
    it('should reject empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidEmail(null as unknown as string)).toBe(false);
      expect(isValidEmail(undefined as unknown as string)).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(isValidEmail(123 as unknown as string)).toBe(false);
      expect(isValidEmail({} as unknown as string)).toBe(false);
    });

    it('should reject email without @', () => {
      expect(isValidEmail('userexample.com')).toBe(false);
    });

    it('should reject email without domain', () => {
      expect(isValidEmail('user@')).toBe(false);
    });

    it('should reject email without local part', () => {
      expect(isValidEmail('@example.com')).toBe(false);
    });

    it('should reject email with spaces in middle', () => {
      expect(isValidEmail('user @example.com')).toBe(false);
      expect(isValidEmail('user@ example.com')).toBe(false);
    });

    it('should reject email without TLD', () => {
      expect(isValidEmail('user@example')).toBe(false);
    });

    it('should reject plain text', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
    });
  });
});

// ============================================
// PHONE VALIDATION
// ============================================

describe('isValidPhone', () => {
  describe('valid phone numbers', () => {
    it('should accept 10-digit number', () => {
      expect(isValidPhone('1234567890')).toBe(true);
    });

    it('should accept formatted US number', () => {
      expect(isValidPhone('(123) 456-7890')).toBe(true);
    });

    it('should accept number with country code', () => {
      expect(isValidPhone('+1 123 456 7890')).toBe(true);
    });

    it('should accept number with dashes', () => {
      expect(isValidPhone('123-456-7890')).toBe(true);
    });

    it('should reject number with dots (not in allowed format)', () => {
      // PHONE_REGEX only allows: digits, spaces, hyphens, parentheses, and optional +
      expect(isValidPhone('123.456.7890')).toBe(false);
    });

    it('should accept international formats', () => {
      expect(isValidPhone('+44 20 7946 0958')).toBe(true);
      expect(isValidPhone('+81 3-1234-5678')).toBe(true);
    });

    it('should accept number with whitespace (trimmed)', () => {
      expect(isValidPhone('  1234567890  ')).toBe(true);
    });
  });

  describe('invalid phone numbers', () => {
    it('should reject empty string', () => {
      expect(isValidPhone('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidPhone(null as unknown as string)).toBe(false);
      expect(isValidPhone(undefined as unknown as string)).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(isValidPhone(1234567890 as unknown as string)).toBe(false);
    });

    it('should reject too short numbers', () => {
      expect(isValidPhone('12345')).toBe(false);
      expect(isValidPhone('123456789')).toBe(false); // 9 digits
    });

    it('should reject letters', () => {
      expect(isValidPhone('123-ABC-7890')).toBe(false);
    });
  });
});

describe('formatPhone', () => {
  it('should format 10-digit US number', () => {
    expect(formatPhone('1234567890')).toBe('(123) 456-7890');
  });

  it('should format 11-digit number with country code 1', () => {
    expect(formatPhone('11234567890')).toBe('+1 (123) 456-7890');
  });

  it('should strip non-digits before formatting', () => {
    expect(formatPhone('(123) 456-7890')).toBe('(123) 456-7890');
  });

  it('should return original if not 10 or 11 digits', () => {
    expect(formatPhone('123')).toBe('123');
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
});

// ============================================
// URL VALIDATION
// ============================================

describe('isValidUrl', () => {
  describe('valid URLs', () => {
    it('should accept http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('should accept https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('should accept URLs with paths', () => {
      expect(isValidUrl('https://example.com/path/to/page')).toBe(true);
    });

    it('should accept URLs with query params', () => {
      expect(isValidUrl('https://example.com?foo=bar')).toBe(true);
    });

    it('should accept URLs with fragments', () => {
      expect(isValidUrl('https://example.com#section')).toBe(true);
    });

    it('should accept URLs with ports', () => {
      expect(isValidUrl('https://example.com:8080')).toBe(true);
    });

    it('should accept localhost', () => {
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('should reject empty string', () => {
      expect(isValidUrl('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidUrl(null as unknown as string)).toBe(false);
      expect(isValidUrl(undefined as unknown as string)).toBe(false);
    });

    it('should reject URLs without protocol', () => {
      expect(isValidUrl('example.com')).toBe(false);
    });

    it('should reject malformed URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('http://')).toBe(false);
    });
  });
});

describe('ensureHttps', () => {
  it('should add https:// to bare domain', () => {
    expect(ensureHttps('example.com')).toBe('https://example.com');
  });

  it('should not modify existing https://', () => {
    expect(ensureHttps('https://example.com')).toBe('https://example.com');
  });

  it('should not modify existing http://', () => {
    expect(ensureHttps('http://example.com')).toBe('http://example.com');
  });

  it('should handle empty string', () => {
    expect(ensureHttps('')).toBe('');
  });

  it('should handle paths', () => {
    expect(ensureHttps('example.com/path')).toBe('https://example.com/path');
  });
});

// ============================================
// SOCIAL MEDIA VALIDATION
// ============================================

describe('isValidSocialHandle', () => {
  describe('Twitter handles', () => {
    it('should accept valid Twitter handle', () => {
      expect(isValidSocialHandle('twitter', 'username')).toBe(true);
      expect(isValidSocialHandle('twitter', '@username')).toBe(true);
    });

    it('should accept handles with numbers', () => {
      expect(isValidSocialHandle('twitter', 'user123')).toBe(true);
    });

    it('should accept handles with underscores', () => {
      expect(isValidSocialHandle('twitter', 'user_name')).toBe(true);
    });

    it('should reject handles over 15 characters', () => {
      expect(isValidSocialHandle('twitter', 'thisusernameistoolong')).toBe(false);
    });

    it('should reject handles with special characters', () => {
      expect(isValidSocialHandle('twitter', 'user-name')).toBe(false);
      expect(isValidSocialHandle('twitter', 'user.name')).toBe(false);
    });
  });

  describe('Instagram handles', () => {
    it('should accept valid Instagram handle', () => {
      expect(isValidSocialHandle('instagram', 'username')).toBe(true);
      expect(isValidSocialHandle('instagram', '@username')).toBe(true);
    });

    it('should accept handles with periods', () => {
      expect(isValidSocialHandle('instagram', 'user.name')).toBe(true);
    });

    it('should accept handles with underscores', () => {
      expect(isValidSocialHandle('instagram', 'user_name')).toBe(true);
    });

    it('should reject handles over 30 characters', () => {
      expect(isValidSocialHandle('instagram', 'a'.repeat(31))).toBe(false);
    });
  });

  describe('TikTok handles', () => {
    it('should accept valid TikTok handle', () => {
      expect(isValidSocialHandle('tiktok', 'username')).toBe(true);
      expect(isValidSocialHandle('tiktok', '@username')).toBe(true);
    });

    it('should reject single character handles', () => {
      expect(isValidSocialHandle('tiktok', 'a')).toBe(false);
    });

    it('should reject handles over 24 characters', () => {
      expect(isValidSocialHandle('tiktok', 'a'.repeat(25))).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should reject empty handles', () => {
      expect(isValidSocialHandle('twitter', '')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidSocialHandle('twitter', null as unknown as string)).toBe(false);
      expect(isValidSocialHandle('twitter', undefined as unknown as string)).toBe(false);
    });
  });
});

describe('cleanSocialHandle', () => {
  it('should remove @ prefix', () => {
    expect(cleanSocialHandle('@username')).toBe('username');
  });

  it('should not modify handle without @', () => {
    expect(cleanSocialHandle('username')).toBe('username');
  });

  it('should trim whitespace', () => {
    expect(cleanSocialHandle('  @username  ')).toBe('username');
  });

  it('should only remove first @', () => {
    expect(cleanSocialHandle('@@username')).toBe('@username');
  });
});

// ============================================
// PASSWORD VALIDATION
// ============================================

describe('validatePassword', () => {
  describe('strong passwords', () => {
    it('should accept password meeting all criteria', () => {
      const result = validatePassword('MyPass123!');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBe('strong');
    });

    it('should accept various special characters', () => {
      expect(validatePassword('MyPass123@').isValid).toBe(true);
      expect(validatePassword('MyPass123#').isValid).toBe(true);
      expect(validatePassword('MyPass123$').isValid).toBe(true);
      expect(validatePassword('MyPass123%').isValid).toBe(true);
    });
  });

  describe('weak passwords', () => {
    it('should reject password too short', () => {
      const result = validatePassword('Pass1!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should reject password without lowercase', () => {
      const result = validatePassword('MYPASS123!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain a lowercase letter');
    });

    it('should reject password without uppercase', () => {
      const result = validatePassword('mypass123!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain an uppercase letter');
    });

    it('should reject password without number', () => {
      const result = validatePassword('MyPassword!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain a number');
    });

    it('should reject password without special character', () => {
      const result = validatePassword('MyPass123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain a special character');
    });

    it('should reject empty password', () => {
      const result = validatePassword('');
      expect(result.isValid).toBe(false);
      expect(result.strength).toBe('weak');
    });
  });

  describe('password strength levels', () => {
    it('should return weak for multiple missing criteria', () => {
      const result = validatePassword('pass');
      expect(result.strength).toBe('weak');
    });

    it('should return fair for 3 criteria met', () => {
      const result = validatePassword('MyPassword'); // missing number and special
      expect(result.strength).toBe('fair');
    });

    it('should return good for 4 criteria met', () => {
      const result = validatePassword('MyPassword1'); // missing special
      expect(result.strength).toBe('good');
    });

    it('should return strong for all criteria met', () => {
      const result = validatePassword('MyPassword1!');
      expect(result.strength).toBe('strong');
    });
  });
});

// ============================================
// NAME VALIDATION
// ============================================

describe('isValidName', () => {
  describe('valid names', () => {
    it('should accept simple names', () => {
      expect(isValidName('John')).toBe(true);
      expect(isValidName('Jane')).toBe(true);
    });

    it('should accept names with spaces', () => {
      expect(isValidName('Mary Jane')).toBe(true);
    });

    it('should accept names with hyphens', () => {
      expect(isValidName('Mary-Jane')).toBe(true);
      expect(isValidName("O'Brien")).toBe(true);
    });

    it('should accept names with apostrophes', () => {
      expect(isValidName("O'Connor")).toBe(true);
    });

    it('should accept names 2-50 characters', () => {
      expect(isValidName('Jo')).toBe(true);
      expect(isValidName('A'.repeat(50))).toBe(true);
    });
  });

  describe('invalid names', () => {
    it('should reject empty string', () => {
      expect(isValidName('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidName(null as unknown as string)).toBe(false);
      expect(isValidName(undefined as unknown as string)).toBe(false);
    });

    it('should reject single character', () => {
      expect(isValidName('J')).toBe(false);
    });

    it('should reject names over 50 characters', () => {
      expect(isValidName('A'.repeat(51))).toBe(false);
    });

    it('should reject names with numbers', () => {
      expect(isValidName('John123')).toBe(false);
    });

    it('should reject names with special characters', () => {
      expect(isValidName('John@Doe')).toBe(false);
      expect(isValidName('John!')).toBe(false);
    });
  });
});

// ============================================
// TEAM CODE VALIDATION
// ============================================

describe('isValidTeamCode', () => {
  describe('valid team codes', () => {
    it('should accept 4-character uppercase code', () => {
      expect(isValidTeamCode('ABCD')).toBe(true);
    });

    it('should accept 10-character code', () => {
      expect(isValidTeamCode('ABCD123456')).toBe(true);
    });

    it('should accept alphanumeric codes', () => {
      expect(isValidTeamCode('ABC123')).toBe(true);
      expect(isValidTeamCode('123ABC')).toBe(true);
    });

    it('should accept lowercase (case-insensitive)', () => {
      expect(isValidTeamCode('abcd')).toBe(true);
      expect(isValidTeamCode('AbCd')).toBe(true);
    });

    it('should accept code with whitespace (trimmed)', () => {
      expect(isValidTeamCode('  ABCD  ')).toBe(true);
    });
  });

  describe('invalid team codes', () => {
    it('should reject empty string', () => {
      expect(isValidTeamCode('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidTeamCode(null as unknown as string)).toBe(false);
      expect(isValidTeamCode(undefined as unknown as string)).toBe(false);
    });

    it('should reject codes under 4 characters', () => {
      expect(isValidTeamCode('ABC')).toBe(false);
    });

    it('should reject codes over 10 characters', () => {
      expect(isValidTeamCode('ABCDEFGHIJK')).toBe(false);
    });

    it('should reject codes with special characters', () => {
      expect(isValidTeamCode('ABC-123')).toBe(false);
      expect(isValidTeamCode('ABC_123')).toBe(false);
      expect(isValidTeamCode('ABC 123')).toBe(false);
    });
  });
});

// ============================================
// GPA VALIDATION
// ============================================

describe('isValidGpa', () => {
  describe('valid GPAs', () => {
    it('should accept 0.0', () => {
      expect(isValidGpa(0)).toBe(true);
    });

    it('should accept 4.0', () => {
      expect(isValidGpa(4.0)).toBe(true);
    });

    it('should accept 5.0 (weighted)', () => {
      expect(isValidGpa(5.0)).toBe(true);
    });

    it('should accept decimals', () => {
      expect(isValidGpa(3.75)).toBe(true);
      expect(isValidGpa(2.5)).toBe(true);
    });
  });

  describe('invalid GPAs', () => {
    it('should reject negative values', () => {
      expect(isValidGpa(-1)).toBe(false);
    });

    it('should reject values over 5.0', () => {
      expect(isValidGpa(5.1)).toBe(false);
      expect(isValidGpa(6.0)).toBe(false);
    });

    it('should reject non-numbers', () => {
      expect(isValidGpa('4.0' as unknown as number)).toBe(false);
      expect(isValidGpa(null as unknown as number)).toBe(false);
    });

    it('should reject NaN', () => {
      expect(isValidGpa(NaN)).toBe(false);
    });
  });
});

// ============================================
// GRADUATION YEAR VALIDATION
// ============================================

describe('isValidGraduationYear', () => {
  const currentYear = new Date().getFullYear();

  describe('valid graduation years', () => {
    it('should accept current year', () => {
      expect(isValidGraduationYear(currentYear)).toBe(true);
    });

    it('should accept 2 years in the past', () => {
      expect(isValidGraduationYear(currentYear - 2)).toBe(true);
    });

    it('should accept 12 years in the future', () => {
      expect(isValidGraduationYear(currentYear + 12)).toBe(true);
    });

    it('should accept years in typical range', () => {
      expect(isValidGraduationYear(currentYear + 1)).toBe(true);
      expect(isValidGraduationYear(currentYear + 4)).toBe(true);
    });
  });

  describe('invalid graduation years', () => {
    it('should reject years too far in the past', () => {
      expect(isValidGraduationYear(currentYear - 3)).toBe(false);
      expect(isValidGraduationYear(2000)).toBe(false);
    });

    it('should reject years too far in the future', () => {
      expect(isValidGraduationYear(currentYear + 13)).toBe(false);
    });

    it('should reject non-numbers', () => {
      expect(isValidGraduationYear('2025' as unknown as number)).toBe(false);
      expect(isValidGraduationYear(null as unknown as number)).toBe(false);
    });
  });
});

// ============================================
// CONTENT MODERATION
// ============================================

describe('containsProfanity', () => {
  it('should return false for clean text', () => {
    expect(containsProfanity('Hello world')).toBe(false);
    expect(containsProfanity('This is a test')).toBe(false);
  });

  it('should return false for empty input', () => {
    expect(containsProfanity('')).toBe(false);
    expect(containsProfanity(null as unknown as string)).toBe(false);
  });

  it('should detect profanity in word list', () => {
    expect(containsProfanity('contains badword1 here')).toBe(true);
    expect(containsProfanity('badword2')).toBe(true);
  });
});

describe('sanitizeText', () => {
  it('should trim whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  it('should remove HTML tags', () => {
    // HTML tags are removed, then quotes are removed
    expect(sanitizeText('<script>alert("xss")</script>')).toBe('alert(xss)');
    expect(sanitizeText('<p>Hello</p>')).toBe('Hello');
    expect(sanitizeText('<div class="test">Content</div>')).toBe('Content');
  });

  it('should remove dangerous characters', () => {
    // Only < > " ' are removed (after HTML tag removal)
    expect(sanitizeText('Hello<World>')).toBe('Hello');
    expect(sanitizeText('Say "hello"')).toBe('Say hello');
    expect(sanitizeText("It's fine")).toBe('Its fine');
    expect(sanitizeText('Test<>Value')).toBe('TestValue');
  });

  it('should handle empty input', () => {
    expect(sanitizeText('')).toBe('');
    expect(sanitizeText(null as unknown as string)).toBe('');
  });

  it('should preserve normal text', () => {
    expect(sanitizeText('Hello World')).toBe('Hello World');
    expect(sanitizeText('123 Test')).toBe('123 Test');
  });
});

// ============================================
// FORM VALIDATION HELPERS
// ============================================

describe('validate', () => {
  it('should pass when all rules pass', () => {
    const result = validate('test@example.com', [required, email]);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when any rule fails', () => {
    const result = validate('not-an-email', [required, email]);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Please enter a valid email address');
  });

  it('should collect all errors', () => {
    const result = validate('', [required, email]);
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

describe('validation rules', () => {
  describe('required', () => {
    it('should pass for non-empty values', () => {
      expect(required.validate('test')).toBe(true);
      expect(required.validate(0)).toBe(true);
      expect(required.validate(false)).toBe(true);
    });

    it('should fail for empty/null/undefined', () => {
      expect(required.validate('')).toBe(false);
      expect(required.validate(null)).toBe(false);
      expect(required.validate(undefined)).toBe(false);
    });
  });

  describe('email rule', () => {
    it('should validate emails', () => {
      expect(email.validate('test@example.com')).toBe(true);
      expect(email.validate('invalid')).toBe(false);
    });
  });

  describe('phone rule', () => {
    it('should validate phone numbers', () => {
      expect(phone.validate('1234567890')).toBe(true);
      expect(phone.validate('123')).toBe(false);
    });
  });

  describe('minLength', () => {
    it('should validate minimum length', () => {
      const rule = minLength(5);
      expect(rule.validate('hello')).toBe(true);
      expect(rule.validate('hi')).toBe(false);
    });

    it('should have appropriate message', () => {
      const rule = minLength(5);
      expect(rule.message).toBe('Must be at least 5 characters');
    });
  });

  describe('maxLength', () => {
    it('should validate maximum length', () => {
      const rule = maxLength(5);
      expect(rule.validate('hello')).toBe(true);
      expect(rule.validate('hello world')).toBe(false);
    });

    it('should have appropriate message', () => {
      const rule = maxLength(10);
      expect(rule.message).toBe('Must be no more than 10 characters');
    });
  });

  describe('minValue', () => {
    it('should validate minimum value', () => {
      const rule = minValue(10);
      expect(rule.validate(15)).toBe(true);
      expect(rule.validate(10)).toBe(true);
      expect(rule.validate(5)).toBe(false);
    });

    it('should fail for non-numbers', () => {
      const rule = minValue(10);
      expect(rule.validate('15' as unknown as number)).toBe(false);
    });
  });

  describe('maxValue', () => {
    it('should validate maximum value', () => {
      const rule = maxValue(100);
      expect(rule.validate(50)).toBe(true);
      expect(rule.validate(100)).toBe(true);
      expect(rule.validate(150)).toBe(false);
    });
  });
});
