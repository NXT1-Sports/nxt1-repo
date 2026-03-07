/**
 * @fileoverview Edit Profile Constants
 * @module @nxt1/core/edit-profile
 * @version 1.0.0
 *
 * Constants and configuration for Edit Profile feature.
 * 100% portable - works on web, mobile, and backend.
 */

import type {
  EditProfileSection,
  EditProfileSectionId,
  ProfileCompletionTier,
} from './edit-profile.types';

// ============================================
// COMPLETION TIERS
// ============================================

/**
 * Profile completion tier thresholds and rewards.
 */
export const PROFILE_COMPLETION_TIERS: Record<
  ProfileCompletionTier,
  {
    readonly minPercent: number;
    readonly maxPercent: number;
    readonly label: string;
    readonly icon: string;
    readonly color: string;
    readonly description: string;
  }
> = {
  rookie: {
    minPercent: 0,
    maxPercent: 24,
    label: 'Rookie',
    icon: 'star-outline',
    color: '#6b7280', // gray
    description: 'Just getting started',
  },
  starter: {
    minPercent: 25,
    maxPercent: 49,
    label: 'Starter',
    icon: 'star-half-outline',
    color: '#3b82f6', // blue
    description: 'Building momentum',
  },
  'all-star': {
    minPercent: 50,
    maxPercent: 74,
    label: 'All-Star',
    icon: 'star',
    color: '#8b5cf6', // purple
    description: 'Standing out from the crowd',
  },
  mvp: {
    minPercent: 75,
    maxPercent: 94,
    label: 'MVP',
    icon: 'trophy',
    color: '#f59e0b', // amber
    description: 'Top-tier profile',
  },
  legend: {
    minPercent: 95,
    maxPercent: 100,
    label: 'Legend',
    icon: 'diamond',
    color: '#ccff00', // nxt1 primary
    description: 'Elite profile status',
  },
} as const;

/**
 * Get tier from completion percentage.
 */
export function getCompletionTier(percentage: number): ProfileCompletionTier {
  if (percentage >= 95) return 'legend';
  if (percentage >= 75) return 'mvp';
  if (percentage >= 50) return 'all-star';
  if (percentage >= 25) return 'starter';
  return 'rookie';
}

/**
 * Get next tier from current tier.
 */
export function getNextTier(currentTier: ProfileCompletionTier): ProfileCompletionTier | null {
  const tierOrder: ProfileCompletionTier[] = ['rookie', 'starter', 'all-star', 'mvp', 'legend'];
  const currentIndex = tierOrder.indexOf(currentTier);
  return currentIndex < tierOrder.length - 1 ? tierOrder[currentIndex + 1] : null;
}

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
    completionPercent: 0,
    xpReward: 100,
    fields: [
      {
        id: 'firstName',
        type: 'text',
        label: 'First Name',
        placeholder: 'Enter your first name',
        required: true,
        xpReward: 10,
        countsTowardCompletion: true,
        order: 1,
      },
      {
        id: 'lastName',
        type: 'text',
        label: 'Last Name',
        placeholder: 'Enter your last name',
        required: true,
        xpReward: 10,
        countsTowardCompletion: true,
        order: 2,
      },
      {
        id: 'displayName',
        type: 'text',
        label: 'Display Name',
        placeholder: 'How you want to appear',
        hint: 'Leave blank to use your full name',
        xpReward: 5,
        countsTowardCompletion: false,
        order: 3,
      },
      {
        id: 'bio',
        type: 'textarea',
        label: 'Bio',
        placeholder: 'Tell coaches about yourself...',
        hint: 'Share your story, goals, and what makes you unique',
        validation: { maxLength: 500 },
        xpReward: 25,
        countsTowardCompletion: true,
        order: 4,
      },
      {
        id: 'location',
        type: 'location',
        label: 'Location',
        placeholder: 'City, State',
        hint: 'Helps coaches find local talent',
        xpReward: 15,
        countsTowardCompletion: true,
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
        xpReward: 15,
        countsTowardCompletion: true,
        order: 6,
      },
    ],
  },
  {
    id: 'photos',
    title: 'Photos',
    icon: 'camera-outline',
    description: 'Profile picture and banner',
    completionPercent: 0,
    xpReward: 75,
    fields: [
      {
        id: 'profileImgs',
        type: 'photo-upload',
        label: 'Profile Photos',
        hint: 'Upload multiple photos for your profile carousel (max 5)',
        xpReward: 50,
        countsTowardCompletion: true,
        order: 1,
      },
      {
        id: 'bannerImg',
        type: 'photo-upload',
        label: 'Banner Image',
        hint: 'Action shot or team photo works great',
        xpReward: 25,
        countsTowardCompletion: true,
        order: 2,
      },
    ],
  },
  {
    id: 'sports-info',
    title: 'Sports Info',
    icon: 'football-outline',
    description: 'Your sport, position, and jersey',
    completionPercent: 0,
    xpReward: 100,
    fields: [
      {
        id: 'primarySport',
        type: 'select',
        label: 'Primary Sport',
        placeholder: 'Select your main sport',
        required: true,
        xpReward: 20,
        countsTowardCompletion: true,
        order: 1,
      },
      {
        id: 'primaryPosition',
        type: 'select',
        label: 'Primary Position',
        placeholder: 'Select your position',
        required: true,
        xpReward: 20,
        countsTowardCompletion: true,
        order: 2,
      },
      {
        id: 'secondaryPositions',
        type: 'multi-select',
        label: 'Secondary Positions',
        placeholder: 'Select additional positions',
        hint: 'Coaches love versatile players',
        xpReward: 15,
        countsTowardCompletion: false,
        order: 3,
      },
      {
        id: 'jerseyNumber',
        type: 'number',
        label: 'Jersey Number',
        placeholder: '#',
        validation: { min: 0, max: 99 },
        xpReward: 10,
        countsTowardCompletion: true,
        order: 4,
      },
      {
        id: 'yearsExperience',
        type: 'number',
        label: 'Years of Experience',
        placeholder: 'e.g., 5',
        xpReward: 10,
        countsTowardCompletion: false,
        order: 5,
      },
    ],
  },
  {
    id: 'academics',
    title: 'Academics',
    icon: 'school-outline',
    description: 'GPA, test scores, and school',
    completionPercent: 0,
    xpReward: 100,
    fields: [
      {
        id: 'school',
        type: 'text',
        label: 'Current School',
        placeholder: 'School name',
        required: true,
        xpReward: 15,
        countsTowardCompletion: true,
        order: 1,
      },
      {
        id: 'gpa',
        type: 'text',
        label: 'GPA',
        placeholder: 'e.g., 3.8',
        hint: 'Weighted or unweighted',
        xpReward: 20,
        countsTowardCompletion: true,
        order: 2,
      },
      {
        id: 'sat',
        type: 'number',
        label: 'SAT Score',
        placeholder: 'e.g., 1200',
        validation: { min: 400, max: 1600 },
        xpReward: 15,
        countsTowardCompletion: false,
        order: 3,
      },
      {
        id: 'act',
        type: 'number',
        label: 'ACT Score',
        placeholder: 'e.g., 28',
        validation: { min: 1, max: 36 },
        xpReward: 15,
        countsTowardCompletion: false,
        order: 4,
      },
      {
        id: 'intendedMajor',
        type: 'text',
        label: 'Intended Major',
        placeholder: 'What do you want to study?',
        xpReward: 10,
        countsTowardCompletion: false,
        order: 5,
      },
    ],
  },
  {
    id: 'physical',
    title: 'Physical Stats',
    icon: 'fitness-outline',
    description: 'Height, weight, and measurables',
    completionPercent: 0,
    xpReward: 100,
    fields: [
      {
        id: 'height',
        type: 'height',
        label: 'Height',
        placeholder: 'e.g., 6\'2"',
        required: true,
        xpReward: 20,
        countsTowardCompletion: true,
        order: 1,
      },
      {
        id: 'weight',
        type: 'weight',
        label: 'Weight',
        placeholder: 'e.g., 185 lbs',
        required: true,
        xpReward: 20,
        countsTowardCompletion: true,
        order: 2,
      },
      {
        id: 'wingspan',
        type: 'text',
        label: 'Wingspan',
        placeholder: 'e.g., 6\'5"',
        xpReward: 15,
        countsTowardCompletion: false,
        order: 3,
      },
      {
        id: 'fortyYardDash',
        type: 'text',
        label: '40-Yard Dash',
        placeholder: 'e.g., 4.5s',
        xpReward: 15,
        countsTowardCompletion: false,
        order: 4,
      },
      {
        id: 'verticalJump',
        type: 'text',
        label: 'Vertical Jump',
        placeholder: 'e.g., 32"',
        xpReward: 15,
        countsTowardCompletion: false,
        order: 5,
      },
    ],
  },
  {
    id: 'social-links',
    title: 'Social Links',
    icon: 'share-social-outline',
    description: 'Connect your social profiles',
    completionPercent: 0,
    xpReward: 75,
    fields: [
      {
        id: 'twitter',
        type: 'url',
        label: 'Twitter / X',
        placeholder: '@username',
        icon: 'logo-twitter',
        xpReward: 10,
        countsTowardCompletion: false,
        order: 1,
      },
      {
        id: 'instagram',
        type: 'url',
        label: 'Instagram',
        placeholder: '@username',
        icon: 'logo-instagram',
        xpReward: 10,
        countsTowardCompletion: false,
        order: 2,
      },
      {
        id: 'tiktok',
        type: 'url',
        label: 'TikTok',
        placeholder: '@username',
        icon: 'logo-tiktok',
        xpReward: 10,
        countsTowardCompletion: false,
        order: 3,
      },
      {
        id: 'youtube',
        type: 'url',
        label: 'YouTube',
        placeholder: 'Channel URL',
        icon: 'logo-youtube',
        xpReward: 10,
        countsTowardCompletion: false,
        order: 4,
      },
      {
        id: 'hudl',
        type: 'url',
        label: 'Hudl',
        placeholder: 'Profile URL',
        hint: 'Essential for recruiting',
        xpReward: 25,
        countsTowardCompletion: true,
        order: 5,
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact Info',
    icon: 'mail-outline',
    description: 'How coaches can reach you',
    completionPercent: 0,
    xpReward: 75,
    fields: [
      {
        id: 'email',
        type: 'email',
        label: 'Email',
        placeholder: 'your@email.com',
        required: true,
        xpReward: 15,
        countsTowardCompletion: true,
        order: 1,
      },
      {
        id: 'phone',
        type: 'phone',
        label: 'Phone Number',
        placeholder: '(555) 123-4567',
        xpReward: 15,
        countsTowardCompletion: true,
        order: 2,
      },
      {
        id: 'parentEmail',
        type: 'email',
        label: 'Parent/Guardian Email',
        placeholder: 'parent@email.com',
        hint: 'Required for NCAA compliance',
        xpReward: 15,
        countsTowardCompletion: true,
        order: 3,
      },
      {
        id: 'parentPhone',
        type: 'phone',
        label: 'Parent/Guardian Phone',
        placeholder: '(555) 123-4567',
        xpReward: 10,
        countsTowardCompletion: false,
        order: 4,
      },
      {
        id: 'coachEmail',
        type: 'email',
        label: 'Coach Email',
        placeholder: 'coach@school.edu',
        hint: 'College coaches often contact your high school coach',
        xpReward: 15,
        countsTowardCompletion: true,
        order: 5,
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
// XP REWARDS
// ============================================

/**
 * XP rewards for profile actions.
 */
export const EDIT_PROFILE_XP_REWARDS = {
  /** Complete a single field */
  FIELD_COMPLETE: 5,
  /** Complete a section */
  SECTION_COMPLETE: 50,
  /** Reach 25% completion */
  REACH_STARTER: 100,
  /** Reach 50% completion */
  REACH_ALL_STAR: 200,
  /** Reach 75% completion */
  REACH_MVP: 300,
  /** Reach 100% completion */
  REACH_LEGEND: 500,
  /** First profile photo upload */
  FIRST_PHOTO: 25,
  /** Add highlight video link */
  ADD_VIDEO: 50,
} as const;

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
