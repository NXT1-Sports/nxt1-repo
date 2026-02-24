/**
 * @fileoverview NxtBreakingNewsHeroComponent — Breaking News Hero
 * @module @nxt1/ui/components/breaking-news-hero
 *
 * Shared hero for Media Coverage pages with a live-broadcast visual treatment.
 * Uses shared CTA infrastructure via NxtHeroSectionComponent:
 * - Desktop: shared CTA buttons
 * - Mobile: shared App Store / Google Play badges
 *
 * 100% design-token driven styles, SSR-safe, semantic, and accessible.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxtHeroSectionComponent, type HeadingLevel } from '../hero-section';

@Component({
  selector: 'nxt1-breaking-news-hero',
  standalone: true,
  imports: [NxtHeroSectionComponent],
  template: `
    <nxt1-hero-section
      badgeIcon="newspaper-outline"
      badgeLabel="Breaking News"
      title="Every Athlete Deserves a Headline."
      subtitle="Professional media coverage for every level. From freshman JV to 5-star senior."
      support="Turn highlights into polished, coach-ready stories with a broadcast-grade presentation that elevates your profile."
      primaryCtaLabel="Start Free With NXT1"
      primaryCtaRoute="/auth"
      secondaryCtaLabel="Explore News"
      secondaryCtaRoute="/news"
      secondaryCtaVariant="ghost"
      [headingLevel]="headingLevel()"
      [ariaId]="titleId()"
    >
      <div class="broadcast-hero" role="img" [attr.aria-label]="ariaLabel()">
        <div class="broadcast-hero__frame">
          <div class="broadcast-hero__header">
            <span class="broadcast-hero__live-pill">
              <span class="broadcast-hero__live-dot" aria-hidden="true"></span>
              LIVE
            </span>
            <p class="broadcast-hero__network">NXT1 Sports Report</p>
            <span class="broadcast-hero__segment">Recruiting Spotlight</span>
          </div>

          <div class="broadcast-hero__screen">
            <div class="broadcast-hero__headshot" aria-hidden="true">
              <span class="broadcast-hero__initials">AJ</span>
            </div>

            <div class="broadcast-hero__analysis">
              <p class="broadcast-hero__analysis-label">Tonight’s Feature</p>
              <h3 class="broadcast-hero__analysis-title">
                {{ athleteName() }} · QB · Class of 2027
              </h3>
              <p class="broadcast-hero__analysis-copy">
                Poised decision-maker with high-level pocket command and explosive off-platform
                playmaking.
              </p>
            </div>
          </div>

          <div class="broadcast-hero__lower-third" aria-label="Athlete headline and key stats">
            <div class="broadcast-hero__identity">
              <p class="broadcast-hero__name">{{ athleteName() }}</p>
              <p class="broadcast-hero__meta">Austin, TX · Westlake HS</p>
            </div>
            <ul class="broadcast-hero__stats" aria-label="Featured statistics">
              <li class="broadcast-hero__stat">4.58 40Y</li>
              <li class="broadcast-hero__stat">3.9 GPA</li>
              <li class="broadcast-hero__stat">12 Offers</li>
            </ul>
          </div>

          <div class="broadcast-hero__ticker" aria-hidden="true">
            <div class="broadcast-hero__ticker-track">
              <span class="broadcast-hero__ticker-item"
                >NXT1 REPORT · Verified athletic metrics updated</span
              >
              <span class="broadcast-hero__ticker-item"
                >Coach engagement trend: +38% this month</span
              >
              <span class="broadcast-hero__ticker-item">New highlight package published</span>
              <span class="broadcast-hero__ticker-item"
                >NXT1 REPORT · Verified athletic metrics updated</span
              >
              <span class="broadcast-hero__ticker-item"
                >Coach engagement trend: +38% this month</span
              >
              <span class="broadcast-hero__ticker-item">New highlight package published</span>
            </div>
          </div>
        </div>
      </div>
    </nxt1-hero-section>
  `,
  styles: [
    `
      :host {
        display: block;

        /* Local overrides for ticker animation */
        --_ticker-duration: 20s;
      }

      /* CTA buttons inherit default token sizes from nxt1-cta-button base */

      .broadcast-hero {
        width: 100%;
        max-width: var(--nxt1-section-max-width-narrow);
        margin-inline: auto;
      }

      .broadcast-hero__frame {
        display: grid;
        gap: var(--nxt1-spacing-0_5);
        background: var(--nxt1-color-surface-100);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-2xl);
        box-shadow: var(--nxt1-shadow-lg);
        overflow: hidden;
      }

      .broadcast-hero__header {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: var(--nxt1-spacing-2_5);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-200);
        border-bottom: var(--nxt1-spacing-px) solid var(--nxt1-color-border-default);
      }

      .broadcast-hero__live-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: color-mix(in srgb, var(--nxt1-color-error) 18%, transparent);
        border: var(--nxt1-spacing-px) solid
          color-mix(in srgb, var(--nxt1-color-error) 42%, transparent);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .broadcast-hero__live-dot {
        width: var(--nxt1-spacing-1_5);
        height: var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-error);
        box-shadow: var(--nxt1-glow-sm);
      }

      .broadcast-hero__network,
      .broadcast-hero__segment {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .broadcast-hero__network {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .broadcast-hero__segment {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .broadcast-hero__screen {
        display: grid;
        grid-template-columns: minmax(0, var(--nxt1-spacing-32)) 1fr;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        align-items: center;
      }

      .broadcast-hero__headshot {
        aspect-ratio: 3 / 4;
        border-radius: var(--nxt1-borderRadius-xl);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-default);
        background: linear-gradient(
          145deg,
          color-mix(in srgb, var(--nxt1-color-primary) 25%, var(--nxt1-color-surface-300)),
          var(--nxt1-color-surface-300)
        );
        display: grid;
        place-items: center;
      }

      .broadcast-hero__initials {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        color: var(--nxt1-color-text-primary);
      }

      .broadcast-hero__analysis {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .broadcast-hero__analysis-label {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .broadcast-hero__analysis-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .broadcast-hero__analysis-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-regular);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .broadcast-hero__lower-third {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-top: var(--nxt1-spacing-px) solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-300) 88%, transparent);
      }

      .broadcast-hero__identity {
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .broadcast-hero__name,
      .broadcast-hero__meta {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .broadcast-hero__name {
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .broadcast-hero__meta {
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .broadcast-hero__stats {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        list-style: none;
        margin: 0;
        padding: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .broadcast-hero__stat {
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .broadcast-hero__ticker {
        border-top: var(--nxt1-spacing-px) solid var(--nxt1-color-border-default);
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary) 12%,
          var(--nxt1-color-surface-200)
        );
        overflow: hidden;
      }

      .broadcast-hero__ticker-track {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-8);
        width: max-content;
        min-width: 200%;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        animation: breaking-news-ticker var(--_ticker-duration) linear infinite;
      }

      .broadcast-hero__ticker-item {
        white-space: nowrap;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-tight);
      }

      @media (max-width: 767px) {
        .broadcast-hero__header {
          grid-template-columns: 1fr;
          justify-items: start;
        }

        .broadcast-hero__screen {
          grid-template-columns: 1fr;
        }

        .broadcast-hero__headshot {
          max-width: var(--nxt1-spacing-32);
        }

        .broadcast-hero__lower-third {
          flex-direction: column;
          align-items: flex-start;
        }

        .broadcast-hero__stats {
          justify-content: flex-start;
        }
      }

      @keyframes breaking-news-ticker {
        from {
          transform: translateX(0%);
        }
        to {
          transform: translateX(-50%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .broadcast-hero__ticker-track {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtBreakingNewsHeroComponent {
  readonly headingLevel = input<HeadingLevel>(1);
  readonly titleId = input<string>('breaking-news-hero-title');
  readonly athleteName = input<string>('Avery Johnson');
  readonly ariaLabel = input<string>(
    'Live broadcast style NXT1 Sports Report preview showing athlete spotlight details and scrolling stats ticker'
  );
}
