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

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  OnInit,
  signal,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { InviteShellComponent, InviteService, type InviteUser } from '@nxt1/ui/invite';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { InviteType } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [InviteShellComponent],
  template: `
    <nxt1-invite-shell [user]="userInfo()" [inviteType]="inviteType()" (close)="onClose()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly inviteService = inject(InviteService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly logger = inject(NxtLoggingService).child('InviteComponent');
  private readonly seo = inject(SeoService);

  private readonly _inviteType = signal<InviteType>('referral');
  protected readonly inviteType = this._inviteType.asReadonly();

  /**
   * Transform auth user to InviteUser interface.
   */
  protected readonly userInfo = computed<InviteUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      displayName: user.displayName || 'NXT1 User',
      profileImg: user.profileImg ?? null,
      referralCode: this.generateReferralCode(user.uid),
    };
  });

  async ngOnInit(): Promise<void> {
    // Read inviteType from route data (e.g. /invite/team/:teamId sets inviteType='team')
    const routeType = this.route.snapshot.data['inviteType'] as InviteType | undefined;
    if (routeType) this._inviteType.set(routeType);

    this.logger.debug('Invite feature initialized');
    this.seo.updatePage({
      title: 'Invite Friends',
      description: 'Invite athletes, families, and coaches to join NXT1 Sports.',
      canonicalUrl: 'https://nxt1sports.com/invite',
      keywords: ['invite', 'referral', 'team invite', 'nxt1'],
    });

    // Initialize the invite service
    if (this.userInfo()) {
      await this.inviteService.initialize();
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
   * Generate a referral code from user ID.
   * This is a fallback - backend should generate and store this.
   */
  private generateReferralCode(userId: string): string {
    // Fallback only — backend generates and persists the real code (NXT-XXXXXX)
    const hash = userId.substring(0, 6).toUpperCase();
    return `NXT-${hash}`;
  }
}
