/**
 * @fileoverview Explore Teams Mobile Component — 6-Section Elite Dashboard
 * @module @nxt1/ui/explore/mobile
 * @version 1.0.0
 *
 * The ultimate "Teams" dashboard for the /explore route — Mobile (Ionic) variant.
 * Mirrors ExploreTeamsWebComponent but uses Ionic components for native UX.
 *
 * Sections:
 *  1. Verified Powerhouses — Hero carousel (no @defer — drives LCP)
 *  2. Regional Radar      — News & intel feed (@defer on viewport)
 *  3. Claim Your Program  — Growth-engine CTA banner (@defer on viewport)
 *  4. State Rankings      — Leaderboard tables (@defer on viewport)
 *  5. Roster Board        — Recently added athletes (@defer on viewport)
 *  6. Matchup Preview     — Upcoming game cards (@defer on viewport)
 *
 * ⭐ MOBILE ONLY — Ionic components, HapticsService on interactions ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  computed,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonList,
  IonBadge,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  chevronForwardOutline,
  calendarOutline,
  timeOutline,
  arrowForwardOutline,
  ribbonOutline,
} from 'ionicons/icons';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../services/logging/logging.service';

// ─── Mock data types ────────────────────────────────────────────────────────

interface VerifiedTeam {
  readonly id: string;
  readonly name: string;
  readonly sport: string;
  readonly state: string;
  readonly logoUrl: string;
  readonly coverUrl: string;
  readonly topAthletes: ReadonlyArray<{ readonly name: string; readonly avatarUrl: string }>;
  readonly isVerified: true;
}

interface RegionalNewsItem {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly publishedAt: string;
  readonly thumbnailUrl: string;
  readonly sourceName: string;
  readonly teamName?: string;
  readonly isTeamUnclaimed: boolean;
}

interface RankedTeam {
  readonly id: string;
  readonly rank: number;
  readonly name: string;
  readonly sport: string;
  readonly wins: number;
  readonly losses: number;
  readonly isVerified: boolean;
}

interface RosterAthlete {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string;
  readonly teamName: string;
  readonly position: string;
  readonly joinedAgo: string;
}

interface MatchupGame {
  readonly id: string;
  readonly date: string;
  readonly time: string;
  readonly location: string;
  readonly teamA: {
    readonly name: string;
    readonly logoUrl: string;
    readonly isVerified: boolean;
    readonly record: string;
  };
  readonly teamB: {
    readonly name: string;
    readonly logoUrl: string;
    readonly isVerified: boolean;
    readonly record: string;
  };
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_VERIFIED_TEAMS: readonly VerifiedTeam[] = [
  {
    id: 'vt1',
    name: 'Westlake Warriors',
    sport: 'Football',
    state: 'TX',
    logoUrl: '',
    coverUrl: '',
    topAthletes: [
      { name: 'Marcus J.', avatarUrl: '' },
      { name: 'Tyler R.', avatarUrl: '' },
      { name: 'Devon W.', avatarUrl: '' },
    ],
    isVerified: true,
  },
  {
    id: 'vt2',
    name: 'St. John\'s Prep',
    sport: 'Basketball',
    state: 'MA',
    logoUrl: '',
    coverUrl: '',
    topAthletes: [
      { name: 'James P.', avatarUrl: '' },
      { name: 'Kai M.', avatarUrl: '' },
      { name: 'Zion B.', avatarUrl: '' },
    ],
    isVerified: true,
  },
  {
    id: 'vt3',
    name: 'IMG Academy',
    sport: 'Football',
    state: 'FL',
    logoUrl: '',
    coverUrl: '',
    topAthletes: [
      { name: 'Malik T.', avatarUrl: '' },
      { name: 'Jordan S.', avatarUrl: '' },
      { name: 'Andre L.', avatarUrl: '' },
    ],
    isVerified: true,
  },
  {
    id: 'vt4',
    name: 'De La Salle',
    sport: 'Football',
    state: 'CA',
    logoUrl: '',
    coverUrl: '',
    topAthletes: [
      { name: 'Chris V.', avatarUrl: '' },
      { name: 'Ryan O.', avatarUrl: '' },
      { name: 'Diego F.', avatarUrl: '' },
    ],
    isVerified: true,
  },
  {
    id: 'vt5',
    name: 'Montverde Academy',
    sport: 'Basketball',
    state: 'FL',
    logoUrl: '',
    coverUrl: '',
    topAthletes: [
      { name: 'Isaiah D.', avatarUrl: '' },
      { name: 'Nathan C.', avatarUrl: '' },
      { name: 'Omar H.', avatarUrl: '' },
    ],
    isVerified: true,
  },
];

const MOCK_REGIONAL_NEWS: readonly RegionalNewsItem[] = [
  {
    id: 'rn1',
    title: 'Westlake Warriors Claim 6th Consecutive State Title',
    excerpt:
      'The Warriors dominated the championship game with a 42–14 victory, solidifying their legacy.',
    publishedAt: '2h ago',
    thumbnailUrl: '',
    sourceName: 'Texas High School Sports',
    teamName: 'Westlake Warriors',
    isTeamUnclaimed: false,
  },
  {
    id: 'rn2',
    title: 'Rising Star from Oak Ridge Draws Division I Interest',
    excerpt:
      'Multiple FBS programs have reached out to the junior linebacker after a standout playoff run.',
    publishedAt: '5h ago',
    thumbnailUrl: '',
    sourceName: 'Lone Star Preps',
    teamName: 'Oak Ridge War Eagles',
    isTeamUnclaimed: true,
  },
  {
    id: 'rn3',
    title: 'Allen Eagles Set New Scoring Record in Playoff Opener',
    excerpt: 'QB duo combined for 6 touchdowns as Allen cruised into the quarterfinals.',
    publishedAt: '1d ago',
    thumbnailUrl: '',
    sourceName: 'DFW Prep Sports',
    teamName: 'Allen Eagles',
    isTeamUnclaimed: true,
  },
];

const MOCK_RANKED_TEAMS: readonly RankedTeam[] = [
  { id: 'rt1', rank: 1, name: 'Westlake Warriors', sport: 'Football', wins: 16, losses: 0, isVerified: true },
  { id: 'rt2', rank: 2, name: 'Allen Eagles', sport: 'Football', wins: 15, losses: 1, isVerified: false },
  { id: 'rt3', rank: 3, name: 'Katy Tigers', sport: 'Football', wins: 14, losses: 1, isVerified: false },
  { id: 'rt4', rank: 4, name: 'North Shore Mustangs', sport: 'Football', wins: 14, losses: 2, isVerified: true },
  { id: 'rt5', rank: 5, name: 'Cedar Hill Longhorns', sport: 'Football', wins: 13, losses: 2, isVerified: false },
];

const MOCK_ROSTER_ATHLETES: readonly RosterAthlete[] = [
  { id: 'ra1', name: 'Marcus Johnson', avatarUrl: '', teamName: 'Westlake Warriors', position: 'QB', joinedAgo: '2h ago' },
  { id: 'ra2', name: 'Tyler Reed', avatarUrl: '', teamName: 'Allen Eagles', position: 'WR', joinedAgo: '3h ago' },
  { id: 'ra3', name: 'Devon Walsh', avatarUrl: '', teamName: 'Katy Tigers', position: 'DB', joinedAgo: '5h ago' },
  { id: 'ra4', name: 'Kai Martinez', avatarUrl: '', teamName: 'IMG Academy', position: 'LB', joinedAgo: '6h ago' },
  { id: 'ra5', name: 'Zion Brooks', avatarUrl: '', teamName: 'North Shore Mustangs', position: 'RB', joinedAgo: '8h ago' },
  { id: 'ra6', name: 'James Parker', avatarUrl: '', teamName: 'Cedar Hill Longhorns', position: 'DL', joinedAgo: '10h ago' },
];

const MOCK_MATCHUPS: readonly MatchupGame[] = [
  {
    id: 'mg1',
    date: 'Fri, Mar 7',
    time: '7:00 PM',
    location: 'Darrell K Royal Stadium — Austin, TX',
    teamA: { name: 'Westlake Warriors', logoUrl: '', isVerified: true, record: '16–0' },
    teamB: { name: 'Allen Eagles', logoUrl: '', isVerified: false, record: '15–1' },
  },
  {
    id: 'mg2',
    date: 'Sat, Mar 8',
    time: '2:00 PM',
    location: 'Berry Center — Houston, TX',
    teamA: { name: 'North Shore Mustangs', logoUrl: '', isVerified: true, record: '14–2' },
    teamB: { name: 'Katy Tigers', logoUrl: '', isVerified: false, record: '14–1' },
  },
];

// ─── Initials helper ─────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  selector: 'nxt1-explore-teams-mobile',
  standalone: true,
  imports: [
    CommonModule,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonList,
    IonBadge,
    IonButton,
    IonIcon,
  ],
  template: `
    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 1 — Verified Powerhouses (Hero Carousel)
         No @defer — drives LCP (Largest Contentful Paint)
         ══════════════════════════════════════════════════════════════════ -->
    <section class="teams-section teams-section--hero" aria-labelledby="s1-heading">
      <div class="section-header">
        <h2 id="s1-heading" class="section-title">
          <ion-icon name="ribbon-outline" class="section-icon" aria-hidden="true" />
          Verified Powerhouses
        </h2>
        <button type="button" class="see-all-btn" aria-label="See all verified programs" (click)="onSeeAllTap()">
          See All
          <ion-icon name="chevron-forward-outline" aria-hidden="true" />
        </button>
      </div>

      <!-- Horizontal snap-scroll carousel -->
      <div class="hero-carousel" role="list" aria-label="Verified team programs">
        @for (team of verifiedTeams(); track team.id) {
          <ion-card
            class="hero-card"
            role="listitem"
            button
            [attr.aria-label]="team.name + ' — Verified Program'"
            (click)="onTeamCardTap(team.id)"
          >
            <!-- Cover gradient background -->
            <div class="hero-card__cover" aria-hidden="true">
              @if (team.coverUrl) {
                <img [src]="team.coverUrl" [alt]="team.name" class="hero-card__cover-img" loading="eager" />
              }
              <div class="hero-card__cover-gradient"></div>
            </div>

            <ion-card-content class="hero-card__content">
              <!-- Verified badge -->
              <div class="verified-badge" role="status">
                <ion-icon name="checkmark-circle" class="verified-badge__icon" aria-hidden="true" />
                <span>Verified Program</span>
              </div>

              <!-- Top-3 athlete avatars -->
              <div class="hero-card__athletes" aria-label="Top athletes">
                @for (athlete of team.topAthletes; track athlete.name) {
                  <div class="athlete-avatar" [title]="athlete.name">
                    @if (athlete.avatarUrl) {
                      <img [src]="athlete.avatarUrl" [alt]="athlete.name" class="athlete-avatar__img" loading="lazy" />
                    } @else {
                      <span class="athlete-avatar__initials" aria-hidden="true">{{ getInitials(athlete.name) }}</span>
                    }
                  </div>
                }
              </div>

              <ion-card-title class="hero-card__team-name">{{ team.name }}</ion-card-title>
              <p class="hero-card__meta">{{ team.sport }} &bull; {{ team.state }}</p>
            </ion-card-content>
          </ion-card>
        }
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 2 — Regional Radar (News & Intel)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="teams-section" aria-labelledby="s2-heading">
        <div class="section-header">
          <h2 id="s2-heading" class="section-title">Regional Radar</h2>
          <button type="button" class="see-all-btn" aria-label="See all regional news" (click)="onSeeAllNewsTap()">
            See All <ion-icon name="chevron-forward-outline" aria-hidden="true" />
          </button>
        </div>

        <ion-list class="news-list" lines="none" aria-label="Regional team news">
          @for (article of regionalNews(); track article.id) {
            <!-- Reuses news card architecture patterns -->
            <ion-item
              class="news-item"
              button
              detail="false"
              [attr.aria-label]="article.title"
              (click)="onNewsTap(article.id)"
            >
              <!-- Thumbnail -->
              <div class="news-thumb" slot="start" aria-hidden="true">
                @if (article.thumbnailUrl) {
                  <img [src]="article.thumbnailUrl" [alt]="article.title" class="news-thumb__img" loading="lazy" />
                } @else {
                  <div class="news-thumb__placeholder"></div>
                }
                @if (article.isTeamUnclaimed && article.teamName) {
                  <span class="unclaimed-badge">Unclaimed</span>
                }
              </div>

              <ion-label class="news-label">
                @if (article.teamName) {
                  <p class="news-label__team">{{ article.teamName }}</p>
                }
                <h3 class="news-label__title">{{ article.title }}</h3>
                <p class="news-label__meta">
                  <span>{{ article.sourceName }}</span>
                  <span class="meta-sep" aria-hidden="true"> &bull; </span>
                  <time>{{ article.publishedAt }}</time>
                </p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      </section>
    } @placeholder {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2, 3]; track i) {
          <div class="skeleton-news-card animate-pulse"></div>
        }
      </div>
    } @loading (minimum 200ms) {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2, 3]; track i) {
          <div class="skeleton-news-card animate-pulse"></div>
        }
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 3 — Claim Your Program (Growth Engine CTA)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="cta-banner" aria-labelledby="s3-heading">
        <div class="cta-banner__glow" aria-hidden="true"></div>
        <ion-card class="cta-card" (click)="onCtaTap()">
          <ion-card-content class="cta-card__content">
            <div class="cta-card__text">
              <h2 id="s3-heading" class="cta-card__headline">Is Your Program Missing?</h2>
              <p class="cta-card__subhead">
                Get your athletes verified and on the radar of 500+ college coaches.
              </p>
            </div>
            <ion-button
              class="cta-card__btn"
              fill="solid"
              expand="block"
              aria-label="Claim your program"
              (click)="onCtaBtnTap($event)"
            >
              Claim Your Program
              <ion-icon name="arrow-forward-outline" slot="end" aria-hidden="true" />
            </ion-button>
          </ion-card-content>
        </ion-card>
      </section>
    } @placeholder {
      <div class="skeleton-cta animate-pulse" aria-hidden="true"></div>
    } @loading (minimum 200ms) {
      <div class="skeleton-cta animate-pulse" aria-hidden="true"></div>
    }

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 4 — State Rankings (Automated Leaderboards)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="teams-section" aria-labelledby="s4-heading">
        <div class="section-header">
          <h2 id="s4-heading" class="section-title">State Rankings</h2>
          <ion-badge class="sport-badge" aria-label="Football rankings">Football</ion-badge>
        </div>

        <ion-list class="rankings-list" lines="none" aria-label="State team rankings">
          @for (team of rankedTeams(); track team.id) {
            <ion-item
              class="rankings-item"
              [class.rankings-item--verified]="team.isVerified"
              [class.rankings-item--unverified]="!team.isVerified"
              [button]="team.isVerified"
              detail="false"
              [attr.aria-label]="'Rank ' + team.rank + ': ' + team.name + (team.isVerified ? ' — Verified' : ' — Unclaimed')"
              (click)="team.isVerified ? onRankedTeamTap(team.id) : null"
            >
              <!-- Rank -->
              <div class="rank-col" slot="start">
                <strong class="rank-number" [class.rank-number--top3]="team.rank <= 3">
                  {{ team.rank }}
                </strong>
              </div>

              <ion-label class="rankings-label">
                <div class="rankings-team-row">
                  <div class="rankings-logo" aria-hidden="true">
                    <span class="rankings-initials">{{ getInitials(team.name) }}</span>
                    @if (team.isVerified) {
                      <ion-icon name="checkmark-circle" class="rankings-verified-icon" aria-hidden="true" />
                    }
                  </div>
                  <span class="rankings-name">{{ team.name }}</span>
                </div>
              </ion-label>

              <!-- Record + Claim -->
              <div class="rankings-right" slot="end">
                <span class="rankings-record">{{ team.wins }}–{{ team.losses }}</span>
                @if (!team.isVerified) {
                  <button
                    type="button"
                    class="claim-btn"
                    [attr.aria-label]="'Claim ' + team.name"
                    (click)="onClaimTap(team.id, $event)"
                  >
                    Claim
                  </button>
                }
              </div>
            </ion-item>
          }
        </ion-list>
      </section>
    } @placeholder {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="skeleton-row animate-pulse"></div>
        }
      </div>
    } @loading (minimum 200ms) {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="skeleton-row animate-pulse"></div>
        }
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 5 — Roster Board (Recently Added Athletes)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="teams-section" aria-labelledby="s5-heading">
        <div class="section-header">
          <h2 id="s5-heading" class="section-title">Roster Board</h2>
          <span class="section-subtitle">Recently Added</span>
        </div>

        <div class="roster-ticker" role="list" aria-label="Recently added athletes">
          @for (athlete of rosterAthletes(); track athlete.id) {
            <ion-card
              class="roster-card"
              button
              role="listitem"
              [attr.aria-label]="athlete.name + ' added to ' + athlete.teamName"
              (click)="onRosterAthleteTap(athlete.id)"
            >
              <ion-card-content class="roster-card__content">
                <!-- Avatar -->
                <div class="roster-avatar" aria-hidden="true">
                  @if (athlete.avatarUrl) {
                    <img [src]="athlete.avatarUrl" [alt]="athlete.name" class="roster-avatar__img" loading="lazy" />
                  } @else {
                    <span class="roster-avatar__initials">{{ getInitials(athlete.name) }}</span>
                  }
                </div>

                <!-- Info -->
                <p class="roster-card__name">{{ athlete.name }}</p>
                <p class="roster-card__position">{{ athlete.position }}</p>
                <span class="roster-card__team-badge">{{ athlete.teamName }}</span>
                <time class="roster-card__time">{{ athlete.joinedAgo }}</time>
              </ion-card-content>
            </ion-card>
          }
        </div>
      </section>
    } @placeholder {
      <div class="section-skeleton" aria-hidden="true">
        <div class="roster-ticker">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-roster-card animate-pulse"></div>
          }
        </div>
      </div>
    } @loading (minimum 200ms) {
      <div class="section-skeleton" aria-hidden="true">
        <div class="roster-ticker">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-roster-card animate-pulse"></div>
          }
        </div>
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 6 — Matchup Preview (Upcoming Games)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="teams-section teams-section--last" aria-labelledby="s6-heading">
        <div class="section-header">
          <h2 id="s6-heading" class="section-title">Matchup Preview</h2>
          <ion-badge class="live-badge" aria-label="Game of the week">Game of Week</ion-badge>
        </div>

        <div class="matchup-list" role="list" aria-label="Upcoming high-profile games">
          @for (game of matchups(); track game.id) {
            <ion-card
              class="matchup-card"
              button
              role="listitem"
              [attr.aria-label]="game.teamA.name + ' vs ' + game.teamB.name"
              (click)="onMatchupTap(game.id)"
            >
              <ion-card-content class="matchup-card__content">
                <!-- Teams split-screen -->
                <div class="matchup-teams">
                  <!-- Team A -->
                  <div class="matchup-team matchup-team--a">
                    <div
                      class="matchup-logo"
                      [class.matchup-logo--verified]="game.teamA.isVerified"
                      aria-hidden="true"
                    >
                      <span class="matchup-initials">{{ getInitials(game.teamA.name) }}</span>
                      @if (game.teamA.isVerified) {
                        <span class="matchup-glow" aria-hidden="true"></span>
                      }
                    </div>
                    <p class="matchup-team__name">{{ game.teamA.name }}</p>
                    <p class="matchup-team__record">{{ game.teamA.record }}</p>
                    @if (game.teamA.isVerified) {
                      <ion-icon name="checkmark-circle" class="matchup-verified-icon" aria-label="NXT1 Verified" />
                    }
                  </div>

                  <!-- VS divider -->
                  <div class="matchup-vs" aria-hidden="true">
                    <span class="matchup-vs__text">VS</span>
                  </div>

                  <!-- Team B -->
                  <div class="matchup-team matchup-team--b">
                    <div
                      class="matchup-logo"
                      [class.matchup-logo--verified]="game.teamB.isVerified"
                      aria-hidden="true"
                    >
                      <span class="matchup-initials">{{ getInitials(game.teamB.name) }}</span>
                      @if (game.teamB.isVerified) {
                        <span class="matchup-glow" aria-hidden="true"></span>
                      }
                    </div>
                    <p class="matchup-team__name">{{ game.teamB.name }}</p>
                    <p class="matchup-team__record">{{ game.teamB.record }}</p>
                    @if (game.teamB.isVerified) {
                      <ion-icon name="checkmark-circle" class="matchup-verified-icon" aria-label="NXT1 Verified" />
                    }
                  </div>
                </div>

                <!-- Game details -->
                <div class="matchup-footer">
                  <div class="matchup-details">
                    <span class="matchup-detail">
                      <ion-icon name="calendar-outline" aria-hidden="true" />
                      <time>{{ game.date }}</time>
                    </span>
                    <span class="matchup-detail">
                      <ion-icon name="time-outline" aria-hidden="true" />
                      {{ game.time }}
                    </span>
                  </div>
                  <ion-button
                    class="view-rosters-btn"
                    fill="clear"
                    size="small"
                    [attr.aria-label]="'View rosters for ' + game.teamA.name + ' vs ' + game.teamB.name"
                    (click)="onViewRostersTap(game.id, $event)"
                  >
                    View Rosters
                    <ion-icon name="chevron-forward-outline" slot="end" aria-hidden="true" />
                  </ion-button>
                </div>
              </ion-card-content>
            </ion-card>
          }
        </div>
      </section>
    } @placeholder {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2]; track i) {
          <div class="skeleton-matchup-card animate-pulse"></div>
        }
      </div>
    } @loading (minimum 200ms) {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2]; track i) {
          <div class="skeleton-matchup-card animate-pulse"></div>
        }
      </div>
    }
  `,
  styles: [
    `
      /* ============================================================
         EXPLORE TEAMS — Mobile / Ionic (Design Tokens Only)
         Ionic components inherit --nxt1-* tokens via --ion-* mapping.
         Tailwind used for layout only. Zero hardcoded colors.
         ============================================================ */

      :host {
        display: block;

        /* ── Token Aliases (component-scoped) ── */
        --t-bg:          var(--nxt1-color-bg-primary);
        --t-surface-1:   var(--nxt1-color-surface-100);
        --t-surface-2:   var(--nxt1-color-surface-200);
        --t-surface-3:   var(--nxt1-color-surface-300);
        --t-border:      var(--nxt1-color-border);
        --t-border-sub:  var(--nxt1-color-border-subtle, var(--nxt1-color-border));
        --t-border-pri:  var(--nxt1-color-border-primary, var(--nxt1-color-primary));
        --t-text-1:      var(--nxt1-color-text-primary);
        --t-text-2:      var(--nxt1-color-text-secondary);
        --t-text-3:      var(--nxt1-color-text-tertiary);
        --t-text-inv:    var(--nxt1-color-text-inverse);
        --t-primary:     var(--nxt1-color-primary);
        --t-on-primary:  var(--nxt1-color-on-primary);
        --t-success:     var(--nxt1-color-success);
        --t-radius-sm:   var(--nxt1-radius-sm, 8px);
        --t-radius-md:   var(--nxt1-radius-md, 12px);
        --t-radius-lg:   var(--nxt1-radius-lg, 16px);
        --t-radius-full: var(--nxt1-radius-full, 9999px);
        --t-dur-fast:    var(--nxt1-duration-fast, 150ms);
        --t-dur-base:    var(--nxt1-duration-base, 250ms);
      }

      /* ── Skeleton pulse animation ── */

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .animate-pulse { animation: pulse 1.5s ease-in-out infinite; }

      /* ── Section wrapper ── */

      .teams-section {
        padding: var(--nxt1-spacing-5, 20px) 0 0;
      }

      .teams-section--hero {
        padding-top: var(--nxt1-spacing-3, 12px);
      }

      .teams-section--last {
        padding-bottom: var(--nxt1-spacing-10, 40px);
      }

      /* ── Section header ── */

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
        font-size: var(--nxt1-fontSize-base, 16px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-1);
        letter-spacing: -0.2px;
        margin: 0;
      }

      .section-icon {
        font-size: 16px;
        color: var(--t-primary);
      }

      .section-subtitle {
        font-size: var(--nxt1-fontSize-sm, 13px);
        color: var(--t-text-3);
      }

      .see-all-btn {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--t-primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .see-all-btn ion-icon { font-size: 14px; }

      .sport-badge {
        --background: var(--t-surface-2);
        --color: var(--t-text-2);
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      .live-badge {
        --background: color-mix(in srgb, var(--t-primary) 12%, transparent);
        --color: var(--t-primary);
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
      }

      /* ══════════════════════════════════════════════════════
         SECTION 1 — Hero Carousel
         ══════════════════════════════════════════════════════ */

      .hero-carousel {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .hero-carousel::-webkit-scrollbar { display: none; }

      .hero-card {
        flex-shrink: 0;
        width: 260px;
        height: 320px;
        scroll-snap-align: start;
        position: relative;
        overflow: hidden;
        --background: var(--t-surface-2);
        --border-radius: var(--t-radius-lg);
        border: 1px solid var(--t-border);
        margin: 0;
      }

      .hero-card::part(native) {
        background: transparent;
        padding: 0;
      }

      .hero-card__cover {
        position: absolute;
        inset: 0;
        background: var(--t-surface-2);
      }

      .hero-card__cover-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .hero-card__cover-gradient {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          transparent 20%,
          color-mix(in srgb, var(--nxt1-color-bg-primary, #000) 60%, transparent) 60%,
          var(--nxt1-color-bg-primary, #000) 100%
        );
      }

      .hero-card__content {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        background: color-mix(in srgb, var(--t-surface-1) 80%, transparent);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-top: 1px solid var(--t-border);
      }

      .verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: var(--t-radius-full);
        border: 1px solid var(--t-border-pri);
        background: color-mix(in srgb, var(--t-primary) 10%, transparent);
        color: var(--t-primary);
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.3px;
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      .verified-badge__icon { font-size: 12px; }

      .hero-card__athletes {
        display: flex;
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      .athlete-avatar {
        width: 28px;
        height: 28px;
        border-radius: var(--t-radius-full);
        border: 2px solid var(--t-surface-1);
        background: var(--t-surface-3);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: -7px;
        flex-shrink: 0;
      }

      .hero-card__athletes .athlete-avatar:first-child { margin-left: 0; }

      .athlete-avatar__img { width: 100%; height: 100%; object-fit: cover; }

      .athlete-avatar__initials {
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-1);
      }

      .hero-card__team-name {
        font-size: var(--nxt1-fontSize-base, 16px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-inv);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .hero-card__meta {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: color-mix(in srgb, var(--t-text-inv) 65%, transparent);
        margin: 2px 0 0;
      }

      /* ══════════════════════════════════════════════════════
         SECTION 2 — Regional Radar (News card architecture)
         ══════════════════════════════════════════════════════ */

      .news-list {
        --background: transparent;
        padding: 0 var(--nxt1-spacing-2, 8px);
      }

      .news-item {
        --background: var(--t-surface-1);
        --border-color: var(--t-border-sub);
        --inner-border-width: 0 0 1px 0;
        --padding-start: var(--nxt1-spacing-3, 12px);
        --inner-padding-end: var(--nxt1-spacing-3, 12px);
        --padding-top: var(--nxt1-spacing-3, 12px);
        --padding-bottom: var(--nxt1-spacing-3, 12px);
        border-radius: 0;
      }

      .news-thumb {
        position: relative;
        width: 90px;
        height: 68px;
        border-radius: var(--t-radius-md);
        overflow: hidden;
        background: var(--t-surface-2);
        margin-right: var(--nxt1-spacing-3, 12px);
        flex-shrink: 0;
      }

      .news-thumb__img { width: 100%; height: 100%; object-fit: cover; }

      .news-thumb__placeholder {
        width: 100%;
        height: 100%;
        background: var(--t-surface-3);
      }

      .unclaimed-badge {
        position: absolute;
        bottom: 3px;
        left: 3px;
        padding: 2px 5px;
        border-radius: var(--t-radius-full);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.3px;
        text-transform: uppercase;
        background: var(--t-surface-2);
        color: var(--t-text-3);
        border: 1px solid var(--t-border-sub);
      }

      .news-label {
        --color: var(--t-text-1);
      }

      .news-label__team {
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-primary);
        margin: 0 0 3px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .news-label__title {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-1);
        margin: 0 0 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: var(--nxt1-lineHeight-tight, 1.3);
      }

      .news-label__meta {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--t-text-3);
        margin: 0;
      }

      .meta-sep { opacity: 0.5; }

      /* ══════════════════════════════════════════════════════
         SECTION 3 — CTA Banner
         ══════════════════════════════════════════════════════ */

      .cta-banner {
        position: relative;
        margin: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px) 0;
      }

      .cta-banner__glow {
        position: absolute;
        inset: 0;
        pointer-events: none;
        border-radius: var(--t-radius-lg);
        box-shadow: 0 0 15px color-mix(in srgb, var(--t-primary) 20%, transparent);
        z-index: 0;
      }

      .cta-card {
        position: relative;
        z-index: 1;
        --background: var(--t-surface-2);
        --border-radius: var(--t-radius-lg);
        border: 1px solid var(--t-border-pri);
        margin: 0;
      }

      .cta-card__content {
        padding: var(--nxt1-spacing-5, 20px);
      }

      .cta-card__text { margin-bottom: var(--nxt1-spacing-4, 16px); }

      .cta-card__headline {
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: var(--nxt1-fontWeight-bold, 800);
        color: var(--t-text-1);
        margin: 0 0 var(--nxt1-spacing-1, 4px);
        letter-spacing: -0.4px;
      }

      .cta-card__subhead {
        font-size: var(--nxt1-fontSize-sm, 14px);
        color: var(--t-text-2);
        margin: 0;
        line-height: var(--nxt1-lineHeight-snug, 1.45);
      }

      .cta-card__btn {
        --background: var(--t-primary);
        --color: var(--t-on-primary);
        --border-radius: var(--t-radius-full);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        margin: 0;
      }

      /* ══════════════════════════════════════════════════════
         SECTION 4 — State Rankings
         ══════════════════════════════════════════════════════ */

      .rankings-list {
        --background: transparent;
        background: var(--t-surface-2);
        border-radius: var(--t-radius-md);
        overflow: hidden;
        margin: 0 var(--nxt1-spacing-4, 16px);
        border: 1px solid var(--t-border-sub);
        padding: 0;
      }

      .rankings-item {
        --background: transparent;
        --border-color: var(--t-border-sub);
        --inner-border-width: 0 0 1px 0;
        --min-height: 48px;
      }

      .rankings-item--verified {
        --background: var(--t-surface-3);
      }

      .rankings-item--unverified { opacity: 0.7; }

      .rank-col {
        width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: var(--nxt1-spacing-2, 8px);
      }

      .rank-number {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-2);
      }

      .rank-number--top3 { color: var(--t-primary); }

      .rankings-team-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .rankings-logo {
        position: relative;
        width: 26px;
        height: 26px;
        border-radius: var(--t-radius-sm);
        background: var(--t-surface-3);
        border: 1px solid var(--t-border);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .rankings-initials {
        font-size: 8px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-2);
        letter-spacing: -0.3px;
      }

      .rankings-verified-icon {
        position: absolute;
        bottom: -3px;
        right: -3px;
        font-size: 9px;
        color: var(--t-primary);
      }

      .rankings-name {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-1);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .rankings-right {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .rankings-record {
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-3);
      }

      .claim-btn {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: var(--t-radius-full);
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-primary);
        background: color-mix(in srgb, var(--t-primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--t-primary) 30%, transparent);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      /* ══════════════════════════════════════════════════════
         SECTION 5 — Roster Board
         ══════════════════════════════════════════════════════ */

      .roster-ticker {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .roster-ticker::-webkit-scrollbar { display: none; }

      .roster-card {
        flex-shrink: 0;
        width: 160px;
        scroll-snap-align: start;
        --background: var(--t-surface-1);
        --border-radius: var(--t-radius-md);
        border: 1px solid var(--t-border-sub);
        margin: 0;
        text-align: center;
      }

      .roster-card__content {
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-2, 8px);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .roster-avatar {
        width: 44px;
        height: 44px;
        border-radius: var(--t-radius-full);
        background: var(--t-surface-3);
        border: 2px solid var(--t-border);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }

      .roster-avatar__img { width: 100%; height: 100%; object-fit: cover; }

      .roster-avatar__initials {
        font-size: 14px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-2);
      }

      .roster-card__name {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-1);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .roster-card__position {
        font-size: var(--nxt1-fontSize-xs, 11px);
        color: var(--t-text-3);
        margin: 0;
      }

      .roster-card__team-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: var(--t-radius-full);
        font-size: var(--nxt1-fontSize-2xs, 10px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        background: var(--t-surface-2);
        color: var(--t-text-2);
        border: 1px solid var(--t-border-sub);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .roster-card__time {
        font-size: var(--nxt1-fontSize-2xs, 10px);
        color: var(--t-text-3);
      }

      /* ══════════════════════════════════════════════════════
         SECTION 6 — Matchup Preview
         ══════════════════════════════════════════════════════ */

      .matchup-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px);
      }

      .matchup-card {
        --background: var(--t-surface-2);
        --border-radius: var(--t-radius-lg);
        border: 1px solid var(--t-border);
        margin: 0;
      }

      .matchup-card__content {
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-3, 12px);
      }

      .matchup-teams {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .matchup-team {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        text-align: center;
      }

      .matchup-logo {
        position: relative;
        width: 52px;
        height: 52px;
        border-radius: var(--t-radius-md);
        background: var(--t-surface-3);
        border: 1px solid var(--t-border);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .matchup-logo--verified {
        border-color: color-mix(in srgb, var(--t-primary) 50%, transparent);
      }

      .matchup-glow {
        position: absolute;
        inset: -3px;
        border-radius: inherit;
        box-shadow: 0 0 10px color-mix(in srgb, var(--t-primary) 30%, transparent);
        pointer-events: none;
      }

      .matchup-initials {
        font-size: var(--nxt1-fontSize-base, 15px);
        font-weight: var(--nxt1-fontWeight-bold, 800);
        color: var(--t-text-2);
        letter-spacing: -0.5px;
      }

      .matchup-team__name {
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-1);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100px;
      }

      .matchup-team__record {
        font-size: var(--nxt1-fontSize-2xs, 10px);
        color: var(--t-text-3);
        margin: 0;
      }

      .matchup-verified-icon {
        font-size: 14px;
        color: var(--t-primary);
      }

      .matchup-vs {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .matchup-vs__text {
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-bold, 900);
        color: var(--t-text-3);
        letter-spacing: 1px;
      }

      .matchup-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: var(--nxt1-spacing-2, 8px);
        border-top: 1px solid var(--t-border-sub);
        gap: var(--nxt1-spacing-2, 8px);
      }

      .matchup-details {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .matchup-detail {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--nxt1-fontSize-xs, 11px);
        color: var(--t-text-2);
      }

      .matchup-detail ion-icon { font-size: 13px; }

      .view-rosters-btn {
        --color: var(--t-primary);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        margin: 0;
        --padding-start: var(--nxt1-spacing-2, 8px);
        --padding-end: var(--nxt1-spacing-2, 8px);
        height: auto;
        flex-shrink: 0;
      }

      /* ══════════════════════════════════════════════════════
         SKELETON LOADERS
         ══════════════════════════════════════════════════════ */

      .section-skeleton {
        padding: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px) 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .skeleton-news-card {
        height: 76px;
        border-radius: var(--t-radius-md);
        background: var(--t-surface-3);
      }

      .skeleton-row {
        height: 46px;
        border-radius: var(--t-radius-md);
        background: var(--t-surface-3);
      }

      .skeleton-cta {
        height: 130px;
        margin: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px) 0;
        border-radius: var(--t-radius-lg);
        background: var(--t-surface-3);
      }

      .skeleton-roster-card {
        flex-shrink: 0;
        width: 160px;
        height: 140px;
        border-radius: var(--t-radius-md);
        background: var(--t-surface-3);
      }

      .skeleton-matchup-card {
        height: 148px;
        border-radius: var(--t-radius-lg);
        background: var(--t-surface-3);
      }

      /* ══════════════════════════════════════════════════════
         REDUCED MOTION
         ══════════════════════════════════════════════════════ */

      @media (prefers-reduced-motion: reduce) {
        .animate-pulse { animation: none; }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreTeamsMobileComponent {
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('ExploreTeamsMobile');

  // ── State (Angular Signals) ──────────────────────────────────────────────

  readonly verifiedTeams = signal<readonly VerifiedTeam[]>(MOCK_VERIFIED_TEAMS);
  readonly regionalNews = signal<readonly RegionalNewsItem[]>(MOCK_REGIONAL_NEWS);
  readonly rankedTeams = signal<readonly RankedTeam[]>(MOCK_RANKED_TEAMS);
  readonly rosterAthletes = signal<readonly RosterAthlete[]>(MOCK_ROSTER_ATHLETES);
  readonly matchups = signal<readonly MatchupGame[]>(MOCK_MATCHUPS);

  // ── Computed ────────────────────────────────────────────────────────────

  readonly verifiedCount = computed(() => this.verifiedTeams().length);
  readonly topRankedTeam = computed(() => this.rankedTeams()[0] ?? null);

  // ── Template helpers ────────────────────────────────────────────────────

  protected readonly getInitials = getInitials;

  // ── Interaction handlers (all with haptics) ──────────────────────────────

  async onTeamCardTap(teamId: string): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('Verified team card tapped', { teamId });
  }

  async onSeeAllTap(): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('See all verified teams tapped');
  }

  async onSeeAllNewsTap(): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('See all news tapped');
  }

  async onNewsTap(articleId: string): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('News article tapped', { articleId });
  }

  async onCtaTap(): Promise<void> {
    await this.haptics.impact('medium');
    this.logger.debug('CTA card tapped');
  }

  async onCtaBtnTap(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('medium');
    this.logger.debug('Claim program CTA button tapped');
  }

  async onRankedTeamTap(teamId: string): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('Ranked team tapped', { teamId });
  }

  async onClaimTap(teamId: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('medium');
    this.logger.debug('Claim button tapped', { teamId });
  }

  async onRosterAthleteTap(athleteId: string): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('Roster athlete tapped', { athleteId });
  }

  async onMatchupTap(gameId: string): Promise<void> {
    await this.haptics.impact('light');
    this.logger.debug('Matchup card tapped', { gameId });
  }

  async onViewRostersTap(gameId: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('light');
    this.logger.debug('View rosters tapped', { gameId });
  }

  // Register icons in constructor
  constructor() {
    addIcons({
      checkmarkCircle,
      chevronForwardOutline,
      calendarOutline,
      timeOutline,
      arrowForwardOutline,
      ribbonOutline,
    });
    this.logger.info('ExploreTeamsMobile initialized');
  }
}
