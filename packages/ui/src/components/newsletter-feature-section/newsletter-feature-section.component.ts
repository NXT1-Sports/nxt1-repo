/**
 * @fileoverview Newsletter Feature Section
 * @module @nxt1/ui/components/newsletter-feature-section
 *
 * Shared section for Media Coverage pages featuring the "Direct to Coaches"
 * weekly newsletter digest. Showcases an email preview card with subject line,
 * featured athlete stats, and call-to-action.
 * 100% design-token driven styles, SSR-safe, semantic, and accessible.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

let newsletterFeatureInstanceCounter = 0;

@Component({
  selector: 'nxt1-newsletter-feature-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="newsletter-feature" [attr.aria-labelledby]="titleId()">
      <div class="newsletter-feature__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Direct to Coaches"
          title="Land in Their Inbox."
          [headingLevel]="headingLevel()"
          variant="hero"
          layout="split"
          contentPosition="start"
          subtitle="Our weekly digest is read by 5,000+ college coaches. Get featured and skip the cold DM."
          support="Weekly placement designed to put your profile in front of college programs already scouting your region."
        >
          <article class="newsletter-card" [attr.aria-labelledby]="previewTitleId()" role="article">
            <header class="newsletter-card__header">
              <p class="newsletter-card__eyebrow">Email Preview</p>
              @switch (innerHeadingLevel()) {
                @case (3) {
                  <h3 class="newsletter-card__title" [id]="previewTitleId()">NXT1 Weekly Digest</h3>
                }
                @case (4) {
                  <h4 class="newsletter-card__title" [id]="previewTitleId()">NXT1 Weekly Digest</h4>
                }
                @case (5) {
                  <h5 class="newsletter-card__title" [id]="previewTitleId()">NXT1 Weekly Digest</h5>
                }
                @case (6) {
                  <h6 class="newsletter-card__title" [id]="previewTitleId()">NXT1 Weekly Digest</h6>
                }
              }
            </header>

            <div class="newsletter-card__subject" role="group" aria-label="Newsletter subject line">
              <p class="newsletter-card__label">Subject</p>
              <p class="newsletter-card__subject-text">
                NXT1 Weekly: Top 10 Risers in the Southeast.
              </p>
            </div>

            <div
              class="newsletter-card__content"
              role="group"
              aria-label="Newsletter feature content preview"
            >
              <img
                class="newsletter-card__photo"
                src="/assets/images/og-image.jpg"
                alt="Featured athlete in the NXT1 weekly digest"
                loading="lazy"
                decoding="async"
                width="112"
                height="112"
              />

              <div class="newsletter-card__details">
                <p class="newsletter-card__athlete">Featured Athlete</p>
                <p class="newsletter-card__stats">6'3" WR • 4.46 40 • 42" Vertical • 3.9 GPA</p>
                <a
                  class="newsletter-card__button"
                  href="/auth"
                  aria-label="View full athlete profile"
                >
                  View Full Profile
                </a>
              </div>
            </div>
          </article>
        </nxt1-section-header>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .newsletter-feature {
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .newsletter-feature__shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      .newsletter-card {
        display: grid;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-6);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        background: var(--nxt1-color-surface-100);
      }

      .newsletter-card__header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .newsletter-card__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .newsletter-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .newsletter-card__subject {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
      }

      .newsletter-card__label {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .newsletter-card__subject-text {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .newsletter-card__content {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
      }

      .newsletter-card__photo {
        width: 100%;
        max-width: var(--nxt1-spacing-28);
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: var(--nxt1-borderRadius-lg);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
      }

      .newsletter-card__details {
        display: grid;
        gap: var(--nxt1-spacing-2);
        align-content: start;
      }

      .newsletter-card__athlete {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .newsletter-card__stats {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .newsletter-card__button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: var(--nxt1-spacing-2);
        width: fit-content;
        min-height: var(--nxt1-spacing-10);
        padding: 0 var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-black);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        text-decoration: none;
        transition: filter var(--nxt1-motion-duration-fast, 150ms)
          var(--nxt1-motion-easing-standard, ease-out);
      }

      .newsletter-card__button:hover,
      .newsletter-card__button:focus-visible {
        filter: brightness(0.96);
      }

      .newsletter-card__button:focus-visible {
        outline: 2px solid var(--nxt1-color-focus-ring, var(--nxt1-color-primary, #ccff00));
        outline-offset: 2px;
      }

      @media (min-width: 768px) {
        .newsletter-card__content {
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
        }

        .newsletter-card__photo {
          width: var(--nxt1-spacing-28);
          max-width: none;
        }
      }

      @media (max-width: 767px) {
        .newsletter-card {
          padding: var(--nxt1-spacing-5);
        }

        .newsletter-card__title {
          font-size: var(--nxt1-fontSize-lg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtNewsletterFeatureSectionComponent {
  private readonly instanceId = ++newsletterFeatureInstanceCounter;

  readonly headingLevel = input<SectionHeaderLevel>(2);

  readonly titleId = computed(() => `newsletter-feature-title-${this.instanceId}`);
  readonly previewTitleId = computed(() => `newsletter-feature-preview-title-${this.instanceId}`);
  readonly innerHeadingLevel = computed(
    () => Math.min(this.headingLevel() + 1, 6) as SectionHeaderLevel
  );
}
