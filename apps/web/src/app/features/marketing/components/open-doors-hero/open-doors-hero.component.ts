/**
 * @fileoverview NxtOpenDoorsHeroComponent — Open Doors Hero Section
 * @module apps/web/features/marketing/components/open-doors-hero
 *
 * Shared hero for recruiting persona marketing surfaces.
 * Includes:
 * - Headline + subhead messaging
 * - Shared CTA actions
 * - Token-driven globe visualization with college logos and recruiting connection lines
 *
 * 100% SSR-safe, token-driven, and accessibility compliant.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxtAppStoreBadgesComponent } from '@nxt1/ui/components/app-store-badges';
import { NxtCtaButtonComponent } from '@nxt1/ui/components/cta-button';
import {
  NxtSectionHeaderComponent,
  type SectionHeaderLevel,
} from '@nxt1/ui/components/section-header';

interface GlobeConnectionLine {
  readonly id: number;
  readonly angle: number;
  readonly delayMs: number;
  readonly durationMs: number;
  readonly lengthPercent: number;
}

interface GlobeLogo {
  readonly id: number;
  /** School name for alt text */
  readonly school: string;
  /** ESPN CDN team logo URL */
  readonly logoUrl: string;
  /** Percentage from left edge of globe container */
  readonly x: number;
  /** Percentage from top edge of globe container */
  readonly y: number;
  /** Animation delay in ms for staggered fade-in */
  readonly delayMs: number;
  /** Logo size in px */
  readonly size: number;
}

const CONNECTION_LINES: readonly GlobeConnectionLine[] = [
  { id: 1, angle: 8, delayMs: 0, durationMs: 2800, lengthPercent: 68 },
  { id: 2, angle: 26, delayMs: 160, durationMs: 3000, lengthPercent: 72 },
  { id: 3, angle: 44, delayMs: 360, durationMs: 3200, lengthPercent: 65 },
  { id: 4, angle: 62, delayMs: 540, durationMs: 2900, lengthPercent: 70 },
  { id: 5, angle: 80, delayMs: 760, durationMs: 3100, lengthPercent: 66 },
  { id: 6, angle: 98, delayMs: 920, durationMs: 2700, lengthPercent: 71 },
  { id: 7, angle: 116, delayMs: 1140, durationMs: 3300, lengthPercent: 64 },
  { id: 8, angle: 134, delayMs: 1320, durationMs: 2850, lengthPercent: 67 },
  { id: 9, angle: 152, delayMs: 1520, durationMs: 3050, lengthPercent: 73 },
  { id: 10, angle: 170, delayMs: 1700, durationMs: 2950, lengthPercent: 69 },
  { id: 11, angle: 188, delayMs: 1860, durationMs: 3150, lengthPercent: 70 },
  { id: 12, angle: 206, delayMs: 2040, durationMs: 3000, lengthPercent: 66 },
  { id: 13, angle: 224, delayMs: 2200, durationMs: 2900, lengthPercent: 72 },
  { id: 14, angle: 242, delayMs: 2380, durationMs: 3200, lengthPercent: 63 },
  { id: 15, angle: 260, delayMs: 2560, durationMs: 2750, lengthPercent: 71 },
  { id: 16, angle: 278, delayMs: 2740, durationMs: 3300, lengthPercent: 65 },
  { id: 17, angle: 296, delayMs: 2920, durationMs: 3050, lengthPercent: 70 },
  { id: 18, angle: 314, delayMs: 3120, durationMs: 2900, lengthPercent: 74 },
  { id: 19, angle: 332, delayMs: 3280, durationMs: 3000, lengthPercent: 68 },
  { id: 20, angle: 350, delayMs: 3460, durationMs: 3150, lengthPercent: 67 },
] as const;

/** College logos positioned around the globe surface */
const GLOBE_LOGOS: readonly GlobeLogo[] = [
  // Top region
  {
    id: 1,
    school: 'Alabama',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png',
    x: 42,
    y: 4,
    delayMs: 200,
    size: 36,
  },
  {
    id: 2,
    school: 'Ohio State',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png',
    x: 62,
    y: 8,
    delayMs: 600,
    size: 32,
  },

  // Upper-right
  {
    id: 3,
    school: 'Duke',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/150.png',
    x: 82,
    y: 18,
    delayMs: 1000,
    size: 30,
  },
  {
    id: 4,
    school: 'USC',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/30.png',
    x: 92,
    y: 38,
    delayMs: 1400,
    size: 34,
  },

  // Right side
  {
    id: 5,
    school: 'Michigan',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/130.png',
    x: 95,
    y: 58,
    delayMs: 1800,
    size: 32,
  },
  {
    id: 6,
    school: 'Notre Dame',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/87.png',
    x: 88,
    y: 76,
    delayMs: 2200,
    size: 30,
  },

  // Bottom-right
  {
    id: 7,
    school: 'Texas',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png',
    x: 74,
    y: 90,
    delayMs: 2600,
    size: 34,
  },
  {
    id: 8,
    school: 'Florida',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/57.png',
    x: 56,
    y: 96,
    delayMs: 3000,
    size: 30,
  },

  // Bottom-left
  {
    id: 9,
    school: 'LSU',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/99.png',
    x: 34,
    y: 92,
    delayMs: 3400,
    size: 32,
  },
  {
    id: 10,
    school: 'Oregon',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png',
    x: 16,
    y: 80,
    delayMs: 3800,
    size: 30,
  },

  // Left side
  {
    id: 11,
    school: 'Clemson',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/228.png',
    x: 4,
    y: 62,
    delayMs: 4200,
    size: 34,
  },
  {
    id: 12,
    school: 'Stanford',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/24.png',
    x: 2,
    y: 40,
    delayMs: 4600,
    size: 30,
  },

  // Upper-left
  {
    id: 13,
    school: 'Auburn',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2.png',
    x: 10,
    y: 20,
    delayMs: 5000,
    size: 32,
  },
  {
    id: 14,
    school: 'Georgia',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png',
    x: 26,
    y: 8,
    delayMs: 5400,
    size: 30,
  },
] as const;

@Component({
  selector: 'nxt1-open-doors-hero',
  standalone: true,
  imports: [NxtSectionHeaderComponent, NxtCtaButtonComponent, NxtAppStoreBadgesComponent],
  template: `
    <section class="open-doors" [attr.aria-labelledby]="ariaTitleId()">
      <div class="open-doors__content">
        <nxt1-section-header
          variant="hero"
          [titleId]="ariaTitleId()"
          [headingLevel]="headingLevel()"
          eyebrow="Open Doors"
          title="The Entire NCAA. In Your Pocket."
          subtitle="Direct access to 85,000+ college coaches. One click to connect."
        />

        <div class="open-doors__actions">
          <nxt1-cta-button
            class="open-doors__cta-desktop"
            label="Start Free With NXT1"
            [route]="ctaRoute()"
            variant="primary"
            [ariaLabel]="ctaAriaLabel()"
          />

          <nxt1-app-store-badges class="open-doors__cta-mobile" layout="row" />
        </div>
      </div>

      <div class="open-doors__visual" aria-hidden="true">
        <div class="open-doors-globe">
          <div class="open-doors-globe__rim"></div>
          <div class="open-doors-globe__core"></div>
          <div class="open-doors-globe__grid"></div>

          @for (line of connectionLines; track line.id) {
            <span
              class="open-doors-globe__connection"
              [style.--nxt1-line-angle]="line.angle + 'deg'"
              [style.--nxt1-line-delay]="line.delayMs + 'ms'"
              [style.--nxt1-line-duration]="line.durationMs + 'ms'"
              [style.--nxt1-line-length]="line.lengthPercent + '%'"
            ></span>
          }

          <span class="open-doors-globe__center"></span>
          <span class="open-doors-globe__pulse open-doors-globe__pulse--a"></span>
          <span class="open-doors-globe__pulse open-doors-globe__pulse--b"></span>

          @for (logo of globeLogos; track logo.id) {
            <img
              class="open-doors-globe__logo"
              [src]="logo.logoUrl"
              [alt]="logo.school"
              loading="lazy"
              [style.--nxt1-logo-x]="logo.x + '%'"
              [style.--nxt1-logo-y]="logo.y + '%'"
              [style.--nxt1-logo-delay]="logo.delayMs + 'ms'"
              [style.--nxt1-logo-size]="logo.size + 'px'"
            />
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      @keyframes open-doors-rotate {
        from {
          transform: rotateZ(0deg) rotateX(64deg) rotateY(0deg);
        }
        to {
          transform: rotateZ(360deg) rotateX(64deg) rotateY(0deg);
        }
      }

      @keyframes open-doors-flow {
        0% {
          opacity: 0;
          transform: rotate(var(--nxt1-line-angle)) translateY(0) scaleX(0.5);
        }
        35% {
          opacity: 1;
        }
        100% {
          opacity: 0;
          transform: rotate(var(--nxt1-line-angle)) translateY(0) scaleX(1);
        }
      }

      @keyframes open-doors-pulse {
        0% {
          transform: translate(-50%, -50%) scale(0.82);
          opacity: 0.8;
        }
        100% {
          transform: translate(-50%, -50%) scale(1.2);
          opacity: 0;
        }
      }

      :host {
        display: block;
      }

      .open-doors {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-8);
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      @media (min-width: 1024px) {
        .open-doors {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: center;
          gap: var(--nxt1-spacing-10);
        }
      }

      .open-doors__content {
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      .open-doors__actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .open-doors__cta-desktop {
        display: none;
      }

      .open-doors__cta-mobile {
        display: inline-flex;
      }

      @media (min-width: 1024px) {
        .open-doors__cta-desktop {
          display: inline-flex;
        }

        .open-doors__cta-mobile {
          display: none;
        }
      }

      @media (max-width: 767px) {
        .open-doors__content {
          text-align: center;
        }

        .open-doors__actions {
          justify-content: center;
        }

        .open-doors__content ::ng-deep .section-header {
          justify-items: center;
          text-align: center;
        }

        .open-doors__content ::ng-deep .section-header__text {
          justify-items: center;
          text-align: center;
        }
      }

      .open-doors__visual {
        display: grid;
        place-items: center;
        min-height: var(--nxt1-spacing-96);
      }

      .open-doors-globe {
        position: relative;
        width: min(100%, var(--nxt1-spacing-96));
        aspect-ratio: 1;
        transform-style: preserve-3d;
      }

      .open-doors-globe__rim,
      .open-doors-globe__core,
      .open-doors-globe__grid {
        position: absolute;
        inset: 0;
        border-radius: var(--nxt1-borderRadius-full);
      }

      .open-doors-globe__rim {
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 72%, transparent);
        background: radial-gradient(
          circle at 50% 50%,
          color-mix(in srgb, var(--nxt1-color-primary) 28%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-200) 92%, transparent) 55%,
          color-mix(in srgb, var(--nxt1-color-surface-300) 92%, transparent)
        );
      }

      .open-doors-globe__core {
        inset: var(--nxt1-spacing-6);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 24%, transparent);
        background: radial-gradient(
          circle at 50% 50%,
          color-mix(in srgb, var(--nxt1-color-primary) 22%, transparent),
          color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent) 62%
        );
      }

      .open-doors-globe__grid {
        inset: var(--nxt1-spacing-7);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 58%, transparent);
        animation: open-doors-rotate var(--nxt1-motion-duration-slower) linear infinite;
      }

      .open-doors-globe__connection {
        position: absolute;
        left: 50%;
        top: 50%;
        width: var(--nxt1-line-length);
        height: 1px;
        transform-origin: left center;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--nxt1-color-primary) 70%, transparent),
          color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent)
        );
        animation: open-doors-flow var(--nxt1-line-duration) ease-in-out infinite;
        animation-delay: var(--nxt1-line-delay);
        pointer-events: none;
      }

      .open-doors-globe__center {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        box-shadow: 0 0 var(--nxt1-spacing-2)
          color-mix(in srgb, var(--nxt1-color-primary) 60%, transparent);
        z-index: 1;
        pointer-events: none;
      }

      .open-doors-globe__pulse {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 62%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-primary) 24%, transparent);
        animation: open-doors-pulse var(--nxt1-motion-duration-slower) ease-out infinite;
        pointer-events: none;
      }

      .open-doors-globe__pulse--b {
        animation-delay: var(--nxt1-motion-duration-fast);
      }

      @keyframes open-doors-logo-enter {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.4);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @keyframes open-doors-logo-float {
        0%,
        100% {
          transform: translate(-50%, -50%) translateY(0);
        }
        50% {
          transform: translate(-50%, -50%) translateY(calc(-1 * var(--nxt1-spacing-1, 4px)));
        }
      }

      .open-doors-globe__logo {
        position: absolute;
        left: var(--nxt1-logo-x);
        top: var(--nxt1-logo-y);
        width: var(--nxt1-logo-size);
        height: var(--nxt1-logo-size);
        border-radius: var(--nxt1-borderRadius-full);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 85%, transparent);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 30%, transparent);
        box-shadow:
          0 0 var(--nxt1-spacing-3, 12px)
            color-mix(in srgb, var(--nxt1-color-primary) 20%, transparent),
          0 var(--nxt1-spacing-0-5, 2px) var(--nxt1-spacing-2, 8px)
            color-mix(in srgb, var(--nxt1-color-background-primary, #0a0a0a) 30%, transparent);
        object-fit: contain;
        padding: var(--nxt1-spacing-1, 4px);
        pointer-events: none;
        opacity: 0;
        animation: open-doors-logo-enter 600ms ease-out forwards;
        animation-delay: var(--nxt1-logo-delay);
        z-index: 2;
      }

      @media (prefers-reduced-motion: reduce) {
        .open-doors-globe__grid,
        .open-doors-globe__connection,
        .open-doors-globe__pulse,
        .open-doors-globe__logo {
          animation: none;
        }

        .open-doors-globe__logo {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtOpenDoorsHeroComponent {
  readonly headingLevel = input<SectionHeaderLevel>(1);
  readonly ariaTitleId = input<string>('open-doors-hero-title');
  readonly ctaRoute = input<string>('/auth');
  readonly ctaAriaLabel = input<string>('Start free with NXT1');

  protected readonly connectionLines = CONNECTION_LINES;
  protected readonly globeLogos = GLOBE_LOGOS;
}
