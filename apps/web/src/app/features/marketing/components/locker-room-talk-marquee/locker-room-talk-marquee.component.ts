/**
 * @fileoverview Locker Room Talk Reviews Marquee
 * @module apps/web/features/marketing/components/locker-room-talk-marquee
 * @version 1.0.0
 *
 * Premium, auto-scrolling verified review cards for recruiting persona pages.
 * Built with SSR-safe CSS animation and design-token driven styling.
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';
import { IMAGE_PATHS } from '@nxt1/design-tokens/assets';

export interface LockerRoomReviewItem {
  readonly id: string;
  readonly quote: string;
  readonly athleteName: string;
  readonly sport: string;
  readonly badge: 'Committed D1' | 'Verified Athlete' | 'State Champ';
  readonly rating: 5;
  readonly avatarSrc: string;
  readonly avatarAlt: string;
}

const LOCKER_ROOM_REVIEWS: readonly LockerRoomReviewItem[] = [
  {
    id: 'locker-review-sarah',
    quote: 'Agent X got my highlights in front of Oregon. I signed 3 weeks later.',
    athleteName: 'Sarah',
    sport: 'Volleyball',
    badge: 'Committed D1',
    rating: 5,
    avatarSrc: `/${IMAGE_PATHS.athlete2}`,
    avatarAlt: 'Sarah, volleyball athlete',
  },
  {
    id: 'locker-review-marcus',
    quote: 'My graphic went viral on Twitter. 50k views in an hour.',
    athleteName: 'Marcus',
    sport: 'Basketball',
    badge: 'Verified Athlete',
    rating: 5,
    avatarSrc: `/${IMAGE_PATHS.athlete1}`,
    avatarAlt: 'Marcus, basketball athlete',
  },
  {
    id: 'locker-review-jalen',
    quote: "Finally, a profile that doesn't look like 2010 Facebook.",
    athleteName: 'Jalen',
    sport: 'Football',
    badge: 'State Champ',
    rating: 5,
    avatarSrc: `/${IMAGE_PATHS.athlete5}`,
    avatarAlt: 'Jalen, football athlete',
  },
] as const;

@Component({
  selector: 'nxt1-locker-room-talk-marquee',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent],
  template: `
    <section class="locker-room-talk" role="region" aria-labelledby="locker-room-talk-title">
      <div class="locker-room-talk__container">
        <nxt1-section-header
          titleId="locker-room-talk-title"
          [headingLevel]="2"
          align="center"
          eyebrow="Locker Room Talk"
          title="The Hype is Real."
          subtitle="Verified reviews from athletes building real recruiting momentum on NXT1."
        />

        <div
          class="locker-room-talk__marquee"
          role="marquee"
          [attr.aria-label]="
            'Auto-scrolling verified athlete reviews: ' + reviews.length + ' total reviews'
          "
        >
          <div class="locker-room-talk__fade locker-room-talk__fade--left" aria-hidden="true"></div>
          <div
            class="locker-room-talk__fade locker-room-talk__fade--right"
            aria-hidden="true"
          ></div>

          <div class="locker-room-talk__track">
            @for (review of reviewsLoop; track review.id + '-' + $index) {
              <article
                class="locker-room-talk__card"
                [attr.aria-hidden]="$index >= reviews.length ? 'true' : null"
              >
                <header class="locker-room-talk__card-header">
                  <img
                    class="locker-room-talk__avatar"
                    [src]="review.avatarSrc"
                    [alt]="$index < reviews.length ? review.avatarAlt : ''"
                    loading="lazy"
                    decoding="async"
                  />

                  <div class="locker-room-talk__identity">
                    <p class="locker-room-talk__name">{{ review.athleteName }}</p>
                    <p class="locker-room-talk__sport">{{ review.sport }}</p>
                  </div>

                  <span class="locker-room-talk__badge">{{ review.badge }}</span>
                </header>

                <blockquote class="locker-room-talk__quote">“{{ review.quote }}”</blockquote>

                <footer class="locker-room-talk__meta">
                  <span class="locker-room-talk__stars" aria-label="5 out of 5 stars">★★★★★</span>
                  <span class="locker-room-talk__verified">Verified Review</span>
                </footer>
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

      .locker-room-talk {
        position: relative;
        overflow: hidden;
        padding: var(--nxt1-spacing-16) 0;
        background: var(--nxt1-color-bg-primary);
      }

      .locker-room-talk__container {
        width: 100%;
        max-width: var(--nxt1-root-shell-max-width, 88rem);
        margin: 0 auto;
        padding: 0 var(--nxt1-spacing-4);
        box-sizing: border-box;
      }

      .locker-room-talk__marquee {
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

      .locker-room-talk__fade {
        position: absolute;
        top: 0;
        bottom: 0;
        width: var(--nxt1-spacing-10);
        z-index: 1;
        pointer-events: none;
      }

      .locker-room-talk__fade--left {
        left: 0;
        background: linear-gradient(to right, var(--nxt1-color-bg-primary), transparent);
      }

      .locker-room-talk__fade--right {
        right: 0;
        background: linear-gradient(to left, var(--nxt1-color-bg-primary), transparent);
      }

      .locker-room-talk__track {
        display: flex;
        gap: var(--nxt1-spacing-4);
        width: max-content;
        animation: locker-room-talk-scroll 26s linear infinite;
        will-change: transform;
      }

      .locker-room-talk__marquee:hover .locker-room-talk__track,
      .locker-room-talk__marquee:focus-within .locker-room-talk__track {
        animation-play-state: paused;
      }

      .locker-room-talk__card {
        flex: 0 0 min(22rem, 84vw);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-sm);
      }

      .locker-room-talk__card-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .locker-room-talk__avatar {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        object-fit: cover;
        flex-shrink: 0;
      }

      .locker-room-talk__identity {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .locker-room-talk__name {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        line-height: var(--nxt1-lineHeight-tight);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .locker-room-talk__sport {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-normal);
        color: var(--nxt1-color-text-tertiary);
      }

      .locker-room-talk__badge {
        margin-left: auto;
        flex-shrink: 0;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary12);
        color: var(--nxt1-color-primary);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        line-height: var(--nxt1-lineHeight-tight);
        font-weight: var(--nxt1-fontWeight-semibold);
        white-space: nowrap;
      }

      .locker-room-talk__quote {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-md);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
      }

      .locker-room-talk__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .locker-room-talk__stars {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        line-height: var(--nxt1-lineHeight-tight);
        color: var(--nxt1-color-warning);
        letter-spacing: var(--nxt1-spacing-0_5);
      }

      .locker-room-talk__verified {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        line-height: var(--nxt1-lineHeight-normal);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
      }

      @keyframes locker-room-talk-scroll {
        0% {
          transform: translate3d(0, 0, 0);
        }
        100% {
          transform: translate3d(-50%, 0, 0);
        }
      }

      @media (max-width: 767px) {
        .locker-room-talk {
          padding: var(--nxt1-spacing-12) 0;
        }

        .locker-room-talk__marquee {
          margin-top: var(--nxt1-spacing-6);
        }

        .locker-room-talk__card {
          flex-basis: min(19rem, 88vw);
          padding: var(--nxt1-spacing-4);
        }

        .locker-room-talk__quote {
          font-size: var(--nxt1-fontSize-sm);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .locker-room-talk__track {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtLockerRoomTalkMarqueeComponent {
  protected readonly reviews = LOCKER_ROOM_REVIEWS;
  protected readonly reviewsLoop = [...LOCKER_ROOM_REVIEWS, ...LOCKER_ROOM_REVIEWS];
}
