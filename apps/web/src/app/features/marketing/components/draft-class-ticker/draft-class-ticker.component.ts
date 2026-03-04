/**
 * @fileoverview Draft Class Live Adoption Ticker
 * @module apps/web/features/marketing/components/draft-class-ticker
 *
 * Shared, SSR-safe social-proof section for persona landing pages.
 * Displays a horizontally infinite stream of recruit cards and pauses on hover/focus.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

export interface DraftClassAthleteCard {
  readonly id: string;
  readonly name: string;
  readonly sportPositionClass: string;
  readonly location: string;
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly profileRoute: string;
}

const DEFAULT_DRAFT_CLASS_CARDS: readonly DraftClassAthleteCard[] = [
  {
    id: 'draft-jordan-t',
    name: 'Jordan T.',
    sportPositionClass: "QB - Class of '28",
    location: 'Texas',
    imageSrc: `/${IMAGE_PATHS.athlete1}`,
    imageAlt: 'Jordan T. football quarterback action photo',
    profileRoute: '/athlete-profiles',
  },
  {
    id: 'draft-kai-r',
    name: 'Kai R.',
    sportPositionClass: "WR - Class of '27",
    location: 'Florida',
    imageSrc: `/${IMAGE_PATHS.athlete2}`,
    imageAlt: 'Kai R. wide receiver headshot',
    profileRoute: '/athlete-profiles',
  },
  {
    id: 'draft-avery-m',
    name: 'Avery M.',
    sportPositionClass: "PG - Class of '29",
    location: 'California',
    imageSrc: `/${IMAGE_PATHS.athlete3}`,
    imageAlt: 'Avery M. basketball point guard portrait',
    profileRoute: '/athlete-profiles',
  },
  {
    id: 'draft-dakota-l',
    name: 'Dakota L.',
    sportPositionClass: "SS - Class of '28",
    location: 'Georgia',
    imageSrc: `/${IMAGE_PATHS.athlete4}`,
    imageAlt: 'Dakota L. baseball shortstop action shot',
    profileRoute: '/athlete-profiles',
  },
  {
    id: 'draft-skyler-p',
    name: 'Skyler P.',
    sportPositionClass: "MB - Class of '27",
    location: 'Illinois',
    imageSrc: `/${IMAGE_PATHS.athlete5}`,
    imageAlt: 'Skyler P. volleyball middle blocker headshot',
    profileRoute: '/athlete-profiles',
  },
  {
    id: 'draft-cameron-j',
    name: 'Cameron J.',
    sportPositionClass: "CB - Class of '28",
    location: 'Louisiana',
    imageSrc: `/${IMAGE_PATHS.athlete2}`,
    imageAlt: 'Cameron J. football cornerback portrait',
    profileRoute: '/athlete-profiles',
  },
] as const;

@Component({
  selector: 'nxt1-draft-class-ticker',
  standalone: true,
  imports: [RouterModule, NxtSectionHeaderComponent],
  template: `
    <section class="draft-class" role="region" aria-labelledby="draft-class-title">
      <div class="draft-class__container">
        <nxt1-section-header
          titleId="draft-class-title"
          [headingLevel]="2"
          align="center"
          eyebrow="The Draft Class"
          title="Welcome to the League."
          [subtitle]="subhead()"
        />

        <div
          class="draft-class__viewport"
          role="marquee"
          [attr.aria-label]="'Live draft class stream with ' + cards().length + ' athlete cards'"
        >
          <div class="draft-class__fade draft-class__fade--left" aria-hidden="true"></div>
          <div class="draft-class__fade draft-class__fade--right" aria-hidden="true"></div>

          <div class="draft-class__track" [style.--draft-scroll-duration]="scrollDuration()">
            @for (card of cardsLoop(); track card.id + '-' + $index) {
              <article
                class="draft-class__card"
                [attr.aria-hidden]="$index >= cards().length ? 'true' : null"
              >
                <img
                  class="draft-class__photo"
                  [src]="card.imageSrc"
                  [alt]="$index < cards().length ? card.imageAlt : ''"
                  loading="lazy"
                  decoding="async"
                />

                <div class="draft-class__body">
                  <div class="draft-class__identity">
                    <p class="draft-class__name">{{ card.name }}</p>
                    <p class="draft-class__meta">{{ card.sportPositionClass }}</p>
                    <p class="draft-class__location">{{ card.location }}</p>
                  </div>

                  <div class="draft-class__footer">
                    <span class="draft-class__badge">
                      <span class="draft-class__badge-dot" aria-hidden="true"></span>
                      New Recruit
                    </span>

                    <a
                      class="draft-class__profile-link"
                      [routerLink]="card.profileRoute"
                      [attr.aria-label]="'View profile for ' + card.name"
                    >
                      View Profile
                    </a>
                  </div>
                </div>
              </article>
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
      }

      .draft-class {
        position: relative;
        overflow: hidden;
        padding: var(--nxt1-spacing-14) 0;
        background: var(--nxt1-color-bg-primary);
      }

      .draft-class__container {
        width: 100%;
        max-width: var(--nxt1-root-shell-max-width, 88rem);
        margin: 0 auto;
        padding: 0 var(--nxt1-spacing-4);
        box-sizing: border-box;
      }

      .draft-class__viewport {
        position: relative;
        margin-top: var(--nxt1-spacing-8);
        overflow: hidden;
        -webkit-mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 8%,
          black 92%,
          transparent 100%
        );
        mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 8%,
          black 92%,
          transparent 100%
        );
      }

      .draft-class__fade {
        position: absolute;
        top: 0;
        bottom: 0;
        width: var(--nxt1-spacing-10);
        z-index: 1;
        pointer-events: none;
      }

      .draft-class__fade--left {
        left: 0;
        background: linear-gradient(to right, var(--nxt1-color-bg-primary), transparent);
      }

      .draft-class__fade--right {
        right: 0;
        background: linear-gradient(to left, var(--nxt1-color-bg-primary), transparent);
      }

      .draft-class__track {
        display: flex;
        gap: var(--nxt1-spacing-4);
        width: max-content;
        animation: draft-class-scroll var(--draft-scroll-duration, 30s) linear infinite;
        will-change: transform;
      }

      .draft-class__viewport:hover .draft-class__track,
      .draft-class__viewport:focus-within .draft-class__track {
        animation-play-state: paused;
      }

      .draft-class__card {
        position: relative;
        flex: 0 0 min(19rem, 88vw);
        display: grid;
        grid-template-rows: auto 1fr;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        overflow: hidden;
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-sm);
        transition:
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .draft-class__card:hover,
      .draft-class__card:focus-within {
        transform: translateY(calc(var(--nxt1-spacing-1) * -1));
        border-color: var(--nxt1-color-alpha-primary30);
        box-shadow: var(--nxt1-shadow-md);
      }

      .draft-class__photo {
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .draft-class__body {
        display: grid;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
      }

      .draft-class__identity {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
      }

      .draft-class__name {
        margin: 0;
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        line-height: var(--nxt1-lineHeight-tight);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      .draft-class__meta,
      .draft-class__location {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .draft-class__meta {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .draft-class__location {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .draft-class__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .draft-class__badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-warning);
        background: var(--nxt1-color-warningBg);
        color: var(--nxt1-color-warningDark);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        line-height: var(--nxt1-lineHeight-tight);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .draft-class__badge-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-warning);
        box-shadow: 0 0 0 0 var(--nxt1-color-warning);
        animation: draft-class-pulse 2s var(--nxt1-motion-easing-inOut) infinite;
      }

      .draft-class__profile-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: var(--nxt1-spacing-8);
        padding: 0 var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary12);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        line-height: var(--nxt1-lineHeight-tight);
        font-weight: var(--nxt1-fontWeight-semibold);
        text-decoration: none;
        opacity: 0;
        transform: translateY(var(--nxt1-spacing-1));
        transition:
          opacity var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          background var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .draft-class__card:hover .draft-class__profile-link,
      .draft-class__card:focus-within .draft-class__profile-link {
        opacity: 1;
        transform: translateY(0);
      }

      .draft-class__profile-link:hover,
      .draft-class__profile-link:focus-visible {
        background: var(--nxt1-color-alpha-primary20);
      }

      @keyframes draft-class-scroll {
        0% {
          transform: translate3d(0, 0, 0);
        }
        100% {
          transform: translate3d(-50%, 0, 0);
        }
      }

      @keyframes draft-class-pulse {
        0% {
          box-shadow: 0 0 0 0 var(--nxt1-color-warning);
          transform: scale(1);
        }
        70% {
          box-shadow: 0 0 0 var(--nxt1-spacing-2_5) transparent;
          transform: scale(1.08);
        }
        100% {
          box-shadow: 0 0 0 0 transparent;
          transform: scale(1);
        }
      }

      @media (max-width: 767px) {
        .draft-class {
          padding: var(--nxt1-spacing-12) 0;
        }

        .draft-class__viewport {
          margin-top: var(--nxt1-spacing-6);
        }

        .draft-class__card {
          flex-basis: min(17rem, 88vw);
        }

        .draft-class__profile-link {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .draft-class__track,
        .draft-class__badge-dot,
        .draft-class__card,
        .draft-class__profile-link {
          animation: none;
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtDraftClassTickerComponent {
  readonly joinedCount = input<number>(243);
  readonly cards = input<readonly DraftClassAthleteCard[]>(DEFAULT_DRAFT_CLASS_CARDS);
  readonly speedSeconds = input<number>(30);

  protected readonly cardsLoop = computed(() => [...this.cards(), ...this.cards()]);
  protected readonly scrollDuration = computed(() => `${this.speedSeconds()}s`);
  protected readonly subhead = computed(
    () => `${this.joinedCount()} Athletes joined NXT1 in the last 24 hours. Are you next?`
  );
}
