/**
 * @fileoverview Educational Library (SEO Content Hub) Section
 * @module @nxt1/ui/components/educational-library
 *
 * Reusable marketing section rendering a 3-column blog preview grid
 * for high-intent SEO content (recruiting calendar, coach outreach,
 * NIL education). Fully SSR-safe, design-token styled, and
 * structured for Schema.org BlogPosting JSON-LD enrichment.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtSectionHeaderComponent } from '../section-header';

/** Single article preview for the Educational Library grid. */
export interface EducationalLibraryItem {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly href: string;
  readonly imagePlaceholderLabel: string;
  readonly readTimeLabel: string;
  readonly publishedIsoDate: string;
  readonly publishedDisplayDate: string;
}

export const EDUCATIONAL_LIBRARY_DEFAULT_ITEMS: readonly EducationalLibraryItem[] = [
  {
    id: 'recruiting-calendar-2026',
    title: "The 2026 Recruiting Calendar: Dates You Can't Miss.",
    excerpt:
      'Track every major recruiting milestone with a month-by-month breakdown so your profile, outreach, and visit strategy stay ahead of deadlines.',
    href: '/news/the-2026-recruiting-calendar-dates-you-cant-miss',
    imagePlaceholderLabel: 'Recruiting Calendar Preview',
    readTimeLabel: '7 min read',
    publishedIsoDate: '2026-01-14',
    publishedDisplayDate: 'Jan 14, 2026',
  },
  {
    id: 'dm-college-coach-templates',
    title: 'How to DM a College Coach: 5 Templates.',
    excerpt:
      'Use ready-to-send DM frameworks that are concise, coach-friendly, and built to increase response rates without sounding generic.',
    href: '/news/how-to-dm-a-college-coach-5-templates',
    imagePlaceholderLabel: 'Coach DM Templates Preview',
    readTimeLabel: '6 min read',
    publishedIsoDate: '2026-01-26',
    publishedDisplayDate: 'Jan 26, 2026',
  },
  {
    id: 'nil-valuation-101',
    title: 'NIL Valuation 101.',
    excerpt:
      'Understand what drives NIL value, how athletes are benchmarked, and which profile signals improve long-term brand and recruiting leverage.',
    href: '/news/nil-valuation-101',
    imagePlaceholderLabel: 'NIL Valuation Guide Preview',
    readTimeLabel: '8 min read',
    publishedIsoDate: '2026-02-02',
    publishedDisplayDate: 'Feb 2, 2026',
  },
] as const;

@Component({
  selector: 'nxt1-educational-library',
  standalone: true,
  imports: [CommonModule, NxtCtaButtonComponent, NxtSectionHeaderComponent],
  template: `
    <section class="educational-library" aria-labelledby="educational-library-title">
      <div class="educational-library__header">
        <nxt1-section-header
          title="Educational Library"
          subtitle="Practical recruiting education built for athletes, parents, and coaches."
          eyebrow="For Athletes, Parents & Coaches"
          titleId="educational-library-title"
        />

        <div class="educational-library__actions" aria-label="Educational Library actions">
          <nxt1-cta-button
            label="Explore News"
            route="/news"
            variant="primary"
            ariaLabel="Explore NXT1 news articles"
          />
          <nxt1-cta-button
            label="Sign In"
            route="/auth"
            variant="secondary"
            ariaLabel="Sign in to your NXT1 account"
          />
        </div>
      </div>

      <div
        class="educational-library__grid"
        role="list"
        aria-label="Educational Library article previews"
      >
        @for (article of items(); track article.id) {
          <article class="library-card" role="listitem">
            <a class="library-card__media" [href]="article.href" tabindex="-1" aria-hidden="true">
              <div
                class="library-card__media-placeholder"
                role="img"
                [attr.aria-label]="article.imagePlaceholderLabel"
              >
                <span class="library-card__media-pill">Article Preview</span>
                <span class="library-card__media-title">{{ article.imagePlaceholderLabel }}</span>
              </div>
            </a>

            <header class="library-card__meta">
              <p class="library-card__details">
                <time [attr.datetime]="article.publishedIsoDate">{{
                  article.publishedDisplayDate
                }}</time>
                <span aria-hidden="true">•</span>
                <span>{{ article.readTimeLabel }}</span>
              </p>
            </header>

            <h3 class="library-card__title">
              <a class="library-card__title-link" [href]="article.href">{{ article.title }}</a>
            </h3>

            <p class="library-card__excerpt">{{ article.excerpt }}</p>

            <a
              class="library-card__cta"
              [href]="article.href"
              aria-label="Read article: {{ article.title }}"
            >
              Read article
            </a>
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

      .educational-library {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .educational-library__header {
        margin-bottom: var(--nxt1-spacing-7);
      }

      .educational-library__actions {
        margin-top: var(--nxt1-spacing-5);
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-3);
      }

      .educational-library__grid {
        display: grid;
        gap: var(--nxt1-spacing-4);
        grid-template-columns: 1fr;
      }

      .library-card {
        display: grid;
        gap: var(--nxt1-spacing-4);
        height: 100%;
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .library-card__media {
        display: block;
        text-decoration: none;
      }

      .library-card__media-placeholder {
        display: grid;
        align-content: end;
        gap: var(--nxt1-spacing-2);
        min-height: calc(var(--nxt1-spacing-12) * 3);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          160deg,
          var(--nxt1-color-surface-200),
          var(--nxt1-color-surface-100)
        );
      }

      .library-card__media-pill {
        width: fit-content;
        margin: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .library-card__media-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .library-card__meta {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
      }

      .library-card__details {
        margin: 0;
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .library-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .library-card__title-link {
        color: inherit;
        text-decoration: none;
        transition: color var(--nxt1-motion-duration-fast, 150ms)
          var(--nxt1-motion-easing-default, ease);
      }

      .library-card__title-link:hover {
        color: var(--nxt1-color-primary);
      }

      .library-card__title-link:focus-visible {
        color: var(--nxt1-color-primary);
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
        border-radius: var(--nxt1-borderRadius-sm);
      }

      .library-card__excerpt {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .library-card__cta {
        width: fit-content;
        margin-top: auto;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        text-decoration: none;
        transition: color var(--nxt1-motion-duration-fast, 150ms)
          var(--nxt1-motion-easing-default, ease);
      }

      .library-card__cta:hover {
        color: var(--nxt1-color-text-primary);
      }

      .library-card__cta:focus-visible {
        color: var(--nxt1-color-text-primary);
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
        border-radius: var(--nxt1-borderRadius-sm);
      }

      @media (min-width: 768px) {
        .educational-library__grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (min-width: 1200px) {
        .educational-library__grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 991px) {
        .library-card__title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .library-card__excerpt {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtEducationalLibraryComponent {
  readonly items = input<readonly EducationalLibraryItem[]>(EDUCATIONAL_LIBRARY_DEFAULT_ITEMS);
}
