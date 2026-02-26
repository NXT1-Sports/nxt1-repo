/**
 * @fileoverview Explore "Athletes" Elite Dashboard — Mobile (Ionic)
 * @module @nxt1/ui/explore/mobile
 * @version 1.0.0
 *
 * 9-section data-driven talent exchange dashboard for the /explore route.
 * Uses Ionic components for native feel with our --nxt1-* design token mapping.
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
 * ⭐ MOBILE ONLY — Ionic components, HapticsService, design token CSS ⭐
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
  IonAvatar,
  IonBadge,
  IonChip,
  IonButton,
  IonIcon,
  IonNote,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  trendingUpOutline,
  trophyOutline,
  videocamOutline,
  schoolOutline,
  ribbonOutline,
  documentTextOutline,
  radioOutline,
  gridOutline,
  checkmarkCircle,
  starOutline,
  star as starIcon,
  chevronForwardOutline,
  flashOutline,
  megaphoneOutline,
  arrowUpOutline,
  arrowDownOutline,
  playCircleOutline,
} from 'ionicons/icons';
import { HapticsService } from '../../services/haptics/haptics.service';
import { ScoutReportCardComponent } from '../../scout-reports/scout-report-card.component';
import type { ScoutReport } from '@nxt1/core';
import { MOCK_SCOUT_REPORTS } from '../../scout-reports/scout-reports.mock-data';

// ─── Types (shared with web component) ───────────────────────────────────────

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
];

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'nxt1-explore-athletes-mobile',
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
    IonAvatar,
    IonBadge,
    IonChip,
    IonButton,
    IonIcon,
    IonNote,
    ScoutReportCardComponent,
  ],
  template: `
    <div class="athletes-mobile" aria-label="Athletes Elite Dashboard">
      <!-- ═══════════════════════════════════════════════════════════
           SECTION 1: AGENT X PROSPECT BOARD — Hero Carousel
           NOT deferred — instant LCP
           ═══════════════════════════════════════════════════════════ -->
      <section class="section" aria-labelledby="m-s1-title">
        <div class="section__header">
          <h2 id="m-s1-title" class="section__title">
            <span class="text-primary mr-1">⚡</span>Agent X Prospect Board
          </h2>
          <ion-button fill="clear" size="small" class="see-all-btn" aria-label="See all prospects">
            See All <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
          </ion-button>
        </div>

        <!-- Hero snap-scroll carousel with haptics -->
        <div class="hero-scroll" role="list" aria-label="Top prospects" (scroll)="onHeroScroll()">
          @for (card of prospects(); track card.id) {
            <ion-card
              class="hero-card"
              button
              [attr.aria-label]="card.name + ', ' + card.position + ', Class ' + card.classYear"
              (click)="onProspectTap(card)"
            >
              <!-- Cinematic background -->
              <div class="hero-card__bg" aria-hidden="true">
                <img
                  [src]="card.imageUrl"
                  [alt]="card.name"
                  class="hero-card__img"
                  loading="eager"
                  width="280"
                  height="370"
                />
                <div class="hero-card__overlay" aria-hidden="true"></div>
              </div>

              <!-- Frosted glass panel -->
              <div class="hero-card__glass">
                <div class="ai-badge" role="note">{{ card.aiReason }}</div>
                <h3 class="hero-card__name">{{ card.name }}</h3>
                <p class="hero-card__meta">
                  {{ card.position }} · Class {{ card.classYear }} · {{ card.school }}
                </p>
                <div class="hero-card__stats">
                  <div class="hero-card__stat">
                    <span class="hero-stat-value text-primary">{{ card.topStat }}</span>
                    <span class="hero-stat-label">{{ card.topStatLabel }}</span>
                  </div>
                  <div class="hero-card__rating" [attr.aria-label]="'Rating ' + card.rating">
                    <span class="text-primary text-sm font-bold">{{ card.rating }}</span>
                  </div>
                </div>
              </div>
            </ion-card>
          }
        </div>

        <!-- Scroll dots -->
        <div class="scroll-dots" role="tablist" aria-label="Prospect carousel position">
          @for (card of prospects(); track card.id; let i = $index) {
            <div
              class="scroll-dot"
              [class.scroll-dot--active]="activeHeroIndex() === i"
              role="tab"
              [attr.aria-selected]="activeHeroIndex() === i"
            ></div>
          }
        </div>
      </section>

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 2: STOCK WATCH — Trending Risers (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="m-s2-title">
          <div class="section__header">
            <h2 id="m-s2-title" class="section__title"><span class="mr-1">📈</span>Stock Watch</h2>
            <ion-button
              fill="clear"
              size="small"
              class="see-all-btn"
              aria-label="See all trending athletes"
            >
              See All <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
            </ion-button>
          </div>

          <div class="h-scroll" role="list" aria-label="Trending athletes" (scroll)="onHScroll()">
            @for (athlete of trendingAthletes(); track athlete.id) {
              <ion-card
                class="trend-card"
                button
                [attr.aria-label]="athlete.name + ' ' + athlete.trendMetric"
                (click)="onAthleteTap(athlete.id)"
              >
                <ion-card-content class="trend-card__content">
                  <ion-avatar class="trend-card__avatar">
                    <img
                      [src]="athlete.avatarUrl"
                      [alt]="athlete.name"
                      loading="lazy"
                      width="56"
                      height="56"
                    />
                  </ion-avatar>
                  <p class="trend-card__name">{{ athlete.name }}</p>
                  <p class="trend-card__pos text-text-tertiary">
                    {{ athlete.position }} · {{ athlete.classYear }}
                  </p>
                  <p class="trend-metric text-success">{{ athlete.trendMetric }}</p>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-40 rounded-lg"></div>
          </div>
          <div class="h-scroll">
            @for (i of skeletonItems5; track i) {
              <div class="trend-card skeleton-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 3: STAT LEADERS (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="m-s3-title">
          <div class="section__header">
            <h2 id="m-s3-title" class="section__title"><span class="mr-1">🏆</span>Stat Leaders</h2>
            <ion-button
              fill="clear"
              size="small"
              class="see-all-btn"
              aria-label="See all stat leaders"
            >
              See All <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
            </ion-button>
          </div>

          <!-- Filter chips -->
          <div class="chip-row" role="group" aria-label="Filter by stat category">
            @for (cat of statCategories(); track cat.id) {
              <ion-chip
                [color]="activeStatCategory() === cat.id ? 'primary' : 'medium'"
                [outline]="activeStatCategory() !== cat.id"
                [attr.aria-pressed]="activeStatCategory() === cat.id"
                (click)="setStatCategory(cat.id)"
              >
                {{ cat.label }}
              </ion-chip>
            }
          </div>

          <!-- Stat list -->
          <ion-list lines="none" class="stat-list" aria-label="Stat leaders">
            @for (leader of statLeaders(); track leader.id; let i = $index) {
              <ion-item
                button
                detail="false"
                class="stat-item"
                [attr.aria-label]="leader.name + ', ' + leader.statValue + ' ' + leader.statLabel"
                (click)="onAthleteTap(leader.id)"
              >
                <span class="stat-rank text-text-tertiary" slot="start">#{{ i + 1 }}</span>
                <ion-avatar slot="start" class="stat-avatar">
                  <img
                    [src]="leader.avatarUrl"
                    [alt]="leader.name"
                    loading="lazy"
                    width="40"
                    height="40"
                  />
                </ion-avatar>
                <ion-label>
                  <h3 class="text-text-primary font-semibold">{{ leader.name }}</h3>
                  <p class="text-text-tertiary text-xs">
                    {{ leader.position }} · {{ leader.classYear }}
                  </p>
                </ion-label>
                <div
                  slot="end"
                  class="stat-value-block"
                  [attr.aria-label]="leader.statValue + ' ' + leader.statLabel"
                >
                  <span class="text-primary text-lg leading-none font-bold">{{
                    leader.statValue
                  }}</span>
                  <span class="text-text-tertiary text-2xs block text-center">{{
                    leader.statLabel
                  }}</span>
                </div>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-36 rounded-lg"></div>
          </div>
          <div class="bg-surface-300 mx-4 h-48 animate-pulse rounded-xl"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 4: FILM ROOM (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="m-s4-title">
          <div class="section__header">
            <h2 id="m-s4-title" class="section__title"><span class="mr-1">🎬</span>Film Room</h2>
            <ion-button
              fill="clear"
              size="small"
              class="see-all-btn"
              aria-label="See all highlights"
            >
              See All <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
            </ion-button>
          </div>

          <div class="h-scroll" role="list" aria-label="Trending highlights" (scroll)="onHScroll()">
            @for (video of highlights(); track video.id) {
              <ion-card
                class="video-card"
                button
                [attr.aria-label]="video.athleteName + ' highlight tape'"
                (click)="onVideoTap(video)"
              >
                <div class="video-card__thumb">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.athleteName + ' highlight'"
                    class="video-card__img"
                    loading="lazy"
                    width="220"
                    height="124"
                  />
                  <div class="video-card__play-overlay" aria-hidden="true">
                    <ion-icon name="play-circle-outline" class="video-card__play-icon"></ion-icon>
                  </div>
                  <span class="video-card__duration">{{ video.duration }}</span>
                </div>
                <ion-card-content class="video-card__info">
                  <p class="video-card__athlete text-text-primary truncate text-sm font-semibold">
                    {{ video.athleteName }}
                  </p>
                  <div class="video-card__footer">
                    <ion-note class="text-text-tertiary text-xs"
                      >{{ video.position }} · {{ video.sport }}</ion-note
                    >
                    <ion-button
                      fill="solid"
                      color="primary"
                      size="small"
                      class="watch-tape-btn"
                      [attr.aria-label]="'Watch ' + video.athleteName + ' tape'"
                      (click)="$event.stopPropagation(); onWatchTapeMobile(video)"
                    >
                      Watch Tape
                    </ion-button>
                  </div>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-32 rounded-lg"></div>
          </div>
          <div class="h-scroll">
            @for (i of skeletonItems3; track i) {
              <div class="video-card skeleton-card bg-surface-300 animate-pulse"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 5: OFFER & COMMITMENT TRACKER (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="m-s5-title">
          <div class="section__header">
            <h2 id="m-s5-title" class="section__title">
              <span class="mr-1">🏫</span>Offer &amp; Commitment Tracker
            </h2>
            <ion-button
              fill="clear"
              size="small"
              class="see-all-btn"
              aria-label="See all offers and commitments"
            >
              See All <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
            </ion-button>
          </div>

          <ion-list
            lines="none"
            class="commitment-list"
            role="feed"
            aria-label="Recent offers and commitments"
          >
            @for (event of commitments(); track event.id) {
              <ion-item
                button
                detail="false"
                class="commitment-item"
                [attr.aria-label]="
                  event.athleteName +
                  ' ' +
                  (event.eventType === 'commit' ? 'committed to' : 'received offer from') +
                  ' ' +
                  event.collegeName
                "
                (click)="onAthleteTap(event.id)"
              >
                <!-- Overlapping avatars -->
                <div class="commitment-avatars" slot="start" aria-hidden="true">
                  <img
                    [src]="event.athleteAvatar"
                    [alt]=""
                    class="commitment-athlete-img border-bg-primary border-2"
                    width="44"
                    height="44"
                    loading="lazy"
                  />
                  <img
                    [src]="event.collegeLogoUrl"
                    [alt]=""
                    class="commitment-college-img border-bg-primary border-2"
                    width="28"
                    height="28"
                    loading="lazy"
                  />
                </div>

                <ion-label>
                  <h3 class="text-text-primary text-sm font-semibold">{{ event.athleteName }}</h3>
                  <p class="text-text-secondary text-xs">
                    <ion-icon
                      [name]="
                        event.eventType === 'commit' ? 'checkmark-circle' : 'megaphone-outline'
                      "
                      aria-hidden="true"
                    ></ion-icon>
                    {{ event.eventType === 'commit' ? 'Committed to' : 'Offer from' }}
                    <strong>{{ event.collegeName }}</strong>
                  </p>
                  <p class="text-text-tertiary text-xs">
                    {{ event.position }} · {{ event.classYear }} · {{ event.sport }}
                  </p>
                </ion-label>
                <ion-note slot="end" class="text-text-tertiary text-xs">{{
                  event.timeAgo
                }}</ion-note>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-52 rounded-lg"></div>
          </div>
          <div class="bg-surface-300 mx-4 h-40 animate-pulse rounded-xl"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 6: CLASS RANKINGS (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="m-s6-title">
          <div class="section__header">
            <h2 id="m-s6-title" class="section__title">
              <span class="mr-1">🎖️</span>Class Rankings
            </h2>
            <ion-button
              fill="clear"
              size="small"
              class="see-all-btn"
              aria-label="See full class rankings"
            >
              Full Board <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
            </ion-button>
          </div>

          <!-- Class year filter chips -->
          <div class="chip-row" role="group" aria-label="Select class year">
            @for (year of classYears(); track year) {
              <ion-chip
                [color]="activeClassYear() === year ? 'primary' : 'medium'"
                [outline]="activeClassYear() !== year"
                [attr.aria-pressed]="activeClassYear() === year"
                (click)="setClassYear(year)"
              >
                Class of {{ year }}
              </ion-chip>
            }
          </div>

          <ion-list
            lines="inset"
            class="rankings-list"
            [attr.aria-label]="'Class of ' + activeClassYear() + ' rankings'"
          >
            @for (entry of classRankings(); track entry.id) {
              <ion-item
                button
                detail="false"
                class="ranking-item"
                [attr.aria-label]="'#' + entry.rank + ' ' + entry.name + ', ' + entry.position"
                (click)="onAthleteTap(entry.id)"
              >
                <div class="ranking-rank" slot="start" aria-hidden="true">
                  <span class="text-text-tertiary text-sm font-bold">#{{ entry.rank }}</span>
                  @if (entry.rankDelta !== 0) {
                    <ion-icon
                      [name]="entry.rankDelta > 0 ? 'arrow-up-outline' : 'arrow-down-outline'"
                      class="text-xs"
                      [class.text-success]="entry.rankDelta > 0"
                      [class.text-error]="entry.rankDelta < 0"
                      [attr.aria-label]="
                        (entry.rankDelta > 0 ? 'Up ' : 'Down ') + Math.abs(entry.rankDelta)
                      "
                    ></ion-icon>
                  }
                </div>
                <ion-avatar slot="start" class="ranking-avatar">
                  <img
                    [src]="entry.avatarUrl"
                    [alt]="entry.name"
                    loading="lazy"
                    width="36"
                    height="36"
                  />
                </ion-avatar>
                <ion-label>
                  <h3 class="text-text-primary text-sm font-semibold">{{ entry.name }}</h3>
                  <p class="text-text-tertiary text-xs">
                    {{ entry.position }} · {{ entry.school }}
                  </p>
                </ion-label>
                <div
                  slot="end"
                  class="ranking-stars"
                  [attr.aria-label]="entry.stars + ' stars'"
                  role="img"
                >
                  @for (s of getStarArray(entry.stars); track $index) {
                    <ion-icon
                      name="star"
                      class="text-primary text-xs"
                      aria-hidden="true"
                    ></ion-icon>
                  }
                </div>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-40 rounded-lg"></div>
          </div>
          <div class="bg-surface-300 mx-4 h-64 animate-pulse rounded-xl"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 7: SCOUT'S NOTEBOOK — Reuses Scout Report card (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="m-s7-title">
          <div class="section__header">
            <h2 id="m-s7-title" class="section__title">
              <span class="mr-1">📋</span>Scout's Notebook
            </h2>
            <ion-button
              fill="clear"
              size="small"
              class="see-all-btn"
              aria-label="See all scout reports"
            >
              See All <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
            </ion-button>
          </div>

          <!-- Reuses ScoutReportCardComponent (Section 7 explicit requirement) -->
          <div class="scout-cards-list" role="list" aria-label="Recent scout evaluations">
            @for (report of scoutReports(); track report.id) {
              <div class="scout-card-wrapper" role="listitem">
                <nxt1-scout-report-card
                  [report]="report"
                  viewMode="list"
                  [showQuickStats]="false"
                  (cardClick)="onScoutReportTap($event)"
                  (bookmark)="onScoutReportBookmark($event)"
                />
              </div>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-44 rounded-lg"></div>
          </div>
          <div class="flex flex-col gap-2 px-4">
            @for (i of skeletonItems3; track i) {
              <div class="bg-surface-300 h-28 animate-pulse rounded-xl"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 8: THE RADAR — Tracked Athletes (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section" aria-labelledby="m-s8-title">
          <div class="section__header">
            <h2 id="m-s8-title" class="section__title"><span class="mr-1">📡</span>The Radar</h2>
            <ion-button
              fill="clear"
              size="small"
              class="see-all-btn"
              aria-label="See all tracked athletes"
            >
              See All <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
            </ion-button>
          </div>

          <ion-list lines="none" class="radar-list" aria-label="Your tracked athletes">
            @for (athlete of trackedAthletes(); track athlete.id) {
              <ion-item
                button
                detail="false"
                class="radar-item border-primary border-l-4"
                [attr.aria-label]="athlete.name + ': ' + athlete.latestUpdate"
                (click)="onAthleteTap(athlete.id)"
              >
                <ion-avatar slot="start" class="radar-avatar">
                  <img
                    [src]="athlete.avatarUrl"
                    [alt]="athlete.name"
                    loading="lazy"
                    width="36"
                    height="36"
                  />
                </ion-avatar>
                <ion-label>
                  <h3 class="text-text-primary text-sm font-semibold">{{ athlete.name }}</h3>
                  <p class="text-text-tertiary text-xs">
                    {{ athlete.position }} · {{ athlete.classYear }}
                  </p>
                  <p class="text-text-secondary text-xs">{{ athlete.latestUpdate }}</p>
                </ion-label>
                <ion-note slot="end" class="text-text-tertiary text-xs">{{
                  athlete.updateTime
                }}</ion-note>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="section" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-32 rounded-lg"></div>
          </div>
          <div class="bg-surface-300 mx-4 h-40 animate-pulse rounded-xl"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════════
           SECTION 9: UNCOMMITTED BOARD — Best Available (deferred)
           ═══════════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="section section--last" aria-labelledby="m-s9-title">
          <div class="section__header">
            <h2 id="m-s9-title" class="section__title">
              <span class="mr-1">🎯</span>Uncommitted Board
            </h2>
            <ion-button
              fill="clear"
              size="small"
              class="see-all-btn"
              aria-label="See all uncommitted athletes"
            >
              See All <ion-icon name="chevron-forward-outline" slot="end"></ion-icon>
            </ion-button>
          </div>

          <div
            class="uncommitted-grid"
            role="list"
            aria-label="Top uncommitted athletes"
            (scroll)="onHScroll()"
          >
            @for (athlete of uncommittedAthletes(); track athlete.id) {
              <ion-card
                class="uncommitted-card"
                button
                [attr.aria-label]="athlete.name + ', ' + athlete.position + ', uncommitted'"
                (click)="onAthleteTap(athlete.id)"
              >
                <ion-card-content class="uncommitted-card__content">
                  <!-- Athlete header -->
                  <div class="uncommitted-header">
                    <ion-avatar class="uncommitted-avatar">
                      <img
                        [src]="athlete.avatarUrl"
                        [alt]="athlete.name"
                        loading="lazy"
                        width="44"
                        height="44"
                      />
                    </ion-avatar>
                    <div class="uncommitted-meta">
                      <p class="text-text-primary truncate text-sm font-semibold">
                        {{ athlete.name }}
                      </p>
                      <p class="text-text-tertiary text-xs">
                        {{ athlete.position }} · {{ athlete.classYear }}
                      </p>
                      <div
                        class="mt-0.5 flex gap-0.5"
                        [attr.aria-label]="athlete.stars + ' stars'"
                        role="img"
                      >
                        @for (s of getStarArray(athlete.stars); track $index) {
                          <ion-icon
                            name="star"
                            class="text-primary text-xs"
                            aria-hidden="true"
                          ></ion-icon>
                        }
                      </div>
                    </div>
                    <span
                      class="text-primary ml-auto text-lg font-bold"
                      [attr.aria-label]="'Rating ' + athlete.rating"
                    >
                      {{ athlete.rating }}
                    </span>
                  </div>

                  <!-- Offer logos cluster -->
                  <div class="uncommitted-offers" aria-label="Top offers">
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

                  @if (athlete.decisionTimeline) {
                    <p class="text-primary mt-2 text-xs font-semibold">
                      ⏰ {{ athlete.decisionTimeline }}
                    </p>
                  }
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="section section--last" aria-hidden="true">
          <div class="section__header">
            <div class="skeleton h-6 w-48 rounded-lg"></div>
          </div>
          <div class="uncommitted-grid">
            @for (i of skeletonItems3; track i) {
              <div class="bg-surface-300 h-44 animate-pulse rounded-xl"></div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* =============================================================
         EXPLORE ATHLETES MOBILE — Ionic + Design Tokens
         --nxt1-* tokens map to --ion-* via global styles.
         Zero hardcoded colors. Tailwind for layout only.
         ============================================================= */

      :host {
        display: block;
        width: 100%;
      }

      /* ── Dashboard wrapper ── */

      .athletes-mobile {
        padding-bottom: var(--nxt1-spacing-10, 2.5rem);
      }

      /* ── Shared section ── */

      .section {
        padding-top: var(--nxt1-spacing-5, 1.25rem);
      }

      .section--last {
        padding-bottom: var(--nxt1-spacing-5, 1.25rem);
      }

      .section__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-3, 0.75rem);
      }

      .section__title {
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
        display: flex;
        align-items: center;
      }

      .see-all-btn {
        --color: var(--nxt1-color-primary, #ccff00);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
      }

      /* ── Horizontal scroll ── */

      .h-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: 0 var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-2, 0.5rem);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .h-scroll::-webkit-scrollbar {
        display: none;
      }

      /* ── Skeleton placeholder ── */

      .skeleton {
        background: var(--nxt1-color-surface-300, #222);
        animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      .skeleton-card {
        flex-shrink: 0;
        border-radius: var(--nxt1-radius-lg, 0.75rem);
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

      /* ── Chip row ── */

      .chip-row {
        display: flex;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: 0 var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-3, 0.75rem);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .chip-row::-webkit-scrollbar {
        display: none;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 1 — HERO CAROUSEL
         ═══════════════════════════════════════════════════════════ */

      .hero-scroll {
        display: flex;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: 0 var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-2, 0.5rem);
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
        width: 260px;
        height: 360px;
        position: relative;
        margin: 0;
        border-radius: var(--nxt1-radius-xl, 1rem) !important;
        overflow: hidden;
        scroll-snap-align: start;
        --background: transparent;
        --ion-background-color: transparent;
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
      }

      .hero-card__overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.88) 0%,
          rgba(0, 0, 0, 0.2) 55%,
          transparent 100%
        );
      }

      .hero-card__glass {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: var(--nxt1-spacing-3, 0.75rem);
        background: color-mix(in srgb, var(--nxt1-color-surface-100, #161616) 80%, transparent);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .ai-badge {
        display: inline-flex;
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-primary, #fff);
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 15%, transparent);
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        padding: 2px 8px;
        border-radius: var(--nxt1-radius-full, 9999px);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
        width: fit-content;
      }

      .hero-card__name {
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-inverse, #ffffff);
        margin: 0 0 4px;
        line-height: 1.2;
      }

      .hero-card__meta {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: rgba(255, 255, 255, 0.7);
        margin: 0 0 var(--nxt1-spacing-2, 0.5rem);
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

      .hero-stat-value {
        font-size: var(--nxt1-fontSize-xl, 1.25rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        line-height: 1;
      }

      .hero-stat-label {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: rgba(255, 255, 255, 0.6);
      }

      .hero-card__rating {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 20%, transparent);
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
      }

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
        width: 100px;
        scroll-snap-align: start;
        --background: var(--nxt1-color-surface-200, #1a1a1a);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08)) !important;
        border-radius: var(--nxt1-radius-lg, 0.75rem) !important;
        margin: 0;
        min-height: 140px;
      }

      .trend-card__content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-2, 0.5rem) !important;
      }

      .trend-card__avatar {
        width: 52px !important;
        height: 52px !important;
        margin-bottom: 4px;
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

      .trend-metric {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-align: center;
        margin: 4px 0 0;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 3 — STAT LEADERS
         ═══════════════════════════════════════════════════════════ */

      .stat-list {
        --ion-background-color: transparent;
        background: transparent;
        padding: 0 var(--nxt1-spacing-4, 1rem);
      }

      .stat-item {
        --background: var(--nxt1-color-surface-100, #161616);
        --border-radius: var(--nxt1-radius-lg, 0.75rem);
        --padding-start: var(--nxt1-spacing-3, 0.75rem);
        --inner-padding-end: var(--nxt1-spacing-3, 0.75rem);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
      }

      .stat-rank {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        width: 24px;
        text-align: center;
        flex-shrink: 0;
      }

      .stat-avatar {
        width: 36px !important;
        height: 36px !important;
      }

      .stat-value-block {
        text-align: right;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 4 — FILM ROOM
         ═══════════════════════════════════════════════════════════ */

      .video-card {
        flex-shrink: 0;
        width: 200px;
        scroll-snap-align: start;
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
        border-radius: var(--nxt1-radius-lg, 0.75rem) !important;
        overflow: hidden;
        margin: 0;
      }

      .skeleton-card.video-card {
        height: 160px;
        width: 200px;
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
      }

      .video-card__play-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.25);
        opacity: 0.7;
      }

      .video-card__play-icon {
        font-size: 40px;
        color: rgba(255, 255, 255, 0.9);
      }

      .video-card__duration {
        position: absolute;
        bottom: 4px;
        right: 4px;
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.8);
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        border-radius: var(--nxt1-radius-sm, 0.25rem);
        line-height: 1.4;
      }

      .video-card__info {
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-3, 0.75rem)
          var(--nxt1-spacing-3, 0.75rem) !important;
      }

      .video-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-1, 0.25rem);
        margin-top: 4px;
      }

      .watch-tape-btn {
        --border-radius: var(--nxt1-radius-full, 9999px);
        --padding-start: 10px;
        --padding-end: 10px;
        height: 24px;
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 5 — COMMITMENT TRACKER
         ═══════════════════════════════════════════════════════════ */

      .commitment-list {
        --ion-background-color: transparent;
        background: transparent;
        padding: 0 var(--nxt1-spacing-4, 1rem);
      }

      .commitment-item {
        --background: var(--nxt1-color-surface-100, #161616);
        --border-radius: var(--nxt1-radius-lg, 0.75rem);
        --padding-start: var(--nxt1-spacing-3, 0.75rem);
        --inner-padding-end: var(--nxt1-spacing-3, 0.75rem);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
      }

      .commitment-avatars {
        position: relative;
        width: 52px;
        height: 44px;
        flex-shrink: 0;
        margin-right: var(--nxt1-spacing-2, 0.5rem);
      }

      .commitment-athlete-img {
        position: absolute;
        top: 0;
        left: 0;
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
      }

      .commitment-college-img {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 26px;
        height: 26px;
        border-radius: var(--nxt1-radius-full, 9999px);
        object-fit: cover;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 6 — CLASS RANKINGS
         ═══════════════════════════════════════════════════════════ */

      .rankings-list {
        --ion-background-color: transparent;
        background: transparent;
        padding: 0 var(--nxt1-spacing-4, 1rem);
      }

      .ranking-item {
        --background: var(--nxt1-color-surface-100, #161616);
        --border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --padding-start: var(--nxt1-spacing-3, 0.75rem);
        --inner-padding-end: var(--nxt1-spacing-3, 0.75rem);
      }

      .ranking-rank {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 28px;
        flex-shrink: 0;
        margin-right: var(--nxt1-spacing-2, 0.5rem);
      }

      .ranking-avatar {
        width: 34px !important;
        height: 34px !important;
      }

      .ranking-stars {
        display: flex;
        gap: 1px;
        flex-shrink: 0;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 7 — SCOUT'S NOTEBOOK
         ═══════════════════════════════════════════════════════════ */

      .scout-cards-list {
        padding: 0 var(--nxt1-spacing-4, 1rem);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 0.75rem);
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 8 — THE RADAR
         ═══════════════════════════════════════════════════════════ */

      .radar-list {
        --ion-background-color: transparent;
        background: transparent;
        padding: 0 var(--nxt1-spacing-4, 1rem);
      }

      .radar-item {
        --background: var(--nxt1-color-surface-200, #1a1a1a);
        --border-radius: var(--nxt1-radius-lg, 0.75rem);
        --padding-start: var(--nxt1-spacing-3, 0.75rem);
        --inner-padding-end: var(--nxt1-spacing-3, 0.75rem);
        margin-bottom: var(--nxt1-spacing-2, 0.5rem);
      }

      .radar-avatar {
        width: 34px !important;
        height: 34px !important;
      }

      /* ═══════════════════════════════════════════════════════════
         SECTION 9 — UNCOMMITTED BOARD
         ═══════════════════════════════════════════════════════════ */

      .uncommitted-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: 0 var(--nxt1-spacing-4, 1rem);
      }

      .uncommitted-card {
        --background: var(--nxt1-color-surface-200, #1a1a1a);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08)) !important;
        border-radius: var(--nxt1-radius-lg, 0.75rem) !important;
        margin: 0;
      }

      .uncommitted-card__content {
        padding: var(--nxt1-spacing-3, 0.75rem) !important;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      .uncommitted-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      .uncommitted-avatar {
        width: 40px !important;
        height: 40px !important;
        flex-shrink: 0;
      }

      .uncommitted-meta {
        flex: 1;
        min-width: 0;
      }

      .uncommitted-offers {
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

      /* ── Reduced motion ── */

      @media (prefers-reduced-motion: reduce) {
        .scroll-dot,
        .skeleton {
          animation: none !important;
          transition: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreAthletesMobileComponent {
  constructor() {
    addIcons({
      trendingUpOutline,
      trophyOutline,
      videocamOutline,
      schoolOutline,
      ribbonOutline,
      documentTextOutline,
      radioOutline,
      gridOutline,
      checkmarkCircle,
      starOutline,
      star: starIcon,
      chevronForwardOutline,
      flashOutline,
      megaphoneOutline,
      arrowUpOutline,
      arrowDownOutline,
      playCircleOutline,
    });
  }

  private readonly haptics = inject(HapticsService);

  // ── Math helper ───────────────────────────────────────────────────────────
  readonly Math = Math;

  // ── Skeleton iterables ────────────────────────────────────────────────────
  readonly skeletonItems3 = [1, 2, 3];
  readonly skeletonItems4 = [1, 2, 3, 4];
  readonly skeletonItems5 = [1, 2, 3, 4, 5];

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
  readonly scoutReports = signal<ScoutReport[]>(MOCK_SCOUT_REPORTS.slice(0, 3));
  readonly trackedAthletes = signal<TrackedAthlete[]>(MOCK_TRACKED);
  readonly uncommittedAthletes = signal<UncommittedAthlete[]>(MOCK_UNCOMMITTED);
  readonly classYears = signal(['2026', '2027', '2028']);

  // ── Helpers ───────────────────────────────────────────────────────────────

  getStarArray(count: number): number[] {
    return Array.from({ length: Math.min(count, 5) }, (_, i) => i);
  }

  // ── Interaction handlers — all fire HapticsService ────────────────────────

  async onHScroll(): Promise<void> {
    await this.haptics.impact('light');
  }

  onHeroScroll(): void {
    void this.haptics.impact('light');
  }

  async onProspectTap(_card: ProspectCard): Promise<void> {
    await this.haptics.impact('light');
    // Navigate to athlete profile
  }

  async onAthleteTap(_id: string): Promise<void> {
    await this.haptics.impact('light');
    // Navigate to athlete profile
  }

  async onVideoTap(_video: HighlightVideo): Promise<void> {
    await this.haptics.impact('light');
    // Open video player
  }

  async onWatchTapeMobile(_video: HighlightVideo): Promise<void> {
    await this.haptics.impact('medium');
    // Open full-screen video
  }

  async onScoutReportTap(_report: ScoutReport): Promise<void> {
    await this.haptics.impact('light');
    // Navigate to scout report detail
  }

  async onScoutReportBookmark(_reportId: string): Promise<void> {
    await this.haptics.impact('medium');
    // Bookmark the report
  }

  async setStatCategory(id: string): Promise<void> {
    await this.haptics.impact('light');
    this.activeStatCategory.set(id);
  }

  async setClassYear(year: string): Promise<void> {
    await this.haptics.impact('light');
    this.activeClassYear.set(year);
  }
}
