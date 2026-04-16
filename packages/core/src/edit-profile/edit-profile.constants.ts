/**
 * @fileoverview Edit Profile Constants
 * @module @nxt1/core/edit-profile
 * @version 1.0.0
 *
 * Constants and configuration for Edit Profile feature.
 * 100% portable - works on web, mobile, and backend.
 */

import type { EditProfileSection, EditProfileSectionId } from './edit-profile.types';

// ============================================
// SECTION CONFIGURATIONS
// ============================================

/**
 * Default edit profile sections configuration.
 */
export const EDIT_PROFILE_SECTIONS: readonly EditProfileSection[] = [
  {
    id: 'basic-info',
    title: 'Basic Info',
    icon: 'person-outline',
    description: 'Your name, bio, and location',
    fields: [
      {
        id: 'firstName',
        type: 'text',
        label: 'First Name',
        placeholder: 'Enter your first name',
        required: true,
        order: 1,
      },
      {
        id: 'lastName',
        type: 'text',
        label: 'Last Name',
        placeholder: 'Enter your last name',
        required: true,
        order: 2,
      },
      {
        id: 'displayName',
        type: 'text',
        label: 'Display Name',
        placeholder: 'How you want to appear',
        hint: 'Leave blank to use your full name',
        order: 3,
      },
      {
        id: 'bio',
        type: 'textarea',
        label: 'Bio',
        placeholder: 'Tell Agent X about yourself...',
        hint: 'Share your story, goals, and what makes you unique',
        validation: { maxLength: 500 },
        order: 4,
      },
      {
        id: 'location',
        type: 'location',
        label: 'Location',
        placeholder: 'City, State',
        hint: 'Helps coaches find local talent',
        order: 5,
        icon: 'location-outline',
      },
      {
        id: 'classYear',
        type: 'select',
        label: 'Class Year',
        placeholder: 'Select graduation year',
        required: true,
        options: [
          { value: '2025', label: 'Class of 2025' },
          { value: '2026', label: 'Class of 2026' },
          { value: '2027', label: 'Class of 2027' },
          { value: '2028', label: 'Class of 2028' },
          { value: '2029', label: 'Class of 2029' },
        ],
        order: 6,
      },
    ],
  },
  {
    id: 'photos',
    title: 'Photos',
    icon: 'camera-outline',
    description: 'Profile picture',
    fields: [
      {
        id: 'profileImgs',
        type: 'photo-upload',
        label: 'Profile Photos',
        hint: 'Upload multiple photos for your profile carousel (max 5)',
        order: 1,
      },
    ],
  },
  {
    id: 'sports-info',
    title: 'Sports Info',
    icon: 'football-outline',
    description: 'Your sport, positions, and program',
    fields: [
      {
        id: 'sport',
        type: 'select',
        label: 'Sport',
        placeholder: 'Your sport',
        required: true,
        order: 1,
      },
      {
        id: 'positions',
        type: 'multi-select',
        label: 'Positions',
        placeholder: 'Select your positions',
        hint: 'Options update based on your sport',
        // Options are sport-dependent — populated dynamically by the UI
        // using getPositionsForSport(sport) from @nxt1/core
        options: [],
        order: 2,
      },
    ],
  },
  {
    id: 'academics',
    title: 'Academics',
    icon: 'school-outline',
    description: 'GPA, test scores',
    fields: [
      {
        id: 'gpa',
        type: 'text',
        label: 'GPA',
        placeholder: 'e.g., 3.8',
        hint: 'Weighted or unweighted',
        order: 2,
      },
      {
        id: 'sat',
        type: 'number',
        label: 'SAT Score',
        placeholder: 'e.g., 1200',
        validation: { min: 400, max: 1600 },
        order: 3,
      },
      {
        id: 'act',
        type: 'number',
        label: 'ACT Score',
        placeholder: 'e.g., 28',
        validation: { min: 1, max: 36 },
        order: 4,
      },
      {
        id: 'intendedMajor',
        type: 'text',
        label: 'Intended Major',
        placeholder: 'What do you want to study?',
        order: 5,
      },
    ],
  },
  {
    id: 'physical',
    title: 'Physical Stats',
    icon: 'fitness-outline',
    description: 'Height, weight, and measurables',
    fields: [
      {
        id: 'height',
        type: 'height',
        label: 'Height',
        placeholder: 'e.g., 6\'2"',
        required: true,
        order: 1,
      },
      {
        id: 'weight',
        type: 'weight',
        label: 'Weight',
        placeholder: 'e.g., 185 lbs',
        required: true,
        order: 2,
      },
      {
        id: 'wingspan',
        type: 'text',
        label: 'Wingspan',
        placeholder: 'e.g., 6\'5"',
        order: 3,
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact Info',
    icon: 'mail-outline',
    description: 'How coaches can reach you',
    fields: [
      {
        id: 'email',
        type: 'email',
        label: 'Email',
        placeholder: 'your@email.com',
        required: true,
        order: 1,
      },
      {
        id: 'phone',
        type: 'phone',
        label: 'Phone Number',
        placeholder: '(555) 123-4567',
        order: 2,
      },
    ],
  },
] as const;

/**
 * Get section by ID.
 */
export function getEditProfileSection(id: EditProfileSectionId): EditProfileSection | undefined {
  return EDIT_PROFILE_SECTIONS.find((section) => section.id === id);
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validation patterns for fields.
 */
export const EDIT_PROFILE_VALIDATION = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,
  URL: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
  TWITTER_USERNAME: /^@?(\w){1,15}$/,
  INSTAGRAM_USERNAME: /^@?[\w.](?!.*?\.\.)[\w.]{0,28}[\w]$/,
  GPA: /^[0-4](\.\d{1,2})?$/,
  HEIGHT_IMPERIAL: /^\d{1}'(\d{1,2}")?$/,
  WEIGHT: /^\d{2,3}(\s?lbs)?$/,
} as const;
