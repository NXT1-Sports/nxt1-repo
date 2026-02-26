/**
 * @fileoverview Explore "Colleges" Elite Dashboard — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * 8-section recruiting war room for the Colleges tab.
 * SSR-safe semantic HTML, zero Ionic, design token CSS.
 *
 * ⭐ WEB ONLY — Pure Tailwind/HTML, Zero Ionic, SSR-optimized ⭐
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

import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

// ── Domain types ──────────────────────────────────────────────────────────────

interface AiMatch {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly matchPct: number;
  readonly aiReason: string;
  readonly logoUrl?: string;
  readonly imageUrl?: string;
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
  selector: 'nxt1-explore-colleges-web',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="colleges-dashboard" role="main" aria-label="Colleges recruiting dashboard">
      <!-- ═══════════════════════════════════════════════
           SECTION 1: AI MATCHMAKER (HERO CAROUSEL)
           Always rendered — no defer — critical for LCP
           ═══════════════════════════════════════════════ -->
      <section class="dashboard-section" aria-labelledby="ai-match-heading">
        <header class="section-header">
          <h2 id="ai-match-heading" class="section-title">
            <span aria-hidden="true">✨</span> AI Matchmaker
          </h2>
          <button type="button" class="see-all-btn" aria-label="See all AI matches">
            See All
            <svg
              class="see-all-btn__icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </header>

        <!-- Horizontal snap carousel of cinematic cards -->
        <div class="hero-carousel" role="list" aria-label="AI matched colleges">
          @for (match of aiMatches(); track match.id) {
            <article
              class="hero-card"
              role="listitem"
              tabindex="0"
              [attr.aria-label]="match.name + ', ' + match.matchPct + '% match'"
            >
              <!-- Background imagery -->
              <div class="hero-card__bg" aria-hidden="true">
                @if (match.imageUrl) {
                  <img
                    [src]="match.imageUrl"
                    [alt]="match.name + ' campus'"
                    class="hero-card__img"
                    loading="eager"
                  />
                } @else {
                  <div class="hero-card__bg-placeholder"></div>
                }
              </div>

              <!-- Frosted glass overlay -->
              <div class="hero-card__overlay">
                <div class="hero-card__logo-wrap">
                  @if (match.logoUrl) {
                    <img
                      [src]="match.logoUrl"
                      [alt]="match.name + ' logo'"
                      width="44"
                      height="44"
                      class="hero-card__logo-img"
                    />
                  } @else {
                    <div class="hero-card__logo-placeholder" aria-hidden="true">
                      {{ match.name.charAt(0) }}
                    </div>
                  }
                </div>

                <div class="hero-card__info">
                  <p class="hero-card__division">{{ match.division }}</p>
                  <h3 class="hero-card__name">{{ match.name }}</h3>
                  <p class="hero-card__location">{{ match.location }}</p>
                </div>

                <div class="hero-card__meta">
                  <span class="hero-card__match-pct">{{ match.matchPct }}% Fit</span>
                  <span class="hero-card__ai-badge">✨ {{ match.aiReason }}</span>
                </div>
              </div>
            </article>
          }
        </div>
      </section>

      <!-- ═══════════════════════════════════════════════
           SECTION 2: POWER INDEX (TRENDING PROGRAMS)
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="power-index-heading">
          <header class="section-header">
            <h2 id="power-index-heading" class="section-title">
              <span aria-hidden="true">🔥</span> Power Index
            </h2>
          </header>

          <div class="trend-carousel" role="list" aria-label="Trending programs">
            @for (program of trendingPrograms(); track program.id) {
              <article class="trend-card" role="listitem" tabindex="0">
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
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
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
        <section class="dashboard-section" aria-labelledby="recruiting-ticker-heading">
          <header class="section-header">
            <h2 id="recruiting-ticker-heading" class="section-title">
              <span aria-hidden="true">📡</span> Recruiting Ticker
            </h2>
          </header>

          <div class="activity-feed" role="feed" aria-label="Live recruiting activity">
            @for (activity of recruitingActivity(); track activity.id) {
              <article class="activity-card" tabindex="0">
                <!-- Overlapping athlete + college avatars -->
                <div class="activity-card__avatars" aria-hidden="true">
                  <div class="activity-card__avatar activity-card__avatar--athlete">
                    @if (activity.athleteAvatar) {
                      <img [src]="activity.athleteAvatar" alt="" />
                    } @else {
                      <span>{{ activity.athleteName.charAt(0) }}</span>
                    }
                  </div>
                  <div class="activity-card__avatar activity-card__avatar--college">
                    @if (activity.collegeLogoUrl) {
                      <img [src]="activity.collegeLogoUrl" alt="" />
                    } @else {
                      <span>{{ activity.collegeName.charAt(0) }}</span>
                    }
                  </div>
                </div>

                <!-- Activity micro-icon -->
                <span
                  class="activity-card__type-icon"
                  [attr.aria-label]="activityTypeLabel(activity.type)"
                  role="img"
                  >{{ activityTypeEmoji(activity.type) }}</span
                >

                <!-- Content -->
                <div class="activity-card__body">
                  <p class="activity-card__headline">
                    <strong>{{ activity.athleteName }}</strong>
                    {{ activityTypeVerb(activity.type) }}
                    <strong>{{ activity.collegeName }}</strong>
                  </p>
                  <p class="activity-card__meta">{{ activity.sport }} · {{ activity.timeAgo }}</p>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 4: REGIONAL RADAR (MAP / GEO-FOCUS)
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="regional-radar-heading">
          <header class="section-header">
            <h2 id="regional-radar-heading" class="section-title">
              <span aria-hidden="true">🗺️</span> Regional Radar
            </h2>
          </header>

          <div class="map-bento" role="region" aria-label="Regional powerhouse programs">
            <!-- Stylized map graphic background -->
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

            <div class="map-bento__header">
              <p class="map-bento__region-label">Your Region: Southwest</p>
              <p class="map-bento__stat">4 Programs · 12 Open Spots</p>
            </div>

            <ul class="map-bento__programs" role="list" aria-label="Top regional programs">
              @for (program of regionalPrograms(); track program.id) {
                <li class="map-bento__program">
                  <span class="map-bento__rank">#{{ program.rank }}</span>
                  <span class="map-bento__name">{{ program.name }}</span>
                  <span class="map-bento__state">{{ program.state }}</span>
                </li>
              }
            </ul>
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-map bg-surface-300 animate-pulse"></div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-map bg-surface-300 animate-pulse"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 5: PROGRAM DNA & ROSTER MATRIX
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="program-dna-heading">
          <header class="section-header">
            <h2 id="program-dna-heading" class="section-title">
              <span aria-hidden="true">🧬</span> Program DNA
            </h2>
          </header>

          <div class="dna-grid" role="list" aria-label="Program comparison matrix">
            @for (program of programDna(); track program.id) {
              <article class="dna-card" role="listitem" tabindex="0">
                <header class="dna-card__header">
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
                    <p class="dna-card__name">{{ program.name }}</p>
                    <p class="dna-card__division">{{ program.division }}</p>
                  </div>
                </header>

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
                  <div class="chip-group" role="list" aria-label="Roster needs">
                    @for (need of program.rosterNeeds; track need) {
                      <span class="chip chip--need" role="listitem">{{ need }}</span>
                    }
                  </div>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-dna-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-dna-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 6: PROGRAM SPOTLIGHTS
           Follows NewsContentComponent card architecture:
           16:9 thumbnail left · editorial typography right
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="spotlights-heading">
          <header class="section-header">
            <h2 id="spotlights-heading" class="section-title">
              <span aria-hidden="true">📰</span> Program Spotlights
            </h2>
          </header>

          <div class="spotlight-list" role="list" aria-label="Program spotlight articles">
            @for (spotlight of programSpotlights(); track spotlight.id) {
              <article
                class="spotlight-card"
                role="listitem"
                tabindex="0"
                [attr.aria-label]="spotlight.title"
              >
                <!-- 16:9 thumbnail (left) -->
                <div class="spotlight-card__thumb">
                  @if (spotlight.thumbnailUrl) {
                    <img
                      [src]="spotlight.thumbnailUrl"
                      [alt]="spotlight.title"
                      loading="lazy"
                      class="spotlight-card__img"
                    />
                  } @else {
                    <div class="spotlight-card__thumb-placeholder" aria-hidden="true">
                      <svg
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        class="spotlight-card__thumb-icon"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    </div>
                  }
                  <span class="spotlight-card__category">{{ spotlight.category }}</span>
                </div>

                <!-- Editorial content (right) -->
                <div class="spotlight-card__content">
                  <p class="spotlight-card__college">{{ spotlight.collegeName }}</p>
                  <h3 class="spotlight-card__title">{{ spotlight.title }}</h3>
                  <p class="spotlight-card__subtitle">{{ spotlight.subtitle }}</p>
                  <time class="spotlight-card__time">{{ spotlight.publishedAt }}</time>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-spotlight-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-spotlight-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 7: WATCHLIST (YOUR TRACKED PROGRAMS)
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="watchlist-heading">
          <header class="section-header">
            <h2 id="watchlist-heading" class="section-title">
              <span aria-hidden="true">👁️</span> Your Watchlist
            </h2>
          </header>

          <ul class="watchlist" role="list" aria-label="Tracked programs">
            @for (item of watchlist(); track item.id) {
              <li class="watchlist-item" tabindex="0">
                <!-- Active-tracking indicator stripe -->
                <div
                  class="watchlist-item__stripe"
                  [class.watchlist-item__stripe--info]="item.statusType === 'info'"
                  [class.watchlist-item__stripe--success]="item.statusType === 'success'"
                  [class.watchlist-item__stripe--warning]="item.statusType === 'warning'"
                  aria-hidden="true"
                ></div>

                <div class="watchlist-item__logo" aria-hidden="true">
                  @if (item.logoUrl) {
                    <img [src]="item.logoUrl" [alt]="item.name + ' logo'" width="36" height="36" />
                  } @else {
                    <div class="watchlist-item__logo-placeholder">{{ item.name.charAt(0) }}</div>
                  }
                </div>

                <div class="watchlist-item__info">
                  <p class="watchlist-item__name">{{ item.name }}</p>
                  <p class="watchlist-item__location">{{ item.location }}</p>
                </div>

                <div
                  class="watchlist-item__status"
                  [class.watchlist-item__status--success]="item.statusType === 'success'"
                  [class.watchlist-item__status--warning]="item.statusType === 'warning'"
                  [attr.aria-label]="'Status: ' + item.status"
                >
                  {{ item.status }}
                </div>
              </li>
            }
          </ul>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-activity-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 8: DATABASE LEDGER (SYSTEM UPDATES)
           Terminal-style running log; builds platform trust
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="ledger-heading">
          <header class="section-header">
            <h2 id="ledger-heading" class="section-title">
              <span aria-hidden="true">🗄️</span> Data Ledger
            </h2>
          </header>

          <div class="ledger" role="log" aria-label="Data update log" aria-live="polite">
            <ul class="ledger__list" role="list">
              @for (entry of ledgerEntries(); track entry.id) {
                <li class="ledger__entry" role="listitem">
                  <time class="ledger__time">{{ entry.timestamp }}</time>
                  <span class="ledger__action">{{ entry.action }}</span>
                  <span class="ledger__desc">{{ entry.description }}</span>
                  <span class="ledger__sport">({{ entry.sport }})</span>
                </li>
              }
            </ul>
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          @for (_ of skeletonItems; track $index) {
            <div class="skeleton-ledger-row bg-surface-300 animate-pulse"></div>
          }
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
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
         EXPLORE COLLEGES (WEB) — Design Token CSS
         Zero hardcoded colors. All values via --nxt1-* custom properties.
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
        --col-border-strong: var(--nxt1-color-border-strong);
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
        display: flex;
        align-items: center;
        justify-content: space-between;
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
        letter-spacing: -0.3px;
      }

      .see-all-btn {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--col-primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        transition: opacity 150ms ease;
      }

      .see-all-btn:hover {
        opacity: 0.75;
      }

      .see-all-btn__icon {
        width: 14px;
        height: 14px;
      }

      /* ── HERO CAROUSEL (Section 1) ── */

      .hero-carousel {
        display: flex;
        gap: var(--nxt1-spacing-4, 16px);
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
        border-radius: var(--col-radius-lg);
        overflow: hidden;
        scroll-snap-align: start;
        cursor: pointer;
        outline: none;
        transition: transform 150ms ease;
      }

      .hero-card:hover {
        transform: translateY(-4px);
      }

      .hero-card:focus-visible {
        outline: 2px solid var(--col-primary);
        outline-offset: 2px;
      }

      .hero-card:active {
        transform: scale(0.97);
      }

      .hero-card__bg {
        position: absolute;
        inset: 0;
        background: var(--col-surface-3);
      }

      .hero-card__bg-placeholder {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, var(--col-surface-3), var(--col-surface-2));
      }

      .hero-card__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      /* Frosted glass overlay */
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
          color-mix(in srgb, var(--col-surface-1) 60%, transparent) 60%,
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
        flex-shrink: 0;
      }

      .hero-card__logo-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
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
        font-size: var(--nxt1-fontSize-2xs, 11px);
        font-weight: 600;
        color: var(--col-text-inverse);
        opacity: 0.75;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0 0 2px;
      }

      .hero-card__name {
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--col-text-inverse);
        margin: 0 0 2px;
        line-height: 1.2;
      }

      .hero-card__location {
        font-size: var(--nxt1-fontSize-xs, 12px);
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
        font-size: var(--nxt1-fontSize-2xl, 24px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
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
        font-size: var(--nxt1-fontSize-2xs, 11px);
        font-weight: 600;
        color: var(--col-text-inverse);
        white-space: nowrap;
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
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        width: 120px;
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
        background: var(--col-surface-2);
        border: 1px solid var(--col-border-subtle);
        border-radius: var(--col-radius-md);
        scroll-snap-align: start;
        cursor: pointer;
        outline: none;
        transition:
          background-color 150ms ease,
          transform 150ms ease;
      }

      .trend-card:hover {
        background: var(--col-surface-3);
        transform: translateY(-2px);
      }

      .trend-card:focus-visible {
        outline: 2px solid var(--col-primary);
        outline-offset: 2px;
      }

      .trend-card:active {
        transform: scale(0.96);
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
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0;
        text-align: center;
      }

      .trend-card__metric {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--col-text-tertiary);
        margin: 0;
        text-align: center;
      }

      .trend-card__delta {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: 700;
        color: var(--col-text-tertiary);
      }

      .trend-card__delta--positive {
        color: var(--col-success);
      }

      /* ── ACTIVITY FEED (Section 3) ── */

      .activity-feed {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .activity-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--col-surface-1);
        border: 1px solid var(--col-border);
        border-radius: var(--col-radius-md);
        cursor: pointer;
        outline: none;
        transition:
          background-color 150ms ease,
          transform 150ms ease;
      }

      .activity-card:hover {
        background: var(--col-surface-2);
      }

      .activity-card:focus-visible {
        outline: 2px solid var(--col-primary);
        outline-offset: 2px;
      }

      .activity-card:active {
        transform: scale(0.99);
      }

      /* Overlapping athlete + college avatars */
      .activity-card__avatars {
        position: relative;
        width: 48px;
        height: 32px;
        flex-shrink: 0;
      }

      .activity-card__avatar {
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
        /* border uses bg-primary token for the contrast ring */
        border: 2px solid var(--col-bg);
      }

      .activity-card__avatar--athlete {
        top: 0;
        left: 0;
        z-index: 2;
      }

      .activity-card__avatar--college {
        top: 4px;
        left: 16px;
        z-index: 1;
      }

      .activity-card__avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .activity-card__type-icon {
        font-size: 18px;
        flex-shrink: 0;
      }

      .activity-card__body {
        flex: 1;
        min-width: 0;
      }

      .activity-card__headline {
        font-size: var(--nxt1-fontSize-sm, 14px);
        color: var(--col-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .activity-card__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--col-text-tertiary);
        margin: 0;
      }

      /* ── MAP BENTO (Section 4) ── */

      .map-bento {
        position: relative;
        margin: 0 var(--nxt1-spacing-4, 16px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--col-surface-3);
        border: 1px solid var(--col-border-subtle);
        border-radius: var(--col-radius-lg);
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

      .map-bento__header {
        position: relative;
        z-index: 1;
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .map-bento__region-label {
        font-size: var(--nxt1-fontSize-lg, 17px);
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0 0 2px;
      }

      .map-bento__stat {
        font-size: var(--nxt1-fontSize-sm, 13px);
        color: var(--col-text-secondary);
        margin: 0;
      }

      .map-bento__programs {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .map-bento__program {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        background: color-mix(in srgb, var(--col-surface-1) 70%, transparent);
        border-radius: var(--col-radius-md);
      }

      .map-bento__rank {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: 700;
        color: var(--col-primary);
        min-width: 24px;
      }

      .map-bento__name {
        flex: 1;
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: 600;
        color: var(--col-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .map-bento__state {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        color: var(--col-text-secondary);
        background: var(--col-surface-2);
        padding: 2px 8px;
        border-radius: var(--col-radius-full);
      }

      /* ── PROGRAM DNA GRID (Section 5) ── */

      .dna-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .dna-card {
        background: var(--col-surface-2);
        border: 1px solid var(--col-border-subtle);
        border-radius: var(--col-radius-lg);
        padding: var(--nxt1-spacing-4, 16px);
        cursor: pointer;
        outline: none;
        transition:
          background-color 150ms ease,
          border-color 150ms ease;
      }

      .dna-card:hover {
        background: var(--col-surface-3);
        border-color: var(--col-border);
      }

      .dna-card:focus-visible {
        outline: 2px solid var(--col-primary);
        outline-offset: 2px;
      }

      .dna-card__header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
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
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0 0 2px;
      }

      .dna-card__division {
        font-size: var(--nxt1-fontSize-2xs, 11px);
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
        font-size: var(--nxt1-fontSize-2xs, 11px);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--col-text-tertiary);
        margin: 0 0 var(--nxt1-spacing-1, 4px);
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
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        cursor: default;
        background: var(--col-surface-2);
        color: var(--col-text-secondary);
        border: 1px solid var(--col-border-subtle);
        transition:
          background-color 150ms ease,
          color 150ms ease;
      }

      .chip:hover {
        background: var(--col-primary);
        color: var(--col-on-primary);
        border-color: var(--col-primary);
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
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .spotlight-card {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--col-surface-1);
        border-bottom: 1px solid var(--col-border-subtle);
        cursor: pointer;
        outline: none;
        transition: background-color 150ms ease;
      }

      .spotlight-card:first-child {
        border-top: 1px solid var(--col-border-subtle);
      }

      .spotlight-card:hover {
        background: var(--col-surface-2);
      }

      .spotlight-card:focus-visible {
        outline: 2px solid var(--col-primary);
        outline-offset: -2px;
      }

      .spotlight-card:active {
        background: var(--col-surface-3);
      }

      /* 16:9 thumbnail (left) */
      .spotlight-card__thumb {
        position: relative;
        flex-shrink: 0;
        width: 120px;
        aspect-ratio: 16 / 9;
        border-radius: var(--col-radius-md);
        overflow: hidden;
        background: var(--col-surface-2);
      }

      .spotlight-card__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .spotlight-card__thumb-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--col-text-tertiary);
      }

      .spotlight-card__thumb-icon {
        width: 24px;
        height: 24px;
      }

      .spotlight-card__category {
        position: absolute;
        bottom: 4px;
        left: 4px;
        padding: 2px 6px;
        border-radius: var(--col-radius-sm);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        background: var(--col-primary);
        color: var(--col-on-primary);
        line-height: 1.4;
      }

      /* Editorial content (right) */
      .spotlight-card__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .spotlight-card__college {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        color: var(--col-primary);
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }

      .spotlight-card__title {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-tight, 1.35);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .spotlight-card__subtitle {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--col-text-secondary);
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: var(--nxt1-lineHeight-base, 1.5);
      }

      .spotlight-card__time {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--col-text-tertiary);
        margin-top: auto;
      }

      /* ── WATCHLIST (Section 7) ── */

      .watchlist {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: 0 var(--nxt1-spacing-4, 16px);
        list-style: none;
        margin: 0;
      }

      .watchlist-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-3, 12px)
          var(--nxt1-spacing-5, 20px);
        background: var(--col-surface-2);
        border-radius: var(--col-radius-md);
        cursor: pointer;
        outline: none;
        overflow: hidden;
        transition:
          background-color 150ms ease,
          transform 150ms ease;
      }

      .watchlist-item:hover {
        background: var(--col-surface-3);
      }

      .watchlist-item:focus-visible {
        outline: 2px solid var(--col-primary);
        outline-offset: 2px;
      }

      .watchlist-item:active {
        transform: scale(0.99);
      }

      /* Left accent stripe (border-l-4 border-primary pattern) */
      .watchlist-item__stripe {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: var(--col-primary);
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

      .watchlist-item__info {
        flex: 1;
        min-width: 0;
      }

      .watchlist-item__name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .watchlist-item__location {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--col-text-tertiary);
        margin: 0;
      }

      .watchlist-item__status {
        flex-shrink: 0;
        font-size: var(--nxt1-fontSize-xs, 11px);
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

      /* ── DATABASE LEDGER (Section 8) — terminal / timeline style ── */

      .ledger {
        margin: 0 var(--nxt1-spacing-4, 16px);
        background: var(--col-surface-3);
        border: 1px solid var(--col-border-subtle);
        border-radius: var(--col-radius-lg);
        overflow: hidden;
      }

      .ledger__list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .ledger__entry {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 6px;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        border-bottom: 1px solid var(--col-border-subtle);
        font-family: var(--nxt1-fontFamily-mono, ui-monospace, 'Menlo', 'Consolas', monospace);
        font-size: var(--nxt1-fontSize-xs, 12px);
        line-height: 1.5;
      }

      .ledger__entry:last-child {
        border-bottom: none;
      }

      .ledger__time {
        color: var(--col-text-tertiary);
        white-space: nowrap;
      }

      .ledger__time::before {
        content: '[';
      }

      .ledger__time::after {
        content: ']';
      }

      .ledger__action {
        color: var(--col-primary);
        font-weight: 700;
      }

      .ledger__desc {
        color: var(--col-text-primary);
        flex: 1;
      }

      .ledger__sport {
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
      }

      .skeleton-bar--heading {
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
        height: 200px;
        border-radius: var(--col-radius-lg);
        min-width: 200px;
      }

      .skeleton-activity-row {
        height: 60px;
        border-radius: var(--col-radius-md);
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      .skeleton-spotlight-row {
        height: 80px;
        border-radius: 0;
        margin-bottom: 1px;
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

      /* ── REDUCED MOTION ── */

      @media (prefers-reduced-motion: reduce) {
        .hero-card,
        .trend-card,
        .activity-card,
        .dna-card,
        .spotlight-card,
        .watchlist-item,
        .chip {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreCollegesWebComponent {
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
