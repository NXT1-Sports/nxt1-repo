/**
 * @fileoverview Coaches Network Authority Section
 * @module @nxt1/ui/components/coaches-network-authority
 *
 * Shared marketing section for athlete persona pages showing direct recruiter
 * network access. Designed for SSR + SEO with semantic sectioning, explicit
 * image dimensions, and fully token-driven visual styling.
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { NxtSectionHeaderComponent } from '../section-header';

/** Real college program logo metadata used in the network visualization. */
export interface CoachesNetworkLogo {
  /** Stable unique id. */
  readonly id: string;
  /** Program display name (used for alt/ARIA). */
  readonly name: string;
  /** Public logo URL for the college program. */
  readonly logoUrl: string;
  /** X coordinate (%) for graph node placement. */
  readonly x: number;
  /** Y coordinate (%) for graph node placement. */
  readonly y: number;
  /** Render only on desktop/tablet breakpoints. */
  readonly desktopOnly?: boolean;
}

const DEFAULT_LOGOS: readonly CoachesNetworkLogo[] = [
  {
    id: 'network-alabama',
    name: 'Alabama Crimson Tide',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/333.png',
    x: 12,
    y: 16,
  },
  {
    id: 'network-duke',
    name: 'Duke Blue Devils',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/150.png',
    x: 34,
    y: 10,
  },
  {
    id: 'network-stanford',
    name: 'Stanford Cardinal',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/24.png',
    x: 66,
    y: 10,
  },
  {
    id: 'network-ohio-state',
    name: 'Ohio State Buckeyes',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png',
    x: 88,
    y: 16,
  },
  {
    id: 'network-usc',
    name: 'USC Trojans',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/30.png',
    x: 92,
    y: 38,
  },
  {
    id: 'network-georgia',
    name: 'Georgia Bulldogs',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/61.png',
    x: 88,
    y: 70,
  },
  {
    id: 'network-lsu',
    name: 'LSU Tigers',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/99.png',
    x: 66,
    y: 86,
  },
  {
    id: 'network-florida',
    name: 'Florida Gators',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/57.png',
    x: 34,
    y: 86,
  },
  {
    id: 'network-michigan',
    name: 'Michigan Wolverines',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/130.png',
    x: 12,
    y: 70,
  },
  {
    id: 'network-oregon',
    name: 'Oregon Ducks',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png',
    x: 8,
    y: 38,
  },
  {
    id: 'network-texas',
    name: 'Texas Longhorns',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png',
    x: 22,
    y: 50,
  },
  {
    id: 'network-clemson',
    name: 'Clemson Tigers',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/228.png',
    x: 78,
    y: 50,
  },
  {
    id: 'network-notre-dame',
    name: 'Notre Dame Fighting Irish',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/87.png',
    x: 38,
    y: 28,
    desktopOnly: true,
  },
  {
    id: 'network-penn-state',
    name: 'Penn State Nittany Lions',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/213.png',
    x: 58,
    y: 28,
    desktopOnly: true,
  },
  {
    id: 'network-oklahoma',
    name: 'Oklahoma Sooners',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/201.png',
    x: 36,
    y: 42,
    desktopOnly: true,
  },
  {
    id: 'network-auburn',
    name: 'Auburn Tigers',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2.png',
    x: 36,
    y: 58,
    desktopOnly: true,
  },
  {
    id: 'network-tennessee',
    name: 'Tennessee Volunteers',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2633.png',
    x: 56,
    y: 72,
    desktopOnly: true,
  },
  {
    id: 'network-miami',
    name: 'Miami Hurricanes',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/2390.png',
    x: 44,
    y: 70,
    desktopOnly: true,
  },
] as const;

let coachesNetworkInstanceCounter = 0;

@Component({
  selector: 'nxt1-coaches-network-authority',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent],
  template: `
    <section class="coaches-network" [attr.aria-labelledby]="titleId()">
      <div class="coaches-network__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Coaches Network"
          [headingLevel]="2"
          align="center"
          variant="hero"
          title="Direct Lines to"
          accentText=" Decision Makers."
          subtitle="One link sends your verified profile to every coach in the country. No lost emails. No broken DMs."
        />

        <figure class="network-graph" [attr.aria-labelledby]="figureCaptionId()">
          <div
            class="network-graph__canvas"
            role="img"
            aria-label="Athlete profile linked to college programs across the country"
          >
            <svg
              class="network-graph__lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              @for (logo of logos(); track logo.id) {
                <line
                  class="network-graph__line"
                  [class.network-graph__line--desktop-only]="logo.desktopOnly"
                  x1="50"
                  y1="50"
                  [attr.x2]="logo.x"
                  [attr.y2]="logo.y"
                />
              }
            </svg>

            <article class="network-athlete" aria-label="Verified athlete profile">
              <img
                class="network-athlete__image"
                [src]="athleteImageSrc"
                alt="Verified athlete profile"
                width="72"
                height="72"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
              />
              <p class="network-athlete__label">Verified Athlete Profile</p>
            </article>

            @for (logo of logos(); track logo.id) {
              <article
                class="network-node"
                [class.network-node--desktop-only]="logo.desktopOnly"
                [style.left.%]="logo.x"
                [style.top.%]="logo.y"
                [attr.aria-label]="logo.name"
              >
                <img
                  class="network-node__image"
                  [src]="logo.logoUrl"
                  [alt]="logo.name + ' logo'"
                  width="56"
                  height="56"
                  loading="lazy"
                  decoding="async"
                  fetchpriority="low"
                />
              </article>
            }
          </div>

          <figcaption class="network-graph__caption" [id]="figureCaptionId()">
            100+ college programs actively receiving verified NXT1 athlete profiles.
          </figcaption>
        </figure>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .coaches-network {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .coaches-network__shell {
        display: grid;
        gap: var(--nxt1-spacing-8);
      }

      .network-graph {
        margin: 0;
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      .network-graph__canvas {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 10;
        border-radius: var(--nxt1-borderRadius-3xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
      }

      .network-graph__lines {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .network-graph__line {
        stroke: var(--nxt1-color-border-default);
        stroke-width: 0.3;
      }

      .network-athlete {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: max-content;
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-2);
        z-index: 2;
      }

      .network-athlete__image {
        width: var(--nxt1-spacing-16);
        height: var(--nxt1-spacing-16);
        border-radius: var(--nxt1-borderRadius-full);
        border: 2px solid var(--nxt1-color-primary);
        object-fit: cover;
        background: var(--nxt1-color-surface-200);
      }

      .network-athlete__label {
        margin: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .network-node {
        position: absolute;
        transform: translate(-50%, -50%);
        width: var(--nxt1-spacing-14);
        height: var(--nxt1-spacing-14);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        display: grid;
        place-items: center;
        z-index: 1;
      }

      .network-node__image {
        width: calc(var(--nxt1-spacing-14) - var(--nxt1-spacing-2));
        height: calc(var(--nxt1-spacing-14) - var(--nxt1-spacing-2));
        object-fit: contain;
        border-radius: var(--nxt1-borderRadius-full);
      }

      .network-graph__caption {
        margin: 0;
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
        color: var(--nxt1-color-text-secondary);
      }

      @media (min-width: 1024px) {
        .network-graph {
          justify-items: center;
        }

        .network-graph__canvas {
          width: min(100%, var(--nxt1-section-max-width-narrow));
          aspect-ratio: 16 / 9;
        }
      }

      @media (max-width: 767px) {
        .coaches-network__shell {
          gap: var(--nxt1-spacing-6);
        }

        .network-node--desktop-only,
        .network-graph__line--desktop-only {
          display: none;
        }

        .network-graph__canvas {
          aspect-ratio: 1 / 1;
        }

        .network-node {
          width: var(--nxt1-spacing-12);
          height: var(--nxt1-spacing-12);
        }

        .network-node__image {
          width: calc(var(--nxt1-spacing-12) - var(--nxt1-spacing-2));
          height: calc(var(--nxt1-spacing-12) - var(--nxt1-spacing-2));
        }

        .network-athlete__image {
          width: var(--nxt1-spacing-14);
          height: var(--nxt1-spacing-14);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCoachesNetworkAuthorityComponent {
  private readonly instanceId = ++coachesNetworkInstanceCounter;

  /** Optional custom logo nodes for this section. */
  readonly logos = input<readonly CoachesNetworkLogo[]>(DEFAULT_LOGOS);

  protected readonly titleId = computed(() => `coaches-network-title-${this.instanceId}`);

  protected readonly figureCaptionId = computed(() => `coaches-network-caption-${this.instanceId}`);

  protected readonly athleteImageSrc = `/${IMAGE_PATHS.athlete1}`;
}
