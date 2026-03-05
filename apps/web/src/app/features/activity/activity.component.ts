/**
 * @fileoverview Activity Page - Web App Wrapper
 * @module @nxt1/web/features/activity
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Activity shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ActivityShellComponent, type ActivityUser } from '@nxt1/ui/activity';
import { NxtSidenavService } from '@nxt1/ui/components/sidenav';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { ActivityTabId, ActivityItem } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [ActivityShellComponent],
  template: `
    <nxt1-activity-shell
      [user]="userInfo()"
      (avatarClick)="onAvatarClick()"
      (tabChange)="onTabChange($event)"
      (itemNavigate)="onItemNavigate($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('ActivityComponent');
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Activity',
      description: 'Stay updated with notifications, messages, and activity from your network.',
      keywords: ['activity', 'notifications', 'messages', 'updates'],
      noIndex: true, // Protected page - don't index
    });
  }

  /**
   * Transform auth user to ActivityUser interface.
   */
  protected readonly userInfo = computed<ActivityUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg,
      displayName: user.displayName,
    };
  });

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle tab changes for analytics/logging.
   */
  protected onTabChange(tab: ActivityTabId): void {
    this.logger.debug('Activity tab changed', { tab });
  }

  /**
   * Handle item navigation — route based on item type and deepLink.
   * Message items navigate to /messages/:id, others use deepLink.
   */
  protected onItemNavigate(item: ActivityItem): void {
    if (item.deepLink) {
      this.logger.debug('Navigating to item', {
        id: item.id,
        type: item.type,
        deepLink: item.deepLink,
      });
      this.router.navigateByUrl(item.deepLink);
    } else {
      this.logger.debug('Item clicked without deepLink', { id: item.id, type: item.type });
    }
  }
}
