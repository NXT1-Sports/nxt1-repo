/**
 * @fileoverview Edit Profile Type Definitions
 * @module @nxt1/core/edit-profile
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Edit Profile feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * @description Comprehensive profile editing system with gamified
 * completion tracking, XP rewards, and section-based organization.
 */

// ============================================
// EDIT PROFILE SECTION TYPES
// ============================================

/**
 * Section identifiers for edit profile navigation.
 * Each section represents a collapsible editing area.
 */
export type EditProfileSectionId =
  | 'basic-info'
  | 'photos'
  | 'sports-info'
  | 'academics'
  | 'physical'
  | 'social-links'
  | 'contact'
  | 'preferences';

/**
 * Configuration for an edit profile section.
 */
export interface EditProfileSection {
  /** Unique section identifier */
  readonly id: EditProfileSectionId;
  /** Display title */
  readonly title: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Section description */
  readonly description: string;
  /** Completion percentage (0-100) */
  readonly completionPercent: number;
  /** XP reward for completing section */
  readonly xpReward: number;
  /** Whether section is expanded */
  readonly isExpanded?: boolean;
  /** Whether section is locked (requires previous section) */
  readonly isLocked?: boolean;
  /** Fields in this section */
  readonly fields: readonly EditProfileField[];
}

// ============================================
// FIELD TYPES
// ============================================

/**
 * Field types available in edit profile.
 */
export type EditProfileFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multi-select'
  | 'date'
  | 'number'
  | 'phone'
  | 'email'
  | 'url'
  | 'toggle'
  | 'photo'
  | 'photo-upload'
  | 'location'
  | 'height'
  | 'weight';

/**
 * Configuration for a single profile field.
 */
export interface EditProfileField {
  /** Unique field identifier */
  readonly id: string;
  /** Field type */
  readonly type: EditProfileFieldType;
  /** Display label */
  readonly label: string;
  /** Placeholder text */
  readonly placeholder?: string;
  /** Helper/hint text */
  readonly hint?: string;
  /** Whether field is required */
  readonly required?: boolean;
  /** Current value */
  readonly value?: unknown;
  /** Options for select/multi-select */
  readonly options?: readonly EditProfileFieldOption[];
  /** Validation rules */
  readonly validation?: EditProfileFieldValidation;
  /** XP reward for completing this field */
  readonly xpReward?: number;
  /** Whether field affects completion score */
  readonly countsTowardCompletion?: boolean;
  /** Order within section */
  readonly order?: number;
  /** Icon for the field */
  readonly icon?: string;
}

/**
 * Option for select/multi-select fields.
 */
export interface EditProfileFieldOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: string;
  readonly disabled?: boolean;
}

/**
 * Validation rules for a field.
 */
export interface EditProfileFieldValidation {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly patternMessage?: string;
}

// ============================================
// PROFILE COMPLETION TYPES
// ============================================

/**
 * Profile completion tier based on percentage.
 */
export type ProfileCompletionTier = 'rookie' | 'starter' | 'all-star' | 'mvp' | 'legend';

/**
 * Profile completion data with gamified elements.
 */
export interface ProfileCompletionData {
  /** Overall completion percentage (0-100) */
  readonly percentage: number;
  /** Current tier based on completion */
  readonly tier: ProfileCompletionTier;
  /** XP earned from profile */
  readonly xpEarned: number;
  /** Total possible XP from profile */
  readonly xpTotal: number;
  /** Progress to next tier (0-100) */
  readonly progressToNextTier: number;
  /** Next tier to achieve */
  readonly nextTier?: ProfileCompletionTier;
  /** Fields completed count */
  readonly fieldsCompleted: number;
  /** Total fields count */
  readonly fieldsTotal: number;
  /** Sections with completion data */
  readonly sections: readonly SectionCompletionData[];
  /** Recent achievements unlocked */
  readonly recentAchievements: readonly ProfileAchievement[];
}

/**
 * Completion data for a single section.
 */
export interface SectionCompletionData {
  readonly sectionId: EditProfileSectionId;
  readonly percentage: number;
  readonly fieldsCompleted: number;
  readonly fieldsTotal: number;
  readonly xpEarned: number;
  readonly isComplete: boolean;
}

/**
 * Achievement unlocked through profile completion.
 */
export interface ProfileAchievement {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly xpReward: number;
  readonly unlockedAt: string;
  readonly tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

// ============================================
// FORM DATA TYPES
// ============================================

/**
 * Basic info form data.
 */
export interface EditProfileBasicInfo {
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName?: string;
  readonly bio?: string;
  readonly location?: string;
  readonly classYear?: string;
}

/**
 * Photos form data.
 */
export interface EditProfilePhotos {
  readonly bannerImg?: string;
  readonly profileImgs?: readonly string[];
}

/**
 * Sports info form data.
 */
export interface EditProfileSportsInfo {
  readonly primarySport?: string;
  readonly primaryPosition?: string;
  readonly secondaryPositions?: readonly string[];
  readonly jerseyNumber?: string;
  readonly yearsExperience?: number;
}

/**
 * Academic info form data.
 */
export interface EditProfileAcademics {
  readonly school?: string;
  readonly gpa?: string;
  readonly sat?: string;
  readonly act?: string;
  readonly intendedMajor?: string;
  readonly graduationDate?: string;
}

/**
 * Physical measurements form data.
 */
export interface EditProfilePhysical {
  readonly height?: string;
  readonly weight?: string;
  readonly wingspan?: string;
  readonly fortyYardDash?: string;
  readonly verticalJump?: string;
}

/**
 * A single social link entry for editing.
 * Agnostic — no hardcoded platforms. Mirrors SocialLink in user.model.ts.
 */
export interface EditProfileSocialLinkEntry {
  /** Platform identifier (e.g., "twitter", "instagram", "hudl", custom) */
  readonly platform: string;
  /** Full URL to the profile */
  readonly url: string;
  /** Optional display username/handle */
  readonly username?: string;
  /** Display order (0-based) */
  readonly displayOrder?: number;
}

/**
 * Social links form data.
 * Agnostic array — supports any platform, no hardcoded fields.
 *
 * @example
 * ```ts
 * const socialLinks: EditProfileSocialLinks = {
 *   links: [
 *     { platform: 'twitter', url: 'https://x.com/handle', username: '@handle', displayOrder: 0 },
 *     { platform: 'hudl', url: 'https://hudl.com/profile/123', displayOrder: 1 },
 *   ]
 * };
 * ```
 */
export interface EditProfileSocialLinks {
  readonly links: readonly EditProfileSocialLinkEntry[];
}

/**
 * Contact info form data.
 */
export interface EditProfileContact {
  readonly email?: string;
  readonly phone?: string;
  readonly parentEmail?: string;
  readonly parentPhone?: string;
  readonly coachEmail?: string;
  readonly preferredContactMethod?: 'email' | 'phone' | 'app';
}

/**
 * Complete edit profile form data.
 */
export interface EditProfileFormData {
  readonly basicInfo: EditProfileBasicInfo;
  readonly photos: EditProfilePhotos;
  readonly sportsInfo: EditProfileSportsInfo;
  readonly academics: EditProfileAcademics;
  readonly physical: EditProfilePhysical;
  readonly socialLinks: EditProfileSocialLinks;
  readonly contact: EditProfileContact;
}

// ============================================
// API TYPES
// ============================================

/**
 * Response from profile update API.
 */
export interface EditProfileUpdateResponse {
  readonly success: boolean;
  readonly message?: string;
  readonly xpAwarded?: number;
  readonly achievementsUnlocked?: readonly ProfileAchievement[];
  readonly newCompletionPercentage?: number;
  readonly newTier?: ProfileCompletionTier;
}

/**
 * Profile data for editing (what comes from backend).
 */
export interface EditProfileData {
  readonly uid: string;
  readonly formData: EditProfileFormData;
  readonly completion: ProfileCompletionData;
  readonly lastUpdated: string;
}

// ============================================
// STATE TYPES
// ============================================

/**
 * Edit profile UI state.
 */
export interface EditProfileState {
  /** Current form data */
  readonly formData: EditProfileFormData | null;
  /** Completion data */
  readonly completion: ProfileCompletionData | null;
  /** Currently expanded section */
  readonly expandedSection: EditProfileSectionId | null;
  /** Sections configuration */
  readonly sections: readonly EditProfileSection[];
  /** Whether loading */
  readonly isLoading: boolean;
  /** Whether saving */
  readonly isSaving: boolean;
  /** Error message */
  readonly error: string | null;
  /** Dirty fields (changed since last save) */
  readonly dirtyFields: ReadonlySet<string>;
  /** Validation errors by field */
  readonly validationErrors: Readonly<Record<string, string>>;
  /** Whether there are unsaved changes */
  readonly hasUnsavedChanges: boolean;
}
