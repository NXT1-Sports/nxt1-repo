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
  OnInit,
} from '@angular/core';
import {
  type ProfileTabId,
  type ProfileTab,
  PROFILE_TABS,
  PROFILE_EMPTY_STATES,
  type ProfileRecruitingActivity,
  type ProfileEvent,
  type ProfileTeamAffiliation,
  type ProfileTeamType,
  type NewsArticle,
  type ProfilePost,
  type ProfileTimelineFilterId,
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
import { type IconName } from '@nxt1/design-tokens/assets/icons';

import { ProfileTimelineComponent } from '../profile-timeline.component';
import { ProfileOffersComponent } from '../profile-offers.component';
import { ProfileRankingsComponent } from '../rankings/profile-rankings.component';
import { ProfileEventsComponent } from '../profile-events.component';
import { ProfileSkeletonComponent } from '../profile-skeleton.component';
import { ProfileNewsWebComponent } from './profile-news-web.component';
import { ProfileScoutingWebComponent } from './profile-scouting-web.component';
import { ProfileOverviewWebComponent } from './profile-overview-web.component';
import { ProfileMobileHeroComponent } from './profile-mobile-hero.component';
import { ProfileVerificationBannerComponent } from './profile-verification-banner.component';
import { ProfileStatsWebComponent } from './profile-stats-web.component';
import { ProfileScheduleWebComponent } from './profile-schedule-web.component';
import { ProfileContactWebComponent } from './profile-contact-web.component';
import { ProfileAcademicWebComponent } from './profile-academic-web.component';
import { ProfileMetricsWebComponent } from './profile-metrics-web.component';
import { MOCK_SCOUT_REPORTS } from '../../scout-reports/scout-reports.mock-data';
import type { ProfileShellUser } from '../profile-shell.component';

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

@Component({
  selector: 'nxt1-profile-shell-web',
  standalone: true,
  imports: [
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
    ProfileSkeletonComponent,
    ProfileNewsWebComponent,
    ProfileScoutingWebComponent,
    ProfileOverviewWebComponent,
    ProfileMobileHeroComponent,
    ProfileVerificationBannerComponent,
    ProfileStatsWebComponent,
    ProfileScheduleWebComponent,
    ProfileContactWebComponent,
    ProfileAcademicWebComponent,
    ProfileMetricsWebComponent,
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
              <div class="madden-header-top-pad hidden md:block">
                <nxt1-profile-page-header
                  [user]="profile.user()"
                  [playerCard]="null"
                  [showFollowAction]="!isOwnProfile()"
                  (back)="backClick.emit()"
                  (follow)="followClick.emit()"
                />
              </div>

              <!-- Mobile hero: profile summary -->
              <nxt1-profile-mobile-hero
                [isOwnProfile]="isOwnProfile()"
                (followClick)="followClick.emit()"
              />

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
                            class="sport-switcher__item capitalize"
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
                  <!-- Shared verification banner -->
                  <nxt1-profile-verification-banner
                    [activeTab]="profile.activeTab()"
                    [activeSideTab]="activeSideTab()"
                  />

                  @switch (profile.activeTab()) {
                    @case ('overview') {
                      <nxt1-profile-overview-web
                        [activeSideTab]="activeSideTab()"
                        (editProfileClick)="editProfileClick.emit()"
                        (editTeamClick)="editTeamClick.emit()"
                      />
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
                        [userId]="profile.user()?.uid ?? null"
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
                      <nxt1-profile-metrics-web [activeSideTab]="activeSideTab()" />
                    }

                    @case ('stats') {
                      <nxt1-profile-stats-web />
                    }
                    @case ('academic') {
                      <nxt1-profile-academic-web (editProfileClick)="editProfileClick.emit()" />
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
                      <nxt1-profile-schedule-web [activeSideTab]="activeSideTab()" />
                    }

                    @case ('contact') {
                      <nxt1-profile-contact-web />
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
        overflow-x: hidden;
        overflow-y: auto;
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
        overflow-x: hidden;
        overflow-y: auto;
        padding-top: 0;
        /* Flex column prevents the empty <nxt-refresher> host element
           from creating an anonymous line box (~20px) that pushes
           content down.  Matches shell__content's flex layout. */
        display: flex;
        flex-direction: column;
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
        min-height: calc(100vh - 64px);
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
      .madden-header-top-pad {
        padding-top: 20px;
      }
      .madden-right-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 300px;
        height: auto;
        padding-top: 20px;
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
      .madden-team-location {
        font-size: 12px;
        color: var(--m-text-3);
      }

      /* ─── TOP TAB BAR ─── */
      .madden-top-tabs {
        /* Align with the content-layer grid start (same left offset
           as the section-nav column) */
        padding: 0 8px;
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
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
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        gap: var(--nxt1-spacing-6, 24px);
        align-items: stretch;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding-top: var(--nxt1-spacing-2, 8px);
        /* Re-introduce shell content padding so section-nav aligns
           with /explore, /help-center, /usage — the profile wrapper
           cancels shell padding for full-bleed hero, this puts the
           content grid back at the standard content start line. */
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
      }

      /* ─── SECTION NAV HOST — constrain width ─── */
      .madden-side-nav-column {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        align-self: stretch;
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

      .madden-side-nav-column ::ng-deep .nav-group-header {
        text-transform: none;
        letter-spacing: normal;
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
        height: 100%;
        min-height: 0;
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

      /* ─── RESPONSIVE ─── */
      @media (max-width: 1024px) {
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
        .madden-top-tabs {
          padding-left: 8px;
        }
        .madden-top-tabs ::ng-deep .option-scroller--scrollable.option-scroller--md {
          --scroller-padding: 8px;
        }

        /* — Badge orb grid — */
        :host {
          height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          max-width: 100vw;
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
          overflow-x: hidden;
          overflow-y: visible;
          display: block;
          max-width: 100%;
        }
        .madden-stage {
          height: auto;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: visible;
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
          max-width: 100%;
          overflow-x: hidden;
          overflow-y: visible;
        }
        .madden-content-layer {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto;
          gap: var(--nxt1-spacing-4, 16px);
          padding-top: 12px;
          padding-left: 0;
          min-height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          max-width: 100%;
          width: 100%;
        }
        .madden-side-nav-column {
          display: contents;
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
        .madden-side-nav-column > nxt1-section-nav-web {
          order: 0;
          width: calc(100% - 24px);
          margin-inline: 12px;
        }
        .madden-content-scroll {
          order: 2;
          height: auto;
          min-height: 0;
          width: 100%;
          max-width: 100%;
          max-height: none;
          overflow-y: visible;
          overflow-x: hidden;
          padding: 0 12px 24px;
          align-items: stretch;
          scrollbar-gutter: auto;
          box-sizing: border-box;
        }
        .madden-content-scroll > * {
          max-width: none;
        }
        .madden-split-right {
          display: none;
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
        /* Sport switcher: horizontal scroll on mobile — positioned above section nav */
        .sport-switcher {
          display: none;
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
export class ProfileShellWebComponent implements OnInit {
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileShellWeb');

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

  /**
   * When true, the shell skips its internal `profile.loadProfile()` call in ngOnInit.
   *
   * Use this when the parent component (e.g., web `ProfileComponent`) fetches real
   * profile data from a platform-specific API service and pushes it into the shared
   * `ProfileService` state via `loadFromExternalData()`.
   *
   * This prevents the shell from overwriting real data with mock data.
   */
  readonly skipInternalLoad = input(false);

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

  /** Look up the empty-state config for a specific tab, regardless of which tab is active.
   *  Use this inside the overview sidebar sub-panels (academic, contact, etc.) where
   *  emptyState() would return the 'overview' config instead. */
  protected emptyStateFor(tab: ProfileTabId) {
    return PROFILE_EMPTY_STATES[tab];
  }

  protected readonly displayAgentXSummary = computed(() => {
    const summary = this.profile.playerCard()?.agentXSummary?.trim() ?? '';
    return summary;
  });

  // TYPEWRITER EFFECT DISABLED - Code removed during conflict resolution
  // Re-enable after implementing missing properties:
  // - _hasPlayedTypewriter, typedAgentXSummary, clearTypewriterTimer
  // - typewriterTarget, isTypewriterRunning, startTypewriter

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
              {
                id: 'school-career',
                label: 'Career',
                group: this.schoolStatsTeamName(),
              },
              ...this.schoolSeasons().map((s) => ({
                id: `school-season-${s}`,
                label: s,
                group: this.schoolStatsTeamName(),
              })),
            ]
          : []),
        ...(this.hasClubGameLogs()
          ? [
              {
                id: 'club-career',
                label: 'Career',
                group: this.clubStatsTeamName(),
              },
              ...this.clubSeasons().map((s) => ({
                id: `club-season-${s}`,
                label: s,
                group: this.clubStatsTeamName(),
              })),
            ]
          : []),
      ],
      schedule: [
        ...this.scheduleSeasons().map((s) => ({
          id: `season-${s}`,
          label: s,
          group: this.scheduleTeamName(),
        })),
      ],
      news: [
        { id: 'all-news', label: 'All News' },
        { id: 'announcements', label: 'Announcements' },
        { id: 'media-mentions', label: 'Media Mentions' },
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

    // Stats tab parsing moved to ProfileStatsWebComponent
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

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // When skipInternalLoad is true, the parent component is responsible for
    // fetching real profile data and pushing it into ProfileService via
    // loadFromExternalData(). The shell will react to the signal update
    // automatically. Calling loadProfile() here would overwrite real data
    // with mock data.
    if (this.skipInternalLoad()) {
      return;
    }

    const unicode = this.profileUnicode();
    const isOwn = this.isOwnProfile();

    if (unicode) {
      this.profile.loadProfile(unicode, isOwn);
    } else {
      this.profile.loadProfile('me', true);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as ProfileTabId;
    this.profile.setActiveTab(tabId);
    this.tabChange.emit(tabId);
    // Reset sidebar selection so the new tab's first item becomes active
    this._activeSideTab.set('');
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
  protected onOfferClick(offer: ProfileRecruitingActivity): void {
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

  // ── Game log season/team helpers (used by sideTabItems) ──

  /** Whether school-type game logs exist. */
  protected readonly hasSchoolGameLogs = computed(() =>
    this.profile.gameLog().some((gl: ProfileSeasonGameLog) => gl.teamType === 'school')
  );

  /** Whether club-type game logs exist. */
  protected readonly hasClubGameLogs = computed(() =>
    this.profile.gameLog().some((gl: ProfileSeasonGameLog) => gl.teamType === 'club')
  );

  /** Extract unique season labels from a filtered set of game logs. */
  private getUniqueSeasons(logs: readonly ProfileSeasonGameLog[]): readonly string[] {
    const seen = new Set<string>();
    const seasons: string[] = [];
    for (const log of logs) {
      const label = log.season?.trim();
      if (label && !seen.has(label)) {
        seen.add(label);
        seasons.push(label);
      }
    }
    return seasons;
  }

  /** Season labels for school game logs. */
  private readonly schoolSeasons = computed<readonly string[]>(() => {
    const schoolLogs = this.profile
      .gameLog()
      .filter((gl: ProfileSeasonGameLog) => gl.teamType === 'school');
    return this.getUniqueSeasons(schoolLogs);
  });

  /** Display name for school stats sidebar group. */
  private readonly schoolStatsTeamName = computed(() => {
    const user = this.profile.user();
    const schoolName = user?.school?.name?.trim();
    if (schoolName) return schoolName;
    const firstTeam = user?.teamAffiliations?.find((a) => a.name?.trim())?.name?.trim();
    return firstTeam ?? user?.displayName?.trim() ?? 'School';
  });

  /** Season labels for club game logs. */
  private readonly clubSeasons = computed<readonly string[]>(() => {
    const clubLogs = this.profile
      .gameLog()
      .filter((gl: ProfileSeasonGameLog) => gl.teamType === 'club');
    return this.getUniqueSeasons(clubLogs);
  });

  /** Display name for club stats sidebar group. */
  private readonly clubStatsTeamName = computed(() => {
    const user = this.profile.user();
    const clubTeam = user?.teamAffiliations?.find(
      (a) => a.type?.toLowerCase() === 'club' && a.name?.trim()
    );
    return clubTeam?.name?.trim() ?? 'Club';
  });

  /** Display name for schedule sidebar group. */
  private readonly scheduleTeamName = computed(() => {
    const user = this.profile.user();
    const schoolName = user?.school?.name?.trim();
    if (schoolName) return schoolName;
    const firstTeamName = user?.teamAffiliations
      ?.find((affiliation) => affiliation.name?.trim())
      ?.name?.trim();
    if (firstTeamName) return firstTeamName;
    return user?.displayName?.trim() || 'Team';
  });

  // ── Team affiliations ──

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

  protected teamTypeLabel(type?: ProfileTeamType): string {
    const normalized = this.normalizeTeamType(type);
    return TEAM_TYPE_LABELS[normalized];
  }

  protected teamIconName(type?: ProfileTeamType): IconName {
    const normalized = this.normalizeTeamType(type);
    return TEAM_TYPE_ICONS[normalized];
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
}
