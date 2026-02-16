/**
 * @fileoverview Shared Hero Section Component
 * @module @nxt1/ui/components/hero-section
 * @version 1.0.0
 *
 * Reusable two-column hero layout for feature landing pages.
 * Left column: badge, title (with accent span), subtitle, CTA buttons.
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
 *   primaryCtaLabel="Get Started Free"
 *   primaryCtaRoute="/auth/register"
 *   secondaryCtaLabel="Log In"
 *   secondaryCtaRoute="/auth/login"
 * >
 *   <nxt1-analytics-dashboard-preview />
 * </nxt1-hero-section>
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../icon';
import { NxtCtaButtonComponent } from '../cta-button';

/** Layout variant for the hero section. */
export type HeroLayout = 'split' | 'centered';

@Component({
  selector: 'nxt1-hero-section',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtCtaButtonComponent],
  template: `
    <section
      class="hero"
      [class.hero--centered]="layout() === 'centered'"
      [attr.aria-labelledby]="ariaId()"
    >
      <!-- Text Content Column -->
      <div class="hero-content">
        <!-- Badge -->
        @if (badgeLabel()) {
          <div class="hero-badge">
            @if (badgeIcon()) {
              <nxt1-icon [name]="badgeIcon()!" size="18" />
            }
            <span>{{ badgeLabel() }}</span>
          </div>
        }

        <!-- Title with Accent -->
        <h1 [id]="ariaId()" class="hero-title">
          {{ title() }}
          @if (accentText()) {
            <span class="hero-accent"> {{ accentText() }}</span>
          }
        </h1>

        <!-- Subtitle -->
        @if (subtitle()) {
          <p class="hero-subtitle">{{ subtitle() }}</p>
        }

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

      .hero--centered .hero-subtitle {
        margin-left: auto;
        margin-right: auto;
      }

      .hero--centered .hero-actions {
        justify-content: center;
      }

      /* ============================================
     * BADGE — Pill label above the title
     * ============================================ */
      .hero-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-full);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        font-family: var(--nxt1-fontFamily-brand);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        margin-bottom: var(--nxt1-spacing-4);
      }

      /* ============================================
     * TITLE — Large display heading with accent
     * ============================================ */
      .hero-title {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-4);
      }

      @media (min-width: 768px) {
        .hero-title {
          font-size: var(--nxt1-fontSize-4xl);
        }
      }

      .hero-accent {
        color: var(--nxt1-color-primary);
      }

      /* ============================================
     * SUBTITLE — Supporting description text
     * ============================================ */
      .hero-subtitle {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-6);
        max-width: var(--nxt1-section-subtitle-max-width);
      }

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

  /** Primary CTA button label. Omit to hide all CTAs. */
  readonly primaryCtaLabel = input<string>();

  /** Primary CTA route (defaults to register). */
  readonly primaryCtaRoute = input<string>('/auth/register');

  /** Secondary CTA button label. Omit to show only the primary CTA. */
  readonly secondaryCtaLabel = input<string>();

  /** Secondary CTA route (defaults to login). */
  readonly secondaryCtaRoute = input<string>('/auth/login');

  /** ARIA ID for the title element (auto-generated or override). */
  readonly ariaId = input<string>('hero-section-title');
}
