/**
 * @fileoverview Success Stories Section — Emotional Verification
 * @module @nxt1/ui/components/success-stories
 *
 * Reusable marketing section highlighting "Zero to Hero" case studies.
 * Built for landing pages with SSR-safe semantics, responsive vertical-video
 * cards, and full design-token styling.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Story item for emotional verification case studies. */
export interface SuccessStoryItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly spotlight: string;
  readonly formatLabel: string;
  readonly videoLength: string;
  /** Crawlable URL to the video content (used as href on the CTA). */
  readonly videoUrl: string;
}

const DEFAULT_STORIES: readonly SuccessStoryItem[] = [
  {
    id: 'underrated-2-star-d1-offer',
    title: 'The Underrated 2-Star Who Earned a D1 Offer',
    summary:
      'From overlooked prospect to nationally visible recruit by publishing a complete NXT1 profile, consistent vertical highlights, and verified progress updates.',
    spotlight: 'Zero to Hero: athlete breakthrough story',
    formatLabel: 'Vertical Interview',
    videoLength: '00:58',
    videoUrl: '/stories/underrated-2-star-d1-offer',
  },
  {
    id: 'small-school-national-brand',
    title: 'The Small School That Built a National Brand',
    summary:
      'A local program transformed visibility by standardizing athlete storytelling, posting short interview reels, and showcasing recruiting momentum in one destination.',
    spotlight: 'Zero to Hero: program transformation story',
    formatLabel: 'Vertical Interview',
    videoLength: '01:06',
    videoUrl: '/stories/small-school-national-brand',
  },
] as const;

@Component({
  selector: 'nxt1-success-stories',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="success-stories" aria-labelledby="success-stories-title">
      <div class="success-stories__header">
        <p class="success-stories__eyebrow">Success Stories</p>
        <h2 id="success-stories-title" class="success-stories__title">
          Emotional Verification.
          <span class="success-stories__accent">This Could Be You.</span>
        </h2>
        <p class="success-stories__subtitle">
          Real Zero to Hero journeys from athletes and programs using NXT1 to create momentum,
          trust, and breakthrough recruiting outcomes.
        </p>
      </div>

      <div class="success-stories__grid" role="list" aria-label="NXT1 success story case studies">
        @for (story of stories(); track story.id) {
          <article class="story-card" role="listitem" [attr.aria-label]="story.title">
            <div class="story-card__media">
              <div class="story-card__phone-frame">
                <p class="story-card__format" aria-hidden="true">{{ story.formatLabel }}</p>
                <p class="story-card__duration" aria-hidden="true">{{ story.videoLength }}</p>
                <a
                  class="story-card__play-pill"
                  [href]="story.videoUrl"
                  aria-label="Watch video: {{ story.title }}"
                  >Watch Video</a
                >
              </div>
            </div>

            <div class="story-card__body">
              <p class="story-card__spotlight">{{ story.spotlight }}</p>
              <h3 class="story-card__title">{{ story.title }}</h3>
              <p class="story-card__summary">{{ story.summary }}</p>
            </div>
          </article>
        }
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
        background: transparent;
      }

      .success-stories__header {
        display: grid;
        gap: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-8);
        max-width: var(--nxt1-section-subtitle-max-width, 56rem);
      }

      .success-stories__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .success-stories__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .success-stories__accent {
        color: var(--nxt1-color-primary);
      }

      .success-stories__subtitle {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .success-stories__grid {
        display: grid;
        gap: var(--nxt1-spacing-6);
        grid-template-columns: 1fr;
      }

      .story-card {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .story-card__media {
        display: flex;
        min-width: 0;
      }

      .story-card__phone-frame {
        position: relative;
        width: min(100%, calc(var(--nxt1-spacing-12) * 3));
        max-width: calc(var(--nxt1-spacing-12) * 3);
        aspect-ratio: 9 / 16;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: linear-gradient(
          160deg,
          var(--nxt1-color-alpha-primary10),
          var(--nxt1-color-surface-200) 55%,
          var(--nxt1-color-alpha-primary10)
        );
        overflow: hidden;
        display: grid;
        align-content: space-between;
        padding: var(--nxt1-spacing-4);
      }

      .story-card__format,
      .story-card__duration {
        margin: 0;
        display: inline-flex;
        align-items: center;
        width: fit-content;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .story-card__duration {
        justify-self: end;
      }

      .story-card__play-pill {
        justify-self: center;
        min-height: var(--nxt1-button-height-sm, 36px);
        padding: 0 var(--nxt1-spacing-4);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        text-decoration: none;
        cursor: pointer;
        transition: opacity 0.15s ease;
      }

      .story-card__play-pill:hover {
        opacity: 0.88;
      }

      .story-card__body {
        display: grid;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }

      .story-card__spotlight {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .story-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .story-card__summary {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      @media (min-width: 992px) {
        .success-stories__grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .story-card {
          grid-template-columns: minmax(0, calc(var(--nxt1-spacing-12) * 3)) minmax(0, 1fr);
          align-items: start;
        }

        .story-card__title {
          font-size: var(--nxt1-fontSize-2xl);
        }
      }

      @media (max-width: 991px) {
        .success-stories__title {
          font-size: var(--nxt1-fontSize-xl);
        }

        .story-card__title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .story-card__summary {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSuccessStoriesComponent {
  /** Story cards rendered in the section. */
  readonly stories = input<readonly SuccessStoryItem[]>(DEFAULT_STORIES);
}
