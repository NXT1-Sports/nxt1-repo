/**
 * @fileoverview Analytics Dashboard Page - Web App Wrapper
 * @module @nxt1/web/features/analytics-dashboard
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
 * - User context from AuthService
 * - Role determination
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
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
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [AnalyticsDashboardShellComponent],
  template: `
    <nxt1-analytics-dashboard-shell
      [user]="userInfo()"
      [role]="userRole()"
      (avatarClick)="onAvatarClick()"
      (tabChange)="onTabChange($event)"
      (periodChange)="onPeriodChange($event)"
      (insightAction)="onInsightAction($event)"
      (recommendationAction)="onRecommendationAction($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsDashboardComponent {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('AnalyticsDashboardComponent');

  /**
   * Transform auth user to AnalyticsUser interface.
   */
  protected readonly userInfo = computed<AnalyticsUser | null>(() => {
    const user = this.authService.user();
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
    const role = this.authService.userRole();
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
    // In production: track analytics event
    // this.analytics.track('analytics_tab_change', { tab });
  }

  /**
   * Handle period changes for analytics/logging.
   */
  protected onPeriodChange(period: AnalyticsPeriod): void {
    this.logger.debug('Analytics period changed', { period });
    // In production: track analytics event
    // this.analytics.track('analytics_period_change', { period });
  }

  /**
   * Handle insight action navigation.
   */
  protected onInsightAction(insight: AnalyticsInsight): void {
    this.logger.debug('Insight action triggered', { id: insight.id, action: insight.action });

    if (insight.actionRoute) {
      this.router.navigate([insight.actionRoute]);
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
      this.router.navigate([rec.actionRoute]);
    }
  }
}
