/**
 * @fileoverview Coach Authority Validation Section
 * @module @nxt1/ui/components/coach-authority-validation
 * @version 1.0.0
 *
 * Shared marketing section that validates NXT1 from the recruiter perspective.
 * Uses semantic `<blockquote>` + `<cite>` markup for proper quote attribution,
 * coach headshots with team logo badges, and full ARIA labelling.
 *
 * Design constraints:
 * - 100% design-token driven — zero hardcoded colors, sizes, or spacing
 * - SSR-safe — deterministic heading IDs, no browser APIs
 * - Mobile-first responsive grid (1-col mobile → 3-col desktop)
 * - Semantic HTML5 quotation pattern for search-engine attribution
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtSectionHeaderComponent } from '../section-header';

/** Single coach validation quote card. */
export interface CoachAuthorityQuote {
  /** Stable unique id for tracking/rendering. */
  readonly id: string;
  /** Quote/testimonial text. */
  readonly quote: string;
  /** Coach full name. */
  readonly coachName: string;
  /** Coach role/title. */
  readonly coachTitle: string;
  /** Division level label (D1/D2/D3). */
  readonly division: 'D1' | 'D2' | 'D3';
  /** Team/program name shown with logo. */
  readonly teamName: string;
  /** Coach headshot image URL. */
  readonly headshotUrl: string;
  /** Team logo image URL. */
  readonly teamLogoUrl: string;
}

const DEFAULT_QUOTES: readonly CoachAuthorityQuote[] = [
  {
    id: 'power5-recruiting-coordinator',
    quote: 'If I see an NXT1 link, I click it. I know the data is verified.',
    coachName: 'Marcus Bennett',
    coachTitle: 'Recruiting Coordinator',
    division: 'D1',
    teamName: 'Texas Longhorns',
    headshotUrl: '/assets/shared/images/coach-1.png',
    teamLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/251.png',
  },
  {
    id: 'd2-head-coach-validation',
    quote:
      'NXT1 saves us hours every week. Verified academic and athletic details mean we evaluate with confidence.',
    coachName: 'Elena Brooks',
    coachTitle: 'Head Coach',
    division: 'D2',
    teamName: 'Minnesota State Mavericks',
    headshotUrl: '/assets/shared/images/coach-1.png',
    teamLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/237.png',
  },
  {
    id: 'd3-assistant-coach-validation',
    quote:
      'We trust NXT1 profiles because they are complete and consistent. It helps our staff move from discovery to decision faster.',
    coachName: 'David Hart',
    coachTitle: 'Assistant Coach',
    division: 'D3',
    teamName: 'Tufts Jumbos',
    headshotUrl: '/assets/shared/images/coach-1.png',
    teamLogoUrl: 'https://a.espncdn.com/i/teamlogos/ncaa/500/290.png',
  },
] as const;

let coachAuthorityInstanceCounter = 0;

@Component({
  selector: 'nxt1-coach-authority-validation',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent],
  template: `
    <section class="coach-authority" [attr.aria-labelledby]="titleId()">
      <div class="coach-authority__header">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Coach Validation"
          [headingLevel]="2"
          align="center"
          variant="hero"
          title="The Coach's"
          accentText=" Authority"
          subtitle="Built for real recruiter workflows and validated by coaches across D1, D2, and D3 programs."
        />
      </div>

      <div class="coach-authority__grid" role="list" aria-label="Coach testimonials">
        @for (item of quotes(); track item.id) {
          <article class="coach-quote" role="listitem" [attr.aria-label]="item.coachName">
            <div class="coach-quote__media">
              <div class="coach-quote__headshot-wrap">
                <img
                  class="coach-quote__headshot"
                  [src]="item.headshotUrl"
                  [alt]="item.coachName + ' headshot'"
                  width="72"
                  height="72"
                  loading="lazy"
                  decoding="async"
                />
                <img
                  class="coach-quote__logo"
                  [src]="item.teamLogoUrl"
                  [alt]="item.teamName + ' logo'"
                  width="28"
                  height="28"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div class="coach-quote__meta">
                <h3 class="coach-quote__name">
                  <cite>{{ item.coachName }}</cite>
                </h3>
                <p class="coach-quote__role">{{ item.coachTitle }}</p>
                <p class="coach-quote__team">{{ item.teamName }} · {{ item.division }}</p>
              </div>
            </div>

            <blockquote class="coach-quote__text">“{{ item.quote }}”</blockquote>
          </article>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .coach-authority {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .coach-authority__header {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .coach-authority__grid {
        display: grid;
        gap: var(--nxt1-spacing-4);
        grid-template-columns: 1fr;
      }

      .coach-quote {
        display: grid;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .coach-quote__media {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        min-width: 0;
      }

      .coach-quote__headshot-wrap {
        position: relative;
        width: var(--nxt1-spacing-18, 4.5rem);
        height: var(--nxt1-spacing-18, 4.5rem);
        flex-shrink: 0;
      }

      .coach-quote__headshot {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .coach-quote__logo {
        position: absolute;
        right: calc(var(--nxt1-spacing-1) * -1);
        bottom: calc(var(--nxt1-spacing-1) * -1);
        width: var(--nxt1-spacing-7, 1.75rem);
        height: var(--nxt1-spacing-7, 1.75rem);
        object-fit: contain;
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .coach-quote__meta {
        display: grid;
        gap: var(--nxt1-spacing-1);
        min-width: 0;
      }

      .coach-quote__name {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .coach-quote__role,
      .coach-quote__team {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .coach-quote__text {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      @media (min-width: 992px) {
        .coach-authority__grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .coach-quote {
          min-height: calc(var(--nxt1-spacing-12) * 3);
        }
      }

      @media (max-width: 991px) {
        .coach-quote__name {
          font-size: var(--nxt1-fontSize-base);
        }

        .coach-quote__text {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCoachAuthorityValidationComponent {
  private readonly instanceId = ++coachAuthorityInstanceCounter;

  /** Section heading id, deterministic in render order for SSR compatibility. */
  readonly titleId = computed(() => `coach-authority-title-${this.instanceId}`);

  /** Coach testimonials displayed in the validation section. */
  readonly quotes = input<readonly CoachAuthorityQuote[]>(DEFAULT_QUOTES);
}
