/**
 * @fileoverview NXT1 Hero Header Component
 * @module @nxt1/ui/components/hero-header
 *
 * Premium hero section for landing pages with 4 audience-specific cards.
 * 100% theme-aware, SSR-safe, and SEO-optimized.
 *
 * Features:
 * - Responsive grid layout (mobile-first)
 * - 4 audience cards: Athletes, HS/Clubs, Scouts, Fans
 * - Animated gradient backgrounds
 * - Full accessibility support
 * - SEO-optimized with semantic HTML
 * - 100% theme-aware (light/dark)
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <nxt1-hero-header />
 *
 * <!-- With custom headline -->
 * <nxt1-hero-header
 *   headline="The Future of Sports Recruiting"
 *   subheadline="Connect. Compete. Get Recruited."
 * />
 *
 * <!-- Landing page variant -->
 * <nxt1-hero-header
 *   variant="landing"
 *   (cardClick)="onAudienceCardClick($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NxtLogoComponent } from '../logo';
import { NxtIconComponent } from '../icon';
import { NxtAppStoreBadgesComponent } from '../app-store-badges';

// ============================================
// TYPES
// ============================================

/** Audience card configuration */
export interface HeroAudienceCard {
  /** Unique identifier */
  readonly id: 'athletes' | 'teams' | 'scouts' | 'fans';
  /** Display title */
  readonly title: string;
  /** Short description */
  readonly description: string;
  /** Icon name from design tokens */
  readonly icon: string;
  /** Navigation route */
  readonly route: string;
  /** CTA button text */
  readonly cta: string;
  /** Gradient class for card accent */
  readonly gradientClass: string;
  /** SEO-friendly aria label */
  readonly ariaLabel: string;
}

/** Hero section configuration */
export interface HeroConfig {
  /** Show animated background */
  readonly showAnimatedBg?: boolean;
  /** Show logo in header */
  readonly showLogo?: boolean;
  /** Show app store badges */
  readonly showAppBadges?: boolean;
  /** Custom CSS class */
  readonly className?: string;
}

/** Hero variant for different page contexts */
export type HeroVariant = 'default' | 'landing' | 'minimal' | 'compact';
export type HeroSeoHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Card click event */
export interface HeroAudienceCardClickEvent {
  readonly card: HeroAudienceCard;
  readonly originalEvent: MouseEvent;
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

/** Default audience cards configuration */
const DEFAULT_AUDIENCE_CARDS: readonly HeroAudienceCard[] = [
  {
    id: 'athletes',
    title: 'For Athletes',
    description:
      'Build your recruiting profile, showcase highlights, and connect with college coaches.',
    icon: 'athlete',
    route: '/auth?role=athlete',
    cta: 'Start Your Journey',
    gradientClass: 'hero-card--athletes',
    ariaLabel: 'Learn about NXT1 for athletes and start your recruiting journey',
  },
  {
    id: 'teams',
    title: 'For HS & Clubs',
    description: 'Manage rosters, promote your program, and help athletes get discovered.',
    icon: 'users',
    route: '/auth?role=coach',
    cta: 'Elevate Your Program',
    gradientClass: 'hero-card--teams',
    ariaLabel: 'Learn about NXT1 for high schools and club teams',
  },
  {
    id: 'scouts',
    title: 'For Scouts',
    description: 'Discover top talent, build watch lists, and streamline your recruiting process.',
    icon: 'scout',
    route: '/auth?role=scout',
    cta: 'Find Elite Talent',
    gradientClass: 'hero-card--scouts',
    ariaLabel: 'Learn about NXT1 for college scouts and recruiters',
  },
  {
    id: 'fans',
    title: 'For Fans',
    description: 'Follow rising stars, get insider updates, and support athletes you believe in.',
    icon: 'fan',
    route: '/auth?role=fan',
    cta: 'Join the Community',
    gradientClass: 'hero-card--fans',
    ariaLabel: 'Learn about NXT1 for sports fans and supporters',
  },
] as const;

@Component({
  selector: 'nxt1-hero-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NxtLogoComponent,
    NxtIconComponent,
    NxtAppStoreBadgesComponent,
  ],
  template: `
    <header
      class="hero-header relative overflow-hidden"
      [class]="variantClasses()"
      [attr.data-variant]="variant"
      role="banner"
    >
      <!-- Animated Background -->
      @if (showAnimatedBg) {
        <div class="hero-bg absolute inset-0 -z-10" aria-hidden="true">
          <div class="hero-bg__gradient"></div>
          <div class="hero-bg__grid"></div>
          <div class="hero-bg__glow hero-bg__glow--1"></div>
          <div class="hero-bg__glow hero-bg__glow--2"></div>
          <div class="hero-bg__glow hero-bg__glow--3"></div>
        </div>
      }

      <div
        class="hero-content mx-auto w-full px-4 pt-2 pb-12 sm:px-6 sm:pt-4 sm:pb-16 lg:px-8 lg:pt-6 lg:pb-20"
        style="max-width: var(--nxt1-root-shell-max-width, 80rem)"
      >
        <!-- SEO heading (screen reader only) -->
        @if (seoHeadingLevel === 1) {
          <h1 class="sr-only">NXT1 — The Future of Sports Recruiting</h1>
        } @else {
          <h2 class="sr-only">NXT1 — The Future of Sports Recruiting</h2>
        }

        <!-- Brand Logo -->
        @if (showLogo) {
          <div class="hero-logo mb-8 flex justify-center">
            <nxt1-logo size="lg" variant="header" />
          </div>
        }

        <!-- Audience Cards Section -->
        <section class="hero-cards" aria-label="Choose your path">
          <h2 class="sr-only">Who NXT1 is for</h2>

          <div
            class="hero-cards__grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6"
          >
            @for (card of audienceCards(); track card.id) {
              <article
                class="hero-card group border-border bg-surface-200/80 hover:border-border-primary hover:shadow-glow/10 relative flex flex-col overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all duration-300 hover:shadow-lg"
                [class]="card.gradientClass"
                [attr.aria-label]="card.ariaLabel"
              >
                <!-- Card Accent Gradient -->
                <div
                  class="hero-card__accent absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden="true"
                ></div>

                <!-- Icon Container -->
                <div
                  class="hero-card__icon bg-surface-300 group-hover:bg-primary group-hover:text-text-inverse mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300"
                >
                  <nxt1-icon [name]="card.icon" [size]="24" />
                </div>

                <!-- Content -->
                <h3 class="hero-card__title text-text-primary mb-2 text-xl font-bold">
                  {{ card.title }}
                </h3>
                <p class="hero-card__description text-text-secondary mb-4 flex-1 text-sm">
                  {{ card.description }}
                </p>

                <!-- CTA Link -->
                <a
                  [routerLink]="card.route.split('?')[0]"
                  [queryParams]="parseQueryParams(card.route)"
                  class="hero-card__cta text-primary inline-flex items-center gap-1 text-sm font-semibold transition-all duration-300 group-hover:gap-2"
                  (click)="onCardClick($event, card)"
                >
                  {{ card.cta }}
                  <nxt1-icon name="arrowRight" [size]="16" />
                </a>
              </article>
            }
          </div>
        </section>

        <!-- Primary CTA -->
        @if (showPrimaryCta) {
          <div
            class="hero-cta mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:mt-12"
          >
            <!-- Desktop: Web CTA buttons -->
            <div class="hero-cta__desktop">
              <a
                [routerLink]="['/auth']"
                class="btn-hero-primary group bg-primary text-text-inverse hover:bg-primaryLight hover:shadow-glow focus:ring-primary focus:ring-offset-bg-primary inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-lg font-semibold shadow-lg transition-all duration-300 hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:outline-none"
              >
                Get Started Free
                <nxt1-icon
                  name="arrowRight"
                  [size]="20"
                  class="transition-transform duration-300 group-hover:translate-x-1"
                />
              </a>
              <a
                [routerLink]="['/explore']"
                class="btn-hero-secondary border-border bg-surface-200/50 text-text-primary hover:border-border-strong hover:bg-surface-300/50 inline-flex items-center justify-center gap-2 rounded-xl border px-8 py-4 text-lg font-semibold backdrop-blur-sm transition-all duration-300"
              >
                Explore Athletes
              </a>
            </div>

            <!-- Mobile: App store download badges -->
            <nxt1-app-store-badges class="hero-cta__mobile" />
          </div>
        }

        <!-- Trust Badges / Social Proof -->
        @if (showTrustBadges) {
          <div class="hero-trust mt-12 text-center lg:mt-16">
            <p class="text-text-tertiary mb-4 text-sm">
              Trusted by athletes and coaches nationwide
            </p>
            <div class="flex flex-wrap items-center justify-center gap-6 opacity-60">
              <!-- Placeholder for trust badges - can be customized via projection -->
              <ng-content select="[hero-trust-badges]"></ng-content>
              @if (!hasTrustBadgesContent()) {
                <div class="text-text-secondary flex items-center gap-2">
                  <nxt1-icon name="athlete" [size]="20" />
                  <span class="text-sm font-medium">10,000+ Athletes</span>
                </div>
                <div class="text-text-secondary flex items-center gap-2">
                  <nxt1-icon name="graduationCap" [size]="20" />
                  <span class="text-sm font-medium">500+ Schools</span>
                </div>
                <div class="text-text-secondary flex items-center gap-2">
                  <nxt1-icon name="trophy" [size]="20" />
                  <span class="text-sm font-medium">4.9 App Rating</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- App Store Badges (conditional extra section, independent of primary CTA mobile switch) -->
        @if (showAppBadges) {
          <div class="hero-apps mt-8 flex flex-wrap items-center justify-center gap-4">
            <nxt1-app-store-badges />
          </div>
        }
      </div>
    </header>
  `,
  styles: [
    `
      /* ============================================
       HERO HEADER BASE STYLES
       Using CSS custom properties for theme awareness
       ============================================ */

      .hero-header {
        min-height: auto;
        display: flex;
        align-items: center;
      }

      .hero-header[data-variant='minimal'] {
        min-height: auto;
        padding-top: var(--nxt1-spacing-8);
        padding-bottom: var(--nxt1-spacing-8);
      }

      .hero-header[data-variant='compact'] {
        min-height: 50vh;
      }

      /* ============================================
       ANIMATED BACKGROUND
       ============================================ */

      .hero-bg {
        background: var(--nxt1-color-bg-primary);
      }

      .hero-bg__gradient {
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse 80% 50% at 50% -20%,
          var(--nxt1-color-alpha-primary10) 0%,
          transparent 50%
        );
      }

      .hero-bg__grid {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(var(--nxt1-color-border-subtle) 1px, transparent 1px),
          linear-gradient(90deg, var(--nxt1-color-border-subtle) 1px, transparent 1px);
        background-size: 64px 64px;
        mask-image: linear-gradient(to bottom, white 0%, transparent 70%);
        -webkit-mask-image: linear-gradient(to bottom, white 0%, transparent 70%);
      }

      .hero-bg__glow {
        position: absolute;
        border-radius: 50%;
        filter: blur(100px);
        opacity: 0.3;
        animation: float 20s ease-in-out infinite;
      }

      .hero-bg__glow--1 {
        width: 400px;
        height: 400px;
        top: -10%;
        left: 10%;
        background: var(--nxt1-color-primary);
        animation-delay: 0s;
      }

      .hero-bg__glow--2 {
        width: 300px;
        height: 300px;
        top: 20%;
        right: 10%;
        background: var(--nxt1-color-secondary);
        animation-delay: -7s;
      }

      .hero-bg__glow--3 {
        width: 250px;
        height: 250px;
        bottom: 10%;
        left: 30%;
        background: var(--nxt1-color-accent);
        animation-delay: -14s;
      }

      @keyframes float {
        0%,
        100% {
          transform: translate(0, 0) scale(1);
        }
        25% {
          transform: translate(20px, -20px) scale(1.05);
        }
        50% {
          transform: translate(-10px, 20px) scale(0.95);
        }
        75% {
          transform: translate(-20px, -10px) scale(1.02);
        }
      }

      /* ============================================
       AUDIENCE CARDS - Gradient Accents
       ============================================ */

      .hero-card--athletes .hero-card__accent {
        background: linear-gradient(135deg, var(--nxt1-color-alpha-primary10) 0%, transparent 60%);
      }

      .hero-card--teams .hero-card__accent {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, transparent 60%);
      }

      .hero-card--scouts .hero-card__accent {
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, transparent 60%);
      }

      .hero-card--fans .hero-card__accent {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, transparent 60%);
      }

      /* ============================================
       CTA MOBILE / DESKTOP SWITCHING
       Mobile-first: show app badges, hide web CTAs
       ============================================ */

      .hero-cta__desktop {
        display: none;
      }

      .hero-cta__mobile {
        display: inline-flex;
      }

      @media (min-width: 1024px) {
        .hero-cta__desktop {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: var(--nxt1-spacing-4);
        }

        .hero-cta__mobile {
          display: none;
        }
      }

      /* ============================================
       RESPONSIVE ADJUSTMENTS
       ============================================ */

      @media (max-width: 640px) {
        .hero-header {
          min-height: auto;
          padding-top: 0;
          padding-bottom: 0;
        }

        .hero-header[data-variant='minimal'] .hero-cards__grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--nxt1-spacing-3);
        }

        .hero-header[data-variant='minimal'] .hero-card {
          padding: var(--nxt1-spacing-4);
          border-radius: var(--nxt1-borderRadius-xl);
        }

        .hero-header[data-variant='minimal'] .hero-card__icon {
          width: calc(var(--nxt1-spacing-10) + var(--nxt1-spacing-1));
          height: calc(var(--nxt1-spacing-10) + var(--nxt1-spacing-1));
          margin-bottom: var(--nxt1-spacing-3);
        }

        .hero-header[data-variant='minimal'] .hero-card__title {
          margin-bottom: var(--nxt1-spacing-1);
          font-size: var(--nxt1-fontSize-lg);
          line-height: 1.2;
        }

        .hero-header[data-variant='minimal'] .hero-card__description {
          margin-bottom: var(--nxt1-spacing-3);
          font-size: var(--nxt1-fontSize-xs);
          line-height: var(--nxt1-lineHeight-normal);
        }

        .hero-header[data-variant='minimal'] .hero-card__cta {
          font-size: var(--nxt1-fontSize-xs);
        }

        .hero-bg__glow {
          display: none;
        }
      }

      /* ============================================
       ACCESSIBILITY
       ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .hero-bg__glow {
          animation: none;
        }
      }

      /* Screen reader only utility */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtHeroHeaderComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Main headline text */
  @Input() headline = '';

  /** Subheadline text */
  @Input() subheadline = '';

  /** Hero variant for different contexts */
  @Input() variant: HeroVariant = 'default';

  /** Screen-reader-only SEO heading level for this section. */
  @Input() seoHeadingLevel: HeroSeoHeadingLevel = 1;

  /** Show animated background */
  @Input() showAnimatedBg = true;

  /** Show logo */
  @Input() showLogo = true;

  /** Show primary CTA buttons */
  @Input() showPrimaryCta = true;

  /** Show app store badges */
  @Input() showAppBadges = false;

  /** Show trust badges section */
  @Input() showTrustBadges = true;

  /** Custom audience cards */
  @Input() set cards(value: HeroAudienceCard[]) {
    this._cards.set(value);
  }

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when an audience card is clicked */
  @Output() cardClick = new EventEmitter<HeroAudienceCardClickEvent>();

  // ============================================
  // STATE
  // ============================================

  private readonly _cards = signal<HeroAudienceCard[]>([...DEFAULT_AUDIENCE_CARDS]);

  /** Current audience cards */
  readonly audienceCards = computed(() => this._cards());

  /** Variant-specific CSS classes */
  readonly variantClasses = computed(() => {
    const classes: string[] = [];

    switch (this.variant) {
      case 'landing':
        classes.push('hero-header--landing');
        break;
      case 'minimal':
        classes.push('hero-header--minimal');
        break;
      case 'compact':
        classes.push('hero-header--compact');
        break;
    }

    return classes.join(' ');
  });

  // ============================================
  // METHODS
  // ============================================

  /**
   * Parse query params from route string
   */
  parseQueryParams(route: string): Record<string, string> | null {
    const queryIndex = route.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = route.substring(queryIndex + 1);
    const params: Record<string, string> = {};

    queryString.split('&').forEach((param) => {
      const [key, value] = param.split('=');
      if (key && value) {
        params[key] = decodeURIComponent(value);
      }
    });

    return Object.keys(params).length > 0 ? params : null;
  }

  /**
   * Handle card click event
   */
  onCardClick(event: MouseEvent, card: HeroAudienceCard): void {
    this.cardClick.emit({ card, originalEvent: event });
  }

  /**
   * Check if trust badges content is provided via projection
   */
  hasTrustBadgesContent(): boolean {
    // This will be overridden if content is projected
    return false;
  }
}
