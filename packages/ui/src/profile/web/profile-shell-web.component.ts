/**
 * @fileoverview Profile Shell Component - Web (Tailwind SSR)
 * @module @nxt1/ui/profile/web
 * @version 1.0.0
 *
 * Web-optimized Profile Shell using pure Tailwind CSS.
 * 100% SSR-safe with semantic HTML for Grade A+ SEO.
 *
 * ⭐ WEB ONLY - Pure Tailwind, Zero Ionic, SSR-optimized ⭐
 *
 * SEO Features:
 * - Semantic HTML structure (<main>, <section>, <article>)
 * - Proper heading hierarchy (h1 → h2 → h3)
 * - Structured data support ready
 * - Fast LCP with SSR
 *
 * Design Token Integration:
 * - Uses @nxt1/design-tokens CSS custom properties
 * - Tailwind classes map to design tokens via preset
 * - Dark/light mode via [data-theme] attribute
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  effect,
  type EffectRef,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  type ProfileTabId,
  type ProfileTab,
  PROFILE_TABS,
  PROFILE_EMPTY_STATES,
  type ProfileOffer,
  type ProfileEvent,
  type AthleticStat,
  type ProfileTeamAffiliation,
  type ProfileTeamType,
  type NewsArticle,
  type ProfilePost,
  type ProfileTimelineFilterId,
  type TimelineItem,
  type TimelineEmptyConfig,
  type TimelineDotConfig,
  type ProfileAward,
  type GameLogEntry,
  type GameLogSeasonTotals,
  type ProfileSeasonGameLog,
  type ScoutReport,
} from '@nxt1/core';
// NxtPageHeaderComponent removed — web profile uses shell top nav on mobile and page header in wide layouts
import { ProfilePageHeaderComponent } from './profile-page-header.component';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { NxtRefresherComponent, type RefreshEvent } from '../../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../../components/option-scroller';
import {
  NxtSectionNavWebComponent,
  type SectionNavItem,
  type SectionNavChangeEvent,
} from '../../components/section-nav-web';
import { NxtImageCarouselComponent } from '../../components/image-carousel';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ProfileService } from '../profile.service';
import { ICONS, type IconName } from '@nxt1/design-tokens/assets/icons';

import { ProfileTimelineComponent } from '../profile-timeline.component';
import { ProfileOffersComponent } from '../profile-offers.component';
import { ProfileRankingsComponent } from '../rankings/profile-rankings.component';
import { ProfileEventsComponent } from '../profile-events.component';
import { NxtTimelineComponent } from '../../components/timeline';
import { ProfileSkeletonComponent } from '../profile-skeleton.component';
import { ProfileNewsWebComponent } from './profile-news-web.component';
import { ProfileScoutingWebComponent } from './profile-scouting-web.component';
import { MOCK_NEWS_ARTICLES } from '../../news/news.mock-data';
import { MOCK_SCOUT_REPORTS } from '../../scout-reports/scout-reports.mock-data';
import type { ProfileShellUser } from '../profile-shell.component';

const ARCHETYPE_TOKEN_ICONS: Readonly<Record<string, IconName>> = {
  'arm strength': 'barbell',
  accuracy: 'star',
  athleticism: 'bolt',
  'football iq': 'hardwareChip',
};

const TEAM_TYPE_LABELS: Readonly<Record<ProfileTeamType, string>> = {
  'high-school': 'High School',
  club: 'Club',
  juco: 'JUCO',
  college: 'College',
  academy: 'Academy',
  travel: 'Travel',
  'middle-school': 'Middle School',
  other: 'Team',
};

const TEAM_TYPE_ICONS: Readonly<Record<ProfileTeamType, IconName>> = {
  'high-school': 'school',
  club: 'people',
  juco: 'shield',
  college: 'shield',
  academy: 'school',
  travel: 'shield',
  'middle-school': 'school',
  other: 'shield',
};

const XP_LEVELS: ReadonlyArray<{
  readonly level: number;
  readonly name: string;
  readonly min: number;
  readonly max: number;
}> = [
  { level: 1, name: 'ROOKIE', min: 0, max: 999 },
  { level: 2, name: 'STARTER', min: 1_000, max: 2_999 },
  { level: 3, name: 'ALL-STAR', min: 3_000, max: 5_999 },
  { level: 4, name: 'PRO', min: 6_000, max: 9_999 },
  { level: 5, name: 'ELITE', min: 10_000, max: 14_999 },
  { level: 6, name: 'LEGEND', min: 15_000, max: 24_999 },
  { level: 7, name: 'GOAT', min: 25_000, max: Infinity },
];

/** Arc math for the mobile XP ring (matches profile page header). */
const MOBILE_RING_RADIUS = 40;
const MOBILE_ARC_DEGREES = 270;
const MOBILE_ARC_CIRCUMFERENCE = 2 * Math.PI * MOBILE_RING_RADIUS;
const MOBILE_ARC_LENGTH = MOBILE_ARC_CIRCUMFERENCE * (MOBILE_ARC_DEGREES / 360);

/** Badge metadata type for mobile header badge grid (mirrors page header). */
interface MobileHeaderBadge {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

/** Placeholder badges shown when real badge data isn't available (matches desktop). */
const MOBILE_PLACEHOLDER_BADGES: ReadonlyArray<MobileHeaderBadge> = [
  { id: 'profile-pro', name: 'Profile Pro', icon: 'person', rarity: 'rare' },
  { id: 'highlight-star', name: 'Highlight Star', icon: 'videocam', rarity: 'epic' },
  { id: 'team-player', name: 'Team Player', icon: 'users', rarity: 'uncommon' },
  { id: 'stat-tracker', name: 'Stat Tracker', icon: 'barChart', rarity: 'common' },
  { id: 'early-adopter', name: 'Early Adopter', icon: 'rocket', rarity: 'rare' },
  { id: 'on-fire', name: 'On Fire', icon: 'flame', rarity: 'legendary' },
  { id: 'clutch-performer', name: 'Clutch Performer', icon: 'bolt', rarity: 'epic' },
  { id: 'film-room', name: 'Film Room', icon: 'eye', rarity: 'uncommon' },
  { id: 'captain', name: 'Captain', icon: 'shield', rarity: 'rare' },
  { id: 'grind-mode', name: 'Grind Mode', icon: 'barbell', rarity: 'common' },
];

interface StatsComparisonItem {
  readonly label: string;
  readonly playerDisplay: string;
  readonly averageDisplay: string;
  readonly playerPercent: number;
  readonly averagePercent: number;
}

@Component({
  selector: 'nxt1-profile-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    ProfilePageHeaderComponent,
    NxtIconComponent,
    NxtImageComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSectionNavWebComponent,
    NxtImageCarouselComponent,
    ProfileTimelineComponent,
    ProfileOffersComponent,
    ProfileRankingsComponent,
    ProfileEventsComponent,
    NxtTimelineComponent,
    ProfileSkeletonComponent,
    ProfileNewsWebComponent,
    ProfileScoutingWebComponent,
  ],
  template: `
    <main class="profile-main">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <!-- Loading State -->
      @if (profile.isLoading()) {
        <nxt1-profile-skeleton variant="web" />
      }

      <!-- Error State -->
      @else if (profile.error()) {
        <section class="madden-error">
          <div class="madden-error-icon" aria-hidden="true">⚠️</div>
          <h2 class="madden-error-title">Failed to load profile</h2>
          <p class="madden-error-msg">{{ profile.error() }}</p>
          <button type="button" class="madden-error-btn" (click)="onRetry()">Try Again</button>
        </section>
      }

      <!-- ═══ MADDEN FRANCHISE MODE — SPLIT LAYOUT ═══ -->
      @else if (profile.user()) {
        <div class="madden-stage">
          <!-- Faded halftone accent background (inspired by recruiting card aesthetic) -->
          <div class="stage-halftone-bg" aria-hidden="true">
            <div class="stage-halftone-dots"></div>
            <div class="stage-halftone-fade"></div>
          </div>

          <!-- ═══ SPLIT: LEFT CONTENT | RIGHT PLAYER IMAGE ═══ -->
          <div class="madden-split">
            <!-- LEFT SIDE: Header + Tabs + Content -->
            <div class="madden-split-left">
              <!-- Profile page header: Madden-style (hidden on mobile — shell top nav handles navigation) -->
              <div class="hidden md:block">
                <nxt1-profile-page-header
                  [user]="profile.user()"
                  [playerCard]="null"
                  [showFollowAction]="!isOwnProfile()"
                  (back)="backClick.emit()"
                  (follow)="followClick.emit()"
                />
              </div>

              <!-- Mobile hero: profile summary (hidden on wide layouts where page header handles it) -->
              <section class="madden-mobile-hero md:hidden" aria-label="Profile summary">
                @if (profile.profileImages().length > 0) {
                  <div class="madden-mobile-hero__carousel">
                    <div class="carousel-glow-wrap">
                      <div class="carousel-glow-border" aria-hidden="true"></div>
                      <div class="carousel-glow-ambient" aria-hidden="true"></div>
                      <nxt1-image-carousel
                        [images]="profile.profileImages()"
                        [alt]="desktopTitle()"
                        [autoPlay]="true"
                        [autoPlayInterval]="4200"
                        [overlayTitle]="desktopTitle()"
                        [overlaySubtitle]="carouselOverlaySubtitle()"
                        [overlayTitles]="carouselOverlayTitles()"
                        [overlaySubtitles]="carouselOverlaySubtitles()"
                        class="madden-player-carousel"
                      />
                      @if (
                        profile.user()?.verificationStatus === 'verified' ||
                        profile.user()?.verificationStatus === 'premium'
                      ) {
                        <span class="carousel-verified-badge">
                          <nxt1-icon name="checkmarkCircle" [size]="14" />
                          Verified
                        </span>
                      }
                    </div>
                  </div>
                }

                <div class="madden-mobile-hero__identity">
                  <h1 class="madden-mobile-hero__name">{{ mobileDisplayName() }}</h1>
                  @if (mobileSubtitleLine()) {
                    <p class="madden-mobile-hero__meta">{{ mobileSubtitleLine() }}</p>
                  }
                  @if (!isOwnProfile()) {
                    <button
                      type="button"
                      class="madden-mobile-hero__follow-btn"
                      aria-label="Follow athlete"
                      (click)="followClick.emit()"
                    >
                      <nxt1-icon name="plus" [size]="13" />
                      Follow
                    </button>
                  }
                  <!-- Mobile hero stats (Class, Height, Weight, Location) -->
                  <div class="madden-mobile-hero__stats">
                    @if (profile.user()?.classYear) {
                      <div class="mobile-hero-stat">
                        <span class="mobile-hero-stat__key">Class:</span>
                        <span class="mobile-hero-stat__val">{{ profile.user()?.classYear }}</span>
                      </div>
                    }
                    @if (profile.user()?.height) {
                      <div class="mobile-hero-stat">
                        <span class="mobile-hero-stat__key">Height:</span>
                        <span class="mobile-hero-stat__val-wrap">
                          <span class="mobile-hero-stat__val">{{ profile.user()?.height }}</span>
                          @if (profile.user()?.measurablesVerifiedBy) {
                            @if (measurablesProviderUrl()) {
                              <a
                                class="ov-verified-badge ov-verified-link"
                                [href]="measurablesProviderUrl()!"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span class="ov-verified-logo">
                                  <nxt1-image
                                    class="ov-verified-logo-img"
                                    [src]="measurablesProviderLogoSrc()"
                                    [alt]="
                                      (profile.user()?.measurablesVerifiedBy || 'provider') +
                                      ' logo'
                                    "
                                    [width]="60"
                                    [height]="14"
                                    fit="contain"
                                    [showPlaceholder]="false"
                                  />
                                </span>
                              </a>
                            } @else {
                              <span class="ov-verified-badge">
                                <span class="ov-verified-logo">
                                  <nxt1-image
                                    class="ov-verified-logo-img"
                                    [src]="measurablesProviderLogoFallbackSrc()"
                                    [alt]="
                                      (profile.user()?.measurablesVerifiedBy || 'provider') +
                                      ' logo'
                                    "
                                    [width]="60"
                                    [height]="14"
                                    fit="contain"
                                    [showPlaceholder]="false"
                                  />
                                </span>
                              </span>
                            }
                          }
                        </span>
                      </div>
                    }
                    @if (profile.user()?.weight) {
                      <div class="mobile-hero-stat">
                        <span class="mobile-hero-stat__key">Weight:</span>
                        <span class="mobile-hero-stat__val-wrap">
                          <span class="mobile-hero-stat__val">{{ profile.user()?.weight }} lb</span>
                          @if (profile.user()?.measurablesVerifiedBy) {
                            @if (measurablesProviderUrl()) {
                              <a
                                class="ov-verified-badge ov-verified-link"
                                [href]="measurablesProviderUrl()!"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <span class="ov-verified-logo">
                                  <nxt1-image
                                    class="ov-verified-logo-img"
                                    [src]="measurablesProviderLogoSrc()"
                                    [alt]="
                                      (profile.user()?.measurablesVerifiedBy || 'provider') +
                                      ' logo'
                                    "
                                    [width]="60"
                                    [height]="14"
                                    fit="contain"
                                    [showPlaceholder]="false"
                                  />
                                </span>
                              </a>
                            } @else {
                              <span class="ov-verified-badge">
                                <span class="ov-verified-logo">
                                  <nxt1-image
                                    class="ov-verified-logo-img"
                                    [src]="measurablesProviderLogoFallbackSrc()"
                                    [alt]="
                                      (profile.user()?.measurablesVerifiedBy || 'provider') +
                                      ' logo'
                                    "
                                    [width]="60"
                                    [height]="14"
                                    fit="contain"
                                    [showPlaceholder]="false"
                                  />
                                </span>
                              </span>
                            }
                          }
                        </span>
                      </div>
                    }
                    @if (profile.user()?.location) {
                      <div class="mobile-hero-stat">
                        <span class="mobile-hero-stat__key">Location:</span>
                        <span class="mobile-hero-stat__val">{{ profile.user()?.location }}</span>
                      </div>
                    }
                  </div>
                </div>
              </section>

              <!-- TOP TAB BAR -->
              <nav class="madden-top-tabs" aria-label="Profile sections">
                <nxt1-option-scroller
                  [options]="tabOptions()"
                  [selectedId]="profile.activeTab()"
                  [config]="{ scrollable: true, stretchToFill: false, showDivider: false }"
                  (selectionChange)="onTabChange($event)"
                />
              </nav>

              <!-- Content Area: Side tabs + scrollable content -->
              <div class="madden-content-layer">
                <!-- LEFT SIDE NAV COLUMN -->
                <div class="madden-side-nav-column">
                  <!-- LEFT SIDE TABS -->
                  <nxt1-section-nav-web
                    [items]="sideTabItems()"
                    [activeId]="activeSideTab()"
                    ariaLabel="Section navigation"
                    (selectionChange)="onSectionNavChange($event)"
                  />

                  <!-- ═══ SPORT PROFILE SWITCHER ═══ -->
                  @if (profile.hasMultipleSports()) {
                    <div class="sport-switcher" role="group" aria-label="Sport profiles">
                      <span class="sport-switcher__title">Sport Profiles</span>
                      <div class="sport-switcher__list">
                        @for (sport of profile.allSports(); track sport.name; let i = $index) {
                          <button
                            type="button"
                            class="sport-switcher__item"
                            [class.sport-switcher__item--active]="profile.activeSportIndex() === i"
                            [attr.aria-selected]="profile.activeSportIndex() === i"
                            [attr.aria-label]="'Switch to ' + sport.name + ' profile'"
                            role="tab"
                            (click)="onSportSwitch(i)"
                          >
                            @if (profile.user()?.profileImg) {
                              <nxt1-image
                                class="sport-switcher__avatar"
                                [src]="profile.user()?.profileImg"
                                [alt]="sport.name"
                                [width]="28"
                                [height]="28"
                                variant="avatar"
                                fit="cover"
                                [showPlaceholder]="false"
                              />
                            } @else {
                              <span class="sport-switcher__avatar-fallback" aria-hidden="true">
                                {{ sport.name.charAt(0) }}
                              </span>
                            }
                            <span class="sport-switcher__sport-name">{{ sport.name }}</span>
                            @if (profile.activeSportIndex() === i) {
                              <span class="sport-switcher__active-badge" aria-hidden="true"></span>
                            }
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>

                <!-- MAIN CONTENT AREA -->
                <section class="madden-content-scroll" aria-live="polite">
                  <!-- ═══ SHARED VERIFICATION BANNER (per-tab provider) ═══ -->
                  @if (showVerificationBanner()) {
                    <div class="profile-verification-banner" role="status">
                      @if (isProfileVerified()) {
                        <span class="verified-by__label">Verified by</span>
                        @if (verificationProviderUrl(); as providerUrl) {
                          <a
                            class="verified-by__chip"
                            [href]="providerUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            [attr.aria-label]="
                              'Verified by ' +
                              (verificationProvider() || 'verification provider') +
                              ' (opens in new tab)'
                            "
                          >
                            <ng-container *ngTemplateOutlet="verifiedChipContent"></ng-container>
                          </a>
                        } @else {
                          <span
                            class="verified-by__chip"
                            [attr.aria-label]="
                              'Verified by ' + (verificationProvider() || 'verification provider')
                            "
                          >
                            <ng-container *ngTemplateOutlet="verifiedChipContent"></ng-container>
                          </span>
                        }
                      } @else {
                        <span class="verified-by__chip verified-by__chip--unverified">
                          <nxt1-icon name="alertCircle" [size]="14" />
                          <span class="verified-by__name">Not Verified</span>
                        </span>
                      }
                    </div>
                  }

                  <!-- Reusable chip content (DRY — logo + name) -->
                  <ng-template #verifiedChipContent>
                    @if (verificationProviderLogoSrc(); as logoSrc) {
                      <nxt1-image
                        class="verified-by__logo"
                        [src]="logoSrc"
                        [alt]="(verificationProvider() || 'provider') + ' logo'"
                        [width]="60"
                        [height]="14"
                        fit="contain"
                        [showPlaceholder]="false"
                      />
                    }
                    @if (verificationProvider(); as providerName) {
                      <span class="verified-by__name">{{ providerName }}</span>
                    }
                  </ng-template>

                  @switch (profile.activeTab()) {
                    @case ('overview') {
                      <section
                        class="madden-tab-section madden-overview"
                        aria-labelledby="overview-heading"
                      >
                        <h2 id="overview-heading" class="sr-only">Player Overview</h2>

                        <!-- Mobile-only team affiliations (swapped from hero) -->
                        @if (
                          activeSideTab() === 'player-profile' && teamAffiliations().length > 0
                        ) {
                          <div class="ov-mobile-teams">
                            <h3 class="ov-section-title ov-overview-title">Player Profile</h3>
                            <div class="madden-team-stack">
                              @for (
                                team of teamAffiliations();
                                track team.name + '-' + (team.type || 'other')
                              ) {
                                <div
                                  class="madden-team-block madden-team-block--clickable"
                                  role="button"
                                  tabindex="0"
                                  (click)="onEditTeam()"
                                  (keydown.enter)="onEditTeam()"
                                  (keydown.space)="onEditTeam(); $event.preventDefault()"
                                >
                                  @if (team.logoUrl) {
                                    <nxt1-image
                                      class="madden-team-logo"
                                      [src]="team.logoUrl"
                                      [alt]="team.name"
                                      [width]="32"
                                      [height]="32"
                                      variant="avatar"
                                      fit="contain"
                                      [priority]="true"
                                      [showPlaceholder]="false"
                                    />
                                  } @else {
                                    <div class="madden-team-logo-placeholder">
                                      <nxt1-icon [name]="teamIconName(team.type)" [size]="22" />
                                    </div>
                                  }
                                  <div class="madden-team-info">
                                    <div class="madden-team-headline">
                                      <span class="madden-team-name">{{ team.name }}</span>
                                    </div>
                                    @if (team.location) {
                                      <span class="madden-team-location">{{ team.location }}</span>
                                    }
                                  </div>
                                </div>
                              }
                            </div>
                          </div>
                        }

                        @if (activeSideTab() === 'player-profile') {
                          <div class="ov-top-row">
                            <!-- ═══ PLAYER PROFILE — Key/Value Pairs (like Madden) ═══ -->
                            <div class="ov-section ov-section--profile ov-section--player-stats">
                              <h3 class="ov-section-title ov-overview-title">Player Profile</h3>
                              <div class="ov-profile-grid">
                                @if (profile.user()?.classYear) {
                                  <div class="ov-profile-row">
                                    <span class="ov-profile-key">Class:</span>
                                    <span class="ov-profile-val">{{
                                      profile.user()?.classYear
                                    }}</span>
                                  </div>
                                }
                                @if (profile.user()?.height) {
                                  <div class="ov-profile-row">
                                    <span class="ov-profile-key">Height:</span>
                                    <span class="ov-profile-val-wrap">
                                      <span class="ov-profile-val">{{
                                        profile.user()?.height
                                      }}</span>
                                      @if (profile.user()?.measurablesVerifiedBy) {
                                        @if (measurablesProviderUrl()) {
                                          <a
                                            class="ov-verified-badge ov-verified-link"
                                            [href]="measurablesProviderUrl()!"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            [attr.aria-label]="
                                              'Open measurable source: ' +
                                              (profile.user()?.measurablesVerifiedBy ||
                                                'verification provider')
                                            "
                                          >
                                            <span class="ov-verified-label">Verified by</span>
                                            <span class="ov-verified-logo">
                                              <nxt1-image
                                                class="ov-verified-logo-img"
                                                [src]="measurablesProviderLogoSrc()"
                                                [alt]="
                                                  (profile.user()?.measurablesVerifiedBy ||
                                                    'verification provider') + ' logo'
                                                "
                                                [width]="60"
                                                [height]="14"
                                                fit="contain"
                                                [showPlaceholder]="false"
                                              />
                                            </span>
                                          </a>
                                        } @else {
                                          <span class="ov-verified-badge">
                                            <span class="ov-verified-label">Verified by</span>
                                            <span class="ov-verified-logo">
                                              <nxt1-image
                                                class="ov-verified-logo-img"
                                                [src]="measurablesProviderLogoFallbackSrc()"
                                                [alt]="
                                                  (profile.user()?.measurablesVerifiedBy ||
                                                    'verification provider') + ' logo'
                                                "
                                                [width]="60"
                                                [height]="14"
                                                fit="contain"
                                                [showPlaceholder]="false"
                                              />
                                            </span>
                                          </span>
                                        }
                                      }
                                    </span>
                                  </div>
                                }
                                @if (profile.user()?.weight) {
                                  <div class="ov-profile-row">
                                    <span class="ov-profile-key">Weight:</span>
                                    <span class="ov-profile-val-wrap">
                                      <span class="ov-profile-val"
                                        >{{ profile.user()?.weight }} lb</span
                                      >
                                      @if (profile.user()?.measurablesVerifiedBy) {
                                        @if (measurablesProviderUrl()) {
                                          <a
                                            class="ov-verified-badge ov-verified-link"
                                            [href]="measurablesProviderUrl()!"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            [attr.aria-label]="
                                              'Open measurable source: ' +
                                              (profile.user()?.measurablesVerifiedBy ||
                                                'verification provider')
                                            "
                                          >
                                            <span class="ov-verified-label">Verified by</span>
                                            <span class="ov-verified-logo">
                                              <nxt1-image
                                                class="ov-verified-logo-img"
                                                [src]="measurablesProviderLogoSrc()"
                                                [alt]="
                                                  (profile.user()?.measurablesVerifiedBy ||
                                                    'verification provider') + ' logo'
                                                "
                                                [width]="60"
                                                [height]="14"
                                                fit="contain"
                                                [showPlaceholder]="false"
                                              />
                                            </span>
                                          </a>
                                        } @else {
                                          <span class="ov-verified-badge">
                                            <span class="ov-verified-label">Verified by</span>
                                            <span class="ov-verified-logo">
                                              <nxt1-image
                                                class="ov-verified-logo-img"
                                                [src]="measurablesProviderLogoFallbackSrc()"
                                                [alt]="
                                                  (profile.user()?.measurablesVerifiedBy ||
                                                    'verification provider') + ' logo'
                                                "
                                                [width]="60"
                                                [height]="14"
                                                fit="contain"
                                                [showPlaceholder]="false"
                                              />
                                            </span>
                                          </span>
                                        }
                                      }
                                    </span>
                                  </div>
                                }
                                @if (profile.user()?.location) {
                                  <div class="ov-profile-row">
                                    <span class="ov-profile-key">Location:</span>
                                    <span class="ov-profile-val">{{
                                      profile.user()?.location
                                    }}</span>
                                  </div>
                                }
                              </div>
                            </div>

                            <!-- ═══ AGENT X TRAIT (inline, no large container) ═══ -->
                            @if (profile.playerCard()?.trait) {
                              <div class="ov-trait-inline">
                                <div class="ov-trait-badge">
                                  <div class="ov-trait-icon-lg" aria-hidden="true">
                                    <svg
                                      viewBox="0 0 100 100"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M50 6L84 28V72L50 94L16 72V28L50 6Z"
                                        class="ov-trait-icon-shell"
                                      />
                                      <path
                                        d="M50 16L74 32V68L50 84L26 68V32L50 16Z"
                                        class="ov-trait-icon-core"
                                      />
                                    </svg>
                                    <div class="ov-trait-icon-inner">
                                      @if (profile.playerCard()?.trait?.category === 'hidden') {
                                        <nxt1-icon name="flame" [size]="36" />
                                      } @else {
                                        <nxt1-icon name="bolt" [size]="36" />
                                      }
                                    </div>
                                  </div>
                                </div>
                                <div class="ov-trait-text">
                                  <span class="ov-trait-category">
                                    {{ traitCategoryLabel() }}
                                  </span>
                                  @if (profile.playerCard()?.agentXSummary) {
                                    <p class="ov-trait-summary">
                                      <span class="ov-trait-summary__reserve" aria-hidden="true">
                                        {{ profile.playerCard()?.agentXSummary }}
                                      </span>
                                      <span class="ov-trait-summary__typed" aria-live="polite">
                                        {{ displayAgentXSummary() }}
                                      </span>
                                    </p>
                                  }
                                </div>
                              </div>
                            }
                          </div>

                          <!-- ═══ PLAYER ARCHETYPES (badge-style labels) ═══ -->
                          @if (profile.playerCard()?.archetypes?.length) {
                            <div class="ov-section">
                              <h3 class="ov-section-title">Player Archetypes</h3>
                              <div class="ov-archetype-badges">
                                @for (
                                  arch of profile.playerCard()?.archetypes ?? [];
                                  track arch.name
                                ) {
                                  <div class="ov-archetype-badge">
                                    <nxt1-icon
                                      [name]="archetypeIconName(arch.name, arch.icon)"
                                      [size]="18"
                                    />
                                    <span class="ov-archetype-badge-name">{{ arch.name }}</span>
                                  </div>
                                }
                              </div>
                            </div>
                          }

                          <!-- ═══ CONNECTED ACCOUNTS ═══ -->
                          @if (connectedAccountsList().length > 0) {
                            <div class="ov-section">
                              <h3 class="ov-section-title">Connected Accounts</h3>
                              <div class="ov-connected-grid">
                                @for (acct of connectedAccountsList(); track acct.key) {
                                  <a
                                    class="ov-connected-chip"
                                    [href]="acct.url"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    [attr.aria-label]="acct.label"
                                  >
                                    <span class="ov-connected-icon" [style.color]="acct.color">
                                      <nxt1-icon [name]="acct.icon" [size]="14" />
                                    </span>
                                    <span class="ov-connected-label">{{ acct.label }}</span>
                                    <span class="ov-connected-check">
                                      <nxt1-icon name="checkmarkCircle" [size]="13" />
                                    </span>
                                  </a>
                                }
                              </div>
                              <p class="ov-connected-explainer">
                                <svg
                                  class="ov-connected-agentx"
                                  viewBox="0 0 612 792"
                                  fill="currentColor"
                                  stroke="currentColor"
                                  stroke-width="12"
                                  stroke-linejoin="round"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                                  />
                                  <polygon
                                    points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                                  />
                                </svg>
                                Agent X is your personal recruiting manager — connecting all your
                                accounts in one place so coaches see a complete, always up-to-date
                                profile without the extra work.
                              </p>
                            </div>
                          }

                          <!-- ═══ MOBILE XP RING + BADGES (below connected accounts) ═══ -->
                          <div
                            class="ov-mobile-xp-section"
                            [class.ov-mobile-xp-section--centered]="mobileBadgesEarned() <= 5"
                            aria-label="Player XP"
                          >
                            <div
                              class="ov-mobile-xp-ring"
                              [attr.aria-label]="
                                'Level ' + mobileXpLevel() + ' — ' + mobileXpTier()
                              "
                            >
                              <div class="ov-mobile-xp-glow"></div>
                              <svg class="ov-mobile-xp-svg" viewBox="0 0 96 96" aria-hidden="true">
                                <circle
                                  cx="48"
                                  cy="48"
                                  r="38"
                                  fill="var(--nxt1-color-surface-100, #161616)"
                                />
                                <circle
                                  cx="48"
                                  cy="48"
                                  r="40"
                                  fill="none"
                                  stroke="var(--ring-track, rgba(255,255,255,0.06))"
                                  stroke-width="6"
                                  stroke-linecap="round"
                                  [attr.stroke-dasharray]="mobileArcLength + ' ' + mobileArcGap"
                                  transform="rotate(135 48 48)"
                                />
                                <circle
                                  cx="48"
                                  cy="48"
                                  r="40"
                                  fill="none"
                                  stroke="var(--m-accent, #ceff00)"
                                  stroke-width="6"
                                  stroke-linecap="round"
                                  [attr.stroke-dasharray]="mobileXpArcDash()"
                                  transform="rotate(135 48 48)"
                                  class="ov-mobile-xp-arc"
                                />
                              </svg>
                              <div class="ov-mobile-xp-inner">
                                <span class="ov-mobile-xp-lvl">Lv {{ mobileXpLevel() }}</span>
                                <span class="ov-mobile-xp-tier">{{ mobileXpTier() }}</span>
                              </div>
                            </div>
                            @if (mobileDisplayBadges().length > 0) {
                              <div class="ov-mobile-xp-badge-grid" aria-label="Earned badges">
                                @for (badge of mobileDisplayBadges(); track badge.id) {
                                  <div
                                    class="ov-mobile-xp-badge-orb"
                                    [class]="
                                      'ov-mobile-xp-badge-orb ov-mobile-xp-badge-orb--' +
                                      badge.rarity
                                    "
                                    [attr.aria-label]="badge.name + ' badge'"
                                  >
                                    <nxt1-icon [name]="badge.icon" [size]="12" />
                                  </div>
                                }
                                @if (mobileRemainingBadgeCount() > 0) {
                                  <span class="ov-mobile-xp-badge-more"
                                    >+{{ mobileRemainingBadgeCount() }}</span
                                  >
                                }
                              </div>
                            }
                          </div>

                          <div class="ov-section ov-section--profile">
                            <button
                              type="button"
                              class="ov-last-synced-btn"
                              (click)="onSyncNow()"
                              aria-label="Sync profile with Agent X"
                            >
                              <div class="ov-last-synced-main">
                                <span class="ov-last-synced-label">Last synced</span>
                                <span class="ov-last-synced-time">{{ lastSyncedLabel() }}</span>
                              </div>
                              <div class="ov-last-synced-agent">
                                <svg
                                  class="ov-last-synced-agentx"
                                  viewBox="0 0 612 792"
                                  fill="currentColor"
                                  stroke="currentColor"
                                  stroke-width="12"
                                  stroke-linejoin="round"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                                  />
                                  <polygon
                                    points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                                  />
                                </svg>
                                <span class="ov-last-synced-agent-name">Agent X</span>
                              </div>
                            </button>
                          </div>
                        }

                        @if (activeSideTab() === 'player-bio') {
                          <div class="ov-top-row ov-top-row--single">
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Player Bio</h3>
                              <div class="ov-bio-card">
                                <nxt1-icon name="person" [size]="18" />
                                <p>
                                  {{
                                    profile.user()?.aboutMe ||
                                      'No bio added yet. Add a short player bio to help coaches understand your story and goals.'
                                  }}
                                </p>
                              </div>
                            </div>
                          </div>
                        }

                        @if (activeSideTab() === 'player-history') {
                          <div class="ov-top-row ov-top-row--single">
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Player History</h3>
                              @if (playerHistoryAffiliations().length === 0) {
                                <div class="madden-empty">
                                  <nxt1-icon name="time" [size]="48" />
                                  <h3>No history yet</h3>
                                  <p>
                                    @if (profile.isOwnProfile()) {
                                      Team history and year-by-year progression will appear here.
                                    } @else {
                                      This athlete hasn't added any team history yet.
                                    }
                                  </p>
                                </div>
                              } @else {
                                <div class="ov-history-list">
                                  @for (
                                    team of playerHistoryAffiliations();
                                    track team.name + '-' + (team.type || 'other') + '-' + $index
                                  ) {
                                    <article class="ov-history-item">
                                      <span class="ov-history-year">{{
                                        historySeasonLabel($index)
                                      }}</span>
                                      <div class="ov-history-main madden-team-block">
                                        <div class="madden-team-logo-wrap ov-history-logo-wrap">
                                          @if (team.logoUrl) {
                                            <nxt1-image
                                              class="madden-team-logo"
                                              [src]="team.logoUrl"
                                              [alt]="team.name"
                                              [width]="24"
                                              [height]="24"
                                              variant="avatar"
                                              fit="contain"
                                              [showPlaceholder]="false"
                                            />
                                          } @else {
                                            <span
                                              class="madden-team-logo-placeholder ov-history-logo-fallback"
                                            >
                                              <nxt1-icon
                                                [name]="teamIconName(team.type)"
                                                [size]="16"
                                              />
                                            </span>
                                          }
                                        </div>
                                        <div class="madden-team-info ov-history-content">
                                          <div class="madden-team-headline">
                                            <span class="madden-team-name ov-history-team">{{
                                              team.name
                                            }}</span>
                                          </div>
                                          @if (team.location) {
                                            <span class="madden-team-location ov-history-meta">{{
                                              team.location
                                            }}</span>
                                          }
                                        </div>
                                        <span class="ov-history-record">{{
                                          historyTeamRecord(team) ?? 'N/A'
                                        }}</span>
                                      </div>
                                    </article>
                                  }
                                </div>
                              }
                            </div>
                          </div>
                        }

                        @if (activeSideTab() === 'awards') {
                          <div class="ov-top-row ov-top-row--single">
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Awards</h3>
                              <nxt1-timeline
                                [items]="awardsTimelineItems()"
                                [isLoading]="profile.isLoading()"
                                [isOwnProfile]="profile.isOwnProfile()"
                                [emptyState]="awardsEmptyState"
                                [dotOverrides]="awardsDotOverrides"
                                cardLayout="horizontal"
                                fallbackIcon="trophy"
                              />
                            </div>
                          </div>
                        }

                        @if (activeSideTab() === 'academic') {
                          <div class="ov-top-row">
                            <div class="ov-section ov-section--profile">
                              <h3 class="ov-section-title ov-overview-title">Academic</h3>
                              @if (
                                !profile.user()?.gpa &&
                                !profile.user()?.sat &&
                                !profile.user()?.act &&
                                !profile.user()?.school?.name
                              ) {
                                <div class="madden-empty">
                                  <nxt1-icon name="school" [size]="48" />
                                  <h3>No academic info yet</h3>
                                  <p>
                                    @if (profile.isOwnProfile()) {
                                      Add GPA, test scores, and school details to strengthen your
                                      profile.
                                    } @else {
                                      This athlete hasn't added academic information yet.
                                    }
                                  </p>
                                  @if (profile.isOwnProfile()) {
                                    <button
                                      type="button"
                                      class="madden-cta-btn"
                                      (click)="onEditProfile()"
                                    >
                                      Add Academic Info
                                    </button>
                                  }
                                </div>
                              } @else {
                                <div class="madden-stat-group">
                                  <div class="madden-stat-grid">
                                    @if (profile.user()?.gpa) {
                                      <div class="madden-stat-card">
                                        <span class="madden-stat-value">{{
                                          profile.user()?.gpa
                                        }}</span>
                                        <span class="madden-stat-label">GPA</span>
                                      </div>
                                    }
                                    @if (profile.user()?.sat) {
                                      <div class="madden-stat-card">
                                        <span class="madden-stat-value">{{
                                          profile.user()?.sat
                                        }}</span>
                                        <span class="madden-stat-label">SAT</span>
                                      </div>
                                    }
                                    @if (profile.user()?.act) {
                                      <div class="madden-stat-card">
                                        <span class="madden-stat-value">{{
                                          profile.user()?.act
                                        }}</span>
                                        <span class="madden-stat-label">ACT</span>
                                      </div>
                                    }
                                  </div>
                                </div>
                              }
                            </div>
                          </div>
                        }

                        @if (activeSideTab() === 'contact') {
                          @if (
                            !profile.user()?.contact?.email &&
                            !profile.user()?.contact?.phone &&
                            connectedAccountsList().length === 0 &&
                            !profile.user()?.coachContact
                          ) {
                            <div class="madden-empty">
                              <nxt1-icon name="mail" [size]="48" />
                              <h3>Contact info not set</h3>
                              <p>
                                @if (profile.isOwnProfile()) {
                                  Add your contact information so coaches can reach you.
                                } @else {
                                  This athlete hasn't added contact information yet.
                                }
                              </p>
                              @if (profile.isOwnProfile()) {
                                <button
                                  type="button"
                                  class="madden-cta-btn"
                                  (click)="onEditContact()"
                                >
                                  Add Contact Info
                                </button>
                              }
                            </div>
                          } @else {
                            <div class="contact-social-row">
                              <!-- LEFT: Contact + Social Media -->
                              <div class="contact-social-col">
                                @if (
                                  profile.user()?.contact?.email || profile.user()?.contact?.phone
                                ) {
                                  <h3 class="contact-section-title">Contact</h3>
                                  <div class="contact-info-list">
                                    @if (profile.user()?.contact?.email) {
                                      <a
                                        class="contact-info-item"
                                        [href]="'mailto:' + profile.user()?.contact?.email"
                                      >
                                        <span class="contact-info-icon">
                                          <nxt1-icon name="mail" [size]="16" />
                                        </span>
                                        <div class="contact-info-text">
                                          <span class="contact-info-label">Email</span>
                                          <span class="contact-info-value">{{
                                            profile.user()?.contact?.email
                                          }}</span>
                                        </div>
                                      </a>
                                    }
                                    @if (profile.user()?.contact?.phone) {
                                      <a
                                        class="contact-info-item"
                                        [href]="'tel:' + profile.user()?.contact?.phone"
                                      >
                                        <span class="contact-info-icon">
                                          <nxt1-icon name="phone" [size]="16" />
                                        </span>
                                        <div class="contact-info-text">
                                          <span class="contact-info-label">Phone</span>
                                          <span class="contact-info-value">{{
                                            profile.user()?.contact?.phone
                                          }}</span>
                                        </div>
                                      </a>
                                    }
                                  </div>
                                }

                                @if (connectedAccountsList().length > 0) {
                                  <h3 class="contact-section-title" style="margin-top: 24px;">
                                    Social Media
                                  </h3>
                                  <div class="contact-social-chips">
                                    @for (acct of connectedAccountsList(); track acct.key) {
                                      <a
                                        class="contact-social-chip"
                                        [href]="acct.url"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <span
                                          class="contact-social-chip-icon"
                                          [style.color]="acct.color"
                                        >
                                          <nxt1-icon [name]="acct.icon" [size]="16" />
                                        </span>
                                        <span class="contact-social-chip-handle">{{
                                          acct.handle || acct.label
                                        }}</span>
                                      </a>
                                    }
                                  </div>
                                }
                              </div>

                              <!-- RIGHT: Coach Contact -->
                              @if (profile.user()?.coachContact; as coach) {
                                <div class="contact-social-col">
                                  <h3 class="contact-section-title">Coach Contact</h3>
                                  <div class="coach-card">
                                    <div class="coach-card-header">
                                      <span class="coach-card-avatar">
                                        <nxt1-icon name="person" [size]="18" />
                                      </span>
                                      <div class="coach-card-info">
                                        <span class="coach-card-name"
                                          >{{ coach.firstName }} {{ coach.lastName }}</span
                                        >
                                        @if (coach.title) {
                                          <span class="coach-card-title">{{ coach.title }}</span>
                                        }
                                      </div>
                                    </div>
                                    <div class="coach-card-divider"></div>
                                    <div class="contact-info-list">
                                      @if (coach.email) {
                                        <a
                                          class="contact-info-item"
                                          [href]="'mailto:' + coach.email"
                                        >
                                          <span class="contact-info-icon">
                                            <nxt1-icon name="mail" [size]="16" />
                                          </span>
                                          <div class="contact-info-text">
                                            <span class="contact-info-label">Email</span>
                                            <span class="contact-info-value">{{
                                              coach.email
                                            }}</span>
                                          </div>
                                        </a>
                                      }
                                      @if (coach.phone) {
                                        <a class="contact-info-item" [href]="'tel:' + coach.phone">
                                          <span class="contact-info-icon">
                                            <nxt1-icon name="phone" [size]="16" />
                                          </span>
                                          <div class="contact-info-text">
                                            <span class="contact-info-label">Phone</span>
                                            <span class="contact-info-value">{{
                                              coach.phone
                                            }}</span>
                                          </div>
                                        </a>
                                      }
                                    </div>
                                  </div>
                                </div>
                              }
                            </div>
                          }
                        }
                      </section>
                    }

                    @case ('timeline') {
                      <nxt1-profile-timeline
                        [posts]="profile.filteredPosts()"
                        [unifiedFeed]="profile.unifiedTimeline()"
                        [profileUser]="profile.user()"
                        [isLoading]="false"
                        [isLoadingMore]="profile.isLoadingMore()"
                        [isEmpty]="profile.isEmpty()"
                        [hasMore]="profile.hasMore()"
                        [isOwnProfile]="profile.isOwnProfile()"
                        [showMenu]="profile.isOwnProfile()"
                        [showFilters]="false"
                        [filter]="timelineFilter()"
                        [emptyIcon]="emptyState().icon"
                        [emptyTitle]="emptyState().title"
                        [emptyMessage]="emptyState().message"
                        [emptyCta]="profile.isOwnProfile() ? (emptyState().ctaLabel ?? null) : null"
                        (postClick)="onPostClick($event)"
                        (reactClick)="onLikePost($event)"
                        (repostClick)="onCommentPost($event)"
                        (shareClick)="onSharePost($event)"
                        (menuClick)="onPostMenu($event)"
                        (loadMore)="onLoadMore()"
                        (emptyCtaClick)="onCreatePost()"
                      />
                    }

                    @case ('news') {
                      <nxt1-profile-news-web
                        [activeSection]="activeSideTab()"
                        (articleClick)="onNewsArticleClick($event)"
                      />
                    }

                    @case ('videos') {
                      <nxt1-profile-timeline
                        [posts]="profile.videoPosts()"
                        [profileUser]="profile.user()"
                        [isLoading]="false"
                        [isEmpty]="profile.videoPosts().length === 0"
                        [isOwnProfile]="profile.isOwnProfile()"
                        [showFilters]="false"
                        [emptyIcon]="emptyState().icon"
                        [emptyTitle]="emptyState().title"
                        [emptyMessage]="emptyState().message"
                        [emptyCta]="profile.isOwnProfile() ? (emptyState().ctaLabel ?? null) : null"
                        (postClick)="onPostClick($event)"
                        (reactClick)="onLikePost($event)"
                        (shareClick)="onSharePost($event)"
                        (emptyCtaClick)="onUploadVideo()"
                      />
                    }

                    @case ('offers') {
                      @if (activeSideTab() === 'rankings') {
                        <nxt1-profile-rankings />
                      } @else if (activeSideTab() === 'scouting') {
                        <nxt1-profile-scouting-web (reportClick)="onScoutReportClick($event)" />
                      } @else {
                        <nxt1-profile-offers
                          [offers]="profile.offers()"
                          [committedOffers]="profile.committedOffers()"
                          [activeOffers]="profile.activeOffers()"
                          [interestOffers]="profile.interestOffers()"
                          [isEmpty]="!profile.hasRecruitingActivity()"
                          [isOwnProfile]="profile.isOwnProfile()"
                          [activeSection]="activeSideTab()"
                          cardLayout="horizontal"
                          (offerClick)="onOfferClick($event)"
                          (addOfferClick)="onAddOffer()"
                          (addCommitmentClick)="onAddOffer()"
                        />
                      }
                    }

                    @case ('metrics') {
                      <section
                        class="madden-tab-section madden-metrics"
                        aria-labelledby="metrics-heading"
                      >
                        <h2 id="metrics-heading" class="sr-only">Measurable Metrics</h2>

                        @if (profile.metrics().length === 0) {
                          <div class="madden-empty">
                            <nxt1-icon name="barbell" [size]="48" />
                            <h3>No metrics recorded</h3>
                            <p>
                              @if (profile.isOwnProfile()) {
                                Add your combine results and measurables to complete your profile.
                              } @else {
                                This athlete hasn't recorded any metrics yet.
                              }
                            </p>
                            @if (profile.isOwnProfile()) {
                              <button type="button" class="madden-cta-btn" (click)="onAddStats()">
                                {{ emptyState().ctaLabel }}
                              </button>
                            }
                          </div>
                        } @else {
                          @if (activeMetricCategory(); as cat) {
                            <div class="madden-stat-group">
                              <h3 class="ov-section-title">{{ cat.name }}</h3>
                              @if (cat.measuredAt || cat.source) {
                                <p class="madden-stat-group-meta">
                                  @if (cat.measuredAt) {
                                    <time [attr.datetime]="cat.measuredAt"
                                      >Measured {{ cat.measuredAt | date: 'MMM d, yyyy' }}</time
                                    >
                                  }
                                  @if (cat.measuredAt && cat.source) {
                                    <span aria-hidden="true"> · </span>
                                  }
                                  @if (cat.source) {
                                    <span>{{ cat.source }}</span>
                                  }
                                </p>
                              }
                              <div class="madden-stat-grid">
                                @for (stat of cat.stats; track stat.label) {
                                  <div class="madden-stat-card">
                                    <span class="madden-stat-value"
                                      >{{ stat.value }}{{ stat.unit ? ' ' + stat.unit : '' }}</span
                                    >
                                    <span class="madden-stat-label">{{ stat.label }}</span>
                                    @if (stat.verified) {
                                      <span class="madden-stat-verified" aria-label="Verified"
                                        >✓</span
                                      >
                                    }
                                  </div>
                                }
                              </div>
                            </div>
                          }
                        }
                      </section>
                    }

                    @case ('stats') {
                      <section
                        class="madden-tab-section stats-board"
                        aria-labelledby="stats-heading"
                      >
                        <h2 id="stats-heading" class="sr-only">Athletic Statistics</h2>

                        @if (
                          profile.gameLog().length === 0 && profile.athleticStats().length === 0
                        ) {
                          <div class="madden-empty">
                            <nxt1-icon name="stats-chart" [size]="48" />
                            <h3>No stats recorded</h3>
                            <p>
                              @if (profile.isOwnProfile()) {
                                Add your athletic and academic stats to complete your profile.
                              } @else {
                                This athlete hasn't recorded any stats yet.
                              }
                            </p>
                            @if (profile.isOwnProfile()) {
                              <button type="button" class="madden-cta-btn" (click)="onAddStats()">
                                {{ emptyState().ctaLabel }}
                              </button>
                            }
                          </div>
                        } @else {
                          <!-- ═══ Category Tabs (Passing / Rushing / etc.) ═══ -->
                          @if (gameLogCategoriesForSeason().length > 0) {
                            <nav class="stats-board__tabs" aria-label="Stat categories">
                              @for (
                                cat of gameLogCategoriesForSeason();
                                track cat;
                                let i = $index
                              ) {
                                <button
                                  type="button"
                                  class="stats-board__tab"
                                  [class.stats-board__tab--active]="
                                    activeGameLogCategoryIdx() === i
                                  "
                                  (click)="onGameLogCategoryChange(i)"
                                >
                                  {{ cat }}
                                </button>
                              }
                            </nav>
                          }

                          @if (activeGameLog(); as gl) {
                            <!-- ═══════════ CAREER MODE ═══════════ -->
                            @if (isCareerMode()) {
                              <!-- Career Summary Header -->
                              <div class="gl-summary">
                                <div class="gl-summary__left">
                                  <span class="gl-summary__season">Career</span>
                                  @if (gl.seasonRecord) {
                                    <span class="gl-summary__record"
                                      >Overall Record: {{ gl.seasonRecord }}</span
                                    >
                                  }
                                </div>
                              </div>

                              <!-- Career Totals (aggregate across all seasons) -->
                              @if (gl.totals && gl.totals.length > 0) {
                                <div class="gl-totals">
                                  @for (totalRow of gl.totals; track totalRow.label) {
                                    @if (
                                      totalRow.label === 'Career Totals' ||
                                      totalRow.label === 'Per Game Avg'
                                    ) {
                                      <div class="gl-totals__row">
                                        <span class="gl-totals__label">{{ totalRow.label }}</span>
                                        <div class="gl-totals__chips">
                                          @for (col of gl.columns; track col.key) {
                                            <div class="gl-totals__chip">
                                              <span class="gl-totals__chip-label">{{
                                                col.label
                                              }}</span>
                                              <span class="gl-totals__chip-value">{{
                                                totalRow.stats[col.key] !== undefined
                                                  ? totalRow.stats[col.key]
                                                  : '-'
                                              }}</span>
                                            </div>
                                          }
                                        </div>
                                      </div>
                                    }
                                  }
                                </div>
                              }

                              <!-- Per-Season Stat Boards -->
                              @for (
                                seasonLog of careerSeasonLogs();
                                track seasonLog.season + seasonLog.category
                              ) {
                                <div
                                  class="gl-season-board"
                                  role="region"
                                  [attr.aria-label]="
                                    seasonLog.season + ' ' + seasonLog.category + ' statistics'
                                  "
                                >
                                  <div class="gl-season-board__header">
                                    <span class="gl-season-board__title">{{
                                      seasonLog.season
                                    }}</span>
                                    @if (seasonLog.seasonRecord) {
                                      <span class="gl-season-board__record">{{
                                        seasonLog.seasonRecord
                                      }}</span>
                                    }
                                  </div>
                                  @if (seasonLog.totals && seasonLog.totals.length > 0) {
                                    <div class="gl-totals gl-totals--season">
                                      @for (totalRow of seasonLog.totals; track totalRow.label) {
                                        <div class="gl-totals__row">
                                          <span class="gl-totals__label">{{ totalRow.label }}</span>
                                          <div class="gl-totals__chips">
                                            @for (col of seasonLog.columns; track col.key) {
                                              <div class="gl-totals__chip">
                                                <span class="gl-totals__chip-label">{{
                                                  col.label
                                                }}</span>
                                                <span class="gl-totals__chip-value">{{
                                                  totalRow.stats[col.key] !== undefined
                                                    ? totalRow.stats[col.key]
                                                    : '-'
                                                }}</span>
                                              </div>
                                            }
                                          </div>
                                        </div>
                                      }
                                    </div>
                                  }
                                </div>
                              }

                              <!-- ═══════════ SINGLE SEASON MODE ═══════════ -->
                            } @else {
                              <!-- Season Summary Header -->
                              <div class="gl-summary">
                                <div class="gl-summary__left">
                                  <span class="gl-summary__season">{{ gl.season }}</span>
                                  @if (gl.seasonRecord) {
                                    <span class="gl-summary__record"
                                      >Record: {{ gl.seasonRecord }}</span
                                    >
                                  }
                                </div>
                              </div>

                              <!-- Season Totals Cards -->
                              @if (gl.totals && gl.totals.length > 0) {
                                <div class="gl-totals">
                                  @for (totalRow of gl.totals; track totalRow.label) {
                                    <div class="gl-totals__row">
                                      <span class="gl-totals__label">{{ totalRow.label }}</span>
                                      <div class="gl-totals__chips">
                                        @for (col of gl.columns; track col.key) {
                                          <div class="gl-totals__chip">
                                            <span class="gl-totals__chip-label">{{
                                              col.label
                                            }}</span>
                                            <span class="gl-totals__chip-value">{{
                                              totalRow.stats[col.key] !== undefined
                                                ? totalRow.stats[col.key]
                                                : '-'
                                            }}</span>
                                          </div>
                                        }
                                      </div>
                                    </div>
                                  }
                                </div>
                              }
                            }

                            <!-- ═══ Game Log Table (single-season only) ═══ -->
                            @if (!isCareerMode()) {
                              <div class="gl-table-wrap">
                                <table
                                  class="gl-table"
                                  role="grid"
                                  aria-label="Game log for {{ gl.season }} {{ gl.category }}"
                                >
                                  <thead>
                                    <tr>
                                      <th scope="col" class="gl-th gl-th--sticky">
                                        <button
                                          type="button"
                                          class="gl-th-btn"
                                          (click)="onGameLogSort('date')"
                                        >
                                          Date
                                          @if (gameLogSortKey() === 'date') {
                                            <span class="gl-sort-arrow" aria-hidden="true">{{
                                              gameLogSortDir() === 'asc' ? '▲' : '▼'
                                            }}</span>
                                          }
                                        </button>
                                      </th>
                                      <th scope="col" class="gl-th">
                                        <span class="gl-th-text">Result</span>
                                      </th>
                                      <th scope="col" class="gl-th">
                                        <span class="gl-th-text">Opponent</span>
                                      </th>
                                      @for (col of gl.columns; track col.key) {
                                        <th scope="col" class="gl-th gl-th--stat">
                                          <button
                                            type="button"
                                            class="gl-th-btn"
                                            [title]="col.tooltip ?? col.label"
                                            (click)="onGameLogSort(col.key)"
                                          >
                                            {{ col.label }}
                                            @if (gameLogSortKey() === col.key) {
                                              <span class="gl-sort-arrow" aria-hidden="true">{{
                                                gameLogSortDir() === 'asc' ? '▲' : '▼'
                                              }}</span>
                                            }
                                          </button>
                                        </th>
                                      }
                                    </tr>
                                  </thead>
                                  <tbody>
                                    @for (
                                      game of sortedGameLogEntries();
                                      track game.date + game.opponent;
                                      let rowIdx = $index
                                    ) {
                                      <tr class="gl-row" [class.gl-row--alt]="rowIdx % 2 === 1">
                                        <td class="gl-td gl-td--sticky gl-td--date">
                                          {{ game.date }}
                                        </td>
                                        <td class="gl-td gl-td--result">
                                          <span
                                            class="gl-result"
                                            [class.gl-result--win]="game.outcome === 'win'"
                                            [class.gl-result--loss]="game.outcome === 'loss'"
                                            [class.gl-result--tie]="game.outcome === 'tie'"
                                          >
                                            {{ game.result }}
                                          </span>
                                        </td>
                                        <td class="gl-td gl-td--opponent">{{ game.opponent }}</td>
                                        @for (col of gl.columns; track col.key) {
                                          <td class="gl-td gl-td--stat">
                                            {{
                                              game.stats[col.key] !== undefined
                                                ? game.stats[col.key]
                                                : '-'
                                            }}
                                          </td>
                                        }
                                      </tr>
                                    }
                                  </tbody>
                                </table>
                              </div>
                            }

                            <!-- ═══ Top Stats Comparison Bars (unchanged) ═══ -->
                            @if (statsComparisonItems().length > 0) {
                              <section
                                class="stats-compare"
                                aria-labelledby="stats-compare-heading"
                              >
                                <header class="stats-compare__header">
                                  <h3 id="stats-compare-heading" class="stats-compare__title">
                                    Top Stats
                                  </h3>
                                  <div
                                    class="stats-compare__legend"
                                    role="list"
                                    aria-label="Comparison legend"
                                  >
                                    <span class="stats-compare__legend-item" role="listitem">
                                      <span
                                        class="stats-compare__dot stats-compare__dot--player"
                                        aria-hidden="true"
                                      ></span>
                                      <span>{{ profile.user()?.firstName || 'Athlete' }}</span>
                                    </span>
                                    <span class="stats-compare__legend-item" role="listitem">
                                      <span
                                        class="stats-compare__dot stats-compare__dot--average"
                                        aria-hidden="true"
                                      ></span>
                                      <span>National Average</span>
                                    </span>
                                  </div>
                                </header>

                                <div
                                  class="stats-compare__grid"
                                  role="list"
                                  aria-label="Top stats comparison"
                                >
                                  @for (item of statsComparisonItems(); track item.label) {
                                    <article class="stats-compare__item" role="listitem">
                                      <div class="stats-compare__values">
                                        <span
                                          class="stats-compare__value stats-compare__value--player"
                                          >{{ item.playerDisplay }}</span
                                        >
                                        <span
                                          class="stats-compare__value stats-compare__value--average"
                                          >{{ item.averageDisplay }}</span
                                        >
                                      </div>

                                      <div class="stats-compare__bar-zone" aria-hidden="true">
                                        <div
                                          class="stats-compare__bar stats-compare__bar--player"
                                          [style.height.%]="item.playerPercent"
                                        ></div>
                                        <div
                                          class="stats-compare__bar stats-compare__bar--average"
                                          [style.height.%]="item.averagePercent"
                                        ></div>
                                      </div>

                                      <span class="stats-compare__label">{{ item.label }}</span>
                                    </article>
                                  }
                                </div>
                              </section>
                            }
                          }
                        }
                      </section>
                    }

                    @case ('academic') {
                      <section class="madden-tab-section" aria-labelledby="academic-heading">
                        <h2 id="academic-heading" class="sr-only">Academic Profile</h2>
                        @if (
                          !profile.user()?.gpa &&
                          !profile.user()?.sat &&
                          !profile.user()?.act &&
                          !profile.user()?.school?.name
                        ) {
                          <div class="madden-empty">
                            <nxt1-icon name="school" [size]="48" />
                            <h3>No academic info yet</h3>
                            <p>
                              @if (profile.isOwnProfile()) {
                                Add GPA, test scores, and school details to strengthen your profile.
                              } @else {
                                This athlete hasn't added academic information yet.
                              }
                            </p>
                            @if (profile.isOwnProfile()) {
                              <button
                                type="button"
                                class="madden-cta-btn"
                                (click)="onEditProfile()"
                              >
                                {{ emptyState().ctaLabel }}
                              </button>
                            }
                          </div>
                        } @else {
                          <div class="madden-stat-group">
                            <div class="madden-stat-grid">
                              @if (profile.user()?.gpa) {
                                <div class="madden-stat-card">
                                  <span class="madden-stat-value">{{ profile.user()?.gpa }}</span>
                                  <span class="madden-stat-label">GPA</span>
                                </div>
                              }
                              @if (profile.user()?.act) {
                                <div class="madden-stat-card">
                                  <span class="madden-stat-value">{{ profile.user()?.act }}</span>
                                  <span class="madden-stat-label">ACT</span>
                                </div>
                              }
                            </div>
                          </div>
                        }
                      </section>
                    }

                    @case ('events') {
                      <section class="madden-tab-section" aria-labelledby="events-heading">
                        <h2 id="events-heading" class="sr-only">Events</h2>
                        <nxt1-profile-events
                          [events]="profile.events()"
                          [visitEvents]="profile.visitEvents()"
                          [campEvents]="profile.campEvents()"
                          [generalEvents]="profile.generalEvents()"
                          [isLoading]="profile.isLoading()"
                          [isOwnProfile]="profile.isOwnProfile()"
                          [activeSection]="activeSideTab()"
                          cardLayout="horizontal"
                          (eventClick)="onEventClick($event)"
                          (addEventClick)="onAddEvent()"
                        />
                      </section>
                    }

                    @case ('schedule') {
                      <section
                        class="madden-tab-section madden-schedule"
                        aria-labelledby="schedule-heading"
                      >
                        <h2 id="schedule-heading" class="sr-only">Schedule</h2>

                        @if (scheduleEvents().length === 0) {
                          <div class="madden-empty">
                            <nxt1-icon name="calendar" [size]="48" />
                            <h3>No schedule yet</h3>
                            <p>
                              @if (profile.isOwnProfile()) {
                                Add games and practices to show your full season schedule.
                              } @else {
                                This athlete hasn't added any schedule items yet.
                              }
                            </p>
                            @if (profile.isOwnProfile()) {
                              <button type="button" class="madden-cta-btn" (click)="onAddEvent()">
                                {{ emptyState().ctaLabel }}
                              </button>
                            }
                          </div>
                        } @else {
                          <div class="schedule-board" role="list" aria-label="Team schedule">
                            @for (row of scheduleRows(); track row.event.id) {
                              <button
                                type="button"
                                class="schedule-row"
                                [class.schedule-row--past]="row.isPast"
                                role="listitem"
                                (click)="onEventClick(row.event)"
                              >
                                <div class="schedule-row__date">
                                  <span class="schedule-row__month">{{ row.month }}</span>
                                  <span class="schedule-row__day">{{ row.day }}</span>
                                </div>

                                <div class="schedule-row__matchup">
                                  <div class="schedule-row__teams">
                                    <div class="schedule-row__team schedule-row__team--home">
                                      <span class="schedule-row__team-name">{{
                                        row.homeTeam
                                      }}</span>
                                      @if (row.homeLogo; as homeLogo) {
                                        <nxt1-image
                                          class="schedule-row__logo"
                                          [src]="homeLogo"
                                          [alt]="row.homeTeam + ' logo'"
                                          [width]="20"
                                          [height]="20"
                                          variant="avatar"
                                          fit="contain"
                                          [showPlaceholder]="false"
                                        />
                                      }
                                    </div>

                                    <span class="schedule-row__vs">vs</span>

                                    <div class="schedule-row__team schedule-row__team--away">
                                      <span class="schedule-row__team-name">{{
                                        row.awayTeam
                                      }}</span>
                                      @if (row.awayLogo; as awayLogo) {
                                        <nxt1-image
                                          class="schedule-row__logo"
                                          [src]="awayLogo"
                                          [alt]="row.awayTeam + ' logo'"
                                          [width]="20"
                                          [height]="20"
                                          variant="avatar"
                                          fit="contain"
                                          [showPlaceholder]="false"
                                        />
                                      }
                                    </div>
                                  </div>

                                  <div class="schedule-row__meta">
                                    <span>{{ row.location }}</span>
                                    <span aria-hidden="true">•</span>
                                    <span>{{ row.time }}</span>
                                  </div>
                                </div>

                                <div class="schedule-row__status">
                                  <span class="schedule-row__status-label">{{
                                    row.statusLabel
                                  }}</span>
                                  <span class="schedule-row__status-value">{{
                                    row.statusValue
                                  }}</span>
                                </div>
                              </button>
                            }
                          </div>
                        }
                      </section>
                    }

                    @case ('contact') {
                      <section class="madden-tab-section" aria-labelledby="contact-heading">
                        <h2 id="contact-heading" class="sr-only">Contact Information</h2>
                        @if (
                          !profile.user()?.contact?.email &&
                          !profile.user()?.contact?.phone &&
                          !profile.user()?.social &&
                          !profile.user()?.coachContact
                        ) {
                          <div class="madden-empty">
                            <nxt1-icon name="mail" [size]="48" />
                            <h3>Contact info not set</h3>
                            <p>
                              @if (profile.isOwnProfile()) {
                                Add your contact information so coaches can reach you.
                              } @else {
                                This athlete hasn't added contact information yet.
                              }
                            </p>
                            @if (profile.isOwnProfile()) {
                              <button
                                type="button"
                                class="madden-cta-btn"
                                (click)="onEditContact()"
                              >
                                {{ emptyState().ctaLabel }}
                              </button>
                            }
                          </div>
                        } @else {
                          <div class="contact-social-row">
                            <!-- LEFT: Contact + Social Media -->
                            <div class="contact-social-col">
                              @if (
                                profile.user()?.contact?.email || profile.user()?.contact?.phone
                              ) {
                                <h3 class="contact-section-title">Contact</h3>
                                <div class="contact-info-list">
                                  @if (profile.user()?.contact?.email) {
                                    <a
                                      class="contact-info-item"
                                      [href]="'mailto:' + profile.user()?.contact?.email"
                                    >
                                      <span class="contact-info-icon">
                                        <nxt1-icon name="mail" [size]="16" />
                                      </span>
                                      <div class="contact-info-text">
                                        <span class="contact-info-label">Email</span>
                                        <span class="contact-info-value">{{
                                          profile.user()?.contact?.email
                                        }}</span>
                                      </div>
                                    </a>
                                  }
                                  @if (profile.user()?.contact?.phone) {
                                    <a
                                      class="contact-info-item"
                                      [href]="'tel:' + profile.user()?.contact?.phone"
                                    >
                                      <span class="contact-info-icon">
                                        <nxt1-icon name="phone" [size]="16" />
                                      </span>
                                      <div class="contact-info-text">
                                        <span class="contact-info-label">Phone</span>
                                        <span class="contact-info-value">{{
                                          profile.user()?.contact?.phone
                                        }}</span>
                                      </div>
                                    </a>
                                  }
                                </div>
                              }

                              @if (connectedAccountsList().length > 0) {
                                <h3 class="contact-section-title" style="margin-top: 24px;">
                                  Social Media
                                </h3>
                                <div class="contact-social-chips">
                                  @for (acct of connectedAccountsList(); track acct.key) {
                                    <a
                                      class="contact-social-chip"
                                      [href]="acct.url"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <span
                                        class="contact-social-chip-icon"
                                        [style.color]="acct.color"
                                      >
                                        <nxt1-icon [name]="acct.icon" [size]="16" />
                                      </span>
                                      <span class="contact-social-chip-handle">{{
                                        acct.handle || acct.label
                                      }}</span>
                                    </a>
                                  }
                                </div>
                              }
                            </div>

                            <!-- RIGHT: Coach Contact -->
                            @if (profile.user()?.coachContact; as coach) {
                              <div class="contact-social-col">
                                <h3 class="contact-section-title">Coach Contact</h3>
                                <div class="coach-card">
                                  <div class="coach-card-header">
                                    <span class="coach-card-avatar">
                                      <nxt1-icon name="person" [size]="18" />
                                    </span>
                                    <div class="coach-card-info">
                                      <span class="coach-card-name"
                                        >{{ coach.firstName }} {{ coach.lastName }}</span
                                      >
                                      @if (coach.title) {
                                        <span class="coach-card-title">{{ coach.title }}</span>
                                      }
                                    </div>
                                  </div>
                                  <div class="coach-card-divider"></div>
                                  <div class="contact-info-list">
                                    @if (coach.email) {
                                      <a class="contact-info-item" [href]="'mailto:' + coach.email">
                                        <span class="contact-info-icon">
                                          <nxt1-icon name="mail" [size]="16" />
                                        </span>
                                        <div class="contact-info-text">
                                          <span class="contact-info-label">Email</span>
                                          <span class="contact-info-value">{{ coach.email }}</span>
                                        </div>
                                      </a>
                                    }
                                    @if (coach.phone) {
                                      <a class="contact-info-item" [href]="'tel:' + coach.phone">
                                        <span class="contact-info-icon">
                                          <nxt1-icon name="phone" [size]="16" />
                                        </span>
                                        <div class="contact-info-text">
                                          <span class="contact-info-label">Phone</span>
                                          <span class="contact-info-value">{{ coach.phone }}</span>
                                        </div>
                                      </a>
                                    }
                                  </div>
                                </div>
                              </div>
                            }
                          </div>
                        }
                      </section>
                    }
                  }
                </section>
              </div>
            </div>

            <!-- RIGHT SIDE: Player image + Team info -->
            <div class="madden-split-right">
              <div class="madden-right-stack">
                <!-- ─── ACTION GRID ─── -->
                <div class="right-action-grid">
                  <button
                    type="button"
                    class="right-action-btn"
                    (click)="shareClick.emit()"
                    aria-label="Share profile"
                  >
                    <nxt1-icon name="share" [size]="20" />
                    <span>Share Profile</span>
                  </button>
                  <button
                    type="button"
                    class="right-action-btn"
                    (click)="qrCodeClick.emit()"
                    aria-label="Open QR code"
                  >
                    <nxt1-icon name="qrCode" [size]="20" />
                    <span>QR Code</span>
                  </button>
                </div>

                @if (profile.profileImages().length > 0) {
                  <div class="carousel-glow-wrap">
                    <div class="carousel-glow-border" aria-hidden="true"></div>
                    <div class="carousel-glow-ambient" aria-hidden="true"></div>
                    <nxt1-image-carousel
                      [images]="profile.profileImages()"
                      [alt]="desktopTitle()"
                      [autoPlay]="true"
                      [autoPlayInterval]="4200"
                      [overlayTitle]="desktopTitle()"
                      [overlaySubtitle]="carouselOverlaySubtitle()"
                      [overlayTitles]="carouselOverlayTitles()"
                      [overlaySubtitles]="carouselOverlaySubtitles()"
                      class="madden-player-carousel"
                    />
                    @if (
                      profile.user()?.verificationStatus === 'verified' ||
                      profile.user()?.verificationStatus === 'premium'
                    ) {
                      <span class="carousel-verified-badge">
                        <nxt1-icon name="checkmark-circle" [size]="14" />
                        Verified
                      </span>
                    }
                  </div>
                }
                <!-- Team affiliations (school/club/juco/etc.) -->
                @if (teamAffiliations().length > 0) {
                  <div class="madden-team-stack">
                    @for (
                      team of teamAffiliations();
                      track team.name + '-' + (team.type || 'other')
                    ) {
                      <div
                        class="madden-team-block madden-team-block--clickable"
                        role="button"
                        tabindex="0"
                        (click)="onEditTeam()"
                        (keydown.enter)="onEditTeam()"
                        (keydown.space)="onEditTeam(); $event.preventDefault()"
                      >
                        @if (team.logoUrl) {
                          <nxt1-image
                            class="madden-team-logo"
                            [src]="team.logoUrl"
                            [alt]="team.name"
                            [width]="32"
                            [height]="32"
                            variant="avatar"
                            fit="contain"
                            [priority]="true"
                            [showPlaceholder]="false"
                          />
                        } @else {
                          <div class="madden-team-logo-placeholder">
                            <nxt1-icon [name]="teamIconName(team.type)" [size]="22" />
                          </div>
                        }
                        <div class="madden-team-info">
                          <div class="madden-team-headline">
                            <span class="madden-team-name">{{ team.name }}</span>
                          </div>
                          @if (team.location) {
                            <span class="madden-team-location">{{ team.location }}</span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </main>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
   MADDEN FRANCHISE MODE — FULL LAYOUT
   Tab bar on top → Full-screen banner stage → Content overlayed
   Side tabs on left → Scrollable content center → Player right
   ═══════════════════════════════════════════════════════════ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow: hidden;
        --m-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --m-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --m-surface-2: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --m-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --m-text: var(--nxt1-color-text-primary, #ffffff);
        --m-text-2: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --m-text-3: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --m-accent: var(--nxt1-color-primary, #d4ff00);
      }

      .profile-main {
        background: var(--m-bg);
        height: 100%;
        overflow: hidden;
        padding-top: 0;
        /* Flex column prevents the empty <nxt-refresher> host element
           from creating an anonymous line box (~20px) that pushes
           content down.  Matches shell__content's flex layout. */
        display: flex;
        flex-direction: column;
      }

      /* ─── HEADER ACTION BUTTONS ─── */
      .profile-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .profile-header-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        padding: 0;
        margin: 0;
        border: none;
        background: transparent;
        border-radius: 50%;
        color: var(--m-text);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color 0.15s ease,
          transform 0.1s ease;
      }
      .profile-header-action-btn:hover {
        background: var(--m-surface-2);
      }
      .profile-header-action-btn:active {
        transform: scale(0.92);
      }

      /* ─── ERROR STATE ─── */
      .madden-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 64px 24px;
        text-align: center;
      }
      .madden-error-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }
      .madden-error-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--m-text);
        margin: 0 0 8px;
      }
      .madden-error-msg {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
      }
      .madden-error-btn {
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        color: var(--m-text);
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .madden-error-btn:hover {
        background: var(--m-surface-2);
      }

      /* ─── FULL-SCREEN BANNER STAGE ─── */
      .madden-stage {
        position: relative;
        height: calc(100vh - 64px);
        overflow: hidden;
        flex-shrink: 0;
      }

      /* ─── HALFTONE FADED BACKGROUND ─── */
      .stage-halftone-bg {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }

      /* Halftone dot pattern — radial dots that give a newsprint/recruiting card texture */
      .stage-halftone-dots {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(
          circle,
          color-mix(in srgb, var(--m-accent) 28%, transparent) 1.2px,
          transparent 1.2px
        );
        background-size: 11px 11px;
        /* Fade from right to left with generous spread */
        mask-image: radial-gradient(
          ellipse 130% 110% at 85% 50%,
          black 0%,
          rgba(0, 0, 0, 0.7) 20%,
          rgba(0, 0, 0, 0.35) 45%,
          transparent 68%
        );
        -webkit-mask-image: radial-gradient(
          ellipse 130% 110% at 85% 50%,
          black 0%,
          rgba(0, 0, 0, 0.7) 20%,
          rgba(0, 0, 0, 0.35) 45%,
          transparent 68%
        );
        opacity: 1;
      }

      /* Soft colour wash that glows behind the right panel */
      .stage-halftone-fade {
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse 75% 100% at 88% 50%,
          color-mix(in srgb, var(--m-accent) 16%, transparent) 0%,
          color-mix(in srgb, var(--m-accent) 8%, transparent) 30%,
          transparent 62%
        );
      }

      /* Respect motion preferences */
      @media (prefers-reduced-motion: reduce) {
        .stage-halftone-dots,
        .stage-halftone-fade {
          opacity: 0.5;
        }
      }

      /* ─── SPLIT LAYOUT: Left content | Right player ─── */
      .madden-split {
        position: relative;
        z-index: 5;
        display: flex;
        height: 100%;
      }
      .madden-split-left {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        max-width: calc(100% - 380px);
        overflow: hidden;
        padding-left: 4px;
      }
      .madden-split-right {
        flex-shrink: 0;
        width: 380px;
        position: relative;
        overflow-x: hidden;
        overflow-y: auto;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        min-height: 0;
        padding: 0 16px 12px 0;
      }
      .madden-right-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 300px;
        height: auto;
        padding-top: 0;
        padding-bottom: 12px;
      }

      /* ─── RIGHT PANEL ACTION GRID ─── */
      .right-action-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-2);
        width: 100%;
      }

      .right-action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1-5);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-2);
        border: 1px solid var(--m-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--m-surface);
        color: var(--m-text-2);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        text-align: center;
        -webkit-tap-highlight-color: transparent;
        transition:
          background var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out),
          color var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out),
          border-color var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
      }
      .right-action-btn:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
        border-color: var(--m-accent);
      }
      .right-action-btn:active {
        transform: scale(0.97);
      }

      /* ═══ ANIMATED GLOW BORDER — runs ONCE then settles ═══ */

      /* Houdini custom property for native angle interpolation */
      @property --glow-angle {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }

      /* ── Keyframes ── */

      /* Border spins one full revolution then fades out */
      @keyframes glow-spin {
        0% {
          --glow-angle: 0deg;
          opacity: 1;
        }
        80% {
          --glow-angle: 288deg;
          opacity: 1;
        }
        100% {
          --glow-angle: 360deg;
          opacity: 0;
        }
      }

      /* Ambient glow swells once then settles to a subtle idle */
      @keyframes glow-swell {
        0% {
          opacity: 0;
          transform: scale(0.96);
        }
        40% {
          opacity: 0.65;
          transform: scale(1.02);
        }
        100% {
          opacity: 0.25;
          transform: scale(1);
        }
      }

      /* Vignette fades in after spin completes */
      @keyframes vignette-in {
        0% {
          opacity: 0;
        }
        100% {
          opacity: 1;
        }
      }

      /* ── Wrapper ── */
      .carousel-glow-wrap {
        position: relative;
        width: 100%;
        height: 56vh;
        border-radius: 18px;
        isolation: isolate;
        contain: layout style;
      }
      .carousel-verified-badge {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 4;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px 4px 6px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: var(--m-accent);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.03em;
        pointer-events: none;
      }

      /* ── Rotating conic-gradient border (plays once) ── */
      .carousel-glow-border {
        position: absolute;
        inset: -2px;
        border-radius: 20px;
        z-index: 0;
        background: conic-gradient(
          from var(--glow-angle, 0deg),
          var(--m-accent) 0%,
          transparent 12%,
          transparent 33%,
          var(--m-accent) 45%,
          transparent 57%,
          transparent 78%,
          var(--m-accent) 90%,
          transparent 100%
        );
        animation: glow-spin 2.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        will-change: --glow-angle, opacity;
        border: 2px solid transparent;
        pointer-events: none;
      }

      /* ── Soft ambient glow (swells once, stays subtle) ── */
      .carousel-glow-ambient {
        position: absolute;
        inset: -6px;
        border-radius: 24px;
        z-index: -1;
        background: radial-gradient(
          ellipse at 50% 30%,
          color-mix(in srgb, var(--m-accent) 25%, transparent) 0%,
          transparent 70%
        );
        filter: blur(18px);
        opacity: 0;
        animation: glow-swell 2.4s ease-out forwards;
        will-change: opacity, transform;
        pointer-events: none;
      }

      /* ── Respect prefers-reduced-motion ── */
      @media (prefers-reduced-motion: reduce) {
        .carousel-glow-border {
          animation: none;
          background: none;
          border: 2px solid color-mix(in srgb, var(--m-accent) 30%, transparent);
          opacity: 1;
        }
        .carousel-glow-ambient {
          animation: none;
          opacity: 0.2;
        }
        .madden-player-carousel ::ng-deep .carousel::before {
          animation: none;
          opacity: 1;
        }
      }

      .madden-player-carousel {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        border-radius: 16px;
        overflow: hidden;
      }
      .madden-player-carousel ::ng-deep .carousel {
        position: relative;
        height: 100%;
        border-radius: 16px;
      }
      .madden-player-carousel ::ng-deep .carousel::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        border-radius: 16px;
        pointer-events: none;
        opacity: 0;
        animation: vignette-in 0.8s ease-out 2.4s forwards;
        background:
          linear-gradient(
            to bottom,
            color-mix(in srgb, var(--m-accent) 16%, rgba(10, 10, 10, 0.3)) 0%,
            transparent 9%
          ),
          linear-gradient(
            to top,
            color-mix(in srgb, var(--m-accent) 18%, rgba(10, 10, 10, 0.36)) 0%,
            transparent 12%
          ),
          linear-gradient(
            to right,
            color-mix(in srgb, var(--m-accent) 14%, rgba(10, 10, 10, 0.28)) 0%,
            transparent 7%
          ),
          linear-gradient(
            to left,
            color-mix(in srgb, var(--m-accent) 14%, rgba(10, 10, 10, 0.28)) 0%,
            transparent 7%
          );
      }
      .madden-player-carousel ::ng-deep .carousel-track {
        height: 100%;
      }
      .madden-player-carousel ::ng-deep .carousel-slide {
        height: 100%;
      }
      .madden-player-carousel ::ng-deep .carousel-img {
        height: 100%;
        object-position: center top;
      }

      /* Team block below player image */
      .madden-team-stack {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .madden-team-block {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .madden-team-block--clickable {
        cursor: pointer;
        transition:
          transform 0.18s ease,
          box-shadow 0.18s ease;
      }
      .madden-team-block--clickable:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
      }
      .madden-team-block--clickable:focus-visible {
        outline: none;
        box-shadow:
          0 0 0 2px color-mix(in srgb, var(--m-text-2) 38%, transparent),
          0 6px 16px rgba(0, 0, 0, 0.16);
      }
      .madden-team-logo {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .madden-team-logo-placeholder {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background: var(--m-surface-2);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3);
        flex-shrink: 0;
      }
      .madden-team-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 2px;
      }
      .madden-team-headline {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .madden-team-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .madden-team-type {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--m-accent);
        border: 1px solid color-mix(in srgb, var(--m-accent) 42%, transparent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        border-radius: 999px;
        padding: 2px 8px;
      }
      .madden-team-location {
        font-size: 12px;
        color: var(--m-text-3);
      }

      /* Mobile hero stats — hidden on desktop (shown at <=768px) */
      .madden-mobile-hero__stats {
        display: none;
      }

      /* Mobile-only team affiliations in overview — hidden on desktop */
      .ov-mobile-teams {
        display: none;
      }

      /* ─── TOP TAB BAR ─── */
      .madden-top-tabs {
        padding: 0 8px;
        margin-top: -6px;
        border-bottom: none;
        background: transparent;
        flex-shrink: 0;
      }

      /* Force option-scroller background transparent, compact height & hide badges in profile context */
      .madden-top-tabs ::ng-deep .option-scroller {
        background: transparent !important;
      }
      .madden-top-tabs ::ng-deep .option-scroller__container {
        min-height: 0;
      }
      .madden-top-tabs ::ng-deep .option-scroller__option {
        height: 36px;
      }
      .madden-top-tabs ::ng-deep .option-scroller__badge {
        display: none !important;
      }

      /* ─── CONTENT LAYER (overlayed on banner) ─── */
      .madden-content-layer {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding: 18px 0 0;
        gap: var(--nxt1-spacing-4);
      }

      /* ─── SECTION NAV HOST — constrain width ─── */
      .madden-side-nav-column {
        flex-shrink: 0;
        width: 180px;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        position: sticky;
        top: var(--nxt1-spacing-6);
        align-self: stretch;
        max-height: calc(100vh - 200px);
        overflow-y: auto;
        scrollbar-width: none;
        padding-bottom: 120px;
      }
      .madden-side-nav-column::-webkit-scrollbar {
        display: none;
      }

      .madden-side-nav-column nxt1-section-nav-web {
        width: 100%;
      }

      /* ─── SPORT PROFILE SWITCHER ─── */
      .sport-switcher {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 0;
        position: absolute;
        bottom: 65px;
        left: 0;
        width: 100%;
      }

      .sport-switcher__title {
        padding: 0 var(--nxt1-spacing-2);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.06em;
        white-space: nowrap;
      }

      .sport-switcher__list {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 4px;
      }

      .sport-switcher__item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px 4px 4px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--nxt1-radius-full, 999px);
        cursor: pointer;
        text-align: left;
        color: var(--nxt1-color-text-secondary);
        transition:
          color 100ms ease-out,
          background 100ms ease-out,
          border-color 100ms ease-out;
      }

      .sport-switcher__item:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
      }

      .sport-switcher__item--active {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border-color: var(--nxt1-color-primary);
      }

      .sport-switcher__item--active:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
      }

      .sport-switcher__item:focus,
      .sport-switcher__item:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--nxt1-color-primary);
      }

      .sport-switcher__avatar {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        border: 1.5px solid transparent;
      }

      .sport-switcher__item--active .sport-switcher__avatar {
        border-color: var(--nxt1-color-primary);
      }

      .sport-switcher__avatar-fallback {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-text-secondary);
        font-size: 10px;
        font-weight: 700;
        border: 1.5px solid transparent;
      }

      .sport-switcher__item--active .sport-switcher__avatar-fallback {
        border-color: var(--nxt1-color-primary);
      }

      .sport-switcher__sport-name {
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
      }

      .sport-switcher__active-badge {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        flex-shrink: 0;
        margin-left: -2px;
      }

      /* ─── MAIN CONTENT SCROLL AREA ─── */
      .madden-content-scroll {
        flex: 1;
        min-width: 0;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-gutter: stable both-edges;
        padding: 0 12px 120px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      /* Center-constrain all direct children (Twitter/Instagram pattern) */
      .madden-content-scroll > * {
        width: 100%;
        max-width: 660px;
      }
      .madden-content-scroll::-webkit-scrollbar {
        width: 6px;
      }
      .madden-content-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .madden-content-scroll::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      }

      /* Constrain images inside content scroll */
      .madden-content-scroll :deep(img),
      .madden-content-scroll ::ng-deep img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
      }

      /* ─── TAB SECTION GENERIC ─── */
      .madden-tab-section {
        padding: 4px 0;
      }

      /* ─── EMPTY STATE ─── */
      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 48px 24px;
        text-align: center;
        color: var(--m-text-3);
      }
      .madden-empty h3 {
        font-size: 18px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
        max-width: 280px;
      }

      /* CTA Button */
      .madden-cta-btn {
        background: var(--m-accent);
        color: #000;
        border: none;
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.15s;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }

      /* ─── SECTION LABELS ─── */
      .madden-section-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-2);
        margin: 0 0 12px;
      }
      .madden-section-label--muted {
        color: var(--m-text-3);
        margin-top: 24px;
      }

      /* ═══ SHARED VERIFICATION BANNER ═══ */
      .profile-verification-banner {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
        padding: var(--nxt1-spacing-3);
        margin: 0 0 var(--nxt1-spacing-5, 1.25rem);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-xl, 16px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
      }
      .verified-by__label {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.6));
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        white-space: nowrap;
      }
      .verified-by__chip {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5, 0.375rem);
        padding: 0.375rem 0.625rem;
        border-radius: var(--nxt1-radius-full, 999px);
        text-decoration: none;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.8));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04)) 75%,
          transparent
        );
        transition:
          border-color var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out),
          background var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out);
      }
      .verified-by__chip:hover {
        border-color: var(--nxt1-color-primary, #d4ff00);
        background: color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 10%, transparent);
      }
      .verified-by__chip--unverified {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.6));
        border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04)) 75%,
          transparent
        );
      }
      .verified-by__logo {
        width: 16px;
        height: 16px;
        object-fit: contain;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .verified-by__name {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1;
      }
      @media (max-width: 640px) {
        .profile-verification-banner {
          padding: var(--nxt1-spacing-2-5, 0.625rem);
          margin: 0 0 var(--nxt1-spacing-4, 1rem);
        }
        .verified-by__chip {
          padding: 0.3125rem 0.5625rem;
        }
      }

      /* ─── STATS BOARD (Professional Table/Leaderboard) ─── */
      .stats-board {
        padding-top: 0;
      }
      .stats-board__top-bar {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
      }

      /* Category pill tabs */
      .stats-board__tabs {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 0 16px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .stats-board__tabs::-webkit-scrollbar {
        display: none;
      }
      .stats-board__tab {
        flex-shrink: 0;
        padding: 7px 16px;
        border-radius: 999px;
        border: 1px solid var(--m-border);
        background: transparent;
        color: var(--m-text-2);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.18s ease;
        white-space: nowrap;
        line-height: 1.2;
      }
      .stats-board__tab:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
        border-color: color-mix(in srgb, var(--m-accent) 30%, var(--m-border));
      }
      .stats-board__tab--active {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
        font-weight: 700;
      }
      .stats-board__tab--active:hover {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
        filter: brightness(1.08);
      }

      /* Table wrapper — horizontal scroll on small screens */
      .stats-board__table-wrap {
        --stats-board-th-pad-y: 10px;
        --stats-board-th-pad-x: 16px;
        --stats-board-header-height: calc((var(--stats-board-th-pad-y) * 2) + 14px);
        position: relative;
        border-radius: 10px;
        border: 1px solid var(--m-border);
        background-color: var(--m-surface);
        background-image: linear-gradient(
          180deg,
          color-mix(in srgb, var(--m-accent) 5%, var(--m-surface)),
          var(--m-surface)
        );
        background-repeat: no-repeat;
        background-size: 100% var(--stats-board-header-height);
        overflow-x: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--m-surface-2) transparent;
      }
      .stats-board__table-wrap::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: var(--stats-board-header-height);
        border-top: 1px solid var(--m-border);
        pointer-events: none;
      }
      .stats-board__table-wrap--compact {
        --stats-board-th-pad-y: 8px;
        --stats-board-th-pad-x: 12px;
        border-radius: 8px;
      }

      /* The table itself */
      .stats-board__table {
        border-collapse: collapse;
        table-layout: auto;
        min-width: max-content;
      }

      /* Header row */
      .stats-board__table thead tr {
        border-bottom: none;
      }
      .stats-board__table th {
        padding: var(--stats-board-th-pad-y) var(--stats-board-th-pad-x);
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        background: transparent;
      }
      .stats-board__th-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
        user-select: none;
      }

      /* Data cells */
      .stats-board__table td {
        padding: 14px 16px;
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        position: relative;
      }
      .stats-board__table tbody tr {
        border-bottom: 1px solid color-mix(in srgb, var(--m-border) 50%, transparent);
        transition: background 0.12s ease;
      }
      .stats-board__table tbody tr:last-child {
        border-bottom: none;
      }
      .stats-board__table tbody tr:hover {
        background: color-mix(in srgb, var(--m-accent) 4%, transparent);
      }

      .stats-compare {
        margin-top: 10px;
        border: 1px solid var(--m-border);
        border-radius: 8px;
        background: var(--m-surface);
        padding: 12px 12px 8px;
      }
      .stats-compare__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 4px;
      }
      .stats-compare__title {
        margin: 0;
        font-size: 14px;
        font-weight: 800;
        color: var(--m-text);
        letter-spacing: -0.01em;
      }
      .stats-compare__legend {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .stats-compare__legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--m-text-2);
        font-size: 12px;
        font-weight: 500;
      }
      .stats-compare__dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
      }
      .stats-compare__dot--player {
        background: var(--m-accent);
      }
      .stats-compare__dot--average {
        background: color-mix(in srgb, var(--m-text-3) 70%, var(--m-border));
      }
      .stats-compare__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: 6px;
      }
      .stats-compare__item {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
      }
      .stats-compare__values {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        margin-bottom: 5px;
      }
      .stats-compare__value {
        font-variant-numeric: tabular-nums;
        line-height: 1.04;
        white-space: nowrap;
      }
      .stats-compare__value--player {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
      }
      .stats-compare__value--average {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-text-3);
      }
      .stats-compare__bar-zone {
        --stats-compare-bar-max-height: 70px;
        position: relative;
        width: 100%;
        height: var(--stats-compare-bar-max-height);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 6px;
        border-bottom: 1px solid var(--m-border);
        margin-bottom: 6px;
      }
      .stats-compare__bar {
        width: 10px;
        border-radius: 999px 999px 0 0;
        min-height: 0;
      }
      .stats-compare__bar--player {
        background: var(--m-accent);
      }
      .stats-compare__bar--average {
        background: color-mix(in srgb, var(--m-text-3) 70%, var(--m-border));
      }
      .stats-compare__label {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-text);
        text-align: center;
        letter-spacing: -0.01em;
        text-transform: uppercase;
      }
      .stats-board__cell-value {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.01em;
      }
      .stats-board__verified {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: var(--m-accent);
        color: #000;
        font-size: 9px;
        font-weight: 800;
        margin-left: 5px;
        vertical-align: middle;
        line-height: 1;
      }

      /* Compact variant for overview sidebar */
      .stats-board__table--compact th {
        padding: 8px 12px;
      }
      .stats-board__table--compact td {
        padding: 10px 12px;
      }
      .stats-board__table--compact .stats-board__cell-value {
        font-size: 14px;
      }

      /* Responsive */
      @media (max-width: 640px) {
        .stats-board__table-wrap {
          --stats-board-th-pad-y: 8px;
          --stats-board-th-pad-x: 10px;
        }
        .stats-board__tabs {
          padding-bottom: 12px;
        }
        .stats-board__tab {
          padding: 6px 12px;
          font-size: 11px;
        }
        .stats-board__table th {
          padding: var(--stats-board-th-pad-y) var(--stats-board-th-pad-x);
        }
        .stats-board__table td {
          padding: 12px 10px;
        }
        .stats-board__cell-value {
          font-size: 14px;
        }
        .stats-board__th-label {
          font-size: 10px;
        }
        .stats-compare {
          padding: 10px 8px 8px;
        }
        .stats-compare__header {
          align-items: flex-start;
          flex-direction: column;
          gap: 10px;
        }
        .stats-compare__legend {
          gap: 10px;
        }
        .stats-compare__value--player {
          font-size: 14px;
        }
        .stats-compare__value--average {
          font-size: 11px;
        }
        .stats-compare__bar-zone {
          --stats-compare-bar-max-height: 56px;
        }
        .stats-compare__bar {
          width: 8px;
        }
        .stats-compare__label {
          font-size: 11px;
        }
      }

      /* ═══════════════════════════════════════════════════════════ */
      /* ─── GAME LOG (MaxPreps-style Professional Table) ─────── */
      /* ═══════════════════════════════════════════════════════════ */

      /* Team type toggle (School / Club) — mobile only */
      .gl-team-type-nav {
        display: none;
        align-items: center;
        gap: 4px;
        padding: 0 0 10px;
      }
      @media (max-width: 768px) {
        .gl-team-type-nav {
          display: flex;
        }
      }
      .gl-team-type-pill {
        flex: 1;
        padding: 8px 0;
        border-radius: 8px;
        border: 1px solid var(--m-border);
        background: transparent;
        color: var(--m-text-2);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }
      .gl-team-type-pill:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
      }
      .gl-team-type-pill--active {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
      }

      /* Season pill nav — hidden on desktop (side tabs handle year filtering) */
      .gl-season-nav {
        display: none;
        align-items: center;
        gap: 6px;
        padding: 0 0 12px;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      @media (max-width: 768px) {
        .gl-season-nav {
          display: flex;
        }
      }
      .gl-season-nav::-webkit-scrollbar {
        display: none;
      }
      .gl-season-pill {
        flex-shrink: 0;
        padding: 6px 14px;
        border-radius: 999px;
        border: 1px solid var(--m-border);
        background: transparent;
        color: var(--m-text-2);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .gl-season-pill:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
      }
      .gl-season-pill--active {
        background: var(--m-accent);
        color: #000;
        border-color: var(--m-accent);
      }
      .gl-season-pill--active:hover {
        background: var(--m-accent);
        filter: brightness(1.08);
      }

      /* Summary header */
      .gl-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 0 0 10px;
        flex-wrap: wrap;
      }
      .gl-summary__left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .gl-summary__season {
        font-size: 15px;
        font-weight: 800;
        color: var(--m-text);
        letter-spacing: -0.01em;
      }
      .gl-summary__record {
        font-size: 13px;
        font-weight: 600;
        color: var(--m-text-2);
        padding: 3px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--m-accent) 12%, var(--m-surface));
        border: 1px solid color-mix(in srgb, var(--m-accent) 25%, var(--m-border));
      }

      /* Season totals cards */
      .gl-totals {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 0 0 14px;
      }
      .gl-totals__row {
        border: 1px solid var(--m-border);
        border-radius: 10px;
        background: var(--m-surface);
        padding: 12px 14px;
      }
      .gl-totals__label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
        margin-bottom: 8px;
      }
      .gl-totals__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .gl-totals__chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 50px;
        padding: 6px 10px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--m-accent) 6%, var(--m-surface-2));
        border: 1px solid color-mix(in srgb, var(--m-border) 60%, transparent);
      }
      .gl-totals__chip-label {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--m-text-3);
        line-height: 1;
        margin-bottom: 3px;
      }
      .gl-totals__chip-value {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
        font-variant-numeric: tabular-nums;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }

      /* Per-season stat board (career mode) */
      .gl-season-board {
        border: 1px solid var(--m-border);
        border-radius: 12px;
        background: var(--m-surface);
        padding: 14px 16px 10px;
        margin-bottom: 12px;
      }
      .gl-season-board__header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }
      .gl-season-board__title {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        letter-spacing: 0.01em;
      }
      .gl-season-board__record {
        font-size: 12px;
        font-weight: 600;
        color: var(--m-accent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        border-radius: 6px;
        padding: 2px 8px;
      }

      /* Nested totals inside a season board */
      .gl-totals--season {
        padding: 0;
      }
      .gl-totals--season .gl-totals__row {
        border: none;
        background: transparent;
        padding: 4px 0 0;
      }
      .gl-totals--season .gl-totals__label {
        font-size: 10px;
        margin-bottom: 6px;
      }
      .gl-totals--season .gl-totals__chip {
        min-width: 44px;
        padding: 4px 8px;
      }
      .gl-totals--season .gl-totals__chip-value {
        font-size: 14px;
      }

      /* Game log table wrapper */
      .gl-table-wrap {
        position: relative;
        border-radius: 10px;
        border: 1px solid var(--m-border);
        overflow: hidden;
        overflow-x: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--m-surface-2) transparent;
        background: var(--m-surface);
      }

      /* The table */
      .gl-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
        min-width: max-content;
      }

      /* Header */
      .gl-th {
        padding: 10px 14px;
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        background: color-mix(in srgb, var(--m-accent) 5%, var(--m-surface));
        border-bottom: 1px solid var(--m-border);
      }
      .gl-th--sticky {
        position: sticky;
        left: 0;
        z-index: 2;
        text-align: left;
        background: color-mix(in srgb, var(--m-accent) 5%, var(--m-surface));
      }
      .gl-th--stat {
        min-width: 52px;
      }
      .gl-th-btn {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
        transition: color 0.15s ease;
        white-space: nowrap;
      }
      .gl-th-btn:hover {
        color: var(--m-text);
      }
      .gl-th-text {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
      }
      .gl-sort-arrow {
        font-size: 9px;
        color: var(--m-accent);
        line-height: 1;
      }

      /* Game log rows */
      .gl-row {
        transition: background 0.1s ease;
      }
      .gl-row:hover {
        background: color-mix(in srgb, var(--m-accent) 4%, transparent);
      }
      .gl-row--alt {
        background: color-mix(in srgb, var(--m-surface-2) 40%, transparent);
      }
      .gl-row--alt:hover {
        background: color-mix(in srgb, var(--m-accent) 6%, var(--m-surface-2));
      }

      /* Cells */
      .gl-td {
        padding: 10px 14px;
        text-align: center;
        white-space: nowrap;
        vertical-align: middle;
        font-size: 14px;
        font-weight: 600;
        color: var(--m-text);
        font-variant-numeric: tabular-nums;
        border-bottom: 1px solid color-mix(in srgb, var(--m-border) 40%, transparent);
      }
      .gl-td--sticky {
        position: sticky;
        left: 0;
        z-index: 1;
        text-align: left;
        background: var(--m-surface);
        font-weight: 500;
        color: var(--m-text-2);
        font-size: 13px;
      }
      .gl-row--alt .gl-td--sticky {
        background: color-mix(in srgb, var(--m-surface-2) 40%, var(--m-surface));
      }
      .gl-td--date {
        font-variant-numeric: tabular-nums;
      }
      .gl-td--result {
        text-align: left;
        padding-left: 10px;
      }
      .gl-td--opponent {
        text-align: left;
        font-weight: 700;
        color: var(--m-text);
      }
      .gl-td--stat {
        font-weight: 600;
      }

      /* W/L/T coloring */
      .gl-result {
        font-weight: 800;
        font-size: 13px;
        letter-spacing: 0.02em;
        white-space: nowrap;
      }
      .gl-result--win {
        color: #22c55e;
      }
      .gl-result--loss {
        color: #ef4444;
      }
      .gl-result--tie {
        color: var(--m-text-2);
      }

      /* Last row no border */
      .gl-table tbody tr:last-child .gl-td {
        border-bottom: none;
      }

      /* ── Game log responsive ── */
      @media (max-width: 640px) {
        .gl-season-nav {
          padding-bottom: 8px;
        }
        .gl-season-pill {
          padding: 5px 10px;
          font-size: 11px;
        }
        .gl-summary {
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          padding-bottom: 8px;
        }
        .gl-summary__season {
          font-size: 14px;
        }
        .gl-totals__row {
          padding: 10px;
        }
        .gl-totals__chip {
          min-width: 42px;
          padding: 4px 7px;
        }
        .gl-totals__chip-label {
          font-size: 9px;
        }
        .gl-totals__chip-value {
          font-size: 14px;
        }
        .gl-th {
          padding: 8px 10px;
        }
        .gl-th-btn,
        .gl-th-text {
          font-size: 10px;
        }
        .gl-td {
          padding: 8px 10px;
          font-size: 13px;
        }
        .gl-result {
          font-size: 12px;
        }
      }

      /* ─── STAT CARDS (original style for academic/overview) ─── */
      .madden-stat-group {
        margin-bottom: 24px;
      }
      .madden-stat-group-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-2);
        margin: 0 0 12px;
      }
      .madden-stat-group-meta {
        font-size: 13px;
        color: var(--m-text-3, #888);
        margin: -6px 0 14px;
        line-height: 1.4;
      }
      .madden-stat-group-meta time {
        font-weight: 500;
      }
      .madden-stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 160px));
        gap: 10px;
      }
      .madden-stat-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px;
        border-radius: 8px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .madden-stat-value {
        font-size: 20px;
        font-weight: 800;
        color: var(--m-text);
      }
      .madden-stat-label {
        font-size: 12px;
        color: var(--m-text-2);
      }
      .madden-stat-verified {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--m-accent);
        color: #000;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
      }

      /* ─── SCHEDULE BOARD ─── */
      .madden-schedule {
        padding-top: 2px;
      }
      .schedule-board {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .schedule-row {
        width: 100%;
        border: 1px solid var(--m-border);
        border-radius: 12px;
        background: var(--m-surface);
        color: var(--m-text);
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr) 130px;
        align-items: stretch;
        text-align: left;
        overflow: hidden;
        cursor: pointer;
        transition:
          border-color 0.18s ease,
          transform 0.18s ease,
          background 0.18s ease;
      }
      .schedule-row:hover {
        border-color: color-mix(in srgb, var(--m-accent) 20%, var(--m-border));
        background: var(--m-surface-2);
        transform: translateY(-1px);
      }
      .schedule-row:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--m-accent) 50%, transparent);
        outline-offset: 2px;
      }
      .schedule-row--past {
        opacity: 0.88;
      }
      .schedule-row--past .schedule-row__status-label {
        color: var(--m-text-2);
      }

      .schedule-row__date,
      .schedule-row__status {
        background: color-mix(in srgb, var(--m-surface-2) 70%, var(--m-surface));
      }

      .schedule-row__date {
        border-right: 1px solid var(--m-border);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        padding: 8px 6px;
      }
      .schedule-row__month {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--m-text-2);
      }
      .schedule-row__day {
        font-size: 22px;
        line-height: 1;
        font-weight: 800;
        color: var(--m-text);
      }

      .schedule-row__matchup {
        padding: 10px 12px;
        display: flex;
        min-width: 0;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
      }
      .schedule-row__teams {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .schedule-row__team {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
      }
      .schedule-row__team-name {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.01em;
        color: var(--m-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .schedule-row__logo {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        object-fit: cover;
        border: 1px solid var(--m-border);
        background: var(--m-surface);
        flex-shrink: 0;
      }
      .schedule-row__vs {
        flex-shrink: 0;
        font-size: 11px;
        font-weight: 600;
        text-transform: lowercase;
        color: var(--m-text-2);
      }
      .schedule-row__meta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--m-text-2);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .schedule-row__status {
        border-left: 1px solid var(--m-border);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 4px;
      }
      .schedule-row__status-label {
        font-size: 14px;
        line-height: 1.1;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--m-text);
      }
      .schedule-row__status-value {
        font-size: 12px;
        line-height: 1.25;
        color: var(--m-text-2);
      }

      @media (max-width: 1024px) {
        .schedule-row {
          grid-template-columns: 68px minmax(0, 1fr) 120px;
        }
        .schedule-row__team-name {
          font-size: 13px;
        }
        .schedule-row__status-label {
          font-size: 13px;
        }
        .schedule-row__status-value {
          font-size: 12px;
        }
      }

      @media (max-width: 760px) {
        .schedule-row {
          grid-template-columns: 62px minmax(0, 1fr);
          grid-template-areas:
            'date matchup'
            'status status';
        }
        .schedule-row__date {
          grid-area: date;
        }
        .schedule-row__matchup {
          grid-area: matchup;
          padding: 9px 10px;
          gap: 6px;
        }
        .schedule-row__teams {
          gap: 8px;
          flex-wrap: wrap;
        }
        .schedule-row__team-name {
          font-size: 13px;
        }
        .schedule-row__logo {
          width: 22px;
          height: 22px;
        }
        .schedule-row__meta {
          font-size: 12px;
        }
        .schedule-row__status {
          grid-area: status;
          border-left: none;
          border-top: 1px solid var(--m-border);
          background: color-mix(in srgb, var(--m-surface-2) 70%, var(--m-surface));
          padding: 8px 10px;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
        .schedule-row__status-label {
          font-size: 13px;
        }
        .schedule-row__status-value {
          font-size: 12px;
          text-align: right;
        }
      }

      /* ─── CONTACT + SOCIAL SIDE-BY-SIDE ─── */
      .contact-social-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 32px;
        align-items: start;
      }
      .contact-social-col {
        min-width: 0;
      }

      @media (max-width: 720px) {
        .contact-social-row {
          grid-template-columns: 1fr;
          gap: 28px;
        }
      }

      /* ─── CONTACT SECTION TITLE (matches ov-section-title) ─── */
      .contact-section-title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
        margin: 0 0 14px;
        letter-spacing: -0.01em;
        line-height: 1.2;
      }

      /* ─── CONTACT INFO LIST (Email/Phone rows) ─── */
      .contact-info-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .contact-info-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        color: var(--m-text);
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .contact-info-item:hover {
        background: var(--m-surface-2);
        border-color: var(--m-accent);
      }
      .contact-info-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--m-accent) 8%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .contact-info-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .contact-info-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--m-dim);
        line-height: 1;
      }
      .contact-info-value {
        font-size: 14px;
        font-weight: 500;
        color: var(--m-text);
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ─── SOCIAL MEDIA CHIPS ─── */
      .contact-social-chips {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .contact-social-chip {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        text-decoration: none;
        transition: all 0.15s ease;
      }
      .contact-social-chip:hover {
        background: var(--m-surface-2);
        border-color: var(--m-accent);
      }
      .contact-social-chip-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
      }
      .contact-social-chip-handle {
        font-size: 14px;
        font-weight: 500;
        color: var(--m-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ─── COACH CONTACT CARD ─── */
      .coach-card {
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        overflow: hidden;
      }
      .coach-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
      }
      .coach-card-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--m-accent) 10%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .coach-card-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .coach-card-name {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
        line-height: 1.2;
      }
      .coach-card-title {
        font-size: 12px;
        font-weight: 500;
        color: var(--m-dim);
        line-height: 1.2;
      }
      .coach-card-divider {
        height: 1px;
        background: var(--m-border);
      }
      .coach-card .contact-info-list {
        padding: 12px;
        gap: 6px;
      }
      .coach-card .contact-info-item {
        background: transparent;
        border: none;
        padding: 8px 6px;
        border-radius: 8px;
      }
      .coach-card .contact-info-item:hover {
        background: rgba(255, 255, 255, 0.04);
      }

      /* ─── CONTACT LIST ─── */
      .madden-contact-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .madden-contact-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        color: var(--m-text);
        font-size: 15px;
        text-decoration: none;
        transition: all 0.15s;
      }
      .madden-contact-item:hover {
        background: var(--m-surface-2);
        border-color: var(--m-accent);
      }

      /* ═══════════════════════════════════════════════
   OVERVIEW TAB — Madden Player Overview Style
   ═══════════════════════════════════════════════ */
      .madden-overview {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .ov-top-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 260px;
        gap: 20px;
        align-items: center;
      }
      .ov-top-row--single {
        grid-template-columns: minmax(0, 1fr);
      }
      .ov-section--profile {
        min-width: 0;
      }

      .madden-mobile-hero {
        display: none;
      }

      /* Mobile-only XP section (shown only in @media below) */
      .ov-mobile-xp-section {
        display: none;
      }

      /* Section titles (Player Profile, Player Archetypes) */
      .ov-section-title {
        font-size: 16px;
        font-weight: 800;
        color: var(--m-text);
        margin: 0 0 14px;
        letter-spacing: -0.01em;
      }
      .ov-overview-title {
        font-size: 16px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }

      /* Player Profile key-value grid */
      .ov-profile-grid {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .ov-profile-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--m-border);
      }
      .ov-profile-row:last-child {
        border-bottom: none;
      }
      .ov-profile-key {
        font-size: 14px;
        color: var(--m-text-3);
        min-width: 80px;
        font-weight: 500;
      }
      .ov-profile-val {
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
      }
      .ov-profile-val-wrap {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .ov-verified-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--m-accent);
        letter-spacing: 0.01em;
        border: 1px solid color-mix(in srgb, var(--m-accent) 35%, transparent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        border-radius: 999px;
        padding: 2px 8px 2px 6px;
        line-height: 1;
      }
      .ov-verified-link {
        text-decoration: none;
      }
      .ov-verified-link:hover {
        border-color: color-mix(in srgb, var(--m-accent) 55%, transparent);
      }
      .ov-verified-label {
        color: var(--m-text-2);
        font-weight: 600;
      }
      .ov-verified-logo {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--m-accent) 24%, transparent);
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-verified-logo-img {
        width: 12px;
        height: 12px;
        object-fit: contain;
        display: block;
      }

      .ov-last-synced-btn {
        width: 100%;
        margin: 16px 0 0;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--m-accent) 28%, var(--m-border));
        background:
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--m-accent) 11%, transparent),
            color-mix(in srgb, var(--m-surface) 88%, transparent)
          ),
          var(--m-surface);
        color: var(--m-text);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease,
          transform 0.2s ease;
      }
      .ov-last-synced-btn:hover {
        border-color: color-mix(in srgb, var(--m-accent) 44%, var(--m-border));
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
        transform: translateY(-1px);
      }
      .ov-last-synced-btn:focus-visible {
        outline: none;
        border-color: var(--m-accent);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--m-accent) 40%, transparent);
      }
      .ov-last-synced-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .ov-last-synced-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--m-text-3);
      }
      .ov-last-synced-time {
        margin-top: 4px;
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
      }
      .ov-last-synced-agent {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .ov-last-synced-agentx {
        width: 34px;
        height: 34px;
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-last-synced-agent-name {
        font-size: 13px;
        font-weight: 700;
        color: color-mix(in srgb, var(--m-accent) 72%, var(--m-text));
        letter-spacing: 0.02em;
      }

      /* Agent X Trait inline block (no large card container) */
      .ov-trait-inline {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 8px;
        margin: 24px 0;
      }
      .ov-trait-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .ov-trait-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .ov-trait-icon-lg {
        width: 112px;
        height: 112px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      .ov-trait-icon-lg svg {
        width: 100%;
        height: 100%;
      }
      .ov-trait-icon-inner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: var(--m-accent);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ov-trait-icon-shell {
        fill: color-mix(in srgb, var(--m-accent) 15%, transparent);
        stroke: color-mix(in srgb, var(--m-accent) 70%, transparent);
        stroke-width: 2;
      }
      .ov-trait-icon-core {
        fill: color-mix(in srgb, var(--m-accent) 25%, transparent);
        stroke: color-mix(in srgb, var(--m-accent) 80%, transparent);
        stroke-width: 1.5;
      }
      .ov-trait-category {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--m-accent);
        line-height: 1;
      }
      .ov-trait-summary {
        position: relative;
        font-size: 14px;
        font-weight: 600;
        color: var(--m-text);
        margin: 4px 0 0;
        line-height: 1.45;
        max-width: 320px;
        min-height: calc(1.45em * 4);
      }
      .ov-trait-summary__reserve {
        display: block;
        visibility: hidden;
        pointer-events: none;
      }
      .ov-trait-summary__typed {
        position: absolute;
        inset: 0;
        display: block;
      }

      @media (max-width: 980px) {
        .ov-top-row {
          grid-template-columns: 1fr;
          gap: 14px;
        }
      }

      /* Connected Accounts — compact chip grid */
      .ov-connected-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ov-connected-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 7px;
        background: var(--m-card);
        border: 1px solid color-mix(in srgb, var(--m-accent) 18%, var(--m-border));
        border-radius: 999px;
        text-decoration: none;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
        cursor: pointer;
      }
      .ov-connected-chip:hover {
        background: color-mix(in srgb, var(--m-accent) 8%, var(--m-card));
        border-color: color-mix(in srgb, var(--m-accent) 40%, var(--m-border));
        transform: translateY(-1px);
      }
      .ov-connected-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.06);
      }
      .ov-connected-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 12.5px;
        font-weight: 700;
        color: var(--m-text);
        white-space: nowrap;
        letter-spacing: 0.01em;
      }
      .ov-connected-check {
        display: inline-flex;
        align-items: center;
        color: var(--m-accent);
        flex-shrink: 0;
        margin-left: -2px;
      }
      .ov-connected-explainer {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 10px 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11.5px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--m-text-3);
        letter-spacing: 0.01em;
      }
      .ov-connected-explainer nxt1-icon {
        flex-shrink: 0;
        color: var(--m-accent);
        margin-top: 1px;
      }
      .ov-connected-agentx {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--m-accent);
        margin-top: -1px;
      }

      /* Player Archetypes — Big Badge Labels */
      .ov-archetype-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .ov-archetype-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-radius: 50px;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--m-accent) 10%, transparent) 0%,
          color-mix(in srgb, var(--m-accent) 4%, transparent) 100%
        );
        border: 1px solid color-mix(in srgb, var(--m-accent) 18%, transparent);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        transition:
          border-color 0.2s,
          transform 0.15s,
          box-shadow 0.2s;
        cursor: default;
      }
      .ov-archetype-badge:hover {
        border-color: var(--m-accent);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px color-mix(in srgb, var(--m-accent) 12%, transparent);
      }
      .ov-archetype-badge nxt1-icon {
        color: var(--m-accent);
        flex-shrink: 0;
      }
      .ov-archetype-badge-name {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        font-weight: 700;
        color: var(--m-text);
        letter-spacing: 0.06em;
        white-space: nowrap;
        line-height: 1;
      }

      /* Player Bio card — matches Player Profile section visual weight */
      .ov-bio-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .ov-bio-card nxt1-icon {
        color: var(--m-accent);
        flex-shrink: 0;
        margin-top: 2px;
      }
      .ov-bio-card p {
        font-size: 15px;
        font-weight: 500;
        color: var(--m-text-2);
        line-height: 1.6;
        margin: 0;
      }

      .ov-history-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ov-history-item {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }
      .ov-history-year {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--m-text-2);
        line-height: 1.25;
        padding-top: 10px;
      }
      .ov-history-main {
        width: 100%;
        max-width: 520px;
        min-width: 0;
        justify-self: stretch;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .ov-history-logo-wrap {
        width: 44px;
        height: 44px;
      }
      .ov-history-logo-fallback {
        color: var(--m-text-3);
      }
      .ov-history-content {
        min-width: 0;
        flex: 1;
      }
      .ov-history-team {
        line-height: 1.2;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }
      .ov-history-meta {
        margin-top: 0;
      }
      .ov-history-record {
        margin-left: auto;
        flex-shrink: 0;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--m-accent) 35%, transparent);
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        color: var(--m-accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        line-height: 1;
      }

      /* ─── AWARDS SECTION (uses shared NxtTimelineComponent) ─── */

      /* Badges Row (Madden bottom badges) */
      .ov-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ov-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .ov-badge--verified {
        background: color-mix(in srgb, var(--m-accent) 10%, transparent);
        color: var(--m-accent);
        border: 1px solid color-mix(in srgb, var(--m-accent) 20%, transparent);
      }
      .ov-badge--stars {
        background: rgba(255, 193, 7, 0.1);
        color: #ffc107;
        border: 1px solid rgba(255, 193, 7, 0.2);
      }
      .ov-badge--offers {
        background: rgba(233, 30, 99, 0.1);
        color: #e91e63;
        border: 1px solid rgba(233, 30, 99, 0.2);
      }

      /* ─── RESPONSIVE ─── */
      @media (max-width: 1024px) {
        .madden-side-tabs {
          width: 180px;
        }
        .madden-side-tab {
          font-size: 12px;
          padding: 12px 12px;
        }
        .madden-split-left {
          max-width: calc(100% - 280px);
        }
        .madden-split-right {
          width: 280px;
        }
        .madden-right-stack {
          width: 240px;
        }
        .madden-side-nav-column {
          width: 160px;
        }
        .sport-switcher__sport-name {
          font-size: 11px;
        }
      }
      @media (max-width: 768px) {
        .madden-top-tabs ::ng-deep .option-scroller--scrollable.option-scroller--md {
          --scroller-padding: 8px;
        }
        .ov-top-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
          align-items: start;
        }
        .madden-mobile-hero {
          display: grid;
          grid-template-columns: 148px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          margin: 32px 12px 10px;
        }
        .madden-mobile-hero__carousel {
          width: 148px;
        }
        .madden-mobile-hero__carousel .carousel-glow-wrap {
          width: 148px;
          max-width: none;
          height: 228px;
          border-radius: 14px;
        }
        .madden-mobile-hero__carousel .madden-player-carousel,
        .madden-mobile-hero__carousel .madden-player-carousel ::ng-deep .carousel,
        .madden-mobile-hero__carousel .madden-player-carousel ::ng-deep .carousel::before {
          border-radius: 14px;
        }
        .madden-mobile-hero__identity {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
          padding-top: 2px;
        }
        .madden-mobile-hero__name {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -0.01em;
          color: var(--m-text);
        }
        .madden-mobile-hero__meta {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.35;
          color: var(--m-text-2);
        }
        .madden-mobile-hero__follow-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 6px;
          align-self: flex-start;
          border: 1.5px solid var(--nxt1-color-primary);
          background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
          color: var(--nxt1-color-primary);
          border-radius: var(--nxt1-radius-md, 8px);
          font-family: var(--nxt1-fontFamily-brand);
          font-size: 13px;
          font-weight: var(--nxt1-fontWeight-semibold);
          letter-spacing: 0.01em;
          line-height: 1;
          padding: 7px 16px;
          cursor: pointer;
        }
        .madden-mobile-hero__follow-btn:active {
          transform: scale(0.97);
        }
        .madden-mobile-hero__stats {
          display: flex;
          flex-direction: column;
          margin-top: 8px;
        }
        .mobile-hero-stat {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px solid var(--m-border);
        }
        .mobile-hero-stat:last-child {
          border-bottom: none;
        }
        .mobile-hero-stat__key {
          font-size: 13px;
          color: var(--m-text-3);
          min-width: 50px;
          font-weight: 500;
        }
        .mobile-hero-stat__val {
          font-size: 14px;
          font-weight: 700;
          color: var(--m-text);
        }
        .mobile-hero-stat__val-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .ov-mobile-teams {
          display: block;
          margin-bottom: 12px;
        }
        .ov-mobile-teams .madden-team-block {
          padding: 10px 12px;
          border-radius: 10px;
          gap: 10px;
        }
        .ov-mobile-teams .madden-team-logo,
        .ov-mobile-teams .madden-team-logo-placeholder {
          width: 36px;
          height: 36px;
          border-radius: 8px;
        }
        .ov-mobile-teams .madden-team-name {
          font-size: 13px;
        }
        .ov-mobile-teams .madden-team-location {
          font-size: 11px;
        }
        .ov-section--player-stats {
          display: none;
        }
        .ov-archetype-badges {
          gap: 8px;
        }
        .ov-archetype-badge {
          padding: 7px 14px;
          gap: 6px;
          border-radius: 999px;
        }
        .ov-archetype-badge nxt1-icon {
          width: 14px;
          height: 14px;
        }
        .ov-archetype-badge-name {
          font-size: 12.5px;
        }

        .madden-mobile-hero__xp-area {
          display: none;
        }
        .ov-mobile-xp-section {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 28px 0 14px;
          width: 100%;
        }
        .ov-mobile-xp-section--centered {
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .ov-mobile-xp-section--centered .ov-mobile-xp-badge-grid {
          flex: none;
          justify-content: center;
        }
        .ov-mobile-xp-ring {
          position: relative;
          width: clamp(92px, 28vw, 112px);
          height: clamp(92px, 28vw, 112px);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ov-mobile-xp-glow {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            var(--m-accent-glow, rgba(206, 255, 0, 0.2)) 0%,
            transparent 65%
          );
          opacity: 0.5;
          pointer-events: none;
          animation: mobile-xp-pulse 3s ease-in-out infinite;
        }
        .ov-mobile-xp-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .ov-mobile-xp-arc {
          transition: stroke-dasharray 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          filter: drop-shadow(0 0 4px var(--m-accent, #ceff00));
        }
        .ov-mobile-xp-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 2px;
        }
        .ov-mobile-xp-lvl {
          font-family: var(--nxt1-fontFamily-brand, sans-serif);
          font-size: clamp(20px, 5.5vw, 24px);
          font-weight: 800;
          line-height: 1;
          color: var(--m-text);
          letter-spacing: -0.02em;
        }
        .ov-mobile-xp-tier {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--m-accent, #ceff00);
          margin-top: 2px;
        }
        /* — Badge orb grid — */
        .ov-mobile-xp-badge-grid {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: flex-start;
          flex-wrap: wrap;
          flex: 1;
          min-width: 0;
          align-content: center;
        }
        .ov-mobile-xp-badge-orb {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid transparent;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }
        .ov-mobile-xp-badge-orb:active {
          transform: scale(0.92);
        }
        .ov-mobile-xp-badge-orb--common {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
          color: var(--m-text-2);
        }
        .ov-mobile-xp-badge-orb--uncommon {
          background: rgba(206, 255, 0, 0.06);
          border-color: rgba(206, 255, 0, 0.15);
          color: var(--m-accent, #ceff00);
        }
        .ov-mobile-xp-badge-orb--rare {
          background: rgba(59, 130, 246, 0.08);
          border-color: #3b82f6;
          color: #3b82f6;
          box-shadow: 0 0 6px rgba(59, 130, 246, 0.15);
        }
        .ov-mobile-xp-badge-orb--epic {
          background: rgba(168, 85, 247, 0.08);
          border-color: rgba(168, 85, 247, 0.55);
          color: #a855f7;
          box-shadow: 0 0 8px rgba(168, 85, 247, 0.2);
        }
        .ov-mobile-xp-badge-orb--legendary {
          background: rgba(255, 215, 0, 0.06);
          border-color: rgba(255, 215, 0, 0.5);
          color: #ffd700;
          box-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
          animation: mobile-badge-shimmer 3s ease-in-out infinite;
        }
        .ov-mobile-xp-badge-more {
          font-size: 13px;
          font-weight: 700;
          color: var(--m-text-2);
          padding-left: 2px;
          white-space: nowrap;
        }
        .ov-profile-row {
          gap: 6px;
          padding: 8px 0;
          align-items: center;
        }
        .ov-profile-key {
          min-width: 50px;
          font-size: 13px;
        }
        .ov-profile-val {
          font-size: 14px;
          white-space: nowrap;
        }
        .ov-profile-val-wrap {
          gap: 8px;
          flex-wrap: nowrap;
        }
        .ov-verified-badge {
          gap: 5px;
          padding: 1px 5px 1px 4px;
          margin-left: 2px;
          white-space: nowrap;
        }
        .ov-verified-badge::before {
          content: '✓';
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
          color: var(--m-accent);
        }
        .ov-verified-label {
          display: none;
        }
        .ov-verified-logo {
          width: 14px;
          height: 14px;
        }
        .ov-verified-logo-img {
          width: 10px;
          height: 10px;
        }
        .ov-trait-inline {
          order: 3;
          grid-row: 2;
          grid-column: 1 / -1;
          align-self: start;
          margin-top: 8px;
          flex-direction: row-reverse;
          align-items: center;
          text-align: left;
          gap: 14px;
        }
        .ov-trait-text {
          align-items: flex-start;
          flex: 1;
        }
        .ov-trait-icon-lg {
          width: 88px;
          height: 88px;
        }
        .ov-trait-summary {
          max-width: none;
        }
        :host {
          height: auto;
          overflow: visible;
        }
        /* Mobile-only background optimization: lighter, sleeker halftone treatment */
        .stage-halftone-dots {
          background-image: radial-gradient(
            circle,
            color-mix(in srgb, var(--m-accent) 34%, transparent) 1.05px,
            transparent 0.9px
          );
          background-size: 14px 14px;
          mask-image: radial-gradient(
            ellipse 122% 78% at 50% 10%,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.68) 30%,
            rgba(0, 0, 0, 0.36) 56%,
            transparent 80%
          );
          -webkit-mask-image: radial-gradient(
            ellipse 122% 78% at 50% 10%,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.68) 30%,
            rgba(0, 0, 0, 0.36) 56%,
            transparent 80%
          );
          opacity: 0.95;
        }
        .stage-halftone-fade {
          background: radial-gradient(
            ellipse 86% 72% at 50% 8%,
            color-mix(in srgb, var(--m-accent) 26%, transparent) 0%,
            color-mix(in srgb, var(--m-accent) 13%, transparent) 42%,
            transparent 78%
          );
          opacity: 0.98;
        }
        .profile-main {
          height: auto;
          overflow: visible;
          display: block;
        }
        .madden-stage {
          height: auto;
          min-height: 0;
          overflow: visible;
          flex-shrink: 1;
        }
        /* Pin halftone background to viewport height so it never shifts between tabs */
        .stage-halftone-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          z-index: 0;
        }
        .madden-split {
          height: auto;
          align-items: flex-start;
        }
        .madden-split-left {
          flex: 1;
          min-width: 0;
          max-width: calc(100% - 132px);
          overflow: visible;
        }
        .madden-side-tabs {
          display: none;
        }
        .madden-content-layer {
          padding: 12px 0 0;
          flex-direction: column;
          gap: 0;
          min-height: auto;
          overflow: visible;
        }
        .madden-side-nav-column {
          display: contents;
        }
        .madden-side-nav-column > nxt1-section-nav-web {
          order: 0;
          width: calc(100% - 24px);
          margin-inline: 12px;
        }
        .madden-content-scroll {
          order: 1;
          max-width: 100%;
          max-height: none;
          overflow-y: visible;
          overflow-x: visible;
          padding: 0 12px 24px;
          align-items: stretch;
          scrollbar-gutter: auto;
        }
        .madden-content-scroll > * {
          max-width: none;
        }
        .madden-split-left {
          max-width: 100%;
        }
        .madden-split-right {
          display: none;
        }
        .madden-side-nav-column {
          order: 0;
          width: 100%;
          position: static;
          max-height: none;
          flex-direction: column;
          gap: var(--nxt1-spacing-3);
          margin-top: 0;
          margin-bottom: 0;
          padding-bottom: 0;
        }
        /* Section nav pills — match profile dark theme on mobile */
        .madden-side-nav-column ::ng-deep .section-nav {
          gap: 4px;
          padding-inline: 2px;
          padding-bottom: 10px;
          border-bottom: none;
          box-sizing: border-box;
        }
        .madden-side-nav-column ::ng-deep .nav-item {
          width: auto;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 600;
          font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
          letter-spacing: 0.02em;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          color: var(--m-text-2, rgba(255, 255, 255, 0.55));
        }
        .madden-side-nav-column ::ng-deep .nav-item--active {
          background: color-mix(in srgb, var(--m-accent) 12%, transparent);
          border-color: color-mix(in srgb, var(--m-accent) 35%, transparent);
          color: var(--m-text, #fff);
        }
        .madden-side-nav-column ::ng-deep .nav-group-header {
          display: none;
        }
        /* Sport switcher: horizontal scroll on mobile */
        .sport-switcher {
          order: 2;
          position: static;
          bottom: auto;
          left: auto;
          width: calc(100% - 24px);
          margin-inline: 12px;
          margin-top: var(--nxt1-spacing-5);
          margin-bottom: var(--nxt1-spacing-4);
          border-top: none;
          padding-top: 0;
          border-bottom: none;
          padding-bottom: var(--nxt1-spacing-3);
        }
        .sport-switcher__list {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .sport-switcher__list::-webkit-scrollbar {
          display: none;
        }
        .sport-switcher__sport-name {
          font-size: 11px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileShellWebComponent implements OnInit, OnDestroy {
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileShellWeb');
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private typewriterTarget = '';
  private isTypewriterRunning = false;
  private readonly _hasPlayedTypewriter = signal(false);
  private readonly typedAgentXSummary = signal('');

  // ============================================
  // INPUTS
  // ============================================

  /** Current logged-in user info for header avatar */
  readonly currentUser = input<ProfileShellUser | null>(null);

  /** Profile unicode to load (unique identifier for profiles) */
  readonly profileUnicode = input<string>('');

  /** Whether viewing own profile */
  readonly isOwnProfile = input(false);

  /** Hide mobile header (when sidebar provides navigation on desktop) */
  readonly hideHeader = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly avatarClick = output<void>();
  readonly backClick = output<void>();
  readonly tabChange = output<ProfileTabId>();
  readonly editProfileClick = output<void>();
  readonly editTeamClick = output<void>();
  readonly shareClick = output<void>();
  readonly followClick = output<void>();
  readonly menuClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly aiSummaryClick = output<void>();
  readonly createPostClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Profile page header title — shows the athlete's name */
  protected readonly desktopTitle = computed(() => {
    const u = this.profile.user();
    if (u?.displayName) return u.displayName;
    const first = u?.firstName ?? '';
    const last = u?.lastName ?? '';
    return (first + ' ' + last).trim() || 'Profile';
  });

  /** Profile page header subtitle — position + school */
  protected readonly desktopSubtitle = computed(() => {
    const u = this.profile.user();
    const parts: string[] = [];
    if (u?.primarySport?.position) parts.push(u.primarySport.position);
    if (u?.school?.name) parts.push(u.school.name);
    if (u?.classYear) parts.push(`Class of ${u.classYear}`);
    return parts.join(' · ') || '';
  });

  /** Mobile hero title — athlete display name. */
  protected readonly mobileDisplayName = computed(() => {
    const u = this.profile.user();
    if (u?.displayName?.trim()) return u.displayName.trim();
    const combined = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
    return combined || 'Profile';
  });

  /** Mobile subtitle — position and jersey number. */
  protected readonly mobileSubtitleLine = computed(() => {
    const position = this.profile.user()?.primarySport?.position?.trim();
    const jersey = this.profile.user()?.primarySport?.jerseyNumber?.trim();
    if (position && jersey) return `${position} #${jersey}`;
    if (position) return position;
    if (jersey) return `#${jersey}`;
    return '';
  });

  private readUserNumericField(fieldName: string): number | null {
    const raw = (this.profile.user() as unknown as Record<string, unknown> | null)?.[fieldName];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw.replace(/,/g, '').trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  /** Mobile XP value with fallback to overall grade x100 when explicit XP is missing. */
  protected readonly mobileXpValue = computed(() => {
    const xpFromUser =
      this.readUserNumericField('xp') ??
      this.readUserNumericField('xpPoints') ??
      this.readUserNumericField('totalXp') ??
      this.readUserNumericField('xpTotal') ??
      this.readUserNumericField('xpRating');

    if (xpFromUser !== null && xpFromUser >= 0) return Math.round(xpFromUser);

    const overall = this.profile.playerCard()?.prospectGrade?.overall;
    if (typeof overall === 'number' && Number.isFinite(overall) && overall > 0) {
      return Math.round(overall * 100);
    }

    return 8_000;
  });

  private readonly mobileCurrentXpLevel = computed(() => {
    const xp = this.mobileXpValue();
    return XP_LEVELS.find((level) => xp >= level.min && xp <= level.max) ?? XP_LEVELS[0];
  });

  protected readonly mobileXpLevel = computed(() => this.mobileCurrentXpLevel().level);

  protected readonly mobileXpTier = computed(() => this.mobileCurrentXpLevel().name);

  protected readonly mobileXpBadgeLeft = computed<{
    readonly name: string;
    readonly icon: IconName;
  } | null>(() => {
    const archetype = this.profile.playerCard()?.archetypes?.[0];
    if (!archetype?.name) return null;
    return {
      name: archetype.name,
      icon: this.archetypeIconName(archetype.name, archetype.icon),
    };
  });

  protected readonly mobileXpBadgeRight = computed<{
    readonly name: string;
    readonly icon: IconName;
  } | null>(() => {
    const archetype = this.profile.playerCard()?.archetypes?.[1];
    if (!archetype?.name) return null;
    return {
      name: archetype.name,
      icon: this.archetypeIconName(archetype.name, archetype.icon),
    };
  });

  /** Formatted compact XP for mobile hero chip. */
  protected readonly mobileFormattedXp = computed(() => {
    const xp = this.mobileXpValue();
    if (xp >= 100_000) return `${Math.round(xp / 1_000)}K`;
    if (xp >= 10_000) return `${(xp / 1_000).toFixed(1)}K`;
    return xp.toLocaleString();
  });

  /** SVG arc measurements for mobile XP ring. */
  protected readonly mobileArcLength = MOBILE_ARC_LENGTH;
  protected readonly mobileArcGap = MOBILE_ARC_CIRCUMFERENCE - MOBILE_ARC_LENGTH;

  /** SVG stroke-dasharray for mobile XP progress arc. */
  protected readonly mobileXpArcDash = computed(() => {
    const xp = this.mobileXpValue();
    const lvl = this.mobileCurrentXpLevel();
    const range = lvl.max === Infinity ? 25_000 : lvl.max - lvl.min;
    const progress = Math.min(1, (xp - lvl.min) / range);
    const filled = MOBILE_ARC_LENGTH * progress;
    const remaining = MOBILE_ARC_CIRCUMFERENCE - filled;
    return `${filled} ${remaining}`;
  });

  /** Number of badges earned (matches page header logic). */
  protected readonly mobileBadgesEarned = computed(() => {
    const numericBadges =
      this.readUserNumericField('badgesEarned') ??
      this.readUserNumericField('badgeCount') ??
      this.readUserNumericField('badgesCount');
    if (numericBadges !== null && numericBadges >= 0) return Math.round(numericBadges);

    const badges = (this.profile.user() as unknown as Record<string, unknown> | null)?.['badges'];
    if (Array.isArray(badges)) return badges.length;

    const overall = this.profile.playerCard()?.prospectGrade?.overall;
    const ovrRating =
      typeof overall === 'number' && Number.isFinite(overall) && overall > 0 ? overall : 80;
    return Math.max(1, Math.round(ovrRating / 6));
  });

  /** Up to 10 desktop-style badges for the mobile hero grid. */
  protected readonly mobileDisplayBadges = computed((): ReadonlyArray<MobileHeaderBadge> => {
    const userBadges = (this.profile.user() as unknown as Record<string, unknown> | null)?.[
      'earnedBadges'
    ];
    if (Array.isArray(userBadges) && userBadges.length > 0) {
      const VALID_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      return userBadges.slice(0, 10).map((b: Record<string, unknown>) => ({
        id: String(b['id'] ?? ''),
        name: String(b['name'] ?? 'Badge'),
        icon: String(b['icon'] ?? 'star'),
        rarity: (VALID_RARITIES.includes(String(b['rarity'] ?? ''))
          ? String(b['rarity'])
          : 'common') as MobileHeaderBadge['rarity'],
      }));
    }
    const count = Math.min(this.mobileBadgesEarned(), 10);
    return MOBILE_PLACEHOLDER_BADGES.slice(0, count);
  });

  /** How many more badges beyond the displayed 10. */
  protected readonly mobileRemainingBadgeCount = computed(() => {
    const total = this.mobileBadgesEarned();
    const shown = this.mobileDisplayBadges().length;
    return Math.max(0, total - shown);
  });

  /** Carousel hover overlay subtitle — position, sport, school, class */
  protected readonly carouselOverlaySubtitle = computed(() => {
    const u = this.profile.user();
    if (!u) return '';
    const parts: string[] = [];
    if (u.primarySport?.position) parts.push(u.primarySport.position);
    if (u.primarySport?.name) parts.push(u.primarySport.name);
    if (u.school?.name) parts.push(u.school.name);
    if (u.classYear) parts.push(`'${u.classYear.slice(-2)}`);
    return parts.join(' · ');
  });

  /** Carousel per-image titles (first image = profile photo, rest = gallery shots) */
  protected readonly carouselOverlayTitles = computed<readonly string[]>(() => {
    const images = this.profile.profileImages();
    const base = this.desktopTitle();
    const titles: string[] = [];

    for (let index = 0; index < images.length; index += 1) {
      if (index === 0) {
        titles.push(base);
      } else {
        titles.push(`${base} · Gallery ${index}`);
      }
    }

    return titles;
  });

  /** Carousel per-image subtitles (add image position for each slide) */
  protected readonly carouselOverlaySubtitles = computed<readonly string[]>(() => {
    const images = this.profile.profileImages();
    const baseSubtitle = this.carouselOverlaySubtitle();
    const total = images.length;

    return images.map((_, index) => {
      const position = `Photo ${index + 1} of ${total}`;
      return baseSubtitle ? `${baseSubtitle} · ${position}` : position;
    });
  });

  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const badges = this.profile.tabBadges();

    return PROFILE_TABS.filter((tab) => tab.id !== 'contact' && tab.id !== 'academic').map(
      (tab: ProfileTab) => ({
        id: tab.id,
        label: tab.label,
        badge: badges[tab.id as keyof typeof badges] || undefined,
      })
    );
  });

  protected readonly emptyState = computed(() => {
    const tab = this.profile.activeTab();
    return PROFILE_EMPTY_STATES[tab] || PROFILE_EMPTY_STATES['timeline'];
  });

  protected readonly displayAgentXSummary = computed(() => {
    const summary = this.profile.playerCard()?.agentXSummary?.trim() ?? '';
    if (!summary) return '';

    if (!this.isBrowser || this._hasPlayedTypewriter()) {
      return summary;
    }

    return this.typedAgentXSummary();
  });

  private readonly agentXSummaryTypewriterEffectRef: EffectRef = effect(
    () => {
      const summary = this.profile.playerCard()?.agentXSummary?.trim() ?? '';

      if (!summary) {
        this.clearTypewriterTimer();
        this.typewriterTarget = '';
        this.isTypewriterRunning = false;
        this.typedAgentXSummary.set('');
        return;
      }

      if (!this.isBrowser) {
        this.typedAgentXSummary.set(summary);
        return;
      }

      if (this._hasPlayedTypewriter()) {
        this.typedAgentXSummary.set(summary);
        return;
      }

      if (this.isTypewriterRunning && this.typewriterTarget === summary) {
        return;
      }

      this.startTypewriter(summary);
    },
    { allowSignalWrites: true }
  );

  /** Section nav items — contextual to active top tab */
  protected readonly sideTabItems = computed((): SectionNavItem[] => {
    const tab = this.profile.activeTab();
    const sections: Record<string, SectionNavItem[]> = {
      overview: [
        { id: 'player-profile', label: 'Player Profile' },
        { id: 'player-bio', label: 'Player Bio' },
        { id: 'player-history', label: 'Player History' },
        { id: 'awards', label: 'Awards', badge: this.profile.awards().length || undefined },
        { id: 'academic', label: 'Academic' },
        { id: 'contact', label: 'Contact' },
      ],
      timeline: [
        {
          id: 'pinned',
          label: 'Pinned',
          badge: this.profile.pinnedPosts().length || undefined,
        },
        {
          id: 'all-posts',
          label: 'All Posts',
          badge: this.profile.allPosts().length || undefined,
        },
        {
          id: 'media',
          label: 'Media',
          badge:
            this.profile
              .allPosts()
              .filter(
                (post) =>
                  post.type === 'image' ||
                  post.type === 'video' ||
                  post.type === 'highlight' ||
                  !!post.thumbnailUrl ||
                  !!post.mediaUrl
              ).length || undefined,
        },
      ],
      videos: [
        {
          id: 'highlights',
          label: 'Highlights',
          badge: this.profile.videoPosts().length || undefined,
        },
        {
          id: 'game-film',
          label: 'Game Film',
          badge: this.profile.videoPosts().length || undefined,
        },
        {
          id: 'training',
          label: 'Training',
          badge: this.profile.videoPosts().length || undefined,
        },
      ],
      offers: [
        { id: 'timeline', label: 'Timeline' },
        {
          id: 'committed',
          label: 'Commitment',
          badge: this.profile.committedOffers().length || undefined,
        },
        {
          id: 'all-offers',
          label: 'Offers',
          badge: this.profile.activeOffers().length || undefined,
        },
        {
          id: 'interests',
          label: 'Interests',
          badge: this.profile.interestOffers().length || undefined,
        },
        {
          id: 'rankings',
          label: 'Rankings',
          badge: this.profile.rankings().length || undefined,
        },
        {
          id: 'scouting',
          label: 'Scouting',
          badge: MOCK_SCOUT_REPORTS.length || undefined,
        },
      ],
      metrics: [
        { id: 'combine', label: 'Combine Results' },
        { id: 'measurables', label: 'Measurables' },
      ],
      stats: [
        ...(this.hasSchoolGameLogs()
          ? [
              { id: 'school-career', label: 'School Career', group: 'School' },
              ...this.schoolSeasons().map((s) => ({
                id: `school-season-${s}`,
                label: `School ${s}`,
                group: 'School',
              })),
            ]
          : []),
        ...(this.hasClubGameLogs()
          ? [
              { id: 'club-career', label: 'Club Career', group: 'Club' },
              ...this.clubSeasons().map((s) => ({
                id: `club-season-${s}`,
                label: `Club ${s}`,
                group: 'Club',
              })),
            ]
          : []),
      ],
      schedule: [...this.scheduleSeasons().map((s) => ({ id: `season-${s}`, label: s }))],
      news: [
        { id: 'all-news', label: 'All News', badge: MOCK_NEWS_ARTICLES.length || undefined },
        {
          id: 'announcements',
          label: 'Announcements',
          badge:
            MOCK_NEWS_ARTICLES.filter(
              (article) => article.source.type === 'editorial' || article.source.type === 'ai-agent'
            ).length || undefined,
        },
        {
          id: 'media-mentions',
          label: 'Media Mentions',
          badge:
            MOCK_NEWS_ARTICLES.filter((article) => article.source.type === 'syndicated').length ||
            undefined,
        },
      ],
      events: [
        { id: 'timeline', label: 'Timeline' },
        {
          id: 'visits',
          label: 'Visits',
          badge: this.profile.visitEvents().length || undefined,
        },
        {
          id: 'camps',
          label: 'Camps',
          badge: this.profile.campEvents().length || undefined,
        },
        {
          id: 'events',
          label: 'Events',
          badge: this.profile.generalEvents().length || undefined,
        },
      ],
      contact: [
        { id: 'info', label: 'Contact Info' },
        { id: 'social', label: 'Social Media' },
      ],
    };
    return sections[tab] ?? sections['timeline'];
  });

  /** Active side tab (first item by default) */
  private readonly _activeSideTab = signal<string>('');
  protected readonly activeSideTab = computed(() => {
    const current = this._activeSideTab();
    const items = this.sideTabItems();
    if (current && items.some((i) => i.id === current)) return current;
    return items[0]?.id ?? '';
  });

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSideTab.set(event.id);

    // Parse school/club prefixed stats tab IDs
    // Format: school-career, school-season-2025-2026, club-career, club-season-2025
    const schoolCareer = event.id === 'school-career';
    const clubCareer = event.id === 'club-career';
    const schoolSeasonMatch = event.id.match(/^school-season-(.+)$/);
    const clubSeasonMatch = event.id.match(/^club-season-(.+)$/);

    if (schoolCareer) {
      this._activeTeamType.set('school');
      this.onCareerModeActivate();
    } else if (clubCareer) {
      this._activeTeamType.set('club');
      this.onCareerModeActivate();
    } else if (schoolSeasonMatch) {
      this._activeTeamType.set('school');
      const seasonLabel = schoolSeasonMatch[1];
      const idx = this.gameLogSeasons().indexOf(seasonLabel);
      if (idx >= 0) {
        this.onGameLogSeasonChange(idx);
      }
    } else if (clubSeasonMatch) {
      this._activeTeamType.set('club');
      const seasonLabel = clubSeasonMatch[1];
      const idx = this.gameLogSeasons().indexOf(seasonLabel);
      if (idx >= 0) {
        this.onGameLogSeasonChange(idx);
      }
    }
  }

  /** Map sidebar tab ID → ProfileTimelineFilterId for the timeline component */
  protected readonly timelineFilter = computed<ProfileTimelineFilterId>(() => {
    const sideTab = this.activeSideTab();
    const map: Record<string, ProfileTimelineFilterId> = {
      pinned: 'pinned',
      'all-posts': 'all',
      media: 'media',
    };
    return map[sideTab] ?? 'all';
  });

  /** Handle sport profile switching */
  protected onSportSwitch(index: number): void {
    this.profile.setActiveSportIndex(index);
    this.logger.debug('Sport profile switched', { index, sport: this.profile.activeSport()?.name });
  }

  // Active metric category resolved from side-nav filters (combine/measurables)
  protected readonly activeMetricCategory = computed(() => {
    const cats = this.profile.metrics();
    if (cats.length === 0) return null;

    const sideTab = this.activeSideTab();
    const targetCategoryBySideTab: Readonly<Record<string, string>> = {
      combine: 'combine results',
      measurables: 'measurables',
    };
    const targetCategory = targetCategoryBySideTab[sideTab];

    if (!targetCategory) {
      return cats[0] ?? null;
    }

    const matched = cats.find((category) => category.name.trim().toLowerCase() === targetCategory);
    return matched ?? cats[0] ?? null;
  });

  /**
   * Map sport icon key to a valid IconName.
   * Falls back to 'football' for unrecognized icon keys.
   */
  private static readonly SPORT_ICON_MAP: Readonly<Record<string, IconName>> = {
    'american-football': 'football',
    football: 'football',
    basketball: 'basketball',
    soccer: 'soccer',
    baseball: 'baseball',
    track: 'bolt',
    tennis: 'tennis',
    volleyball: 'football',
    lacrosse: 'football',
    swimming: 'swimming',
    golf: 'golf',
    hockey: 'football',
    wrestling: 'barbell',
    softball: 'baseball',
  };

  protected getSportIcon(iconKey: string): IconName {
    return ProfileShellWebComponent.SPORT_ICON_MAP[iconKey] ?? 'football';
  }

  // Active stat category index for stats tab pill switcher
  private readonly _activeStatCategoryIdx = signal(0);
  protected readonly activeStatCategoryIdx = computed(() => this._activeStatCategoryIdx());
  protected readonly activeStatCategory = computed(() => {
    const cats = this.profile.athleticStats();
    const idx = this._activeStatCategoryIdx();
    return cats[idx] ?? cats[0] ?? null;
  });

  protected readonly statsComparisonItems = computed<readonly StatsComparisonItem[]>(() => {
    const category = this.activeStatCategory();
    if (!category?.stats?.length) return [];

    const comparisonSource = category.stats.slice(0, 4);
    const parsedValues = comparisonSource.map((stat) => this.parseNumericStatValue(stat.value));
    const maxValue = Math.max(...parsedValues.filter((value) => value > 0), 1);

    return comparisonSource.map((stat, index) => {
      const playerNumeric = Math.max(0, this.parseNumericStatValue(stat.value));
      const averageNumeric = Math.max(
        0,
        this.resolveComparisonAverage(stat, playerNumeric, maxValue, index, comparisonSource.length)
      );

      return {
        label: stat.label,
        playerDisplay: `${stat.value}${stat.unit ?? ''}`,
        averageDisplay: this.formatComparisonAverage(stat, averageNumeric),
        playerPercent: this.toBarPercent(playerNumeric, maxValue),
        averagePercent: this.toBarPercent(averageNumeric, maxValue),
      };
    });
  });

  protected onStatCategoryChange(idx: number): void {
    this._activeStatCategoryIdx.set(idx);
  }

  // ============================================
  // GAME LOG SIGNALS & METHODS (MaxPreps-style)
  // ============================================

  /** Whether we are in career mode (show all seasons combined) */
  private readonly _isCareerMode = signal(true);
  protected readonly isCareerMode = computed(() => this._isCareerMode());

  /** Active team type filter — 'school' or 'club' */
  private readonly _activeTeamType = signal<'school' | 'club'>('school');
  protected readonly activeTeamType = computed(() => this._activeTeamType());

  /** Index of the currently selected season (ignored when career mode is on) */
  private readonly _activeGameLogSeasonIdx = signal(0);
  protected readonly activeGameLogSeasonIdx = computed(() => this._activeGameLogSeasonIdx());

  /** Index of the currently selected stat category within a season */
  private readonly _activeGameLogCategoryIdx = signal(0);
  protected readonly activeGameLogCategoryIdx = computed(() => this._activeGameLogCategoryIdx());

  /** Sort state */
  private readonly _gameLogSortKey = signal<string>('date');
  private readonly _gameLogSortDir = signal<'asc' | 'desc'>('asc');
  protected readonly gameLogSortKey = computed(() => this._gameLogSortKey());
  protected readonly gameLogSortDir = computed(() => this._gameLogSortDir());

  /** Whether this athlete has any school game log data */
  protected readonly hasSchoolGameLogs = computed(() =>
    this.profile.gameLog().some((l) => (l.teamType ?? 'school') === 'school')
  );

  /** Whether this athlete has any club game log data */
  protected readonly hasClubGameLogs = computed(() =>
    this.profile.gameLog().some((l) => l.teamType === 'club')
  );

  /** Game logs filtered to the active team type */
  private readonly filteredGameLogs = computed(() => {
    const teamType = this._activeTeamType();
    return this.profile.gameLog().filter((l) => (l.teamType ?? 'school') === teamType);
  });

  /** Extract unique season labels from game log entries (preserves insertion order) */
  private getUniqueSeasons(logs: readonly ProfileSeasonGameLog[]): readonly string[] {
    const seen = new Set<string>();
    const seasons: string[] = [];
    for (const log of logs) {
      if (!seen.has(log.season)) {
        seen.add(log.season);
        seasons.push(log.season);
      }
    }
    return seasons;
  }

  /** Unique season labels for the active team type */
  protected readonly gameLogSeasons = computed<readonly string[]>(() => {
    return this.getUniqueSeasons(this.filteredGameLogs());
  });

  /** Unique season labels for school team type (used in side tab generation) */
  private readonly schoolSeasons = computed<readonly string[]>(() => {
    const logs = this.profile.gameLog().filter((l) => (l.teamType ?? 'school') === 'school');
    return this.getUniqueSeasons(logs);
  });

  /** Unique season labels for club team type (used in side tab generation) */
  private readonly clubSeasons = computed<readonly string[]>(() => {
    const logs = this.profile.gameLog().filter((l) => l.teamType === 'club');
    return this.getUniqueSeasons(logs);
  });

  /** Categories available for the active view (all unique categories in career mode, or per-season) */
  protected readonly gameLogCategoriesForSeason = computed<readonly string[]>(() => {
    const logs = this.filteredGameLogs();

    if (this._isCareerMode()) {
      // Career mode: all unique categories across all seasons
      const seen = new Set<string>();
      const cats: string[] = [];
      for (const log of logs) {
        if (!seen.has(log.category)) {
          seen.add(log.category);
          cats.push(log.category);
        }
      }
      return cats;
    }

    const seasons = this.gameLogSeasons();
    const activeIdx = this._activeGameLogSeasonIdx();
    const activeSeason = seasons[activeIdx] ?? seasons[0];
    if (!activeSeason) return [];
    return logs.filter((l) => l.season === activeSeason).map((l) => l.category);
  });

  /** The active game log entry (selected season + category, or career aggregate) */
  protected readonly activeGameLog = computed<ProfileSeasonGameLog | null>(() => {
    const logs = this.filteredGameLogs();
    const categories = this.gameLogCategoriesForSeason();
    const catIdx = this._activeGameLogCategoryIdx();
    const activeCategory = categories[catIdx] ?? categories[0];
    if (!activeCategory) return null;

    if (this._isCareerMode()) {
      return this.buildCareerGameLog(logs, activeCategory);
    }

    const seasons = this.gameLogSeasons();
    const seasonIdx = this._activeGameLogSeasonIdx();
    const activeSeason = seasons[seasonIdx] ?? seasons[0];
    if (!activeSeason) return null;

    const seasonLogs = logs.filter((l) => l.season === activeSeason);
    const seasonCatLogs = seasonLogs.filter((l) => l.category === activeCategory);
    return seasonCatLogs[0] ?? null;
  });

  /**
   * In career mode, returns each season's individual game log for the active category.
   * Used to render per-season stat boards inside the career view.
   */
  protected readonly careerSeasonLogs = computed<readonly ProfileSeasonGameLog[]>(() => {
    if (!this._isCareerMode()) return [];
    const logs = this.filteredGameLogs();
    const categories = this.gameLogCategoriesForSeason();
    const catIdx = this._activeGameLogCategoryIdx();
    const activeCategory = categories[catIdx] ?? categories[0];
    if (!activeCategory) return [];
    return logs.filter((l) => l.category === activeCategory);
  });

  /** Sorted game log entries based on current sort state */
  protected readonly sortedGameLogEntries = computed<readonly GameLogEntry[]>(() => {
    const gl = this.activeGameLog();
    if (!gl?.games?.length) return [];

    const key = this._gameLogSortKey();
    const dir = this._gameLogSortDir();
    const games = [...gl.games];

    games.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (key === 'date') {
        aVal = a.date;
        bVal = b.date;
      } else if (key === 'opponent') {
        aVal = a.opponent.toLowerCase();
        bVal = b.opponent.toLowerCase();
      } else if (key === 'result') {
        aVal = a.result;
        bVal = b.result;
      } else {
        aVal = this.parseNumericStatValue(a.stats[key]);
        bVal = this.parseNumericStatValue(b.stats[key]);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal);
      const strB = String(bVal);
      return dir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });

    return games;
  });

  protected onGameLogSeasonChange(idx: number): void {
    this._isCareerMode.set(false);
    this._activeGameLogSeasonIdx.set(idx);
    this._activeGameLogCategoryIdx.set(0);
    this._gameLogSortKey.set('date');
    this._gameLogSortDir.set('asc');
  }

  protected onCareerModeActivate(): void {
    this._isCareerMode.set(true);
    this._activeGameLogCategoryIdx.set(0);
    this._gameLogSortKey.set('date');
    this._gameLogSortDir.set('asc');
  }

  protected onTeamTypeChange(type: 'school' | 'club'): void {
    this._activeTeamType.set(type);
    this._isCareerMode.set(true);
    this._activeGameLogSeasonIdx.set(0);
    this._activeGameLogCategoryIdx.set(0);
    this._gameLogSortKey.set('date');
    this._gameLogSortDir.set('asc');
  }

  protected onGameLogCategoryChange(idx: number): void {
    this._activeGameLogCategoryIdx.set(idx);
    this._gameLogSortKey.set('date');
    this._gameLogSortDir.set('asc');
  }

  protected onGameLogSort(key: string): void {
    if (this._gameLogSortKey() === key) {
      this._gameLogSortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this._gameLogSortKey.set(key);
      this._gameLogSortDir.set(key === 'date' ? 'asc' : 'desc');
    }
  }

  private parseNumericStatValue(raw: string | number | null | undefined): number {
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : 0;
    }

    if (typeof raw !== 'string') return 0;

    const normalized = raw.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** SSR-safe number formatting with commas (no locale dependency) */
  private formatNumberWithCommas(value: number): string {
    const str = Math.round(value).toString();
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Builds a merged career game log for a given category across all seasons.
   * Combines all games, computes career totals, and career per-game averages.
   */
  private buildCareerGameLog(
    allLogs: readonly ProfileSeasonGameLog[],
    category: string
  ): ProfileSeasonGameLog {
    const catLogs = allLogs.filter((l) => l.category === category);
    if (catLogs.length === 0) {
      return {
        season: 'Career',
        category,
        columns: [],
        games: [],
      };
    }

    // Use columns from the most recent season (first entry)
    const columns = catLogs[0].columns;

    // Merge all games from all seasons; prefix date with short year for context
    const allGames: GameLogEntry[] = [];
    for (const log of catLogs) {
      // Extract short year from season label, e.g., "2025-2026" → "'25"
      const shortYear = log.season.slice(2, 4);
      for (const game of log.games) {
        allGames.push({
          ...game,
          date: `${game.date}/${shortYear}`,
        });
      }
    }

    // Compute career totals by summing numeric stat columns
    const totalGames = allGames.length;
    const careerTotalStats: Record<string, string | number> = {};
    const careerAvgStats: Record<string, string | number> = {};

    for (const col of columns) {
      if (col.key === 'PCT') {
        // Completion percentage: recompute from C/ATT if available
        continue;
      }
      if (col.key === 'AVG') {
        // Yards per attempt/carry: recompute after totals
        continue;
      }
      if (col.key === 'LNG') {
        // Longest: take the max across all games
        let maxVal = 0;
        for (const g of allGames) {
          const v = this.parseNumericStatValue(g.stats[col.key]);
          if (v > maxVal) maxVal = v;
        }
        careerTotalStats[col.key] = maxVal;
        careerAvgStats[col.key] = '-';
        continue;
      }

      // Default: sum all game values
      let sum = 0;
      for (const g of allGames) {
        sum += this.parseNumericStatValue(g.stats[col.key]);
      }
      careerTotalStats[col.key] = sum;
      careerAvgStats[col.key] = totalGames > 0 ? Math.round((sum / totalGames) * 10) / 10 : 0;
    }

    // Recompute completion percentage if we have C and ATT
    if (careerTotalStats['C'] !== undefined && careerTotalStats['ATT'] !== undefined) {
      const c = this.parseNumericStatValue(careerTotalStats['C']);
      const att = this.parseNumericStatValue(careerTotalStats['ATT']);
      const pct = att > 0 ? (c / att).toFixed(3) : '.000';
      careerTotalStats['PCT'] = pct;
      careerAvgStats['PCT'] = pct;
    }

    // Recompute YDS-based average (AVG = YDS / ATT or YDS / CAR)
    const ydsTotal = this.parseNumericStatValue(careerTotalStats['YDS']);
    const attTotal = this.parseNumericStatValue(careerTotalStats['ATT'] ?? careerTotalStats['CAR']);
    if (attTotal > 0) {
      const avg = Math.round((ydsTotal / attTotal) * 10) / 10;
      careerTotalStats['AVG'] = avg;
      careerAvgStats['AVG'] = avg;
    }

    // Format YDS total with comma (SSR-safe, no locale dependency)
    if (typeof careerTotalStats['YDS'] === 'number' && careerTotalStats['YDS'] >= 1000) {
      careerTotalStats['YDS'] = this.formatNumberWithCommas(careerTotalStats['YDS']);
    }

    // Build season record summary (e.g., combined W-L across seasons)
    let totalWins = 0;
    let totalLosses = 0;
    for (const log of catLogs) {
      if (log.seasonRecord) {
        const parts = log.seasonRecord.split('-').map((p) => parseInt(p, 10));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          totalWins += parts[0];
          totalLosses += parts[1];
        }
      }
    }
    const careerRecord = `${totalWins}-${totalLosses}`;

    const totals: GameLogSeasonTotals[] = [
      { label: 'Career Totals', stats: careerTotalStats },
      { label: 'Per Game Avg', stats: careerAvgStats },
    ];

    return {
      season: 'Career',
      category,
      columns,
      games: allGames,
      totals,
      seasonRecord: careerRecord,
      verified: catLogs.every((l) => l.verified),
      verifiedBy: catLogs[0].verifiedBy,
    };
  }

  private resolveComparisonAverage(
    stat: AthleticStat,
    playerNumeric: number,
    maxValue: number,
    index: number,
    total: number
  ): number {
    const extendedStat = stat as AthleticStat & {
      readonly nationalAverage?: string | number;
      readonly nationalAvg?: string | number;
      readonly average?: string | number;
      readonly avg?: string | number;
      readonly benchmark?: string | number;
    };

    const explicitAverage =
      extendedStat.nationalAverage ??
      extendedStat.nationalAvg ??
      extendedStat.average ??
      extendedStat.avg ??
      extendedStat.benchmark;

    const parsedExplicit = this.parseNumericStatValue(explicitAverage);
    if (parsedExplicit > 0) return parsedExplicit;

    if (playerNumeric <= 0) return 0;

    const rankFactor = total > 1 ? index / (total - 1) : 0;
    const maxRelativeFloor = maxValue * (0.014 + rankFactor * 0.01);
    const valueBased = playerNumeric * 0.02;

    return Math.max(0, Math.min(playerNumeric, Math.max(maxRelativeFloor, valueBased)));
  }

  private formatComparisonAverage(stat: AthleticStat, value: number): string {
    const hasDecimal = stat.value.includes('.');
    const rounded = hasDecimal ? Math.round(value * 10) / 10 : Math.round(value);
    return `${rounded}${stat.unit ?? ''}`;
  }

  private toBarPercent(value: number, maxValue: number): number {
    if (value <= 0 || maxValue <= 0) return 0;
    const rawPercent = (value / maxValue) * 100;
    return Math.max(3, Math.min(100, rawPercent));
  }

  private startTypewriter(summary: string): void {
    this.clearTypewriterTimer();
    this.typewriterTarget = summary;
    this.isTypewriterRunning = true;
    this.typedAgentXSummary.set('');

    let cursor = 0;

    const step = () => {
      cursor += 1;
      this.typedAgentXSummary.set(summary.slice(0, cursor));

      if (cursor < summary.length) {
        this.typewriterTimer = setTimeout(step, 16);
        return;
      }

      this.isTypewriterRunning = false;
      this._hasPlayedTypewriter.set(true);
      this.typewriterTimer = null;
    };

    this.typewriterTimer = setTimeout(step, 120);
  }

  private clearTypewriterTimer(): void {
    if (this.typewriterTimer !== null) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    const unicode = this.profileUnicode();
    const isOwn = this.isOwnProfile();

    if (unicode) {
      this.profile.loadProfile(unicode, isOwn);
    } else {
      this.profile.loadProfile('me', true);
    }
  }

  ngOnDestroy(): void {
    this.clearTypewriterTimer();
    this.agentXSummaryTypewriterEffectRef.destroy();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as ProfileTabId;
    this.profile.setActiveTab(tabId);
    this.tabChange.emit(tabId);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.profile.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.error('Refresh timed out. Please try again.');
  }

  protected onRetry(): void {
    const unicode = this.profileUnicode();
    if (unicode) {
      this.profile.loadProfile(unicode, this.isOwnProfile());
    } else {
      this.profile.loadProfile('me', true);
    }
  }

  // Header actions
  protected onFollowToggle(): void {
    this.profile.toggleFollow();
  }

  protected onFollowersClick(): void {
    this.logger.debug('Followers click');
  }

  protected onFollowingClick(): void {
    this.logger.debug('Following click');
  }

  protected onEditProfile(): void {
    this.editProfileClick.emit();
  }

  protected onEditTeam(): void {
    this.editTeamClick.emit();
  }

  protected onEditBanner(): void {
    this.logger.debug('Edit banner');
  }

  protected onEditAvatar(): void {
    this.logger.debug('Edit avatar');
  }

  protected onMessageClick(): void {
    this.logger.debug('Message click');
  }

  protected onPinnedVideoClick(): void {
    this.logger.debug('Pinned video click');
  }

  protected onPinVideoClick(): void {
    this.logger.debug('Pin video click');
  }

  protected onStatClick(key: string): void {
    this.logger.debug('Stat click', { key });
  }

  // Post actions
  protected onPostClick(post: ProfilePost): void {
    this.logger.debug('Post click', { postId: post.id });
  }

  // News article actions
  protected onNewsArticleClick(article: NewsArticle): void {
    this.logger.debug('News article click', { articleId: article.id, title: article.title });
  }

  protected onLikePost(post: ProfilePost): void {
    this.logger.debug('Like post', { postId: post.id });
  }

  protected onCommentPost(post: ProfilePost): void {
    this.logger.debug('Comment post', { postId: post.id });
  }

  protected onSharePost(post: ProfilePost): void {
    this.logger.debug('Share post', { postId: post.id });
  }

  protected onPostMenu(post: ProfilePost): void {
    this.logger.debug('Post menu', { postId: post.id });
  }

  protected onLoadMore(): void {
    this.profile.loadMorePosts();
  }

  protected onCreatePost(): void {
    this.createPostClick.emit();
  }

  protected onUploadVideo(): void {
    this.logger.debug('Upload video');
  }

  // Offers
  protected onOfferClick(offer: ProfileOffer): void {
    this.logger.debug('Offer click', { offerId: offer.id });
  }

  protected onAddOffer(): void {
    this.logger.debug('Add offer');
  }

  // Scouting
  protected onScoutReportClick(report: ScoutReport): void {
    this.logger.debug('Scout report click', { reportId: report.id, athlete: report.athlete.name });
  }

  // Stats
  protected onAddStats(): void {
    this.logger.debug('Add stats');
  }

  // Events
  protected onEventClick(event: ProfileEvent): void {
    this.logger.debug('Event click', { eventId: event.id });
  }

  protected onAddEvent(): void {
    this.logger.debug('Add event');
  }

  // Contact
  protected onEditContact(): void {
    this.logger.debug('Edit contact');
  }

  /**
   * Handle menu click — emits output for the web wrapper to handle.
   * (Web app does not use Ionic, so the bottom sheet service is not available.)
   */
  protected onMenuClick(): void {
    this.menuClick.emit();
  }

  // ============================================
  // HELPERS
  // ============================================

  private formatEventMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
  }

  private formatEventDay(dateString: string): string {
    return new Date(dateString).getDate().toString();
  }

  /**
   * Derives a school-year season label (e.g. "2025-2026") from a date string.
   * School-year boundary is August 1: dates Aug–Dec → "YYYY-(YYYY+1)",
   * dates Jan–Jul → "(YYYY-1)-YYYY".
   */
  private getSeasonForDate(dateString: string): string {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed: 0=Jan … 7=Aug … 11=Dec
    if (month >= 7) {
      // Aug (7) through Dec (11) → current year to next year
      return `${year}-${year + 1}`;
    }
    // Jan (0) through Jul (6) → previous year to current year
    return `${year - 1}-${year}`;
  }

  /**
   * Unique season labels derived from schedule events (e.g. ["2025-2026", "2024-2025"]).
   * Most recent season first.
   */
  protected readonly scheduleSeasons = computed<readonly string[]>(() => {
    const events = this.profile.events();
    const gameEvents = events.filter((e) => e.type === 'game' || e.type === 'practice');
    const source = gameEvents.length > 0 ? gameEvents : events;

    const seen = new Set<string>();
    const seasons: string[] = [];
    for (const event of source) {
      const season = this.getSeasonForDate(event.startDate);
      if (!seen.has(season)) {
        seen.add(season);
        seasons.push(season);
      }
    }
    // Sort descending (most recent season first)
    seasons.sort((a, b) => b.localeCompare(a));
    return seasons;
  });

  /**
   * Pre-computed schedule events — filtered by the active season side-tab.
   * Eliminates redundant per-row method calls in template.
   */
  protected readonly scheduleEvents = computed(() => {
    const sorted = [...this.profile.events()].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    const gameSchedule = sorted.filter(
      (event) => event.type === 'game' || event.type === 'practice'
    );
    const base = gameSchedule.length > 0 ? gameSchedule : sorted;

    // Filter by active season tab
    const sideTab = this.activeSideTab();
    if (sideTab.startsWith('season-')) {
      const seasonLabel = sideTab.replace('season-', '');
      return base.filter((event) => this.getSeasonForDate(event.startDate) === seasonLabel);
    }

    // Fallback: show all (shouldn't happen since Career is removed)
    return base;
  });

  protected readonly scheduleRows = computed(() => {
    const events = this.scheduleEvents();
    const user = this.profile.user();
    const ownTeamName = user?.school?.name?.trim() || user?.displayName?.trim() || 'Team';
    const ownTeamLogo = user?.school?.logoUrl || user?.teamAffiliations?.[0]?.logoUrl;
    const now = Date.now();

    return events.map((event) => {
      const matchup = this.resolveMatchup(event, ownTeamName, ownTeamLogo);
      const isPast = new Date(event.startDate).getTime() <= now;

      return {
        event,
        isPast,
        month: this.formatEventMonth(event.startDate),
        day: this.formatEventDay(event.startDate),
        homeTeam: matchup.homeTeam,
        awayTeam: matchup.awayTeam,
        homeLogo: matchup.homeLogo,
        awayLogo: matchup.awayLogo,
        location: event.location || 'Location TBA',
        time: this.resolveTime(event),
        statusLabel: isPast ? 'Completed' : 'Upcoming',
        statusValue: event.result?.trim() || (isPast ? 'No score reported' : 'Scheduled'),
      };
    });
  });

  // ── Awards → Timeline mapping ──

  /** Static empty state config for Awards timeline. */
  protected readonly awardsEmptyState: Partial<TimelineEmptyConfig> = {
    icon: 'trophy',
    title: 'No Awards Yet',
    description: "This athlete hasn't added any awards yet.",
    ownProfileDescription:
      'Add your athletic awards, honors, and recognitions to stand out to college coaches.',
  };

  /** Override timeline dots to show trophy icons instead of defaults. */
  protected readonly awardsDotOverrides: Partial<Record<string, TimelineDotConfig>> = {
    primary: { icon: 'trophy', size: 14 },
    secondary: { icon: 'trophy', size: 12 },
  };

  /**
   * Maps ProfileAward[] → TimelineItem[] for the shared NxtTimelineComponent.
   * Recent awards (current year) render as 'primary' (brand accent),
   * older awards render as 'secondary' (muted).
   */
  protected readonly awardsTimelineItems = computed((): readonly TimelineItem<ProfileAward>[] => {
    const awards = this.profile.awards();
    const currentYear = new Date().getFullYear();

    return awards.map((award) => {
      const year = this.parseAwardYear(award.season);
      const isRecent = year !== null && year >= currentYear - 1;
      const variant = isRecent ? 'primary' : 'secondary';
      const isoDate = year !== null ? `${year}-06-01T00:00:00.000Z` : new Date().toISOString();

      const tags: { label: string; variant: 'primary' | 'secondary' }[] = [];
      if (award.sport) {
        tags.push({ label: award.sport, variant });
      }

      return {
        id: award.id,
        title: award.title,
        subtitle: award.issuer,
        footerLeft: award.sport,
        footerRight: award.season,
        date: isoDate,
        variant,
        badge: { icon: 'trophy', label: 'Award' },
        tags: tags.length > 0 ? tags : undefined,
        data: award,
      };
    });
  });

  /**
   * Parses a year from the award season string.
   * Handles formats like "2025", "June 2025", "2024-2025", etc.
   */
  private parseAwardYear(season?: string): number | null {
    if (!season) return null;
    const allYears = [...season.matchAll(/(\d{4})/g)].map((m) => parseInt(m[1], 10));
    return allYears.length > 0 ? Math.max(...allYears) : null;
  }

  // ── Schedule helpers (private, called only from computed) ──

  private resolveMatchup(
    event: ProfileEvent,
    ownTeamName: string,
    ownTeamLogo: string | undefined
  ): { homeTeam: string; awayTeam: string; homeLogo?: string; awayLogo?: string } {
    const opponentName = this.resolveOpponent(event, ownTeamName);
    const isHome = this.isHomeEvent(event.name, ownTeamName);

    return isHome
      ? {
          homeTeam: ownTeamName,
          awayTeam: opponentName,
          homeLogo: ownTeamLogo,
          awayLogo: event.logoUrl,
        }
      : {
          homeTeam: opponentName,
          awayTeam: ownTeamName,
          homeLogo: event.logoUrl,
          awayLogo: ownTeamLogo,
        };
  }

  private resolveOpponent(event: ProfileEvent, ownTeamName: string): string {
    if (event.opponent?.trim()) return event.opponent.trim();

    const parsed = this.parseMatchupTeams(event.name, ownTeamName);
    return parsed ?? 'Opponent';
  }

  private resolveTime(event: ProfileEvent): string {
    if (event.isAllDay) return 'All day';
    const d = new Date(event.startDate);
    if (Number.isNaN(d.getTime())) return 'Time TBA';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  private isHomeEvent(eventName: string, ownTeamName: string): boolean {
    const name = eventName.toLowerCase();
    if (name.includes(' @ ')) return !name.startsWith(ownTeamName.toLowerCase());
    return true;
  }

  private parseMatchupTeams(eventName: string, ownTeamName: string): string | undefined {
    const cleaned = eventName.trim();
    if (!cleaned) return undefined;

    const separator = cleaned.includes(' vs ')
      ? /\s+vs\.?\s+/i
      : cleaned.includes(' @ ')
        ? /\s+@\s+/i
        : null;
    if (!separator) return undefined;

    const [left, right] = cleaned.split(separator);
    if (!left?.trim() || !right?.trim()) return undefined;

    const leftTeam = left.trim();
    const rightTeam = right.trim();
    const own = ownTeamName.toLowerCase();

    if (leftTeam.toLowerCase() === own) return rightTeam;
    if (rightTeam.toLowerCase() === own) return leftTeam;
    return rightTeam;
  }

  protected readonly traitCategoryLabel = computed(() => {
    const cat = this.profile.playerCard()?.trait?.category;
    if (cat === 'x-factor') return 'X-Factor';
    if (cat === 'hidden') return 'Agent';
    return 'Superstar';
  });

  protected readonly teamAffiliations = computed((): ReadonlyArray<ProfileTeamAffiliation> => {
    const user = this.profile.user();
    if (!user) return [];

    const normalized: ProfileTeamAffiliation[] = [];
    const seen = new Set<string>();

    const pushAffiliation = (affiliation: ProfileTeamAffiliation): void => {
      const name = affiliation.name.trim();
      if (!name) return;

      const type = this.normalizeTeamType(affiliation.type);
      const key = `${name.toLowerCase()}::${type}`;
      if (seen.has(key)) return;

      seen.add(key);
      normalized.push({
        name,
        type,
        logoUrl: affiliation.logoUrl,
        teamCode: affiliation.teamCode,
        location: affiliation.location,
      });
    };

    for (const affiliation of user.teamAffiliations ?? []) {
      pushAffiliation(affiliation);
    }

    if (user.school?.name) {
      pushAffiliation({
        name: user.school.name,
        type: this.normalizeTeamType(user.school.type) || 'high-school',
        logoUrl: user.school.logoUrl,
        teamCode: user.school.teamCode,
        location: user.school.location,
      });
    }

    if (user.collegeTeamName && user.collegeTeamName !== user.school?.name) {
      pushAffiliation({
        name: user.collegeTeamName,
        type: 'college',
      });
    }

    return normalized.slice(0, 2);
  });

  protected readonly playerHistoryAffiliations = computed(
    (): ReadonlyArray<ProfileTeamAffiliation> => {
      const user = this.profile.user();
      if (!user) return [];

      const normalized: ProfileTeamAffiliation[] = [];
      const seen = new Set<string>();

      const pushAffiliation = (affiliation: ProfileTeamAffiliation): void => {
        const name = affiliation.name.trim();
        if (!name) return;

        const type = this.normalizeTeamType(affiliation.type);
        const key = `${name.toLowerCase()}::${type}`;
        if (seen.has(key)) return;

        seen.add(key);
        normalized.push({
          name,
          type,
          logoUrl: affiliation.logoUrl,
          teamCode: affiliation.teamCode,
          location: affiliation.location,
          seasonRecord: affiliation.seasonRecord,
          wins: affiliation.wins,
          losses: affiliation.losses,
          ties: affiliation.ties,
        });
      };

      for (const affiliation of user.teamAffiliations ?? []) {
        pushAffiliation(affiliation);
      }

      if (user.school?.name) {
        pushAffiliation({
          name: user.school.name,
          type: this.normalizeTeamType(user.school.type) || 'high-school',
          logoUrl: user.school.logoUrl,
          teamCode: user.school.teamCode,
          location: user.school.location,
          seasonRecord: user.school.seasonRecord,
          wins: user.school.wins,
          losses: user.school.losses,
          ties: user.school.ties,
        });
      }

      if (user.collegeTeamName && user.collegeTeamName !== user.school?.name) {
        pushAffiliation({
          name: user.collegeTeamName,
          type: 'college',
        });
      }

      return normalized;
    }
  );

  protected teamTypeLabel(type?: ProfileTeamType): string {
    const normalized = this.normalizeTeamType(type);
    return TEAM_TYPE_LABELS[normalized];
  }

  protected teamIconName(type?: ProfileTeamType): IconName {
    const normalized = this.normalizeTeamType(type);
    return TEAM_TYPE_ICONS[normalized];
  }

  protected historySeasonLabel(index: number): string {
    const classYearValue = Number(this.profile.user()?.classYear ?? 0);
    const hasClassYear = Number.isFinite(classYearValue) && classYearValue > 1900;

    if (!hasClassYear) {
      if (index === 0) return 'Current';
      return `Prior ${index}`;
    }

    const endYear = classYearValue - index;
    const startYear = endYear - 1;
    return `${startYear}-${endYear}`;
  }

  protected historyTeamRecord(team: ProfileTeamAffiliation): string | null {
    const directRecord = team.seasonRecord?.trim();
    if (directRecord) return directRecord;

    const wins = this.parseRecordNumber(team.wins);
    const losses = this.parseRecordNumber(team.losses);
    const ties = this.parseRecordNumber(team.ties);

    if (wins === null || losses === null) return null;
    if (ties === null || ties <= 0) return `${wins}-${losses}`;
    return `${wins}-${losses}-${ties}`;
  }

  private parseRecordNumber(value: number | string | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return null;
  }

  protected readonly measurablesProviderUrl = computed(() => {
    const explicitUrl = this.profile.user()?.measurablesVerifiedUrl?.trim();
    if (explicitUrl) return this.ensureAbsoluteUrl(explicitUrl);

    const provider = this.profile.user()?.measurablesVerifiedBy?.trim().toLowerCase() ?? '';
    if (!provider) return null;

    if (provider.includes('rivals')) return 'https://www.rivals.com';
    if (provider.includes('hudl')) return 'https://www.hudl.com';
    if (provider.includes('maxpreps')) return 'https://www.maxpreps.com';
    if (provider.includes('247') || provider.includes('247sports')) return 'https://247sports.com';
    if (provider.includes('on3')) return 'https://www.on3.com';

    return null;
  });

  protected readonly measurablesProviderLogoSrc = computed(() => {
    const host = this.providerHost(this.measurablesProviderUrl());
    return `https://logo.clearbit.com/${host}`;
  });

  protected readonly measurablesProviderLogoFallbackSrc = computed(() => {
    const host = this.providerHost(this.measurablesProviderUrl());
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  });

  protected readonly lastSyncedLabel = computed(() => {
    const updatedAt = this.profile.user()?.updatedAt;
    if (!updatedAt) return 'Never synced';

    const parsed = new Date(updatedAt);
    if (Number.isNaN(parsed.getTime())) return 'Never synced';

    return this.formatRelativeTime(parsed);
  });

  // ============================================
  // SHARED VERIFICATION BANNER — Per-tab/section provider config
  // ============================================

  /**
   * Static provider definitions keyed by name.
   * Each entry holds the display name, URL, and logo sources.
   */
  private static readonly VERIFICATION_PROVIDERS: Readonly<
    Record<
      string,
      {
        readonly displayName: string;
        readonly url: string;
        readonly logoSrc: string;
        readonly fallbackLogoSrc: string;
      }
    >
  > = {
    maxpreps: {
      displayName: 'MaxPreps',
      url: 'https://www.maxpreps.com',
      logoSrc: 'https://logo.clearbit.com/maxpreps.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=maxpreps.com&sz=64',
    },
    prepsports: {
      displayName: 'PrepSports',
      url: 'https://www.prepsports.com',
      logoSrc: 'https://logo.clearbit.com/prepsports.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=prepsports.com&sz=64',
    },
    rivals: {
      displayName: 'Rivals',
      url: 'https://www.rivals.com',
      logoSrc: 'https://logo.clearbit.com/rivals.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=rivals.com&sz=64',
    },
    twitter: {
      displayName: 'Twitter',
      url: 'https://x.com',
      logoSrc: 'https://logo.clearbit.com/x.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=x.com&sz=64',
    },
    transcript: {
      displayName: 'Transcript',
      url: '',
      logoSrc: '',
      fallbackLogoSrc: '',
    },
  };

  /**
   * Mapping of tab (+ optional side-tab for overview) → provider key.
   * If a tab is not listed the banner is hidden.
   */
  private static readonly TAB_VERIFICATION_MAP: Readonly<
    Record<string, string | Readonly<Record<string, string>>>
  > = {
    overview: {
      'player-history': 'rivals',
      awards: 'maxpreps',
      academic: 'transcript',
      contact: 'twitter',
    },
    offers: {
      timeline: 'rivals',
      committed: 'rivals',
      'all-offers': 'rivals',
      interests: 'rivals',
      rankings: 'rivals',
    },
    metrics: 'prepsports',
    stats: 'maxpreps',
    schedule: 'maxpreps',
  };

  /**
   * Resolves the active provider key for the current tab + side-tab.
   * Returns null when the banner should be hidden.
   */
  private readonly _activeProviderKey = computed<string | null>(() => {
    const tab = this.profile.activeTab();
    const entry = ProfileShellWebComponent.TAB_VERIFICATION_MAP[tab];
    if (!entry) return null;

    if (typeof entry === 'string') return entry;

    // Overview sub-sections
    const sideTab = this.activeSideTab();
    return (entry as Readonly<Record<string, string>>)[sideTab] ?? null;
  });

  /** Whether the verification banner is visible for this tab/section. */
  protected readonly showVerificationBanner = computed(() => {
    return this._activeProviderKey() !== null;
  });

  /** Display label for the active provider (e.g. "MaxPreps", "Rivals"). */
  protected readonly verificationProvider = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileShellWebComponent.VERIFICATION_PROVIDERS[key];
    if (provider?.displayName) return provider.displayName;
    return key.charAt(0).toUpperCase() + key.slice(1);
  });

  /** Whether the current section's provider is "verified" (always true when banner is shown). */
  protected readonly isProfileVerified = computed(() => this._activeProviderKey() !== null);

  /** Resolved URL for the current tab's verification provider. */
  protected readonly verificationProviderUrl = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileShellWebComponent.VERIFICATION_PROVIDERS[key];
    return provider?.url || null;
  });

  /** Clearbit logo URL for the current tab's verification provider. */
  protected readonly verificationProviderLogoSrc = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileShellWebComponent.VERIFICATION_PROVIDERS[key];
    return provider?.logoSrc || null;
  });

  /** Google favicon fallback logo URL. */
  protected readonly verificationProviderLogoFallbackSrc = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileShellWebComponent.VERIFICATION_PROVIDERS[key];
    return provider?.fallbackLogoSrc || null;
  });

  /** Fallback favicon used when provider logos fail to load */
  private static readonly FALLBACK_FAVICON_URL =
    'https://www.google.com/s2/favicons?domain=nxt1sports.com&sz=64';

  protected onProviderLogoError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    if (img.dataset['fallbackApplied'] === 'true') {
      img.src = ProfileShellWebComponent.FALLBACK_FAVICON_URL;
      return;
    }

    img.dataset['fallbackApplied'] = 'true';
    img.src = this.measurablesProviderLogoFallbackSrc();
  }

  protected onVerificationBannerLogoError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    if (img.dataset['fallbackApplied'] === 'true') {
      img.src = ProfileShellWebComponent.FALLBACK_FAVICON_URL;
      return;
    }

    img.dataset['fallbackApplied'] = 'true';
    const fallback = this.verificationProviderLogoFallbackSrc();
    img.src = fallback || ProfileShellWebComponent.FALLBACK_FAVICON_URL;
  }

  protected async onSyncNow(): Promise<void> {
    try {
      await this.profile.refresh();
      this.toast.success('Profile synced with Agent X');
    } catch {
      this.toast.error('Sync failed. Please try again.');
    }
  }

  protected archetypeIconName(name: string, fallbackIcon?: string | null): IconName {
    const normalizedName = name.trim().toLowerCase();
    const mappedIcon = ARCHETYPE_TOKEN_ICONS[normalizedName];
    if (mappedIcon) return mappedIcon;

    if (fallbackIcon && fallbackIcon in ICONS) {
      return fallbackIcon as IconName;
    }

    return 'sparkles';
  }

  private ensureAbsoluteUrl(rawUrl: string): string {
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    return `https://${rawUrl}`;
  }

  private providerHost(url: string | null): string {
    if (!url) return 'rivals.com';

    try {
      const parsed = new URL(url);
      return parsed.hostname || 'rivals.com';
    } catch {
      return 'rivals.com';
    }
  }

  private formatRelativeTime(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();

    if (diffMs < 60_000) return 'Just now';

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60) return rtf.format(-minutes, 'minute');

    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 24) return rtf.format(-hours, 'hour');

    const days = Math.round(diffMs / 86_400_000);
    if (days < 30) return rtf.format(-days, 'day');

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private normalizeTeamType(type?: string): ProfileTeamType {
    if (!type) return 'other';

    const normalized = type.trim().toLowerCase();

    if (normalized === 'high-school' || normalized === 'high school' || normalized === 'hs') {
      return 'high-school';
    }
    if (normalized === 'middle-school' || normalized === 'middle school' || normalized === 'ms') {
      return 'middle-school';
    }
    if (normalized === 'club') return 'club';
    if (normalized === 'juco' || normalized === 'junior college') return 'juco';
    if (normalized === 'college') return 'college';
    if (normalized === 'academy') return 'academy';
    if (normalized === 'travel' || normalized === 'travel-team' || normalized === 'travel team') {
      return 'travel';
    }

    return 'other';
  }

  // ============================================
  // CONNECTED ACCOUNTS
  // ============================================

  /** Builds a list of connected social/sport accounts from user.social */
  protected readonly connectedAccountsList = computed(
    (): ReadonlyArray<{
      readonly key: string;
      readonly label: string;
      readonly handle: string;
      readonly icon: string;
      readonly color: string;
      readonly url: string;
    }> => {
      const social = this.profile.user()?.social;
      if (!social) return [];

      const ACCOUNT_DEFS: ReadonlyArray<{
        key: keyof typeof social;
        label: string;
        icon: string;
        color: string;
        urlPrefix: string;
        handlePrefix?: string;
      }> = [
        {
          key: 'twitter',
          label: 'X',
          icon: 'twitter',
          color: 'currentColor',
          urlPrefix: 'https://x.com/',
          handlePrefix: '@',
        },
        {
          key: 'instagram',
          label: 'Instagram',
          icon: 'instagram',
          color: '#E1306C',
          urlPrefix: 'https://instagram.com/',
          handlePrefix: '@',
        },
        {
          key: 'youtube',
          label: 'YouTube',
          icon: 'youtube',
          color: '#FF0000',
          urlPrefix: 'https://youtube.com/@',
          handlePrefix: '',
        },
      ];

      const result: Array<{
        key: string;
        label: string;
        handle: string;
        icon: string;
        color: string;
        url: string;
      }> = [];

      for (const def of ACCOUNT_DEFS) {
        const value = social[def.key];
        if (!value || (typeof value === 'string' && !value.trim())) continue;
        const raw = String(value).trim();
        result.push({
          key: def.key,
          label: def.label,
          handle: def.handlePrefix ? `${def.handlePrefix}${raw}` : raw,
          icon: def.icon,
          color: def.color,
          url: raw.startsWith('http') ? raw : `${def.urlPrefix}${raw}`,
        });
        if (result.length >= 8) break;
      }

      return result;
    }
  );
}
