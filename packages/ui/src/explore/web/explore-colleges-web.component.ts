/**
 * @fileoverview Explore "Colleges" Elite Dashboard — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 2.0.0
 *
 * 8-section recruiting war room for the Colleges tab.
 * SSR-safe semantic HTML, zero Ionic (except shared NewsArticleCardComponent),
 * design token CSS.
 *
 * ⭐ WEB ONLY — Pure Tailwind/HTML, Zero Ionic, SSR-optimized ⭐
 *
 * Sections:
 *   1. AI Matchmaker (Hero Carousel) — always rendered for LCP
 *   2. Power Index (Trending Programs) — @defer
 *   3. Recruiting Ticker (All Activity) — @defer
 *   4. Regional Radar (Map / Geo-Focus) — @defer
 *   5. Program DNA & Roster Matrix — @defer
 *   6. Program Spotlights (NewsArticleCardComponent) — @defer
 *   7. Watchlist (Your Tracked Programs) — @defer
 *   8. Database Ledger (System Updates) — @defer
 */

import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { NewsArticle } from '@nxt1/core';
import { NewsArticleCardComponent } from '../../news/news-article-card.component';

// ── Domain types ──────────────────────────────────────────────────────────────

interface AiMatch {
  readonly id: string;
  readonly name: string;
  readonly location: string;
  readonly matchPct: number;
  readonly aiReason: string;
  readonly logoUrl: string;
  readonly imageUrl?: string;
  readonly division: string;
  /** CSS gradient for placeholder background (uses college brand color) */
  readonly bgGradient: string;
}

interface TrendingProgram {
  readonly id: string;
  readonly name: string;
  readonly logoUrl: string;
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
  readonly logoUrl: string;
  readonly rank: number;
}

interface ProgramDna {
  readonly id: string;
  readonly name: string;
  readonly playstyle: string;
  readonly academicTier: string;
  readonly rosterNeeds: readonly string[];
  readonly division: string;
  readonly logoUrl: string;
}

interface WatchlistItem {
  readonly id: string;
  readonly name: string;
  readonly logoUrl: string;
  readonly location: string;
  readonly division: string;
}

interface LedgerEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly action: 'Updated' | 'Synced' | 'Added';
  readonly description: string;
  readonly collegeName: string;
  readonly collegeLogoUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dicebear(seed: string, bg: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}&fontColor=ffffff`;
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
    logoUrl: dicebear('Duke', '003087'),
    bgGradient: 'linear-gradient(160deg, #003087 0%, #001540 100%)',
  },
  {
    id: '2',
    name: 'University of Kentucky',
    location: 'Lexington, KY',
    matchPct: 92,
    aiReason: 'Strong fit for your playing style',
    division: 'D1 · SEC',
    logoUrl: dicebear('UK', '0033A0'),
    bgGradient: 'linear-gradient(160deg, #0033A0 0%, #001450 100%)',
  },
  {
    id: '3',
    name: 'Gonzaga University',
    location: 'Spokane, WA',
    matchPct: 89,
    aiReason: 'Roster vacancy at your position',
    division: 'D1 · WCC',
    logoUrl: dicebear('GU', '002B5C'),
    bgGradient: 'linear-gradient(160deg, #002B5C 0%, #001020 100%)',
  },
  {
    id: '4',
    name: 'Villanova University',
    location: 'Villanova, PA',
    matchPct: 87,
    aiReason: 'Academic profile alignment',
    division: 'D1 · Big East',
    logoUrl: dicebear('VU', '003883'),
    bgGradient: 'linear-gradient(160deg, #003883 0%, #001540 100%)',
  },
  {
    id: '5',
    name: 'Kansas Jayhawks',
    location: 'Lawrence, KS',
    matchPct: 84,
    aiReason: 'Coaching staff viewed your profile',
    division: 'D1 · Big 12',
    logoUrl: dicebear('KU', '0051A5'),
    bgGradient: 'linear-gradient(160deg, #0051A5 0%, #002050 100%)',
  },
];

const MOCK_TRENDING: readonly TrendingProgram[] = [
  { id: '1', name: 'Alabama', trendMetric: 'Profile Views', trendDelta: '+45%', positive: true, logoUrl: dicebear('Bama', '9E1B32') },
  { id: '2', name: 'UConn', trendMetric: 'Watchlist Adds', trendDelta: '+38%', positive: true, logoUrl: dicebear('UCONN', '000E2F') },
  { id: '3', name: 'Baylor', trendMetric: 'Offer Activity', trendDelta: '+29%', positive: true, logoUrl: dicebear('BU', '154734') },
  { id: '4', name: 'Louisville', trendMetric: 'Camp Signups', trendDelta: '+22%', positive: true, logoUrl: dicebear('UofL', 'AD0000') },
  { id: '5', name: 'Oregon', trendMetric: 'Visits Booked', trendDelta: '+18%', positive: true, logoUrl: dicebear('UO', '154733') },
];

const MOCK_ACTIVITY: readonly RecruitingActivity[] = [
  { id: '1', type: 'offer', athleteName: 'Jordan Smith', collegeName: 'Duke', timeAgo: '2m ago', sport: 'Basketball' },
  { id: '2', type: 'commit', athleteName: 'Marcus Davis', collegeName: 'Alabama', timeAgo: '15m ago', sport: 'Basketball' },
  { id: '3', type: 'visit', athleteName: 'Taylor Johnson', collegeName: 'Kentucky', timeAgo: '1h ago', sport: 'Basketball' },
  { id: '4', type: 'camp', athleteName: 'Ryan Williams', collegeName: 'Kansas', timeAgo: '2h ago', sport: 'Basketball' },
  { id: '5', type: 'offer', athleteName: 'Chris Brown', collegeName: 'Gonzaga', timeAgo: '3h ago', sport: 'Basketball' },
  { id: '6', type: 'commit', athleteName: 'Alex Turner', collegeName: 'Villanova', timeAgo: '5h ago', sport: 'Basketball' },
];

const MOCK_REGIONAL: readonly RegionalProgram[] = [
  { id: '1', name: 'Texas Longhorns', state: 'TX', rank: 1, logoUrl: dicebear('UT', 'BF5700') },
  { id: '2', name: 'Texas A&M', state: 'TX', rank: 2, logoUrl: dicebear('ATM', '500000') },
  { id: '3', name: 'Baylor Bears', state: 'TX', rank: 3, logoUrl: dicebear('BU', '154734') },
  { id: '4', name: 'TCU Horned Frogs', state: 'TX', rank: 4, logoUrl: dicebear('TCU', '4D1979') },
];

const MOCK_PROGRAM_DNA: readonly ProgramDna[] = [
  { id: '1', name: 'Duke', playstyle: 'Ball Movement Heavy', academicTier: 'Elite', rosterNeeds: ['PG (Graduating 2)', 'SF (Graduating 1)'], division: 'D1 · ACC', logoUrl: dicebear('Duke', '003087') },
  { id: '2', name: 'Kansas', playstyle: 'Fast Break Heavy', academicTier: 'Strong', rosterNeeds: ['C (Graduating 3)', 'SG'], division: 'D1 · Big 12', logoUrl: dicebear('KU', '0051A5') },
  { id: '3', name: 'Gonzaga', playstyle: 'Post-Entry Focus', academicTier: 'Excellent', rosterNeeds: ['PF (Graduating 2)'], division: 'D1 · WCC', logoUrl: dicebear('GU', '002B5C') },
];

// Watchlist: no status text — just saved schools
const MOCK_WATCHLIST: readonly WatchlistItem[] = [
  { id: '1', name: 'Duke University', logoUrl: dicebear('Duke', '003087'), location: 'Durham, NC', division: 'D1 · ACC' },
  { id: '2', name: 'Kentucky', logoUrl: dicebear('UK', '0033A0'), location: 'Lexington, KY', division: 'D1 · SEC' },
  { id: '3', name: 'Gonzaga', logoUrl: dicebear('GU', '002B5C'), location: 'Spokane, WA', division: 'D1 · WCC' },
  { id: '4', name: 'Kansas', logoUrl: dicebear('KU', '0051A5'), location: 'Lawrence, KS', division: 'D1 · Big 12' },
  { id: '5', name: 'Villanova', logoUrl: dicebear('VU', '003883'), location: 'Villanova, PA', division: 'D1 · Big East' },
];

// Ledger: basketball-only, card-style
const MOCK_LEDGER: readonly LedgerEntry[] = [
  { id: '1', timestamp: '10:42 AM', action: 'Updated', description: '2026 Roster Data', collegeName: 'Duke University', collegeLogoUrl: dicebear('Duke', '003087') },
  { id: '2', timestamp: '9:15 AM', action: 'Synced', description: 'New coaching staff profile', collegeName: 'Kentucky', collegeLogoUrl: dicebear('UK', '0033A0') },
  { id: '3', timestamp: '8:00 AM', action: 'Added', description: 'Camp schedule for Spring 2026', collegeName: 'Kansas', collegeLogoUrl: dicebear('KU', '0051A5') },
  { id: '4', timestamp: 'Yesterday', action: 'Updated', description: 'Academic program listings', collegeName: 'Gonzaga', collegeLogoUrl: dicebear('GU', '002B5C') },
  { id: '5', timestamp: 'Yesterday', action: 'Synced', description: 'Official visit availability', collegeName: 'Villanova', collegeLogoUrl: dicebear('VU', '003883') },
];

/** Fixed base date for stable mock timestamps in tests and SSR */
const BASE_DATE = new Date('2026-02-26T12:00:00Z').getTime();

const MOCK_SPOTLIGHT_ARTICLES: NewsArticle[] = [
  {
    id: 'col-spot-001',
    title: 'Duke Unveils $50M Practice Facility',
    excerpt: 'State-of-the-art player development center set to open Fall 2026, featuring elite training tech.',
    content: '<p>Duke Basketball unveils its $50M practice facility renovation.</p>',
    category: 'college',
    source: { id: 'nxt1-ed', name: 'NXT 1', avatarUrl: 'assets/shared/logo/nxt1_icon.png', type: 'editorial', isVerified: true },
    heroImageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&q=80',
    readingTimeMinutes: 3,
    publishedAt: new Date(BASE_DATE - 1000 * 60 * 120).toISOString(),
    isBookmarked: false,
    isRead: false,
    xpReward: 15,
    viewCount: 3200,
    isFeatured: true,
  },
  {
    id: 'col-spot-002',
    title: 'Kentucky Adds 4-Star Transfer at Guard',
    excerpt: 'Former All-Conference player joins Wildcats, filling a critical roster gap ahead of the season.',
    content: '<p>Kentucky Basketball adds a high-impact transfer.</p>',
    category: 'college',
    source: { id: 'nxt1-ed', name: 'NXT 1', avatarUrl: 'assets/shared/logo/nxt1_icon.png', type: 'editorial', isVerified: true },
    heroImageUrl: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=400&q=80',
    readingTimeMinutes: 4,
    publishedAt: new Date(BASE_DATE - 1000 * 60 * 240).toISOString(),
    isBookmarked: false,
    isRead: false,
    xpReward: 20,
    viewCount: 4100,
  },
  {
    id: 'col-spot-003',
    title: 'Kansas No. 1 in Early Preseason Polls',
    excerpt: 'Jayhawks return four starters and land top-10 recruiting class, making them heavy favorites.',
    content: '<p>Kansas Basketball positioned as preseason No. 1.</p>',
    category: 'college',
    source: { id: 'nxt1-ed', name: 'NXT 1', avatarUrl: 'assets/shared/logo/nxt1_icon.png', type: 'editorial', isVerified: true },
    heroImageUrl: 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400&q=80',
    readingTimeMinutes: 5,
    publishedAt: new Date(BASE_DATE - 1000 * 60 * 60 * 24).toISOString(),
    isBookmarked: false,
    isRead: false,
    xpReward: 20,
    viewCount: 5800,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'nxt1-explore-colleges-web',
  standalone: true,
  imports: [CommonModule, NewsArticleCardComponent],
  template: `
    <div class="colleges-dashboard" role="main" aria-label="Colleges recruiting dashboard">
      <!-- ═══════════════════════════════════════════════
           SECTION 1: AI MATCHMAKER (HERO CAROUSEL)
           Always rendered — no defer — critical for LCP
           ═══════════════════════════════════════════════ -->
      <section class="dashboard-section" aria-labelledby="ai-match-heading">
        <header class="section-header">
          <h2 id="ai-match-heading" class="section-title">AI Matchmaker</h2>
          <button type="button" class="see-all-btn" aria-label="See all AI matches">
            See All
            <svg class="see-all-btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </header>

        <div class="hero-carousel" role="list" aria-label="AI matched colleges">
          @for (match of aiMatches(); track match.id) {
            <article
              class="hero-card"
              role="listitem"
              tabindex="0"
              [attr.aria-label]="match.name + ', ' + match.matchPct + '% match'"
            >
              <!-- Brand-color gradient background -->
              <div class="hero-card__bg" [style.background]="match.bgGradient" aria-hidden="true">
                @if (match.imageUrl) {
                  <img [src]="match.imageUrl" [alt]="match.name + ' campus'" class="hero-card__img" loading="eager" />
                }
              </div>

              <!-- Dark gradient overlay — ensures high contrast text -->
              <div class="hero-card__overlay">
                <div class="hero-card__top-row">
                  <div class="hero-card__match-badge">
                    <span class="hero-card__match-num">{{ match.matchPct }}%</span>
                    <span class="hero-card__match-label">Fit</span>
                  </div>
                </div>

                <div class="hero-card__bottom">
                  <div class="hero-card__logo-wrap" aria-hidden="true">
                    <img [src]="match.logoUrl" [alt]="match.name + ' logo'" width="48" height="48" class="hero-card__logo-img" />
                  </div>
                  <div class="hero-card__info">
                    <p class="hero-card__division">{{ match.division }}</p>
                    <h3 class="hero-card__name">{{ match.name }}</h3>
                    <p class="hero-card__location">{{ match.location }}</p>
                  </div>
                  <div class="hero-card__ai-badge">{{ match.aiReason }}</div>
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
            <h2 id="power-index-heading" class="section-title">Power Index</h2>
          </header>

          <div class="power-carousel" role="list" aria-label="Trending programs">
            @for (program of trendingPrograms(); track program.id) {
              <article class="power-card" role="listitem" tabindex="0">
                <div class="power-card__logo-wrap" aria-hidden="true">
                  <img [src]="program.logoUrl" [alt]="program.name + ' logo'" width="60" height="60" class="power-card__logo" />
                </div>
                <p class="power-card__name">{{ program.name }}</p>
                <p class="power-card__metric">{{ program.trendMetric }}</p>
                <span class="power-card__delta" [class.power-card__delta--pos]="program.positive">
                  {{ program.trendDelta }}
                </span>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-power-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-power-card bg-surface-300 animate-pulse"></div>
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
            <h2 id="recruiting-ticker-heading" class="section-title">Recruiting Ticker</h2>
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

                <!-- Activity type pill -->
                <span
                  class="activity-type-pill"
                  [class]="'activity-type-pill--' + activity.type"
                  [attr.aria-label]="activityTypeLabel(activity.type)"
                >{{ activityTypeLabel(activity.type) }}</span>

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
            <h2 id="regional-radar-heading" class="section-title">Regional Radar</h2>
          </header>

          <div class="map-bento" role="region" aria-label="Regional powerhouse programs">
            <div class="map-bento__bg" aria-hidden="true">
              <svg viewBox="0 0 400 200" class="map-bento__svg">
                <path d="M 40 170 L 60 55 L 200 38 L 320 75 L 360 155 L 280 190 L 180 200 L 80 190 Z" fill="none" stroke="currentColor" stroke-width="1" opacity="0.15" />
                <line x1="100" y1="38" x2="120" y2="200" stroke="currentColor" stroke-width="0.5" opacity="0.1" />
                <line x1="200" y1="38" x2="220" y2="200" stroke="currentColor" stroke-width="0.5" opacity="0.1" />
                <line x1="300" y1="38" x2="280" y2="200" stroke="currentColor" stroke-width="0.5" opacity="0.1" />
                <line x1="40" y1="115" x2="360" y2="125" stroke="currentColor" stroke-width="0.5" opacity="0.1" />
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
                  <img [src]="program.logoUrl" [alt]="program.name" width="28" height="28" class="map-bento__logo" />
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
            <h2 id="program-dna-heading" class="section-title">Program DNA</h2>
          </header>

          <div class="dna-grid" role="list" aria-label="Program comparison matrix">
            @for (program of programDna(); track program.id) {
              <article class="dna-card" role="listitem" tabindex="0">
                <header class="dna-card__header">
                  <div class="dna-card__logo-wrap" aria-hidden="true">
                    <img [src]="program.logoUrl" [alt]="program.name + ' logo'" width="36" height="36" />
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
           Uses the shared NewsArticleCardComponent
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="spotlights-heading">
          <header class="section-header">
            <h2 id="spotlights-heading" class="section-title">Program Spotlights</h2>
          </header>

          <div class="news-carousel" role="list" aria-label="Program spotlight articles">
            @for (article of spotlightArticles(); track article.id) {
              <div class="news-carousel__item" role="listitem">
                <nxt1-news-article-card [article]="article" />
              </div>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-news-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-news-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 7: WATCHLIST (YOUR TRACKED PROGRAMS)
           Horizontal scroll row with college logos + stars
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="watchlist-heading">
          <header class="section-header">
            <h2 id="watchlist-heading" class="section-title">My Watchlist</h2>
            <button type="button" class="see-all-btn" aria-label="Manage watchlist">
              Manage
              <svg class="see-all-btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </header>

          <div class="watchlist-row" role="list" aria-label="Saved college programs">
            @for (item of watchlist(); track item.id) {
              <article class="watchlist-card" role="listitem" tabindex="0" [attr.aria-label]="item.name">
                <!-- Star icon (top-right) -->
                <div class="watchlist-card__star" aria-hidden="true">
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>

                <!-- College logo -->
                <div class="watchlist-card__logo-wrap" aria-hidden="true">
                  <img [src]="item.logoUrl" [alt]="item.name + ' logo'" width="64" height="64" class="watchlist-card__logo" />
                </div>

                <!-- Name + location -->
                <p class="watchlist-card__name">{{ item.name }}</p>
                <p class="watchlist-card__division">{{ item.division }}</p>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-watchlist-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-watchlist-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════
           SECTION 8: DATABASE LEDGER (SYSTEM UPDATES)
           Your sport only — card-based visual timeline
           ═══════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="dashboard-section" aria-labelledby="ledger-heading">
          <header class="section-header">
            <h2 id="ledger-heading" class="section-title">Data Ledger</h2>
            <span class="ledger-sport-badge">Basketball</span>
          </header>

          <div class="ledger-grid" role="list" aria-label="Data update log" aria-live="polite">
            @for (entry of ledgerEntries(); track entry.id) {
              <article class="ledger-card" role="listitem">
                <div class="ledger-card__logo-wrap" aria-hidden="true">
                  <img [src]="entry.collegeLogoUrl" [alt]="entry.collegeName + ' logo'" width="48" height="48" class="ledger-card__logo" />
                </div>
                <div class="ledger-card__body">
                  <div class="ledger-card__top-row">
                    <span
                      class="ledger-card__action"
                      [class.ledger-card__action--updated]="entry.action === 'Updated'"
                      [class.ledger-card__action--synced]="entry.action === 'Synced'"
                      [class.ledger-card__action--added]="entry.action === 'Added'"
                    >
                      {{ entry.action }}
                    </span>
                    <time class="ledger-card__time">{{ entry.timestamp }}</time>
                  </div>
                  <p class="ledger-card__college">{{ entry.collegeName }}</p>
                  <p class="ledger-card__desc">{{ entry.description }}</p>
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
              <div class="skeleton-ledger-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="section-skeleton" aria-hidden="true">
          <div class="skeleton-bar skeleton-bar--heading bg-surface-300 animate-pulse"></div>
          <div class="skeleton-row">
            @for (_ of skeletonItems; track $index) {
              <div class="skeleton-ledger-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ================================================================
         EXPLORE COLLEGES (WEB) v2 — Design Token CSS
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

      .see-all-btn:hover { opacity: 0.75; }

      .see-all-btn__icon { width: 14px; height: 14px; }

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

      .hero-carousel::-webkit-scrollbar { display: none; }

      .hero-card {
        flex-shrink: 0;
        position: relative;
        width: 280px;
        height: 380px;
        border-radius: var(--col-radius-lg);
        overflow: hidden;
        scroll-snap-align: start;
        cursor: pointer;
        outline: none;
        transition: transform 150ms ease;
      }

      .hero-card:hover { transform: translateY(-4px); }
      .hero-card:focus-visible { outline: 2px solid var(--col-primary); outline-offset: 2px; }
      .hero-card:active { transform: scale(0.97); }

      .hero-card__bg {
        position: absolute;
        inset: 0;
      }

      .hero-card__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      /* Strong gradient overlay — ensures white text reads clearly on any bg */
      .hero-card__overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: var(--nxt1-spacing-4, 16px);
        background: linear-gradient(
          to bottom,
          rgba(0, 0, 0, 0.15) 0%,
          rgba(0, 0, 0, 0) 30%,
          rgba(0, 0, 0, 0.7) 70%,
          rgba(0, 0, 0, 0.9) 100%
        );
      }

      .hero-card__top-row {
        display: flex;
        justify-content: flex-end;
      }

      /* Match percentage badge — top-right */
      .hero-card__match-badge {
        display: flex;
        align-items: baseline;
        gap: 2px;
        background: var(--col-primary);
        color: var(--col-on-primary);
        border-radius: var(--col-radius-full);
        padding: 4px 12px;
      }

      .hero-card__match-num {
        font-size: var(--nxt1-fontSize-lg, 17px);
        font-weight: 900;
        line-height: 1;
      }

      .hero-card__match-label {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 700;
      }

      /* Bottom content area */
      .hero-card__bottom {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .hero-card__logo-wrap {
        width: 48px;
        height: 48px;
        border-radius: var(--col-radius-sm);
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.3);
      }

      .hero-card__logo-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .hero-card__info { display: flex; flex-direction: column; gap: 1px; }

      .hero-card__division {
        font-size: 10px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.75);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0;
      }

      .hero-card__name {
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: 800;
        color: #ffffff;
        margin: 0;
        line-height: 1.15;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
      }

      .hero-card__location {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: rgba(255, 255, 255, 0.8);
        margin: 0;
      }

      .hero-card__ai-badge {
        display: inline-flex;
        align-items: center;
        align-self: flex-start;
        padding: 4px 10px;
        border-radius: var(--col-radius-full);
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        font-size: 11px;
        font-weight: 600;
        color: #ffffff;
        white-space: nowrap;
      }

      /* ── POWER INDEX (Section 2) ── */

      .power-carousel {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .power-carousel::-webkit-scrollbar { display: none; }

      .power-card {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        width: 160px;
        padding: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px);
        background: var(--col-surface-2);
        border: 1px solid var(--col-border-subtle);
        border-radius: var(--col-radius-lg);
        scroll-snap-align: start;
        cursor: pointer;
        outline: none;
        transition: background-color 150ms ease, transform 150ms ease, border-color 150ms ease;
      }

      .power-card:hover {
        background: var(--col-surface-3);
        border-color: var(--col-border);
        transform: translateY(-3px);
      }

      .power-card:focus-visible { outline: 2px solid var(--col-primary); outline-offset: 2px; }
      .power-card:active { transform: scale(0.96); }

      .power-card__logo-wrap {
        width: 64px;
        height: 64px;
        border-radius: var(--col-radius-md);
        overflow: hidden;
        background: var(--col-surface-1);
      }

      .power-card__logo {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .power-card__name {
        font-size: var(--nxt1-fontSize-base, 15px);
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0;
        text-align: center;
      }

      .power-card__metric {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--col-text-tertiary);
        margin: 0;
        text-align: center;
      }

      .power-card__delta {
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: 900;
        color: var(--col-text-tertiary);
        text-align: center;
      }

      .power-card__delta--pos { color: var(--col-success); }

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
        transition: background-color 150ms ease;
      }

      .activity-card:hover { background: var(--col-surface-2); }
      .activity-card:focus-visible { outline: 2px solid var(--col-primary); outline-offset: 2px; }
      .activity-card:active { transform: scale(0.99); }

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
        border: 2px solid var(--col-bg);
      }

      .activity-card__avatar--athlete { top: 0; left: 0; z-index: 2; }
      .activity-card__avatar--college { top: 4px; left: 16px; z-index: 1; }
      .activity-card__avatar img { width: 100%; height: 100%; object-fit: cover; }

      /* Activity type pill (replaces emoji) */
      .activity-type-pill {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        padding: 3px 8px;
        border-radius: var(--col-radius-full);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        min-width: 48px;
        justify-content: center;
      }

      .activity-type-pill--offer {
        background: color-mix(in srgb, #3b82f6 15%, var(--col-surface-2));
        color: #3b82f6;
        border: 1px solid color-mix(in srgb, #3b82f6 30%, transparent);
      }

      .activity-type-pill--commit {
        background: color-mix(in srgb, var(--col-primary) 15%, var(--col-surface-2));
        color: var(--col-primary);
        border: 1px solid color-mix(in srgb, var(--col-primary) 30%, transparent);
      }

      .activity-type-pill--visit {
        background: color-mix(in srgb, #a855f7 15%, var(--col-surface-2));
        color: #a855f7;
        border: 1px solid color-mix(in srgb, #a855f7 30%, transparent);
      }

      .activity-type-pill--camp {
        background: color-mix(in srgb, var(--col-warning) 15%, var(--col-surface-2));
        color: var(--col-warning);
        border: 1px solid color-mix(in srgb, var(--col-warning) 30%, transparent);
      }

      .activity-card__body { flex: 1; min-width: 0; }

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

      .map-bento__bg { position: absolute; inset: 0; pointer-events: none; }
      .map-bento__svg { width: 100%; height: 100%; color: var(--col-text-secondary); }

      .map-bento__header { position: relative; z-index: 1; margin-bottom: var(--nxt1-spacing-4, 16px); }

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

      .map-bento__logo {
        width: 28px;
        height: 28px;
        border-radius: var(--col-radius-sm);
        object-fit: cover;
        flex-shrink: 0;
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
        transition: background-color 150ms ease, border-color 150ms ease;
      }

      .dna-card:hover { background: var(--col-surface-3); border-color: var(--col-border); }
      .dna-card:focus-visible { outline: 2px solid var(--col-primary); outline-offset: 2px; }

      .dna-card__header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .dna-card__logo-wrap {
        width: 36px;
        height: 36px;
        border-radius: var(--col-radius-sm);
        overflow: hidden;
        flex-shrink: 0;
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

      .dna-card__row { margin-bottom: var(--nxt1-spacing-3, 12px); }
      .dna-card__row:last-child { margin-bottom: 0; }

      .dna-card__label {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--col-text-tertiary);
        margin: 0 0 var(--nxt1-spacing-1, 4px);
      }

      .chip-group { display: flex; flex-wrap: wrap; gap: var(--nxt1-spacing-1, 4px); }

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
        transition: background-color 150ms ease, color 150ms ease;
      }

      .chip:hover { background: var(--col-primary); color: var(--col-on-primary); border-color: var(--col-primary); }

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

      .chip--need { background: var(--col-surface-2); color: var(--col-text-secondary); }

      /* ── NEWS CAROUSEL (Section 6) — uses NewsArticleCardComponent ── */

      .news-carousel {
        display: flex;
        gap: var(--nxt1-spacing-4, 16px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .news-carousel::-webkit-scrollbar { display: none; }

      .news-carousel__item {
        flex-shrink: 0;
        width: 280px;
        scroll-snap-align: start;
      }

      /* ── WATCHLIST ROW (Section 7) — horizontal scroll with star ── */

      .watchlist-row {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .watchlist-row::-webkit-scrollbar { display: none; }

      .watchlist-card {
        flex-shrink: 0;
        position: relative;
        width: 140px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-3, 12px);
        background: var(--col-surface-2);
        border: 1px solid var(--col-border-subtle);
        border-radius: var(--col-radius-lg);
        scroll-snap-align: start;
        cursor: pointer;
        outline: none;
        transition: background-color 150ms ease, transform 150ms ease, border-color 150ms ease;
      }

      .watchlist-card:hover { background: var(--col-surface-3); border-color: var(--col-border); transform: translateY(-2px); }
      .watchlist-card:focus-visible { outline: 2px solid var(--col-primary); outline-offset: 2px; }
      .watchlist-card:active { transform: scale(0.96); }

      /* Star icon — top-right corner */
      .watchlist-card__star {
        position: absolute;
        top: 8px;
        right: 8px;
        color: var(--col-primary);
        width: 14px;
        height: 14px;
        display: flex;
      }

      .watchlist-card__star svg { width: 100%; height: 100%; }

      .watchlist-card__logo-wrap {
        width: 64px;
        height: 64px;
        border-radius: var(--col-radius-md);
        overflow: hidden;
        background: var(--col-surface-1);
      }

      .watchlist-card__logo {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .watchlist-card__name {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .watchlist-card__division {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--col-text-tertiary);
        margin: 0;
        text-align: center;
      }

      /* ── DATABASE LEDGER (Section 8) — card grid ── */

      .ledger-sport-badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: var(--col-radius-full);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 700;
        color: var(--col-primary);
        background: color-mix(in srgb, var(--col-primary) 12%, var(--col-surface-2));
        border: 1px solid color-mix(in srgb, var(--col-primary) 30%, transparent);
      }

      .ledger-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .ledger-card {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--col-surface-2);
        border: 1px solid var(--col-border-subtle);
        border-radius: var(--col-radius-lg);
        transition: background-color 150ms ease, border-color 150ms ease;
      }

      .ledger-card:hover { background: var(--col-surface-3); border-color: var(--col-border); }

      .ledger-card__logo-wrap {
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        border-radius: var(--col-radius-md);
        overflow: hidden;
        background: var(--col-surface-1);
      }

      .ledger-card__logo {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .ledger-card__body { flex: 1; min-width: 0; }

      .ledger-card__top-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }

      .ledger-card__action {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: var(--col-radius-full);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }

      .ledger-card__action--updated {
        background: color-mix(in srgb, var(--col-primary) 15%, var(--col-surface-1));
        color: var(--col-primary);
        border: 1px solid color-mix(in srgb, var(--col-primary) 30%, transparent);
      }

      .ledger-card__action--synced {
        background: color-mix(in srgb, #3b82f6 15%, var(--col-surface-1));
        color: #3b82f6;
        border: 1px solid color-mix(in srgb, #3b82f6 30%, transparent);
      }

      .ledger-card__action--added {
        background: color-mix(in srgb, var(--col-success) 15%, var(--col-surface-1));
        color: var(--col-success);
        border: 1px solid color-mix(in srgb, var(--col-success) 30%, transparent);
      }

      .ledger-card__time {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--col-text-tertiary);
      }

      .ledger-card__college {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: 700;
        color: var(--col-text-primary);
        margin: 0 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ledger-card__desc {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--col-text-secondary);
        margin: 0;
        line-height: 1.4;
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

      .skeleton-bar--heading { width: 160px; }

      .skeleton-row { display: flex; gap: var(--nxt1-spacing-3, 12px); overflow: hidden; }

      .skeleton-power-card { flex-shrink: 0; width: 160px; height: 180px; border-radius: var(--col-radius-lg); }
      .skeleton-dna-card { height: 200px; border-radius: var(--col-radius-lg); min-width: 200px; }
      .skeleton-activity-row { height: 60px; border-radius: var(--col-radius-md); margin-bottom: var(--nxt1-spacing-2, 8px); }
      .skeleton-news-card { flex-shrink: 0; width: 280px; height: 320px; border-radius: var(--col-radius-lg); }
      .skeleton-watchlist-card { flex-shrink: 0; width: 140px; height: 160px; border-radius: var(--col-radius-lg); }
      .skeleton-map { height: 200px; border-radius: var(--col-radius-lg); }
      .skeleton-ledger-card { flex-shrink: 0; width: 260px; height: 100px; border-radius: var(--col-radius-lg); }

      /* ── REDUCED MOTION ── */

      @media (prefers-reduced-motion: reduce) {
        .hero-card,
        .power-card,
        .activity-card,
        .dna-card,
        .watchlist-card,
        .ledger-card,
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
  readonly spotlightArticles = signal<NewsArticle[]>(MOCK_SPOTLIGHT_ARTICLES);
  readonly watchlist = signal<readonly WatchlistItem[]>(MOCK_WATCHLIST);
  readonly ledgerEntries = signal<readonly LedgerEntry[]>(MOCK_LEDGER);

  /** Used to render skeleton placeholder items */
  readonly skeletonItems = Array.from({ length: 4 });

  // ── Helpers ──────────────────────────────────────────────────────────────────

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
