/**
 * @fileoverview Analytics Dashboard Preview Component
 * @module @nxt1/ui/analytics-dashboard
 * @version 1.0.0
 *
 * Interactive mockup of the analytics dashboard for use on
 * the analytics landing page. Shows realistic metric cards,
 * sparkline chart, and an AI insight preview inside a
 * browser-chrome window frame.
 *
 * Analytics-specific — not a generic shared component.
 * Uses mock values from analytics constants for visual accuracy.
 *
 * 100% design-token styling where applicable. Micro-scale preview
 * elements use pixel values where token granularity is insufficient.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-analytics-dashboard-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { NxtIconComponent } from '../components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/**
 * Mock metric card data for the dashboard preview.
 * Shows realistic-looking data in the landing page screenshot.
 */
const PREVIEW_METRICS = [
  {
    id: 'views',
    label: 'Profile Views',
    value: '2,847',
    change: '+23.5%',
    direction: 'up' as const,
    icon: 'eye-outline',
  },
  {
    id: 'videos',
    label: 'Video Views',
    value: '8.4K',
    change: '+15.2%',
    direction: 'up' as const,
    icon: 'videocam-outline',
  },
  {
    id: 'followers',
    label: 'Followers',
    value: '456',
    change: '+8.7%',
    direction: 'up' as const,
    icon: 'people-outline',
  },
  {
    id: 'coaches',
    label: 'Coach Views',
    value: '142',
    change: '+34.2%',
    direction: 'up' as const,
    icon: 'school-outline',
  },
] as const;

/**
 * Mock chart data points for the sparkline preview visualization.
 * Represents a 7-day trend line.
 */
const PREVIEW_CHART_POINTS = [35, 42, 38, 52, 48, 61, 72] as const;

/** Default athlete/coach backdrop images for the landing page. */
const DEFAULT_ATHLETE_IMAGES = [
  '/assets/shared/images/analytics/athlete-1.png',
  '/assets/shared/images/analytics/athlete-2.png',
  '/assets/shared/images/analytics/athlete-3.png',
  '/assets/shared/images/analytics/coach-1.png',
] as const;

@Component({
  selector: 'nxt1-analytics-dashboard-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="hero-preview" aria-hidden="true">
      <!-- Floating athlete photo cards — all visible, positioned around the dashboard -->
      <div class="athlete-photos athlete-photos--behind">
        @for (image of athleteImages(); track $index; let i = $index) {
          @if (i < 3) {
            <div class="athlete-card" [class]="'athlete-card athlete-card--' + i">
              <img
                [src]="image"
                [alt]="'Athlete showcase ' + (i + 1)"
                class="athlete-img"
                loading="eager"
              />
            </div>
          }
        }
      </div>

      <!-- Subtle glow behind dashboard -->
      <div class="preview-glow"></div>

      <!-- Dashboard window — centered, hero element -->
      <div class="preview-window">
        <!-- Browser Chrome -->
        <div class="preview-chrome">
          <div class="preview-dots">
            <span class="dot dot--close"></span>
            <span class="dot dot--minimize"></span>
            <span class="dot dot--expand"></span>
          </div>
          <span class="preview-title">Analytics</span>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Period Bar -->
          <div class="preview-period">
            <span class="period-badge">Last 7 Days</span>
          </div>

          <!-- Metric Cards Grid -->
          <div class="preview-metrics">
            @for (metric of previewMetrics; track metric.id) {
              <div class="preview-metric-card">
                <div class="metric-header">
                  <nxt1-icon [name]="metric.icon" size="14" />
                  <span class="metric-label">{{ metric.label }}</span>
                </div>
                <div class="metric-value">{{ metric.value }}</div>
                <div class="metric-change" [class.metric-change--up]="metric.direction === 'up'">
                  <nxt1-icon
                    [name]="metric.direction === 'up' ? 'trending-up' : 'trending-down'"
                    size="10"
                  />
                  <span>{{ metric.change }}</span>
                </div>
              </div>
            }
          </div>

          <!-- Chart Preview -->
          <div class="preview-chart">
            <div class="chart-header">
              <span class="chart-title">Profile Views</span>
              <span class="chart-period">7 days</span>
            </div>
            <div class="chart-area">
              <svg
                class="sparkline"
                viewBox="0 0 280 60"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line x1="0" y1="15" x2="280" y2="15" class="grid-line" />
                <line x1="0" y1="30" x2="280" y2="30" class="grid-line" />
                <line x1="0" y1="45" x2="280" y2="45" class="grid-line" />
                <defs>
                  <linearGradient id="previewChartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" class="gradient-start" />
                    <stop offset="100%" class="gradient-end" />
                  </linearGradient>
                </defs>
                <path [attr.d]="chartAreaPath" fill="url(#previewChartGradient)" />
                <polyline [attr.points]="chartLinePath" class="chart-line" fill="none" />
                @for (point of chartDataPoints; track $index) {
                  <circle [attr.cx]="point.x" [attr.cy]="point.y" r="2.5" class="chart-dot" />
                }
              </svg>
            </div>
          </div>

          <!-- Insight Preview -->
          <div class="preview-insight">
            <div class="insight-icon">
              <nxt1-icon name="bulb-outline" size="14" />
            </div>
            <div class="insight-body">
              <span class="insight-label">AI Insight</span>
              <span class="insight-text">Your videos posted on Tuesdays get 3x more views</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Athlete 4 — bottom-left, in FRONT of the dashboard -->
      @if (athleteImages().length > 3) {
        <div class="athlete-card athlete-card--3 athlete-card--front">
          <img
            [src]="athleteImages()[3]"
            alt="Athlete showcase 4"
            class="athlete-img"
            loading="eager"
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
     * HOST — Block display, fill parent container
     * ============================================ */
      :host {
        display: block;
        width: 100%;
      }

      /* ============================================
     * HERO PREVIEW CONTAINER
     * Relative container — dashboard centered,
     * athlete photo cards float around it.
     * No aspect-ratio lock — natural height.
     * ============================================ */
      .hero-preview {
        position: relative;
        width: 100%;
        max-width: 620px;
        margin: 0 auto;
        padding: var(--nxt1-spacing-12) var(--nxt1-spacing-6);
      }

      /* ============================================
     * FLOATING ATHLETE PHOTO CARDS
     * 3 small rounded thumbnails positioned as
     * decorative elements around the dashboard.
     * All visible simultaneously — no animation.
     * Professional "collage" marketing layout.
     * ============================================ */
      .athlete-photos--behind {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
      }

      .athlete-card {
        position: absolute;
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.3),
          0 0 0 1px rgba(255, 255, 255, 0.06);
        border: 2px solid var(--nxt1-color-alpha-primary10);
      }

      .athlete-img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top center;
      }

      /* Athlete 1 — top-left, slightly behind dashboard */
      .athlete-card--0 {
        width: 90px;
        height: 120px;
        top: 8px;
        left: 0;
        transform: rotate(-6deg);
        z-index: 0;
      }

      /* Athlete 2 — bottom-right, overlapping dashboard edge */
      .athlete-card--1 {
        width: 100px;
        height: 130px;
        bottom: 4px;
        right: 0;
        transform: rotate(4deg);
        z-index: 3;
      }

      /* Athlete 3 — top-right, peeking above dashboard */
      .athlete-card--2 {
        width: 80px;
        height: 105px;
        top: 0;
        right: 36px;
        transform: rotate(3deg);
        z-index: 0;
      }

      /* Athlete 4 — bottom-left, IN FRONT of dashboard */
      .athlete-card--front {
        position: absolute;
        z-index: 4;
      }

      .athlete-card--3 {
        width: 95px;
        height: 125px;
        bottom: 4px;
        left: 0;
        transform: rotate(-4deg);
      }

      /* ============================================
     * GLOW — Soft primary halo behind dashboard
     * ============================================ */
      .preview-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 75%;
        height: 65%;
        background: radial-gradient(
          ellipse at center,
          var(--nxt1-color-alpha-primary12) 0%,
          var(--nxt1-color-alpha-primary5) 50%,
          transparent 80%
        );
        border-radius: var(--nxt1-borderRadius-full);
        pointer-events: none;
        z-index: 0;
      }

      /* ============================================
     * DASHBOARD WINDOW — Main hero element
     * Centered, solid background, elevated
     * ============================================ */
      .preview-window {
        position: relative;
        z-index: 2;
        width: 100%;
        max-width: 440px;
        margin: 0 auto;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        box-shadow:
          0 0 0 1px var(--nxt1-color-alpha-primary6),
          0 20px 60px rgba(0, 0, 0, 0.4),
          0 4px 16px rgba(0, 0, 0, 0.2);
      }

      /* Browser Chrome */
      .preview-chrome {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-200);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .preview-dots {
        display: flex;
        gap: var(--nxt1-spacing-1);
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-400);
      }

      .dot--close {
        background: var(--nxt1-color-error);
      }
      .dot--minimize {
        background: var(--nxt1-color-warning);
      }
      .dot--expand {
        background: var(--nxt1-color-success);
      }

      .preview-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      /* Dashboard Body */
      .preview-body {
        padding: var(--nxt1-spacing-3);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      /* ============================================
     * PERIOD BADGE
     * ============================================ */
      .preview-period {
        display: flex;
      }

      .period-badge {
        display: inline-flex;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
     * METRIC CARDS — 2×2 grid
     * ============================================ */
      .preview-metrics {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-1_5);
      }

      .preview-metric-card {
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .metric-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        margin-bottom: 2px;
        color: var(--nxt1-color-text-tertiary);
      }

      .metric-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .metric-value {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-md);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: 1.2;
      }

      .metric-change {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        margin-top: 2px;
      }

      .metric-change--up {
        color: var(--nxt1-color-success);
      }

      /* ============================================
     * CHART — Compact
     * ============================================ */
      .preview-chart {
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .chart-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-1);
      }

      .chart-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .chart-period {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .chart-area {
        position: relative;
        height: 48px;
      }

      .sparkline {
        width: 100%;
        height: 100%;
      }

      .grid-line {
        stroke: var(--nxt1-color-border-subtle);
        stroke-width: 0.5;
        stroke-dasharray: 4 4;
      }

      .gradient-start {
        stop-color: var(--nxt1-color-primary);
        stop-opacity: 0.3;
      }

      .gradient-end {
        stop-color: var(--nxt1-color-primary);
        stop-opacity: 0;
      }

      .chart-line {
        stroke: var(--nxt1-color-primary);
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .chart-dot {
        fill: var(--nxt1-color-primary);
        stroke: var(--nxt1-color-surface-200);
        stroke-width: 1.5;
      }

      /* ============================================
     * INSIGHT PREVIEW
     * ============================================ */
      .preview-insight {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        background: var(--nxt1-color-alpha-primary10);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        border-radius: var(--nxt1-borderRadius-md);
        padding: var(--nxt1-spacing-2);
      }

      .insight-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-6);
        height: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-alpha-primary20);
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .insight-body {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }

      .insight-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-primary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wider);
      }

      .insight-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        color: var(--nxt1-color-text-secondary);
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ============================================
     * RESPONSIVE
     * ============================================ */
      @media (max-width: 480px) {
        .hero-preview {
          padding: var(--nxt1-spacing-8) var(--nxt1-spacing-2);
        }

        .athlete-card--0 {
          width: 64px;
          height: 84px;
        }

        .athlete-card--1 {
          width: 72px;
          height: 96px;
        }

        .athlete-card--2 {
          width: 56px;
          height: 74px;
        }

        .athlete-card--3 {
          width: 68px;
          height: 90px;
        }

        .metric-value {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAnalyticsDashboardPreviewComponent {
  /** Athlete images for the backdrop carousel. Override via input or use defaults. */
  readonly athleteImages = input<readonly string[]>(DEFAULT_ATHLETE_IMAGES as unknown as string[]);

  protected readonly previewMetrics = PREVIEW_METRICS;

  /**
   * SVG chart data computed from preview chart points.
   * Converts raw values to SVG coordinates.
   */
  protected readonly chartDataPoints = PREVIEW_CHART_POINTS.map((value, index) => {
    const x = (index / (PREVIEW_CHART_POINTS.length - 1)) * 280;
    const maxVal = Math.max(...PREVIEW_CHART_POINTS);
    const minVal = Math.min(...PREVIEW_CHART_POINTS);
    const range = maxVal - minVal || 1;
    const y = 55 - ((value - minVal) / range) * 45;
    return { x, y };
  });

  /**
   * SVG polyline `points` attribute for the chart line.
   */
  protected readonly chartLinePath = this.chartDataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  /**
   * SVG `d` attribute for the chart area fill (closed path).
   */
  protected readonly chartAreaPath = (() => {
    const points = this.chartDataPoints;
    const moveTo = `M${points[0].x},${points[0].y}`;
    const lineTo = points
      .slice(1)
      .map((p) => `L${p.x},${p.y}`)
      .join(' ');
    const closeBottom = `L${points[points.length - 1].x},60 L${points[0].x},60 Z`;
    return `${moveTo} ${lineTo} ${closeBottom}`;
  })();
}
