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
export { EditProfileSkeletonComponent } from './edit-profile-skeleton.component';
export { EditProfileWebModalComponent } from './edit-profile-web-modal.component';

// ============================================
// SERVICES
// ============================================

export { EditProfileService } from './edit-profile.service';
export { EditProfileBottomSheetService } from './edit-profile-bottom-sheet.service';
export { EditProfileModalService } from './edit-profile-modal.service';
