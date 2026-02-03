/**
 * @fileoverview Explore Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/explore
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Explore shell
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
import { Router } from '@angular/router';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  ExploreShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  type ExploreUser,
} from '@nxt1/ui';
import type { ExploreTabId, ExploreItem, ScoutReport } from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, ExploreShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-explore-shell
        [user]="userInfo()"
        (avatarClick)="onAvatarClick()"
        (tabChange)="onTabChange($event)"
        (itemClick)="onItemClick($event)"
        (scoutReportSelect)="onScoutReportSelect($event)"
        (scoutReportFiltersOpen)="onScoutReportFiltersOpen()"
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
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('ExploreComponent');

  /**
   * Transform auth user to ExploreUser interface.
   */
  protected readonly userInfo = computed<ExploreUser | null>(() => {
    const user = this.authFlow.user();
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
  protected onTabChange(tab: ExploreTabId): void {
    this.logger.debug('Explore tab changed', { tab });
    // In production: track analytics event
    // this.analytics.track('explore_tab_change', { tab });
  }

  /**
   * Handle item click - navigate to detail page.
   */
  protected onItemClick(item: ExploreItem): void {
    this.logger.debug('Explore item clicked', { id: item.id, type: item.type, route: item.route });

    // Navigate to the item's route
    if (item.route) {
      this.navController.navigateForward(item.route);
    }
  }

  /**
   * Handle scout report selection - navigate to detail page.
   */
  protected onScoutReportSelect(report: ScoutReport): void {
    this.logger.debug('Scout report selected', { reportId: report.id });
    this.navController.navigateForward(`/tabs/scout-reports/${report.id}`);
  }

  /**
   * Handle scout report filters open.
   */
  protected onScoutReportFiltersOpen(): void {
    this.logger.debug('Scout report filters opened');
    // TODO: Open filter modal/bottom sheet
  }
}
