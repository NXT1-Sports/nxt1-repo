/**
 * @fileoverview Explore "Athletes" Elite Dashboard — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * 9-section data-driven talent exchange dashboard for the /explore route.
 * 100% SSR-safe, zero Ionic, pure Tailwind design token classes.
 *
 * Sections:
 *   1. Agent X Prospect Board  — Hero Carousel (not deferred)
 *   2. Stock Watch             — Trending Risers
 *   3. Stat Leaders            — In-Game Performance
 *   4. Film Room               — Trending Highlights
 *   5. Offer & Commitment Tracker
 *   6. Class Rankings          — Top Prospects by Year
 *   7. Scout's Notebook        — Recent Evaluations (Scout Report pattern)
 *   8. The Radar               — Tracked Athletes
 *   9. Uncommitted Board       — Best Available
 *
 * ⭐ WEB ONLY — Pure HTML/Tailwind, Zero Ionic, SSR-optimized ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  afterNextRender,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProspectCard {
  id: string;
  name: string;
  position: string;
  classYear: string;
  sport: string;
  imageUrl: string;
  aiReason: string;
  rating: number;
  topStat: string;
  topStatLabel: string;
  school: string;
}

interface TrendingAthlete {
  id: string;
  name: string;
  position: string;
  avatarUrl: string;
  trendMetric: string;
  trendValue: string;
  classYear: string;
}

interface StatLeader {
  id: string;
  name: string;
  avatarUrl: string;
  statValue: string;
  statLabel: string;
  position: string;
  classYear: string;
}

interface StatCategory {
  id: string;
  label: string;
}

interface HighlightVideo {
  id: string;
  athleteName: string;
  thumbnailUrl: string;
  duration: string;
  views: string;
  sport: string;
  position: string;
}

interface CommitmentEvent {
  id: string;
  athleteName: string;
  athleteAvatar: string;
  collegeName: string;
  collegeLogoUrl: string;
  eventType: 'offer' | 'commit';
  sport: string;
  position: string;
  classYear: string;
  timeAgo: string;
}

interface ClassRankEntry {
  id: string;
  rank: number;
  rankDelta: number;
  name: string;
  avatarUrl: string;
  position: string;
  classYear: string;
  stars: number;
  school: string;
}

interface ScoutNotebookEntry {
  id: string;
  athleteName: string;
  avatarUrl: string;
  position: string;
  classYear: string;
  school: string;
  rating: number;
  ratingLabel: string;
  summarySnippet: string;
  publishedAgo: string;
  highlights: string[];
  isVerified: boolean;
}

interface TrackedAthlete {
  id: string;
  name: string;
  avatarUrl: string;
  position: string;
  classYear: string;
  latestUpdate: string;
  updateType: 'video' | 'offer' | 'commit' | 'ranking';
  updateTime: string;
}

interface UncommittedAthlete {
  id: string;
  name: string;
  avatarUrl: string;
  position: string;
  classYear: string;
  rating: number;
  stars: number;
  topOfferLogos: string[];
  decisionTimeline: string | null;
  school: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PROSPECTS: ProspectCard[] = [
  {
    id: 'p1',
    name: 'Jaylen Carter',
    position: 'PG',
    classYear: "'26",
    sport: 'Basketball',
    imageUrl:
      'https://ui-avatars.com/api/?name=Jaylen+Carter&size=400&background=161616&color=ccff00',
    aiReason: '✨ Fits your PG roster need',
    rating: 97,
    topStat: '24.3',
    topStatLabel: 'PPG',
    school: 'Oak Hill Academy',
  },
  {
    id: 'p2',
    name: 'Marcus Webb',
    position: 'QB',
    classYear: "'27",
    sport: 'Football',
    imageUrl:
      'https://ui-avatars.com/api/?name=Marcus+Webb&size=400&background=161616&color=ccff00',
    aiReason: '✨ Top uncommitted target',
    rating: 95,
    topStat: '3,840',
    topStatLabel: 'Pass Yds',
    school: 'IMG Academy',
  },
  {
    id: 'p3',
    name: 'Devon Osei',
    position: 'SF',
    classYear: "'26",
    sport: 'Basketball',
    imageUrl: 'https://ui-avatars.com/api/?name=Devon+Osei&size=400&background=161616&color=ccff00',
    aiReason: '✨ Trending in your region',
    rating: 93,
    topStat: '18.7',
    topStatLabel: 'PPG',
    school: 'Montverde Academy',
  },
  {
    id: 'p4',
    name: 'Isaiah Trout',
    position: 'CB',
    classYear: "'27",
    sport: 'Football',
    imageUrl:
      'https://ui-avatars.com/api/?name=Isaiah+Trout&size=400&background=161616&color=ccff00',
    aiReason: '✨ Matches your CB search',
    rating: 91,
    topStat: '8',
    topStatLabel: 'INT',
    school: 'St. Frances Academy',
  },
  {
    id: 'p5',
    name: 'Keanu Rivers',
    position: 'C',
    classYear: "'26",
    sport: 'Basketball',
    imageUrl:
      'https://ui-avatars.com/api/?name=Keanu+Rivers&size=400&background=161616&color=ccff00',
    aiReason: '✨ High upside center',
    rating: 90,
    topStat: '12.1',
    topStatLabel: 'RPG',
    school: 'La Lumiere School',
  },
];

const MOCK_TRENDING: TrendingAthlete[] = [
  {
    id: 't1',
    name: 'Aaliyah Brooks',
    position: 'WR',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Aaliyah+Brooks&size=80&background=1a1a1a&color=ccff00',
    trendMetric: '📈 +312 Profile Views',
    trendValue: '+312',
    classYear: "'26",
  },
  {
    id: 't2',
    name: 'Trent Davis',
    position: 'PF',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Trent+Davis&size=80&background=1a1a1a&color=ccff00',
    trendMetric: '📈 +240 Views',
    trendValue: '+240',
    classYear: "'27",
  },
  {
    id: 't3',
    name: 'Nadia Ellis',
    position: 'SS',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Nadia+Ellis&size=80&background=1a1a1a&color=ccff00',
    trendMetric: '📈 +185 Views',
    trendValue: '+185',
    classYear: "'26",
  },
  {
    id: 't4',
    name: 'Kofi Acheampong',
    position: 'OT',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Kofi+Acheampong&size=80&background=1a1a1a&color=ccff00',
    trendMetric: '📈 +156 Views',
    trendValue: '+156',
    classYear: "'27",
  },
  {
    id: 't5',
    name: 'Simone Grant',
    position: 'SG',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Simone+Grant&size=80&background=1a1a1a&color=ccff00',
    trendMetric: '📈 +141 Views',
    trendValue: '+141',
    classYear: "'26",
  },
  {
    id: 't6',
    name: 'Elijah Nash',
    position: 'DE',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Elijah+Nash&size=80&background=1a1a1a&color=ccff00',
    trendMetric: '📈 +120 Views',
    trendValue: '+120',
    classYear: "'27",
  },
];

const MOCK_STAT_CATEGORIES: StatCategory[] = [
  { id: 'pts', label: 'Points' },
  { id: 'reb', label: 'Rebounds' },
  { id: 'ast', label: 'Assists' },
  { id: 'passyds', label: 'Pass Yds' },
  { id: 'rushyds', label: 'Rush Yds' },
  { id: 'goals', label: 'Goals' },
];

const MOCK_STAT_LEADERS: StatLeader[] = [
  {
    id: 'sl1',
    name: 'Jordan Mills',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Jordan+Mills&size=56&background=161616&color=ccff00',
    statValue: '34.2',
    statLabel: 'PPG',
    position: 'SG',
    classYear: "'26",
  },
  {
    id: 'sl2',
    name: 'Caleb Stone',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Caleb+Stone&size=56&background=161616&color=ccff00',
    statValue: '28.9',
    statLabel: 'PPG',
    position: 'SF',
    classYear: "'27",
  },
  {
    id: 'sl3',
    name: 'Amara Diallo',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Amara+Diallo&size=56&background=161616&color=ccff00',
    statValue: '18.4',
    statLabel: 'PPG',
    position: 'PF',
    classYear: "'26",
  },
  {
    id: 'sl4',
    name: 'Ryan Cole',
    avatarUrl: 'https://ui-avatars.com/api/?name=Ryan+Cole&size=56&background=161616&color=ccff00',
    statValue: '14.1',
    statLabel: 'PPG',
    position: 'C',
    classYear: "'27",
  },
];

const MOCK_HIGHLIGHTS: HighlightVideo[] = [
  {
    id: 'h1',
    athleteName: 'Jaylen Carter',
    thumbnailUrl: 'https://ui-avatars.com/api/?name=JC&size=200&background=0a0a0a&color=ccff00',
    duration: '2:34',
    views: '12.4K',
    sport: 'Basketball',
    position: 'PG',
  },
  {
    id: 'h2',
    athleteName: 'Marcus Webb',
    thumbnailUrl: 'https://ui-avatars.com/api/?name=MW&size=200&background=0a0a0a&color=ccff00',
    duration: '3:10',
    views: '9.8K',
    sport: 'Football',
    position: 'QB',
  },
  {
    id: 'h3',
    athleteName: 'Aaliyah Brooks',
    thumbnailUrl: 'https://ui-avatars.com/api/?name=AB&size=200&background=0a0a0a&color=ccff00',
    duration: '1:58',
    views: '7.2K',
    sport: 'Football',
    position: 'WR',
  },
  {
    id: 'h4',
    athleteName: 'Devon Osei',
    thumbnailUrl: 'https://ui-avatars.com/api/?name=DO&size=200&background=0a0a0a&color=ccff00',
    duration: '2:45',
    views: '6.5K',
    sport: 'Basketball',
    position: 'SF',
  },
];

const MOCK_COMMITMENTS: CommitmentEvent[] = [
  {
    id: 'c1',
    athleteName: 'Zion Harper',
    athleteAvatar:
      'https://ui-avatars.com/api/?name=Zion+Harper&size=48&background=161616&color=ccff00',
    collegeName: 'Duke University',
    collegeLogoUrl: 'https://ui-avatars.com/api/?name=Duke&size=48&background=012169&color=ffffff',
    eventType: 'commit',
    sport: 'Basketball',
    position: 'SF',
    classYear: "'26",
    timeAgo: '2h ago',
  },
  {
    id: 'c2',
    athleteName: 'Priya Mehta',
    athleteAvatar:
      'https://ui-avatars.com/api/?name=Priya+Mehta&size=48&background=161616&color=ccff00',
    collegeName: 'Ohio State',
    collegeLogoUrl: 'https://ui-avatars.com/api/?name=OSU&size=48&background=bb0000&color=ffffff',
    eventType: 'offer',
    sport: 'Soccer',
    position: 'MF',
    classYear: "'27",
    timeAgo: '4h ago',
  },
  {
    id: 'c3',
    athleteName: 'Dante Powell',
    athleteAvatar:
      'https://ui-avatars.com/api/?name=Dante+Powell&size=48&background=161616&color=ccff00',
    collegeName: 'Alabama',
    collegeLogoUrl: 'https://ui-avatars.com/api/?name=BAMA&size=48&background=9e1b32&color=ffffff',
    eventType: 'commit',
    sport: 'Football',
    position: 'RB',
    classYear: "'26",
    timeAgo: '6h ago',
  },
  {
    id: 'c4',
    athleteName: 'Leila Okonkwo',
    athleteAvatar:
      'https://ui-avatars.com/api/?name=Leila+Okonkwo&size=48&background=161616&color=ccff00',
    collegeName: 'UCLA',
    collegeLogoUrl: 'https://ui-avatars.com/api/?name=UCLA&size=48&background=2774ae&color=ffffff',
    eventType: 'offer',
    sport: 'Track',
    position: 'Sprinter',
    classYear: "'27",
    timeAgo: '8h ago',
  },
];

const MOCK_CLASS_RANKINGS: ClassRankEntry[] = [
  {
    id: 'r1',
    rank: 1,
    rankDelta: 0,
    name: 'Jaylen Carter',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Jaylen+Carter&size=44&background=161616&color=ccff00',
    position: 'PG',
    classYear: "'26",
    stars: 5,
    school: 'Oak Hill Academy',
  },
  {
    id: 'r2',
    rank: 2,
    rankDelta: 1,
    name: 'Marcus Webb',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Marcus+Webb&size=44&background=161616&color=ccff00',
    position: 'QB',
    classYear: "'26",
    stars: 5,
    school: 'IMG Academy',
  },
  {
    id: 'r3',
    rank: 3,
    rankDelta: -1,
    name: 'Devon Osei',
    avatarUrl: 'https://ui-avatars.com/api/?name=Devon+Osei&size=44&background=161616&color=ccff00',
    position: 'SF',
    classYear: "'26",
    stars: 5,
    school: 'Montverde',
  },
  {
    id: 'r4',
    rank: 4,
    rankDelta: 2,
    name: 'Aaliyah Brooks',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Aaliyah+Brooks&size=44&background=161616&color=ccff00',
    position: 'WR',
    classYear: "'26",
    stars: 4,
    school: 'St. Frances',
  },
  {
    id: 'r5',
    rank: 5,
    rankDelta: 0,
    name: 'Isaiah Trout',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Isaiah+Trout&size=44&background=161616&color=ccff00',
    position: 'CB',
    classYear: "'26",
    stars: 4,
    school: 'St. Frances Academy',
  },
];

const MOCK_SCOUT_NOTEBOOK: ScoutNotebookEntry[] = [
  {
    id: 'sn1',
    athleteName: 'Jordan Mills',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Jordan+Mills&size=56&background=161616&color=ccff00',
    position: 'SG',
    classYear: "'26",
    school: 'Christ the King HS',
    rating: 9.2,
    ratingLabel: 'Elite',
    summarySnippet:
      'Mills possesses elite shot creation ability with a quick first step that consistently generates separation. His pull-up jumper is NBA-ready.',
    publishedAgo: '1d ago',
    highlights: ['Elite shot creation', 'NBA-ready handle'],
    isVerified: true,
  },
  {
    id: 'sn2',
    athleteName: 'Caleb Stone',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Caleb+Stone&size=56&background=161616&color=ccff00',
    position: 'SF',
    classYear: "'27",
    school: 'La Lumiere School',
    rating: 8.8,
    ratingLabel: 'Blue Chip',
    summarySnippet:
      'Versatile wing with elite defensive instincts and the ability to guard multiple positions. Motor is exceptional — never takes a play off.',
    publishedAgo: '2d ago',
    highlights: ['Elite defensive versatility', 'Exceptional motor'],
    isVerified: true,
  },
  {
    id: 'sn3',
    athleteName: 'Marcus Webb',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Marcus+Webb&size=56&background=161616&color=ccff00',
    position: 'QB',
    classYear: "'27",
    school: 'IMG Academy',
    rating: 9.5,
    ratingLabel: 'Elite',
    summarySnippet:
      "Webb's arm talent is generational. Throws with precision on deep routes and operates the RPO with veteran-level poise.",
    publishedAgo: '3d ago',
    highlights: ['Generational arm talent', 'Elite RPO operator'],
    isVerified: true,
  },
];

const MOCK_TRACKED: TrackedAthlete[] = [
  {
    id: 'tr1',
    name: 'Jaylen Carter',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Jaylen+Carter&size=44&background=161616&color=ccff00',
    position: 'PG',
    classYear: "'26",
    latestUpdate: 'Uploaded new highlight reel',
    updateType: 'video',
    updateTime: '1h ago',
  },
  {
    id: 'tr2',
    name: 'Marcus Webb',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Marcus+Webb&size=44&background=161616&color=ccff00',
    position: 'QB',
    classYear: "'27",
    latestUpdate: 'Received offer from Ohio State',
    updateType: 'offer',
    updateTime: '3h ago',
  },
  {
    id: 'tr3',
    name: 'Aaliyah Brooks',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Aaliyah+Brooks&size=44&background=161616&color=ccff00',
    position: 'WR',
    classYear: "'26",
    latestUpdate: 'Moved to #4 in Class Rankings',
    updateType: 'ranking',
    updateTime: '5h ago',
  },
  {
    id: 'tr4',
    name: 'Zion Harper',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Zion+Harper&size=44&background=161616&color=ccff00',
    position: 'SF',
    classYear: "'26",
    latestUpdate: 'Committed to Duke University',
    updateType: 'commit',
    updateTime: '2h ago',
  },
];

const MOCK_UNCOMMITTED: UncommittedAthlete[] = [
  {
    id: 'u1',
    name: 'Jaylen Carter',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Jaylen+Carter&size=56&background=161616&color=ccff00',
    position: 'PG',
    classYear: "'26",
    rating: 97,
    stars: 5,
    topOfferLogos: [
      'https://ui-avatars.com/api/?name=UK&size=32&background=0033a0&color=ffffff',
      'https://ui-avatars.com/api/?name=UNC&size=32&background=7bafd4&color=ffffff',
      'https://ui-avatars.com/api/?name=KU&size=32&background=003f87&color=ffffff',
      'https://ui-avatars.com/api/?name=UConn&size=32&background=002868&color=ffffff',
    ],
    decisionTimeline: 'Decision by Apr 15',
    school: 'Oak Hill Academy',
  },
  {
    id: 'u2',
    name: 'Devon Osei',
    avatarUrl: 'https://ui-avatars.com/api/?name=Devon+Osei&size=56&background=161616&color=ccff00',
    position: 'SF',
    classYear: "'26",
    rating: 93,
    stars: 5,
    topOfferLogos: [
      'https://ui-avatars.com/api/?name=UCLA&size=32&background=2774ae&color=ffffff',
      'https://ui-avatars.com/api/?name=USC&size=32&background=99000a&color=ffffff',
      'https://ui-avatars.com/api/?name=GT&size=32&background=b3a369&color=ffffff',
    ],
    decisionTimeline: null,
    school: 'Montverde Academy',
  },
  {
    id: 'u3',
    name: 'Isaiah Trout',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Isaiah+Trout&size=56&background=161616&color=ccff00',
    position: 'CB',
    classYear: "'27",
    rating: 91,
    stars: 5,
    topOfferLogos: [
      'https://ui-avatars.com/api/?name=BAMA&size=32&background=9e1b32&color=ffffff',
      'https://ui-avatars.com/api/?name=UGA&size=32&background=ba0c2f&color=ffffff',
      'https://ui-avatars.com/api/?name=LSU&size=32&background=461d7c&color=fdd023',
    ],
    decisionTimeline: 'Decision by May 1',
    school: 'St. Frances Academy',
  },
  {
    id: 'u4',
    name: 'Aaliyah Brooks',
    avatarUrl:
      'https://ui-avatars.com/api/?name=Aaliyah+Brooks&size=56&background=161616&color=ccff00',
    position: 'WR',
    classYear: "'26",
    rating: 89,
    stars: 4,
    topOfferLogos: [
      'https://ui-avatars.com/api/?name=Ohio&size=32&background=bb0000&color=ffffff',
      'https://ui-avatars.com/api/?name=PSU&size=32&background=041e42&color=ffffff',
    ],
    decisionTimeline: null,
    school: 'St. Frances Academy',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'nxt1-explore-athletes-web',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="athletes-dashboard" aria-label="Athletes Elite Dashboard">
      <!-- ═══════════════════════════════════════════════════════════
           SECTION 1: AGENT X PROSPECT BOARD — Hero Carousel
           NOT deferred — instant LCP
           ═══════════════════════════════════════════════════════════ -->
      <section class="section" aria-labelledby="s1-title">
        <header class="section__header">
          <h2 id="s1-title" class="section__title">
            <span class="text-primary mr-1">⚡</span>Agent X Prospect Board
          </h2>
          <button type="button" class="see-all-btn" aria-label="See all prospects">
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

        <!-- Hero snap-scroll carousel -->
        <div class="hero-scroll" role="list" aria-label="Top prospects" (scroll)="onHeroScroll()">
          @for (card of prospects(); track card.id) {
            <article
              class="hero-card group"
              role="listitem"
              tabindex="0"
              [attr.aria-label]="card.name + ', ' + card.position + ', Class ' + card.classYear"
              (click)="onProspectClick(card)"
              (keydown.enter)="onProspectClick(card)"
              (keydown.space)="$event.preventDefault(); onProspectClick(card)"
            >
              <!-- Cinematic background -->
              <div class="hero-card__bg" aria-hidden="true">
                <img
                  [src]="card.imageUrl"
                  [alt]="card.name"
                  class="hero-card__img"
                  loading="eager"
                  width="300"
                  height="400"
                />
                <!-- Gradient overlay -->
                <div class="hero-card__overlay" aria-hidden="true"></div>
              </div>

              <!-- Frosted glass info panel -->
              <div class="hero-card__glass">
                <!-- AI Reasoning Badge -->
                <div class="ai-badge" role="note" [attr.aria-label]="card.aiReason">
                  {{ card.aiReason }}
                </div>

                <h3 class="hero-card__name text-text-inverse">{{ card.name }}</h3>

                <div class="hero-card__meta">
                  <span class="text-text-inverse/80 text-xs font-medium">{{ card.position }}</span>
                  <span class="text-text-inverse/50 text-xs">·</span>
                  <span class="text-text-inverse/80 text-xs">Class {{ card.classYear }}</span>
                  <span class="text-text-inverse/50 text-xs">·</span>
                  <span class="text-text-inverse/60 text-xs">{{ card.school }}</span>
                </div>

                <div class="hero-card__stats">
                  <div class="hero-card__stat">
                    <span class="text-primary text-xl leading-none font-bold">{{
                      card.topStat
                    }}</span>
                    <span class="text-text-inverse/60 text-xs">{{ card.topStatLabel }}</span>
                  </div>
                  <div class="hero-card__rating-badge" [attr.aria-label]="'Rating ' + card.rating">
                    <span class="text-text-inverse text-sm font-bold">{{ card.rating }}</span>
                  </div>
                </div>
              </div>
            </article>
          }
        </div>

        <!-- Scroll indicators -->
        <div class="scroll-dots" role="tablist" aria-label="Prospect carousel position">
          @for (card of prospects(); track card.id; let i = $index) {
            <div
              class="scroll-dot"
              [class.scroll-dot--active]="activeHeroIndex() === i"
              role="tab"
              [attr.aria-selected]="activeHeroIndex() === i"
              [attr.aria-label]="'Prospect ' + (i + 1)"
            ></div>
          }
        </div>
      </section>

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 2: STOCK WATCH — Trending Risers (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="s2-title">
          <header class="section__header">
            <h2 id="s2-title" class="section__title"><span class="mr-1">📈</span>Stock Watch</h2>
            <button type="button" class="see-all-btn" aria-label="See all trending athletes">
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

          <div class="h-scroll" role="list" aria-label="Trending athletes">
            @for (athlete of trendingAthletes(); track athlete.id) {
              <article
                class="trend-card bg-surface-200 border-border-subtle group border"
                role="listitem"
                tabindex="0"
                [attr.aria-label]="athlete.name + ' trending ' + athlete.trendMetric"
                (click)="onAthleteClick(athlete.id)"
                (keydown.enter)="onAthleteClick(athlete.id)"
                (keydown.space)="$event.preventDefault(); onAthleteClick(athlete.id)"
              >
                <img
                  [src]="athlete.avatarUrl"
                  [alt]="athlete.name"
                  class="trend-card__avatar"
                  width="56"
                  height="56"
                  loading="lazy"
                />
                <p class="trend-card__name text-text-primary">{{ athlete.name }}</p>
                <p class="trend-card__pos text-text-tertiary">
                  {{ athlete.position }} · {{ athlete.classYear }}
                </p>
                <p class="trend-card__metric text-success mt-1 text-xs font-semibold">
                  {{ athlete.trendMetric }}
                </p>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <section class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-40 rounded-lg"></div>
          </div>
          <div class="h-scroll">
            @for (i of skeletonItems5; track i) {
              <div
                class="trend-card bg-surface-300 border-border-subtle animate-pulse border"
              ></div>
            }
          </div>
        </section>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 3: STAT LEADERS — In-Game Performance (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="s3-title">
          <header class="section__header">
            <h2 id="s3-title" class="section__title"><span class="mr-1">🏆</span>Stat Leaders</h2>
            <button type="button" class="see-all-btn" aria-label="See all stat leaders">
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

          <!-- Filter chip cluster -->
          <div class="chip-row" role="group" aria-label="Filter by stat category">
            @for (cat of statCategories(); track cat.id) {
              <button
                type="button"
                class="chip bg-surface-200 text-text-secondary"
                [class.chip--active]="activeStatCategory() === cat.id"
                [attr.aria-pressed]="activeStatCategory() === cat.id"
                (click)="setStatCategory(cat.id)"
              >
                {{ cat.label }}
              </button>
            }
          </div>

          <!-- Bento box grid -->
          <div class="stat-grid" role="list" aria-label="Stat leaders">
            @for (leader of statLeaders(); track leader.id; let i = $index) {
              <article
                class="stat-box bg-surface-100 border-border-subtle group border"
                role="listitem"
                tabindex="0"
                [attr.aria-label]="leader.name + ', ' + leader.statValue + ' ' + leader.statLabel"
                (click)="onAthleteClick(leader.id)"
                (keydown.enter)="onAthleteClick(leader.id)"
                (keydown.space)="$event.preventDefault(); onAthleteClick(leader.id)"
              >
                <div class="stat-box__rank text-text-tertiary text-xs font-bold">#{{ i + 1 }}</div>
                <img
                  [src]="leader.avatarUrl"
                  [alt]="leader.name"
                  class="stat-box__avatar"
                  width="40"
                  height="40"
                  loading="lazy"
                />
                <div class="stat-box__info">
                  <p class="stat-box__name text-text-primary truncate text-xs font-semibold">
                    {{ leader.name }}
                  </p>
                  <p class="text-text-tertiary text-xs">
                    {{ leader.position }} · {{ leader.classYear }}
                  </p>
                </div>
                <div class="stat-box__stat">
                  <span class="text-primary text-lg leading-none font-bold">{{
                    leader.statValue
                  }}</span>
                  <span class="text-text-tertiary text-2xs block">{{ leader.statLabel }}</span>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <section class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-36 rounded-lg"></div>
          </div>
          <div class="stat-grid">
            @for (i of skeletonItems4; track i) {
              <div class="stat-box bg-surface-300 border-border-subtle animate-pulse border"></div>
            }
          </div>
        </section>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 4: FILM ROOM — Trending Highlights (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="s4-title">
          <header class="section__header">
            <h2 id="s4-title" class="section__title"><span class="mr-1">🎬</span>Film Room</h2>
            <button type="button" class="see-all-btn" aria-label="See all highlight videos">
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

          <div class="h-scroll" role="list" aria-label="Trending highlight videos">
            @for (video of highlights(); track video.id) {
              <article
                class="video-card bg-bg-primary group"
                role="listitem"
                tabindex="0"
                [attr.aria-label]="video.athleteName + ' highlight tape'"
                (click)="onVideoClick(video)"
                (keydown.enter)="onVideoClick(video)"
                (keydown.space)="$event.preventDefault(); onVideoClick(video)"
              >
                <!-- Thumbnail -->
                <div class="video-card__thumb">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.athleteName + ' highlight thumbnail'"
                    class="video-card__img"
                    width="220"
                    height="124"
                    loading="lazy"
                  />
                  <!-- Play overlay -->
                  <div class="video-card__play-overlay" aria-hidden="true">
                    <svg class="video-card__play-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <!-- Duration badge -->
                  <span class="video-card__duration" aria-label="Duration {{ video.duration }}">{{
                    video.duration
                  }}</span>
                </div>

                <!-- Info + CTA overlay -->
                <div class="video-card__info">
                  <p class="video-card__athlete text-text-inverse truncate text-sm font-semibold">
                    {{ video.athleteName }}
                  </p>
                  <div class="video-card__footer">
                    <span class="text-text-inverse/60 text-xs"
                      >{{ video.position }} · {{ video.sport }}</span
                    >
                    <button
                      type="button"
                      class="watch-tape-btn"
                      [attr.aria-label]="'Watch ' + video.athleteName + ' tape'"
                      (click)="$event.stopPropagation(); onWatchTape(video)"
                    >
                      Watch Tape
                    </button>
                  </div>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <section class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-32 rounded-lg"></div>
          </div>
          <div class="h-scroll">
            @for (i of skeletonItems4; track i) {
              <div class="video-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </section>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 5: OFFER & COMMITMENT TRACKER (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="s5-title">
          <header class="section__header">
            <h2 id="s5-title" class="section__title">
              <span class="mr-1">🏫</span>Offer &amp; Commitment Tracker
            </h2>
            <button type="button" class="see-all-btn" aria-label="See all offers and commitments">
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

          <ul class="commitment-feed" role="feed" aria-label="Recent offers and commitments">
            @for (event of commitments(); track event.id) {
              <li
                class="commitment-card bg-surface-100 border-border border"
                [attr.aria-label]="
                  event.athleteName +
                  ' ' +
                  (event.eventType === 'commit' ? 'committed to' : 'received offer from') +
                  ' ' +
                  event.collegeName
                "
              >
                <!-- Avatar + logo overlap -->
                <div class="commitment-card__avatars" aria-hidden="true">
                  <img
                    [src]="event.athleteAvatar"
                    [alt]=""
                    class="commitment-card__athlete-img border-bg-primary border-2"
                    width="44"
                    height="44"
                    loading="lazy"
                  />
                  <img
                    [src]="event.collegeLogoUrl"
                    [alt]=""
                    class="commitment-card__college-img border-bg-primary border-2"
                    width="32"
                    height="32"
                    loading="lazy"
                  />
                </div>

                <div class="commitment-card__body">
                  <p class="text-text-primary text-sm font-semibold">{{ event.athleteName }}</p>
                  <p class="text-text-secondary text-xs">
                    <span class="commitment-card__icon" aria-hidden="true">
                      {{ event.eventType === 'commit' ? '🤝' : '📣' }}
                    </span>
                    {{ event.eventType === 'commit' ? 'Committed to' : 'Received offer from' }}
                    <strong class="text-text-primary">{{ event.collegeName }}</strong>
                  </p>
                  <p class="text-text-tertiary text-xs">
                    {{ event.position }} · {{ event.classYear }} · {{ event.sport }}
                  </p>
                </div>

                <time
                  class="commitment-card__time text-text-tertiary text-xs"
                  [attr.datetime]="event.timeAgo"
                >
                  {{ event.timeAgo }}
                </time>
              </li>
            }
          </ul>
        </section>
      } @placeholder {
        <section class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-52 rounded-lg"></div>
          </div>
          <div class="flex flex-col gap-2 px-6">
            @for (i of skeletonItems4; track i) {
              <div
                class="commitment-card bg-surface-300 border-border-subtle h-16 animate-pulse border"
              ></div>
            }
          </div>
        </section>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 6: CLASS RANKINGS (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="s6-title">
          <header class="section__header">
            <h2 id="s6-title" class="section__title"><span class="mr-1">🎖️</span>Class Rankings</h2>
            <button type="button" class="see-all-btn" aria-label="See full class rankings">
              Full Board
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

          <!-- Class year tabs -->
          <div class="chip-row" role="group" aria-label="Select class year">
            @for (year of classYears(); track year) {
              <button
                type="button"
                class="chip bg-surface-200 text-text-secondary"
                [class.chip--active]="activeClassYear() === year"
                [attr.aria-pressed]="activeClassYear() === year"
                (click)="setClassYear(year)"
              >
                Class of {{ year }}
              </button>
            }
          </div>

          <!-- Rankings list -->
          <ul
            class="rankings-list bg-surface-200"
            aria-label="Class of {{ activeClassYear() }} rankings"
          >
            @for (entry of classRankings(); track entry.id) {
              <li
                class="ranking-row border-border-subtle border-b last:border-b-0"
                tabindex="0"
                [attr.aria-label]="'#' + entry.rank + ' ' + entry.name + ', ' + entry.position"
                (click)="onAthleteClick(entry.id)"
                (keydown.enter)="onAthleteClick(entry.id)"
                (keydown.space)="$event.preventDefault(); onAthleteClick(entry.id)"
              >
                <!-- Rank number -->
                <div class="ranking-row__rank" aria-hidden="true">
                  <span class="text-text-tertiary text-sm font-bold">#{{ entry.rank }}</span>
                  @if (entry.rankDelta !== 0) {
                    <span
                      class="ranking-row__delta text-xs"
                      [class.text-success]="entry.rankDelta > 0"
                      [class.text-error]="entry.rankDelta < 0"
                      [attr.aria-label]="
                        (entry.rankDelta > 0 ? 'Up' : 'Down') + ' ' + Math.abs(entry.rankDelta)
                      "
                    >
                      {{ entry.rankDelta > 0 ? '▲' : '▼' }}{{ Math.abs(entry.rankDelta) }}
                    </span>
                  }
                </div>

                <img
                  [src]="entry.avatarUrl"
                  [alt]="entry.name"
                  class="ranking-row__avatar"
                  width="36"
                  height="36"
                  loading="lazy"
                />

                <div class="ranking-row__info">
                  <p class="text-text-primary text-sm font-semibold">{{ entry.name }}</p>
                  <p class="text-text-tertiary text-xs">
                    {{ entry.position }} · {{ entry.school }}
                  </p>
                </div>

                <!-- Stars -->
                <div
                  class="ranking-row__stars"
                  [attr.aria-label]="entry.stars + ' stars'"
                  role="img"
                >
                  @for (s of getStarArray(entry.stars); track $index) {
                    <span class="text-primary text-xs" aria-hidden="true">★</span>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      } @placeholder {
        <section class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-40 rounded-lg"></div>
          </div>
          <div class="bg-surface-300 mx-6 h-64 animate-pulse rounded-xl"></div>
        </section>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 7: SCOUT'S NOTEBOOK — Recent Evaluations (deferred)
           Explicitly reuses Scout Report card design patterns.
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="s7-title">
          <header class="section__header">
            <h2 id="s7-title" class="section__title">
              <span class="mr-1">📋</span>Scout's Notebook
            </h2>
            <button type="button" class="see-all-btn" aria-label="See all scout reports">
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

          <!-- Scout Report card pattern (matches scout-report-card.component.ts architecture) -->
          <ul class="scout-list" role="list" aria-label="Recent scout evaluations">
            @for (entry of scoutNotebook(); track entry.id) {
              <li
                class="scout-card bg-surface-100 border-border-subtle border-b last:border-b-0"
                tabindex="0"
                role="article"
                [attr.aria-label]="'Scout report: ' + entry.athleteName + ', rated ' + entry.rating"
                (click)="onScoutReportClick(entry)"
                (keydown.enter)="onScoutReportClick(entry)"
                (keydown.space)="$event.preventDefault(); onScoutReportClick(entry)"
              >
                <!-- Image section (mirrors scout-card__image-container) -->
                <div class="scout-card__media" aria-hidden="true">
                  <img
                    [src]="entry.avatarUrl"
                    [alt]=""
                    class="scout-card__photo"
                    width="56"
                    height="56"
                    loading="lazy"
                  />
                  @if (entry.isVerified) {
                    <div
                      class="scout-card__verified-badge"
                      title="Verified Scout Report"
                      aria-label="Verified"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        class="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  }
                </div>

                <!-- Content section (mirrors scout-card__content) -->
                <div class="scout-card__body">
                  <!-- Name + chips row (mirrors scout-card__name + scout-card__chips) -->
                  <div class="scout-card__title-row">
                    <h3 class="scout-card__name text-text-primary text-sm font-semibold">
                      {{ entry.athleteName }}
                    </h3>
                    <!-- Rating badge (mirrors scout-card__rating) -->
                    <div
                      class="scout-card__rating-badge"
                      [attr.aria-label]="'Rating ' + entry.rating + ' ' + entry.ratingLabel"
                    >
                      <span class="text-primary text-sm font-bold">{{ entry.rating }}</span>
                      <span class="text-text-tertiary text-2xs">{{ entry.ratingLabel }}</span>
                    </div>
                  </div>

                  <!-- Position chips (mirrors scout-card__chips) -->
                  <div class="scout-card__chips-row">
                    <span class="scout-chip">{{ entry.position }}</span>
                    <span class="scout-chip">{{ entry.classYear }}</span>
                    <span class="scout-chip text-text-tertiary">{{ entry.school }}</span>
                  </div>

                  <!-- Summary snippet (mirrors scout-card__summary) -->
                  <p class="scout-card__summary text-text-secondary line-clamp-2 text-xs">
                    {{ entry.summarySnippet }}
                  </p>

                  <!-- Highlights (mirrors scout-card__highlights) -->
                  <div class="scout-card__highlights">
                    @for (h of entry.highlights; track $index) {
                      <div class="scout-highlight">
                        <!-- trending-up icon (matches scout-card component) -->
                        <svg
                          class="scout-highlight__icon"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                          />
                        </svg>
                        <span class="text-text-secondary text-xs">{{ h }}</span>
                      </div>
                    }
                  </div>

                  <!-- Footer (mirrors scout-card__footer) -->
                  <div class="scout-card__footer">
                    <time class="text-text-tertiary text-xs" [attr.datetime]="entry.publishedAgo">
                      {{ entry.publishedAgo }}
                    </time>
                    <button
                      type="button"
                      class="read-report-btn text-primary text-xs font-semibold"
                      [attr.aria-label]="'Read full report for ' + entry.athleteName"
                      (click)="$event.stopPropagation(); onScoutReportClick(entry)"
                    >
                      Read Report →
                    </button>
                  </div>
                </div>
              </li>
            }
          </ul>
        </section>
      } @placeholder {
        <section class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-44 rounded-lg"></div>
          </div>
          <div class="flex flex-col gap-0">
            @for (i of skeletonItems3; track i) {
              <div
                class="scout-card bg-surface-300 border-border-subtle h-24 animate-pulse border-b"
              ></div>
            }
          </div>
        </section>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 8: THE RADAR — Tracked Athletes (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="s8-title">
          <header class="section__header">
            <h2 id="s8-title" class="section__title"><span class="mr-1">📡</span>The Radar</h2>
            <button type="button" class="see-all-btn" aria-label="See all tracked athletes">
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

          <ul class="radar-list" role="list" aria-label="Your tracked athletes">
            @for (athlete of trackedAthletes(); track athlete.id) {
              <li
                class="radar-card bg-surface-200 border-primary border-l-4"
                tabindex="0"
                [attr.aria-label]="athlete.name + ': ' + athlete.latestUpdate"
                (click)="onAthleteClick(athlete.id)"
                (keydown.enter)="onAthleteClick(athlete.id)"
                (keydown.space)="$event.preventDefault(); onAthleteClick(athlete.id)"
              >
                <img
                  [src]="athlete.avatarUrl"
                  [alt]="athlete.name"
                  class="radar-card__avatar"
                  width="36"
                  height="36"
                  loading="lazy"
                />
                <div class="radar-card__info">
                  <p class="text-text-primary text-sm font-semibold">{{ athlete.name }}</p>
                  <p class="text-text-tertiary text-xs">
                    {{ athlete.position }} · {{ athlete.classYear }}
                  </p>
                  <p class="text-text-secondary mt-0.5 text-xs">{{ athlete.latestUpdate }}</p>
                </div>
                <time
                  class="radar-card__time text-text-tertiary text-xs"
                  [attr.datetime]="athlete.updateTime"
                >
                  {{ athlete.updateTime }}
                </time>
              </li>
            }
          </ul>
        </section>
      } @placeholder {
        <section class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-32 rounded-lg"></div>
          </div>
          <div class="flex flex-col gap-2 px-6">
            @for (i of skeletonItems4; track i) {
              <div class="radar-card bg-surface-300 h-14 animate-pulse"></div>
            }
          </div>
        </section>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 9: UNCOMMITTED BOARD — Best Available (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section section--last" aria-labelledby="s9-title">
          <header class="section__header">
            <h2 id="s9-title" class="section__title">
              <span class="mr-1">🎯</span>Uncommitted Board
            </h2>
            <button type="button" class="see-all-btn" aria-label="See all uncommitted athletes">
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

          <!-- Dense bento box grid -->
          <div class="uncommitted-grid" role="list" aria-label="Top uncommitted athletes">
            @for (athlete of uncommittedAthletes(); track athlete.id) {
              <article
                class="uncommitted-card bg-surface-200 border-border-subtle group border"
                role="listitem"
                tabindex="0"
                [attr.aria-label]="athlete.name + ', ' + athlete.position + ', uncommitted'"
                (click)="onAthleteClick(athlete.id)"
                (keydown.enter)="onAthleteClick(athlete.id)"
                (keydown.space)="$event.preventDefault(); onAthleteClick(athlete.id)"
              >
                <!-- Athlete header -->
                <div class="uncommitted-card__header">
                  <img
                    [src]="athlete.avatarUrl"
                    [alt]="athlete.name"
                    class="uncommitted-card__avatar"
                    width="48"
                    height="48"
                    loading="lazy"
                  />
                  <div class="uncommitted-card__meta">
                    <p class="text-text-primary truncate text-sm font-semibold">
                      {{ athlete.name }}
                    </p>
                    <p class="text-text-tertiary text-xs">
                      {{ athlete.position }} · {{ athlete.classYear }}
                    </p>
                    <!-- Stars -->
                    <div
                      class="mt-0.5 flex gap-0.5"
                      [attr.aria-label]="athlete.stars + ' stars'"
                      role="img"
                    >
                      @for (s of getStarArray(athlete.stars); track $index) {
                        <span class="text-primary text-xs" aria-hidden="true">★</span>
                      }
                    </div>
                  </div>
                  <div
                    class="uncommitted-card__rating ml-auto"
                    [attr.aria-label]="'Rating ' + athlete.rating"
                  >
                    <span class="text-primary text-lg leading-none font-bold">{{
                      athlete.rating
                    }}</span>
                  </div>
                </div>

                <!-- College logo cluster -->
                <div class="uncommitted-card__offers" aria-label="Top offers">
                  <p class="text-text-tertiary mb-1 text-xs font-medium">Top Offers</p>
                  <div class="offer-logos" role="list">
                    @for (logo of athlete.topOfferLogos; track $index) {
                      <div
                        class="offer-logo bg-surface-100 border-border-subtle rounded-full border"
                        role="listitem"
                      >
                        <img
                          [src]="logo"
                          alt=""
                          class="offer-logo__img"
                          width="24"
                          height="24"
                          loading="lazy"
                          aria-hidden="true"
                        />
                      </div>
                    }
                  </div>
                </div>

                <!-- Decision timeline -->
                @if (athlete.decisionTimeline) {
                  <p class="uncommitted-card__timeline text-primary text-xs font-semibold">
                    ⏰ {{ athlete.decisionTimeline }}
                  </p>
                }
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <section class="section section--last" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-48 rounded-lg"></div>
          </div>
          <div class="uncommitted-grid">
            @for (i of skeletonItems4; track i) {
              <div
                class="uncommitted-card bg-surface-300 border-border-subtle h-40 animate-pulse border"
              ></div>
            }
          </div>
        </section>
      }
    </article>
  `,
  styles: [
    `
      /* =============================================================
         EXPLORE ATHLETES — Web Dashboard
         100% design-token driven. Zero hardcoded colors.
         All values via CSS custom properties / Tailwind preset.
         ============================================================= */

      :host {
        display: block;
        width: 100%;
      }

      /* ── Dashboard wrapper ── */

      .athletes-dashboard {
        padding-bottom: var(--nxt1-spacing-10, 2.5rem);
      }

      /* ── Shared section structure ── */

      .section {
        padding-top: var(--nxt1-spacing-6, 1.5rem);
      }

      .section--last {
        padding-bottom: var(--nxt1-spacing-6, 1.5rem);
      }

      .section__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-6, 1.5rem) var(--nxt1-spacing-3, 0.75rem);
      }

      .section__title {
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary, #fff);
        letter-spacing: -0.3px;
        margin: 0;
        display: flex;
        align-items: center;
      }

      /* ── See all button ── */

      .see-all-btn {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-primary, #ccff00);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        transition: opacity var(--nxt1-duration-fast, 100ms) ease;
      }

      .see-all-btn:hover {
        opacity: 0.8;
      }

      .see-all-btn__icon {
        width: 16px;
        height: 16px;
      }

      /* ── Shared horizontal scroll ── */

      .h-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: 0 var(--nxt1-spacing-6, 1.5rem) var(--nxt1-spacing-2, 0.5rem);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08)) transparent;
      }

      .h-scroll::-webkit-scrollbar {
        height: 3px;
      }

      .h-scroll::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ── Skeleton placeholder ── */

      .skeleton {
        background: var(--nxt1-color-surface-300, #222);
        animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 1 — HERO CAROUSEL
         ═══════════════════════════════════════════════════════════ */

      .hero-scroll {
        display: flex;
        gap: var(--nxt1-spacing-4, 1rem);
        padding: 0 var(--nxt1-spacing-6, 1.5rem) var(--nxt1-spacing-2, 0.5rem);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .hero-scroll::-webkit-scrollbar {
        display: none;
      }

      .hero-card {
        flex-shrink: 0;
        position: relative;
        width: 280px;
        height: 380px;
        border-radius: var(--nxt1-radius-xl, 1rem);
        overflow: hidden;
        scroll-snap-align: start;
        cursor: pointer;
        outline: none;
        transition: transform var(--nxt1-duration-fast, 100ms) ease;
      }

      .hero-card:hover {
        transform: translateY(-3px);
      }

      .hero-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .hero-card:active {
        transform: scale(0.97);
      }

      .hero-card__bg {
        position: absolute;
        inset: 0;
      }

      .hero-card__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform var(--nxt1-duration-slow, 300ms) ease;
      }

      .hero-card:hover .hero-card__img {
        transform: scale(1.04);
      }

      .hero-card__overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.85) 0%,
          rgba(0, 0, 0, 0.2) 55%,
          transparent 100%
        );
      }

      /* Frosted glass panel */
      .hero-card__glass {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: var(--nxt1-spacing-4, 1rem);
        background: color-mix(in srgb, var(--nxt1-color-surface-100, #161616) 80%, transparent);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .hero-card__name {
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        margin: 0 0 var(--nxt1-spacing-1, 0.25rem);
        line-height: 1.2;
      }

      .hero-card__meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 0.25rem);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
        flex-wrap: wrap;
      }

      .hero-card__stats {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .hero-card__stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .hero-card__rating-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 20%, transparent);
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
      }

      /* AI badge */
      .ai-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-primary, #fff);
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 15%, transparent);
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        padding: 3px 8px;
        border-radius: var(--nxt1-radius-full, 9999px);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
        width: fit-content;
      }

      /* Scroll dots */
      .scroll-dots {
        display: flex;
        justify-content: center;
        gap: 6px;
        padding: var(--nxt1-spacing-2, 0.5rem) 0;
      }

      .scroll-dot {
        width: 6px;
        height: 6px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        transition: all var(--nxt1-duration-fast, 100ms) ease;
      }

      .scroll-dot--active {
        width: 20px;
        background: var(--nxt1-color-primary, #ccff00);
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 2 — TREND CARDS
         ═══════════════════════════════════════════════════════════ */

      .trend-card {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 0.25rem);
        width: 110px;
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-2, 0.5rem);
        border-radius: var(--nxt1-radius-md, 0.75rem);
        scroll-snap-align: start;
        cursor: pointer;
        transition:
          transform var(--nxt1-duration-fast, 100ms) ease,
          border-color var(--nxt1-duration-fast, 100ms) ease;
        outline: none;
        min-height: 140px;
      }

      .trend-card:hover {
        transform: translateY(-2px);
        border-color: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 25%, transparent);
      }

      .trend-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .trend-card:active {
        transform: scale(0.96);
      }

      .trend-card__avatar {
        width: 56px;
        height: 56px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
        border: 2px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        margin-bottom: var(--nxt1-spacing-1, 0.25rem);
      }

      .trend-card__name {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        margin: 0;
      }

      .trend-card__pos {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        text-align: center;
        margin: 0;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 3 — STAT LEADERS
         ═══════════════════════════════════════════════════════════ */

      .chip-row {
        display: flex;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: 0 var(--nxt1-spacing-6, 1.5rem) var(--nxt1-spacing-3, 0.75rem);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .chip-row::-webkit-scrollbar {
        display: none;
      }

      .chip {
        flex-shrink: 0;
        padding: 4px 12px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        cursor: pointer;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        transition: all var(--nxt1-duration-fast, 100ms) ease;
        outline: none;
        white-space: nowrap;
      }

      .chip:hover {
        border-color: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-primary, #ccff00);
      }

      .chip:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .chip--active {
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary, #ccff00) 15%,
          transparent
        ) !important;
        border-color: var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3)) !important;
        color: var(--nxt1-color-primary, #ccff00) !important;
      }

      .stat-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: 0 var(--nxt1-spacing-6, 1.5rem);
      }

      .stat-box {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: var(--nxt1-spacing-3, 0.75rem);
        border-radius: var(--nxt1-radius-lg, 0.75rem);
        cursor: pointer;
        transition:
          background-color var(--nxt1-duration-fast, 100ms) ease,
          transform var(--nxt1-duration-fast, 100ms) ease;
        outline: none;
        min-height: 72px;
      }

      .stat-box:hover {
        background: var(--nxt1-color-surface-200, #1a1a1a) !important;
        transform: translateY(-1px);
      }

      .stat-box:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .stat-box:active {
        transform: scale(0.97);
      }

      .stat-box__rank {
        width: 20px;
        flex-shrink: 0;
        text-align: center;
      }

      .stat-box__avatar {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
        flex-shrink: 0;
      }

      .stat-box__info {
        flex: 1;
        min-width: 0;
      }

      .stat-box__name {
        margin: 0;
      }

      .stat-box__stat {
        text-align: right;
        flex-shrink: 0;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 4 — VIDEO CARDS (Film Room)
         ═══════════════════════════════════════════════════════════ */

      .video-card {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        width: 220px;
        border-radius: var(--nxt1-radius-md, 0.75rem);
        overflow: hidden;
        scroll-snap-align: start;
        cursor: pointer;
        transition:
          transform var(--nxt1-duration-fast, 100ms) ease,
          box-shadow var(--nxt1-duration-fast, 100ms) ease;
        outline: none;
      }

      .video-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--nxt1-shadow-lg, 0 8px 16px rgba(0, 0, 0, 0.5));
      }

      .video-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .video-card:active {
        transform: scale(0.97);
      }

      .video-card__thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--nxt1-color-surface-300, #222);
      }

      .video-card__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform var(--nxt1-duration-slow, 300ms) ease;
      }

      .video-card:hover .video-card__img {
        transform: scale(1.04);
      }

      .video-card__play-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.25);
        opacity: 0;
        transition: opacity var(--nxt1-duration-fast, 100ms) ease;
      }

      .video-card:hover .video-card__play-overlay {
        opacity: 1;
      }

      .video-card__play-icon {
        width: 44px;
        height: 44px;
        color: rgba(255, 255, 255, 0.95);
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
      }

      .video-card__duration {
        position: absolute;
        bottom: 6px;
        right: 6px;
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.8);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .video-card__info {
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem)
          var(--nxt1-spacing-3, 0.75rem);
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.7) 100%);
      }

      .video-card__athlete {
        margin: 0 0 4px;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .video-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      .watch-tape-btn {
        flex-shrink: 0;
        padding: 3px 10px;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-inverse, #0a0a0a);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        cursor: pointer;
        transition: opacity var(--nxt1-duration-fast, 100ms) ease;
        white-space: nowrap;
      }

      .watch-tape-btn:hover {
        opacity: 0.85;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 5 — COMMITMENT TRACKER
         ═══════════════════════════════════════════════════════════ */

      .commitment-feed {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: 0 var(--nxt1-spacing-6, 1.5rem);
        list-style: none;
        margin: 0;
      }

      .commitment-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-3, 0.75rem);
        border-radius: var(--nxt1-radius-lg, 0.75rem);
        cursor: pointer;
        transition: background-color var(--nxt1-duration-fast, 100ms) ease;
      }

      .commitment-card:hover {
        background: var(--nxt1-color-surface-200, #1a1a1a) !important;
      }

      .commitment-card__avatars {
        position: relative;
        width: 52px;
        height: 44px;
        flex-shrink: 0;
      }

      .commitment-card__athlete-img {
        position: absolute;
        top: 0;
        left: 0;
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
      }

      .commitment-card__college-img {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 28px;
        height: 28px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
      }

      .commitment-card__body {
        flex: 1;
        min-width: 0;
      }

      .commitment-card__time {
        flex-shrink: 0;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 6 — CLASS RANKINGS
         ═══════════════════════════════════════════════════════════ */

      .rankings-list {
        border-radius: var(--nxt1-radius-xl, 1rem);
        overflow: hidden;
        margin: 0 var(--nxt1-spacing-6, 1.5rem);
        list-style: none;
        padding: 0;
      }

      .ranking-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem);
        cursor: pointer;
        transition: background-color var(--nxt1-duration-fast, 100ms) ease;
        outline: none;
      }

      .ranking-row:hover {
        background: var(--nxt1-color-surface-300, #222);
      }

      .ranking-row:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: -2px;
      }

      .ranking-row__rank {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 32px;
        flex-shrink: 0;
      }

      .ranking-row__delta {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        line-height: 1;
      }

      .ranking-row__avatar {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
        flex-shrink: 0;
      }

      .ranking-row__info {
        flex: 1;
        min-width: 0;
      }

      .ranking-row__stars {
        display: flex;
        gap: 1px;
        flex-shrink: 0;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 7 — SCOUT'S NOTEBOOK
         Mirrors scout-report-card.component.ts architecture.
         ═══════════════════════════════════════════════════════════ */

      .scout-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      /* Mirrors .scout-card styles */
      .scout-card {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-6, 1.5rem);
        cursor: pointer;
        transition: background-color var(--nxt1-duration-fast, 100ms) ease;
        outline: none;
      }

      .scout-card:hover {
        background: var(--nxt1-color-surface-200, #1a1a1a) !important;
      }

      .scout-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: -2px;
      }

      /* Mirrors .scout-card__image-container */
      .scout-card__media {
        position: relative;
        flex-shrink: 0;
      }

      .scout-card__photo {
        width: 56px;
        height: 56px;
        border-radius: var(--nxt1-radius-md, 0.75rem);
        object-fit: cover;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .scout-card__verified-badge {
        position: absolute;
        bottom: -4px;
        right: -4px;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-info, #3b82f6);
        color: var(--nxt1-color-text-primary, #ffffff);
        border: 2px solid var(--nxt1-color-bg-primary, #0a0a0a);
      }

      /* Mirrors .scout-card__content */
      .scout-card__body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 0.25rem);
      }

      .scout-card__title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      .scout-card__name {
        margin: 0;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Mirrors .scout-card__rating */
      .scout-card__rating-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
        padding: 4px 8px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        border-radius: var(--nxt1-radius-md, 0.75rem);
      }

      /* Mirrors .scout-card__chips */
      .scout-card__chips-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1, 0.25rem);
      }

      .scout-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* Mirrors .scout-card__summary */
      .scout-card__summary {
        margin: 2px 0;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* Mirrors .scout-card__highlights */
      .scout-card__highlights {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .scout-highlight {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 0.25rem);
      }

      .scout-highlight__icon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        color: var(--nxt1-color-success, #22c55e);
      }

      /* Mirrors .scout-card__footer */
      .scout-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: var(--nxt1-spacing-1, 0.25rem);
        margin-top: 2px;
      }

      .read-report-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        transition: opacity var(--nxt1-duration-fast, 100ms) ease;
      }

      .read-report-btn:hover {
        opacity: 0.8;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 8 — THE RADAR
         ═══════════════════════════════════════════════════════════ */

      .radar-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: 0 var(--nxt1-spacing-6, 1.5rem);
        list-style: none;
        margin: 0;
      }

      .radar-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem);
        border-radius: var(--nxt1-radius-lg, 0.75rem);
        cursor: pointer;
        transition: background-color var(--nxt1-duration-fast, 100ms) ease;
        outline: none;
      }

      .radar-card:hover {
        background: var(--nxt1-color-surface-300, #222) !important;
      }

      .radar-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .radar-card__avatar {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
        flex-shrink: 0;
      }

      .radar-card__info {
        flex: 1;
        min-width: 0;
      }

      .radar-card__time {
        flex-shrink: 0;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 9 — UNCOMMITTED BOARD
         ═══════════════════════════════════════════════════════════ */

      .uncommitted-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: 0 var(--nxt1-spacing-6, 1.5rem);
      }

      .uncommitted-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: var(--nxt1-spacing-3, 0.75rem);
        border-radius: var(--nxt1-radius-lg, 0.75rem);
        cursor: pointer;
        transition:
          transform var(--nxt1-duration-fast, 100ms) ease,
          border-color var(--nxt1-duration-fast, 100ms) ease;
        outline: none;
      }

      .uncommitted-card:hover {
        transform: translateY(-2px);
        border-color: var(--nxt1-color-border, rgba(255, 255, 255, 0.12)) !important;
      }

      .uncommitted-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .uncommitted-card:active {
        transform: scale(0.97);
      }

      .uncommitted-card__header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      .uncommitted-card__avatar {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
        flex-shrink: 0;
      }

      .uncommitted-card__meta {
        flex: 1;
        min-width: 0;
      }

      .uncommitted-card__rating {
        flex-shrink: 0;
      }

      .uncommitted-card__offers {
        padding-top: var(--nxt1-spacing-1, 0.25rem);
      }

      .offer-logos {
        display: flex;
        gap: var(--nxt1-spacing-1, 0.25rem);
        flex-wrap: wrap;
      }

      .offer-logo {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
      }

      .offer-logo__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .uncommitted-card__timeline {
        margin: 0;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
      }

      /* ── Reduced motion ── */

      @media (prefers-reduced-motion: reduce) {
        .hero-card,
        .hero-card__img,
        .trend-card,
        .stat-box,
        .video-card,
        .video-card__img,
        .video-card__play-overlay,
        .commitment-card,
        .ranking-row,
        .scout-card,
        .radar-card,
        .uncommitted-card,
        .scroll-dot {
          transition: none !important;
          animation: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreAthletesWebComponent {
  private readonly platformId = inject(PLATFORM_ID);

  // ── Skeleton iterables ────────────────────────────────────────────────────
  readonly skeletonItems3 = [1, 2, 3];
  readonly skeletonItems4 = [1, 2, 3, 4];
  readonly skeletonItems5 = [1, 2, 3, 4, 5];

  // ── Math helper (used in template) ───────────────────────────────────────
  readonly Math = Math;

  // ── State signals ─────────────────────────────────────────────────────────
  readonly activeHeroIndex = signal(0);
  readonly activeStatCategory = signal('pts');
  readonly activeClassYear = signal('2026');

  // ── Data signals ──────────────────────────────────────────────────────────
  readonly prospects = signal<ProspectCard[]>(MOCK_PROSPECTS);
  readonly trendingAthletes = signal<TrendingAthlete[]>(MOCK_TRENDING);
  readonly statCategories = signal<StatCategory[]>(MOCK_STAT_CATEGORIES);
  readonly statLeaders = signal<StatLeader[]>(MOCK_STAT_LEADERS);
  readonly highlights = signal<HighlightVideo[]>(MOCK_HIGHLIGHTS);
  readonly commitments = signal<CommitmentEvent[]>(MOCK_COMMITMENTS);
  readonly classRankings = signal<ClassRankEntry[]>(MOCK_CLASS_RANKINGS);
  readonly scoutNotebook = signal<ScoutNotebookEntry[]>(MOCK_SCOUT_NOTEBOOK);
  readonly trackedAthletes = signal<TrackedAthlete[]>(MOCK_TRACKED);
  readonly uncommittedAthletes = signal<UncommittedAthlete[]>(MOCK_UNCOMMITTED);

  readonly classYears = signal(['2026', '2027', '2028']);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  constructor() {
    // SSR-safe: only set up IntersectionObserver in browser
    afterNextRender(() => {
      if (isPlatformBrowser(this.platformId)) {
        this.initHeroScrollSync();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns an array of `n` elements for star rendering */
  getStarArray(count: number): number[] {
    return Array.from({ length: Math.min(count, 5) }, (_, i) => i);
  }

  // ── Interactions ──────────────────────────────────────────────────────────

  onHeroScroll(): void {
    // Dot indicator update handled by scroll listener in afterNextRender
  }

  onProspectClick(_card: ProspectCard): void {
    // Navigate to athlete profile — emitted to parent via service or router
  }

  onAthleteClick(_id: string): void {
    // Navigate to athlete profile
  }

  onVideoClick(_video: HighlightVideo): void {
    // Open video player
  }

  onWatchTape(_video: HighlightVideo): void {
    // Open video player / full screen
  }

  onScoutReportClick(_entry: ScoutNotebookEntry): void {
    // Navigate to scout report detail
  }

  setStatCategory(id: string): void {
    this.activeStatCategory.set(id);
  }

  setClassYear(year: string): void {
    this.activeClassYear.set(year);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private initHeroScrollSync(): void {
    // SSR-safe: runs only in browser after first render
    try {
      const scrollEl = document.querySelector('.hero-scroll');
      if (!scrollEl) return;

      const cards = scrollEl.querySelectorAll('.hero-card');
      if (!cards.length) return;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const idx = Array.from(cards).indexOf(entry.target as Element);
              if (idx !== -1) this.activeHeroIndex.set(idx);
              break;
            }
          }
        },
        { root: scrollEl as Element, threshold: 0.6 }
      );

      cards.forEach((card) => observer.observe(card));
    } catch {
      // Silently ignore — not critical
    }
  }
}
