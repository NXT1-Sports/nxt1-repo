/**
 * @fileoverview Analytics Dashboard Page - Web App Wrapper
 * @module @nxt1/web/features/analytics-dashboard
 * @version 2.0.0
 *
 * Thin wrapper component that imports the web-optimized Analytics Dashboard
 * shell from @nxt1/ui (zero Ionic) and wires up platform-specific concerns.
 *
 * ⭐ USES WEB SHELL — Zero Ionic, SSR-safe, design token CSS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 * - Role determination
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  AnalyticsDashboardShellWebComponent,
  type AnalyticsUser,
} from '@nxt1/ui/analytics-dashboard';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type {
  AnalyticsTabId,
  AnalyticsPeriod,
  AnalyticsUserRole,
  AnalyticsInsight,
  AnalyticsRecommendation,
} from '@nxt1/core';
import { USER_ROLES } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [AnalyticsDashboardShellWebComponent],
  template: `
    <nxt1-analytics-dashboard-shell-web
      [user]="userInfo()"
      [role]="userRole()"
      (tabChange)="onTabChange($event)"
      (periodChange)="onPeriodChange($event)"
      (insightAction)="onInsightAction($event)"
      (recommendationAction)="onRecommendationAction($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsDashboardComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('AnalyticsDashboardComponent');
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Analytics',
      description: 'Track your performance metrics, engagement stats, and growth insights.',
      keywords: ['analytics', 'stats', 'metrics', 'performance', 'insights'],
      noIndex: true, // Protected page - don't index
    });
  }

  /**
   * Transform auth user to AnalyticsUser interface.
   */
  protected readonly userInfo = computed<AnalyticsUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      uid: user.uid,
      profileImg: user.profileImg ?? null,
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
    // UserRole includes: 'athlete', 'coach', 'director', 'recruiter', 'parent'
    if (role === USER_ROLES.COACH) {
      return 'coach';
    }

    return 'athlete';
  });

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
