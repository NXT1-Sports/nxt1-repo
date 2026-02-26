/**
 * @fileoverview Explore Camps Dashboard Component — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * 5-section elite camps dashboard for the /explore route "Camps" tab.
 * SSR-safe semantic HTML, zero Ionic dependencies, 100% design-token CSS.
 *
 * ⭐ WEB ONLY — Pure HTML/Tailwind, Zero Ionic, SSR-optimized ⭐
 *
 * Sections:
 *  1. Agent X Circuit         — AI-curated hero carousel
 *  2. Verified Combines       — Metric-testing camps ticker
 *  3. College Hosted Circuit  — On-campus bento grid (filterable)
 *  4. Elite Showcases         — Invite-only/high-exposure list
 *  5. Your Itinerary          — Saved & registered camps calendar
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtLoggingService } from '../../services/logging/logging.service';

// ─────────────────────────────────────────────────────────────
// LOCAL DATA MODELS
// ─────────────────────────────────────────────────────────────

export interface CampHeroItem {
  readonly id: string;
  readonly imageUrl: string;
  readonly logoUrl?: string;
  readonly name: string;
  readonly date: string;
  readonly location: string;
  readonly aiReason: string;
}

export interface VerifiedCombine {
  readonly id: string;
  readonly name: string;
  readonly partner: string;
  readonly date: string;
  readonly location: string;
  readonly sport: string;
}

export interface CollegeCamp {
  readonly id: string;
  readonly collegeName: string;
  readonly logoUrl?: string;
  readonly division: 'D1' | 'D2' | 'D3' | 'NAIA';
  readonly date: string;
  readonly location: string;
  readonly sport: string;
  readonly registerUrl?: string;
}

export interface EliteShowcase {
  readonly id: string;
  readonly name: string;
  readonly thumbnailUrl?: string;
  readonly date: string;
  readonly location: string;
  readonly exposureRating: number; // 1-5
  readonly isInviteOnly: boolean;
  readonly inviteInstructions?: string;
  readonly sport: string;
}

export interface ItineraryCamp {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly location: string;
  readonly status: 'upcoming' | 'registered' | 'attended';
  readonly daysUntil?: number;
  readonly metricsUrl?: string;
  readonly scoutReportUrl?: string;
}

type DivisionFilter = 'ALL' | 'D1' | 'D2' | 'D3' | 'NAIA';

// ─────────────────────────────────────────────────────────────
// MOCK DATA  (replace with real service calls)
// ─────────────────────────────────────────────────────────────

const HERO_CAMPS: CampHeroItem[] = [
  {
    id: 'hero-1',
    imageUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80',
    name: 'Agent X Elite QB Circuit',
    date: 'Jun 14–15, 2026',
    location: 'Los Angeles, CA',
    aiReason: '✨ 18 D1 Coaches Attending',
  },
  {
    id: 'hero-2',
    imageUrl: 'https://images.unsplash.com/photo-1551958219-acbc595d6dff?w=800&q=80',
    name: 'National Combine Series — Dallas',
    date: 'Jul 4–5, 2026',
    location: 'Dallas, TX',
    aiReason: '✨ Matches Your #1 Target School',
  },
  {
    id: 'hero-3',
    imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
    name: 'SEC Future Stars Camp',
    date: 'Jul 20, 2026',
    location: 'Nashville, TN',
    aiReason: '✨ 12 SEC Programs in Attendance',
  },
];

const VERIFIED_COMBINES: VerifiedCombine[] = [
  {
    id: 'vc-1',
    name: 'Zybek Laser-Timed 40 Series',
    partner: 'Powered by Zybek Sports',
    date: 'Jun 7, 2026',
    location: 'Atlanta, GA',
    sport: 'Football',
  },
  {
    id: 'vc-2',
    name: 'Pro-Day Metrics Camp',
    partner: 'Powered by SPARQ',
    date: 'Jun 21, 2026',
    location: 'Phoenix, AZ',
    sport: 'Football',
  },
  {
    id: 'vc-3',
    name: 'Vertical & Wingspan Showcase',
    partner: 'Powered by Nike Sports Research Lab',
    date: 'Jul 10, 2026',
    location: 'Chicago, IL',
    sport: 'Basketball',
  },
  {
    id: 'vc-4',
    name: 'Speed & Agility Verified',
    partner: 'Powered by Freelap USA',
    date: 'Jul 18, 2026',
    location: 'Seattle, WA',
    sport: 'Multi-Sport',
  },
];

const COLLEGE_CAMPS: CollegeCamp[] = [
  {
    id: 'cc-1',
    collegeName: 'Alabama',
    division: 'D1',
    date: 'Jun 12, 2026',
    location: 'Tuscaloosa, AL',
    sport: 'Football',
  },
  {
    id: 'cc-2',
    collegeName: 'Ohio State',
    division: 'D1',
    date: 'Jun 19, 2026',
    location: 'Columbus, OH',
    sport: 'Football',
  },
  {
    id: 'cc-3',
    collegeName: 'Northwestern',
    division: 'D1',
    date: 'Jun 26, 2026',
    location: 'Evanston, IL',
    sport: 'Football',
  },
  {
    id: 'cc-4',
    collegeName: 'Lenoir-Rhyne',
    division: 'D2',
    date: 'Jul 3, 2026',
    location: 'Hickory, NC',
    sport: 'Football',
  },
  {
    id: 'cc-5',
    collegeName: 'Mary Hardin-Baylor',
    division: 'D3',
    date: 'Jul 10, 2026',
    location: 'Belton, TX',
    sport: 'Football',
  },
  {
    id: 'cc-6',
    collegeName: 'Morningside University',
    division: 'NAIA',
    date: 'Jul 17, 2026',
    location: 'Sioux City, IA',
    sport: 'Football',
  },
];

const ELITE_SHOWCASES: EliteShowcase[] = [
  {
    id: 'es-1',
    name: 'Elite 11 Quarterback Camp',
    date: 'Jun 5–7, 2026',
    location: 'Los Angeles, CA',
    exposureRating: 5,
    isInviteOnly: true,
    inviteInstructions: 'Earn an invite by ranking top 5 at a qualifying regional.',
    sport: 'Football',
  },
  {
    id: 'es-2',
    name: 'Under Armour All-America Camp Series',
    date: 'Jun 28, 2026',
    location: 'Miami, FL',
    exposureRating: 5,
    isInviteOnly: false,
    sport: 'Football',
  },
  {
    id: 'es-3',
    name: 'Adidas Nations Showcase',
    date: 'Jul 14–16, 2026',
    location: 'Las Vegas, NV',
    exposureRating: 4,
    isInviteOnly: true,
    inviteInstructions: 'Requires coach nomination or top 50 national ranking.',
    sport: 'Basketball',
  },
  {
    id: 'es-4',
    name: 'Nike Football Training Camp',
    date: 'Aug 2, 2026',
    location: 'Portland, OR',
    exposureRating: 4,
    isInviteOnly: false,
    sport: 'Football',
  },
];

const ITINERARY_CAMPS: ItineraryCamp[] = [
  {
    id: 'it-1',
    name: 'Agent X Elite QB Circuit',
    date: 'Jun 14, 2026',
    location: 'Los Angeles, CA',
    status: 'registered',
    daysUntil: 14,
  },
  {
    id: 'it-2',
    name: 'Under Armour All-America Camp',
    date: 'Jun 28, 2026',
    location: 'Miami, FL',
    status: 'upcoming',
    daysUntil: 28,
  },
  {
    id: 'it-3',
    name: 'National Combine Series 2025',
    date: 'Nov 12, 2025',
    location: 'Dallas, TX',
    status: 'attended',
    metricsUrl: '/metrics/ncbs-2025',
    scoutReportUrl: '/scout-reports/ncbs-2025',
  },
];

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

@Component({
  selector: 'nxt1-explore-camps-web',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="camps-dashboard" aria-label="Camps Elite Dashboard">

      <!-- ══════════════════════════════════════════════════════
           SECTION 1 — Agent X Circuit (Hero Carousel)
           ══════════════════════════════════════════════════════ -->
      <section class="camps-section" aria-label="Agent X Circuit — Curated Top Picks">
        <header class="section-header">
          <div>
            <h2 class="text-text-primary section-title">Agent X Circuit</h2>
            <p class="text-text-secondary section-subtitle">AI-curated camps built for you</p>
          </div>
          <button type="button" class="see-all-btn text-primary" aria-label="See all Agent X picks">
            See All
            <svg class="see-all-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clip-rule="evenodd"/>
            </svg>
          </button>
        </header>

        <!-- Hero Carousel — no @defer; must load as LCP element -->
        <div class="hero-carousel" role="list" aria-label="Featured camp cards">
          @for (camp of heroCamps; track camp.id) {
            <article
              class="hero-card"
              role="listitem"
              [attr.aria-label]="camp.name"
            >
              <!-- Background image -->
              <div
                class="hero-card__bg"
                [style.background-image]="'url(' + camp.imageUrl + ')'"
                aria-hidden="true"
              ></div>
              <!-- Frosted glass overlay -->
              <div class="hero-card__overlay bg-surface-100/80 backdrop-blur-md">
                <div class="hero-card__body">
                  <!-- AI Reasoning Badge -->
                  <span
                    class="ai-badge text-primary border-border-primary"
                    aria-label="AI recommendation reason"
                  >{{ camp.aiReason }}</span>
                  <h3 class="hero-card__name text-text-inverse">{{ camp.name }}</h3>
                  <p class="hero-card__meta text-primary">
                    <time>{{ camp.date }}</time>
                    &nbsp;·&nbsp;{{ camp.location }}
                  </p>
                </div>
              </div>
            </article>
          }
        </div>
      </section>

      <!-- ══════════════════════════════════════════════════════
           SECTION 2 — Verified Combines (deferred)
           ══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="camps-section" aria-label="Verified Combines — Official Metric Testing">
          <header class="section-header">
            <div>
              <h2 class="text-text-primary section-title">Verified Combines</h2>
              <p class="text-text-secondary section-subtitle">Official laser-timed measurements</p>
            </div>
          </header>

          <div class="combines-ticker" role="list" aria-label="Verified combine events">
            @for (combine of verifiedCombines; track combine.id) {
              <article
                class="combine-card bg-surface-200 border-border-subtle"
                role="listitem"
                [attr.aria-label]="combine.name"
              >
                <div class="combine-card__top">
                  <span
                    class="verified-badge"
                    aria-label="Verified metrics event"
                  >✔ Verified Metrics</span>
                </div>
                <h3 class="combine-card__name text-text-primary">{{ combine.name }}</h3>
                <p class="combine-card__partner text-text-secondary">{{ combine.partner }}</p>
                <p class="combine-card__meta text-text-tertiary">
                  <time>{{ combine.date }}</time> · {{ combine.location }}
                </p>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section" aria-hidden="true">
          <div class="skeleton-header animate-pulse bg-surface-300"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-card animate-pulse bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ══════════════════════════════════════════════════════
           SECTION 3 — College Hosted Circuit (deferred)
           ══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="camps-section" aria-label="College Hosted Circuit — On-Campus Camps">
          <header class="section-header">
            <div>
              <h2 class="text-text-primary section-title">College Hosted Circuit</h2>
              <p class="text-text-secondary section-subtitle">On-campus programs direct from coaches</p>
            </div>
          </header>

          <!-- Division filter chips -->
          <div class="filter-chips" role="group" aria-label="Filter by division">
            @for (div of divisionFilters; track div) {
              <button
                type="button"
                class="filter-chip bg-surface-200 text-text-secondary"
                [class.filter-chip--active]="activeDivision() === div"
                [attr.aria-pressed]="activeDivision() === div"
                (click)="setDivisionFilter(div)"
              >{{ div }}</button>
            }
          </div>

          <!-- Bento grid -->
          <div class="college-grid" role="list" aria-label="College camp cards">
            @for (camp of filteredCollegeCamps(); track camp.id) {
              <article
                class="college-card bg-surface-100"
                role="listitem"
                [attr.aria-label]="camp.collegeName + ' camp'"
              >
                <div class="college-card__logo" aria-hidden="true">
                  {{ camp.collegeName.charAt(0) }}
                </div>
                <div class="college-card__body">
                  <div class="college-card__top">
                    <h3 class="college-card__name text-text-primary">{{ camp.collegeName }}</h3>
                    <span class="division-badge bg-surface-200 text-text-secondary">
                      {{ camp.division }}
                    </span>
                  </div>
                  <p class="college-card__meta text-text-tertiary">
                    <time>{{ camp.date }}</time> · {{ camp.location }}
                  </p>
                </div>
                <button
                  type="button"
                  class="btn-primary register-btn"
                  [attr.aria-label]="'Register for ' + camp.collegeName + ' camp'"
                >
                  Register
                </button>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section" aria-hidden="true">
          <div class="skeleton-header animate-pulse bg-surface-300"></div>
          <div class="skeleton-grid">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-card-tall animate-pulse bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ══════════════════════════════════════════════════════
           SECTION 4 — Elite Showcases (deferred)
           ══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="camps-section" aria-label="Elite Showcases — High-Exposure Events">
          <header class="section-header">
            <div>
              <h2 class="text-text-primary section-title">Elite Showcases</h2>
              <p class="text-text-secondary section-subtitle">Invite-only &amp; high-exposure events</p>
            </div>
          </header>

          <ul class="showcase-list" aria-label="Elite showcase events">
            @for (showcase of eliteShowcases; track showcase.id) {
              <li
                class="showcase-item bg-surface-100 border-b border-border-subtle"
                [attr.aria-label]="showcase.name"
              >
                <!-- Left: Thumbnail / Logo placeholder -->
                <div class="showcase-item__thumb" aria-hidden="true">
                  {{ showcase.sport.charAt(0) }}
                </div>

                <!-- Right: Info -->
                <div class="showcase-item__body">
                  <div class="showcase-item__top">
                    <h3 class="showcase-item__name text-text-primary">{{ showcase.name }}</h3>
                    @if (showcase.isInviteOnly) {
                      <span class="lock-badge text-text-tertiary" aria-label="Invite only">
                        🔒 Invite Only
                      </span>
                    }
                  </div>

                  <p class="showcase-item__meta text-text-secondary">
                    <time>{{ showcase.date }}</time> · {{ showcase.location }}
                  </p>

                  <!-- Exposure Rating -->
                  <div class="exposure-rating" [attr.aria-label]="showcase.exposureRating + ' out of 5 exposure rating'">
                    @for (star of getStars(showcase.exposureRating); track $index) {
                      <span class="text-primary" aria-hidden="true">⭐</span>
                    }
                    <span class="text-text-tertiary exposure-label">Exposure</span>
                  </div>

                  @if (showcase.isInviteOnly && showcase.inviteInstructions) {
                    <p class="invite-instructions text-text-tertiary">
                      {{ showcase.inviteInstructions }}
                    </p>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      } @placeholder {
        <div class="skeleton-section" aria-hidden="true">
          <div class="skeleton-header animate-pulse bg-surface-300"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-list-item animate-pulse bg-surface-300"></div>
          }
        </div>
      }

      <!-- ══════════════════════════════════════════════════════
           SECTION 5 — Your Itinerary (deferred)
           ══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="camps-section camps-section--last" aria-label="Your Itinerary — Saved Camps">
          <header class="section-header">
            <div>
              <h2 class="text-text-primary section-title">Your Itinerary</h2>
              <p class="text-text-secondary section-subtitle">Saved, registered &amp; past camps</p>
            </div>
          </header>

          <div class="itinerary-grid bg-surface-200" role="list" aria-label="Your camp itinerary">
            @for (camp of itineraryCamps; track camp.id) {
              <article
                class="itinerary-item"
                role="listitem"
                [attr.aria-label]="camp.name"
              >
                <div class="itinerary-item__info">
                  <h3 class="itinerary-item__name text-text-primary">{{ camp.name }}</h3>
                  <p class="itinerary-item__meta text-text-secondary">
                    <time>{{ camp.date }}</time> · {{ camp.location }}
                  </p>
                </div>

                @if (camp.status === 'attended') {
                  <div class="itinerary-item__actions">
                    @if (camp.metricsUrl) {
                      <a
                        [href]="camp.metricsUrl"
                        class="action-link text-primary"
                        aria-label="View verified metrics"
                      >View Metrics</a>
                    }
                    @if (camp.scoutReportUrl) {
                      <a
                        [href]="camp.scoutReportUrl"
                        class="action-link text-primary"
                        aria-label="View scout report"
                      >Scout Report</a>
                    }
                  </div>
                } @else {
                  <span
                    class="countdown-badge bg-surface-300/90 text-text-primary text-xs rounded-md"
                    [attr.aria-label]="'Starts in ' + camp.daysUntil + ' days'"
                  >
                    Starts in {{ camp.daysUntil }} Day{{ camp.daysUntil !== 1 ? 's' : '' }}
                  </span>
                }
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="skeleton-section" aria-hidden="true">
          <div class="skeleton-header animate-pulse bg-surface-300"></div>
          <div class="skeleton-bento animate-pulse bg-surface-300"></div>
        </div>
      }

    </article>
  `,
  styles: [
    `
      /* ================================================================
         EXPLORE CAMPS DASHBOARD — Web (Zero Ionic)
         100% design-token driven. Zero hardcoded colors.
         ================================================================ */

      :host {
        display: block;
      }

      /* ── DASHBOARD WRAPPER ── */
      .camps-dashboard {
        padding-bottom: var(--nxt1-spacing-10, 40px);
      }

      /* ── SECTION COMMON ── */
      .camps-section {
        padding: var(--nxt1-spacing-6, 24px) 0 0;
      }
      .camps-section--last {
        padding-bottom: var(--nxt1-spacing-4, 16px);
      }

      .section-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-3, 12px);
        gap: var(--nxt1-spacing-2, 8px);
      }
      .section-title {
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: -0.3px;
        margin: 0;
      }
      .section-subtitle {
        font-size: var(--nxt1-fontSize-sm, 13px);
        margin: 2px 0 0;
      }
      .see-all-btn {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        white-space: nowrap;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .see-all-icon {
        width: 14px;
        height: 14px;
      }

      /* ══════════════════════════════
         SECTION 1 — HERO CAROUSEL
         ══════════════════════════════ */
      .hero-carousel {
        display: flex;
        gap: var(--nxt1-spacing-4, 16px);
        padding: 0 var(--nxt1-spacing-5, 20px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .hero-carousel::-webkit-scrollbar { display: none; }

      .hero-card {
        position: relative;
        flex-shrink: 0;
        width: 300px;
        height: 200px;
        border-radius: var(--nxt1-radius-lg, 16px);
        overflow: hidden;
        scroll-snap-align: start;
        cursor: pointer;
      }
      .hero-card__bg {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
      }
      .hero-card__overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-radius-lg, 16px);
        border: 1px solid var(--nxt1-color-border-primary, rgba(204,255,0,0.3));
      }
      .hero-card__body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
      }
      .ai-badge {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.2px;
        border: 1px solid;
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 2px 8px;
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }
      .hero-card__name {
        font-size: var(--nxt1-fontSize-base, 16px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        margin: 0;
        line-height: 1.3;
        text-shadow: 0 1px 4px rgba(0,0,0,0.5);
      }
      .hero-card__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        margin: 0;
        text-shadow: 0 1px 3px rgba(0,0,0,0.4);
      }

      /* ══════════════════════════════
         SECTION 2 — VERIFIED COMBINES
         ══════════════════════════════ */
      .combines-ticker {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-5, 20px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .combines-ticker::-webkit-scrollbar { display: none; }

      .combine-card {
        flex-shrink: 0;
        width: 220px;
        padding: var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-radius-md, 12px);
        border: 1px solid;
        scroll-snap-align: start;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
      }
      .combine-card__top {
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }
      .verified-badge {
        display: inline-flex;
        align-items: center;
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 10%, transparent);
        color: var(--nxt1-color-primary, #ccff00);
        border-radius: var(--nxt1-radius-full, 9999px);
        padding: 2px 8px;
      }
      .combine-card__name {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        margin: 0;
      }
      .combine-card__partner {
        font-size: var(--nxt1-fontSize-xs, 11px);
        margin: 0;
      }
      .combine-card__meta {
        font-size: var(--nxt1-fontSize-xs, 11px);
        margin: 0;
      }

      /* ══════════════════════════════
         SECTION 3 — COLLEGE HOSTED
         ══════════════════════════════ */
      .filter-chips {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        padding: 0 var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px);
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .filter-chips::-webkit-scrollbar { display: none; }

      .filter-chip {
        flex-shrink: 0;
        padding: 5px 14px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid var(--nxt1-color-border, rgba(255,255,255,0.08));
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        cursor: pointer;
        transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
        -webkit-tap-highlight-color: transparent;
      }
      .filter-chip--active {
        background: var(--nxt1-color-primary, #ccff00) !important;
        color: var(--nxt1-color-on-primary, #000) !important;
        border-color: var(--nxt1-color-primary, #ccff00) !important;
      }

      .college-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-5, 20px);
      }

      .college-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-radius-md, 12px);
        border: 1px solid var(--nxt1-color-border, rgba(255,255,255,0.06));
      }
      .college-card__logo {
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-sm, 8px);
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-on-primary, #000);
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .college-card__body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .college-card__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-1, 4px);
      }
      .college-card__name {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .division-badge {
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        padding: 2px 6px;
        border-radius: var(--nxt1-radius-sm, 6px);
        flex-shrink: 0;
      }
      .college-card__meta {
        font-size: var(--nxt1-fontSize-xs, 11px);
        margin: 0;
      }
      .register-btn {
        width: 100%;
        padding: 8px;
        border-radius: var(--nxt1-radius-sm, 8px);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-on-primary, #000);
        border: none;
        cursor: pointer;
        transition: opacity 150ms ease;
        -webkit-tap-highlight-color: transparent;
      }
      .register-btn:hover { opacity: 0.9; }
      .register-btn:active { opacity: 0.75; }

      /* ══════════════════════════════
         SECTION 4 — ELITE SHOWCASES
         ══════════════════════════════ */
      .showcase-list {
        list-style: none;
        margin: 0;
        padding: 0 var(--nxt1-spacing-5, 20px);
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .showcase-item {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px) 0;
      }
      .showcase-item:last-child {
        border-bottom: none !important;
      }
      .showcase-item__thumb {
        flex-shrink: 0;
        width: 52px;
        height: 52px;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-200, rgba(255,255,255,0.06));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-secondary, rgba(255,255,255,0.7));
      }
      .showcase-item__body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .showcase-item__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
        flex-wrap: wrap;
      }
      .showcase-item__name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        margin: 0;
        flex: 1;
      }
      .lock-badge {
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        flex-shrink: 0;
      }
      .showcase-item__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        margin: 0;
      }
      .exposure-rating {
        display: flex;
        align-items: center;
        gap: 2px;
        margin-top: 2px;
      }
      .exposure-label {
        font-size: var(--nxt1-fontSize-xs, 11px);
        margin-left: 4px;
      }
      .invite-instructions {
        font-size: var(--nxt1-fontSize-xs, 11px);
        margin: 2px 0 0;
        line-height: 1.4;
      }

      /* ══════════════════════════════
         SECTION 5 — ITINERARY
         ══════════════════════════════ */
      .itinerary-grid {
        margin: 0 var(--nxt1-spacing-5, 20px);
        border-radius: var(--nxt1-radius-lg, 16px);
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border, rgba(255,255,255,0.06));
      }
      .itinerary-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255,255,255,0.06));
      }
      .itinerary-item:last-child {
        border-bottom: none;
      }
      .itinerary-item__info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .itinerary-item__name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        margin: 0;
      }
      .itinerary-item__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        margin: 0;
      }
      .itinerary-item__actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
        align-items: flex-end;
      }
      .action-link {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        text-decoration: none;
        white-space: nowrap;
      }
      .action-link:hover { text-decoration: underline; }
      .countdown-badge {
        padding: 4px 10px;
        flex-shrink: 0;
        white-space: nowrap;
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      /* ══════════════════════════════
         SKELETON LOADERS
         ══════════════════════════════ */
      .skeleton-section {
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-5, 20px) 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }
      .skeleton-header {
        height: 44px;
        border-radius: var(--nxt1-radius-md, 12px);
      }
      .skeleton-row {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        overflow: hidden;
      }
      .skeleton-card {
        flex-shrink: 0;
        width: 220px;
        height: 120px;
        border-radius: var(--nxt1-radius-md, 12px);
      }
      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3, 12px);
      }
      .skeleton-card-tall {
        height: 160px;
        border-radius: var(--nxt1-radius-md, 12px);
      }
      .skeleton-list-item {
        height: 72px;
        border-radius: var(--nxt1-radius-md, 12px);
      }
      .skeleton-bento {
        height: 240px;
        border-radius: var(--nxt1-radius-lg, 16px);
      }
    `,
  ],
})
export class ExploreCampsWebComponent {
  private readonly logger = inject(NxtLoggingService).child('ExploreCampsWeb');

  // ── Public mock data bound to template ──
  readonly heroCamps = HERO_CAMPS;
  readonly verifiedCombines = VERIFIED_COMBINES;
  readonly eliteShowcases = ELITE_SHOWCASES;
  readonly itineraryCamps = ITINERARY_CAMPS;
  readonly skeletonItems = Array(4).fill(null);

  // ── Division filter state ──
  readonly divisionFilters: DivisionFilter[] = ['ALL', 'D1', 'D2', 'D3', 'NAIA'];
  private readonly _activeDivision = signal<DivisionFilter>('ALL');
  readonly activeDivision = this._activeDivision.asReadonly();

  readonly filteredCollegeCamps = computed<CollegeCamp[]>(() => {
    const div = this._activeDivision();
    return div === 'ALL' ? COLLEGE_CAMPS : COLLEGE_CAMPS.filter((c) => c.division === div);
  });

  setDivisionFilter(division: DivisionFilter): void {
    this._activeDivision.set(division);
    this.logger.debug('Division filter changed', { division });
  }

  /** Returns an array of `length` for @for star rendering. */
  getStars(rating: number): null[] {
    return Array(Math.max(0, Math.min(5, rating))).fill(null);
  }
}
