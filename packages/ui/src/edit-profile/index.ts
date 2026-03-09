/**
 * @fileoverview Edit Profile Module Barrel Export
 * @module @nxt1/ui/edit-profile
 * @version 1.0.0
 *
 * Public API for the Edit Profile UI module.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * import {
 *   EditProfileShellComponent,
 *   EditProfileService,
 *   EditProfileBottomSheetService,
 * } from '@nxt1/ui/edit-profile';
 * ```
 */

// ============================================
// COMPONENTS
// ============================================

export { EditProfileShellComponent } from './edit-profile-shell.component';
export { EditProfileProgressComponent } from './edit-profile-progress.component';
export { EditProfileSectionComponent } from './edit-profile-section.component';
export { EditProfileSkeletonComponent } from './edit-profile-skeleton.component';

// ============================================
// SERVICES
// ============================================

export { EditProfileService } from './edit-profile.service';
export { EditProfileBottomSheetService } from './edit-profile-bottom-sheet.service';

// ============================================
// MOCK DATA (for development)
// ============================================

export {
  MOCK_EDIT_PROFILE_FORM_DATA,
  MOCK_PROFILE_COMPLETION,
  MOCK_EDIT_PROFILE_SECTIONS,
  MOCK_PROFILE_ACHIEVEMENTS,
  MOCK_EMPTY_PROFILE_FORM_DATA,
  MOCK_EMPTY_COMPLETION,
} from './edit-profile.mock-data';
