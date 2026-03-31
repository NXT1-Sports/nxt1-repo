/**
 * @fileoverview Validation Barrel Export
 * @module @nxt1/core/validation
 *
 * NOTE: ValidationResult type is defined here but also in helpers/validators.ts
 * We export from schemas.ts which has the preferred definition
 */

export {
  // Types
  type ValidationError,
  type ValidationResult,
  type Validator,
  // Schema builder
  createValidator,
  // Pre-built validators
  type RegistrationData,
  validateRegistration,
  type OnboardingData,
  validateOnboarding,
  type ProfileUpdateData,
  validateProfileUpdate,
  type TeamCodeData,
  validateTeamCode,
  // Helper functions
  hasFieldError,
  getFieldError,
  getErrorMap,
  combineValidations,
} from './schemas';

// Posts validation
export {
  validateComment,
  sanitizeContent,
  extractHashtags,
  extractMentions,
} from './posts.validation';
