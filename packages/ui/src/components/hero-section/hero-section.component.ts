/**
 * @fileoverview Shared Hero Section Component
 * @module @nxt1/ui/components/hero-section
 * @version 1.0.0
 *
 * Reusable two-column hero layout for feature landing pages.
 * Left column: badge, title (with accent span), subtitle, support text, CTA buttons.
 * Right column: `<ng-content>` slot for feature-specific media/previews.
 *
 * Designed for reuse across `/analytics`, `/xp`, `/scout-reports`,
 * `/profile`, and any future feature landing pages.
 *
 * 100% design-token styling — zero hardcoded values.
 * SSR-safe, responsive, semantic HTML with ARIA.
 *
 * @example
 * ```html
 * <nxt1-hero-section
 *   badgeIcon="analytics-outline"
 *   badgeLabel="Analytics Dashboard"
 *   title="Your Recruiting Edge,"
 *   accentText="Powered by Data"
 *   subtitle="Real-time analytics for athletes and coaches."
 *   support="Verified metrics and live recruiting activity to help coaches evaluate faster."
 *   primaryCtaLabel="Get Started Free"
 *   primaryCtaRoute="/auth"
 *   secondaryCtaLabel="Log In"
 *   secondaryCtaRoute="/auth"
 * >
 *   <nxt1-analytics-dashboard-preview />
 * </nxt1-hero-section>
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtSectionHeaderComponent } from '../section-header';

/** Layout variant for the hero section. */
export type HeroLayout = 'split' | 'centered';

/** Semantic heading level (1–6). Defaults to 1 for top-level hero. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

@Component({
  selector: 'nxt1-hero-section',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent, NxtCtaButtonComponent],
  template: `
    <section
      class="hero"
      [class.hero--centered]="layout() === 'centered'"
      [attr.aria-labelledby]="ariaId()"
    >
      <!-- Text Content Column -->
      <div class="hero-content">
        <nxt1-section-header
          variant="standard"
          [titleId]="ariaId()"
          [headingLevel]="headingLevel()"
          [eyebrow]="badgeLabel()"
          [eyebrowIcon]="badgeIcon()"
          [title]="title()"
          [accentText]="accentText()"
          [subtitle]="subtitle()"
          [support]="support()"
        />

        <!-- CTA Buttons -->
        @if (primaryCtaLabel()) {
          <div class="hero-actions">
            <nxt1-cta-button
              [label]="primaryCtaLabel()!"
              [route]="primaryCtaRoute()"
              variant="primary"
            />
            @if (secondaryCtaLabel()) {
              <nxt1-cta-button
                [label]="secondaryCtaLabel()!"
                [route]="secondaryCtaRoute()"
                variant="secondary"
              />
            }
          </div>
        }
      </div>

      <!-- Media / Preview Slot -->
      <div class="hero-media">
        <ng-content />
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ============================================
     * HERO SECTION — Shared two-column layout
     * Text left, media right on desktop.
     * Stacked on mobile.
     * All spacing/sizing via design tokens.
     * ============================================ */
      .hero {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-8);
        padding: var(--nxt1-spacing-8) var(--nxt1-section-padding-x);
        padding-bottom: var(--nxt1-section-padding-y);
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        align-items: center;
      }

      @media (min-width: 992px) {
        .hero {
          grid-template-columns: 1fr 1.4fr;
          padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
          gap: var(--nxt1-spacing-12);
        }
      }

      /* Centered variant — single column, text centered */
      .hero--centered {
        text-align: center;
        justify-items: center;
      }

      @media (min-width: 992px) {
        .hero--centered {
          grid-template-columns: 1fr;
        }
      }

      .hero-content nxt1-section-header {
        width: 100%;
      }

      .hero--centered .hero-content nxt1-section-header {
        margin-left: auto;
        margin-right: auto;
      }

      .hero--centered .hero-actions {
        justify-content: center;
      }

      /* ============================================
     * BADGE — Pill label above the title
     * ============================================ */
      /* ============================================
     * CTA ACTIONS — Button row with wrap
     * ============================================ */
      .hero-actions {
        display: flex;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      /* ============================================
     * MEDIA SLOT — Right column container
     * ============================================ */
      .hero-media {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        min-height: 0;
        width: 100%;
      }

      /* ============================================
     * REDUCED MOTION
     * ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .hero-actions nxt1-cta-button:hover {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtHeroSectionComponent {
  /** Layout variant: 'split' (text left, media right) or 'centered' (single column). */
  readonly layout = input<HeroLayout>('split');

  /** Badge icon name (Ionicon). Omit to hide the icon. */
  readonly badgeIcon = input<string>();

  /** Badge label text. Omit to hide the badge entirely. */
  readonly badgeLabel = input<string>();

  /** Main title text (before the accent). */
  readonly title = input.required<string>();

  /** Accent-colored portion of the title. Rendered inline after `title`. */
  readonly accentText = input<string>();

  /** Subtitle / description paragraph below the title. */
  readonly subtitle = input<string>();

  /** Optional support text paragraph rendered below the subtitle. */
  readonly support = input<string>();

  /** Primary CTA button label. Omit to hide all CTAs. */
  readonly primaryCtaLabel = input<string>();

  /** Primary CTA route (defaults to register). */
  readonly primaryCtaRoute = input<string>('/auth');

  /** Secondary CTA button label. Omit to show only the primary CTA. */
  readonly secondaryCtaLabel = input<string>();

  /** Secondary CTA route (defaults to login). */
  readonly secondaryCtaRoute = input<string>('/auth');

  /** Semantic heading level (1-6). Use 2+ when another h1 exists on the page. */
  readonly headingLevel = input<HeadingLevel>(1);

  /** ARIA ID for the title element (auto-generated or override). */
  readonly ariaId = input<string>('hero-section-title');
}
