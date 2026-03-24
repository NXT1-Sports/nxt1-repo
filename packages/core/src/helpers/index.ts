/**
 * @fileoverview Helpers Barrel Export
 * @module @nxt1/core/helpers
 *
 * NOTE: isValidEmail and isValidUrl are also in validation.constants
 * We export them from validators.ts for the helpers module
 */

export {
  // Email & Phone
  isValidEmail,
  isValidPhone,
  formatPhone,
  // URL
  isValidUrl,
  ensureHttps,
  // Social
  isValidSocialHandle,
  cleanSocialHandle,
  // Password
  validatePassword,
  type PasswordValidationResult,
  // Name
  isValidName,
  // Team code
  isValidTeamCode,
  // GPA/Year
  isValidGpa,
  isValidGraduationYear,
  // Content
  containsProfanity,
  sanitizeText,
  // Form validation
  type ValidationRule,
  type ValidationResult,
  validate,
  required,
  email,
  phone,
  minLength,
  maxLength,
  minValue,
  maxValue,
} from './validators';

export {
  // Date formatting
  type DateFormat,
  formatDate,
  getRelativeTime,
  formatDuration,
  // Number formatting
  formatNumber,
  formatCompactNumber,
  formatCurrency,
  formatPercentage,
  // String formatting
  truncate,
  capitalize,
  titleCase,
  slugify,
  buildTeamSlug,
  camelToTitle,
  kebabToTitle,
  // Name formatting
  formatFullName,
  getInitials,
  formatAthleteName,
  // Location formatting
  formatLocation,
  // Athletic measurements
  formatHeight,
  formatWeight,
  normalizeWeightDisplay,
  isFemaleGender,
  formatTime,
  formatDistance,
} from './formatters';
