/**
 * @fileoverview Edit Profile Module Barrel Export
 * @module @nxt1/core/edit-profile
 * @version 1.0.0
 */

// Types
export type {
  // Section types
  EditProfileSectionId,
  EditProfileSection,
  // Field types
  EditProfileFieldType,
  EditProfileField,
  EditProfileFieldOption,
  EditProfileFieldValidation,
  // Completion types
  ProfileCompletionTier,
  ProfileCompletionData,
  SectionCompletionData,
  ProfileAchievement,
  // Form data types
  EditProfileBasicInfo,
  EditProfilePhotos,
  EditProfileSportsInfo,
  EditProfileAcademics,
  EditProfilePhysical,
  EditProfileSocialLinks,
  EditProfileContact,
  EditProfileFormData,
  // API types
  EditProfileUpdateResponse,
  EditProfileData,
  // State types
  EditProfileState,
} from './edit-profile.types';

// Constants
export {
  PROFILE_COMPLETION_TIERS,
  getCompletionTier,
  getNextTier,
  EDIT_PROFILE_SECTIONS,
  getEditProfileSection,
  EDIT_PROFILE_XP_REWARDS,
  EDIT_PROFILE_VALIDATION,
} from './edit-profile.constants';

// API
export { createEditProfileApi, type EditProfileApi } from './edit-profile.api';
