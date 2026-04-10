/**
 * @fileoverview Invite Module - Barrel Export
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Exports all Invite feature components and services.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```typescript
 * import {
 *   InviteShellComponent,
 *   InviteService,
 *   InviteStatsCardComponent,
 * } from '@nxt1/ui';
 * ```
 */

// ============================================
// COMPONENTS
// ============================================

export { InviteShellComponent, type InviteUser } from './invite-shell.component';
export { InviteStatsCardComponent } from './invite-stats-card.component';
export { InviteChannelGridComponent } from './invite-channel-grid.component';
export { InviteQrCodeComponent } from './invite-qr-code.component';
export { InviteAchievementsComponent } from './invite-achievements.component';
export { InviteCelebrationComponent } from './invite-celebration.component';
export { InviteSkeletonComponent } from './invite-skeleton.component';

// ============================================
// SERVICES
// ============================================

export { InviteService } from './invite.service';
export { InviteApiService, INVITE_API_BASE_URL } from './invite-api.service';
export {
  InviteBottomSheetService,
  InviteModalComponent,
  type InviteBottomSheetConfig,
} from './invite-bottom-sheet.service';

// ============================================
