/**
 * @fileoverview NXT1 Recruitment Engine — USA Map Widget
 * @module @nxt1/ui/components/recruitment-engine
 * @version 3.0.0
 *
 * Self-contained USA map widget with animated real-time "pings" showing
 * live recruiting activity (commits, offers, visits).
 *
 * **Composable widget** — contains NO section header, title, or subtitle.
 * Designed to be slotted into `<nxt1-hero-section>` (or any layout container)
 * the same way `NxtMovementSectionComponent` is:
 *
 * ```html
 * <nxt1-hero-section
 *   badgeLabel="Recruiting Engine"
 *   title="The Pulse of"
 *   accentText="Recruiting."
 *   subtitle="See where the offers are flying right now."
 * >
 *   <nxt1-recruitment-engine />
 * </nxt1-hero-section>
 * ```
 *
 * Design philosophy:
 * - 100% design-token driven — zero hardcoded colors/sizes/spacing
 * - SSR-safe — all animations via CSS, no browser APIs, no DOM access
 * - SVG defs use instance-unique IDs to prevent collisions in SSR
 * - Semantic HTML with ARIA for screen readers
 * - prefers-reduced-motion fully respected
 * - Mobile-first responsive design
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// ============================================
// PUBLIC TYPES
// ============================================

/**
 * Recruiting activity type represented as color-coded map pins.
 * - commit:  Green  — A player committed to a program
 * - offer:   Yellow — A new scholarship offer was extended
 * - visit:   Blue   — A campus visit was scheduled
 */
export type RecruitingActivityType = 'commit' | 'offer' | 'visit';

/** A single live recruiting activity event displayed as a map ping. */
export interface RecruitingActivity {
  /** Unique identifier. */
  readonly id: string;
  /** Activity type (determines pin color). */
  readonly type: RecruitingActivityType;
  /** Short label displayed in the legend (e.g. "New Commit"). */
  readonly label: string;
  /** US state abbreviation (e.g. "TX", "FL", "CA"). */
  readonly state: string;
  /** Approximate X position on the map (0–100 percentage). */
  readonly x: number;
  /** Approximate Y position on the map (0–100 percentage). */
  readonly y: number;
  /** Staggered animation delay in seconds for organic appearance. */
  readonly delay: number;
}

// ============================================
// INSTANCE COUNTER — Unique SVG IDs per instance
// ============================================

let instanceCounter = 0;

// ============================================
// DEFAULT DATA
// ============================================

const DEFAULT_ACTIVITIES: readonly RecruitingActivity[] = [
  { id: 're-1', type: 'commit', label: 'New Commit', state: 'TX', x: 46.9, y: 73.1, delay: 0 },
  { id: 're-2', type: 'offer', label: 'New Offer', state: 'FL', x: 73.3, y: 84.2, delay: 1.2 },
  {
    id: 're-3',
    type: 'visit',
    label: 'Visit Scheduled',
    state: 'CA',
    x: 11.7,
    y: 51.7,
    delay: 2.5,
  },
  { id: 're-4', type: 'commit', label: 'New Commit', state: 'OH', x: 70.8, y: 38.2, delay: 3.8 },
  { id: 're-5', type: 'offer', label: 'New Offer', state: 'GA', x: 70, y: 66.9, delay: 5.1 },
  { id: 're-6', type: 'visit', label: 'Visit Scheduled', state: 'NY', x: 83, y: 28.9, delay: 6.3 },
  { id: 're-7', type: 'commit', label: 'New Commit', state: 'NC', x: 77.3, y: 56.4, delay: 7.5 },
  { id: 're-8', type: 'offer', label: 'New Offer', state: 'IL', x: 60.4, y: 39.8, delay: 8.8 },
  { id: 're-9', type: 'visit', label: 'Visit Scheduled', state: 'WA', x: 9.5, y: 11.1, delay: 10 },
  { id: 're-10', type: 'commit', label: 'New Commit', state: 'PA', x: 80.3, y: 35.3, delay: 11.2 },
  { id: 're-11', type: 'offer', label: 'New Offer', state: 'AL', x: 64.5, y: 68.2, delay: 12.5 },
  {
    id: 're-12',
    type: 'visit',
    label: 'Visit Scheduled',
    state: 'CO',
    x: 33.8,
    y: 43.5,
    delay: 13.7,
  },
];

// ============================================
// USA MAP SVG DATA — ViewBox: 0 0 960 600
// ============================================

/**
 * Continental US outline path derived from Natural Earth / public-domain
 * GeoJSON (johan/world.geo.json). Projected with equirectangular mapping
 * to a 960x600 viewBox with 30px padding. Simplified to ~227 points for
 * SVG rendering performance.
 */
const USA_OUTLINE_PATH =
  'M495.7 30L498.5 42.2L503.3 46L514.2 47.3L530.1 50.9L545.3 57.7L557.9 54.9' +
  'L577.1 60.6L582.2 60.4L596.1 54.1L610.8 62.2L626 70.8L638.6 78.2L650.7 85.3' +
  'L652.2 91.1L655.9 93.3L659.1 96.2L662.2 93.9L663 99.2L666.1 102.7L670.4 102.7' +
  'L672.7 105.4L670.7 109.4L687 119.8L690.3 139.9L693.4 159.2L688.9 172.4' +
  'L681.5 184.6L678.1 192.4L679.5 197.9L684.8 201.4L688.7 201.4L706.8 189.5' +
  'L722.9 186L743.3 175L742.2 165.9L739.7 161.6L746.7 158L762 158L776.3 158' +
  'L781.3 149.3L799.8 131.6L806.8 127.5L830.5 127.3L859.2 127.3L860.8 121.8' +
  'L865.8 120.7L872.4 117.3L877.9 107.2L882.7 89.9L894.6 73.1L899.7 79' +
  'L910.2 75.2L917.1 81.6L917.1 111.9L927.3 124.4L930 131.7L913.4 142.5' +
  'L897.3 150.2L880.9 156.7L872.6 169.9L870 174.9L869.8 186.7L875 198.5' +
  'L881.4 199L879.8 190.9L884.5 195.9L883.2 202.2L872.7 205.8L865.2 205.4' +
  'L853.7 209.2L846.9 210.4L837.8 211.5L824.8 217.9L847.7 213.7L852.3 217.9' +
  'L830.5 224.6L820.6 224.6L816.3 228L820.9 229.1L817.5 245L806.2 262.1' +
  'L805 256.4L801.6 255.3L796.5 249.7L799.7 261.7L803.6 265.6L803.8 274' +
  'L798.8 282.7L790.1 300.4L793.5 284.4L785.5 275.9L783.7 257.4L780.7 267.1' +
  'L784 281.1L773.7 277.7L784.4 284.8L785.1 306L789.6 307.5L791.2 315.2' +
  'L793.4 337.4L783.5 353.9L767.3 360.5L757.1 373.5L749.3 374.9L741.4 383.1' +
  'L739.2 390.5L722.1 405L713.3 415.5L705.9 428.7L703.5 444.5L706.3 459.9' +
  'L711.5 478.9L718.4 494.6L718.5 504.2L725.9 530L725.4 545L724.7 553.6' +
  'L720.8 567.2L716.2 570L708.5 567.3L706 557.6L700.1 552.5L691.8 533.3' +
  'L684.6 516.4L682.2 507.7L685.4 492.9L681.1 480.7L668.9 462.1L662.8 458.7' +
  'L647.1 468.8L644.3 467.7L636.7 457.3L627 451.8L609.3 454.6L595.5 452.2' +
  'L583.6 453.7L577.2 457.2L580 463.1L579.7 472.1L583 476.5L580.1 479.4' +
  'L574.3 476.1L568.4 480.3L557.1 479.6L545.5 467.9L531.9 470.7L520.5 465.5' +
  'L510.8 467.1L497.7 472.3L483.5 488.7L468 498.3L459.5 508.9L455.9 518.9' +
  'L455.8 534.2L456.5 544.9L459.5 552.5L453.4 553.1L442.4 548.2L430.2 541.3' +
  'L425.8 530.9L422.4 515.4L413.2 502.7L407.8 489.7L400 474.5L389 465.6' +
  'L376.3 466L366.4 483.6L353.5 476.9L345.4 470.2L341.5 458L336.4 446.4' +
  'L327.1 436.6L319.1 429.6L313.5 421.7L286.4 421.7L286.4 430.9L274 430.9' +
  'L243 431.1L207.5 415.4L183.9 404.6L185.4 400.3L165.6 402.7L147.9 404.4' +
  'L145.2 393L135.1 380.3L127.9 377.6L126.2 371.2L117.4 370.1L111.8 364.1' +
  'L97.3 361.9L93.4 358.3L91.5 346.2L76.3 323.8L63.4 293L63.9 287.8L57 280.5' +
  'L45 261.9L42.8 243.7L34.5 231.6L37.9 213.2L37.4 194.1L32.4 177.1L38.5 156.2' +
  'L40.4 136L42.3 115.9L39.5 86.1L34.5 67.1L30 56.8L31.9 52.4L54.4 60' +
  'L62.7 80.9L66.6 75.1L64.1 56.9L58.8 38.6L103.1 38.6L149.4 38.6L164.7 38.6' +
  'L212.2 38.6L258.2 38.6L305 38.6L351.8 38.6L404.8 38.6L458.1 38.6' +
  'L490.4 38.6L490.4 30.1L495.7 30Z';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-recruitment-engine',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Map Container -->
    <div
      class="map-container"
      role="img"
      [attr.aria-label]="
        'USA recruiting activity map showing ' + activities().length + ' live events'
      "
    >
      <!-- Map background glow -->
      <div class="map-glow" aria-hidden="true"></div>

      <!-- USA Map SVG -->
      <svg
        class="map-svg"
        viewBox="0 0 960 600"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient [attr.id]="gradientId" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" class="map-gradient-start" />
            <stop offset="100%" class="map-gradient-end" />
          </linearGradient>
          <linearGradient [attr.id]="connectionGradientId" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" class="connection-gradient-start" />
            <stop offset="50%" class="connection-gradient-mid" />
            <stop offset="100%" class="connection-gradient-end" />
          </linearGradient>
        </defs>

        <!-- USA Continental Outline -->
        <path
          class="map-outline"
          [attr.d]="usaOutlinePath"
          [attr.fill]="'url(#' + gradientId + ')'"
        />

        <!-- Connection lines between activities -->
        @for (line of connectionLines(); track line.id) {
          <line
            class="map-connection"
            [attr.x1]="line.x1"
            [attr.y1]="line.y1"
            [attr.x2]="line.x2"
            [attr.y2]="line.y2"
            [attr.stroke]="'url(#' + connectionGradientId + ')'"
            stroke-width="0.8"
            [style.animation-delay]="line.delay + 's'"
          />
        }

        <!-- Grid dots for texture -->
        @for (dot of gridDots; track dot.id) {
          <circle class="map-grid-dot" [attr.cx]="dot.cx" [attr.cy]="dot.cy" r="1" />
        }
      </svg>

      <!-- Ping markers (absolutely positioned over the SVG) -->
      <div class="map-pings" aria-hidden="true">
        @for (activity of activities(); track activity.id) {
          <div
            class="ping"
            [class.ping--commit]="activity.type === 'commit'"
            [class.ping--offer]="activity.type === 'offer'"
            [class.ping--visit]="activity.type === 'visit'"
            [style.left.%]="activity.x"
            [style.top.%]="activity.y"
            [style.animation-delay]="activity.delay + 's'"
          >
            <span class="ping__ripple"></span>
            <span class="ping__dot"></span>
            <span class="ping__label">{{ activity.label }} ({{ activity.state }})</span>
          </div>
        }
      </div>
    </div>

    <!-- Legend -->
    <div class="map-legend" role="list" aria-label="Map legend">
      <div class="legend-item" role="listitem">
        <span class="legend-dot legend-dot--commit" aria-hidden="true"></span>
        <span class="legend-text">New Commit</span>
      </div>
      <div class="legend-item" role="listitem">
        <span class="legend-dot legend-dot--offer" aria-hidden="true"></span>
        <span class="legend-text">New Offer</span>
      </div>
      <div class="legend-item" role="listitem">
        <span class="legend-dot legend-dot--visit" aria-hidden="true"></span>
        <span class="legend-text">Visit Scheduled</span>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         RECRUITMENT ENGINE MAP WIDGET
         Self-contained map visualization.
         Composed inside any layout (hero-section, etc).
         100% design-token driven.
         ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      /* ============================================
         MAP
         ============================================ */

      .map-container {
        position: relative;
        width: 100%;
        max-width: var(--nxt1-content-max-width, 45rem);
        margin: 0 auto;
        aspect-ratio: 960 / 600;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
      }

      .map-glow {
        position: absolute;
        inset: 10%;
        border-radius: var(--nxt1-borderRadius-full);
        background: radial-gradient(
          ellipse at center,
          var(--nxt1-color-alpha-primary10) 0%,
          transparent 70%
        );
        filter: blur(var(--nxt1-spacing-10));
        pointer-events: none;
      }

      .map-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      /* SVG gradient stops — class-based for SSR compatibility */
      .map-gradient-start {
        stop-color: var(--nxt1-color-surface-200);
        stop-opacity: 0.5;
      }

      .map-gradient-end {
        stop-color: var(--nxt1-color-surface-300, var(--nxt1-color-surface-200));
        stop-opacity: 0.3;
      }

      .connection-gradient-start,
      .connection-gradient-end {
        stop-color: var(--nxt1-color-primary);
        stop-opacity: 0;
      }

      .connection-gradient-mid {
        stop-color: var(--nxt1-color-primary);
        stop-opacity: 0.4;
      }

      .map-outline {
        stroke: var(--nxt1-color-border-subtle);
        stroke-width: 1.5;
        opacity: 0.8;
      }

      .map-grid-dot {
        fill: var(--nxt1-color-border-subtle);
        opacity: 0.2;
      }

      .map-connection {
        opacity: 0;
        animation: connection-fade 4s var(--nxt1-motion-easing-inOut) infinite;
      }

      /* ============================================
         MAP PINGS
         ============================================ */

      .map-pings {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .ping {
        position: absolute;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
      }

      .ping__ripple {
        position: absolute;
        width: var(--nxt1-spacing-7, 28px);
        height: var(--nxt1-spacing-7, 28px);
        border-radius: var(--nxt1-borderRadius-full);
        animation: ping-ripple 3s var(--nxt1-motion-easing-out) infinite;
        animation-delay: inherit;
      }

      .ping__dot {
        position: relative;
        width: var(--nxt1-spacing-2-5, 10px);
        height: var(--nxt1-spacing-2-5, 10px);
        border-radius: var(--nxt1-borderRadius-full);
        z-index: 1;
        animation: ping-appear 3s var(--nxt1-motion-easing-inOut) infinite;
        animation-delay: inherit;
        box-shadow: 0 0 var(--nxt1-spacing-2) var(--nxt1-spacing-0-5, 2px) currentColor;
      }

      .ping__label {
        position: absolute;
        top: calc(100% + var(--nxt1-spacing-1));
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        padding: var(--nxt1-spacing-0-5, 2px) var(--nxt1-spacing-1-5, 6px);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-300, var(--nxt1-color-surface-200));
        color: var(--nxt1-color-text-primary);
        opacity: 0;
        animation: label-fade 3s var(--nxt1-motion-easing-inOut) infinite;
        animation-delay: inherit;
        pointer-events: none;
      }

      /* Pin color variants */
      .ping--commit .ping__ripple {
        border: 2px solid var(--nxt1-color-success);
        background: transparent;
      }
      .ping--commit .ping__dot {
        background: var(--nxt1-color-success);
        color: var(--nxt1-color-success);
      }

      .ping--offer .ping__ripple {
        border: 2px solid var(--nxt1-color-warning, #f59e0b);
        background: transparent;
      }
      .ping--offer .ping__dot {
        background: var(--nxt1-color-warning, #f59e0b);
        color: var(--nxt1-color-warning, #f59e0b);
      }

      .ping--visit .ping__ripple {
        border: 2px solid var(--nxt1-color-info, #3b82f6);
        background: transparent;
      }
      .ping--visit .ping__dot {
        background: var(--nxt1-color-info, #3b82f6);
        color: var(--nxt1-color-info, #3b82f6);
      }

      /* ============================================
         MAP LEGEND
         ============================================ */

      .map-legend {
        display: flex;
        justify-content: center;
        gap: var(--nxt1-spacing-6);
        margin-top: var(--nxt1-spacing-6);
        flex-wrap: wrap;
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .legend-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        flex-shrink: 0;
      }

      .legend-dot--commit {
        background: var(--nxt1-color-success);
        box-shadow: 0 0 var(--nxt1-spacing-1-5, 6px) var(--nxt1-color-success);
      }

      .legend-dot--offer {
        background: var(--nxt1-color-warning, #f59e0b);
        box-shadow: 0 0 var(--nxt1-spacing-1-5, 6px) var(--nxt1-color-warning, #f59e0b);
      }

      .legend-dot--visit {
        background: var(--nxt1-color-info, #3b82f6);
        box-shadow: 0 0 var(--nxt1-spacing-1-5, 6px) var(--nxt1-color-info, #3b82f6);
      }

      .legend-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* ============================================
         KEYFRAMES
         ============================================ */

      @keyframes ping-ripple {
        0% {
          transform: scale(0.6);
          opacity: 0;
        }
        15% {
          opacity: 0.6;
        }
        40% {
          transform: scale(1.8);
          opacity: 0;
        }
        100% {
          opacity: 0;
        }
      }

      @keyframes ping-appear {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        10% {
          transform: scale(1);
          opacity: 1;
        }
        60% {
          transform: scale(1);
          opacity: 1;
        }
        80% {
          transform: scale(0.8);
          opacity: 0.4;
        }
        100% {
          transform: scale(0);
          opacity: 0;
        }
      }

      @keyframes label-fade {
        0% {
          opacity: 0;
          transform: translateX(-50%) translateY(4px);
        }
        12% {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        55% {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        75% {
          opacity: 0;
          transform: translateX(-50%) translateY(4px);
        }
        100% {
          opacity: 0;
        }
      }

      @keyframes connection-fade {
        0% {
          opacity: 0;
        }
        20% {
          opacity: 0.3;
        }
        50% {
          opacity: 0.1;
        }
        100% {
          opacity: 0;
        }
      }

      /* ============================================
         ACCESSIBILITY — Reduced Motion
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .ping__ripple,
        .ping__dot,
        .ping__label,
        .map-connection {
          animation: none;
        }

        .ping__dot {
          opacity: 1;
          transform: scale(1);
        }

        .ping__label {
          opacity: 1;
          transform: translateX(-50%);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtRecruitmentEngineComponent {
  /** Live recruiting activities displayed as map pings. */
  readonly activities = input<readonly RecruitingActivity[]>(DEFAULT_ACTIVITIES);

  // ============================================
  // INSTANCE-UNIQUE IDS
  // ============================================

  private readonly uid = ++instanceCounter;

  protected readonly gradientId = `re-map-grad-${this.uid}`;
  protected readonly connectionGradientId = `re-conn-grad-${this.uid}`;

  // ============================================
  // STATIC DATA — Precomputed, SSR-safe
  // ============================================

  protected readonly usaOutlinePath = USA_OUTLINE_PATH;

  protected readonly gridDots = (() => {
    const dots: { id: string; cx: number; cy: number }[] = [];
    let idx = 0;
    for (let x = 160; x < 860; x += 50) {
      for (let y = 120; y < 520; y += 50) {
        dots.push({ id: `gd-${this.uid}-${idx++}`, cx: x, cy: y });
      }
    }
    return dots;
  })();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly connectionLines = computed(() => {
    const acts = this.activities();
    const result: {
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      delay: number;
    }[] = [];

    for (let i = 0; i < acts.length - 1; i += 2) {
      const a = acts[i];
      const b = acts[i + 1];
      if (a && b) {
        result.push({
          id: `line-${this.uid}-${a.id}-${b.id}`,
          x1: (a.x / 100) * 960,
          y1: (a.y / 100) * 600,
          x2: (b.x / 100) * 960,
          y2: (b.y / 100) * 600,
          delay: a.delay,
        });
      }
    }

    return result;
  });
}
