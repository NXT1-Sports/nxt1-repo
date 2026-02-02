/**
 * @fileoverview Missions Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/missions
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Missions shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import { MissionsShellComponent, NxtSidenavService, NxtLoggingService } from '@nxt1/ui';
import type { MissionUserRole } from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';

@Component({
  selector: 'app-missions',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, MissionsShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-missions-shell
        [userRole]="userRole()"
        [avatarSrc]="avatarSrc()"
        [avatarName]="avatarName()"
        (avatarClick)="onAvatarClick()"
      />
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      ion-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: -1;
        --background: transparent;
      }
      ion-toolbar {
        --background: transparent;
        --min-height: 0;
        --padding-top: 0;
        --padding-bottom: 0;
      }
      ion-content {
        --background: var(--nxt1-color-bg-primary);
      }
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionsComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly _logger = inject(NxtLoggingService);

  /**
   * User role for missions filtering (athlete vs coach missions)
   * Maps UserRole to MissionUserRole (only 'athlete' | 'coach' | 'all')
   */
  protected readonly userRole = computed<MissionUserRole>(() => {
    const user = this.authFlow.user();
    const role = user?.role;

    // Only athlete and coach are valid mission roles, default to athlete
    if (role === 'athlete' || role === 'coach') {
      return role;
    }
    return 'athlete';
  });

  /**
   * Avatar source URL for page header
   */
  protected readonly avatarSrc = computed(() => {
    return this.authFlow.user()?.photoURL;
  });

  /**
   * Avatar display name for page header
   */
  protected readonly avatarName = computed(() => {
    return this.authFlow.user()?.displayName ?? '';
  });

  /**
   * Handle avatar click - open sidenav
   */
  onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle badge/achievement click - navigate to detail view
   */
  onBadgeClick(badgeId: string): void {
    this.navController.navigateForward(`/tabs/xp/badges/${badgeId}`);
  }
}
