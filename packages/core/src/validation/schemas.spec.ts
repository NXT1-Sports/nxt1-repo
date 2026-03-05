/**
 * @fileoverview Unit Tests for Validation Schemas
 * @module @nxt1/core/validation
 *
 * Comprehensive tests for schema validation functions.
 * Coverage target: 100%
 *
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  createValidator,
  validateRegistration,
  validateOnboarding,
  validateProfileUpdate,
  validateTeamCode,
  hasFieldError,
  getFieldError,
  getErrorMap,
  combineValidations,
  type ValidationResult,
  type RegistrationData,
  type OnboardingData,
} from './schemas';

// ============================================
// CREATE VALIDATOR
// ============================================

describe('createValidator', () => {
  it('should create a validator from schema', () => {
    const validator = createValidator<{ name: string }>({
      name: {
        required: true,
        validate: (n) => n.length >= 2,
        message: 'Name must be at least 2 characters',
        code: 'INVALID_NAME',
      },
    });

    const result = validator({ name: 'Jo' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'Jo' });
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for missing required field', () => {
    const validator = createValidator<{ name: string }>({
      name: {
        required: true,
        message: 'Name is required',
        code: 'REQUIRED',
      },
    });

    const result = validator({ name: '' });
    expect(result.success).toBe(false);
    expect(result.errors[0].field).toBe('name');
    expect(result.errors[0].code).toBe('REQUIRED');
  });

  it('should fail for invalid field value', () => {
    const validator = createValidator<{ age: number }>({
      age: {
        validate: (a) => a >= 18,
        message: 'Must be 18 or older',
        code: 'INVALID_AGE',
      },
    });

    const result = validator({ age: 16 });
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_AGE');
  });

  it('should skip validation for undefined optional fields', () => {
    const validator = createValidator<{ nickname?: string }>({
      nickname: {
        validate: (n) => n!.length >= 2,
        message: 'Nickname too short',
      },
    });

    const result = validator({ nickname: undefined });
    expect(result.success).toBe(true);
  });

  it('should not return data if validation fails', () => {
    const validator = createValidator<{ name: string }>({
      name: { required: true },
    });

    const result = validator({ name: '' });
    expect(result.data).toBeUndefined();
  });

  it('should use default message and code', () => {
    const validator = createValidator<{ name: string }>({
      name: { required: true },
    });

    const result = validator({ name: '' });
    expect(result.errors[0].message).toBe('name is required');
    expect(result.errors[0].code).toBe('REQUIRED');
  });
});

// ============================================
// REGISTRATION VALIDATION
// ============================================

describe('validateRegistration', () => {
  const validData: RegistrationData = {
    email: 'test@example.com',
    password: 'Password123!',
    firstName: 'John',
    lastName: 'Doe',
  };

  describe('valid registration', () => {
    it('should pass with valid data', () => {
      const result = validateRegistration(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('email validation', () => {
    it('should fail for missing email', () => {
      const result = validateRegistration({ ...validData, email: '' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'email')).toBe(true);
    });

    it('should fail for invalid email', () => {
      const result = validateRegistration({ ...validData, email: 'invalid' });
      expect(result.success).toBe(false);
      expect(getFieldError(result, 'email')).toBe('Please enter a valid email address');
    });
  });

  describe('password validation', () => {
    it('should fail for missing password', () => {
      const result = validateRegistration({ ...validData, password: '' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'password')).toBe(true);
    });

    it('should fail for short password', () => {
      const result = validateRegistration({ ...validData, password: 'short' });
      expect(result.success).toBe(false);
      expect(getFieldError(result, 'password')).toBe('Password must be at least 8 characters');
    });
  });

  describe('name validation', () => {
    it('should fail for missing first name', () => {
      const result = validateRegistration({ ...validData, firstName: '' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'firstName')).toBe(true);
    });

    it('should fail for missing last name', () => {
      const result = validateRegistration({ ...validData, lastName: '' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'lastName')).toBe(true);
    });

    it('should fail for invalid name with numbers', () => {
      const result = validateRegistration({ ...validData, firstName: 'John123' });
      expect(result.success).toBe(false);
    });
  });

  describe('multiple errors', () => {
    it('should collect all validation errors', () => {
      const result = validateRegistration({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
      });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});

// ============================================
// ONBOARDING VALIDATION
// ============================================

describe('validateOnboarding', () => {
  const validData: OnboardingData = {
    firstName: 'John',
    lastName: 'Doe',
    userType: 'athlete',
    sport: 'Football',
    classOf: 2027,
  };

  describe('valid onboarding', () => {
    it('should pass with valid athlete data', () => {
      const result = validateOnboarding(validData);
      expect(result.success).toBe(true);
    });

    it('should pass without optional fields', () => {
      const result = validateOnboarding({
        firstName: 'John',
        lastName: 'Doe',
        userType: 'parent',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('name validation', () => {
    it('should fail for missing first name', () => {
      const result = validateOnboarding({ ...validData, firstName: '' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'firstName')).toBe(true);
    });

    it('should fail for missing last name', () => {
      const result = validateOnboarding({ ...validData, lastName: '' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'lastName')).toBe(true);
    });
  });

  describe('user type validation', () => {
    it('should fail for missing user type', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = validateOnboarding({ ...validData, userType: '' as any });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'userType')).toBe(true);
    });

    it('should fail for invalid user type', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = validateOnboarding({ ...validData, userType: 'invalid' as any });
      expect(result.success).toBe(false);
    });

    it('should accept all valid user types', () => {
      const types = ['athlete', 'coach', 'director', 'recruiter', 'parent'] as const;
      types.forEach((userType) => {
        const result = validateOnboarding({ ...validData, userType });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('graduation year validation', () => {
    it('should pass for valid graduation year', () => {
      const currentYear = new Date().getFullYear();
      const result = validateOnboarding({ ...validData, classOf: currentYear + 1 });
      expect(result.success).toBe(true);
    });

    it('should pass when classOf is undefined', () => {
      const result = validateOnboarding({ ...validData, classOf: undefined });
      expect(result.success).toBe(true);
    });

    it('should fail for year too far in past', () => {
      const result = validateOnboarding({ ...validData, classOf: 2000 });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// PROFILE UPDATE VALIDATION
// ============================================

describe('validateProfileUpdate', () => {
  describe('valid updates', () => {
    it('should pass with valid partial data', () => {
      const result = validateProfileUpdate({ firstName: 'John' });
      expect(result.success).toBe(true);
    });

    it('should pass with all valid fields', () => {
      const result = validateProfileUpdate({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
        gpa: 3.75,
      });
      expect(result.success).toBe(true);
    });

    it('should pass with empty object', () => {
      const result = validateProfileUpdate({});
      expect(result.success).toBe(true);
    });
  });

  describe('field validation', () => {
    it('should fail for invalid email', () => {
      const result = validateProfileUpdate({ email: 'invalid' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'email')).toBe(true);
    });

    it('should fail for invalid phone', () => {
      const result = validateProfileUpdate({ phone: '123' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'phone')).toBe(true);
    });

    it('should allow empty phone', () => {
      const result = validateProfileUpdate({ phone: '' });
      expect(result.success).toBe(true);
    });

    it('should fail for invalid GPA', () => {
      const result = validateProfileUpdate({ gpa: 6.0 });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'gpa')).toBe(true);
    });

    it('should fail for invalid name', () => {
      const result = validateProfileUpdate({ firstName: '123' });
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// TEAM CODE VALIDATION
// ============================================

describe('validateTeamCode', () => {
  describe('valid team codes', () => {
    it('should pass with valid code', () => {
      const result = validateTeamCode({ code: 'TEAM1234' });
      expect(result.success).toBe(true);
    });

    it('should pass with team name', () => {
      const result = validateTeamCode({
        code: 'TEAM123',
        teamName: 'My Team',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('code validation', () => {
    it('should fail for missing code', () => {
      const result = validateTeamCode({ code: '' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'code')).toBe(true);
    });

    it('should fail for short code', () => {
      const result = validateTeamCode({ code: 'ABC' });
      expect(result.success).toBe(false);
    });

    it('should fail for code with special characters', () => {
      const result = validateTeamCode({ code: 'TEAM-123' });
      expect(result.success).toBe(false);
    });
  });

  describe('team name validation', () => {
    it('should fail for team name too short', () => {
      const result = validateTeamCode({ code: 'TEAM123', teamName: 'A' });
      expect(result.success).toBe(false);
      expect(hasFieldError(result, 'teamName')).toBe(true);
    });
  });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

describe('hasFieldError', () => {
  const resultWithErrors: ValidationResult = {
    success: false,
    errors: [
      { field: 'email', message: 'Invalid email', code: 'INVALID' },
      { field: 'password', message: 'Too short', code: 'INVALID' },
    ],
  };

  it('should return true for existing field error', () => {
    expect(hasFieldError(resultWithErrors, 'email')).toBe(true);
    expect(hasFieldError(resultWithErrors, 'password')).toBe(true);
  });

  it('should return false for non-existing field error', () => {
    expect(hasFieldError(resultWithErrors, 'firstName')).toBe(false);
  });

  it('should return false for success result', () => {
    const successResult: ValidationResult = { success: true, errors: [] };
    expect(hasFieldError(successResult, 'email')).toBe(false);
  });
});

describe('getFieldError', () => {
  const resultWithErrors: ValidationResult = {
    success: false,
    errors: [{ field: 'email', message: 'Invalid email', code: 'INVALID' }],
  };

  it('should return error message for existing field', () => {
    expect(getFieldError(resultWithErrors, 'email')).toBe('Invalid email');
  });

  it('should return undefined for non-existing field', () => {
    expect(getFieldError(resultWithErrors, 'password')).toBeUndefined();
  });
});

describe('getErrorMap', () => {
  const resultWithErrors: ValidationResult = {
    success: false,
    errors: [
      { field: 'email', message: 'Invalid email', code: 'INVALID' },
      { field: 'password', message: 'Too short', code: 'INVALID' },
    ],
  };

  it('should return map of field to message', () => {
    const map = getErrorMap(resultWithErrors);
    expect(map).toEqual({
      email: 'Invalid email',
      password: 'Too short',
    });
  });

  it('should return empty map for success result', () => {
    const successResult: ValidationResult = { success: true, errors: [] };
    const map = getErrorMap(successResult);
    expect(map).toEqual({});
  });

  it('should use last error for duplicate fields', () => {
    const result: ValidationResult = {
      success: false,
      errors: [
        { field: 'email', message: 'First error', code: 'INVALID' },
        { field: 'email', message: 'Second error', code: 'INVALID' },
      ],
    };
    const map = getErrorMap(result);
    expect(map['email']).toBe('Second error');
  });
});

describe('combineValidations', () => {
  it('should combine errors from multiple results', () => {
    const result1: ValidationResult = {
      success: false,
      errors: [{ field: 'email', message: 'Invalid', code: 'INVALID' }],
    };
    const result2: ValidationResult = {
      success: false,
      errors: [{ field: 'password', message: 'Too short', code: 'INVALID' }],
    };

    const combined = combineValidations(result1, result2);
    expect(combined.success).toBe(false);
    expect(combined.errors).toHaveLength(2);
  });

  it('should succeed if all results succeed', () => {
    const result1: ValidationResult = { success: true, errors: [] };
    const result2: ValidationResult = { success: true, errors: [] };

    const combined = combineValidations(result1, result2);
    expect(combined.success).toBe(true);
    expect(combined.errors).toHaveLength(0);
  });

  it('should fail if any result fails', () => {
    const result1: ValidationResult = { success: true, errors: [] };
    const result2: ValidationResult = {
      success: false,
      errors: [{ field: 'email', message: 'Invalid', code: 'INVALID' }],
    };

    const combined = combineValidations(result1, result2);
    expect(combined.success).toBe(false);
  });

  it('should handle empty arguments', () => {
    const combined = combineValidations();
    expect(combined.success).toBe(true);
    expect(combined.errors).toHaveLength(0);
  });
});
