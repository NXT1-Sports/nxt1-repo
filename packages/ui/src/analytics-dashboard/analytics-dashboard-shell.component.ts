/**
 * @fileoverview Analytics Dashboard Shell Component - Main Container
 * @module @nxt1/ui/analytics-dashboard
 * @version 1.0.0
 *
 * Top-level container component for Analytics Dashboard feature.
 * Orchestrates header, period selector, tab navigation, and content panels.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Sticky page header with avatar
 * - Period selection dropdown (7d, 30d, 90d, 12mo, all)
 * - Tab navigation for different analytics views
 * - Pull-to-refresh support
 * - Role-based content (athlete vs coach)
 * - iOS 26 Liquid Glass Design Language
 *
 * @example
 * ```html
 * <nxt1-analytics-dashboard-shell
 *   [user]="currentUser()"
 *   [role]="userRole()"
 *   (avatarClick)="openSidenav()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import {
  type AnalyticsTabId,
  type AnalyticsPeriod,
  type AnalyticsUserRole,
  type AnalyticsInsight,
  type AnalyticsRecommendation,
  ANALYTICS_PERIODS,
} from '@nxt1/core';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { NxtIconComponent } from '../components/icon';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { AnalyticsDashboardService } from './analytics-dashboard.service';
import { AnalyticsDashboardSkeletonComponent } from './analytics-dashboard-skeleton.component';

/**
 * User info for header display.
 */
export interface AnalyticsUser {
  readonly uid?: string | null;
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
}

@Component({
  selector: 'nxt1-analytics-dashboard-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonSelect,
    IonSelectOption,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtIconComponent,
    AnalyticsDashboardSkeletonComponent,
  ],
  template: `
    <!-- Professional Page Header -->
    <!-- Hidden on desktop when using sidebar shell -->
    @if (!hideHeader()) {
      <nxt1-page-header
        title="Analytics"
        [showBack]="showBack()"
        [actions]="headerActions()"
        (menuClick)="avatarClick.emit()"
        (backClick)="back.emit()"
        (actionClick)="onHeaderAction($event)"
      >
        <!-- Period Selector in Header -->
        <div slot="end" class="period-selector">
          <ion-select
            [value]="analytics.selectedPeriod()"
            interface="popover"
            (ionChange)="onPeriodChange($any($event).detail.value)"
            aria-label="Select time period"
          >
            @for (period of periods; track period.id) {
              <ion-select-option [value]="period.id">
                {{ period.label }}
              </ion-select-option>
            }
          </ion-select>
        </div>
      </nxt1-page-header>
    }

    <!-- Tab Navigation -->
    <nxt1-option-scroller
      [options]="tabOptions()"
      [selectedId]="analytics.activeTab()"
      [config]="{ scrollable: true, stretchToFill: false, showDivider: true }"
      (selectionChange)="onTabChange($event)"
    />

    <ion-content [fullscreen]="true" class="analytics-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="analytics-container">
        <!-- Loading State -->
        @if (analytics.isLoading()) {
          <nxt1-analytics-dashboard-skeleton />
        }

        <!-- Error State -->
        @else if (analytics.error()) {
          <div class="analytics-error">
            <div class="error-icon">
              <nxt1-icon name="alert-circle-outline" size="64" />
            </div>
            <h3 class="error-title">Unable to Load Analytics</h3>
            <p class="error-message">{{ analytics.error() }}</p>
            <button class="error-retry" (click)="onRetry()">
              <nxt1-icon name="refresh-outline" size="20" />
              Try Again
            </button>
          </div>
        }

        <!-- Empty State -->
        @else if (analytics.isEmpty()) {
          <div class="analytics-empty">
            <div class="empty-icon">
              <nxt1-icon name="analytics-outline" size="64" />
            </div>
            <h3 class="empty-title">No Analytics Data Yet</h3>
            <p class="empty-message">
              @if (analytics.isAthleteView()) {
                Start building your profile to see engagement analytics
              } @else {
                Add athletes to your roster to see team analytics
              }
            </p>
          </div>
        }

        <!-- Content Panels -->
        @else {
          <!-- Overview Tab -->
          @if (analytics.activeTab() === 'overview') {
            <section class="analytics-section">
              <!-- Metric Cards Grid -->
              <div class="metrics-grid">
                @for (card of analytics.overviewCards(); track card.id) {
                  <div class="metric-card" [class]="'metric-card--' + (card.variant ?? 'default')">
                    <div class="metric-icon">
                      <nxt1-icon [name]="card.icon" size="24" />
                    </div>
                    <div class="metric-value">
                      {{ card.displayValue }}
                    </div>
                    <div class="metric-label">{{ card.label }}</div>
                    @if (card.trend) {
                      <div
                        class="metric-trend"
                        [class.trend-up]="card.trend.direction === 'up'"
                        [class.trend-down]="card.trend.direction === 'down'"
                        [class.trend-stable]="card.trend.direction === 'stable'"
                      >
                        @if (card.trend.direction === 'up') {
                          <nxt1-icon name="trending-up" size="16" />
                        } @else if (card.trend.direction === 'down') {
                          <nxt1-icon name="trending-down" size="16" />
                        }
                        <span>{{ formatPercentChange(card.trend.percentChange) }}</span>
                        <span class="trend-label">vs previous</span>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Insights Section -->
              @if (analytics.insights().length > 0) {
                <div class="insights-section">
                  <h3 class="section-title">Insights</h3>
                  <div class="insights-list">
                    @for (insight of analytics.insights(); track insight.id) {
                      <div class="insight-card" [class]="'insight--' + insight.priority">
                        <div class="insight-icon">
                          <nxt1-icon [name]="insight.icon" size="20" />
                        </div>
                        <div class="insight-content">
                          <h4 class="insight-title">{{ insight.title }}</h4>
                          <p class="insight-description">{{ insight.description }}</p>
                        </div>
                        @if (insight.action) {
                          <button class="insight-action" (click)="onInsightAction(insight)">
                            {{ insight.action }}
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Recommendations Section -->
              @if (analytics.recommendations().length > 0) {
                <div class="recommendations-section">
                  <h3 class="section-title">Recommendations</h3>
                  <div class="recommendations-list">
                    @for (rec of analytics.recommendations(); track rec.id) {
                      <div class="recommendation-card" [class]="'recommendation--' + rec.priority">
                        <div class="recommendation-priority">
                          <span class="priority-badge">{{ rec.priority }}</span>
                        </div>
                        <div class="recommendation-content">
                          <h4 class="recommendation-title">{{ rec.title }}</h4>
                          <p class="recommendation-description">{{ rec.description }}</p>
                          @if (rec.impact) {
                            <span class="recommendation-impact">
                              <nxt1-icon name="flash-outline" size="14" />
                              {{ rec.impact }}
                            </span>
                          }
                        </div>
                        @if (rec.actionLabel) {
                          <button
                            class="recommendation-action"
                            (click)="onRecommendationAction(rec)"
                          >
                            {{ rec.actionLabel }}
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </section>
          }

          <!-- Engagement Tab -->
          @if (analytics.activeTab() === 'engagement') {
            <section class="analytics-section">
              <div class="coming-soon">
                <nxt1-icon name="bar-chart-outline" size="48" />
                <h3>Engagement Analytics</h3>
                <p>Detailed engagement metrics coming soon</p>
              </div>
            </section>
          }

          <!-- Content Tab (Athletes) -->
          @if (analytics.activeTab() === 'content') {
            <section class="analytics-section">
              <div class="coming-soon">
                <nxt1-icon name="videocam-outline" size="48" />
                <h3>Content Performance</h3>
                <p>Video and post analytics coming soon</p>
              </div>
            </section>
          }

          <!-- Recruiting Tab (Athletes) -->
          @if (analytics.activeTab() === 'recruiting') {
            <section class="analytics-section">
              <div class="coming-soon">
                <nxt1-icon name="school-outline" size="48" />
                <h3>Recruiting Analytics</h3>
                <p>College interest tracking coming soon</p>
              </div>
            </section>
          }

          <!-- Roster Tab (Coaches) -->
          @if (analytics.activeTab() === 'roster') {
            <section class="analytics-section">
              <div class="coming-soon">
                <nxt1-icon name="people-outline" size="48" />
                <h3>Roster Analytics</h3>
                <p>Team roster performance coming soon</p>
              </div>
            </section>
          }
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
         ANALYTICS DASHBOARD SHELL
         100% Design Token Architecture (2026)
         Theme-Aware · Sport-Aware · SSR-Safe
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      /* Period Selector */
      .period-selector {
        ion-select {
          --padding-start: var(--nxt1-spacing-3);
          --padding-end: var(--nxt1-spacing-2);
          font-family: var(--nxt1-fontFamily-system);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: var(--nxt1-fontWeight-medium);
          min-width: 90px;
          color: var(--nxt1-color-text-secondary);
        }
      }

      /* Content Area */
      .analytics-content {
        --background: var(--nxt1-color-bg-primary);
      }

      .analytics-container {
        min-height: 100%;
        padding: var(--nxt1-spacing-4);
        padding-bottom: calc(var(--nxt1-spacing-20) + env(safe-area-inset-bottom, 0));
      }

      /* ============================================
         METRIC CARDS GRID
         ============================================ */

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-6);
      }

      @media (min-width: 768px) {
        .metrics-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .metric-card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        padding: var(--nxt1-spacing-4);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
        transition:
          background var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-border-default);
        }
      }

      .metric-icon {
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-primary);
        margin-bottom: var(--nxt1-spacing-1);
      }

      /* Card color variants */
      .metric-card--primary .metric-icon {
        background: var(--nxt1-color-alpha-primary15);
        color: var(--nxt1-color-primary);
      }

      .metric-card--success .metric-icon {
        background: var(--nxt1-color-successBg);
        color: var(--nxt1-color-success);
      }

      .metric-card--warning .metric-icon {
        background: var(--nxt1-color-warningBg);
        color: var(--nxt1-color-warning);
      }

      .metric-card--info .metric-icon {
        background: var(--nxt1-color-infoBg);
        color: var(--nxt1-color-info);
      }

      .metric-value {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .metric-label {
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      .metric-trend {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        margin-top: var(--nxt1-spacing-1);

        &.trend-up {
          color: var(--nxt1-color-success);
        }

        &.trend-down {
          color: var(--nxt1-color-error);
        }

        &.trend-stable {
          color: var(--nxt1-color-text-tertiary);
        }
      }

      .trend-label {
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         SECTIONS
         ============================================ */

      .analytics-section {
        padding-bottom: var(--nxt1-spacing-6);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-4) 0;
      }

      /* ============================================
         INSIGHTS
         ============================================ */

      .insights-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .insights-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .insight-card {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4);

        &.insight--positive .insight-icon {
          color: var(--nxt1-color-success);
          background: var(--nxt1-color-successBg);
        }

        &.insight--negative .insight-icon {
          color: var(--nxt1-color-error);
          background: var(--nxt1-color-errorBg);
        }

        &.insight--neutral .insight-icon {
          color: var(--nxt1-color-info);
          background: var(--nxt1-color-infoBg);
        }

        &.insight--opportunity .insight-icon {
          color: var(--nxt1-color-primary);
          background: var(--nxt1-color-alpha-primary15);
        }
      }

      .insight-icon {
        width: var(--nxt1-spacing-9);
        height: var(--nxt1-spacing-9);
        border-radius: var(--nxt1-borderRadius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .insight-content {
        flex: 1;
        min-width: 0;
      }

      .insight-title {
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1) 0;
      }

      .insight-description {
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .insight-action {
        background: transparent;
        border: 1px solid var(--nxt1-color-primary);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-md);
        cursor: pointer;
        white-space: nowrap;
        transition: background var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);

        &:hover {
          background: var(--nxt1-color-alpha-primary10);
        }
      }

      /* ============================================
         RECOMMENDATIONS
         ============================================ */

      .recommendations-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .recommendations-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .recommendation-card {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4);
      }

      .recommendation-priority {
        flex-shrink: 0;
      }

      .priority-badge {
        display: inline-block;
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        text-transform: uppercase;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-sm);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .recommendation--high .priority-badge {
        background: var(--nxt1-color-errorBg);
        color: var(--nxt1-color-error);
      }

      .recommendation--medium .priority-badge {
        background: var(--nxt1-color-warningBg);
        color: var(--nxt1-color-warning);
      }

      .recommendation--low .priority-badge {
        background: var(--nxt1-color-successBg);
        color: var(--nxt1-color-success);
      }

      .recommendation-content {
        flex: 1;
        min-width: 0;
      }

      .recommendation-title {
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1) 0;
      }

      .recommendation-description {
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .recommendation-impact {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
      }

      .recommendation-action {
        background: var(--nxt1-color-primary);
        border: none;
        color: var(--nxt1-color-on-primary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-md);
        cursor: pointer;
        white-space: nowrap;
        transition: opacity var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);

        &:hover {
          opacity: 0.9;
        }
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .analytics-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        min-height: 300px;
      }

      .error-icon {
        color: var(--nxt1-color-error);
        margin-bottom: var(--nxt1-spacing-4);
        opacity: 0.8;
      }

      .error-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .error-message {
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-6) 0;
        max-width: 280px;
      }

      .error-retry {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-lg);
        cursor: pointer;
        transition:
          background var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-border-default);
        }
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .analytics-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        min-height: 300px;
      }

      .empty-icon {
        color: var(--nxt1-color-text-tertiary);
        margin-bottom: var(--nxt1-spacing-4);
        opacity: 0.6;
      }

      .empty-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .empty-message {
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        max-width: 280px;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ============================================
         COMING SOON PLACEHOLDER
         ============================================ */

      .coming-soon {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        min-height: 200px;
        background: var(--nxt1-color-surface-100);
        border: 1px dashed var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        color: var(--nxt1-color-text-tertiary);

        h3 {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-base);
          font-weight: var(--nxt1-fontWeight-semibold);
          color: var(--nxt1-color-text-secondary);
          margin: var(--nxt1-spacing-4) 0 var(--nxt1-spacing-1) 0;
        }

        p {
          font-family: var(--nxt1-fontFamily-system);
          font-size: var(--nxt1-fontSize-xs);
          margin: 0;
        }
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .metric-card,
        .insight-action,
        .recommendation-action,
        .error-retry {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsDashboardShellComponent implements OnInit {
  protected readonly analytics = inject(AnalyticsDashboardService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('AnalyticsDashboardShell');

  // ============================================
  // INPUTS
  // ============================================

  /** User info for header avatar */
  readonly user = input<AnalyticsUser | null>(null);

  /** User role (athlete or coach) */
  readonly role = input<AnalyticsUserRole>('athlete');

  /** Hide page header (desktop sidebar provides navigation) */
  readonly hideHeader = input(false);

  /** Show back button instead of avatar */
  readonly showBack = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar is clicked (open sidenav) */
  readonly avatarClick = output<void>();

  /** Emitted when back is clicked */
  readonly back = output<void>();

  /** Emitted when a tab changes */
  readonly tabChange = output<AnalyticsTabId>();

  /** Emitted when period changes */
  readonly periodChange = output<AnalyticsPeriod>();

  /** Emitted when an insight action is clicked */
  readonly insightAction = output<AnalyticsInsight>();

  /** Emitted when a recommendation action is clicked */
  readonly recommendationAction = output<AnalyticsRecommendation>();

  // ============================================
  // CONSTANTS
  // ============================================

  /** Available time periods */
  protected readonly periods = ANALYTICS_PERIODS;

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Display name for header */
  protected readonly displayName = computed(() => {
    const user = this.user();
    return user?.displayName ?? 'User';
  });

  /** Header actions */
  protected readonly headerActions = computed((): PageHeaderAction[] => {
    return [
      {
        id: 'export',
        label: 'Export',
        icon: 'download-outline',
      },
    ];
  });

  /** Tab options for options scroller */
  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    return this.analytics
      .availableTabs()
      .map((tab: { id: string; label: string; icon: string }) => ({
        id: tab.id,
        label: tab.label,
        icon: tab.icon,
      }));
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    const userId = this.user()?.uid ?? undefined;
    this.analytics.initialize(this.role(), userId);
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle tab selection change.
   */
  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as AnalyticsTabId;
    this.logger.debug('Tab changed', { tabId });
    this.analytics.setActiveTab(tabId);
    this.tabChange.emit(tabId);
  }

  /**
   * Handle period selection change.
   */
  protected async onPeriodChange(period: AnalyticsPeriod): Promise<void> {
    this.logger.debug('Period changed', { period });
    await this.analytics.setPeriod(period);
    this.periodChange.emit(period);
  }

  /**
   * Handle header action click.
   */
  protected async onHeaderAction(action: PageHeaderAction): Promise<void> {
    if (action.id === 'export') {
      await this.haptics.impact('medium');
      this.toast.info('Export feature coming soon');
    }
  }

  /**
   * Handle pull-to-refresh.
   */
  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    this.logger.debug('Pull-to-refresh triggered');
    await this.analytics.refresh();
    event.complete();
  }

  /**
   * Handle refresh timeout.
   */
  protected handleRefreshTimeout(): void {
    this.toast.warning('Refresh timed out. Please try again.');
    this.logger.warn('Pull-to-refresh timed out');
  }

  /**
   * Handle retry after error.
   */
  protected async onRetry(): Promise<void> {
    await this.haptics.impact('light');
    await this.analytics.loadReport(this.analytics.selectedPeriod(), true);
  }

  /**
   * Handle insight action click.
   */
  protected onInsightAction(insight: AnalyticsInsight): void {
    this.logger.debug('Insight action clicked', { id: insight.id });
    this.insightAction.emit(insight);
  }

  /**
   * Handle recommendation action click.
   */
  protected onRecommendationAction(rec: AnalyticsRecommendation): void {
    this.logger.debug('Recommendation action clicked', { id: rec.id });
    this.recommendationAction.emit(rec);
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Format percent change for display.
   */
  protected formatPercentChange(value: number): string {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(1)}%`;
  }
}
