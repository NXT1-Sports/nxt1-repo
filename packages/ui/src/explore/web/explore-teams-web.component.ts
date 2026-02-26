/**
 * @fileoverview Explore Teams Web Component — 6-Section Elite Dashboard
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * The ultimate "Teams" dashboard for the /explore route.
 * 6 growth-optimized sections with zero hardcoded colors.
 * 100% SSR-safe semantic HTML, zero Ionic dependencies.
 *
 * Sections:
 *  1. Verified Powerhouses — Hero carousel (no @defer — drives LCP)
 *  2. Regional Radar      — News & intel feed (@defer on viewport)
 *  3. Claim Your Program  — Growth-engine CTA banner (@defer on viewport)
 *  4. State Rankings      — Leaderboard tables (@defer on viewport)
 *  5. Roster Board        — Recently added athletes (@defer on viewport)
 *  6. Matchup Preview     — Upcoming game cards (@defer on viewport)
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  computed,
  signal,
  afterNextRender,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
  selector: 'nxt1-explore-teams-web',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 1 — Verified Powerhouses (Hero Carousel)
         No @defer — drives LCP (Largest Contentful Paint)
         ══════════════════════════════════════════════════════════════════ -->
    <section class="teams-section teams-section--hero" aria-labelledby="s1-heading">
      <header class="section-header">
        <h2 id="s1-heading" class="section-title">
          <span class="verified-dot" aria-hidden="true">✦</span>
          Verified Powerhouses
        </h2>
        <button type="button" class="see-all-btn" aria-label="See all verified programs">
          See All
          <svg class="see-all-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </header>

      <!-- Horizontal snap-scroll carousel -->
      <div class="hero-carousel" role="list" aria-label="Verified team programs">
        @for (team of verifiedTeams(); track team.id) {
          <article class="hero-card" role="listitem" [attr.aria-label]="team.name + ' — Verified Program'">
            <!-- Cover image / gradient background -->
            <div class="hero-card__cover" aria-hidden="true">
              @if (team.coverUrl) {
                <img [src]="team.coverUrl" [alt]="team.name + ' team photo'" class="hero-card__cover-img" loading="eager" />
              }
              <div class="hero-card__cover-gradient"></div>
            </div>

            <!-- Content overlay (frosted glass) -->
            <div class="hero-card__overlay">
              <!-- Verified badge -->
              <div class="verified-badge" role="status" aria-label="Verified Program">
                <svg class="verified-badge__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-.051 3.262 3.745 3.745 0 01-3.296 1.043 3.745 3.745 0 01-3.068 1.593c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.262-.051 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 01.051-3.262 3.745 3.745 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.262.051 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
                <span>Verified Program</span>
              </div>

              <!-- Team info -->
              <div class="hero-card__info">
                <!-- Top-3 athlete avatars -->
                <div class="hero-card__athletes" aria-label="Top athletes">
                  @for (athlete of team.topAthletes; track athlete.name) {
                    <div
                      class="athlete-avatar"
                      [attr.title]="athlete.name"
                      [attr.aria-label]="athlete.name"
                    >
                      @if (athlete.avatarUrl) {
                        <img [src]="athlete.avatarUrl" [alt]="athlete.name" class="athlete-avatar__img" loading="lazy" />
                      } @else {
                        <span class="athlete-avatar__initials" aria-hidden="true">{{ getInitials(athlete.name) }}</span>
                      }
                    </div>
                  }
                </div>

                <h3 class="hero-card__team-name">{{ team.name }}</h3>
                <p class="hero-card__meta">{{ team.sport }} &bull; {{ team.state }}</p>
              </div>
            </div>
          </article>
        }
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 2 — Regional Radar (News & Intel)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="teams-section" aria-labelledby="s2-heading">
        <header class="section-header">
          <h2 id="s2-heading" class="section-title">Regional Radar</h2>
          <button type="button" class="see-all-btn" aria-label="See all regional news">
            See All
            <svg class="see-all-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </header>

        <div class="news-list" role="list" aria-label="Regional team news">
          @for (article of regionalNews(); track article.id) {
            <!-- Reuses the existing news card architecture via CSS class conventions -->
            <article class="news-card" role="listitem" tabindex="0" [attr.aria-label]="article.title">
              <!-- Thumbnail -->
              <div class="news-card__image-wrapper" aria-hidden="true">
                @if (article.thumbnailUrl) {
                  <img [src]="article.thumbnailUrl" [alt]="article.title" class="news-card__image" loading="lazy" />
                } @else {
                  <div class="news-card__image-placeholder"></div>
                }
                <!-- Unclaimed Program tag -->
                @if (article.isTeamUnclaimed && article.teamName) {
                  <span class="unclaimed-badge" aria-label="Unclaimed program">Unclaimed Program</span>
                }
              </div>

              <!-- Content -->
              <div class="news-card__content">
                @if (article.teamName) {
                  <p class="news-card__team-label">{{ article.teamName }}</p>
                }
                <h3 class="news-card__title">{{ article.title }}</h3>
                <p class="news-card__excerpt">{{ article.excerpt }}</p>

                <footer class="news-card__meta-bar">
                  <span class="news-card__source">{{ article.sourceName }}</span>
                  <span class="news-card__separator" aria-hidden="true">&bull;</span>
                  <time class="news-card__time">{{ article.publishedAt }}</time>
                </footer>
              </div>
            </article>
          }
        </div>
      </section>
    } @placeholder {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2, 3]; track i) {
          <div class="skeleton-news-card"></div>
        }
      </div>
    } @loading (minimum 200ms) {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2, 3]; track i) {
          <div class="skeleton-news-card"></div>
        }
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 3 — Claim Your Program (Growth Engine CTA)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="cta-banner" aria-labelledby="s3-heading">
        <div class="cta-banner__glow" aria-hidden="true"></div>
        <div class="cta-banner__content">
          <div class="cta-banner__text">
            <h2 id="s3-heading" class="cta-banner__headline">Is Your Program Missing?</h2>
            <p class="cta-banner__subhead">
              Get your athletes verified and on the radar of 500+ college coaches.
            </p>
          </div>
          <button type="button" class="btn-primary cta-banner__cta" aria-label="Claim your program">
            Claim Your Program
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </section>
    } @placeholder {
      <div class="skeleton-cta" aria-hidden="true"></div>
    } @loading (minimum 200ms) {
      <div class="skeleton-cta" aria-hidden="true"></div>
    }

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 4 — State Rankings (Automated Leaderboards)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="teams-section" aria-labelledby="s4-heading">
        <header class="section-header">
          <h2 id="s4-heading" class="section-title">State Rankings</h2>
          <span class="section-badge" aria-label="Football rankings">Football</span>
        </header>

        <div class="rankings-table" role="table" aria-label="State team rankings">
          <div class="rankings-table__header" role="row">
            <span role="columnheader" class="rankings-col rankings-col--rank">#</span>
            <span role="columnheader" class="rankings-col rankings-col--team">Team</span>
            <span role="columnheader" class="rankings-col rankings-col--record">W–L</span>
            <span role="columnheader" class="rankings-col rankings-col--action sr-only">Action</span>
          </div>

          @for (team of rankedTeams(); track team.id) {
            <div
              class="rankings-row"
              [class.rankings-row--verified]="team.isVerified"
              [class.rankings-row--unverified]="!team.isVerified"
              role="row"
              [attr.tabindex]="team.isVerified ? 0 : -1"
              [attr.aria-label]="'Rank ' + team.rank + ': ' + team.name + (team.isVerified ? ' — Verified' : ' — Unclaimed')"
            >
              <span class="rankings-col rankings-col--rank" role="cell">
                <strong class="rank-number" [class.rank-number--top3]="team.rank <= 3">{{ team.rank }}</strong>
              </span>

              <div class="rankings-col rankings-col--team" role="cell">
                <div class="rankings-team-logo" aria-hidden="true">
                  <span class="rankings-team-initials">{{ getInitials(team.name) }}</span>
                  @if (team.isVerified) {
                    <span class="rankings-verified-dot" aria-hidden="true">✦</span>
                  }
                </div>
                <span class="rankings-team-name">{{ team.name }}</span>
              </div>

              <span class="rankings-col rankings-col--record" role="cell">
                {{ team.wins }}–{{ team.losses }}
              </span>

              <div class="rankings-col rankings-col--action" role="cell">
                @if (!team.isVerified) {
                  <button
                    type="button"
                    class="claim-btn"
                    [attr.aria-label]="'Claim ' + team.name + ' program'"
                  >
                    Claim
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </section>
    } @placeholder {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="skeleton-row"></div>
        }
      </div>
    } @loading (minimum 200ms) {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="skeleton-row"></div>
        }
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 5 — Roster Board (Recently Added Athletes)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="teams-section" aria-labelledby="s5-heading">
        <header class="section-header">
          <h2 id="s5-heading" class="section-title">Roster Board</h2>
          <p class="section-subtitle" aria-label="Recently added to team rosters">Recently Added</p>
        </header>

        <div class="roster-ticker" role="list" aria-label="Recently added athletes">
          @for (athlete of rosterAthletes(); track athlete.id) {
            <article class="roster-card" role="listitem" tabindex="0" [attr.aria-label]="athlete.name + ' added to ' + athlete.teamName">
              <!-- Avatar -->
              <div class="roster-card__avatar" aria-hidden="true">
                @if (athlete.avatarUrl) {
                  <img [src]="athlete.avatarUrl" [alt]="athlete.name" class="roster-card__avatar-img" loading="lazy" />
                } @else {
                  <span class="roster-card__avatar-initials">{{ getInitials(athlete.name) }}</span>
                }
              </div>

              <!-- Info -->
              <div class="roster-card__info">
                <p class="roster-card__name">{{ athlete.name }}</p>
                <p class="roster-card__position">{{ athlete.position }}</p>
                <span class="roster-card__team-badge" [attr.aria-label]="'Team: ' + athlete.teamName">
                  {{ athlete.teamName }}
                </span>
              </div>

              <!-- Added time -->
              <time class="roster-card__time">{{ athlete.joinedAgo }}</time>
            </article>
          }
        </div>
      </section>
    } @placeholder {
      <div class="section-skeleton" aria-hidden="true">
        <div class="roster-ticker">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-roster-card"></div>
          }
        </div>
      </div>
    } @loading (minimum 200ms) {
      <div class="section-skeleton" aria-hidden="true">
        <div class="roster-ticker">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-roster-card"></div>
          }
        </div>
      </div>
    }

    <!-- ══════════════════════════════════════════════════════════════════
         SECTION 6 — Matchup Preview (Upcoming Games)
         ══════════════════════════════════════════════════════════════════ -->
    @defer (on viewport) {
      <section class="teams-section teams-section--last" aria-labelledby="s6-heading">
        <header class="section-header">
          <h2 id="s6-heading" class="section-title">Matchup Preview</h2>
          <span class="section-badge section-badge--live" aria-label="Game of the week">Game of the Week</span>
        </header>

        <div class="matchup-list" role="list" aria-label="Upcoming high-profile games">
          @for (game of matchups(); track game.id) {
            <article class="matchup-card" role="listitem" [attr.aria-label]="game.teamA.name + ' vs ' + game.teamB.name">
              <!-- Teams split-screen -->
              <div class="matchup-card__teams">
                <!-- Team A -->
                <div class="matchup-team matchup-team--a">
                  <div class="matchup-team__logo" [class.matchup-team__logo--verified]="game.teamA.isVerified" aria-hidden="true">
                    <span class="matchup-team__initials">{{ getInitials(game.teamA.name) }}</span>
                    @if (game.teamA.isVerified) {
                      <span class="matchup-verified-glow" aria-hidden="true"></span>
                    }
                  </div>
                  <p class="matchup-team__name">{{ game.teamA.name }}</p>
                  <p class="matchup-team__record">{{ game.teamA.record }}</p>
                  @if (game.teamA.isVerified) {
                    <span class="matchup-team__verified-badge" aria-label="NXT1 Verified">
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-.051 3.262 3.745 3.745 0 01-3.296 1.043 3.745 3.745 0 01-3.068 1.593c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.262-.051 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 01.051-3.262 3.745 3.745 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.262.051 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                      </svg>
                    </span>
                  }
                </div>

                <!-- VS divider -->
                <div class="matchup-vs" aria-hidden="true">
                  <span class="matchup-vs__text">VS</span>
                  <div class="matchup-vs__line"></div>
                </div>

                <!-- Team B -->
                <div class="matchup-team matchup-team--b">
                  <div class="matchup-team__logo" [class.matchup-team__logo--verified]="game.teamB.isVerified" aria-hidden="true">
                    <span class="matchup-team__initials">{{ getInitials(game.teamB.name) }}</span>
                    @if (game.teamB.isVerified) {
                      <span class="matchup-verified-glow" aria-hidden="true"></span>
                    }
                  </div>
                  <p class="matchup-team__name">{{ game.teamB.name }}</p>
                  <p class="matchup-team__record">{{ game.teamB.record }}</p>
                  @if (game.teamB.isVerified) {
                    <span class="matchup-team__verified-badge" aria-label="NXT1 Verified">
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-.051 3.262 3.745 3.745 0 01-3.296 1.043 3.745 3.745 0 01-3.068 1.593c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.262-.051 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 01.051-3.262 3.745 3.745 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.262.051 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                      </svg>
                    </span>
                  }
                </div>
              </div>

              <!-- Game info bar -->
              <footer class="matchup-card__footer">
                <div class="matchup-card__details">
                  <span class="matchup-detail">
                    <svg class="matchup-detail__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <time>{{ game.date }}</time>
                  </span>
                  <span class="matchup-detail">
                    <svg class="matchup-detail__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ game.time }}
                  </span>
                </div>
                <button type="button" class="view-rosters-btn" [attr.aria-label]="'View rosters for ' + game.teamA.name + ' vs ' + game.teamB.name">
                  View Rosters
                  <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </footer>
            </article>
          }
        </div>
      </section>
    } @placeholder {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2]; track i) {
          <div class="skeleton-matchup-card"></div>
        }
      </div>
    } @loading (minimum 200ms) {
      <div class="section-skeleton" aria-hidden="true">
        @for (i of [1, 2]; track i) {
          <div class="skeleton-matchup-card"></div>
        }
      </div>
    }
  `,
  styles: [
    `
      /* ============================================================
         EXPLORE TEAMS — Web (Zero Ionic, Design Tokens Only)
         SSR-safe, semantic HTML, zero hardcoded colors.
         All color/spacing via var(--nxt1-*) CSS custom properties.
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

      /* ── Section wrapper ── */

      .teams-section {
        padding: var(--nxt1-spacing-6, 24px) 0 0;
      }

      .teams-section--hero {
        padding-top: var(--nxt1-spacing-4, 16px);
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
        font-size: var(--nxt1-fontSize-lg, 17px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-1);
        letter-spacing: -0.3px;
        margin: 0;
      }

      .section-subtitle {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--t-text-3);
        margin: 0;
      }

      .section-badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: var(--t-radius-full);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        background: var(--t-surface-2);
        color: var(--t-text-2);
        border: 1px solid var(--t-border-sub);
      }

      .section-badge--live {
        background: color-mix(in srgb, var(--t-primary) 12%, transparent);
        color: var(--t-primary);
        border-color: color-mix(in srgb, var(--t-primary) 30%, transparent);
      }

      .see-all-btn {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--t-primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        transition: opacity var(--t-dur-fast) ease;
      }

      .see-all-btn:hover { opacity: 0.8; }

      .see-all-icon {
        width: 14px;
        height: 14px;
      }

      /* ── Utilities ── */

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      /* ══════════════════════════════════════════════════════
         SECTION 1 — Hero Carousel
         ══════════════════════════════════════════════════════ */

      .verified-dot {
        color: var(--t-primary);
        font-size: 12px;
      }

      .hero-carousel {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: var(--t-border) transparent;
      }

      .hero-carousel::-webkit-scrollbar { height: 3px; }
      .hero-carousel::-webkit-scrollbar-track { background: transparent; }
      .hero-carousel::-webkit-scrollbar-thumb {
        background: var(--t-border);
        border-radius: var(--t-radius-full);
      }

      .hero-card {
        position: relative;
        flex-shrink: 0;
        width: 280px;
        height: 340px;
        border-radius: var(--t-radius-lg);
        overflow: hidden;
        scroll-snap-align: start;
        cursor: pointer;
        border: 1px solid var(--t-border);
        transition: transform var(--t-dur-base) ease, border-color var(--t-dur-fast) ease;
        outline: none;
      }

      .hero-card:hover {
        transform: translateY(-3px);
        border-color: color-mix(in srgb, var(--t-primary) 40%, transparent);
      }

      .hero-card:focus-visible {
        outline: 2px solid var(--t-primary);
        outline-offset: 2px;
      }

      .hero-card:active { transform: scale(0.98); }

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

      /* Frosted glass overlay */
      .hero-card__overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: var(--nxt1-spacing-4, 16px);
        background: color-mix(in srgb, var(--t-surface-1) 80%, transparent);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-top: 1px solid var(--t-border);
      }

      .verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: var(--t-radius-full);
        border: 1px solid var(--t-border-pri);
        background: color-mix(in srgb, var(--t-primary) 10%, transparent);
        color: var(--t-primary);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.3px;
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .verified-badge__icon {
        width: 13px;
        height: 13px;
        flex-shrink: 0;
      }

      .hero-card__info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .hero-card__athletes {
        display: flex;
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      .athlete-avatar {
        position: relative;
        width: 32px;
        height: 32px;
        border-radius: var(--t-radius-full);
        border: 2px solid var(--t-surface-1);
        background: var(--t-surface-3);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: -8px;
        flex-shrink: 0;
      }

      .hero-card__athletes .athlete-avatar:first-child { margin-left: 0; }

      .athlete-avatar__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .athlete-avatar__initials {
        font-size: 10px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-1);
        line-height: 1;
      }

      .hero-card__team-name {
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-inv);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .hero-card__meta {
        font-size: var(--nxt1-fontSize-sm, 13px);
        color: color-mix(in srgb, var(--t-text-inv) 70%, transparent);
        margin: 0;
      }

      /* ══════════════════════════════════════════════════════
         SECTION 2 — Regional Radar (News Card Architecture)
         ══════════════════════════════════════════════════════ */

      .news-list {
        display: flex;
        flex-direction: column;
        padding: 0 var(--nxt1-spacing-4, 16px);
        gap: 0;
      }

      /* News card inherits from the platform news card conventions */
      .news-card {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px) 0;
        border-bottom: 1px solid var(--t-border-sub);
        background: var(--t-surface-1);
        cursor: pointer;
        transition: background var(--t-dur-fast) ease;
        outline: none;
      }

      .news-card:last-child { border-bottom: none; }
      .news-card:hover { background: var(--t-surface-2); }

      .news-card:focus-visible {
        outline: 2px solid var(--t-primary);
        outline-offset: 2px;
      }

      .news-card__image-wrapper {
        position: relative;
        flex-shrink: 0;
        width: 96px;
        height: 72px;
        border-radius: var(--t-radius-md);
        overflow: hidden;
        background: var(--t-surface-2);
      }

      .news-card__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .news-card__image-placeholder {
        width: 100%;
        height: 100%;
        background: var(--t-surface-3);
        animation: pulse 1.5s ease-in-out infinite;
      }

      .unclaimed-badge {
        position: absolute;
        bottom: 4px;
        left: 4px;
        padding: 2px 6px;
        border-radius: var(--t-radius-full);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.3px;
        text-transform: uppercase;
        background: var(--t-surface-2);
        color: var(--t-text-3);
        border: 1px solid var(--t-border-sub);
      }

      .news-card__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .news-card__team-label {
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-primary);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .news-card__title {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-1);
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: var(--nxt1-lineHeight-tight, 1.3);
      }

      .news-card__excerpt {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--t-text-2);
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: var(--nxt1-lineHeight-snug, 1.45);
      }

      .news-card__meta-bar {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: auto;
        padding-top: 4px;
      }

      .news-card__source,
      .news-card__time {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--t-text-3);
      }

      .news-card__separator {
        font-size: 8px;
        color: var(--t-text-3);
        opacity: 0.5;
      }

      /* ══════════════════════════════════════════════════════
         SECTION 3 — CTA Banner
         ══════════════════════════════════════════════════════ */

      .cta-banner {
        position: relative;
        margin: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        padding: var(--nxt1-spacing-6, 24px);
        border-radius: var(--t-radius-lg);
        background: var(--t-surface-2);
        border: 1px solid var(--t-border-pri);
        box-shadow: 0 0 15px var(--nxt1-color-alpha-primary20, color-mix(in srgb, var(--t-primary) 20%, transparent));
        overflow: hidden;
      }

      .cta-banner__glow {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
          ellipse at 50% 0%,
          color-mix(in srgb, var(--t-primary) 8%, transparent) 0%,
          transparent 70%
        );
      }

      .cta-banner__content {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
      }

      @media (min-width: 640px) {
        .cta-banner__content {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
      }

      .cta-banner__text { flex: 1; min-width: 0; }

      .cta-banner__headline {
        font-size: var(--nxt1-fontSize-xl, 20px);
        font-weight: var(--nxt1-fontWeight-bold, 800);
        color: var(--t-text-1);
        margin: 0 0 var(--nxt1-spacing-1, 4px);
        letter-spacing: -0.4px;
      }

      .cta-banner__subhead {
        font-size: var(--nxt1-fontSize-sm, 14px);
        color: var(--t-text-2);
        margin: 0;
        line-height: var(--nxt1-lineHeight-snug, 1.45);
      }

      /* Primary button (follows btn-primary design system class) */
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-5, 20px);
        border-radius: var(--t-radius-full);
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-on-primary);
        background: var(--t-primary);
        border: none;
        cursor: pointer;
        white-space: nowrap;
        transition: opacity var(--t-dur-fast) ease, transform var(--t-dur-fast) ease;
      }

      .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
      .btn-primary:active { transform: scale(0.97); }
      .btn-primary:focus-visible { outline: 2px solid var(--t-primary); outline-offset: 3px; }

      .cta-banner__cta { flex-shrink: 0; }

      .btn-icon { width: 16px; height: 16px; }

      /* ══════════════════════════════════════════════════════
         SECTION 4 — State Rankings
         ══════════════════════════════════════════════════════ */

      .rankings-table {
        background: var(--t-surface-2);
        border-radius: var(--t-radius-md);
        overflow: hidden;
        margin: 0 var(--nxt1-spacing-4, 16px);
        border: 1px solid var(--t-border-sub);
      }

      .rankings-table__header {
        display: grid;
        grid-template-columns: 36px 1fr 60px 56px;
        gap: 0;
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        border-bottom: 1px solid var(--t-border-sub);
      }

      .rankings-col {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--t-text-3);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
      }

      .rankings-col--rank { justify-content: center; }
      .rankings-col--record { justify-content: flex-end; }
      .rankings-col--action { justify-content: flex-end; }

      .rankings-row {
        display: grid;
        grid-template-columns: 36px 1fr 60px 56px;
        gap: 0;
        padding: var(--nxt1-spacing-3, 12px);
        border-bottom: 1px solid var(--t-border-sub);
        transition: background var(--t-dur-fast) ease;
        cursor: default;
      }

      .rankings-row:last-child { border-bottom: none; }

      .rankings-row--verified {
        background: var(--t-surface-3);
        cursor: pointer;
      }

      .rankings-row--verified:hover {
        background: color-mix(in srgb, var(--t-primary) 8%, var(--t-surface-3));
      }

      .rankings-row--verified:focus-visible {
        outline: 2px solid var(--t-primary);
        outline-offset: -2px;
      }

      .rankings-row--unverified { opacity: 0.7; }

      .rank-number {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-2);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .rank-number--top3 { color: var(--t-primary); }

      .rankings-team-logo {
        position: relative;
        width: 28px;
        height: 28px;
        border-radius: var(--t-radius-sm);
        background: var(--t-surface-3);
        border: 1px solid var(--t-border);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .rankings-team-initials {
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-2);
        letter-spacing: -0.3px;
      }

      .rankings-verified-dot {
        position: absolute;
        bottom: -3px;
        right: -3px;
        font-size: 9px;
        color: var(--t-primary);
        line-height: 1;
      }

      .rankings-col--team {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        min-width: 0;
      }

      .rankings-team-name {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-1);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .claim-btn {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: var(--t-radius-full);
        font-size: var(--nxt1-fontSize-xs, 11px);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-primary);
        background: color-mix(in srgb, var(--t-primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--t-primary) 30%, transparent);
        cursor: pointer;
        transition: background var(--t-dur-fast) ease, opacity var(--t-dur-fast) ease;
        white-space: nowrap;
      }

      .claim-btn:hover { background: color-mix(in srgb, var(--t-primary) 20%, transparent); }
      .claim-btn:focus-visible { outline: 2px solid var(--t-primary); outline-offset: 2px; }

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
        scrollbar-width: thin;
        scrollbar-color: var(--t-border) transparent;
      }

      .roster-ticker::-webkit-scrollbar { height: 3px; }
      .roster-ticker::-webkit-scrollbar-track { background: transparent; }
      .roster-ticker::-webkit-scrollbar-thumb {
        background: var(--t-border);
        border-radius: var(--t-radius-full);
      }

      .roster-card {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 260px;
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--t-surface-1);
        border: 1px solid var(--t-border-sub);
        border-radius: var(--t-radius-md);
        scroll-snap-align: start;
        cursor: pointer;
        transition: background var(--t-dur-fast) ease, transform var(--t-dur-fast) ease, border-color var(--t-dur-fast) ease;
        outline: none;
      }

      .roster-card:hover {
        background: var(--t-surface-2);
        border-color: color-mix(in srgb, var(--t-primary) 20%, transparent);
        transform: translateY(-2px);
      }

      .roster-card:focus-visible {
        outline: 2px solid var(--t-primary);
        outline-offset: 2px;
      }

      .roster-card:active { transform: scale(0.97); }

      .roster-card__avatar {
        width: 40px;
        height: 40px;
        border-radius: var(--t-radius-full);
        background: var(--t-surface-3);
        border: 2px solid var(--t-border);
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .roster-card__avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .roster-card__avatar-initials {
        font-size: 13px;
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--t-text-2);
      }

      .roster-card__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .roster-card__name {
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-1);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .roster-card__position {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--t-text-3);
        margin: 0;
      }

      .roster-card__team-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: var(--t-radius-full);
        font-size: var(--nxt1-fontSize-2xs, 11px);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        background: var(--t-surface-2);
        color: var(--t-text-2);
        border: 1px solid var(--t-border-sub);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 140px;
      }

      .roster-card__time {
        font-size: var(--nxt1-fontSize-2xs, 11px);
        color: var(--t-text-3);
        flex-shrink: 0;
        white-space: nowrap;
        align-self: flex-start;
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
        background: var(--t-surface-2);
        border: 1px solid var(--t-border);
        border-radius: var(--t-radius-lg);
        overflow: hidden;
        transition: border-color var(--t-dur-fast) ease, transform var(--t-dur-base) ease;
        cursor: pointer;
      }

      .matchup-card:hover {
        border-color: color-mix(in srgb, var(--t-primary) 25%, transparent);
        transform: translateY(-2px);
      }

      .matchup-card__teams {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        padding: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-4, 16px);
        gap: var(--nxt1-spacing-4, 16px);
      }

      .matchup-team {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        text-align: center;
        position: relative;
      }

      .matchup-team__logo {
        position: relative;
        width: 60px;
        height: 60px;
        border-radius: var(--t-radius-md);
        background: var(--t-surface-3);
        border: 1px solid var(--t-border);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-color var(--t-dur-fast) ease;
      }

      .matchup-team__logo--verified {
        border-color: color-mix(in srgb, var(--t-primary) 50%, transparent);
      }

      .matchup-verified-glow {
        position: absolute;
        inset: -3px;
        border-radius: inherit;
        box-shadow: 0 0 12px color-mix(in srgb, var(--t-primary) 35%, transparent);
        pointer-events: none;
      }

      .matchup-team__initials {
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-bold, 800);
        color: var(--t-text-2);
        letter-spacing: -0.5px;
      }

      .matchup-team__name {
        font-size: var(--nxt1-fontSize-sm, 13px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-text-1);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;
      }

      .matchup-team__record {
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--t-text-3);
        margin: 0;
        font-weight: var(--nxt1-fontWeight-medium, 500);
      }

      .matchup-team__verified-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--t-primary);
      }

      .matchup-team__verified-badge svg { width: 16px; height: 16px; }

      /* VS divider */
      .matchup-vs {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        flex-shrink: 0;
      }

      .matchup-vs__text {
        font-size: var(--nxt1-fontSize-lg, 20px);
        font-weight: var(--nxt1-fontWeight-bold, 900);
        color: var(--t-text-3);
        letter-spacing: 1px;
        line-height: 1;
      }

      .matchup-vs__line {
        width: 1px;
        height: 24px;
        background: var(--t-border);
      }

      /* Footer */
      .matchup-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        border-top: 1px solid var(--t-border-sub);
        gap: var(--nxt1-spacing-3, 12px);
      }

      .matchup-card__details {
        display: flex;
        gap: var(--nxt1-spacing-3, 12px);
        flex-wrap: wrap;
      }

      .matchup-detail {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--nxt1-fontSize-xs, 12px);
        color: var(--t-text-2);
      }

      .matchup-detail__icon { width: 13px; height: 13px; flex-shrink: 0; }

      .view-rosters-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: var(--t-radius-full);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--t-primary);
        background: color-mix(in srgb, var(--t-primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--t-primary) 30%, transparent);
        cursor: pointer;
        transition: background var(--t-dur-fast) ease;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .view-rosters-btn:hover { background: color-mix(in srgb, var(--t-primary) 20%, transparent); }
      .view-rosters-btn:focus-visible { outline: 2px solid var(--t-primary); outline-offset: 2px; }

      /* ══════════════════════════════════════════════════════
         SKELETON LOADERS
         ══════════════════════════════════════════════════════ */

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .skeleton-base {
        background: var(--t-surface-3);
        border-radius: var(--t-radius-md);
        animation: pulse 1.5s ease-in-out infinite;
      }

      .section-skeleton {
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px) 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .skeleton-news-card {
        height: 80px;
        border-radius: var(--t-radius-md);
        background: var(--t-surface-3);
        animation: pulse 1.5s ease-in-out infinite;
      }

      .skeleton-row {
        height: 48px;
        border-radius: var(--t-radius-md);
        background: var(--t-surface-3);
        animation: pulse 1.5s ease-in-out infinite;
      }

      .skeleton-cta {
        height: 120px;
        margin: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px);
        border-radius: var(--t-radius-lg);
        background: var(--t-surface-3);
        animation: pulse 1.5s ease-in-out infinite;
      }

      .skeleton-roster-card {
        flex-shrink: 0;
        width: 260px;
        height: 68px;
        border-radius: var(--t-radius-md);
        background: var(--t-surface-3);
        animation: pulse 1.5s ease-in-out infinite;
      }

      .skeleton-matchup-card {
        height: 160px;
        border-radius: var(--t-radius-lg);
        background: var(--t-surface-3);
        animation: pulse 1.5s ease-in-out infinite;
      }

      /* ══════════════════════════════════════════════════════
         REDUCED MOTION
         ══════════════════════════════════════════════════════ */

      @media (prefers-reduced-motion: reduce) {
        .hero-card,
        .roster-card,
        .matchup-card,
        .news-card,
        .rankings-row--verified,
        .btn-primary,
        .claim-btn,
        .view-rosters-btn {
          transition: none;
        }

        .skeleton-news-card,
        .skeleton-row,
        .skeleton-cta,
        .skeleton-roster-card,
        .skeleton-matchup-card,
        .news-card__image-placeholder {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreTeamsWebComponent {
  private readonly logger = inject(NxtLoggingService).child('ExploreTeamsWeb');

  // ── State (Angular Signals) ──────────────────────────────────────────────

  readonly verifiedTeams = signal<readonly VerifiedTeam[]>(MOCK_VERIFIED_TEAMS);
  readonly regionalNews = signal<readonly RegionalNewsItem[]>(MOCK_REGIONAL_NEWS);
  readonly rankedTeams = signal<readonly RankedTeam[]>(MOCK_RANKED_TEAMS);
  readonly rosterAthletes = signal<readonly RosterAthlete[]>(MOCK_ROSTER_ATHLETES);
  readonly matchups = signal<readonly MatchupGame[]>(MOCK_MATCHUPS);

  // ── Computed ────────────────────────────────────────────────────────────

  readonly verifiedCount = computed(() => this.verifiedTeams().length);
  readonly topRankedTeam = computed(() => this.rankedTeams()[0] ?? null);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor() {
    afterNextRender(() => {
      this.logger.info('ExploreTeamsWeb mounted', {
        verifiedTeams: this.verifiedTeams().length,
        matchups: this.matchups().length,
      });
    });
  }

  // ── Template helpers ────────────────────────────────────────────────────

  protected readonly getInitials = getInitials;
}
