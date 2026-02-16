/**
 * @fileoverview Analytics Root Page — Auth-Aware Dual State
 * @module @nxt1/web/features/analytics-dashboard
 * @version 2.0.0
 *
 * Root component for the `/analytics` route.
 * Implements the professional dual-state pattern (LinkedIn/Strava/GitHub):
 *
 * - **Logged out** → Marketing landing page with feature showcase & preview
 * - **Logged in** → Actual analytics dashboard
 *
 * Same URL, different experience. SEO-optimized for both states.
 * SSR-safe with proper meta tags regardless of auth state.
 *
 * Architecture:
 * - Reads auth state via AUTH_SERVICE injection token (Signal-based)
 * - Uses @defer for lazy loading both states (optimal bundle splitting)
 * - Landing page content is indexable; dashboard content is noindex
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  AnalyticsDashboardShellWebComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtPlatformService,
  NxtAnalyticsLandingComponent,
  AnalyticsDashboardSkeletonComponent,
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
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-analytics-root',
  standalone: true,
  imports: [
    CommonModule,
    AnalyticsDashboardShellWebComponent,
    NxtAnalyticsLandingComponent,
    AnalyticsDashboardSkeletonComponent,
  ],
  template: `
    <!-- Loading: Auth state initializing -->
    @if (isAuthLoading()) {
      <nxt1-analytics-dashboard-skeleton />
    }

    <!-- Authenticated: Show actual analytics dashboard -->
    @else if (isAuthenticated()) {
      <nxt1-analytics-dashboard-shell-web
        [user]="userInfo()"
        [role]="userRole()"
        [hideHeader]="isDesktop()"
        (avatarClick)="onAvatarClick()"
        (tabChange)="onTabChange($event)"
        (periodChange)="onPeriodChange($event)"
        (insightAction)="onInsightAction($event)"
        (recommendationAction)="onRecommendationAction($event)"
      />
    }

    <!-- Unauthenticated: Show marketing landing page -->
    @else {
      <nxt1-analytics-landing />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsRootComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('AnalyticsRootComponent');
  private readonly seo = inject(SeoService);
  private readonly platform = inject(NxtPlatformService);

  /** Auth state signals */
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly isAuthLoading = computed(
    () => !this.authService.isInitialized() || this.authService.isLoading()
  );

  /** Desktop detection for hiding redundant page header (sidebar provides nav) */
  protected readonly isDesktop = computed(() => this.platform.viewport().width >= 1280);

  ngOnInit(): void {
    // SEO: Use different meta tags based on auth state
    // Landing page is indexable for organic traffic; dashboard is noindex
    if (this.isAuthenticated()) {
      this.seo.updatePage({
        title: 'Analytics',
        description: 'Track your performance metrics, engagement stats, and growth insights.',
        keywords: ['analytics', 'stats', 'metrics', 'performance', 'insights'],
        noIndex: true,
      });
    } else {
      this.seo.updatePage({
        title: 'Analytics — Track Your Recruiting Performance | NXT1',
        description:
          "Track profile views, video performance, and college recruiting interest. See who's watching your athletic profile with NXT1 Analytics.",
        keywords: [
          'sports analytics',
          'recruiting analytics',
          'athlete stats',
          'profile views',
          'college coach tracking',
          'video performance',
          'NXT1 analytics',
        ],
      });
    }
  }

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
    return role === 'coach' ? 'coach' : 'athlete';
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
