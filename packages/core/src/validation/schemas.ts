/**
 * @fileoverview Validation Schemas - Pure TypeScript
 * @module @nxt1/core/validation
 *
 * Schema-based validation for all data types.
 * 100% portable - works on Web, Mobile, Server.
 *
 * @version 2.0.0
 */

import type { UserRole, PlanTier, TeamType } from '../constants/user.constants';
import {
  isValidEmail,
  isValidPhone,
  isValidName,
  isValidGpa,
  isValidGraduationYear,
  isValidTeamCode,
} from '../helpers/validators';

// ============================================
// VALIDATION TYPES
// ============================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors: ValidationError[];
}

export type Validator<T> = (value: T) => ValidationResult<T>;

// ============================================
// SCHEMA BUILDER
// ============================================

interface SchemaField<T> {
  required?: boolean;
  validate?: (value: T) => boolean;
  message?: string;
  code?: string;
}

type Schema<T> = {
  [K in keyof T]?: SchemaField<T[K]>;
};

export function createValidator<T extends object>(schema: Schema<T>): Validator<T> {
  return (value: T): ValidationResult<T> => {
    const errors: ValidationError[] = [];

    for (const [field, rules] of Object.entries(schema) as [keyof T, SchemaField<T[keyof T]>][]) {
      const fieldValue = value[field];

      if (rules?.required && (fieldValue === undefined || fieldValue === null || fieldValue === '')) {
        errors.push({
          field: field as string,
          message: rules.message || `${String(field)} is required`,
          code: rules.code || 'REQUIRED',
        });
        continue;
      }

      if (fieldValue !== undefined && fieldValue !== null && rules?.validate) {
        if (!rules.validate(fieldValue)) {
          errors.push({
            field: field as string,
            message: rules.message || `${String(field)} is invalid`,
            code: rules.code || 'INVALID',
          });
        }
      }
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? value : undefined,
      errors,
    };
  };
}

// ============================================
// PRE-BUILT VALIDATORS
// ============================================

/**
 * Validate user registration data
 */
export interface RegistrationData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export const validateRegistration = createValidator<RegistrationData>({
  email: {
    required: true,
    validate: isValidEmail,
    message: 'Please enter a valid email address',
    code: 'INVALID_EMAIL',
  },
  password: {
    required: true,
    validate: (p) => typeof p === 'string' && p.length >= 8,
    message: 'Password must be at least 8 characters',
    code: 'WEAK_PASSWORD',
  },
  firstName: {
    required: true,
    validate: isValidName,
    message: 'Please enter a valid first name',
    code: 'INVALID_NAME',
  },
  lastName: {
    required: true,
    validate: isValidName,
    message: 'Please enter a valid last name',
    code: 'INVALID_NAME',
  },
});

/**
 * Validate onboarding data
 */
export interface OnboardingData {
  firstName: string;
  lastName: string;
  userType: UserRole;
  sport?: string;
  positions?: string[];
  classOf?: number;
  city?: string;
  state?: string;
}

export const validateOnboarding = createValidator<OnboardingData>({
  firstName: {
    required: true,
    validate: isValidName,
    message: 'Please enter a valid first name',
    code: 'INVALID_NAME',
  },
  lastName: {
    required: true,
    validate: isValidName,
    message: 'Please enter a valid last name',
    code: 'INVALID_NAME',
  },
  userType: {
    required: true,
    validate: (t) => ['athlete', 'coach', 'college-coach', 'parent', 'fan'].includes(t),
    message: 'Please select a valid user type',
    code: 'INVALID_USER_TYPE',
  },
  classOf: {
    validate: (y) => y === undefined || isValidGraduationYear(y),
    message: 'Please enter a valid graduation year',
    code: 'INVALID_GRAD_YEAR',
  },
});

/**
 * Validate profile update data
 */
export interface ProfileUpdateData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  gpa?: number;
}

export const validateProfileUpdate = createValidator<ProfileUpdateData>({
  firstName: {
    validate: (n) => n === undefined || isValidName(n),
    message: 'Please enter a valid first name',
    code: 'INVALID_NAME',
  },
  lastName: {
    validate: (n) => n === undefined || isValidName(n),
    message: 'Please enter a valid last name',
    code: 'INVALID_NAME',
  },
  email: {
    validate: (e) => e === undefined || isValidEmail(e),
    message: 'Please enter a valid email',
    code: 'INVALID_EMAIL',
  },
  phone: {
    validate: (p) => p === undefined || p === '' || isValidPhone(p),
    message: 'Please enter a valid phone number',
    code: 'INVALID_PHONE',
  },
  gpa: {
    validate: (g) => g === undefined || isValidGpa(g),
    message: 'GPA must be between 0 and 5.0',
    code: 'INVALID_GPA',
  },
});

/**
 * Validate team code data
 */
export interface TeamCodeData {
  code: string;
  teamName?: string;
  teamType?: TeamType;
  sport?: string;
}

export const validateTeamCode = createValidator<TeamCodeData>({
  code: {
    required: true,
    validate: isValidTeamCode,
    message: 'Team code must be 4-10 alphanumeric characters',
    code: 'INVALID_TEAM_CODE',
  },
  teamName: {
    validate: (n) => n === undefined || (typeof n === 'string' && n.length >= 2),
    message: 'Team name must be at least 2 characters',
    code: 'INVALID_TEAM_NAME',
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if validation result has errors for a specific field
 */
export function hasFieldError(result: ValidationResult, field: string): boolean {
  return result.errors.some((e) => e.field === field);
}

/**
 * Get error message for a specific field
 */
export function getFieldError(result: ValidationResult, field: string): string | undefined {
  return result.errors.find((e) => e.field === field)?.message;
}

/**
 * Get all error messages as a map
 */
export function getErrorMap(result: ValidationResult): Record<string, string> {
  return result.errors.reduce(
    (acc, error) => {
      acc[error.field] = error.message;
      return acc;
    },
    {} as Record<string, string>
  );
}

/**
 * Combine multiple validation results
 */
export function combineValidations(...results: ValidationResult[]): ValidationResult {
  const allErrors = results.flatMap((r) => r.errors);
  return {
    success: allErrors.length === 0,
    errors: allErrors,
  };
}
