/**
 * @fileoverview NXT1 Coach's Rolodex — College Network Showcase Component
 * @module apps/web/features/marketing/components/coach-rolodex
 * @version 1.0.0
 *
 * Full-width section displaying recruiting stats (active colleges, profile
 * views, athlete-coach connections) and a college logo marquee.
 *
 * This is the **stats + logos** half of the recruitment engine.
 * The USA map with live pings lives in:
 * `NxtRecruitmentEngineComponent` (`<nxt1-recruitment-engine />`).
 *
 * Design philosophy:
 * - 100% design-token driven — zero hardcoded colors/sizes/spacing
 * - SSR-safe — pure CSS animations, no browser APIs
 * - Semantic HTML with ARIA for screen readers
 * - prefers-reduced-motion fully respected
 * - Mobile-first responsive design
 *
 * @example
 * ```html
 * <nxt1-coach-rolodex
 *   [collegeLogos]="topColleges"
 *   [activeCollegeCount]="'150'"
 *   [profileViewCount]="'24.8K'"
 *   [connectionCount]="'3,200+'"
 * />
 * ```
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

// ============================================
// PUBLIC TYPES
// ============================================

/** A college logo item for the "Coach's Rolodex" showcase. */
export interface CollegeLogo {
  /** Unique identifier. */
  readonly id: string;
  /** College display name. */
  readonly name: string;
  /** URL to the college logo image. */
  readonly logoUrl: string;
}

// ============================================
// INSTANCE COUNTER
// ============================================

let rolodexInstanceCounter = 0;

// ============================================
// DEFAULT DATA
// ============================================

const DEFAULT_COLLEGE_LOGOS: readonly CollegeLogo[] = [
  { id: 'c-1', name: 'Alabama', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png' },
  { id: 'c-2', name: 'Duke', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/150.png' },
  { id: 'c-3', name: 'Stanford', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/24.png' },
  { id: 'c-4', name: 'Ohio State', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png' },
  { id: 'c-5', name: 'Texas', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png' },
  { id: 'c-6', name: 'Oregon', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png' },
  { id: 'c-7', name: 'Michigan', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/130.png' },
  { id: 'c-8', name: 'USC', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/30.png' },
  { id: 'c-9', name: 'Clemson', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/228.png' },
  { id: 'c-10', name: 'Georgia', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png' },
  { id: 'c-11', name: 'LSU', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/99.png' },
  { id: 'c-12', name: 'Florida', logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/57.png' },
];

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-coach-rolodex',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent],
  template: `
    <section class="rolodex-section" [attr.aria-labelledby]="rolodexHeadingId">
      <div class="section-inner">
        <!-- Header -->
        <div class="section-header">
          <nxt1-section-header
            [titleId]="rolodexHeadingId"
            eyebrow="College Network"
            [headingLevel]="2"
            align="center"
            variant="hero"
            title="The Coach's"
            accentText=" Rolodex."
            subtitle="Prove that the recruiting part actually works."
          />
        </div>

        <!-- Stats Row -->
        <div class="rolodex-stats" role="list" aria-label="Recruiting statistics">
          <div class="rolodex-stat" role="listitem">
            <span class="rolodex-stat__value">{{ activeCollegeCount() }}</span>
            <span class="rolodex-stat__label">Colleges Active Today</span>
          </div>
          <div class="rolodex-stat__divider" aria-hidden="true"></div>
          <div class="rolodex-stat" role="listitem">
            <span class="rolodex-stat__value">{{ profileViewCount() }}</span>
            <span class="rolodex-stat__label">Profile Views This Week</span>
          </div>
          <div class="rolodex-stat__divider" aria-hidden="true"></div>
          <div class="rolodex-stat" role="listitem">
            <span class="rolodex-stat__value">{{ connectionCount() }}</span>
            <span class="rolodex-stat__label">Athlete–Coach Connections</span>
          </div>
        </div>

        <!-- College Logo Label -->
        <p class="college-label">Top Colleges Viewing Profiles</p>

        <!-- College Logo Marquee -->
        <div
          class="college-marquee"
          role="marquee"
          [attr.aria-label]="'Scrolling logos of ' + collegeLogos().length + ' top colleges'"
        >
          <div class="college-marquee__fade college-marquee__fade--left" aria-hidden="true"></div>
          <div class="college-marquee__fade college-marquee__fade--right" aria-hidden="true"></div>

          <div class="college-marquee__track" [style.--marquee-duration]="marqueeDuration()">
            @for (logo of logosDoubled(); track logo.id + '-' + $index) {
              <div class="college-logo" [attr.aria-label]="logo.name">
                <img
                  [src]="logo.logoUrl"
                  [alt]="logo.name + ' logo'"
                  class="college-logo__img"
                  loading="lazy"
                  decoding="async"
                  width="48"
                  height="48"
                />
              </div>
            }
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      /* ============================================
         SECTION LAYOUT
         ============================================ */

      .section-inner {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-spacing-8) var(--nxt1-section-padding-x) var(--nxt1-section-padding-y);
      }

      .section-header {
        margin-bottom: var(--nxt1-spacing-10);
      }

      /* ============================================
         ROLODEX SECTION
         ============================================ */

      .rolodex-section {
        position: relative;
      }

      /* Stats row */
      .rolodex-stats {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: var(--nxt1-spacing-8);
        margin-bottom: var(--nxt1-spacing-10);
        flex-wrap: wrap;
      }

      .rolodex-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        text-align: center;
      }

      .rolodex-stat__value {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      @media (min-width: 768px) {
        .rolodex-stat__value {
          font-size: var(--nxt1-fontSize-4xl);
        }
      }

      .rolodex-stat__label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
      }

      .rolodex-stat__divider {
        width: 1px;
        height: var(--nxt1-spacing-10);
        background: var(--nxt1-color-border-default);
      }

      @media (max-width: 575px) {
        .rolodex-stat__divider {
          display: none;
        }
      }

      /* College label */
      .college-label {
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        margin: 0 0 var(--nxt1-spacing-6);
      }

      /* ============================================
         COLLEGE LOGO MARQUEE
         ============================================ */

      .college-marquee {
        position: relative;
        overflow: hidden;
        border-radius: var(--nxt1-borderRadius-xl);
        padding: var(--nxt1-spacing-4) 0;
      }

      .college-marquee__fade {
        position: absolute;
        top: 0;
        bottom: 0;
        width: var(--nxt1-spacing-16);
        z-index: 1;
        pointer-events: none;
      }

      .college-marquee__fade--left {
        left: 0;
        background: linear-gradient(to right, var(--nxt1-color-bg-primary), transparent);
      }

      .college-marquee__fade--right {
        right: 0;
        background: linear-gradient(to left, var(--nxt1-color-bg-primary), transparent);
      }

      .college-marquee__track {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-10);
        width: max-content;
        animation: marquee-scroll var(--marquee-duration, 30s) linear infinite;
      }

      .college-marquee:hover .college-marquee__track,
      .college-marquee:focus-within .college-marquee__track {
        animation-play-state: paused;
      }

      .college-logo {
        flex-shrink: 0;
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-1);
        transition:
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-out),
          background var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-out);
      }

      @media (min-width: 768px) {
        .college-logo {
          width: var(--nxt1-spacing-14);
          height: var(--nxt1-spacing-14);
        }
      }

      .college-logo:hover {
        transform: scale(1.1);
        background: var(--nxt1-color-surface-300, var(--nxt1-color-surface-200));
      }

      .college-logo__img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: var(--nxt1-borderRadius-md);
      }

      /* ============================================
         KEYFRAMES
         ============================================ */

      @keyframes marquee-scroll {
        from {
          transform: translate3d(0, 0, 0);
        }
        to {
          transform: translate3d(-50%, 0, 0);
        }
      }

      /* ============================================
         ACCESSIBILITY — Reduced Motion
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .college-marquee__track {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCoachRolodexComponent {
  /** College logos for the marquee showcase. */
  readonly collegeLogos = input<readonly CollegeLogo[]>(DEFAULT_COLLEGE_LOGOS);

  /** Number of active colleges displayed as a stat. */
  readonly activeCollegeCount = input<string>('150');

  /** Profile views this week stat. */
  readonly profileViewCount = input<string>('24.8K');

  /** Athlete–Coach connection stat. */
  readonly connectionCount = input<string>('3,200+');

  /** Speed of the college logo marquee in seconds. */
  readonly marqueeSpeed = input<number>(30);

  // ============================================
  // INSTANCE-UNIQUE IDS
  // ============================================

  private readonly uid = ++rolodexInstanceCounter;

  protected readonly rolodexHeadingId = `cr-heading-${this.uid}`;

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly marqueeDuration = computed(() => `${this.marqueeSpeed()}s`);

  protected readonly logosDoubled = computed(() => [
    ...this.collegeLogos(),
    ...this.collegeLogos(),
  ]);
}
