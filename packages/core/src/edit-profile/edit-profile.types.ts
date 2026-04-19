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
  readonly profileImgs?: readonly string[];
}

/**
 * Sports info form data.
 * Sport is determined by activeSportIndex, not a separate "primary" concept.
 */
export interface EditProfileSportsInfo {
  readonly sport?: string;
  /** Positions played in this sport (maps to sports[i].positions[]) */
  readonly positions?: readonly string[];
  /** Team / program name (maps to sports[i].team.name) */
  readonly teamName?: string;
  /** Team type (maps to sports[i].team.type) */
  readonly teamType?: string;
  /** Organization ID linking this team to a program (maps to sports[i].team.organizationId) */
  readonly teamOrganizationId?: string;
  /** Jersey number for this sport */
  readonly jerseyNumber?: string;
}

/**
 * Academic info form data.
 */
export interface EditProfileAcademics {
  readonly gpa?: string;
  readonly sat?: string;
  readonly act?: string;
  readonly intendedMajor?: string;
  readonly graduationDate?: string;
  readonly school?: string;
}

/**
 * Physical measurements form data.
 */
export interface EditProfilePhysical {
  readonly height?: string;
  readonly weight?: string;
  readonly wingspan?: string;
}

/**
 * Contact info form data.
 */
export interface EditProfileContact {
  readonly email?: string;
  readonly phone?: string;
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
}

/**
 * Profile data for editing (what comes from backend).
 */
export interface EditProfileData {
  readonly uid: string;
  readonly formData: EditProfileFormData;
  readonly lastUpdated: string;
  readonly rawUser?: Record<string, unknown>; // User type from @nxt1/core
  readonly activeSportIndex?: number;
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
