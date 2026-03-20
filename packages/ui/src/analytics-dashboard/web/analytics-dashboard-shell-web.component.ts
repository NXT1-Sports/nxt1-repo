/**
 * @fileoverview Analytics Dashboard Shell — Web (Zero Ionic)
 * @module @nxt1/ui/analytics-dashboard/web
 * @version 2.0.0
 *
 * Web-optimized Analytics Dashboard using design token CSS.
 * 100% SSR-safe with semantic HTML for Grade A+ SEO.
 * Zero Ionic components — pure Angular + design tokens.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * For mobile app, use AnalyticsDashboardShellComponent (Ionic variant) instead.
 *
 * Layout follows the established usage/explore pattern:
 * - `.analytics-main` — background only, NO padding
 * - `.analytics-dashboard` — padding container (matches `.usage-dashboard`)
 * - Desktop page header INSIDE `.analytics-dashboard`
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
import {
  type AnalyticsTabId,
  type AnalyticsPeriod,
  type AnalyticsUserRole,
  type AnalyticsInsight,
  type AnalyticsRecommendation,
  ANALYTICS_PERIODS,
} from '@nxt1/core';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtSectionNavWebComponent } from '../../components/section-nav-web';
import type { SectionNavItem, SectionNavChangeEvent } from '../../components/section-nav-web';
import { NxtIconComponent } from '../../components/icon';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { AnalyticsDashboardService } from '../analytics-dashboard.service';
import { AnalyticsDashboardSkeletonComponent } from '../analytics-dashboard-skeleton.component';
import type { AnalyticsUser } from '../analytics-dashboard-shell.component';

@Component({
  selector: 'nxt1-analytics-dashboard-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtDesktopPageHeaderComponent,
    NxtSectionNavWebComponent,
    NxtIconComponent,
    AnalyticsDashboardSkeletonComponent,
  ],
  template: `
    <!-- Main Content Area (semantic, SSR-safe) -->
    <main class="analytics-main" role="main">
      <div class="analytics-dashboard">
        <!-- Desktop Page Header -->
        <nxt1-desktop-page-header
          title="Analytics"
          subtitle="Track your performance metrics, engagement stats, and growth insights."
          actionLabel="Export"
          actionIcon="download-outline"
          (actionClick)="onExportClick()"
        />

        <!-- Period Selector (pure HTML select, zero Ionic) -->
        <div class="period-bar">
          <label for="analytics-period" class="period-label">Time Period</label>
          <div class="period-select-wrapper">
            <select
              id="analytics-period"
              class="period-select"
              [value]="analytics.selectedPeriod()"
              (change)="onPeriodSelectChange($event)"
              aria-label="Select time period"
            >
              @for (period of periods; track period.id) {
                <option [value]="period.id">{{ period.label }}</option>
              }
            </select>
            <!-- Chevron Icon -->
            <svg
              class="period-chevron"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        <div class="dashboard-layout">
          <nxt1-section-nav-web
            [items]="tabOptions()"
            [activeId]="analytics.activeTab()"
            ariaLabel="Analytics categories"
            (selectionChange)="onTabChange($event)"
          />

          <section
            class="section-content"
            [attr.id]="'section-' + analytics.activeTab()"
            role="tabpanel"
          >
            <!-- Loading State -->
            @if (analytics.isLoading()) {
              <nxt1-analytics-dashboard-skeleton />
            }

            <!-- Error State -->
            @else if (analytics.error()) {
              <div class="analytics-error" role="alert">
                <div class="error-icon">
                  <!-- Alert Circle SVG -->
                  <svg
                    class="error-svg"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 class="error-title">Unable to Load Analytics</h3>
                <p class="error-message">{{ analytics.error() }}</p>
                <button class="error-retry" (click)="onRetry()">
                  <!-- Refresh SVG -->
                  <svg
                    class="retry-svg"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Try Again
                </button>
              </div>
            }

            <!-- Empty State -->
            @else if (analytics.isEmpty()) {
              <div class="analytics-empty">
                <div class="empty-icon">
                  <!-- Chart SVG -->
                  <svg
                    class="empty-svg"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
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
                <section class="analytics-section" aria-label="Overview">
                  <!-- Metric Cards Grid -->
                  <div class="metrics-grid">
                    @for (card of analytics.overviewCards(); track card.id) {
                      <div
                        class="metric-card"
                        [class]="'metric-card--' + (card.variant ?? 'default')"
                      >
                        <div class="metric-icon">
                          <nxt1-icon [name]="card.icon" size="24" />
                        </div>
                        <div class="metric-value">{{ card.displayValue }}</div>
                        <div class="metric-label">{{ card.label }}</div>
                        @if (card.trend) {
                          <div
                            class="metric-trend"
                            [class.trend-up]="card.trend.direction === 'up'"
                            [class.trend-down]="card.trend.direction === 'down'"
                            [class.trend-stable]="card.trend.direction === 'stable'"
                          >
                            @if (card.trend.direction === 'up') {
                              <!-- Trending Up SVG -->
                              <svg
                                class="trend-svg"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                />
                              </svg>
                            } @else if (card.trend.direction === 'down') {
                              <!-- Trending Down SVG -->
                              <svg
                                class="trend-svg"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                                />
                              </svg>
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
                          <div
                            class="recommendation-card"
                            [class]="'recommendation--' + rec.priority"
                          >
                            <div class="recommendation-priority">
                              <span class="priority-badge">{{ rec.priority }}</span>
                            </div>
                            <div class="recommendation-content">
                              <h4 class="recommendation-title">{{ rec.title }}</h4>
                              <p class="recommendation-description">{{ rec.description }}</p>
                              @if (rec.impact) {
                                <span class="recommendation-impact">
                                  <!-- Flash SVG -->
                                  <svg
                                    class="impact-svg"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                  >
                                    <path
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      stroke-width="2"
                                      d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                  </svg>
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
                <section class="analytics-section" aria-label="Engagement">
                  <div class="coming-soon">
                    <!-- Bar Chart SVG -->
                    <svg
                      class="coming-soon-svg"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    <h3>Engagement Analytics</h3>
                    <p>Detailed engagement metrics coming soon</p>
                  </div>
                </section>
              }

              <!-- Content Tab (Athletes) -->
              @if (analytics.activeTab() === 'content') {
                <section class="analytics-section" aria-label="Content performance">
                  <div class="coming-soon">
                    <!-- Video SVG -->
                    <svg
                      class="coming-soon-svg"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <h3>Content Performance</h3>
                    <p>Video and post analytics coming soon</p>
                  </div>
                </section>
              }

              <!-- Recruiting Tab (Athletes) -->
              @if (analytics.activeTab() === 'recruiting') {
                <section class="analytics-section" aria-label="Recruiting analytics">
                  <div class="coming-soon">
                    <!-- Graduation Cap SVG -->
                    <svg
                      class="coming-soon-svg"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
                      />
                    </svg>
                    <h3>Recruiting Analytics</h3>
                    <p>College interest tracking coming soon</p>
                  </div>
                </section>
              }

              <!-- Roster Tab (Coaches) -->
              @if (analytics.activeTab() === 'roster') {
                <section class="analytics-section" aria-label="Roster analytics">
                  <div class="coming-soon">
                    <!-- People SVG -->
                    <svg
                      class="coming-soon-svg"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <h3>Roster Analytics</h3>
                    <p>Team roster performance coming soon</p>
                  </div>
                </section>
              }
            }
          </section>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      /* ============================================
         ANALYTICS DASHBOARD (WEB) — Design Token CSS
         Zero Ionic, SSR-safe, fills web shell layout
         Matches /usage and /explore positioning exactly
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      /* Main container — background only, NO padding (matches .usage-main) */
      .analytics-main {
        background: var(--nxt1-color-bg-primary);
        min-height: 100%;
      }

      /* Dashboard container — padding here (matches .usage-dashboard) */
      .analytics-dashboard {
        padding: 0;
        padding-bottom: var(--nxt1-spacing-16);
      }

      .dashboard-layout {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: var(--nxt1-spacing-6, 24px);
        align-items: start;
        padding-top: var(--nxt1-spacing-2, 8px);
      }

      .section-content {
        min-width: 0;
      }

      /* ============================================
         PERIOD SELECTOR (Pure HTML, Zero Ionic)
         ============================================ */

      .period-bar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .period-label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      .period-select-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      .period-select {
        appearance: none;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-md);
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-8) var(--nxt1-spacing-2)
          var(--nxt1-spacing-3);
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
        min-width: 120px;

        &:hover {
          border-color: var(--nxt1-color-border-default);
        }

        &:focus {
          outline: none;
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 0 2px rgba(204, 255, 0, 0.15);
        }
      }

      .period-chevron {
        position: absolute;
        right: var(--nxt1-spacing-2);
        width: 16px;
        height: 16px;
        color: var(--nxt1-color-text-tertiary);
        pointer-events: none;
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
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
        transition:
          background 0.2s ease,
          border-color 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-border-default);
        }
      }

      .metric-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-borderRadius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-primary);
        margin-bottom: var(--nxt1-spacing-1);
      }

      /* Metric card color variants */
      .metric-card--primary .metric-icon {
        background: rgba(204, 255, 0, 0.12);
        color: var(--nxt1-color-primary);
      }

      .metric-card--success .metric-icon {
        background: rgba(34, 197, 94, 0.12);
        color: var(--nxt1-color-success);
      }

      .metric-card--warning .metric-icon {
        background: rgba(245, 158, 11, 0.12);
        color: var(--nxt1-color-warning);
      }

      .metric-card--info .metric-icon {
        background: rgba(59, 130, 246, 0.12);
        color: var(--nxt1-color-info);
      }

      .metric-value {
        font-size: 28px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        line-height: 1.1;
      }

      .metric-label {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      .metric-trend {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: 12px;
        font-weight: 600;
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

      .trend-svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .trend-label {
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         SECTIONS
         ============================================ */

      .analytics-section {
        padding-bottom: var(--nxt1-spacing-6);
      }

      .section-title {
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
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
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-4);

        &.insight--positive .insight-icon {
          color: var(--nxt1-color-success);
          background: rgba(34, 197, 94, 0.12);
        }

        &.insight--negative .insight-icon {
          color: var(--nxt1-color-error);
          background: rgba(239, 68, 68, 0.12);
        }

        &.insight--neutral .insight-icon {
          color: var(--nxt1-color-info);
          background: rgba(59, 130, 246, 0.12);
        }

        &.insight--opportunity .insight-icon {
          color: var(--nxt1-color-primary);
          background: rgba(204, 255, 0, 0.12);
        }
      }

      .insight-icon {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-borderRadius-sm);
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
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 4px 0;
      }

      .insight-description {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: 1.4;
      }

      .insight-action {
        background: transparent;
        border: 1px solid var(--nxt1-color-primary);
        color: var(--nxt1-color-primary);
        font-size: 12px;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: var(--nxt1-borderRadius-sm);
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.15s ease;

        &:hover {
          background: rgba(204, 255, 0, 0.08);
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
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-4);
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
        background: rgba(239, 68, 68, 0.12);
        color: var(--nxt1-color-error);
      }

      .recommendation--medium .priority-badge {
        background: rgba(245, 158, 11, 0.12);
        color: var(--nxt1-color-warning);
      }

      .recommendation--low .priority-badge {
        background: rgba(34, 197, 94, 0.12);
        color: var(--nxt1-color-success);
      }

      .recommendation-content {
        flex: 1;
        min-width: 0;
      }

      .recommendation-title {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 4px 0;
      }

      .recommendation-description {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
        line-height: 1.4;
      }

      .recommendation-impact {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-primary);
      }

      .impact-svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      .recommendation-action {
        background: var(--nxt1-color-primary);
        border: none;
        color: #000;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 14px;
        border-radius: var(--nxt1-borderRadius-sm);
        cursor: pointer;
        white-space: nowrap;
        transition: opacity 0.15s ease;

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
        margin-bottom: var(--nxt1-spacing-4);
      }

      .error-svg {
        width: 64px;
        height: 64px;
        color: var(--nxt1-color-error);
        opacity: 0.8;
      }

      .error-title {
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .error-message {
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
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        padding: 12px 20px;
        border-radius: var(--nxt1-borderRadius-md);
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-border-default);
        }
      }

      .retry-svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
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
        margin-bottom: var(--nxt1-spacing-4);
      }

      .empty-svg {
        width: 64px;
        height: 64px;
        color: var(--nxt1-color-text-tertiary);
        opacity: 0.6;
      }

      .empty-title {
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .empty-message {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
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
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        min-height: 200px;
        background: var(--nxt1-color-surface-100);
        border: 1px dashed var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        color: var(--nxt1-color-text-tertiary);

        h3 {
          font-size: var(--nxt1-fontSize-base);
          font-weight: 600;
          color: var(--nxt1-color-text-secondary);
          margin: var(--nxt1-spacing-4) 0 var(--nxt1-spacing-1) 0;
        }

        p {
          font-size: var(--nxt1-fontSize-xs);
          margin: 0;
        }
      }

      .coming-soon-svg {
        width: 48px;
        height: 48px;
      }

      @media (max-width: 768px) {
        .analytics-dashboard {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
          padding-bottom: var(--nxt1-spacing-16);
        }

        .dashboard-layout {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-4, 16px);
        }

        .period-bar {
          flex-direction: column;
          align-items: flex-start;
          gap: var(--nxt1-spacing-2);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsDashboardShellWebComponent implements OnInit {
  protected readonly analytics = inject(AnalyticsDashboardService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('AnalyticsDashboardShellWeb');

  // ============================================
  // INPUTS
  // ============================================

  /** User info for header avatar */
  readonly user = input<AnalyticsUser | null>(null);

  /** User role (athlete or coach) */
  readonly role = input<AnalyticsUserRole>('athlete');

  // ============================================
  // OUTPUTS
  // ============================================

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

  /** Tab options for section navigation */
  protected readonly tabOptions = computed((): SectionNavItem[] =>
    this.analytics.availableTabs().map((tab: { id: string; label: string; icon: string }) => ({
      id: tab.id,
      label: tab.label,
    }))
  );

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

  /** Handle tab selection change. */
  protected onTabChange(event: SectionNavChangeEvent): void {
    const tabId = event.id as AnalyticsTabId;
    this.logger.debug('Tab changed', { tabId });
    this.analytics.setActiveTab(tabId);
    this.tabChange.emit(tabId);
  }

  /** Handle native select period change. */
  protected async onPeriodSelectChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const period = select.value as AnalyticsPeriod;
    this.logger.debug('Period changed', { period });
    await this.analytics.setPeriod(period);
    this.periodChange.emit(period);
  }

  /** Handle export button click (desktop header). */
  protected async onExportClick(): Promise<void> {
    await this.haptics.impact('medium');
    this.toast.info('Export feature coming soon');
  }

  /** Handle retry after error. */
  protected async onRetry(): Promise<void> {
    await this.haptics.impact('light');
    await this.analytics.loadReport(this.analytics.selectedPeriod(), true);
  }

  /** Handle insight action click. */
  protected onInsightAction(insight: AnalyticsInsight): void {
    this.logger.debug('Insight action clicked', { id: insight.id });
    this.insightAction.emit(insight);
  }

  /** Handle recommendation action click. */
  protected onRecommendationAction(rec: AnalyticsRecommendation): void {
    this.logger.debug('Recommendation action clicked', { id: rec.id });
    this.recommendationAction.emit(rec);
  }

  // ============================================
  // UTILITY
  // ============================================

  /** Format percent change for display. */
  protected formatPercentChange(value: number): string {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(1)}%`;
  }
}
