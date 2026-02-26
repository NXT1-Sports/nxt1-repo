/**
 * @fileoverview Explore "Colleges" Elite Dashboard — Mobile (Ionic)
 * @module @nxt1/ui/explore/mobile
 * @version 1.0.0
 *
 * 8-section recruiting war room for the Colleges tab.
 * Uses Ionic components for native feel; --nxt1-* tokens
 * flow automatically via the --ion-* mapping.
 *
 * ⭐ MOBILE ONLY — Uses Ionic components and HapticsService ⭐
 *
 * Sections:
 *   1. AI Matchmaker (Hero Carousel) — always rendered for LCP
 *   2. Power Index (Trending Programs) — @defer
 *   3. Recruiting Ticker (All Activity) — @defer
 *   4. Regional Radar (Map / Geo-Focus) — @defer
 *   5. Program DNA & Roster Matrix — @defer
 *   6. Program Spotlights (News Style Cards) — @defer
 *   7. Watchlist (Your Tracked Programs) — @defer
 *   8. Database Ledger (System Updates) — @defer
 */

import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonItem,
  IonLabel,
  IonList,
  IonBadge,
} from '@ionic/angular/standalone';
import { HapticsService } from '../../services/haptics/haptics.service';

// ── Domain types ──────────────────────────────────────────────────────────────

interface AiMatch {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly matchPct: number;
  readonly aiReason: string;
  readonly logoUrl?: string;
  readonly division: string;
}

interface TrendingProgram {
  readonly id: string;
  readonly name: string;
  readonly logoUrl?: string;
  readonly trendMetric: string;
  readonly trendDelta: string;
  readonly positive: boolean;
}

interface RecruitingActivity {
  readonly id: string;
  readonly type: 'offer' | 'commit' | 'visit' | 'camp';
  readonly athleteName: string;
  readonly athleteAvatar?: string;
  readonly collegeName: string;
  readonly collegeLogoUrl?: string;
  readonly timeAgo: string;
  readonly sport: string;
}

interface RegionalProgram {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly logoUrl?: string;
  readonly rank: number;
}

interface ProgramDna {
  readonly id: string;
  readonly name: string;
  readonly playstyle: string;
  readonly academicTier: string;
  readonly rosterNeeds: readonly string[];
  readonly division: string;
  readonly logoUrl?: string;
}

interface ProgramSpotlight {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly thumbnailUrl?: string;
  readonly publishedAt: string;
  readonly category: string;
  readonly collegeName: string;
}

interface WatchlistItem {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly statusType: 'info' | 'success' | 'warning';
  readonly logoUrl?: string;
  readonly location: string;
}

interface LedgerEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly action: string;
  readonly description: string;
  readonly sport: string;
}

// ── Static mock data ──────────────────────────────────────────────────────────

const MOCK_AI_MATCHES: readonly AiMatch[] = [
  {
    id: '1',
    name: 'Duke University',
    location: 'Durham, NC',
    matchPct: 96,
    aiReason: 'Matches your GPA & Position',
    division: 'D1 · ACC',
  },
  {
    id: '2',
    name: 'University of Kentucky',
    location: 'Lexington, KY',
    matchPct: 92,
    aiReason: 'Strong fit for your playing style',
    division: 'D1 · SEC',
  },
  {
    id: '3',
    name: 'Gonzaga University',
    location: 'Spokane, WA',
    matchPct: 89,
    aiReason: 'Roster vacancy at your position',
    division: 'D1 · WCC',
  },
  {
    id: '4',
    name: 'Villanova University',
    location: 'Villanova, PA',
    matchPct: 87,
    aiReason: 'Academic profile alignment',
    division: 'D1 · Big East',
  },
  {
    id: '5',
    name: 'Kansas Jayhawks',
    location: 'Lawrence, KS',
    matchPct: 84,
    aiReason: 'Coaching staff viewed your profile',
    division: 'D1 · Big 12',
  },
];

const MOCK_TRENDING: readonly TrendingProgram[] = [
  { id: '1', name: 'Alabama', trendMetric: 'Profile Views', trendDelta: '+45%', positive: true },
  { id: '2', name: 'UConn', trendMetric: 'Watchlist Adds', trendDelta: '+38%', positive: true },
  { id: '3', name: 'Baylor', trendMetric: 'Offer Activity', trendDelta: '+29%', positive: true },
  { id: '4', name: 'Louisville', trendMetric: 'Camp Signups', trendDelta: '+22%', positive: true },
  { id: '5', name: 'Oregon', trendMetric: 'Visits Booked', trendDelta: '+18%', positive: true },
];

const MOCK_ACTIVITY: readonly RecruitingActivity[] = [
  {
    id: '1',
    type: 'offer',
    athleteName: 'Jordan Smith',
    collegeName: 'Duke',
    timeAgo: '2m ago',
    sport: 'Basketball',
  },
  {
    id: '2',
    type: 'commit',
    athleteName: 'Marcus Davis',
    collegeName: 'Alabama',
    timeAgo: '15m ago',
    sport: 'Football',
  },
  {
    id: '3',
    type: 'visit',
    athleteName: 'Taylor Johnson',
    collegeName: 'Kentucky',
    timeAgo: '1h ago',
    sport: 'Basketball',
  },
  {
    id: '4',
    type: 'camp',
    athleteName: 'Ryan Williams',
    collegeName: 'Kansas',
    timeAgo: '2h ago',
    sport: 'Football',
  },
  {
    id: '5',
    type: 'offer',
    athleteName: 'Chris Brown',
    collegeName: 'Gonzaga',
    timeAgo: '3h ago',
    sport: 'Basketball',
  },
  {
    id: '6',
    type: 'commit',
    athleteName: 'Alex Turner',
    collegeName: 'Villanova',
    timeAgo: '5h ago',
    sport: 'Basketball',
  },
];

const MOCK_REGIONAL: readonly RegionalProgram[] = [
  { id: '1', name: 'Texas Longhorns', state: 'TX', rank: 1 },
  { id: '2', name: 'Texas A&M', state: 'TX', rank: 2 },
  { id: '3', name: 'Baylor Bears', state: 'TX', rank: 3 },
  { id: '4', name: 'TCU Horned Frogs', state: 'TX', rank: 4 },
];

const MOCK_PROGRAM_DNA: readonly ProgramDna[] = [
  {
    id: '1',
    name: 'Duke',
    playstyle: 'Ball Movement Heavy',
    academicTier: 'Elite',
    rosterNeeds: ['PG (Graduating 2)', 'SF (Graduating 1)'],
    division: 'D1 · ACC',
  },
  {
    id: '2',
    name: 'Kansas',
    playstyle: 'Fast Break Heavy',
    academicTier: 'Strong',
    rosterNeeds: ['C (Graduating 3)', 'SG'],
    division: 'D1 · Big 12',
  },
  {
    id: '3',
    name: 'Gonzaga',
    playstyle: 'Post-Entry Focus',
    academicTier: 'Excellent',
    rosterNeeds: ['PF (Graduating 2)'],
    division: 'D1 · WCC',
  },
];

const MOCK_SPOTLIGHTS: readonly ProgramSpotlight[] = [
  {
    id: '1',
    title: 'Duke Unveils $50M Practice Facility Renovation',
    subtitle: 'State-of-the-art player development center set to open Fall 2026',
    publishedAt: '2h ago',
    category: 'Facility',
    collegeName: 'Duke University',
  },
  {
    id: '2',
    title: 'Kentucky Basketball Adds 4-Star Transfer at Guard',
    subtitle: 'Former All-Conference player joins Wildcats for 2026 season',
    publishedAt: '4h ago',
    category: 'Roster Move',
    collegeName: 'University of Kentucky',
  },
  {
    id: '3',
    title: 'Kansas Ranked No. 1 in Early Preseason Polls',
    subtitle: 'Jayhawks return four starters and add top-10 recruiting class',
    publishedAt: '1d ago',
    category: 'Rankings',
    collegeName: 'Kansas Jayhawks',
  },
];

const MOCK_WATCHLIST: readonly WatchlistItem[] = [
  {
    id: '1',
    name: 'Duke University',
    status: 'New coach hired',
    statusType: 'info',
    location: 'Durham, NC',
  },
  {
    id: '2',
    name: 'Kentucky',
    status: 'Camp registration open',
    statusType: 'success',
    location: 'Lexington, KY',
  },
  {
    id: '3',
    name: 'Gonzaga',
    status: 'Roster update available',
    statusType: 'warning',
    location: 'Spokane, WA',
  },
  {
    id: '4',
    name: 'Kansas',
    status: 'Official visit slots released',
    statusType: 'success',
    location: 'Lawrence, KS',
  },
];

const MOCK_LEDGER: readonly LedgerEntry[] = [
  {
    id: '1',
    timestamp: '10:42 AM',
    action: 'Updated',
    description: '2026 Roster Data for Texas Longhorns',
    sport: 'Football',
  },
  {
    id: '2',
    timestamp: '9:15 AM',
    action: 'Synced',
    description: 'New coaching staff for Duke University',
    sport: 'Basketball',
  },
  {
    id: '3',
    timestamp: 'Yesterday',
    action: 'Updated',
    description: 'Academic profiles for 142 D1 programs',
    sport: 'All Sports',
  },
  {
    id: '4',
    timestamp: 'Yesterday',
    action: 'Added',
    description: '2026 Camp schedules for SEC schools',
    sport: 'Football',
  },
  {
    id: '5',
    timestamp: '2 days ago',
    action: 'Synced',
    description: 'Conference realignment data for Big 12',
    sport: 'All Sports',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nxt1-explore-colleges-mobile',
  standalone: true,
  imports: [
    CommonModule,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonItem,
    IonLabel,
    IonList,
    IonBadge,
  ],
  template: `
    <div class="colleges-dashboard">
      <!-- ═══════════════════════════════════════════════
           SECTION 1: AI MATCHMAKER (HERO CAROUSEL)
           Always rendered — no defer — critical for LCP
           ═══════════════════════════════════════════════ -->
      <section class="dashboard-section" aria-labelledby="ai-match-heading-m">
        <div class="section-header">
          <h2 id="ai-match-heading-m" class="section-title">
            <span aria-hidden="true">✨</span> AI Matchmaker
          </h2>
        </div>

        <div
          class="hero-carousel"
          role="list"
          aria-label="AI matched colleges"
          (scroll)="onCarouselScroll()"
        >
          @for (match of aiMatches(); track match.id) {
            <ion-card class="hero-card" role="listitem" button>
              <div class="hero-card__bg" aria-hidden="true">
                <div class="hero-card__bg-placeholder"></div>
              </div>
              <ion-card-content class="hero-card__overlay">
                <div class="hero-card__logo-wrap" aria-hidden="true">
                  @if (match.logoUrl) {
                    <img
                      [src]="match.logoUrl"
                      [alt]="match.name + ' logo'"
                      width="44"
                      height="44"
                    />
                  } @else {
                    <div class="hero-card__logo-placeholder">{{ match.name.charAt(0) }}</div>
                  }
                </div>

                <div class="hero-card__info">
                  <p class="hero-card__division">{{ match.division }}</p>
                  <ion-card-title class="hero-card__name">{{ match.name }}</ion-card-title>
                  <p class="hero-card__location">{{ match.location }}</p>
                </div>

                <div class="hero-card__meta">
                  <span class="hero-card__match-pct">{{ match.matchPct }}% Fit</span>
                  <span class="hero-card__ai-badge">✨ {{ match.aiReason }}</span>
                </div>
              </ion-card-content>
            </ion-card>
          }
        </div>
      </section>

      <!-- ═══════════════════════════════════════════════
           SECTION 2: POWER INDEX (TRENDING PROGRAMS)
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="power-index-heading-m">
          <div class="section-header">
            <h2 id="power-index-heading-m" class="section-title">
              <span aria-hidden="true">🔥</span> Power Index
            </h2>
          </div>

          <div
            class="trend-carousel"
            role="list"
            aria-label="Trending programs"
            (scroll)="onCarouselScroll()"
          >
            @for (program of trendingPrograms(); track program.id) {
              <ion-card class="trend-card" role="listitem" button>
                <ion-card-content class="trend-card__content">
                  <div class="trend-card__logo" aria-hidden="true">
                    @if (program.logoUrl) {
                      <img
                        [src]="program.logoUrl"
                        [alt]="program.name + ' logo'"
                        width="36"
                        height="36"
                      />
                    } @else {
                      <div class="trend-card__logo-placeholder">{{ program.name.charAt(0) }}</div>
                    }
                  </div>
                  <p class="trend-card__name">{{ program.name }}</p>
                  <p class="trend-card__metric">{{ program.trendMetric }}</p>
                  <span
                    class="trend-card__delta"
                    [class.trend-card__delta--positive]="program.positive"
                    >{{ program.trendDelta }}</span
                  >
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 3: RECRUITING TICKER (ALL ACTIVITY)
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="recruiting-ticker-heading-m">
          <div class="section-header">
            <h2 id="recruiting-ticker-heading-m" class="section-title">
              <span aria-hidden="true">📡</span> Recruiting Ticker
            </h2>
          </div>

          <ion-list class="activity-list" lines="full" aria-label="Live recruiting activity">
            @for (activity of recruitingActivity(); track activity.id) {
              <ion-item class="activity-item" button detail="false">
                <!-- Overlapping avatars -->
                <div class="activity-item__avatars" slot="start" aria-hidden="true">
                  <div class="activity-item__avatar activity-item__avatar--athlete">
                    @if (activity.athleteAvatar) {
                      <img [src]="activity.athleteAvatar" alt="" />
                    } @else {
                      <span>{{ activity.athleteName.charAt(0) }}</span>
                    }
                  </div>
                  <div class="activity-item__avatar activity-item__avatar--college">
                    @if (activity.collegeLogoUrl) {
                      <img [src]="activity.collegeLogoUrl" alt="" />
                    } @else {
                      <span>{{ activity.collegeName.charAt(0) }}</span>
                    }
                  </div>
                </div>

                <!-- Activity type icon -->
                <span
                  class="activity-item__type-icon"
                  slot="start"
                  [attr.aria-label]="activityTypeLabel(activity.type)"
                  role="img"
                  >{{ activityTypeEmoji(activity.type) }}</span
                >

                <ion-label class="activity-item__label">
                  <p class="activity-item__headline">
                    <strong>{{ activity.athleteName }}</strong>
                    {{ activityTypeVerb(activity.type) }}
                    <strong>{{ activity.collegeName }}</strong>
                  </p>
                  <p class="activity-item__meta">{{ activity.sport }} · {{ activity.timeAgo }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 4: REGIONAL RADAR (MAP / GEO-FOCUS)
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="regional-radar-heading-m">
          <div class="section-header">
            <h2 id="regional-radar-heading-m" class="section-title">
              <span aria-hidden="true">🗺️</span> Regional Radar
            </h2>
          </div>

          <ion-card class="map-bento" aria-label="Regional powerhouse programs">
            <div class="map-bento__bg" aria-hidden="true">
              <svg viewBox="0 0 400 200" class="map-bento__svg">
                <path
                  d="M 40 170 L 60 55 L 200 38 L 320 75 L 360 155 L 280 190 L 180 200 L 80 190 Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1"
                  opacity="0.15"
                />
                <line
                  x1="100"
                  y1="38"
                  x2="120"
                  y2="200"
                  stroke="currentColor"
                  stroke-width="0.5"
                  opacity="0.1"
                />
                <line
                  x1="200"
                  y1="38"
                  x2="220"
                  y2="200"
                  stroke="currentColor"
                  stroke-width="0.5"
                  opacity="0.1"
                />
                <line
                  x1="300"
                  y1="38"
                  x2="280"
                  y2="200"
                  stroke="currentColor"
                  stroke-width="0.5"
                  opacity="0.1"
                />
                <line
                  x1="40"
                  y1="115"
                  x2="360"
                  y2="125"
                  stroke="currentColor"
                  stroke-width="0.5"
                  opacity="0.1"
                />
              </svg>
            </div>

            <ion-card-content>
              <ion-card-header>
                <ion-card-title class="map-bento__title">Your Region: Southwest</ion-card-title>
                <p class="map-bento__stat">4 Programs · 12 Open Spots</p>
              </ion-card-header>

              <ion-list class="map-bento__list" lines="none">
                @for (program of regionalPrograms(); track program.id) {
                  <ion-item class="map-bento__item">
                    <span class="map-bento__rank" slot="start">#{{ program.rank }}</span>
                    <ion-label>
                      <p class="map-bento__name">{{ program.name }}</p>
                    </ion-label>
                    <ion-badge class="map-bento__state-badge" slot="end">{{
                      program.state
                    }}</ion-badge>
                  </ion-item>
                }
              </ion-list>
            </ion-card-content>
          </ion-card>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          <div class="skeleton-map bg-surface-300 animate-pulse"></div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          <div class="skeleton-map bg-surface-300 animate-pulse"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 5: PROGRAM DNA & ROSTER MATRIX
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="program-dna-heading-m">
          <div class="section-header">
            <h2 id="program-dna-heading-m" class="section-title">
              <span aria-hidden="true">🧬</span> Program DNA
            </h2>
          </div>

          <div
            class="dna-carousel"
            role="list"
            aria-label="Program comparison matrix"
            (scroll)="onCarouselScroll()"
          >
            @for (program of programDna(); track program.id) {
              <ion-card class="dna-card" role="listitem" button>
                <ion-card-header class="dna-card__header">
                  <div class="dna-card__logo-wrap" aria-hidden="true">
                    @if (program.logoUrl) {
                      <img
                        [src]="program.logoUrl"
                        [alt]="program.name + ' logo'"
                        width="32"
                        height="32"
                      />
                    } @else {
                      <div class="dna-card__logo-placeholder">{{ program.name.charAt(0) }}</div>
                    }
                  </div>
                  <div>
                    <ion-card-title class="dna-card__name">{{ program.name }}</ion-card-title>
                    <p class="dna-card__division">{{ program.division }}</p>
                  </div>
                </ion-card-header>

                <ion-card-content>
                  <div class="dna-card__row">
                    <p class="dna-card__label">Playstyle</p>
                    <span class="chip chip--playstyle">{{ program.playstyle }}</span>
                  </div>
                  <div class="dna-card__row">
                    <p class="dna-card__label">Academic Tier</p>
                    <span class="chip chip--academic">{{ program.academicTier }}</span>
                  </div>
                  <div class="dna-card__row">
                    <p class="dna-card__label">Roster Needs</p>
                    <div class="chip-group">
                      @for (need of program.rosterNeeds; track need) {
                        <span class="chip chip--need">{{ need }}</span>
                      }
                    </div>
                  </div>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-dna-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-dna-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 6: PROGRAM SPOTLIGHTS (NEWS STYLE)
           Follows NewsContentComponent card architecture
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="spotlights-heading-m">
          <div class="section-header">
            <h2 id="spotlights-heading-m" class="section-title">
              <span aria-hidden="true">📰</span> Program Spotlights
            </h2>
          </div>

          <ion-list class="spotlight-list" lines="full" aria-label="Program spotlight articles">
            @for (spotlight of programSpotlights(); track spotlight.id) {
              <ion-item class="spotlight-item" button detail="false">
                <!-- 16:9 thumbnail (left) -->
                <div class="spotlight-item__thumb" slot="start">
                  @if (spotlight.thumbnailUrl) {
                    <img
                      [src]="spotlight.thumbnailUrl"
                      [alt]="spotlight.title"
                      loading="lazy"
                      class="spotlight-item__img"
                    />
                  } @else {
                    <div class="spotlight-item__thumb-placeholder" aria-hidden="true">📷</div>
                  }
                  <span class="spotlight-item__category">{{ spotlight.category }}</span>
                </div>

                <ion-label class="spotlight-item__label">
                  <p class="spotlight-item__college">{{ spotlight.collegeName }}</p>
                  <h3 class="spotlight-item__title">{{ spotlight.title }}</h3>
                  <p class="spotlight-item__subtitle">{{ spotlight.subtitle }}</p>
                  <time class="spotlight-item__time">{{ spotlight.publishedAt }}</time>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 7: WATCHLIST (YOUR TRACKED PROGRAMS)
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="watchlist-heading-m">
          <div class="section-header">
            <h2 id="watchlist-heading-m" class="section-title">
              <span aria-hidden="true">👁️</span> Your Watchlist
            </h2>
          </div>

          <ion-list class="watchlist-list" lines="full" aria-label="Tracked programs">
            @for (item of watchlist(); track item.id) {
              <ion-item class="watchlist-item" button detail="false">
                <!-- Active-tracking indicator stripe -->
                <div
                  class="watchlist-item__stripe"
                  [class.watchlist-item__stripe--info]="item.statusType === 'info'"
                  [class.watchlist-item__stripe--success]="item.statusType === 'success'"
                  [class.watchlist-item__stripe--warning]="item.statusType === 'warning'"
                  slot="start"
                  aria-hidden="true"
                ></div>

                <div class="watchlist-item__logo" slot="start" aria-hidden="true">
                  @if (item.logoUrl) {
                    <img [src]="item.logoUrl" [alt]="item.name + ' logo'" width="36" height="36" />
                  } @else {
                    <div class="watchlist-item__logo-placeholder">{{ item.name.charAt(0) }}</div>
                  }
                </div>

                <ion-label class="watchlist-item__label">
                  <h3 class="watchlist-item__name">{{ item.name }}</h3>
                  <p class="watchlist-item__location">{{ item.location }}</p>
                </ion-label>

                <div
                  class="watchlist-item__status"
                  [class.watchlist-item__status--success]="item.statusType === 'success'"
                  [class.watchlist-item__status--warning]="item.statusType === 'warning'"
                  slot="end"
                  [attr.aria-label]="'Status: ' + item.status"
                >
                  {{ item.status }}
                </div>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 8: DATABASE LEDGER (SYSTEM UPDATES)
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="ledger-heading-m">
          <div class="section-header">
            <h2 id="ledger-heading-m" class="section-title">
              <span aria-hidden="true">🗄️</span> Data Ledger
            </h2>
          </div>

          <ion-card class="ledger-card" role="log" aria-label="Data update log" aria-live="polite">
            <ion-list class="ledger-list" lines="full">
              @for (entry of ledgerEntries(); track entry.id) {
                <ion-item class="ledger-item" lines="full">
                  <ion-label class="ledger-item__label">
                    <div class="ledger-item__row">
                      <time class="ledger-item__time">[{{ entry.timestamp }}]</time>
                      <span class="ledger-item__action">{{ entry.action }}</span>
                      <span class="ledger-item__desc">{{ entry.description }}</span>
                      <span class="ledger-item__sport">({{ entry.sport }})</span>
                    </div>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          </ion-card>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-ledger-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-ledger-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ================================================================
         EXPLORE COLLEGES (MOBILE) — Ionic + Design Token CSS
         Ionic components inherit --nxt1-* via --ion-* mapping.
         Zero hardcoded colors; all values via CSS custom properties.
         ================================================================ */

      :host {
        display: block;

        --col-bg: var(--nxt1-color-bg-primary);
        --col-surface-1: var(--nxt1-color-surface-100);
        --col-surface-2: var(--nxt1-color-surface-200);
        --col-surface-3: var(--nxt1-color-surface-300);
        --col-text-primary: var(--nxt1-color-text-primary);
        --col-text-secondary: var(--nxt1-color-text-secondary);
        --col-text-tertiary: var(--nxt1-color-text-tertiary);
        --col-text-inverse: var(--nxt1-color-text-inverse);
        --col-primary: var(--nxt1-color-primary);
        --col-on-primary: var(--nxt1-color-on-primary);
        --col-success: var(--nxt1-color-success);
        --col-warning: var(--nxt1-color-warning);
        --col-border: var(--nxt1-color-border);
        --col-border-subtle: var(--nxt1-color-border-subtle);
        --col-radius-sm: var(--nxt1-radius-sm, 8px);
        --col-radius-md: var(--nxt1-radius-md, 12px);
        --col-radius-lg: var(--nxt1-radius-lg, 16px);
        --col-radius-full: var(--nxt1-radius-full, 9999px);
      }

      /* ── DASHBOARD WRAPPER ── */

      .colleges-dashboard {
        padding-bottom: var(--nxt1-spacing-16, 64px);
      }

      /* ── SECTION ── */

      .dashboard-section {
        padding: var(--nxt1-spacing-6, 24px) 0 0;
      }

      .section-header {
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
      }

      .section-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        font-size: var(--nxt1-fontSize-lg, 17px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--col-text-primary);
        margin: 0;
      }

      /* ── HERO CAROUSEL (Section 1) ── */

      .hero-carousel {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .hero-carousel::-webkit-scrollbar {
        display: none;
      }

      .hero-card {
        flex-shrink: 0;
        position: relative;
        width: 280px;
        height: 360px;
        scroll-snap-align: start;
        margin: 0;
        --background: var(--col-surface-3);
        border-radius: var(--col-radius-lg);
        overflow: hidden;
      }

      .hero-card__bg {
        position: absolute;
        inset: 0;
      }

      .hero-card__bg-placeholder {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, var(--col-surface-3), var(--col-surface-2));
      }

      .hero-card__overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: var(--nxt1-spacing-4, 16px);
        background: linear-gradient(
          to top,
          color-mix(in srgb, var(--col-surface-1) 90%, transparent) 0%,
          color-mix(in srgb, var(--col-surface-1) 50%, transparent) 60%,
          transparent 100%
        );
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      .hero-card__logo-wrap {
        width: 44px;
        height: 44px;
        border-radius: var(--col-radius-sm);
        overflow: hidden;
        margin-bottom: var(--nxt1-spacing-3, 12px);
        background: var(--col-surface-2);
      }

      .hero-card__logo-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: 700;
        color: var(--col-text-inverse);
        background: var(--col-surface-2);
      }

      .hero-card__info {
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .hero-card__division {
        font-size: 11px;
        font-weight: 600;
        color: var(--col-text-inverse);
        opacity: 0.75;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0 0 2px;
      }

      .hero-card__name {
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: 700;
        color: var(--col-text-inverse);
        margin: 0 0 2px;
        line-height: 1.2;
      }

      .hero-card__location {
        font-size: 12px;
        color: var(--col-text-inverse);
        opacity: 0.75;
        margin: 0;
      }

      .hero-card__meta {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .hero-card__match-pct {
        font-size: 24px;
        font-weight: 700;
        color: var(--col-primary);
        line-height: 1;
      }

      .hero-card__ai-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: var(--col-radius-full);
        background: color-mix(in srgb, var(--col-surface-1) 80%, transparent);
        border: 1px solid var(--col-border);
        font-size: 11px;
        font-weight: 600;
        color: var(--col-text-inverse);
        white-space: nowrap;
        align-self: flex-start;
      }

      /* ── TREND CAROUSEL (Section 2) ── */

      .trend-carousel {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .trend-carousel::-webkit-scrollbar {
        display: none;
      }

      .trend-card {
        flex-shrink: 0;
        width: 120px;
        scroll-snap-align: start;
        margin: 0;
        --background: var(--col-surface-2);
      }

      .trend-card__content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
        text-align: center;
      }

      .trend-card__logo {
        width: 36px;
        height: 36px;
        border-radius: var(--col-radius-sm);
        overflow: hidden;
        background: var(--col-surface-1);
      }

      .trend-card__logo-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: 700;
        color: var(--col-text-secondary);
      }

      .trend-card__name {
        font-size: 13px;
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0;
      }

      .trend-card__metric {
        font-size: 11px;
        color: var(--col-text-tertiary);
        margin: 0;
      }

      .trend-card__delta {
        font-size: 13px;
        font-weight: 700;
        color: var(--col-text-tertiary);
      }

      .trend-card__delta--positive {
        color: var(--col-success);
      }

      /* ── ACTIVITY LIST (Section 3) ── */

      .activity-list {
        --background: transparent;
        --ion-item-background: var(--col-surface-1);
        --ion-item-border-color: var(--col-border);
        margin: 0 var(--nxt1-spacing-4, 16px);
        border-radius: var(--col-radius-md);
        overflow: hidden;
      }

      .activity-item {
        --background: var(--col-surface-1);
        --border-color: var(--col-border);
        --padding-start: var(--nxt1-spacing-3, 12px);
        --inner-padding-end: var(--nxt1-spacing-3, 12px);
      }

      .activity-item__avatars {
        position: relative;
        width: 48px;
        height: 32px;
        flex-shrink: 0;
        margin-right: var(--nxt1-spacing-2, 8px);
      }

      .activity-item__avatar {
        position: absolute;
        width: 28px;
        height: 28px;
        border-radius: var(--col-radius-full);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: var(--col-text-primary);
        background: var(--col-surface-3);
        border: 2px solid var(--col-bg);
      }

      .activity-item__avatar--athlete {
        top: 0;
        left: 0;
        z-index: 2;
      }

      .activity-item__avatar--college {
        top: 4px;
        left: 16px;
        z-index: 1;
      }

      .activity-item__avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .activity-item__type-icon {
        font-size: 18px;
        flex-shrink: 0;
        margin-right: var(--nxt1-spacing-2, 8px);
      }

      .activity-item__label {
        white-space: normal;
      }

      .activity-item__headline {
        font-size: 14px;
        color: var(--col-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .activity-item__meta {
        font-size: 12px;
        color: var(--col-text-tertiary);
        margin: 0;
      }

      /* ── MAP BENTO (Section 4) ── */

      .map-bento {
        position: relative;
        margin: 0 var(--nxt1-spacing-4, 16px);
        --background: var(--col-surface-3);
        overflow: hidden;
        min-height: 200px;
      }

      .map-bento__bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .map-bento__svg {
        width: 100%;
        height: 100%;
        color: var(--col-text-secondary);
      }

      .map-bento__title {
        font-size: 17px;
        color: var(--col-text-primary);
      }

      .map-bento__stat {
        font-size: 13px;
        color: var(--col-text-secondary);
        margin: 0;
      }

      .map-bento__list {
        --background: transparent;
        --ion-item-background: transparent;
        margin-top: var(--nxt1-spacing-2, 8px);
      }

      .map-bento__item {
        --background: transparent;
        --border-color: var(--col-border-subtle);
        --padding-start: 0;
      }

      .map-bento__rank {
        font-size: 13px;
        font-weight: 700;
        color: var(--col-primary);
        min-width: 24px;
        margin-right: var(--nxt1-spacing-3, 12px);
      }

      .map-bento__name {
        font-size: 14px;
        font-weight: 600;
        color: var(--col-text-primary);
        margin: 0;
      }

      .map-bento__state-badge {
        --background: var(--col-surface-2);
        --color: var(--col-text-secondary);
        font-size: 11px;
      }

      /* ── DNA CAROUSEL (Section 5) ── */

      .dna-carousel {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .dna-carousel::-webkit-scrollbar {
        display: none;
      }

      .dna-card {
        flex-shrink: 0;
        width: 280px;
        scroll-snap-align: start;
        margin: 0;
        --background: var(--col-surface-2);
      }

      .dna-card__header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding-bottom: 0;
      }

      .dna-card__logo-wrap {
        width: 32px;
        height: 32px;
        border-radius: var(--col-radius-sm);
        overflow: hidden;
        background: var(--col-surface-1);
        flex-shrink: 0;
      }

      .dna-card__logo-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 700;
        color: var(--col-text-secondary);
      }

      .dna-card__name {
        font-size: 14px;
        font-weight: 700;
        color: var(--col-text-primary);
      }

      .dna-card__division {
        font-size: 11px;
        color: var(--col-text-tertiary);
        margin: 0;
      }

      .dna-card__row {
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .dna-card__row:last-child {
        margin-bottom: 0;
      }

      .dna-card__label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--col-text-tertiary);
        margin: 0 0 4px;
      }

      .chip-group {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .chip {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: var(--col-radius-full);
        font-size: 12px;
        font-weight: 600;
        background: var(--col-surface-2);
        color: var(--col-text-secondary);
        border: 1px solid var(--col-border-subtle);
      }

      .chip--playstyle {
        background: color-mix(in srgb, var(--col-primary) 12%, var(--col-surface-2));
        color: var(--col-primary);
        border-color: color-mix(in srgb, var(--col-primary) 25%, transparent);
      }

      .chip--academic {
        background: color-mix(in srgb, var(--col-success) 12%, var(--col-surface-2));
        color: var(--col-success);
        border-color: color-mix(in srgb, var(--col-success) 25%, transparent);
      }

      .chip--need {
        background: var(--col-surface-2);
        color: var(--col-text-secondary);
      }

      /* ── SPOTLIGHT LIST (Section 6) — NewsContentComponent architecture ── */

      .spotlight-list {
        --background: transparent;
        --ion-item-background: var(--col-surface-1);
        --ion-item-border-color: var(--col-border-subtle);
      }

      .spotlight-item {
        --background: var(--col-surface-1);
        --border-color: var(--col-border-subtle);
        --padding-start: var(--nxt1-spacing-4, 16px);
        --inner-padding-end: var(--nxt1-spacing-4, 16px);
        align-items: flex-start;
      }

      .spotlight-item__thumb {
        position: relative;
        flex-shrink: 0;
        width: 110px;
        aspect-ratio: 16 / 9;
        border-radius: var(--col-radius-md);
        overflow: hidden;
        background: var(--col-surface-2);
        margin-right: var(--nxt1-spacing-3, 12px);
        margin-top: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .spotlight-item__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .spotlight-item__thumb-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: var(--col-text-tertiary);
      }

      .spotlight-item__category {
        position: absolute;
        bottom: 4px;
        left: 4px;
        padding: 2px 6px;
        border-radius: var(--col-radius-sm);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        background: var(--col-primary);
        color: var(--col-on-primary);
        line-height: 1.4;
      }

      .spotlight-item__label {
        white-space: normal;
        padding: var(--nxt1-spacing-3, 12px) 0;
      }

      .spotlight-item__college {
        font-size: 11px;
        font-weight: 600;
        color: var(--col-primary);
        margin: 0 0 2px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }

      .spotlight-item__title {
        font-size: 14px;
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0 0 4px;
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .spotlight-item__subtitle {
        font-size: 12px;
        color: var(--col-text-secondary);
        margin: 0 0 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .spotlight-item__time {
        font-size: 11px;
        color: var(--col-text-tertiary);
      }

      /* ── WATCHLIST (Section 7) ── */

      .watchlist-list {
        --background: transparent;
        --ion-item-background: var(--col-surface-2);
        --ion-item-border-color: var(--col-border-subtle);
        margin: 0 var(--nxt1-spacing-4, 16px);
        border-radius: var(--col-radius-md);
        overflow: hidden;
      }

      .watchlist-item {
        --background: var(--col-surface-2);
        --border-color: var(--col-border-subtle);
        --padding-start: var(--nxt1-spacing-2, 8px);
        --inner-padding-end: var(--nxt1-spacing-3, 12px);
      }

      /* Left accent stripe (border-l-4 border-primary pattern from spec) */
      .watchlist-item__stripe {
        width: 4px;
        height: 100%;
        min-height: 60px;
        border-radius: 2px;
        background: var(--col-primary);
        margin-right: var(--nxt1-spacing-3, 12px);
        flex-shrink: 0;
      }

      .watchlist-item__stripe--info {
        background: var(--col-primary);
      }

      .watchlist-item__stripe--success {
        background: var(--col-success);
      }

      .watchlist-item__stripe--warning {
        background: var(--col-warning);
      }

      .watchlist-item__logo {
        width: 36px;
        height: 36px;
        border-radius: var(--col-radius-sm);
        overflow: hidden;
        background: var(--col-surface-1);
        flex-shrink: 0;
        margin-right: var(--nxt1-spacing-3, 12px);
      }

      .watchlist-item__logo-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: 700;
        color: var(--col-text-secondary);
      }

      .watchlist-item__label {
        white-space: normal;
      }

      .watchlist-item__name {
        font-size: 14px;
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0 0 2px;
      }

      .watchlist-item__location {
        font-size: 12px;
        color: var(--col-text-tertiary);
        margin: 0;
      }

      .watchlist-item__status {
        font-size: 11px;
        font-weight: 600;
        color: var(--col-text-secondary);
        background: var(--col-surface-1);
        padding: 3px 8px;
        border-radius: var(--col-radius-full);
        border: 1px solid var(--col-border-subtle);
        text-align: right;
        max-width: 130px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .watchlist-item__status--success {
        color: var(--col-success);
        border-color: color-mix(in srgb, var(--col-success) 30%, transparent);
        background: color-mix(in srgb, var(--col-success) 10%, var(--col-surface-1));
      }

      .watchlist-item__status--warning {
        color: var(--col-warning);
        border-color: color-mix(in srgb, var(--col-warning) 30%, transparent);
        background: color-mix(in srgb, var(--col-warning) 10%, var(--col-surface-1));
      }

      /* ── DATABASE LEDGER (Section 8) ── */

      .ledger-card {
        margin: 0 var(--nxt1-spacing-4, 16px);
        --background: var(--col-surface-3);
      }

      .ledger-list {
        --background: transparent;
        --ion-item-background: transparent;
      }

      .ledger-item {
        --background: transparent;
        --border-color: var(--col-border-subtle);
        --padding-start: var(--nxt1-spacing-4, 16px);
        --inner-padding-end: var(--nxt1-spacing-4, 16px);
      }

      .ledger-item__label {
        white-space: normal;
      }

      .ledger-item__row {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        align-items: baseline;
        font-family: var(--nxt1-fontFamily-mono, ui-monospace, 'Menlo', 'Consolas', monospace);
        font-size: 12px;
        line-height: 1.5;
        padding: var(--nxt1-spacing-2, 8px) 0;
      }

      .ledger-item__time {
        color: var(--col-text-tertiary);
        white-space: nowrap;
      }

      .ledger-item__action {
        color: var(--col-primary);
        font-weight: 700;
      }

      .ledger-item__desc {
        color: var(--col-text-primary);
        flex: 1;
      }

      .ledger-item__sport {
        color: var(--col-text-tertiary);
        white-space: nowrap;
      }

      /* ── SKELETON LOADERS ── */

      .section-skeleton {
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px) 0;
      }

      .skeleton-bar {
        height: 20px;
        border-radius: var(--col-radius-sm);
        margin-bottom: var(--nxt1-spacing-4, 16px);
        width: 160px;
      }

      .skeleton-row {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        overflow: hidden;
      }

      .skeleton-card {
        flex-shrink: 0;
        width: 120px;
        height: 140px;
        border-radius: var(--col-radius-md);
      }

      .skeleton-dna-card {
        flex-shrink: 0;
        width: 240px;
        height: 200px;
        border-radius: var(--col-radius-lg);
      }

      .skeleton-activity-row {
        height: 60px;
        border-radius: var(--col-radius-md);
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      .skeleton-map {
        height: 200px;
        border-radius: var(--col-radius-lg);
      }

      .skeleton-ledger-row {
        height: 40px;
        border-radius: 0;
        margin-bottom: 1px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreCollegesMobileComponent {
  private readonly haptics = inject(HapticsService);

  // ── State (signals) ──────────────────────────────────────────────────────────
  readonly aiMatches = signal<readonly AiMatch[]>(MOCK_AI_MATCHES);
  readonly trendingPrograms = signal<readonly TrendingProgram[]>(MOCK_TRENDING);
  readonly recruitingActivity = signal<readonly RecruitingActivity[]>(MOCK_ACTIVITY);
  readonly regionalPrograms = signal<readonly RegionalProgram[]>(MOCK_REGIONAL);
  readonly programDna = signal<readonly ProgramDna[]>(MOCK_PROGRAM_DNA);
  readonly programSpotlights = signal<readonly ProgramSpotlight[]>(MOCK_SPOTLIGHTS);
  readonly watchlist = signal<readonly WatchlistItem[]>(MOCK_WATCHLIST);
  readonly ledgerEntries = signal<readonly LedgerEntry[]>(MOCK_LEDGER);

  /** Used to render skeleton placeholder items */
  readonly skeletonItems = Array.from({ length: 4 });

  // ── Carousel haptics ─────────────────────────────────────────────────────────

  onCarouselScroll(): void {
    void this.haptics.impact('light');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  activityTypeEmoji(type: RecruitingActivity['type']): string {
    const map: Record<RecruitingActivity['type'], string> = {
      offer: '📢',
      commit: '🤝',
      visit: '🎟️',
      camp: '⛺',
    };
    return map[type];
  }

  activityTypeLabel(type: RecruitingActivity['type']): string {
    const map: Record<RecruitingActivity['type'], string> = {
      offer: 'Offer',
      commit: 'Commit',
      visit: 'Visit',
      camp: 'Camp',
    };
    return map[type];
  }

  activityTypeVerb(type: RecruitingActivity['type']): string {
    const map: Record<RecruitingActivity['type'], string> = {
      offer: 'received an offer from',
      commit: 'committed to',
      visit: 'is visiting',
      camp: 'is attending camp at',
    };
    return map[type];
  }
}
