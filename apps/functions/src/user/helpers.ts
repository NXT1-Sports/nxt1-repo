/**
 * @fileoverview Profile Completeness Helper
 * @module @nxt1/functions/user/helpers
 *
 * Shared helper functions for user-related triggers.
 */

/**
 * Calculate profile completeness percentage
 */
export function calculateProfileCompleteness(userData: FirebaseFirestore.DocumentData): number {
  const fields = [
    'displayName',
    'photoURL',
    'bio',
    'primarySport',
    'positions',
    'location',
    'highSchool',
    'graduationYear',
    'height',
    'weight',
    'gpa',
  ];

  const filledFields = fields.filter((field) => {
    const value = userData[field];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== '';
  });

  return Math.round((filledFields.length / fields.length) * 100);
}
