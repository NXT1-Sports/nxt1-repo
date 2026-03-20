/**
 * @fileoverview Activity Analytics Panel Component
 * @module @nxt1/ui/activity
 * @version 1.0.0
 *
 * Role-based analytics dashboard embedded inside the Activity shell's
 * Analytics tab. Renders recruiting/engagement charts for athletes and
 * team-wide metrics for coaches — no internal option-scroller, just
 * clean, native period selection and SVG charts.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Athlete view shows:
 *  - Recruiting funnel (profile views, email opens, replies, link clicks,
 *    video watches) as an SVG area/bar chart with period toggle
 *  - NIL opportunity metrics summary cards
 *  - College interest activity list
 *
 * Coach / Director view shows:
 *  - Team-wide overview metric cards (total views, video views,
 *    active athletes, avg engagement)
 *  - Top-performing athlete spotlight
 *  - Profile views trend chart (SVG)
 *
 * @example
 * ```html
 * <nxt1-activity-analytics-panel
 *   [role]="userRole()"
 *   [userId]="user()?.uid"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  inject,
  signal,
  OnInit,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  eyeOutline,
  mailOutline,
  returnUpForwardOutline,
  linkOutline,
  videocamOutline,
  trendingUpOutline,
  trendingDownOutline,
  peopleOutline,
  schoolOutline,
  heartOutline,
  flashOutline,
  starOutline,
  ribbonOutline,
  informationCircleOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  refreshOutline,
  bulbOutline,
  pricetagOutline,
  cashOutline,
  businessOutline,
  removeOutline,
  analyticsOutline,
} from 'ionicons/icons';
import type { AnalyticsUserRole, AnalyticsPeriod } from '@nxt1/core';
import { isTeamRole } from '@nxt1/core';
import { NxtIconComponent } from '../components/icon';
import { AnalyticsDashboardService } from '../analytics-dashboard/analytics-dashboard.service';

const PERIOD_OPTS: { id: AnalyticsPeriod; label: string }[] = [
  { id: 'week', label: '7D' },
  { id: 'month', label: '30D' },
  { id: 'quarter', label: '90D' },
  { id: 'year', label: '1Y' },
];

// ============================================
// CHART HELPERS
// ============================================

/** Convert raw data-point values to SVG coordinates in the given viewport. */
function toSvgPoints(values: number[], width: number, height: number): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const max = Math.max(...values) || 1;
  const min = Math.min(...values);
  const range = max - min || 1;
  return values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 8) - 4,
  }));
}

function buildPolyline(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function buildAreaPath(pts: { x: number; y: number }[], height: number): string {
  if (pts.length === 0) return '';
  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  return `${line} L${pts[pts.length - 1].x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z`;
}

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-activity-analytics-panel',
  standalone: true,
  imports: [CommonModule, IonIcon, IonSpinner, NxtIconComponent],
  template: `
    <div class="analytics-panel">
      <!-- ── Period Selector ─────────────────── -->
      <div class="period-row" role="group" aria-label="Select time period">
        @for (p of periodOpts; track p.id) {
          <button
            type="button"
            class="period-btn"
            [class.period-btn--active]="selectedPeriod() === p.id"
            (click)="onPeriod(p.id)"
            [attr.aria-pressed]="selectedPeriod() === p.id"
          >
            {{ p.label }}
          </button>
        }
      </div>

      <!-- ── Loading ──────────────────────────── -->
      @if (analytics.isLoading()) {
        <div class="panel-loading">
          <ion-spinner name="crescent" color="primary" />
          <p class="panel-loading__text">Loading analytics…</p>
        </div>
      }

      <!-- ── Error ──────────────────────────── -->
      @else if (analytics.error()) {
        <div class="panel-error">
          <div class="panel-error__icon">
            <ion-icon name="alert-circle-outline" />
          </div>
          <p class="panel-error__msg">{{ analytics.error() }}</p>
          <button type="button" class="panel-error__retry" (click)="onRetry()">
            <ion-icon name="refresh-outline" />
            Try Again
          </button>
        </div>
      }

      <!-- ── Athlete / Parent View ──────────── -->
      @else if (!isCoachView()) {
        <!-- Overview KPI cards -->
        <div class="kpi-grid">
          @for (kpi of athleteKpis(); track kpi.id) {
            <div class="kpi-card" [class]="'kpi-card--' + kpi.color">
              <div class="kpi-icon">
                <ion-icon [name]="kpi.icon" />
              </div>
              <div class="kpi-body">
                <span class="kpi-value">{{ kpi.value }}</span>
                <span class="kpi-label">{{ kpi.label }}</span>
              </div>
              @if (kpi.trend !== null) {
                <div
                  class="kpi-trend"
                  [class.kpi-trend--up]="kpi.trend > 0"
                  [class.kpi-trend--down]="kpi.trend < 0"
                >
                  <ion-icon
                    [name]="
                      kpi.trend > 0
                        ? 'trending-up-outline'
                        : kpi.trend < 0
                          ? 'trending-down-outline'
                          : 'remove-outline'
                    "
                  />
                  <span>{{ kpi.trend > 0 ? '+' : '' }}{{ kpi.trend }}%</span>
                </div>
              }
            </div>
          }
        </div>

        <!-- Recruiting Funnel Chart -->
        <div class="chart-card">
          <div class="chart-card__header">
            <span class="chart-card__title">Recruiting Funnel</span>
            <span class="chart-card__subtitle">{{ periodLabel() }}</span>
          </div>
          <div class="funnel-bars">
            @for (bar of recruitingFunnelBars(); track bar.id) {
              <div class="funnel-row">
                <span class="funnel-label">{{ bar.label }}</span>
                <div class="funnel-track">
                  <div
                    class="funnel-fill"
                    [style.width.%]="bar.pct"
                    [class]="'funnel-fill--' + bar.color"
                  ></div>
                </div>
                <span class="funnel-count">{{ bar.value }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Profile Views Trend (SVG area chart) -->
        <div class="chart-card">
          <div class="chart-card__header">
            <span class="chart-card__title">Profile Views</span>
            <span class="chart-card__subtitle">{{ periodLabel() }}</span>
          </div>
          <div class="chart-area-wrap">
            <svg
              class="area-chart"
              viewBox="0 0 300 80"
              preserveAspectRatio="none"
              aria-label="Profile views over time"
              role="img"
            >
              <defs>
                <linearGradient id="apc-grad-views" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" class="grad-start" />
                  <stop offset="100%" class="grad-end" />
                </linearGradient>
              </defs>
              <!-- Grid lines -->
              <line x1="0" y1="20" x2="300" y2="20" class="chart-grid" />
              <line x1="0" y1="40" x2="300" y2="40" class="chart-grid" />
              <line x1="0" y1="60" x2="300" y2="60" class="chart-grid" />
              <!-- Area fill -->
              @if (profileViewsArea()) {
                <path [attr.d]="profileViewsArea()" fill="url(#apc-grad-views)" />
              }
              <!-- Line -->
              @if (profileViewsLine()) {
                <polyline [attr.points]="profileViewsLine()" class="chart-line" fill="none" />
              }
              <!-- Dots -->
              @for (pt of profileViewsPts(); track $index) {
                <circle [attr.cx]="pt.x" [attr.cy]="pt.y" r="2.5" class="chart-dot" />
              }
              <!-- X-axis labels -->
              @for (lbl of viewsChartLabels(); track $index) {
                <text
                  [attr.x]="($index / (viewsChartLabels().length - 1)) * 300"
                  y="78"
                  class="chart-x-label"
                  text-anchor="middle"
                >
                  {{ lbl }}
                </text>
              }
            </svg>
          </div>
        </div>

        <!-- NIL Metrics Section -->
        <div class="section-header">
          <ion-icon name="pricetag-outline" class="section-header__icon" />
          <span class="section-header__title">NIL Activity</span>
        </div>
        <div class="kpi-grid kpi-grid--nil">
          @for (n of nilKpis(); track n.id) {
            <div class="kpi-card kpi-card--accent">
              <div class="kpi-icon">
                <ion-icon [name]="n.icon" />
              </div>
              <div class="kpi-body">
                <span class="kpi-value">{{ n.value }}</span>
                <span class="kpi-label">{{ n.label }}</span>
              </div>
            </div>
          }
        </div>

        <!-- College Interest Activity -->
        <div class="section-header">
          <ion-icon name="school-outline" class="section-header__icon" />
          <span class="section-header__title">College Interest</span>
        </div>
        <div class="college-list">
          @for (c of collegeInterests(); track c.collegeId; let last = $last) {
            <div class="college-row" [class.college-row--last]="last">
              <div class="college-avatar">
                <ion-icon name="school-outline" />
              </div>
              <div class="college-info">
                <span class="college-name">{{ c.collegeName }}</span>
                <span class="college-div">{{ c.division }}</span>
              </div>
              <div class="college-meta">
                <span class="college-views">{{ c.profileViews }} views</span>
                @if (c.contacted) {
                  <span class="college-badge college-badge--contacted">Contacted</span>
                }
              </div>
            </div>
          }
          @if (collegeInterests().length === 0) {
            <p class="empty-sub">No college views recorded yet.</p>
          }
        </div>
      }

      <!-- ── Coach / Director View ──────────── -->
      @else {
        <!-- Team KPI cards -->
        <div class="kpi-grid">
          @for (kpi of coachKpis(); track kpi.id) {
            <div class="kpi-card" [class]="'kpi-card--' + kpi.color">
              <div class="kpi-icon">
                <ion-icon [name]="kpi.icon" />
              </div>
              <div class="kpi-body">
                <span class="kpi-value">{{ kpi.value }}</span>
                <span class="kpi-label">{{ kpi.label }}</span>
              </div>
              @if (kpi.trend !== null) {
                <div
                  class="kpi-trend"
                  [class.kpi-trend--up]="kpi.trend > 0"
                  [class.kpi-trend--down]="kpi.trend < 0"
                >
                  <ion-icon
                    [name]="
                      kpi.trend > 0
                        ? 'trending-up-outline'
                        : kpi.trend < 0
                          ? 'trending-down-outline'
                          : 'remove-outline'
                    "
                  />
                  <span>{{ kpi.trend > 0 ? '+' : '' }}{{ kpi.trend }}%</span>
                </div>
              }
            </div>
          }
        </div>

        <!-- Team Views Trend (SVG area chart) -->
        <div class="chart-card">
          <div class="chart-card__header">
            <span class="chart-card__title">Team Profile Views</span>
            <span class="chart-card__subtitle">{{ periodLabel() }}</span>
          </div>
          <div class="chart-area-wrap">
            <svg
              class="area-chart"
              viewBox="0 0 300 80"
              preserveAspectRatio="none"
              aria-label="Team profile views over time"
              role="img"
            >
              <defs>
                <linearGradient id="apc-grad-team" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" class="grad-start-team" />
                  <stop offset="100%" class="grad-end-team" />
                </linearGradient>
              </defs>
              <line x1="0" y1="20" x2="300" y2="20" class="chart-grid" />
              <line x1="0" y1="40" x2="300" y2="40" class="chart-grid" />
              <line x1="0" y1="60" x2="300" y2="60" class="chart-grid" />
              @if (teamViewsArea()) {
                <path [attr.d]="teamViewsArea()" fill="url(#apc-grad-team)" />
              }
              @if (teamViewsLine()) {
                <polyline [attr.points]="teamViewsLine()" class="chart-line-team" fill="none" />
              }
              @for (pt of teamViewsPts(); track $index) {
                <circle [attr.cx]="pt.x" [attr.cy]="pt.y" r="2.5" class="chart-dot-team" />
              }
              @for (lbl of teamChartLabels(); track $index) {
                <text
                  [attr.x]="($index / (teamChartLabels().length - 1)) * 300"
                  y="78"
                  class="chart-x-label"
                  text-anchor="middle"
                >
                  {{ lbl }}
                </text>
              }
            </svg>
          </div>
        </div>

        <!-- Top Performer Spotlight -->
        @if (analytics.coachReport()?.topPerformer) {
          <div class="section-header">
            <ion-icon name="star-outline" class="section-header__icon" />
            <span class="section-header__title">Top Performer</span>
          </div>
          <div class="spotlight-card">
            <div class="spotlight-avatar">
              @if (analytics.coachReport()?.topPerformer?.athlete?.profileImg) {
                <img
                  [src]="analytics.coachReport()!.topPerformer!.athlete.profileImg"
                  [alt]="analytics.coachReport()!.topPerformer!.athlete.name"
                  class="spotlight-img"
                />
              } @else {
                <ion-icon name="person-outline" class="spotlight-avatar__icon" />
              }
            </div>
            <div class="spotlight-info">
              <span class="spotlight-name">{{
                analytics.coachReport()!.topPerformer!.athlete.name
              }}</span>
              <span class="spotlight-pos">{{
                analytics.coachReport()!.topPerformer!.athlete.position ?? 'Athlete'
              }}</span>
              <div class="spotlight-highlights">
                @for (h of analytics.coachReport()!.topPerformer!.highlights; track $index) {
                  <span class="highlight-chip">{{ h }}</span>
                }
              </div>
            </div>
            <div class="spotlight-stat">
              <span class="spotlight-multiplier"
                >{{ analytics.coachReport()!.topPerformer!.vsTeamAverage.toFixed(1) }}×</span
              >
              <span class="spotlight-multiplier-label">vs avg</span>
            </div>
          </div>
        }

        <!-- Roster Leaderboard -->
        <div class="section-header">
          <ion-icon name="people-outline" class="section-header__icon" />
          <span class="section-header__title">Athlete Activity</span>
        </div>
        <div class="roster-list">
          @for (a of rosterTop(); track a.athleteId; let i = $index; let last = $last) {
            <div class="roster-row" [class.roster-row--last]="last">
              <span class="roster-rank">#{{ i + 1 }}</span>
              <div class="roster-info">
                <span class="roster-name">{{ a.name }}</span>
                <span class="roster-pos">{{ a.position ?? 'Athlete' }}</span>
              </div>
              <div class="roster-stats">
                <span class="roster-stat">
                  <ion-icon name="eye-outline" class="roster-stat__icon" />
                  {{ a.profileViews.toLocaleString() }}
                </span>
                <span class="roster-stat">
                  <ion-icon name="videocam-outline" class="roster-stat__icon" />
                  {{ a.videoViews.toLocaleString() }}
                </span>
              </div>
            </div>
          }
          @if (rosterTop().length === 0) {
            <p class="empty-sub">No athlete data available yet.</p>
          }
        </div>
      }

      <!-- ── AI Insights (all roles) ────────── -->
      @if (analytics.insights().length > 0) {
        <div class="section-header">
          <ion-icon name="bulb-outline" class="section-header__icon" />
          <span class="section-header__title">AI Insights</span>
        </div>
        <div class="insights-list">
          @for (ins of analytics.insights().slice(0, 3); track ins.id) {
            <div class="insight-card">
              <div class="insight-icon">
                <ion-icon [name]="ins.icon" />
              </div>
              <div class="insight-body">
                <span class="insight-title">{{ ins.title }}</span>
                <span class="insight-desc">{{ ins.description }}</span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         ANALYTICS PANEL
         ============================================ */

      :host {
        display: block;
      }

      .analytics-panel {
        padding: 0 16px 40px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* ── Period Row ────────────────────────── */

      .period-row {
        display: flex;
        gap: 8px;
        padding: 4px 0 2px;
      }

      .period-btn {
        flex: 1;
        padding: 7px 0;
        border-radius: 10px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        font-family: inherit;
      }

      .period-btn--active {
        background: var(--nxt1-color-primary, #ccff00);
        border-color: var(--nxt1-color-primary, #ccff00);
        color: #000;
        font-weight: 700;
      }

      /* ── Loading / Error ───────────────────── */

      .panel-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 40px 0;
      }

      .panel-loading__text {
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        margin: 0;
      }

      .panel-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 40px 16px;
        text-align: center;
      }

      .panel-error__icon {
        font-size: 40px;
        color: var(--nxt1-color-error, #ef4444);
      }

      .panel-error__msg {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0;
      }

      .panel-error__retry {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 24px;
        border-radius: 20px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        color: var(--nxt1-color-text-primary, #fff);
        font-size: 14px;
        cursor: pointer;
        font-family: inherit;
      }

      /* ── KPI Cards ─────────────────────────── */

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }

      .kpi-grid--nil {
        grid-template-columns: repeat(2, 1fr);
      }

      .kpi-card {
        border-radius: 14px;
        padding: 14px 14px 12px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        display: flex;
        flex-direction: column;
        gap: 4px;
        position: relative;
      }

      .kpi-card--primary {
        border-color: rgba(204, 255, 0, 0.2);
        background: rgba(204, 255, 0, 0.04);
      }

      .kpi-card--info {
        border-color: rgba(59, 130, 246, 0.2);
        background: rgba(59, 130, 246, 0.04);
      }

      .kpi-card--success {
        border-color: rgba(34, 197, 94, 0.2);
        background: rgba(34, 197, 94, 0.04);
      }

      .kpi-card--warning {
        border-color: rgba(245, 158, 11, 0.2);
        background: rgba(245, 158, 11, 0.04);
      }

      .kpi-card--accent {
        border-color: rgba(168, 85, 247, 0.2);
        background: rgba(168, 85, 247, 0.04);
      }

      .kpi-card--default {
        /* uses base styles */
      }

      .kpi-icon {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        line-height: 1;
      }

      .kpi-card--primary .kpi-icon {
        color: var(--nxt1-color-primary, #ccff00);
      }
      .kpi-card--info .kpi-icon {
        color: var(--nxt1-color-info, #3b82f6);
      }
      .kpi-card--success .kpi-icon {
        color: var(--nxt1-color-success, #22c55e);
      }
      .kpi-card--warning .kpi-icon {
        color: var(--nxt1-color-warning, #f59e0b);
      }
      .kpi-card--accent .kpi-icon {
        color: #a855f7;
      }

      .kpi-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .kpi-value {
        font-size: 22px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        line-height: 1.1;
      }

      .kpi-label {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .kpi-trend {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .kpi-trend--up {
        color: var(--nxt1-color-success, #22c55e);
      }
      .kpi-trend--down {
        color: var(--nxt1-color-error, #ef4444);
      }

      /* ── Chart Card ────────────────────────── */

      .chart-card {
        border-radius: 16px;
        padding: 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .chart-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }

      .chart-card__title {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .chart-card__subtitle {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .chart-area-wrap {
        height: 90px;
        position: relative;
      }

      .area-chart {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
      }

      .chart-grid {
        stroke: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        stroke-width: 0.5;
        stroke-dasharray: 4 4;
      }

      .grad-start {
        stop-color: #ccff00;
        stop-opacity: 0.35;
      }
      .grad-end {
        stop-color: #ccff00;
        stop-opacity: 0;
      }
      .grad-start-team {
        stop-color: #3b82f6;
        stop-opacity: 0.35;
      }
      .grad-end-team {
        stop-color: #3b82f6;
        stop-opacity: 0;
      }

      .chart-line {
        stroke: var(--nxt1-color-primary, #ccff00);
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .chart-line-team {
        stroke: var(--nxt1-color-info, #3b82f6);
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .chart-dot {
        fill: var(--nxt1-color-primary, #ccff00);
        stroke: var(--nxt1-color-bg-primary, #0a0a0a);
        stroke-width: 1.5;
      }

      .chart-dot-team {
        fill: var(--nxt1-color-info, #3b82f6);
        stroke: var(--nxt1-color-bg-primary, #0a0a0a);
        stroke-width: 1.5;
      }

      .chart-x-label {
        font-size: 7px;
        fill: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.35));
        font-family: inherit;
      }

      /* ── Funnel Bars ───────────────────────── */

      .funnel-bars {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .funnel-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .funnel-label {
        width: 72px;
        flex-shrink: 0;
        font-size: 11px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
        text-align: right;
      }

      .funnel-track {
        flex: 1;
        height: 8px;
        border-radius: 4px;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        overflow: hidden;
      }

      .funnel-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.4s ease;
      }

      .funnel-fill--primary {
        background: var(--nxt1-color-primary, #ccff00);
      }
      .funnel-fill--info {
        background: var(--nxt1-color-info, #3b82f6);
      }
      .funnel-fill--success {
        background: var(--nxt1-color-success, #22c55e);
      }
      .funnel-fill--warning {
        background: var(--nxt1-color-warning, #f59e0b);
      }
      .funnel-fill--accent {
        background: #a855f7;
      }

      .funnel-count {
        width: 44px;
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        text-align: right;
      }

      /* ── Section Header ────────────────────── */

      .section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        margin-bottom: -6px;
      }

      .section-header__icon {
        font-size: 16px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .section-header__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      /* ── College List ──────────────────────── */

      .college-list {
        border-radius: 16px;
        overflow: hidden;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .college-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      .college-row--last {
        border-bottom: none;
      }

      .college-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .college-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .college-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .college-div {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .college-meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        flex-shrink: 0;
      }

      .college-views {
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
      }

      .college-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 20px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .college-badge--contacted {
        background: rgba(34, 197, 94, 0.15);
        color: var(--nxt1-color-success, #22c55e);
      }

      /* ── Roster List ───────────────────────── */

      .roster-list {
        border-radius: 16px;
        overflow: hidden;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .roster-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 14px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      .roster-row--last {
        border-bottom: none;
      }

      .roster-rank {
        width: 22px;
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.35));
        flex-shrink: 0;
        text-align: center;
      }

      .roster-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .roster-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .roster-pos {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .roster-stats {
        display: flex;
        gap: 12px;
        flex-shrink: 0;
      }

      .roster-stat {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
      }

      .roster-stat__icon {
        font-size: 13px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.35));
      }

      /* ── Spotlight Card ────────────────────── */

      .spotlight-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
        border-radius: 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .spotlight-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
      }

      .spotlight-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      }

      .spotlight-avatar__icon {
        font-size: 24px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .spotlight-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }

      .spotlight-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .spotlight-pos {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .spotlight-highlights {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
      }

      .highlight-chip {
        font-size: 10px;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 20px;
        background: rgba(204, 255, 0, 0.1);
        color: var(--nxt1-color-primary, #ccff00);
        border: 1px solid rgba(204, 255, 0, 0.2);
      }

      .spotlight-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
      }

      .spotlight-multiplier {
        font-size: 20px;
        font-weight: 800;
        color: var(--nxt1-color-primary, #ccff00);
        line-height: 1.1;
      }

      .spotlight-multiplier-label {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* ── AI Insights ───────────────────────── */

      .insights-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .insight-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px;
        border-radius: 14px;
        background: rgba(204, 255, 0, 0.04);
        border: 1px solid rgba(204, 255, 0, 0.12);
      }

      .insight-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: rgba(204, 255, 0, 0.12);
        color: var(--nxt1-color-primary, #ccff00);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
      }

      .insight-body {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex: 1;
      }

      .insight-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .insight-desc {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
        line-height: 1.45;
      }

      /* ── Empty sub-message ─────────────────── */

      .empty-sub {
        font-size: 13px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        margin: 16px;
        text-align: center;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityAnalyticsPanelComponent implements OnInit {
  protected readonly analytics = inject(AnalyticsDashboardService);

  // ============================================
  // INPUTS
  // ============================================

  /** User role determines which analytics view to render */
  readonly role = input<AnalyticsUserRole>('athlete');

  /** UID used to initialise AnalyticsDashboardService */
  readonly userId = input<string | null | undefined>(null);

  // ============================================
  // LOCAL STATE
  // ============================================

  protected readonly selectedPeriod = signal<AnalyticsPeriod>('week');
  protected readonly periodOpts = PERIOD_OPTS;

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly isCoachView = computed(() => isTeamRole(this.role()));

  protected readonly periodLabel = computed(() => {
    const found = PERIOD_OPTS.find((p) => p.id === this.selectedPeriod());
    const map: Record<string, string> = {
      week: 'Last 7 Days',
      month: 'Last 30 Days',
      quarter: 'Last 90 Days',
      year: 'Last Year',
    };
    return found ? (map[found.id] ?? found.label) : 'Last 7 Days';
  });

  // ── Athlete KPIs ──────────────────────────

  protected readonly athleteKpis = computed(() => {
    const r = this.analytics.athleteReport();
    if (!r) return FALLBACK_ATHLETE_KPIS;
    const ov = r.overview;
    return [
      {
        id: 'profile-views',
        label: 'Profile Views',
        value: fmt(ov.profileViews.value as number),
        icon: 'eye-outline',
        color: 'primary',
        trend: ov.profileViews.trend?.percentChange ?? null,
      },
      {
        id: 'video-views',
        label: 'Video Views',
        value: fmt(ov.videoViews.value as number),
        icon: 'videocam-outline',
        color: 'info',
        trend: ov.videoViews.trend?.percentChange ?? null,
      },
      {
        id: 'coach-views',
        label: 'Coach Views',
        value: fmt(ov.collegeCoachViews.value as number),
        icon: 'school-outline',
        color: 'success',
        trend: ov.collegeCoachViews.trend?.percentChange ?? null,
      },
      {
        id: 'engagement',
        label: 'Engagement',
        value: `${(ov.engagementRate.value as number).toFixed(1)}%`,
        icon: 'heart-outline',
        color: 'warning',
        trend: ov.engagementRate.trend?.percentChange ?? null,
      },
    ];
  });

  // ── Recruiting Funnel Bars ────────────────

  protected readonly recruitingFunnelBars = computed(() => {
    const r = this.analytics.athleteReport();
    if (!r) return FALLBACK_FUNNEL;
    const ov = r.overview;
    const pv = ov.profileViews.value as number;
    const vv = ov.videoViews.value as number;
    const cv = ov.collegeCoachViews.value as number;
    const rec = r.recruiting;
    const emailsSent = rec.emailCampaigns.reduce((s, c) => s + c.sent, 0);
    const emailReplies = rec.emailCampaigns.reduce((s, c) => s + c.responses, 0);
    const linkClicks = rec.emailCampaigns.reduce((s, c) => s + c.clicks, 0);
    const max = Math.max(pv, vv, cv, emailsSent, emailReplies, linkClicks, 1);
    return [
      { id: 'pv', label: 'Profile Views', value: fmt(pv), pct: (pv / max) * 100, color: 'primary' },
      { id: 'vv', label: 'Video Watches', value: fmt(vv), pct: (vv / max) * 100, color: 'info' },
      { id: 'cv', label: 'Coach Views', value: fmt(cv), pct: (cv / max) * 100, color: 'success' },
      {
        id: 'es',
        label: 'Emails Sent',
        value: fmt(emailsSent),
        pct: (emailsSent / max) * 100,
        color: 'warning',
      },
      {
        id: 'lc',
        label: 'Link Clicks',
        value: fmt(linkClicks),
        pct: (linkClicks / max) * 100,
        color: 'accent',
      },
      {
        id: 'er',
        label: 'Replies',
        value: fmt(emailReplies),
        pct: (emailReplies / max) * 100,
        color: 'accent',
      },
    ];
  });

  // ── Profile Views Chart ───────────────────

  protected readonly profileViewsPts = computed(() => {
    const r = this.analytics.athleteReport();
    const data = r?.engagement?.viewsOverTime?.datasets?.[0]?.data;
    if (!data || data.length < 2) return [] as { x: number; y: number }[];
    return toSvgPoints(
      data.map((d) => d.value),
      300,
      68
    );
  });

  protected readonly profileViewsLine = computed(() => {
    const pts = this.profileViewsPts();
    return pts.length >= 2 ? buildPolyline(pts) : null;
  });

  protected readonly profileViewsArea = computed(() => {
    const pts = this.profileViewsPts();
    return pts.length >= 2 ? buildAreaPath(pts, 68) : null;
  });

  protected readonly viewsChartLabels = computed(() => {
    const r = this.analytics.athleteReport();
    const data = r?.engagement?.viewsOverTime?.datasets?.[0]?.data;
    return data ? data.map((d) => d.label) : [];
  });

  // ── NIL Metrics ───────────────────────────

  protected readonly nilKpis = computed(() => {
    const r = this.analytics.athleteReport();
    if (!r) return FALLBACK_NIL;
    const followers = r.overview.followers.value as number;
    const eng = r.overview.engagementRate.value as number;
    return [
      {
        id: 'nil-reach',
        label: 'Social Reach',
        value: fmt(followers),
        icon: 'people-outline',
      },
      {
        id: 'nil-eng',
        label: 'Engagement Rate',
        value: `${eng.toFixed(1)}%`,
        icon: 'heart-outline',
      },
      {
        id: 'nil-offers',
        label: 'NIL Opportunities',
        value: String(r.recruiting.offersReceived),
        icon: 'pricetag-outline',
      },
      {
        id: 'nil-score',
        label: 'Profile Score',
        value: String(r.overview.profileScore.value),
        icon: 'star-outline',
      },
    ];
  });

  // ── College Interests ─────────────────────

  protected readonly collegeInterests = computed(() => {
    const r = this.analytics.athleteReport();
    return (r?.recruiting?.collegeInterests ?? []).slice(0, 5);
  });

  // ── Coach KPIs ────────────────────────────

  protected readonly coachKpis = computed(() => {
    const r = this.analytics.coachReport();
    if (!r) return FALLBACK_COACH_KPIS;
    const ov = r.overviewCards;
    return [
      {
        id: 'total-views',
        label: 'Total Views',
        value: fmt(ov.totalViews.value as number),
        icon: 'eye-outline',
        color: 'primary',
        trend: ov.totalViews.trend?.percentChange ?? null,
      },
      {
        id: 'team-page',
        label: 'Team Page Views',
        value: fmt(ov.teamPageViews.value as number),
        icon: 'business-outline',
        color: 'info',
        trend: ov.teamPageViews.trend?.percentChange ?? null,
      },
      {
        id: 'active-athletes',
        label: 'Active Athletes',
        value: String(ov.activeAthletes.value),
        icon: 'flash-outline',
        color: 'success',
        trend: null,
      },
      {
        id: 'avg-eng',
        label: 'Avg Engagement',
        value: fmt(ov.avgEngagement.value as number),
        icon: 'heart-outline',
        color: 'warning',
        trend: ov.avgEngagement.trend?.percentChange ?? null,
      },
    ];
  });

  // ── Team Views Chart ──────────────────────

  protected readonly teamViewsPts = computed(() => {
    const r = this.analytics.coachReport();
    const data = r?.patterns?.viewsOverTime?.datasets?.[0]?.data;
    if (!data || data.length < 2) return [] as { x: number; y: number }[];
    return toSvgPoints(
      data.map((d) => d.value),
      300,
      68
    );
  });

  protected readonly teamViewsLine = computed(() => {
    const pts = this.teamViewsPts();
    return pts.length >= 2 ? buildPolyline(pts) : null;
  });

  protected readonly teamViewsArea = computed(() => {
    const pts = this.teamViewsPts();
    return pts.length >= 2 ? buildAreaPath(pts, 68) : null;
  });

  protected readonly teamChartLabels = computed(() => {
    const r = this.analytics.coachReport();
    const data = r?.patterns?.viewsOverTime?.datasets?.[0]?.data;
    return data ? data.map((d) => d.label) : [];
  });

  // ── Roster leaderboard ────────────────────

  protected readonly rosterTop = computed(() => {
    const r = this.analytics.coachReport();
    return (r?.roster ?? [])
      .slice()
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, 8);
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    addIcons({
      eyeOutline,
      mailOutline,
      returnUpForwardOutline,
      linkOutline,
      videocamOutline,
      trendingUpOutline,
      trendingDownOutline,
      peopleOutline,
      schoolOutline,
      heartOutline,
      flashOutline,
      starOutline,
      ribbonOutline,
      informationCircleOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      refreshOutline,
      bulbOutline,
      pricetagOutline,
      cashOutline,
      businessOutline,
      removeOutline,
      analyticsOutline,
    });
    // Reinitialise when role input changes
    effect(() => {
      const role = this.role();
      const uid = this.userId() ?? undefined;
      void this.analytics.initialize(role, uid);
    });
  }

  ngOnInit(): void {
    // Handled in constructor effect
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onPeriod(period: AnalyticsPeriod): void {
    this.selectedPeriod.set(period);
    void this.analytics.setPeriod(period);
  }

  protected onRetry(): void {
    void this.analytics.loadReport(this.selectedPeriod(), true);
  }
}

// ============================================
// HELPERS
// ============================================

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Fallback data shown before the first API response ─────────────

const FALLBACK_ATHLETE_KPIS = [
  {
    id: 'pv',
    label: 'Profile Views',
    value: '—',
    icon: 'eye-outline',
    color: 'primary',
    trend: null,
  },
  {
    id: 'vv',
    label: 'Video Views',
    value: '—',
    icon: 'videocam-outline',
    color: 'info',
    trend: null,
  },
  {
    id: 'cv',
    label: 'Coach Views',
    value: '—',
    icon: 'school-outline',
    color: 'success',
    trend: null,
  },
  {
    id: 'en',
    label: 'Engagement',
    value: '—',
    icon: 'heart-outline',
    color: 'warning',
    trend: null,
  },
];

const FALLBACK_FUNNEL = [
  { id: 'pv', label: 'Profile Views', value: '—', pct: 0, color: 'primary' },
  { id: 'vv', label: 'Video Watches', value: '—', pct: 0, color: 'info' },
  { id: 'cv', label: 'Coach Views', value: '—', pct: 0, color: 'success' },
  { id: 'es', label: 'Emails Sent', value: '—', pct: 0, color: 'warning' },
  { id: 'lc', label: 'Link Clicks', value: '—', pct: 0, color: 'accent' },
  { id: 'er', label: 'Replies', value: '—', pct: 0, color: 'accent' },
];

const FALLBACK_NIL = [
  { id: 'r', label: 'Social Reach', value: '—', icon: 'people-outline' },
  { id: 'e', label: 'Engagement Rate', value: '—', icon: 'heart-outline' },
  { id: 'o', label: 'NIL Opportunities', value: '—', icon: 'pricetag-outline' },
  { id: 's', label: 'Profile Score', value: '—', icon: 'star-outline' },
];

const FALLBACK_COACH_KPIS = [
  {
    id: 'tv',
    label: 'Total Views',
    value: '—',
    icon: 'eye-outline',
    color: 'primary',
    trend: null,
  },
  {
    id: 'tp',
    label: 'Team Page Views',
    value: '—',
    icon: 'business-outline',
    color: 'info',
    trend: null,
  },
  {
    id: 'aa',
    label: 'Active Athletes',
    value: '—',
    icon: 'flash-outline',
    color: 'success',
    trend: null,
  },
  {
    id: 'ae',
    label: 'Avg Engagement',
    value: '—',
    icon: 'heart-outline',
    color: 'warning',
    trend: null,
  },
];
