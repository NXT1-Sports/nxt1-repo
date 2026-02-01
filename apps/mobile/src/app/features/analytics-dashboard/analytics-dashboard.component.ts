/**
 * @fileoverview Analytics Dashboard Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/analytics-dashboard
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Analytics Dashboard shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthFlowService
 * - Role determination
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  AnalyticsDashboardShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  type AnalyticsUser,
} from '@nxt1/ui';
import type {
  AnalyticsTabId,
  AnalyticsPeriod,
  AnalyticsUserRole,
  AnalyticsInsight,
  AnalyticsRecommendation,
} from '@nxt1/core';
import { AuthFlowService } from '../auth/services/auth-flow.service';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, AnalyticsDashboardShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-analytics-dashboard-shell
        [user]="userInfo()"
        [role]="userRole()"
        (avatarClick)="onAvatarClick()"
        (tabChange)="onTabChange($event)"
        (periodChange)="onPeriodChange($event)"
        (insightAction)="onInsightAction($event)"
        (recommendationAction)="onRecommendationAction($event)"
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
export class AnalyticsDashboardComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly navController = inject(NavController);
  private readonly logger = inject(NxtLoggingService).child('AnalyticsDashboardComponent');

  /**
   * Transform auth user to AnalyticsUser interface.
   */
  protected readonly userInfo = computed<AnalyticsUser | null>(() => {
    const user = this.authFlow.user();
    if (!user) return null;

    return {
      photoURL: user.photoURL,
      displayName: user.displayName,
    };
  });

  /**
   * Determine user role from auth service.
   * Defaults to 'athlete' if not determinable.
   */
  protected readonly userRole = computed<AnalyticsUserRole>(() => {
    const role = this.authFlow.userRole();
    if (!role) return 'athlete';

    // Map UserRole to AnalyticsUserRole
    // UserRole includes: 'athlete', 'coach', 'parent', 'fan', etc.
    if (role === 'coach') {
      return 'coach';
    }

    return 'athlete';
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
  protected onTabChange(tab: AnalyticsTabId): void {
    this.logger.debug('Analytics tab changed', { tab });
  }

  /**
   * Handle period changes for analytics/logging.
   */
  protected onPeriodChange(period: AnalyticsPeriod): void {
    this.logger.debug('Analytics period changed', { period });
  }

  /**
   * Handle insight action navigation.
   */
  protected onInsightAction(insight: AnalyticsInsight): void {
    this.logger.debug('Insight action triggered', { id: insight.id, action: insight.action });

    if (insight.actionRoute) {
      this.navController.navigateForward(insight.actionRoute);
    }
  }

  /**
   * Handle recommendation action navigation.
   */
  protected onRecommendationAction(rec: AnalyticsRecommendation): void {
    this.logger.debug('Recommendation action triggered', {
      id: rec.id,
      actionLabel: rec.actionLabel,
    });

    if (rec.actionRoute) {
      this.navController.navigateForward(rec.actionRoute);
    }
  }
}
