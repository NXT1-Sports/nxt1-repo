/**
 * @fileoverview Explore Camps Dashboard Component — Mobile (Ionic)
 * @module @nxt1/ui/explore/mobile
 * @version 1.0.0
 *
 * 5-section elite camps dashboard for the /explore route "Camps" tab.
 * Uses Ionic components for native feel; inherits NXT1 design tokens
 * via the --ion-* mapping layer.
 *
 * ⭐ MOBILE ONLY — Uses Ionic components + HapticsService ⭐
 *
 * For web, use ExploreCampsWebComponent instead.
 *
 * Sections:
 *  1. Agent X Circuit         — AI-curated hero carousel
 *  2. Verified Combines       — Metric-testing camps ticker
 *  3. College Hosted Circuit  — On-campus bento grid (filterable)
 *  4. Elite Showcases         — Invite-only/high-exposure list
 *  5. Your Itinerary          — Saved & registered camps calendar
 */

import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonItem,
  IonLabel,
  IonList,
  IonBadge,
  IonButton,
  IonChip,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  lockClosedOutline,
  starOutline,
  star,
  calendarOutline,
  locationOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import type {
  CampHeroItem,
  VerifiedCombine,
  CollegeCamp,
  EliteShowcase,
  ItineraryCamp,
} from '../web/explore-camps-web.component';

// Re-export type for convenience
export type { CampHeroItem, VerifiedCombine, CollegeCamp, EliteShowcase, ItineraryCamp };

type DivisionFilter = 'ALL' | 'D1' | 'D2' | 'D3' | 'NAIA';

// ─────────────────────────────────────────────────────────────
// MOCK DATA  (shared with web; replace with real service calls)
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
  { id: 'cc-1', collegeName: 'Alabama',            division: 'D1',   date: 'Jun 12, 2026', location: 'Tuscaloosa, AL', sport: 'Football' },
  { id: 'cc-2', collegeName: 'Ohio State',          division: 'D1',   date: 'Jun 19, 2026', location: 'Columbus, OH',   sport: 'Football' },
  { id: 'cc-3', collegeName: 'Northwestern',        division: 'D1',   date: 'Jun 26, 2026', location: 'Evanston, IL',   sport: 'Football' },
  { id: 'cc-4', collegeName: 'Lenoir-Rhyne',        division: 'D2',   date: 'Jul 3, 2026',  location: 'Hickory, NC',    sport: 'Football' },
  { id: 'cc-5', collegeName: 'Mary Hardin-Baylor',  division: 'D3',   date: 'Jul 10, 2026', location: 'Belton, TX',     sport: 'Football' },
  { id: 'cc-6', collegeName: 'Morningside Univ.',   division: 'NAIA', date: 'Jul 17, 2026', location: 'Sioux City, IA', sport: 'Football' },
];

const ELITE_SHOWCASES: EliteShowcase[] = [
  {
    id: 'es-1',
    name: 'Elite 11 QB Camp',
    date: 'Jun 5–7, 2026',
    location: 'Los Angeles, CA',
    exposureRating: 5,
    isInviteOnly: true,
    inviteInstructions: 'Earn an invite by ranking top 5 at a qualifying regional.',
    sport: 'Football',
  },
  {
    id: 'es-2',
    name: 'UA All-America Camp Series',
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
];

const ITINERARY_CAMPS: ItineraryCamp[] = [
  { id: 'it-1', name: 'Agent X Elite QB Circuit', date: 'Jun 14, 2026', location: 'Los Angeles, CA', status: 'registered', daysUntil: 14 },
  { id: 'it-2', name: 'UA All-America Camp',       date: 'Jun 28, 2026', location: 'Miami, FL',       status: 'upcoming',    daysUntil: 28 },
  { id: 'it-3', name: 'National Combine 2025',     date: 'Nov 12, 2025', location: 'Dallas, TX',      status: 'attended',    metricsUrl: '/metrics/ncbs-2025', scoutReportUrl: '/scout-reports/ncbs-2025' },
];

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

@Component({
  selector: 'nxt1-explore-camps-mobile',
  standalone: true,
  imports: [
    CommonModule,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonItem,
    IonLabel,
    IonList,
    IonBadge,
    IonButton,
    IonChip,
    IonIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="camps-dashboard" aria-label="Camps Elite Dashboard">

      <!-- ══════════════════════════════════════════════════════
           SECTION 1 — Agent X Circuit (Hero Carousel)
           No @defer — must render as LCP
           ══════════════════════════════════════════════════════ -->
      <section class="camps-section" aria-label="Agent X Circuit">
        <header class="section-header">
          <ion-label class="section-title">Agent X Circuit</ion-label>
          <ion-label class="section-subtitle">AI-curated picks for you</ion-label>
        </header>

        <div class="hero-carousel" role="list" (scroll)="onCarouselScroll()">
          @for (camp of heroCamps; track camp.id) {
            <ion-card
              class="hero-card"
              role="listitem"
              [attr.aria-label]="camp.name"
              button
            >
              <div
                class="hero-card__bg"
                [style.background-image]="'url(' + camp.imageUrl + ')'"
                aria-hidden="true"
              ></div>
              <ion-card-content class="hero-card__overlay">
                <ion-badge class="ai-badge" [attr.aria-label]="camp.aiReason">
                  {{ camp.aiReason }}
                </ion-badge>
                <ion-card-title class="hero-card__name">{{ camp.name }}</ion-card-title>
                <ion-card-subtitle class="hero-card__meta">
                  <ion-icon name="calendar-outline" aria-hidden="true"></ion-icon>
                  {{ camp.date }}
                  &nbsp;·&nbsp;
                  <ion-icon name="location-outline" aria-hidden="true"></ion-icon>
                  {{ camp.location }}
                </ion-card-subtitle>
              </ion-card-content>
            </ion-card>
          }
        </div>
      </section>

      <!-- ══════════════════════════════════════════════════════
           SECTION 2 — Verified Combines (deferred)
           ══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="camps-section" aria-label="Verified Combines">
          <header class="section-header">
            <ion-label class="section-title">Verified Combines</ion-label>
            <ion-label class="section-subtitle">Official laser-timed measurements</ion-label>
          </header>

          <div class="combines-ticker" role="list" (scroll)="onCarouselScroll()">
            @for (combine of verifiedCombines; track combine.id) {
              <ion-card class="combine-card" role="listitem" [attr.aria-label]="combine.name" button>
                <ion-card-header>
                  <ion-badge class="verified-badge" aria-label="Verified metrics event">
                    <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
                    Verified Metrics
                  </ion-badge>
                  <ion-card-title class="combine-card__name">{{ combine.name }}</ion-card-title>
                  <ion-card-subtitle class="combine-card__partner">{{ combine.partner }}</ion-card-subtitle>
                </ion-card-header>
                <ion-card-content class="combine-card__meta">
                  {{ combine.date }} · {{ combine.location }}
                </ion-card-content>
              </ion-card>
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
        <section class="camps-section" aria-label="College Hosted Circuit">
          <header class="section-header">
            <ion-label class="section-title">College Hosted Circuit</ion-label>
            <ion-label class="section-subtitle">On-campus programs direct from coaches</ion-label>
          </header>

          <!-- Division filter chips -->
          <div class="filter-chips" role="group" aria-label="Filter by division">
            @for (div of divisionFilters; track div) {
              <ion-chip
                [color]="activeDivision() === div ? 'primary' : 'medium'"
                [attr.aria-pressed]="activeDivision() === div"
                (click)="setDivisionFilter(div)"
                [outline]="activeDivision() !== div"
              >{{ div }}</ion-chip>
            }
          </div>

          <!-- Bento list -->
          <ion-list class="college-list" lines="none" aria-label="College camp cards">
            @for (camp of filteredCollegeCamps(); track camp.id) {
              <ion-item class="college-item" [attr.aria-label]="camp.collegeName + ' camp'" button>
                <div slot="start" class="college-logo" aria-hidden="true">
                  {{ camp.collegeName.charAt(0) }}
                </div>
                <ion-label>
                  <h3 class="college-item__name">{{ camp.collegeName }}</h3>
                  <p class="college-item__meta">{{ camp.date }} · {{ camp.location }}</p>
                </ion-label>
                <ion-badge slot="end" class="division-badge" [attr.aria-label]="camp.division">
                  {{ camp.division }}
                </ion-badge>
              </ion-item>
            }
          </ion-list>
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
           SECTION 4 — Elite Showcases (deferred)
           ══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="camps-section" aria-label="Elite Showcases">
          <header class="section-header">
            <ion-label class="section-title">Elite Showcases</ion-label>
            <ion-label class="section-subtitle">Invite-only &amp; high-exposure events</ion-label>
          </header>

          <ion-list class="showcase-list" lines="full" aria-label="Elite showcase events">
            @for (showcase of eliteShowcases; track showcase.id) {
              <ion-item class="showcase-item" [attr.aria-label]="showcase.name" button (click)="onShowcaseTap(showcase)">
                <div slot="start" class="showcase-thumb" aria-hidden="true">
                  {{ showcase.sport.charAt(0) }}
                </div>
                <ion-label>
                  <h3 class="showcase-item__name">{{ showcase.name }}</h3>
                  <p class="showcase-item__meta">{{ showcase.date }} · {{ showcase.location }}</p>
                  <div class="exposure-rating" [attr.aria-label]="showcase.exposureRating + ' out of 5 exposure'">
                    @for (star of getStars(showcase.exposureRating); track $index) {
                      <ion-icon name="star" class="star-icon" aria-hidden="true"></ion-icon>
                    }
                    <span class="exposure-label">Exposure</span>
                  </div>
                  @if (showcase.isInviteOnly && showcase.inviteInstructions) {
                    <p class="invite-instructions">{{ showcase.inviteInstructions }}</p>
                  }
                </ion-label>
                @if (showcase.isInviteOnly) {
                  <ion-icon slot="end" name="lock-closed-outline" class="lock-icon" aria-label="Invite only"></ion-icon>
                }
              </ion-item>
            }
          </ion-list>
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
        <section class="camps-section camps-section--last" aria-label="Your Itinerary">
          <header class="section-header">
            <ion-label class="section-title">Your Itinerary</ion-label>
            <ion-label class="section-subtitle">Saved, registered &amp; past camps</ion-label>
          </header>

          <ion-list class="itinerary-list" lines="none" aria-label="Your camp itinerary">
            @for (camp of itineraryCamps; track camp.id) {
              <ion-item class="itinerary-item" [attr.aria-label]="camp.name" button (click)="onItineraryTap(camp)">
                <ion-icon slot="start" name="calendar-outline" class="itinerary-icon" aria-hidden="true"></ion-icon>
                <ion-label>
                  <h3 class="itinerary-item__name">{{ camp.name }}</h3>
                  <p class="itinerary-item__meta">{{ camp.date }} · {{ camp.location }}</p>
                  @if (camp.status === 'attended') {
                    <div class="itinerary-links">
                      @if (camp.metricsUrl) {
                        <span class="action-link">View Metrics</span>
                      }
                      @if (camp.scoutReportUrl) {
                        <span class="action-link">Scout Report</span>
                      }
                    </div>
                  }
                </ion-label>
                @if (camp.status !== 'attended' && camp.daysUntil !== undefined) {
                  <ion-badge
                    slot="end"
                    class="countdown-badge"
                    [attr.aria-label]="'Starts in ' + camp.daysUntil + ' days'"
                  >
                    {{ camp.daysUntil }}d
                  </ion-badge>
                }
              </ion-item>
            }
          </ion-list>
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
         EXPLORE CAMPS DASHBOARD — Mobile (Ionic)
         All colors via NXT1 design tokens / --ion-* mapping.
         Tailwind used for layout utilities only.
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
        padding: var(--nxt1-spacing-5, 20px) 0 0;
      }
      .camps-section--last {
        padding-bottom: var(--nxt1-spacing-4, 16px);
      }
      .section-header {
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
      }
      .section-title {
        font-size: var(--nxt1-fontSize-base, 16px) !important;
        font-weight: var(--nxt1-fontWeight-bold, 700) !important;
        color: var(--nxt1-color-text-primary, #fff) !important;
        display: block;
      }
      .section-subtitle {
        font-size: var(--nxt1-fontSize-xs, 12px) !important;
        color: var(--nxt1-color-text-secondary, rgba(255,255,255,0.7)) !important;
        display: block;
        margin-top: 2px;
      }

      /* ══════════════════════════════
         SECTION 1 — HERO CAROUSEL
         ══════════════════════════════ */
      .hero-carousel {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .hero-carousel::-webkit-scrollbar { display: none; }

      .hero-card {
        flex-shrink: 0 !important;
        width: 280px !important;
        height: 180px !important;
        border-radius: var(--nxt1-radius-lg, 16px) !important;
        overflow: hidden !important;
        scroll-snap-align: start !important;
        position: relative !important;
        margin: 0 !important;
        --background: transparent;
      }
      .hero-card__bg {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
      }
      .hero-card__overlay {
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-end !important;
        padding: var(--nxt1-spacing-4, 16px) !important;
        background: color-mix(in srgb, var(--nxt1-color-surface-100, rgba(255,255,255,0.03)) 80%, transparent) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;
      }
      .ai-badge {
        --background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 15%, transparent) !important;
        --color: var(--nxt1-color-primary, #ccff00) !important;
        border: 1px solid var(--nxt1-color-primary, #ccff00) !important;
        border-radius: var(--nxt1-radius-full, 9999px) !important;
        font-size: var(--nxt1-fontSize-xs, 10px) !important;
        font-weight: var(--nxt1-fontWeight-bold, 700) !important;
        padding: 2px 8px !important;
        width: fit-content !important;
        margin-bottom: 4px !important;
      }
      .hero-card__name {
        font-size: var(--nxt1-fontSize-base, 16px) !important;
        font-weight: var(--nxt1-fontWeight-bold, 700) !important;
        color: var(--nxt1-color-text-inverse, #fff) !important;
        text-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;
        margin: 0 !important;
      }
      .hero-card__meta {
        font-size: var(--nxt1-fontSize-xs, 11px) !important;
        color: var(--nxt1-color-primary, #ccff00) !important;
        display: flex !important;
        align-items: center !important;
        gap: 3px !important;
        margin: 2px 0 0 !important;
      }

      /* ══════════════════════════════
         SECTION 2 — VERIFIED COMBINES
         ══════════════════════════════ */
      .combines-ticker {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .combines-ticker::-webkit-scrollbar { display: none; }

      .combine-card {
        flex-shrink: 0 !important;
        width: 220px !important;
        scroll-snap-align: start !important;
        margin: 0 !important;
        --background: var(--nxt1-color-surface-200, rgba(255,255,255,0.06));
        border-radius: var(--nxt1-radius-md, 12px) !important;
        border: 1px solid var(--nxt1-color-border, rgba(255,255,255,0.08)) !important;
      }
      .verified-badge {
        --background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 12%, transparent) !important;
        --color: var(--nxt1-color-primary, #ccff00) !important;
        border-radius: var(--nxt1-radius-full, 9999px) !important;
        font-size: var(--nxt1-fontSize-xs, 10px) !important;
        font-weight: var(--nxt1-fontWeight-bold, 700) !important;
        width: fit-content !important;
        display: flex !important;
        align-items: center !important;
        gap: 3px !important;
        padding: 2px 8px !important;
      }
      .combine-card__name {
        font-size: var(--nxt1-fontSize-sm, 13px) !important;
        font-weight: var(--nxt1-fontWeight-semibold, 600) !important;
        color: var(--nxt1-color-text-primary, #fff) !important;
      }
      .combine-card__partner {
        font-size: var(--nxt1-fontSize-xs, 11px) !important;
        color: var(--nxt1-color-text-secondary, rgba(255,255,255,0.7)) !important;
      }
      .combine-card__meta {
        font-size: var(--nxt1-fontSize-xs, 11px) !important;
        color: var(--nxt1-color-text-tertiary, rgba(255,255,255,0.45)) !important;
      }

      /* ══════════════════════════════
         SECTION 3 — COLLEGE HOSTED
         ══════════════════════════════ */
      .filter-chips {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .filter-chips::-webkit-scrollbar { display: none; }

      .college-list {
        --background: transparent;
        padding: 0 var(--nxt1-spacing-4, 16px);
      }
      .college-item {
        --background: var(--nxt1-color-surface-100, rgba(255,255,255,0.03));
        --border-radius: var(--nxt1-radius-md, 12px);
        border-radius: var(--nxt1-radius-md, 12px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        border: 1px solid var(--nxt1-color-border, rgba(255,255,255,0.06));
      }
      .college-logo {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-sm, 8px);
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-on-primary, #000);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        margin-right: var(--nxt1-spacing-3, 12px);
      }
      .college-item__name {
        font-size: var(--nxt1-fontSize-sm, 14px) !important;
        font-weight: var(--nxt1-fontWeight-bold, 700) !important;
        color: var(--nxt1-color-text-primary, #fff) !important;
      }
      .college-item__meta {
        font-size: var(--nxt1-fontSize-xs, 11px) !important;
        color: var(--nxt1-color-text-tertiary, rgba(255,255,255,0.45)) !important;
      }
      .division-badge {
        --background: var(--nxt1-color-surface-200, rgba(255,255,255,0.06)) !important;
        --color: var(--nxt1-color-text-secondary, rgba(255,255,255,0.7)) !important;
        font-size: 10px !important;
        font-weight: var(--nxt1-fontWeight-bold, 700) !important;
      }

      /* ══════════════════════════════
         SECTION 4 — ELITE SHOWCASES
         ══════════════════════════════ */
      .showcase-list {
        --background: transparent;
        padding: 0 var(--nxt1-spacing-4, 16px);
      }
      .showcase-item {
        --background: var(--nxt1-color-surface-100, rgba(255,255,255,0.03));
        --border-color: var(--nxt1-color-border, rgba(255,255,255,0.08));
        border-radius: 0;
        margin-bottom: 0;
      }
      .showcase-thumb {
        width: 48px;
        height: 48px;
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--nxt1-color-surface-200, rgba(255,255,255,0.06));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-secondary, rgba(255,255,255,0.7));
        margin-right: var(--nxt1-spacing-3, 12px);
      }
      .showcase-item__name {
        font-size: var(--nxt1-fontSize-sm, 14px) !important;
        font-weight: var(--nxt1-fontWeight-bold, 700) !important;
        color: var(--nxt1-color-text-primary, #fff) !important;
      }
      .showcase-item__meta {
        font-size: var(--nxt1-fontSize-xs, 12px) !important;
        color: var(--nxt1-color-text-secondary, rgba(255,255,255,0.7)) !important;
      }
      .exposure-rating {
        display: flex;
        align-items: center;
        gap: 2px;
        margin-top: 3px;
      }
      .star-icon {
        color: var(--nxt1-color-primary, #ccff00) !important;
        font-size: 13px;
      }
      .exposure-label {
        font-size: var(--nxt1-fontSize-xs, 11px);
        color: var(--nxt1-color-text-tertiary, rgba(255,255,255,0.45));
        margin-left: 3px;
      }
      .invite-instructions {
        font-size: var(--nxt1-fontSize-xs, 11px) !important;
        color: var(--nxt1-color-text-tertiary, rgba(255,255,255,0.45)) !important;
        margin: 3px 0 0 !important;
        line-height: 1.4 !important;
      }
      .lock-icon {
        color: var(--nxt1-color-text-tertiary, rgba(255,255,255,0.45)) !important;
        font-size: 18px !important;
      }

      /* ══════════════════════════════
         SECTION 5 — ITINERARY
         ══════════════════════════════ */
      .itinerary-list {
        --background: transparent;
        padding: 0 var(--nxt1-spacing-4, 16px);
      }
      .itinerary-item {
        --background: var(--nxt1-color-surface-200, rgba(255,255,255,0.06));
        --border-radius: var(--nxt1-radius-md, 12px);
        border-radius: var(--nxt1-radius-md, 12px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        border: 1px solid var(--nxt1-color-border, rgba(255,255,255,0.06));
      }
      .itinerary-icon {
        color: var(--nxt1-color-primary, #ccff00) !important;
        font-size: 20px !important;
        margin-right: var(--nxt1-spacing-3, 12px) !important;
      }
      .itinerary-item__name {
        font-size: var(--nxt1-fontSize-sm, 14px) !important;
        font-weight: var(--nxt1-fontWeight-semibold, 600) !important;
        color: var(--nxt1-color-text-primary, #fff) !important;
      }
      .itinerary-item__meta {
        font-size: var(--nxt1-fontSize-xs, 12px) !important;
        color: var(--nxt1-color-text-secondary, rgba(255,255,255,0.7)) !important;
      }
      .itinerary-links {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        margin-top: 3px;
        flex-wrap: wrap;
      }
      .action-link {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-primary, #ccff00);
        text-decoration: none;
        cursor: pointer;
      }
      .countdown-badge {
        --background: color-mix(in srgb, var(--nxt1-color-surface-300, rgba(255,255,255,0.09)) 90%, transparent) !important;
        --color: var(--nxt1-color-text-primary, #fff) !important;
        font-size: var(--nxt1-fontSize-xs, 11px) !important;
        font-weight: var(--nxt1-fontWeight-semibold, 600) !important;
        border-radius: var(--nxt1-radius-sm, 6px) !important;
      }

      /* ══════════════════════════════
         SKELETON LOADERS
         ══════════════════════════════ */
      .skeleton-section {
        padding: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px) 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }
      .skeleton-header {
        height: 40px;
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
        height: 110px;
        border-radius: var(--nxt1-radius-md, 12px);
      }
      .skeleton-list-item {
        height: 68px;
        border-radius: var(--nxt1-radius-md, 12px);
      }
      .skeleton-bento {
        height: 220px;
        border-radius: var(--nxt1-radius-lg, 16px);
      }
    `,
  ],
})
export class ExploreCampsMobileComponent {
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('ExploreCampsMobile');

  // Register Ionicons used in this component
  constructor() {
    addIcons({
      checkmarkCircleOutline,
      lockClosedOutline,
      starOutline,
      star,
      calendarOutline,
      locationOutline,
      sparklesOutline,
    });
  }

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
    void this.haptics.impact('light');
    this._activeDivision.set(division);
    this.logger.debug('Division filter changed', { division });
  }

  onCarouselScroll(): void {
    void this.haptics.impact('light');
  }

  onShowcaseTap(showcase: EliteShowcase): void {
    void this.haptics.impact('light');
    this.logger.debug('Showcase tapped', { id: showcase.id });
  }

  onItineraryTap(camp: ItineraryCamp): void {
    void this.haptics.impact('light');
    this.logger.debug('Itinerary camp tapped', { id: camp.id });
  }

  /** Returns an array of `length` for @for star rendering. */
  getStars(rating: number): null[] {
    return Array(Math.max(0, Math.min(5, rating))).fill(null);
  }
}
