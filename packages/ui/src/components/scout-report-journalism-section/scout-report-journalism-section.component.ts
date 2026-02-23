/**
 * @fileoverview Scout Report Journalism Section
 * @module @nxt1/ui/components/scout-report-journalism-section
 *
 * Shared section for Media Coverage pages featuring AI-supported journalism.
 * Token-driven, semantic, SSR-safe, and responsive for mobile + desktop.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

let scoutReportSectionInstanceCounter = 0;

@Component({
  selector: 'nxt1-scout-report-journalism-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="scout-report" [attr.aria-labelledby]="titleId()">
      <nxt1-section-header
        layout="split"
        contentPosition="start"
        eyebrow="The Scout Report"
        [titleId]="titleId()"
        [headingLevel]="headingLevel()"
        title="Your Scouting Report. AI-Supported. Coach-Ready."
        subtitle="Agent X supports professional scouting report creation from your verified stats and film. Published to your profile and shared with our network."
      >
        <article class="scout-report__article" aria-label="Scout report article preview">
          <header class="scout-report__article-header">
            <p class="scout-report__kicker">AI-Supported Journalism</p>
            <h3 class="scout-report__title">2027 Prospect Watch: Jordan Thomas Shows D1 Upside.</h3>
          </header>

          <figure class="scout-report__image-placeholder" aria-label="Article image placeholder">
            <div class="scout-report__image-shell" aria-hidden="true">
              <span class="scout-report__image-badge">Scout Report Visual</span>
            </div>
          </figure>

          <p class="scout-report__body-preview">
            The 6'3 guard from Dallas showcased elite court vision and a reliable pull-up jumper,
            while consistently creating high-value possessions in late-game situations. His pace,
            decision quality, and defensive effort point to strong D1 upside.
          </p>

          <footer class="scout-report__value">
            <p class="scout-report__value-label">Why It Matters</p>
            <p class="scout-report__value-copy">
              Agent X supports professional scouting reports based on your verified stats and film.
              Each report highlights strengths, development priorities, and recruiting context
              coaches can evaluate quickly. Published to your profile and shared with our network.
            </p>
          </footer>
        </article>
      </nxt1-section-header>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .scout-report {
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .scout-report__article {
        margin: 0;
        display: grid;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-default);
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--nxt1-color-surface-200) 92%, transparent),
          var(--nxt1-color-surface-100)
        );
        box-shadow: var(--nxt1-shadow-lg);
      }

      .scout-report__article-header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .scout-report__kicker,
      .scout-report__title,
      .scout-report__body-preview,
      .scout-report__value-label,
      .scout-report__value-copy {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
      }

      .scout-report__kicker {
        color: var(--nxt1-color-primary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .scout-report__title {
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        text-wrap: balance;
      }

      .scout-report__image-placeholder {
        margin: 0;
      }

      .scout-report__image-shell {
        aspect-ratio: 16 / 9;
        width: 100%;
        border-radius: var(--nxt1-borderRadius-xl);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-default);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--nxt1-color-primary) 22%, var(--nxt1-color-surface-300)),
          var(--nxt1-color-surface-200)
        );
        display: grid;
        place-items: center;
      }

      .scout-report__image-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: var(--nxt1-spacing-px) solid
          color-mix(in srgb, var(--nxt1-color-border-default) 80%, transparent);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 85%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-normal);
      }

      .scout-report__body-preview {
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        line-height: var(--nxt1-lineHeight-relaxed);
        max-width: var(--nxt1-section-subtitle-max-width, 56rem);
      }

      .scout-report__value {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: var(--nxt1-spacing-px) solid
          color-mix(in srgb, var(--nxt1-color-primary) 38%, var(--nxt1-color-border-default));
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary) 12%,
          var(--nxt1-color-surface-200)
        );
      }

      .scout-report__value-label {
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .scout-report__value-copy {
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      @media (max-width: 991px) {
        .scout-report__article {
          gap: var(--nxt1-spacing-3_5);
          padding: var(--nxt1-spacing-4);
          border-radius: var(--nxt1-borderRadius-xl);
        }

        .scout-report__title {
          font-size: var(--nxt1-fontSize-xl);
        }

        .scout-report__body-preview {
          font-size: var(--nxt1-fontSize-sm);
        }

        .scout-report__image-shell {
          border-radius: var(--nxt1-borderRadius-lg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtScoutReportJournalismSectionComponent {
  private readonly instanceId = ++scoutReportSectionInstanceCounter;

  readonly headingLevel = input<SectionHeaderLevel>(2);
  readonly titleId = computed(() => `scout-report-journalism-title-${this.instanceId}`);
}
