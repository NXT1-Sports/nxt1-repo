/**
 * @fileoverview Manage Team Module - Barrel Export
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Professional team management UI module.
 * Can be used as standalone page, modal, or bottom sheet.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * // Import in your component
 * import { ManageTeamShellComponent, ManageTeamBottomSheetService } from '@nxt1/ui';
 *
 * // Use as standalone page
 * <nxt1-manage-team-shell [teamId]="teamId" />
 *
 * // Use as bottom sheet
 * const result = await this.manageTeamSheet.present({ teamId });
 */

// Main shell component
export { ManageTeamShellComponent, type ManageTeamCloseEvent } from './manage-team-shell.component';

// Bottom sheet service
export {
  ManageTeamBottomSheetService,
  type ManageTeamSheetOptions,
  type ManageTeamSheetResult,
} from './manage-team-bottom-sheet.service';

// Modal service (adaptive: bottom sheet on mobile, overlay on desktop)
export {
  ManageTeamModalService,
  type ManageTeamModalOptions,
  type ManageTeamModalResult,
} from './manage-team-modal.service';

// Web modal wrapper (desktop overlay)
export { ManageTeamWebModalComponent } from './manage-team-web-modal.component';

// Service
export { ManageTeamService } from './manage-team.service';

// API Client
export { ManageTeamApiClient, MANAGE_TEAM_API_BASE_URL } from './manage-team-api.client';

// Landing Page (public marketing)
export { NxtManageTeamLandingComponent } from './manage-team-landing.component';
export { NxtManageTeamDashboardPreviewComponent } from './manage-team-dashboard-preview.component';

// Team logo upload adapter token
export { TEAM_LOGO_UPLOADER, type TeamLogoUploader } from './team-logo-uploader.token';

// Skeleton
export { ManageTeamSkeletonComponent } from './manage-team-skeleton.component';

// Section components (for custom layouts)
export {
  ManageTeamInfoSectionComponent,
  ManageTeamRosterSectionComponent,
  ManageTeamScheduleSectionComponent,
  ManageTeamStatsSectionComponent,
  ManageTeamStaffSectionComponent,
  ManageTeamSponsorsSectionComponent,
} from './sections';
