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

// Service
export { ManageTeamService } from './manage-team.service';

// Landing Page (public marketing)
export { NxtManageTeamLandingComponent } from './manage-team-landing.component';
export { NxtManageTeamDashboardPreviewComponent } from './manage-team-dashboard-preview.component';

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
  ManageTeamIntegrationsSectionComponent,
} from './sections';

// Mock data (for development/testing)
export { MOCK_MANAGE_TEAM_FORM_DATA } from './manage-team.mock-data';
