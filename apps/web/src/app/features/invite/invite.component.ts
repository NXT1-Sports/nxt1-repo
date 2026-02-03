/**
 * @fileoverview Invite Page - Web App Wrapper
 * @module @nxt1/web/features/invite
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Invite shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 * - Bottom sheet on mobile via NxtBottomSheetService
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  InviteShellComponent,
  InviteService,
  NxtSidenavService,
  NxtLoggingService,
  NxtBottomSheetService,
  NxtPlatformService,
  type InviteUser,
} from '@nxt1/ui';
import type { InviteChannel, InviteType } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [InviteShellComponent],
  template: `
    <nxt1-invite-shell
      [user]="userInfo()"
      [inviteType]="inviteType()"
      (close)="onClose()"
      (channelSelected)="onChannelSelected($event)"
      (viewAchievements)="onViewAchievements()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly inviteService = inject(InviteService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly bottomSheetService = inject(NxtBottomSheetService);
  private readonly platformService = inject(NxtPlatformService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('InviteComponent');

  /**
   * Default invite type - can be overridden via route data or query params.
   */
  protected readonly inviteType = computed<InviteType>(() => 'referral');

  /**
   * Transform auth user to InviteUser interface.
   */
  protected readonly userInfo = computed<InviteUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      id: user.uid,
      displayName: user.displayName || 'NXT1 User',
      photoURL: user.photoURL,
      username: user.username || undefined,
      referralCode: user.referralCode || this.generateReferralCode(user.uid),
    };
  });

  async ngOnInit(): Promise<void> {
    this.logger.debug('Invite feature initialized');

    // Initialize the invite service with user data
    const user = this.userInfo();
    if (user) {
      await this.inviteService.initialize(user);
    }
  }

  /**
   * Handle close button - navigate back or close modal.
   */
  protected onClose(): void {
    this.logger.debug('Invite closed');

    // If opened as a bottom sheet, this won't be called
    // But for direct navigation, go back to previous page
    this.router.navigate(['/']);
  }

  /**
   * Handle channel selection for analytics/logging.
   */
  protected onChannelSelected(channel: InviteChannel): void {
    this.logger.debug('Invite channel selected', { channel });
    // In production: track analytics event
    // this.analytics.track('invite_channel_selected', { channel });
  }

  /**
   * Handle view achievements navigation.
   */
  protected onViewAchievements(): void {
    this.logger.debug('View achievements clicked');

    // Navigate to full achievements page or open modal
    // For now, just log - could open bottom sheet with full achievements
    this.router.navigate(['/profile'], { fragment: 'achievements' });
  }

  /**
   * Generate a referral code from user ID.
   * This is a fallback - backend should generate and store this.
   */
  private generateReferralCode(userId: string): string {
    // Simple hash-based code - backend should handle this properly
    const hash = userId.substring(0, 8).toUpperCase();
    return `NXT1-${hash}`;
  }
}
