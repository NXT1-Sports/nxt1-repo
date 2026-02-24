/**
 * @fileoverview Success Stories Section — Viral Proof
 * @module @nxt1/ui/components/success-stories
 *
 * Reusable social-proof section for content creation pages.
 * Built for SSR-safe semantics, responsive mobile/desktop layouts, and
 * design-token-driven styling.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

let successStoriesInstanceCounter = 0;

/** Story item for viral-proof screenshot cards. */
export interface SuccessStoryItem {
  readonly id: string;
  readonly viewsLabel: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly postLabel: string;
}

const VIRAL_PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 720 1280'%3E%3Crect width='720' height='1280' fill='%231A1A1A'/%3E%3Crect x='44' y='64' width='632' height='88' rx='18' fill='%232A2A2A'/%3E%3Crect x='44' y='188' width='632' height='792' rx='30' fill='%23222222'/%3E%3Crect x='44' y='1016' width='430' height='42' rx='12' fill='%232A2A2A'/%3E%3Crect x='44' y='1082' width='560' height='42' rx='12' fill='%232A2A2A'/%3E%3Ctext x='360' y='610' fill='%23E8E8E8' font-family='Arial,sans-serif' font-size='34' font-weight='700' text-anchor='middle'%3EViral Post Placeholder%3C/text%3E%3Ctext x='360' y='654' fill='%23A3A3A3' font-family='Arial,sans-serif' font-size='22' text-anchor='middle'%3EReplace with real NXT1 screenshot%3C/text%3E%3C/svg%3E";

const DEFAULT_STORIES: readonly SuccessStoryItem[] = [
  {
    id: 'viral-proof-1',
    viewsLabel: '104K Views',
    imageUrl: VIRAL_PLACEHOLDER_IMAGE,
    imageAlt: 'Placeholder screenshot for a viral NXT1 athlete post with 100 thousand plus views.',
    postLabel: 'NXT1 User Post',
  },
  {
    id: 'viral-proof-2',
    viewsLabel: '187K Views',
    imageUrl: VIRAL_PLACEHOLDER_IMAGE,
    imageAlt: 'Placeholder screenshot for an athlete reel generated with NXT1 and high engagement.',
    postLabel: 'NXT1 User Post',
  },
  {
    id: 'viral-proof-3',
    viewsLabel: '241K Views',
    imageUrl: VIRAL_PLACEHOLDER_IMAGE,
    imageAlt:
      'Placeholder screenshot for a recruiting highlight post that reached over one hundred thousand views.',
    postLabel: 'NXT1 User Post',
  },
] as const;

@Component({
  selector: 'nxt1-success-stories',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="success-stories" [attr.aria-labelledby]="titleId()">
      <div class="success-stories__header">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Success Stories"
          title="They Posted. They Blew Up."
          [headingLevel]="headingLevel()"
          subtitle="Viral proof from NXT1 athletes: real social posts crossing 100K+ views and creating recruiting momentum."
          variant="hero"
          align="center"
        />
      </div>

      <div
        class="success-stories__grid"
        role="list"
        aria-label="Viral NXT1 athlete posts with 100 thousand plus views"
      >
        @for (story of stories(); track story.id) {
          <article class="story-card" role="listitem" [attr.aria-label]="story.imageAlt">
            <figure class="story-card__phone-frame">
              <img
                class="story-card__image"
                [src]="story.imageUrl"
                [alt]="story.imageAlt"
                loading="lazy"
                decoding="async"
                width="720"
                height="1280"
              />
              <figcaption class="story-card__meta">
                <span class="story-card__post-label">{{ story.postLabel }}</span>
                <span class="story-card__views">{{ story.viewsLabel }}</span>
              </figcaption>
            </figure>
          </article>
        }
      </div>

      <div class="success-stories__proof" aria-label="Athlete viral proof statement">
        <blockquote class="success-stories__quote">
          “I got my first offer from a video I made in the car ride home.”
        </blockquote>
        <p class="success-stories__system-proof">Going viral isn't luck. It's a system.</p>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .success-stories {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        display: grid;
        gap: var(--nxt1-spacing-7);
        background: transparent;
      }

      .success-stories__header {
        margin: 0;
      }

      .success-stories__grid {
        display: grid;
        gap: var(--nxt1-spacing-4);
        grid-template-columns: 1fr;
      }

      .story-card {
        display: flex;
        justify-content: center;
      }

      .story-card__phone-frame {
        position: relative;
        margin: 0;
        width: min(100%, calc(var(--nxt1-spacing-12) * 4));
        max-width: calc(var(--nxt1-spacing-12) * 4);
        aspect-ratio: 9 / 16;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
        overflow: hidden;
        display: grid;
        box-shadow: var(--nxt1-shadow-md);
      }

      .story-card__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .story-card__meta {
        position: absolute;
        inset-inline: var(--nxt1-spacing-3);
        inset-block-end: var(--nxt1-spacing-3);
        margin: 0;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-glass-bgSolid);
        box-shadow: var(--nxt1-shadow-sm);
        backdrop-filter: var(--nxt1-glass-backdrop);
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .story-card__post-label {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        line-height: var(--nxt1-lineHeight-normal);
        text-transform: uppercase;
      }

      .story-card__views {
        margin: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-primary);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .success-stories__proof {
        display: grid;
        gap: var(--nxt1-spacing-3);
        margin: 0;
        padding: var(--nxt1-spacing-5);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
      }

      .success-stories__quote {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .success-stories__system-proof {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        line-height: var(--nxt1-lineHeight-relaxed);
        text-transform: uppercase;
      }

      @media (min-width: 768px) {
        .success-stories__grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .success-stories__quote {
          font-size: var(--nxt1-fontSize-2xl);
        }

        .success-stories__system-proof {
          font-size: var(--nxt1-fontSize-base);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSuccessStoriesComponent {
  private readonly instanceId = ++successStoriesInstanceCounter;

  /** Heading level for the section title. */
  readonly headingLevel = input<SectionHeaderLevel>(2);

  /** Story cards rendered in the section. */
  readonly stories = input<readonly SuccessStoryItem[]>(DEFAULT_STORIES);

  readonly titleId = computed(() => `success-stories-title-${this.instanceId}`);
}
