/**
 * @fileoverview NxtD1DreamHeroComponent — D1 Dream Athletes Hero Section
 * @module apps/web/features/marketing/components/d1-dream-hero
 * @version 2.0.0
 *
 * Full-width hero for the athletes persona landing page.
 * Left column: section header + app store download badges.
 * Right column: animated stacked carousel (9:16 aspect ratio)
 * cycling through the recruiting journey — The Grind → The Profile → The Signing.
 *
 * 100% design-token styling. SSR-safe (carousel auto-rotates browser-only).
 * Reduced-motion and a11y compliant.
 *
 * @example
 * ```html
 * <nxt1-d1-dream-hero ariaTitleId="athletes-hero" />
 * ```
 */

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtAppStoreBadgesComponent } from '@nxt1/ui/components/app-store-badges';
import { NxtCtaButtonComponent } from '@nxt1/ui/components/cta-button';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

export type D1DreamHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Carousel slide definition for the recruiting journey. */
interface CarouselSlide {
  readonly act: string;
  readonly icon: string;
  readonly title: string;
  readonly copy: string;
  readonly placeholderGradient: string;
}

/** All three acts of the recruiting journey. */
const CAROUSEL_SLIDES: readonly CarouselSlide[] = [
  {
    act: 'Act I',
    icon: 'fitness-outline',
    title: 'The Grind',
    copy: 'Early mornings. Real reps. Quiet grind.',
    placeholderGradient:
      'linear-gradient(160deg, var(--nxt1-color-surface-200) 0%, var(--nxt1-color-surface-300, #1a1a2e) 50%, var(--nxt1-color-surface-100) 100%)',
  },
  {
    act: 'Act II',
    icon: 'sparkles-outline',
    title: 'The Profile',
    copy: 'Verified stats. Elite highlights. Brand momentum.',
    placeholderGradient:
      'linear-gradient(160deg, var(--nxt1-color-surface-100) 0%, var(--nxt1-color-alpha-primary10) 50%, var(--nxt1-color-surface-200) 100%)',
  },
  {
    act: 'Act III',
    icon: 'document-text-outline',
    title: 'The Signing',
    copy: 'Scholarship secured. Future unlocked.',
    placeholderGradient:
      'linear-gradient(160deg, var(--nxt1-color-alpha-primary10) 0%, var(--nxt1-color-surface-200) 50%, var(--nxt1-color-surface-300, #1a1a2e) 100%)',
  },
] as const;

/** Auto-rotate interval in milliseconds. */
const AUTO_ROTATE_MS = 3_000;

@Component({
  selector: 'nxt1-d1-dream-hero',
  standalone: true,
  imports: [
    NxtAppStoreBadgesComponent,
    NxtCtaButtonComponent,
    NxtIconComponent,
    NxtSectionHeaderComponent,
  ],
  template: `
    <section class="d1-dream" [attr.aria-labelledby]="ariaTitleId()">
      <div class="d1-dream__content">
        <nxt1-section-header
          variant="hero"
          [titleId]="ariaTitleId()"
          [headingLevel]="headingLevel()"
          eyebrow="D1 Dream"
          title="Don't Just Play the Game. Change Your Life."
          subtitle="The only platform that turns your stats into scholarship offers and your highlights into a personal brand."
        />

        <div class="d1-dream__actions">
          <!-- Desktop: CTA button -->
          <nxt1-cta-button
            class="d1-dream__cta-desktop"
            label="Create Free NXT1 Profile"
            [route]="ctaRoute()"
            variant="primary"
          />

          <!-- Mobile: App store download badges -->
          <nxt1-app-store-badges class="d1-dream__cta-mobile" />
        </div>
      </div>

      <!-- Carousel -->
      <div
        class="d1-carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Recruiting journey stages"
        (mouseenter)="pauseAutoRotate()"
        (mouseleave)="resumeAutoRotate()"
        (focusin)="pauseAutoRotate()"
        (focusout)="resumeAutoRotate()"
      >
        <!-- Cards stack -->
        <div class="d1-carousel__stack">
          @for (slide of slides; track slide.act; let i = $index) {
            <article
              class="d1-carousel__card"
              [class.d1-carousel__card--front]="i === activeIndex()"
              [class.d1-carousel__card--back-1]="i === getBackIndex(1)"
              [class.d1-carousel__card--back-2]="i === getBackIndex(2)"
              [style.background]="slide.placeholderGradient"
              role="group"
              [attr.aria-roledescription]="'slide'"
              [attr.aria-label]="slide.act + ': ' + slide.title"
              [attr.aria-hidden]="i !== activeIndex()"
            >
              <!-- Placeholder overlay — swap for real image via background-image -->
              <div class="d1-carousel__placeholder">
                <div class="d1-carousel__icon-ring">
                  <nxt1-icon [name]="slide.icon" size="28" />
                </div>
                <span class="d1-carousel__badge">{{ slide.act }}</span>
                <h3 class="d1-carousel__title">{{ slide.title }}</h3>
                <p class="d1-carousel__copy">{{ slide.copy }}</p>
              </div>
            </article>
          }
        </div>

        <!-- Dot indicators -->
        <div class="d1-carousel__dots" role="tablist" aria-label="Select slide">
          @for (slide of slides; track slide.act; let i = $index) {
            <button
              class="d1-carousel__dot"
              [class.d1-carousel__dot--active]="i === activeIndex()"
              role="tab"
              [attr.aria-selected]="i === activeIndex()"
              [attr.aria-label]="slide.act"
              (click)="goToSlide(i)"
            ></button>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      /* ---------- Shimmer on placeholder ---------- */
      @keyframes d1-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      :host {
        display: block;
      }

      /* ---------- Layout ---------- */
      .d1-dream {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-8, 32px);
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      @media (min-width: 1024px) {
        .d1-dream {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: center;
          gap: var(--nxt1-spacing-10, 40px);
        }
      }

      /* ---------- Left Column ---------- */
      .d1-dream__content {
        display: grid;
        gap: var(--nxt1-spacing-4, 16px);
      }

      .d1-dream__content nxt1-section-header {
        display: block;
        width: 100%;
        max-width: var(--nxt1-spacing-120, 480px);
      }

      /* Mobile: center-align the section header + actions */
      @media (max-width: 767px) {
        .d1-dream__content {
          text-align: center;
        }

        .d1-dream__content nxt1-section-header {
          margin-inline: auto;
        }

        /* Scoped pierce to center the section-header grid internals on mobile */
        .d1-dream__content ::ng-deep .section-header {
          text-align: center;
          justify-items: center;
        }

        .d1-dream__content ::ng-deep .section-header__text {
          justify-items: center;
          text-align: center;
        }

        .d1-dream__actions {
          justify-content: center;
        }
      }

      .d1-dream__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      /* Desktop: show CTA, hide app badges */
      .d1-dream__cta-desktop {
        display: none;
      }

      .d1-dream__cta-mobile {
        display: inline-flex;
      }

      @media (min-width: 1024px) {
        .d1-dream__cta-desktop {
          display: inline-flex;
        }

        .d1-dream__cta-mobile {
          display: none;
        }
      }

      /* ---------- Carousel Container ---------- */
      .d1-carousel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-5, 20px);
        padding-inline-end: var(--nxt1-spacing-6, 24px);
      }

      @media (min-width: 1024px) {
        .d1-carousel {
          align-items: flex-start;
          padding-inline-start: var(--nxt1-spacing-8, 32px);
        }
      }

      /* ---------- Stack Layer ---------- */
      .d1-carousel__stack {
        position: relative;
        width: 100%;
        max-width: 260px;
        aspect-ratio: 9 / 16;
      }

      @media (min-width: 768px) {
        .d1-carousel__stack {
          max-width: 300px;
        }
      }

      @media (min-width: 1024px) {
        .d1-carousel__stack {
          max-width: 320px;
        }
      }

      /* ---------- Cards ---------- */
      .d1-carousel__card {
        position: absolute;
        inset: 0;
        border-radius: var(--nxt1-borderRadius-2xl, 16px);
        border: 1px solid var(--nxt1-color-border-default);
        overflow: hidden;
        will-change: transform, opacity, filter;
        transition:
          transform var(--nxt1-motion-duration-slow, 500ms)
            var(--nxt1-motion-easing-standard, ease-out),
          opacity var(--nxt1-motion-duration-slow, 500ms)
            var(--nxt1-motion-easing-standard, ease-out),
          filter var(--nxt1-motion-duration-slow, 500ms)
            var(--nxt1-motion-easing-standard, ease-out);
      }

      /* Front card — full size, on top */
      .d1-carousel__card--front {
        z-index: 3;
        transform: translateX(0) scale(1);
        opacity: 1;
        filter: blur(0);
        box-shadow: var(--nxt1-shadow-xl, 0 20px 60px rgba(0, 0, 0, 0.35));
      }

      /* First card behind — shifted right, scaled down, slight blur */
      .d1-carousel__card--back-1 {
        z-index: 2;
        transform: translateX(14%) scale(0.92);
        opacity: 0.7;
        filter: blur(1.5px);
        box-shadow: var(--nxt1-shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.25));
      }

      /* Second card behind — shifted further, scaled smaller, more blur */
      .d1-carousel__card--back-2 {
        z-index: 1;
        transform: translateX(28%) scale(0.84);
        opacity: 0.4;
        filter: blur(3px);
        box-shadow: var(--nxt1-shadow-md, 0 4px 16px rgba(0, 0, 0, 0.15));
      }

      /* ---------- Placeholder Content ---------- */
      .d1-carousel__placeholder {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-6, 24px);
        text-align: center;
      }

      /* Subtle shimmer overlay for polish */
      .d1-carousel__placeholder::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          110deg,
          transparent 30%,
          var(--nxt1-color-alpha-primary6, rgba(204, 255, 0, 0.04)) 50%,
          transparent 70%
        );
        background-size: 200% 100%;
        animation: d1-shimmer 4s ease-in-out infinite;
        pointer-events: none;
      }

      .d1-carousel__icon-ring {
        width: var(--nxt1-spacing-14, 56px);
        height: var(--nxt1-spacing-14, 56px);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10);
        border: 1px solid var(--nxt1-color-alpha-primary30);
      }

      .d1-carousel__badge {
        padding: var(--nxt1-spacing-1, 4px) var(--nxt1-spacing-2_5, 10px);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: color-mix(in srgb, var(--nxt1-color-bg-primary, #0a0a0a) 80%, transparent);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs, 10px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        line-height: var(--nxt1-lineHeight-snug, 1.25);
        letter-spacing: var(--nxt1-letterSpacing-wide, 0.05em);
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
      }

      .d1-carousel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        line-height: var(--nxt1-lineHeight-snug, 1.25);
      }

      .d1-carousel__copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 14px);
        line-height: var(--nxt1-lineHeight-relaxed, 1.625);
        max-width: 22ch;
      }

      /* ---------- Dot Indicators ---------- */
      .d1-carousel__dots {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .d1-carousel__dot {
        width: var(--nxt1-spacing-2, 8px);
        height: var(--nxt1-spacing-2, 8px);
        padding: 0;
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: var(--nxt1-color-border-default);
        cursor: pointer;
        transition:
          width var(--nxt1-motion-duration-normal, 250ms)
            var(--nxt1-motion-easing-standard, ease-out),
          background var(--nxt1-motion-duration-normal, 250ms)
            var(--nxt1-motion-easing-standard, ease-out);
      }

      .d1-carousel__dot--active {
        width: var(--nxt1-spacing-6, 24px);
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
      }

      .d1-carousel__dot:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* ---------- Mobile tweaks ---------- */
      @media (max-width: 767px) {
        .d1-dream {
          gap: var(--nxt1-spacing-6, 24px);
          padding-top: var(--nxt1-spacing-8, 32px);
        }

        .d1-dream__actions {
          gap: var(--nxt1-spacing-2, 8px);
        }

        .d1-carousel__stack {
          max-width: 220px;
        }
      }

      /* ---------- Reduced motion ---------- */
      @media (prefers-reduced-motion: reduce) {
        .d1-carousel__placeholder::before {
          animation: none;
        }

        .d1-carousel__card {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtD1DreamHeroComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  readonly headingLevel = input<D1DreamHeadingLevel>(1);
  readonly ariaTitleId = input<string>('d1-dream-hero-title');
  readonly ctaRoute = input<string>('/auth');

  /** Carousel slide data exposed to template. */
  protected readonly slides = CAROUSEL_SLIDES;

  /** Currently active (front) slide index. */
  protected readonly activeIndex = signal(0);

  /** Timer handle for auto-rotation. */
  private autoRotateTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    afterNextRender(() => {
      this.startAutoRotate();
    });

    this.destroyRef.onDestroy(() => {
      this.stopAutoRotate();
    });
  }

  /** Navigate to a specific slide and restart timer. */
  protected goToSlide(index: number): void {
    this.activeIndex.set(index);
    this.restartAutoRotate();
  }

  /** Calculate the index for a card behind the front card. */
  protected getBackIndex(offset: number): number {
    return (this.activeIndex() + offset) % this.slides.length;
  }

  /** Pause auto-rotation on hover/focus. */
  protected pauseAutoRotate(): void {
    this.stopAutoRotate();
  }

  /** Resume auto-rotation on mouse leave/focus out. */
  protected resumeAutoRotate(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.startAutoRotate();
    }
  }

  private startAutoRotate(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.stopAutoRotate();

    this.autoRotateTimer = setInterval(() => {
      this.activeIndex.update((current) => (current + 1) % this.slides.length);
    }, AUTO_ROTATE_MS);
  }

  private stopAutoRotate(): void {
    if (this.autoRotateTimer !== null) {
      clearInterval(this.autoRotateTimer);
      this.autoRotateTimer = null;
    }
  }

  private restartAutoRotate(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.startAutoRotate();
    }
  }
}
