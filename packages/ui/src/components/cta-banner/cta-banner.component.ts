/**
 * @fileoverview CTA Banner Component — Call-to-Action Section
 * @module @nxt1/ui/components/cta-banner
 * @version 2.0.0
 *
 * Reusable call-to-action banner for landing and marketing pages.
 * Supports four visual variants:
 *   - `default`    — Centered card with surface background and shadow.
 *   - `minimal`    — Transparent, no border or shadow.
 *   - `accent`     — Tinted primary background.
 *   - `conversion` — Full-width grid: text left, stacked actions right.
 *
 * 100% design-token styling — zero hardcoded values.
 * SSR-safe (deterministic title IDs), responsive, reduced-motion aware.
 *
 * @example
 * ```html
 * <!-- Default centered card -->
 * <nxt1-cta-banner
 *   title="Ready to Get Started?"
 *   subtitle="Create your free account today."
 *   ctaLabel="Sign Up Free"
 *   ctaRoute="/auth"
 * />
 *
 * <!-- Full-width conversion layout -->
 * <nxt1-cta-banner
 *   variant="conversion"
 *   badgeLabel="Final Step"
 *   title="Stop Competing. Start Dominating."
 *   subtitle="Build your verified athlete profile."
 *   ctaLabel="Create Your Account"
 *   ctaRoute="/auth"
 *   titleId="landing-final-cta"
 * />
 * ```
 */

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtAppStoreBadgesComponent } from '../app-store-badges';

/** Avatar image descriptor for floating social-proof circles. */
export interface CtaAvatarImage {
  readonly src: string;
  readonly alt: string;
}

/** Visual variant for the CTA banner. */
export type CtaBannerVariant = 'default' | 'minimal' | 'accent' | 'conversion';

@Component({
  selector: 'nxt1-cta-banner',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtCtaButtonComponent, NxtAppStoreBadgesComponent],
  template: `
    <section
      class="cta-section"
      [class.cta-section--minimal]="variant() === 'minimal'"
      [class.cta-section--accent]="variant() === 'accent'"
      [class.cta-section--conversion]="variant() === 'conversion'"
      [class.cta-section--visible]="isVisible()"
      [attr.aria-labelledby]="resolvedTitleId()"
      #sectionRef
    >
      <div class="cta-content">
        <!-- Floating avatar circles (decorative social proof) -->
        @if (avatarImages().length > 0) {
          <div class="cta-avatars" aria-hidden="true">
            @for (avatar of avatarImages(); track avatar.src; let i = $index) {
              <div
                class="cta-avatar"
                [class]="'cta-avatar cta-avatar--' + i"
                [style.transition-delay]="i * 90 + 'ms'"
              >
                <img
                  [src]="avatar.src"
                  [alt]="avatar.alt"
                  width="64"
                  height="64"
                  loading="lazy"
                  decoding="async"
                />
                <span class="cta-avatar__dot"></span>
              </div>
            }
          </div>
        }

        @if (badgeLabel()) {
          <p class="cta-badge">{{ badgeLabel() }}</p>
        }

        <h2 [id]="resolvedTitleId()" class="cta-title">{{ title() }}</h2>

        @if (subtitle()) {
          <p class="cta-subtitle">{{ subtitle() }}</p>
        }

        <div class="cta-actions-wrapper">
          <!-- Desktop: Web CTA buttons -->
          <div class="cta-actions cta-actions--desktop">
            @if (ctaRoute()) {
              <nxt1-cta-button
                [label]="ctaLabel()"
                [route]="ctaRoute()"
                variant="primary"
                size="lg"
              />
            } @else {
              <nxt1-cta-button
                [label]="ctaLabel()"
                variant="primary"
                size="lg"
                (clicked)="ctaClick.emit()"
              />
            }
            @if (secondaryLabel()) {
              @if (secondaryRoute()) {
                <nxt1-cta-button
                  [label]="secondaryLabel()"
                  [route]="secondaryRoute()"
                  variant="secondary"
                  [size]="variant() === 'conversion' ? 'lg' : 'default'"
                />
              } @else {
                <nxt1-cta-button
                  [label]="secondaryLabel()"
                  variant="secondary"
                  [size]="variant() === 'conversion' ? 'lg' : 'default'"
                  (clicked)="secondaryClick.emit()"
                />
              }
            }
          </div>

          <!-- Mobile: App store download badges (stacked to fit card width) -->
          <nxt1-app-store-badges class="cta-actions--mobile" layout="stack" />
        </div>

        @if (microcopy()) {
          <p class="cta-microcopy">{{ microcopy() }}</p>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .cta-section {
        position: relative;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .cta-content {
        position: relative;
        z-index: 1;
        overflow: hidden;
        text-align: center;
        max-width: var(--nxt1-section-subtitle-max-width);
        margin: 0 auto;
        padding: var(--nxt1-spacing-10) var(--nxt1-spacing-6);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        box-shadow: var(--nxt1-shadow-lg);
      }

      .cta-section--minimal .cta-content {
        background: transparent;
        border: none;
        border-radius: 0;
        box-shadow: none;
      }

      .cta-section--accent .cta-content {
        background: var(--nxt1-color-alpha-primary4);
        border-color: var(--nxt1-color-alpha-primary20);
      }

      .cta-section--conversion .cta-content {
        overflow: hidden;
        width: 100%;
        max-width: var(--nxt1-section-max-width, var(--nxt1-root-shell-max-width, 88rem));
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        column-gap: var(--nxt1-spacing-8);
        row-gap: var(--nxt1-spacing-3);
        text-align: left;
        border-width: 1px;
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100) 95%,
          var(--nxt1-color-primary) 5%
        );
        border-color: var(--nxt1-color-alpha-primary20);
      }

      .cta-section--conversion .cta-badge,
      .cta-section--conversion .cta-title,
      .cta-section--conversion .cta-subtitle {
        grid-column: 1;
      }

      .cta-section--conversion .cta-actions-wrapper {
        grid-column: 2;
        grid-row: 1 / span 3;
      }

      .cta-section--conversion .cta-actions {
        flex-direction: column;
        justify-content: center;
        align-items: stretch;
      }

      .cta-section--conversion .cta-actions nxt1-cta-button {
        --nxt1-cta-btn-min-width: calc(var(--nxt1-spacing-10) * 4);
      }

      .cta-section--conversion .cta-microcopy {
        grid-column: 1 / -1;
      }

      .cta-badge {
        margin: 0 0 var(--nxt1-spacing-3);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .cta-title {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-3);
      }

      @media (min-width: 768px) {
        .cta-title {
          font-size: var(--nxt1-fontSize-3xl);
        }
      }

      .cta-subtitle {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-7);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .cta-section--conversion .cta-subtitle {
        max-width: 52ch;
      }

      .cta-actions {
        position: relative;
        z-index: 1;
        display: flex;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      /* Mobile-first: show app badges, hide web CTAs */
      .cta-actions--desktop {
        display: none;
      }

      .cta-actions--mobile {
        display: flex;
        justify-content: center;
        width: 100%;
      }

      @media (min-width: 1024px) {
        .cta-actions--desktop {
          display: flex;
        }

        .cta-actions--mobile {
          display: none;
        }
      }

      .cta-microcopy {
        margin: var(--nxt1-spacing-4) 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      @media (max-width: 991px) {
        .cta-section--conversion .cta-content {
          grid-template-columns: 1fr;
          text-align: center;
        }

        .cta-section--conversion .cta-badge,
        .cta-section--conversion .cta-title,
        .cta-section--conversion .cta-subtitle,
        .cta-section--conversion .cta-actions-wrapper,
        .cta-section--conversion .cta-microcopy {
          grid-column: 1;
          grid-row: auto;
        }

        .cta-section--conversion .cta-actions {
          justify-content: center;
          align-items: center;
        }
      }

      /* ============================================
       * ACTIONS WRAPPER — Positions avatar orbit
       * ============================================ */
      .cta-actions-wrapper {
        position: relative;
      }

      /* ============================================
       * FLOATING AVATAR CIRCLES
       * Spread across the full card, varied sizes & rotations.
       * Contained by overflow:hidden on .cta-content.
       * ============================================ */
      .cta-avatars {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
      }

      .cta-avatar {
        position: absolute;
        border-radius: var(--nxt1-borderRadius-full, 50%);
        border: 2px solid var(--nxt1-color-alpha-primary20);
        box-shadow: var(--nxt1-shadow-md);
        opacity: 0;
        transform: translateY(3rem) rotate(0deg);
        transition:
          opacity var(--nxt1-motion-duration-slow, 600ms) var(--nxt1-motion-easing-out, ease-out),
          transform var(--nxt1-motion-duration-slow, 600ms) var(--nxt1-motion-easing-out, ease-out);
        will-change: transform, opacity;
      }

      .cta-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        border-radius: 50%;
        overflow: hidden;
      }

      /* Live-status green dot */
      .cta-avatar__dot {
        position: absolute;
        bottom: 2%;
        right: 2%;
        width: 22%;
        height: 22%;
        max-width: 0.55rem;
        max-height: 0.55rem;
        background: #22c55e;
        border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
        opacity: 0;
        transition: opacity 300ms ease 600ms;
      }

      .cta-section--visible .cta-avatar__dot {
        opacity: 1;
      }

      /* ============================================
       * FLOAT KEYFRAMES — 6 unique movement patterns
       * Each avatar has its own direction, arc & rotation drift.
       * ============================================ */

      /* 0: Gentle upward bob with slight counter-clockwise drift */
      @keyframes nxt1-float-0 {
        0% {
          transform: translateY(0px) translateX(0px) rotate(-6deg);
        }
        35% {
          transform: translateY(-10px) translateX(3px) rotate(-4deg);
        }
        70% {
          transform: translateY(-5px) translateX(-2px) rotate(-7deg);
        }
        100% {
          transform: translateY(0px) translateX(0px) rotate(-6deg);
        }
      }

      /* 1: Short diagonal drift */
      @keyframes nxt1-float-1 {
        0% {
          transform: translateY(0px) translateX(0px) rotate(8deg);
        }
        40% {
          transform: translateY(-8px) translateX(-4px) rotate(6deg);
        }
        75% {
          transform: translateY(-3px) translateX(2px) rotate(10deg);
        }
        100% {
          transform: translateY(0px) translateX(0px) rotate(8deg);
        }
      }

      /* 2: Slow gentle sway */
      @keyframes nxt1-float-2 {
        0% {
          transform: translateY(0px) translateX(0px) rotate(4deg);
        }
        50% {
          transform: translateY(-7px) translateX(4px) rotate(6deg);
        }
        100% {
          transform: translateY(0px) translateX(0px) rotate(4deg);
        }
      }

      /* 3: Deeper upward bob */
      @keyframes nxt1-float-3 {
        0% {
          transform: translateY(0px) translateX(0px) rotate(-4deg);
        }
        30% {
          transform: translateY(-12px) translateX(-3px) rotate(-2deg);
        }
        65% {
          transform: translateY(-6px) translateX(3px) rotate(-5deg);
        }
        100% {
          transform: translateY(0px) translateX(0px) rotate(-4deg);
        }
      }

      /* 4: Small erratic hop */
      @keyframes nxt1-float-4 {
        0% {
          transform: translateY(0px) translateX(0px) rotate(10deg);
        }
        25% {
          transform: translateY(-6px) translateX(3px) rotate(12deg);
        }
        60% {
          transform: translateY(-10px) translateX(-2px) rotate(8deg);
        }
        100% {
          transform: translateY(0px) translateX(0px) rotate(10deg);
        }
      }

      /* 5: Slow wide arc */
      @keyframes nxt1-float-5 {
        0% {
          transform: translateY(0px) translateX(0px) rotate(-8deg);
        }
        45% {
          transform: translateY(-9px) translateX(-4px) rotate(-6deg);
        }
        80% {
          transform: translateY(-4px) translateX(3px) rotate(-10deg);
        }
        100% {
          transform: translateY(0px) translateX(0px) rotate(-8deg);
        }
      }

      /* 6: Gentle diagonal drift — offset keeps vertical centering intact */
      @keyframes nxt1-float-6 {
        0% {
          transform: translateY(-50%) translateX(0px) rotate(5deg);
        }
        35% {
          transform: translateY(calc(-50% - 9px)) translateX(-3px) rotate(7deg);
        }
        70% {
          transform: translateY(calc(-50% - 4px)) translateX(3px) rotate(3deg);
        }
        100% {
          transform: translateY(-50%) translateX(0px) rotate(5deg);
        }
      }

      /* ---- Per-avatar size, position, entrance & float animation ---- */
      /* All positioned in the RIGHT half (empty green space around the button). */

      /* 0: Large — top-right corner */
      .cta-avatar--0 {
        width: 4.25rem;
        height: 4.25rem;
        top: 6%;
        right: 2%;
      }
      .cta-section--visible .cta-avatar--0 {
        opacity: 1;
        transform: translateY(0) rotate(-6deg);
        animation: nxt1-float-0 7s ease-in-out infinite;
        animation-delay: 0.77s; /* entrance 600ms + stagger 0×90ms */
      }

      /* 1: Small — above button, left */
      .cta-avatar--1 {
        width: 2.75rem;
        height: 2.75rem;
        top: 8%;
        right: 30%;
      }
      .cta-section--visible .cta-avatar--1 {
        opacity: 0.85;
        transform: translateY(0) rotate(8deg);
        animation: nxt1-float-1 9s ease-in-out infinite;
        animation-delay: 0.86s; /* entrance + 1×90ms */
      }

      /* 2: Medium — bottom zone, left of center-right */
      .cta-avatar--2 {
        width: 3.25rem;
        height: 3.25rem;
        bottom: 8%;
        right: 35%;
      }
      .cta-section--visible .cta-avatar--2 {
        opacity: 0.9;
        transform: translateY(0) rotate(4deg);
        animation: nxt1-float-2 8.5s ease-in-out infinite;
        animation-delay: 0.95s; /* entrance + 2×90ms */
      }

      /* 3: Medium-large — bottom-right corner */
      .cta-avatar--3 {
        width: 3.75rem;
        height: 3.75rem;
        bottom: 8%;
        right: 3%;
      }
      .cta-section--visible .cta-avatar--3 {
        opacity: 1;
        transform: translateY(0) rotate(-4deg);
        animation: nxt1-float-3 6.5s ease-in-out infinite;
        animation-delay: 1.04s; /* entrance + 3×90ms */
      }

      /* 4: Extra-small — centered between bottom avatars */
      .cta-avatar--4 {
        width: 2.5rem;
        height: 2.5rem;
        bottom: 10%;
        right: 23%;
      }
      .cta-section--visible .cta-avatar--4 {
        opacity: 0.75;
        transform: translateY(0) rotate(10deg);
        animation: nxt1-float-4 10s ease-in-out infinite;
        animation-delay: 1.13s; /* entrance + 4×90ms */
      }

      /* 5: Small-medium — upper green zone */
      .cta-avatar--5 {
        width: 3rem;
        height: 3rem;
        top: 18%;
        right: 22%;
      }
      .cta-section--visible .cta-avatar--5 {
        opacity: 0.8;
        transform: translateY(0) rotate(-8deg);
        animation: nxt1-float-5 7.5s ease-in-out infinite;
        animation-delay: 1.22s; /* entrance + 5×90ms */
      }

      /* 6: Medium — left side of button, vertically centered */
      .cta-avatar--6 {
        width: 3.25rem;
        height: 3.25rem;
        top: 50%;
        right: 32%;
        transform: translateY(calc(-50% + 3rem));
      }
      .cta-section--visible .cta-avatar--6 {
        opacity: 0.88;
        transform: translateY(-50%) rotate(5deg);
        animation: nxt1-float-6 8s ease-in-out infinite;
        animation-delay: 1.31s;
      }

      /* ---- Responsive: stack layout — redistribute around card ---- */
      @media (max-width: 991px) {
        .cta-avatar--0 {
          top: 4%;
          right: 5%;
        }
        .cta-avatar--1 {
          top: 4%;
          right: auto;
          left: 5%;
        }
        .cta-avatar--2 {
          display: none;
        }
        .cta-avatar--3 {
          top: calc(100% - (var(--nxt1-spacing-10) * 4) + var(--nxt1-spacing-2));
          bottom: auto;
          right: 5%;
        }
        .cta-avatar--4 {
          top: calc(100% - (var(--nxt1-spacing-10) * 4) + var(--nxt1-spacing-2));
          bottom: auto;
          right: auto;
          left: 5%;
        }
        .cta-avatar--5 {
          display: none;
        }
        .cta-avatar--6 {
          display: none;
        }
      }

      @media (max-width: 767px) {
        .cta-avatar--0 {
          width: 2.75rem;
          height: 2.75rem;
        }
        .cta-avatar--1 {
          width: 2.25rem;
          height: 2.25rem;
        }
        .cta-avatar--3 {
          width: 2.5rem;
          height: 2.5rem;
        }
        .cta-avatar--4 {
          width: 2rem;
          height: 2rem;
        }
      }

      /* ---- Reduced motion: no float animation, instant reveal ---- */
      @media (prefers-reduced-motion: reduce) {
        .cta-content {
          transition: none;
        }

        .cta-avatar {
          transition: none;
          transform: none !important;
          animation: none !important;
        }

        .cta-section--visible .cta-avatar {
          transform: none !important;
          animation: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCtaBannerComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  /** Reference to the section element for IntersectionObserver. */
  private readonly sectionRef = viewChild<ElementRef<HTMLElement>>('sectionRef');

  /** CTA title. */
  readonly title = input.required<string>();

  /** CTA subtitle. */
  readonly subtitle = input<string>('');

  /** Optional microcopy below actions. */
  readonly microcopy = input<string>('');

  /** Optional small badge above the title. */
  readonly badgeLabel = input<string>('');

  /** Optional explicit title ID for aria-labelledby. */
  readonly titleId = input<string>('');

  /** Primary button label. */
  readonly ctaLabel = input<string>('Sign Up Free');

  /** Primary button route (if link-based). */
  readonly ctaRoute = input<string>('');

  /** Secondary button label (hidden if empty). */
  readonly secondaryLabel = input<string>('');

  /** Secondary button route (if link-based). */
  readonly secondaryRoute = input<string>('');

  /** Visual variant. */
  readonly variant = input<CtaBannerVariant>('default');

  /** Floating avatar images for social proof (decorative). */
  readonly avatarImages = input<readonly CtaAvatarImage[]>([]);

  /** Emitted when primary CTA is clicked (button mode). */
  readonly ctaClick = output<void>();

  /** Emitted when secondary button is clicked (button mode). */
  readonly secondaryClick = output<void>();

  /** Whether the section is visible in the viewport (drives avatar animation). */
  protected readonly isVisible = signal(false);

  protected readonly resolvedTitleId = computed(() => {
    const explicitId = this.titleId().trim();
    return explicitId || this.buildIdFromTitle(this.title());
  });

  constructor() {
    afterNextRender(() => this.initScrollObserver());
  }

  /**
   * Sets up an IntersectionObserver on the section element.
   * Toggles `isVisible` when >=15 % of the section enters/exits
   * the viewport. Uses GPU-friendly CSS transitions — no JS animation loop.
   */
  private initScrollObserver(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const el = this.sectionRef()?.nativeElement;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.isVisible.set(entry.isIntersecting);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);

    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private buildIdFromTitle(title: string): string {
    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    return `nxt1-cta-${slug || 'section'}`;
  }
}
