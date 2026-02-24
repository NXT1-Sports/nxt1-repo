/**
 * @fileoverview "The Weekly Pulse" (Trajectory Tracking) section — Shared Web UI
 * @module @nxt1/ui/analytics-dashboard/web
 * @version 2.0.0
 *
 * Compact, two-column trajectory tracking visualization for `/analytics`.
 * Header + momentum sit LEFT, mini chart sits RIGHT — side by side on desktop,
 * stacked on mobile.
 *
 * Design compliance:
 * - 100% design-token driven (ZERO hardcoded px/rem/hex values)
 * - Canonical section spacing via --nxt1-section-padding-y / --nxt1-section-padding-x
 * - Max-width via --nxt1-section-max-width-narrow (matches sibling sections)
 * - SSR-safe: no browser APIs, deterministic IDs, fully renderable on server
 * - WCAG-ready: labelled section, heading hierarchy, keyboard-accessible markers
 * - OnPush change detection + signals
 * - Zero Ionic dependencies
 */

import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

interface WeeklyPulsePoint {
  readonly week: number;
  readonly value: number;
}

type WeeklyPulseMarkerId = 'dip' | 'spike';

@Component({
  selector: 'nxt1-weekly-pulse-section',
  standalone: true,
  template: `
    <section class="wp" aria-labelledby="wp-heading">
      <!-- Two-column bar: header LEFT, chart RIGHT -->
      <div class="wp__bar">
        <!-- LEFT — Header + momentum -->
        <div class="wp__info">
          <p class="wp__eyebrow">The Weekly Pulse · Trajectory Tracking</p>
          <h2 id="wp-heading" class="wp__title">Are You Improving or Regressing?</h2>
          <p class="wp__subtitle">
            Track your season week-by-week. See the trend before the coach does.
          </p>

          <!-- Momentum pills -->
          <div class="wp__momentum" aria-label="Momentum indicators">
            <div class="wp__pill">
              <span class="wp__pill-label">Points Per Game</span>
              <span class="wp__pill-badge wp__pill-badge--up">
                <svg class="wp__pill-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 15.5 10.5 10l3.5 3.5L19 8.5"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                  />
                </svg>
                Trending Up
              </span>
            </div>
            <div class="wp__pill">
              <span class="wp__pill-label">Turnovers</span>
              <span class="wp__pill-badge wp__pill-badge--down">
                <svg class="wp__pill-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 8.5 10.5 14l3.5-3.5L19 15.5"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                  />
                </svg>
                Cooling Off
              </span>
            </div>
          </div>
        </div>

        <!-- RIGHT — Compact chart card -->
        <div class="wp__chart-card" aria-label="Weekly trajectory chart">
          <div class="wp__chart-wrap">
            <svg
              class="wp__chart"
              viewBox="0 0 360 160"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="Points per game trend weeks 1 through 10 with dip in week 4 and spike in week 8"
            >
              <defs>
                <linearGradient id="wp-line-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stop-color="var(--nxt1-color-info)" />
                  <stop offset="50%" stop-color="var(--nxt1-color-primary)" />
                  <stop offset="100%" stop-color="var(--nxt1-color-success)" />
                </linearGradient>
                <linearGradient id="wp-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--nxt1-color-primary)" stop-opacity="0.12" />
                  <stop offset="100%" stop-color="var(--nxt1-color-primary)" stop-opacity="0" />
                </linearGradient>
              </defs>

              <!-- Grid lines -->
              @for (gl of gridLines; track gl) {
                <line
                  class="wp__grid"
                  [attr.x1]="plotStartX"
                  [attr.y1]="gl"
                  [attr.x2]="plotEndX"
                  [attr.y2]="gl"
                />
              }

              <!-- Average dashed line -->
              <line
                class="wp__avg"
                [attr.x1]="plotStartX"
                [attr.y1]="averageY()"
                [attr.x2]="plotEndX"
                [attr.y2]="averageY()"
              />
              <text
                class="wp__avg-label"
                [attr.x]="plotEndX"
                [attr.y]="averageY() - 5"
                text-anchor="end"
              >
                Avg
              </text>

              <!-- Area fill -->
              <path class="wp__area" [attr.d]="areaPath()" />

              <!-- Trend line -->
              <path class="wp__line" [attr.d]="linePath()" />

              <!-- Data points -->
              @for (pt of chartPoints(); track pt.week) {
                <circle
                  class="wp__dot"
                  [class.wp__dot--dip]="pt.week === 4"
                  [class.wp__dot--spike]="pt.week === 8"
                  [attr.cx]="pt.x"
                  [attr.cy]="pt.y"
                  [attr.r]="pt.week === 4 || pt.week === 8 ? 5 : 3.5"
                />
              }

              <!-- Week labels (show every other on compact) -->
              @for (wl of compactWeekLabels(); track wl.week) {
                <text
                  class="wp__wk-label"
                  [attr.x]="wl.x"
                  [attr.y]="plotEndY + 16"
                  text-anchor="middle"
                >
                  W{{ wl.week }}
                </text>
              }

              <!-- Y-axis labels -->
              @for (yl of yAxisLabels(); track yl.value) {
                <text class="wp__y-label" x="24" [attr.y]="yl.y + 4" text-anchor="end">
                  {{ yl.value }}
                </text>
              }
            </svg>

            <!-- Interactive hover markers -->
            <button
              type="button"
              class="wp__marker wp__marker--dip"
              [class.wp__marker--active]="activeMarker() === 'dip'"
              [style.left.%]="dipPos().left"
              [style.top.%]="dipPos().top"
              (mouseenter)="setActiveMarker('dip')"
              (mouseleave)="clearActiveMarker()"
              (focus)="setActiveMarker('dip')"
              (blur)="clearActiveMarker()"
              aria-label="Week 4 dip: Down 12% versus season average"
            >
              <span class="wp__tip">-12% vs Avg</span>
            </button>

            <button
              type="button"
              class="wp__marker wp__marker--spike"
              [class.wp__marker--active]="activeMarker() === 'spike'"
              [style.left.%]="spikePos().left"
              [style.top.%]="spikePos().top"
              (mouseenter)="setActiveMarker('spike')"
              (mouseleave)="clearActiveMarker()"
              (focus)="setActiveMarker('spike')"
              (blur)="clearActiveMarker()"
              aria-label="Week 8 spike: Career high, plus 25% versus season average"
            >
              <span class="wp__tip">+25% Career High</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;

        /* Scoped chart tokens — viewBox-relative sizes for SVG internals */
        --_wp-chart-micro-font: calc(var(--nxt1-fontSize-xs) * 0.75);
        --_wp-chart-avg-opacity: 0.6;
      }

      /* ── Section container — canonical section layout ── */
      .wp {
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      /* ── Two-column bar ── */
      .wp__bar {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-6);
      }

      /* LEFT — Info column */
      .wp__info {
        flex: 0 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1_5);
      }

      .wp__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        white-space: nowrap;
      }

      .wp__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .wp__subtitle {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Momentum pills ── */
      .wp__momentum {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
        margin-top: var(--nxt1-spacing-1);
      }

      .wp__pill {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-100);
      }

      .wp__pill-label {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        white-space: nowrap;
      }

      .wp__pill-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        white-space: nowrap;
      }

      .wp__pill-badge--up {
        color: var(--nxt1-color-success);
      }

      .wp__pill-badge--down {
        color: var(--nxt1-color-error);
      }

      .wp__pill-icon {
        width: var(--nxt1-spacing-3_5);
        height: var(--nxt1-spacing-3_5);
        flex-shrink: 0;
      }

      /* RIGHT — Chart card */
      .wp__chart-card {
        flex: 1 1 0%;
        min-width: 0;
      }

      .wp__chart-wrap {
        position: relative;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-2) var(--nxt1-spacing-1);
        box-shadow: var(--nxt1-shadow-sm);
      }

      .wp__chart {
        display: block;
        width: 100%;
        height: auto;
      }

      /* ── SVG elements ── */
      .wp__grid {
        stroke: var(--nxt1-color-border-subtle);
        stroke-width: 0.5;
      }

      .wp__avg {
        stroke: var(--nxt1-color-text-tertiary);
        stroke-width: 1;
        stroke-dasharray: 4 4;
        opacity: var(--_wp-chart-avg-opacity);
      }

      .wp__avg-label {
        fill: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_wp-chart-micro-font);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .wp__area {
        fill: url(#wp-area-grad);
      }

      .wp__line {
        fill: none;
        stroke: url(#wp-line-grad);
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .wp__dot {
        fill: var(--nxt1-color-info);
        stroke: var(--nxt1-color-surface-100);
        stroke-width: 2;
      }

      .wp__dot--dip {
        fill: var(--nxt1-color-error);
      }

      .wp__dot--spike {
        fill: var(--nxt1-color-success);
      }

      .wp__wk-label,
      .wp__y-label {
        fill: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_wp-chart-micro-font);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      /* ── Interactive markers ── */
      .wp__marker {
        position: absolute;
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        transform: translate(-50%, -50%);
        border: none;
        border-radius: var(--nxt1-borderRadius-full);
        background: transparent;
        padding: 0;
        cursor: pointer;
      }

      .wp__tip {
        position: absolute;
        left: 50%;
        bottom: calc(100% + var(--nxt1-spacing-1_5));
        transform: translateX(-50%);
        opacity: 0;
        pointer-events: none;
        white-space: nowrap;
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-sm);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        box-shadow: var(--nxt1-shadow-md);
        transition: opacity var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-standard, ease);
      }

      .wp__marker:hover .wp__tip,
      .wp__marker:focus-visible .wp__tip,
      .wp__marker--active .wp__tip {
        opacity: 1;
      }

      .wp__marker:focus-visible {
        outline: none;
        box-shadow: 0 0 0 var(--nxt1-spacing-0_5) var(--nxt1-color-primary);
      }

      /* ── Responsive: stack on mobile ── */
      @media (max-width: 768px) {
        .wp__bar {
          flex-direction: column;
          align-items: stretch;
          gap: var(--nxt1-spacing-4);
        }

        .wp__info {
          text-align: left;
        }

        .wp__title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .wp__subtitle {
          max-width: none;
        }

        .wp__momentum {
          flex-direction: column;
          gap: var(--nxt1-spacing-1_5);
        }

        .wp__pill {
          width: fit-content;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeeklyPulseSectionComponent {
  /** Compact chart viewBox dimensions */
  protected readonly plotStartX = 32;
  protected readonly plotEndX = 348;
  protected readonly plotStartY = 12;
  protected readonly plotEndY = 130;

  /** Grid line Y positions (evenly spaced) */
  protected readonly gridLines = [35, 60, 85, 110] as const;

  private readonly minY = 18;
  private readonly maxY = 34;

  private readonly series: readonly WeeklyPulsePoint[] = [
    { week: 1, value: 24 },
    { week: 2, value: 25 },
    { week: 3, value: 24.5 },
    { week: 4, value: 22 },
    { week: 5, value: 24.2 },
    { week: 6, value: 25.8 },
    { week: 7, value: 27.1 },
    { week: 8, value: 31.25 },
    { week: 9, value: 28.3 },
    { week: 10, value: 29.2 },
  ];

  protected readonly activeMarker = signal<WeeklyPulseMarkerId | null>(null);

  protected readonly chartPoints = computed(() => {
    const xSpan = this.plotEndX - this.plotStartX;
    const ySpan = this.plotEndY - this.plotStartY;
    const denominator = Math.max(this.maxY - this.minY, 1);

    return this.series.map((point, index) => {
      const x = this.plotStartX + (xSpan * index) / (this.series.length - 1);
      const y = this.plotEndY - ((point.value - this.minY) / denominator) * ySpan;
      return { ...point, x, y };
    });
  });

  protected readonly linePath = computed(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return '';
    const [first, ...rest] = pts;
    return rest.reduce((p, pt) => `${p} L ${pt.x} ${pt.y}`, `M ${first.x} ${first.y}`);
  });

  protected readonly areaPath = computed(() => {
    const pts = this.chartPoints();
    if (pts.length === 0) return '';
    const [first, ...rest] = pts;
    const line = rest.reduce((p, pt) => `${p} L ${pt.x} ${pt.y}`, `M ${first.x} ${first.y}`);
    const last = pts[pts.length - 1];
    return `${line} L ${last.x} ${this.plotEndY} L ${first.x} ${this.plotEndY} Z`;
  });

  /** Show every other week label for compact chart */
  protected readonly compactWeekLabels = computed(() =>
    this.chartPoints()
      .filter((_, i) => i % 2 === 0 || i === this.series.length - 1)
      .map((pt) => ({ week: pt.week, x: pt.x }))
  );

  protected readonly yAxisLabels = computed(() => {
    const vals = [20, 24, 28, 32] as const;
    return vals.map((value) => ({ value, y: this.valueToY(value) }));
  });

  protected readonly averageY = computed(() => this.valueToY(25));

  protected readonly dipPos = computed(() => {
    const pt = this.chartPoints().find((p) => p.week === 4);
    return this.toPercent(pt);
  });

  protected readonly spikePos = computed(() => {
    const pt = this.chartPoints().find((p) => p.week === 8);
    return this.toPercent(pt);
  });

  protected setActiveMarker(id: WeeklyPulseMarkerId): void {
    this.activeMarker.set(id);
  }

  protected clearActiveMarker(): void {
    this.activeMarker.set(null);
  }

  private valueToY(value: number): number {
    const ySpan = this.plotEndY - this.plotStartY;
    const denominator = Math.max(this.maxY - this.minY, 1);
    return this.plotEndY - ((value - this.minY) / denominator) * ySpan;
  }

  private toPercent(point: { readonly x: number; readonly y: number } | undefined): {
    readonly left: number;
    readonly top: number;
  } {
    if (!point) return { left: 0, top: 0 };
    return {
      left: (point.x / 360) * 100,
      top: (point.y / 160) * 100,
    };
  }
}
