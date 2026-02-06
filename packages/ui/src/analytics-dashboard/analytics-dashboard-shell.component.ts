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

/**
 * User info for header display.
 */
export interface AnalyticsUser {
  readonly photoURL?: string | null;
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
  ],
  template: `
    <!-- Professional Page Header -->
    <!-- Hidden on desktop when using sidebar shell -->
    @if (!hideHeader()) {
      <nxt1-page-header
        title="Analytics"
        [avatarSrc]="user()?.photoURL"
        [avatarName]="displayName()"
        [actions]="headerActions()"
        (avatarClick)="avatarClick.emit()"
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
          <div class="analytics-skeleton">
            <!-- Metric Cards Skeleton -->
            <div class="skeleton-section">
              <div class="skeleton-grid">
                @for (i of [1, 2, 3, 4]; track i) {
                  <div class="skeleton-card">
                    <div class="skeleton-icon"></div>
                    <div class="skeleton-value"></div>
                    <div class="skeleton-label"></div>
                    <div class="skeleton-trend"></div>
                  </div>
                }
              </div>
            </div>

            <!-- Chart Skeleton -->
            <div class="skeleton-section">
              <div class="skeleton-chart">
                <div class="skeleton-chart-header"></div>
                <div class="skeleton-chart-area"></div>
              </div>
            </div>

            <!-- Insights Skeleton -->
            <div class="skeleton-section">
              <div class="skeleton-list">
                @for (i of [1, 2, 3]; track i) {
                  <div class="skeleton-list-item"></div>
                }
              </div>
            </div>
          </div>
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
              @if (analytics.userRole() === 'athlete') {
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
         iOS 26 Liquid Glass Design System
         100% Theme Aware (Light + Dark Mode)
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        /* Theme-aware CSS Variables (Design Token Integration) */
        --analytics-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --analytics-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --analytics-surface-elevated: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        --analytics-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --analytics-border-strong: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        --analytics-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --analytics-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --analytics-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --analytics-primary: var(--nxt1-color-primary, #ccff00);
        --analytics-success: var(--nxt1-color-feedback-success, #22c55e);
        --analytics-warning: var(--nxt1-color-feedback-warning, #f59e0b);
        --analytics-error: var(--nxt1-color-feedback-error, #ef4444);
        --analytics-info: var(--nxt1-color-feedback-info, #3b82f6);

        /* Spacing */
        --analytics-spacing-xs: 4px;
        --analytics-spacing-sm: 8px;
        --analytics-spacing-md: 16px;
        --analytics-spacing-lg: 24px;
        --analytics-spacing-xl: 32px;

        /* Border Radius */
        --analytics-radius-sm: 8px;
        --analytics-radius-md: 12px;
        --analytics-radius-lg: 16px;
        --analytics-radius-xl: 20px;
      }

      /* Period Selector */
      .period-selector {
        ion-select {
          --padding-start: 12px;
          --padding-end: 8px;
          font-size: 14px;
          font-weight: 500;
          min-width: 90px;
          color: var(--analytics-text-secondary);
        }
      }

      /* Content Area */
      .analytics-content {
        --background: var(--analytics-bg);
      }

      .analytics-container {
        min-height: 100%;
        padding: var(--analytics-spacing-md);
        padding-bottom: calc(80px + env(safe-area-inset-bottom, 0));
      }

      /* ============================================
         METRIC CARDS GRID
         ============================================ */

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--analytics-spacing-md);
        margin-bottom: var(--analytics-spacing-lg);
      }

      @media (min-width: 768px) {
        .metrics-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .metric-card {
        background: var(--analytics-surface);
        border: 1px solid var(--analytics-border);
        border-radius: var(--analytics-radius-lg);
        padding: var(--analytics-spacing-md);
        display: flex;
        flex-direction: column;
        gap: var(--analytics-spacing-xs);
        transition: all 0.2s ease;

        &:hover {
          background: var(--analytics-surface-elevated);
          border-color: var(--analytics-border-strong);
        }
      }

      .metric-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--analytics-radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--analytics-surface-elevated);
        color: var(--analytics-primary);
        margin-bottom: var(--analytics-spacing-xs);
      }

      /* Card color variants */
      .metric-card--primary .metric-icon {
        background: rgba(204, 255, 0, 0.15);
        color: var(--analytics-primary);
      }

      .metric-card--success .metric-icon {
        background: rgba(34, 197, 94, 0.15);
        color: var(--analytics-success);
      }

      .metric-card--warning .metric-icon {
        background: rgba(245, 158, 11, 0.15);
        color: var(--analytics-warning);
      }

      .metric-card--info .metric-icon {
        background: rgba(59, 130, 246, 0.15);
        color: var(--analytics-info);
      }

      .metric-value {
        font-size: 28px;
        font-weight: 700;
        color: var(--analytics-text-primary);
        line-height: 1.1;
      }

      .metric-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--analytics-text-secondary);
      }

      .metric-trend {
        display: flex;
        align-items: center;
        gap: var(--analytics-spacing-xs);
        font-size: 12px;
        font-weight: 600;
        margin-top: var(--analytics-spacing-xs);

        &.trend-up {
          color: var(--analytics-success);
        }

        &.trend-down {
          color: var(--analytics-error);
        }

        &.trend-stable {
          color: var(--analytics-text-tertiary);
        }
      }

      .trend-label {
        font-weight: 400;
        color: var(--analytics-text-tertiary);
      }

      /* ============================================
         SECTIONS
         ============================================ */

      .analytics-section {
        padding-bottom: var(--analytics-spacing-lg);
      }

      .section-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--analytics-text-primary);
        margin: 0 0 var(--analytics-spacing-md) 0;
      }

      /* ============================================
         INSIGHTS
         ============================================ */

      .insights-section {
        margin-bottom: var(--analytics-spacing-lg);
      }

      .insights-list {
        display: flex;
        flex-direction: column;
        gap: var(--analytics-spacing-sm);
      }

      .insight-card {
        display: flex;
        align-items: flex-start;
        gap: var(--analytics-spacing-md);
        background: var(--analytics-surface);
        border: 1px solid var(--analytics-border);
        border-radius: var(--analytics-radius-md);
        padding: var(--analytics-spacing-md);

        &.insight--positive .insight-icon {
          color: var(--analytics-success);
          background: rgba(34, 197, 94, 0.15);
        }

        &.insight--negative .insight-icon {
          color: var(--analytics-error);
          background: rgba(239, 68, 68, 0.15);
        }

        &.insight--neutral .insight-icon {
          color: var(--analytics-info);
          background: rgba(59, 130, 246, 0.15);
        }

        &.insight--opportunity .insight-icon {
          color: var(--analytics-primary);
          background: rgba(204, 255, 0, 0.15);
        }
      }

      .insight-icon {
        width: 36px;
        height: 36px;
        border-radius: var(--analytics-radius-sm);
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
        font-size: 14px;
        font-weight: 600;
        color: var(--analytics-text-primary);
        margin: 0 0 4px 0;
      }

      .insight-description {
        font-size: 13px;
        color: var(--analytics-text-secondary);
        margin: 0;
        line-height: 1.4;
      }

      .insight-action {
        background: transparent;
        border: 1px solid var(--analytics-primary);
        color: var(--analytics-primary);
        font-size: 12px;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: var(--analytics-radius-sm);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s ease;

        &:hover {
          background: rgba(204, 255, 0, 0.1);
        }
      }

      /* ============================================
         RECOMMENDATIONS
         ============================================ */

      .recommendations-section {
        margin-bottom: var(--analytics-spacing-lg);
      }

      .recommendations-list {
        display: flex;
        flex-direction: column;
        gap: var(--analytics-spacing-sm);
      }

      .recommendation-card {
        display: flex;
        align-items: flex-start;
        gap: var(--analytics-spacing-md);
        background: var(--analytics-surface);
        border: 1px solid var(--analytics-border);
        border-radius: var(--analytics-radius-md);
        padding: var(--analytics-spacing-md);
      }

      .recommendation-priority {
        flex-shrink: 0;
      }

      .priority-badge {
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 4px 8px;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }

      .recommendation--high .priority-badge {
        background: rgba(239, 68, 68, 0.15);
        color: var(--analytics-error);
      }

      .recommendation--medium .priority-badge {
        background: rgba(245, 158, 11, 0.15);
        color: var(--analytics-warning);
      }

      .recommendation--low .priority-badge {
        background: rgba(34, 197, 94, 0.15);
        color: var(--analytics-success);
      }

      .recommendation-content {
        flex: 1;
        min-width: 0;
      }

      .recommendation-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--analytics-text-primary);
        margin: 0 0 4px 0;
      }

      .recommendation-description {
        font-size: 13px;
        color: var(--analytics-text-secondary);
        margin: 0 0 8px 0;
        line-height: 1.4;
      }

      .recommendation-impact {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 500;
        color: var(--analytics-primary);
      }

      .recommendation-action {
        background: var(--analytics-primary);
        border: none;
        color: #000;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 14px;
        border-radius: var(--analytics-radius-sm);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s ease;

        &:hover {
          opacity: 0.9;
        }
      }

      /* ============================================
         SKELETON LOADING
         ============================================ */

      .analytics-skeleton {
        animation: pulse 1.5s infinite ease-in-out;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      .skeleton-section {
        margin-bottom: var(--analytics-spacing-lg);
      }

      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--analytics-spacing-md);
      }

      @media (min-width: 768px) {
        .skeleton-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .skeleton-card {
        background: var(--analytics-surface);
        border-radius: var(--analytics-radius-lg);
        padding: var(--analytics-spacing-md);
      }

      .skeleton-icon {
        width: 40px;
        height: 40px;
        background: var(--analytics-surface-elevated);
        border-radius: var(--analytics-radius-sm);
        margin-bottom: var(--analytics-spacing-sm);
      }

      .skeleton-value {
        width: 60%;
        height: 28px;
        background: var(--analytics-surface-elevated);
        border-radius: 4px;
        margin-bottom: var(--analytics-spacing-xs);
      }

      .skeleton-label {
        width: 80%;
        height: 14px;
        background: var(--analytics-surface-elevated);
        border-radius: 4px;
        margin-bottom: var(--analytics-spacing-xs);
      }

      .skeleton-trend {
        width: 50%;
        height: 12px;
        background: var(--analytics-surface-elevated);
        border-radius: 4px;
      }

      .skeleton-chart {
        background: var(--analytics-surface);
        border-radius: var(--analytics-radius-lg);
        padding: var(--analytics-spacing-md);
      }

      .skeleton-chart-header {
        width: 40%;
        height: 20px;
        background: var(--analytics-surface-elevated);
        border-radius: 4px;
        margin-bottom: var(--analytics-spacing-md);
      }

      .skeleton-chart-area {
        width: 100%;
        height: 200px;
        background: var(--analytics-surface-elevated);
        border-radius: var(--analytics-radius-md);
      }

      .skeleton-list {
        display: flex;
        flex-direction: column;
        gap: var(--analytics-spacing-sm);
      }

      .skeleton-list-item {
        height: 72px;
        background: var(--analytics-surface);
        border-radius: var(--analytics-radius-md);
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
        padding: var(--analytics-spacing-xl) var(--analytics-spacing-md);
        min-height: 300px;
      }

      .error-icon {
        color: var(--analytics-error);
        margin-bottom: var(--analytics-spacing-md);
        opacity: 0.8;
      }

      .error-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--analytics-text-primary);
        margin: 0 0 var(--analytics-spacing-sm) 0;
      }

      .error-message {
        font-size: 14px;
        color: var(--analytics-text-secondary);
        margin: 0 0 var(--analytics-spacing-lg) 0;
        max-width: 280px;
      }

      .error-retry {
        display: inline-flex;
        align-items: center;
        gap: var(--analytics-spacing-sm);
        background: var(--analytics-surface);
        border: 1px solid var(--analytics-border);
        color: var(--analytics-text-primary);
        font-size: 14px;
        font-weight: 500;
        padding: 12px 20px;
        border-radius: var(--analytics-radius-md);
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--analytics-surface-elevated);
          border-color: var(--analytics-border-strong);
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
        padding: var(--analytics-spacing-xl) var(--analytics-spacing-md);
        min-height: 300px;
      }

      .empty-icon {
        color: var(--analytics-text-tertiary);
        margin-bottom: var(--analytics-spacing-md);
        opacity: 0.6;
      }

      .empty-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--analytics-text-primary);
        margin: 0 0 var(--analytics-spacing-sm) 0;
      }

      .empty-message {
        font-size: 14px;
        color: var(--analytics-text-secondary);
        margin: 0;
        max-width: 280px;
        line-height: 1.5;
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
        padding: var(--analytics-spacing-xl) var(--analytics-spacing-md);
        min-height: 200px;
        background: var(--analytics-surface);
        border: 1px dashed var(--analytics-border);
        border-radius: var(--analytics-radius-lg);
        color: var(--analytics-text-tertiary);

        h3 {
          font-size: 16px;
          font-weight: 600;
          color: var(--analytics-text-secondary);
          margin: var(--analytics-spacing-md) 0 var(--analytics-spacing-xs) 0;
        }

        p {
          font-size: 13px;
          margin: 0;
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

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar is clicked (open sidenav) */
  readonly avatarClick = output<void>();

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
    // Initialize analytics with role
    this.analytics.initialize(this.role());
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
