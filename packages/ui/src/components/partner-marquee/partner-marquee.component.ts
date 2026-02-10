/**
 * @fileoverview NXT1 Partner Marquee Component
 * @module @nxt1/ui/components/partner-marquee
 *
 * Professional infinite-scrolling partner logo carousel.
 * Follows 2026 best practices: pure CSS animation (GPU-accelerated),
 * SSR-safe, fully accessible, theme-aware, and mobile-responsive.
 *
 * Uses the "double-track" technique: the logo row is duplicated so that
 * when the first set scrolls off-screen, the duplicate seamlessly takes
 * its place — creating an infinite loop with zero JavaScript timers.
 *
 * Features:
 * - Pure CSS `translate3d` animation (60 fps, GPU-composited)
 * - Pause on hover / focus for accessibility
 * - Responsive sizing (smaller logos on mobile)
 * - Configurable speed, gap, direction
 * - Gradient edge-fade masks for polished look
 * - `prefers-reduced-motion` respect
 * - Full ARIA labelling
 * - SSR-safe (no DOM / window access)
 *
 * @example
 * ```html
 * <nxt1-partner-marquee />
 *
 * <nxt1-partner-marquee
 *   title="Our Partners"
 *   subtitle="Trusted by leading organizations in sports"
 *   [speed]="40"
 *   direction="right"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, Input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

// ============================================
// TYPES
// ============================================

/** Individual partner entry */
export interface PartnerItem {
  /** Unique identifier */
  readonly id: string;
  /** Partner / organization name (used for alt-text & aria) */
  readonly name: string;
  /** Logo image URL — leave empty for placeholder */
  readonly logoUrl?: string;
  /** Optional link to partner website */
  readonly href?: string;
}

/** Scroll direction */
export type MarqueeDirection = 'left' | 'right';

/** Visual variant */
export type MarqueeVariant = 'default' | 'minimal' | 'dark';

// ============================================
// DEFAULT PARTNERS (Placeholders)
// ============================================

const DEFAULT_PARTNERS: readonly PartnerItem[] = [
  { id: 'partner-1', name: 'Partner One' },
  { id: 'partner-2', name: 'Partner Two' },
  { id: 'partner-3', name: 'Partner Three' },
  { id: 'partner-4', name: 'Partner Four' },
  { id: 'partner-5', name: 'Partner Five' },
  { id: 'partner-6', name: 'Partner Six' },
  { id: 'partner-7', name: 'Partner Seven' },
  { id: 'partner-8', name: 'Partner Eight' },
] as const;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-partner-marquee',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section
      class="partner-marquee"
      [class]="variantClass()"
      [attr.aria-label]="title"
      role="region"
    >
      <!-- Section Header -->
      <div class="partner-marquee__header">
        @if (showLabel) {
          <span class="partner-marquee__label">{{ label }}</span>
        }
        <h2 class="partner-marquee__title">{{ title }}</h2>
        @if (subtitle) {
          <p class="partner-marquee__subtitle">{{ subtitle }}</p>
        }
      </div>

      <!-- Marquee Track -->
      <div
        class="partner-marquee__viewport"
        [attr.aria-label]="'Scrolling list of ' + partners().length + ' partner logos'"
        role="marquee"
      >
        <!-- Edge fade masks (left + right) -->
        <div class="partner-marquee__fade partner-marquee__fade--left" aria-hidden="true"></div>
        <div class="partner-marquee__fade partner-marquee__fade--right" aria-hidden="true"></div>

        <!-- Infinite scroll track — the row is duplicated for seamless looping -->
        <div
          class="partner-marquee__track"
          [class.partner-marquee__track--reverse]="direction === 'right'"
          [style.--marquee-duration]="animationDuration()"
          [style.--marquee-gap]="gap + 'px'"
        >
          <!-- First set -->
          @for (partner of partners(); track partner.id) {
            <div class="partner-marquee__item" [attr.aria-label]="partner.name">
              @if (partner.logoUrl) {
                @if (partner.href) {
                  <a
                    [href]="partner.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="partner-marquee__link"
                    [attr.aria-label]="'Visit ' + partner.name"
                  >
                    <img
                      [src]="partner.logoUrl"
                      [alt]="partner.name + ' logo'"
                      class="partner-marquee__logo"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                } @else {
                  <img
                    [src]="partner.logoUrl"
                    [alt]="partner.name + ' logo'"
                    class="partner-marquee__logo"
                    loading="lazy"
                    decoding="async"
                  />
                }
              } @else {
                <!-- Placeholder logo -->
                <div class="partner-marquee__placeholder" [attr.aria-label]="partner.name">
                  <div class="partner-marquee__placeholder-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="4"
                        stroke="currentColor"
                        stroke-width="1.5"
                        opacity="0.4"
                      />
                      <path d="M8 17l3-4 2 2 3-4 4 6H4l4-0z" fill="currentColor" opacity="0.2" />
                      <circle cx="9" cy="9" r="2" fill="currentColor" opacity="0.3" />
                    </svg>
                  </div>
                  <span class="partner-marquee__placeholder-name">{{ partner.name }}</span>
                </div>
              }
            </div>
          }

          <!-- Duplicate set (for seamless infinite loop) -->
          @for (partner of partners(); track 'dup-' + partner.id) {
            <div class="partner-marquee__item" [attr.aria-label]="partner.name" aria-hidden="true">
              @if (partner.logoUrl) {
                @if (partner.href) {
                  <a
                    [href]="partner.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="partner-marquee__link"
                    tabindex="-1"
                  >
                    <img
                      [src]="partner.logoUrl"
                      [alt]="''"
                      class="partner-marquee__logo"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                } @else {
                  <img
                    [src]="partner.logoUrl"
                    alt=""
                    class="partner-marquee__logo"
                    loading="lazy"
                    decoding="async"
                  />
                }
              } @else {
                <div class="partner-marquee__placeholder">
                  <div class="partner-marquee__placeholder-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="4"
                        stroke="currentColor"
                        stroke-width="1.5"
                        opacity="0.4"
                      />
                      <path d="M8 17l3-4 2 2 3-4 4 6H4l4-0z" fill="currentColor" opacity="0.2" />
                      <circle cx="9" cy="9" r="2" fill="currentColor" opacity="0.3" />
                    </svg>
                  </div>
                  <span class="partner-marquee__placeholder-name">{{ partner.name }}</span>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      /* ============================================
         PARTNER MARQUEE — 2026 Professional Design
         GPU-accelerated CSS-only infinite scroll
         ============================================ */

      :host {
        display: block;
        --marquee-duration: 35s;
        --marquee-gap: 48px;
      }

      /* ============================================
         SECTION CONTAINER
         ============================================ */

      .partner-marquee {
        position: relative;
        padding: var(--nxt1-spacing-16, 4rem) 0;
        background: var(--nxt1-color-bg-primary);
        overflow: hidden;
      }

      .partner-marquee--minimal {
        padding: var(--nxt1-spacing-12, 3rem) 0;
      }

      .partner-marquee--dark {
        background: var(--nxt1-color-bg-secondary, #0a0a0a);
      }

      /* ============================================
         HEADER
         ============================================ */

      .partner-marquee__header {
        text-align: center;
        margin-bottom: var(--nxt1-spacing-10, 2.5rem);
        padding: 0 var(--nxt1-spacing-4, 1rem);
      }

      .partner-marquee__label {
        display: inline-block;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--nxt1-color-primary);
        margin-bottom: var(--nxt1-spacing-3, 0.75rem);
      }

      .partner-marquee__title {
        font-family: var(--nxt1-font-brand, inherit);
        font-size: clamp(1.5rem, 3vw, 2rem);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0;
        line-height: 1.2;
      }

      .partner-marquee__subtitle {
        font-size: clamp(0.875rem, 1.5vw, 1.0625rem);
        color: var(--nxt1-color-text-secondary);
        margin: var(--nxt1-spacing-2, 0.5rem) auto 0;
        max-width: 480px;
        line-height: 1.5;
      }

      /* ============================================
         VIEWPORT (clipping container)
         ============================================ */

      .partner-marquee__viewport {
        position: relative;
        width: 100%;
        overflow: hidden;
        /* mask-image is the premium edge-fade technique */
        -webkit-mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 8%,
          black 92%,
          transparent 100%
        );
        mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 8%,
          black 92%,
          transparent 100%
        );
      }

      /* ============================================
         TRACK (the moving element)
         ============================================ */

      .partner-marquee__track {
        display: flex;
        align-items: center;
        gap: var(--marquee-gap);
        width: max-content;
        animation: marquee-scroll var(--marquee-duration) linear infinite;
        will-change: transform;
      }

      .partner-marquee__track--reverse {
        animation-direction: reverse;
      }

      /* Pause on hover & focus-within for accessibility */
      .partner-marquee__viewport:hover .partner-marquee__track,
      .partner-marquee__viewport:focus-within .partner-marquee__track {
        animation-play-state: paused;
      }

      @keyframes marquee-scroll {
        0% {
          transform: translate3d(0, 0, 0);
        }
        100% {
          transform: translate3d(-50%, 0, 0);
        }
      }

      /* ============================================
         INDIVIDUAL ITEMS
         ============================================ */

      .partner-marquee__item {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.3s ease;
      }

      .partner-marquee__viewport:hover .partner-marquee__item {
        opacity: 0.5;
      }

      .partner-marquee__viewport:hover .partner-marquee__item:hover {
        opacity: 1;
      }

      /* ============================================
         LOGO IMAGE
         ============================================ */

      .partner-marquee__logo {
        height: 36px;
        width: auto;
        max-width: 140px;
        object-fit: contain;
        filter: grayscale(100%);
        opacity: 0.6;
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .partner-marquee__item:hover .partner-marquee__logo {
        filter: grayscale(0%);
        opacity: 1;
        transform: scale(1.08);
      }

      .partner-marquee__link {
        display: flex;
        align-items: center;
        text-decoration: none;
        outline-offset: 4px;
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .partner-marquee__link:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
      }

      /* ============================================
         PLACEHOLDER (when no logo image)
         ============================================ */

      .partner-marquee__placeholder {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-5, 1.25rem);
        border: 1.5px dashed var(--nxt1-color-border, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-xl, 12px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: default;
        min-width: 160px;
        height: 56px;
      }

      .partner-marquee__item:hover .partner-marquee__placeholder {
        border-color: var(--nxt1-color-border-primary, var(--nxt1-color-primary));
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
        transform: translateY(-2px);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
      }

      .partner-marquee__placeholder-icon {
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
        opacity: 0.6;
        transition: opacity 0.3s ease;
      }

      .partner-marquee__item:hover .partner-marquee__placeholder-icon {
        opacity: 1;
        color: var(--nxt1-color-primary);
      }

      .partner-marquee__placeholder-icon svg {
        width: 100%;
        height: 100%;
      }

      .partner-marquee__placeholder-name {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
        transition: color 0.3s ease;
        letter-spacing: 0.01em;
      }

      .partner-marquee__item:hover .partner-marquee__placeholder-name {
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 768px) {
        .partner-marquee {
          padding: var(--nxt1-spacing-12, 3rem) 0;
        }

        .partner-marquee__header {
          margin-bottom: var(--nxt1-spacing-8, 2rem);
        }

        .partner-marquee__logo {
          height: 28px;
          max-width: 110px;
        }

        .partner-marquee__placeholder {
          min-width: 140px;
          height: 48px;
          padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-4, 1rem);
        }

        .partner-marquee__placeholder-icon {
          width: 22px;
          height: 22px;
        }

        .partner-marquee__placeholder-name {
          font-size: 0.75rem;
        }
      }

      @media (max-width: 480px) {
        .partner-marquee {
          padding: var(--nxt1-spacing-10, 2.5rem) 0;
        }

        .partner-marquee__placeholder {
          min-width: 120px;
          height: 44px;
          gap: var(--nxt1-spacing-2, 0.5rem);
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .partner-marquee__track {
          animation-play-state: paused;
        }
      }

      /* ============================================
         DARK VARIANT OVERRIDES
         ============================================ */

      .partner-marquee--dark .partner-marquee__logo {
        filter: grayscale(100%) brightness(2);
        opacity: 0.5;
      }

      .partner-marquee--dark .partner-marquee__item:hover .partner-marquee__logo {
        filter: grayscale(0%) brightness(1);
        opacity: 1;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtPartnerMarqueeComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Section title */
  @Input() title = 'Trusted By Leading Organizations';

  /** Optional subtitle below the title */
  @Input() subtitle = '';

  /** Small label above the title (e.g. "OUR PARTNERS") */
  @Input() label = 'Our Partners';

  /** Whether to show the label */
  @Input() showLabel = true;

  /** Scroll direction */
  @Input() direction: MarqueeDirection = 'left';

  /** Animation speed in seconds for one full cycle */
  @Input() speed = 35;

  /** Gap between items in pixels */
  @Input() gap = 48;

  /** Visual variant */
  @Input() variant: MarqueeVariant = 'default';

  /** Custom partner list (overrides defaults) */
  @Input() set items(value: PartnerItem[]) {
    this._items.set(value);
  }

  // ============================================
  // STATE
  // ============================================

  private readonly _items = signal<PartnerItem[]>([...DEFAULT_PARTNERS]);

  /** Current partners list */
  readonly partners = computed(() => this._items());

  /** CSS duration string */
  readonly animationDuration = computed(() => `${this.speed}s`);

  /** Variant CSS class */
  readonly variantClass = computed(() => {
    switch (this.variant) {
      case 'minimal':
        return 'partner-marquee--minimal';
      case 'dark':
        return 'partner-marquee--dark';
      default:
        return '';
    }
  });
}
