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

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActivityShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  type ActivityUser,
} from '@nxt1/ui';
import type { ActivityTabId } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [ActivityShellComponent],
  template: `
    <nxt1-activity-shell
      [user]="userInfo()"
      (avatarClick)="onAvatarClick()"
      (tabChange)="onTabChange($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityComponent {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('ActivityComponent');

  /**
   * Transform auth user to ActivityUser interface.
   */
  protected readonly userInfo = computed<ActivityUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      photoURL: user.photoURL,
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
    // In production: track analytics event
    // this.analytics.track('activity_tab_change', { tab });
  }
}
