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
  OnInit,
  AfterViewInit,
  OnDestroy,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import {
  type ProfileTabId,
  type ProfileTab,
  PROFILE_EMPTY_STATES,
  getProfileTabsForUser,
  type ProfileRecruitingActivity,
  type ProfileEvent,
  type ProfileTeamAffiliation,
  type ProfileTeamType,
  type ProfilePost,
  type NewsArticle,
  type ProfileTimelineFilterId,
  type ProfileSeasonGameLog,
  type ScoutReport,
  type ScheduleRow,
  filterScheduleEvents,
  mapProfileEventsToScheduleRows,
  getScheduleSeasons,
  formatSportDisplayName,
} from '@nxt1/core';
// NxtPageHeaderComponent removed — web profile uses shell top nav on mobile and page header in wide layouts
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
import { NxtStateViewComponent } from '../../components/state-view';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtHeaderPortalService } from '../../services/header-portal';
import { NxtModalService } from '../../services/modal';
import { ProfileService } from '../profile.service';
import { type IconName } from '@nxt1/design-tokens/assets/icons';
import {
  NxtBottomSheetService,
  SHEET_PRESETS,
  type BottomSheetAction,
} from '../../components/bottom-sheet';
import { Router } from '@angular/router';
import { NxtPlatformService } from '../../services/platform';
import { AgentXService } from '../../agent-x/agent-x.service';
import { AgentXOperationChatComponent } from '../../agent-x';

import { ProfileTimelineComponent } from '../profile-timeline.component';
import { ProfileSkeletonComponent } from '../profile-skeleton.component';

const ATHLETE_INTEL_NAV_FALLBACK_ITEMS: readonly SectionNavItem[] = [
  { id: 'agent_x_brief', label: 'Agent Overview' },
  { id: 'athletic_measurements', label: 'Measurements' },
  { id: 'season_stats', label: 'Stats' },
  { id: 'recruiting_activity', label: 'Recruiting' },
  { id: 'academic_profile', label: 'Academics' },
  { id: 'awards_honors', label: 'Awards' },
] as const;
import { AthleteIntelComponent } from '../../intel/athlete-intel.component';
import { IntelService } from '../../intel/intel.service';
import { ProfileMobileHeroComponent } from '../components/profile-mobile-hero.component';
import { ProfileVerificationBannerComponent } from '../components/profile-verification-banner.component';
import { ProfileContactComponent } from '../components/profile-contact.component';
import { ProfileGenerationBannerComponent } from '../profile-generation-banner.component';
import { ProfileGenerationStateService } from '../profile-generation-state.service';
import { ProfileScheduleComponent } from '../components/profile-schedule.component';
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
    NxtIconComponent,
    NxtImageComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSectionNavWebComponent,
    NxtImageCarouselComponent,
    NxtStateViewComponent,
    ProfileTimelineComponent,
    ProfileSkeletonComponent,
    AthleteIntelComponent,
    ProfileMobileHeroComponent,
    ProfileVerificationBannerComponent,
    ProfileContactComponent,
    ProfileGenerationBannerComponent,
    ProfileScheduleComponent,
  ],
  template: `
    <!-- Portal: center — Profile name + subtitle teleported into top nav -->
    <ng-template #profilePortalContent>
      <div class="nxt1-header-portal header-portal-profile">
        <button
          type="button"
          class="header-portal-back-btn"
          aria-label="Go back"
          (click)="backClick.emit()"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div class="header-portal-name-block">
          <span class="header-portal-title">{{ desktopTitle() }}</span>
          @if (desktopSubtitle()) {
            <span class="header-portal-subtitle">{{ desktopSubtitle() }}</span>
          }
        </div>
        @if (isOwnProfile()) {
          <div class="nxt1-header-portal__center">
            <button
              type="button"
              class="header-nav-pill"
              (click)="editProfileClick.emit()"
              aria-label="Edit profile"
            >
              <nxt1-icon name="pencil" [size]="13" />
              Edit Profile
            </button>
          </div>
        }
      </div>
    </ng-template>

    <!-- Portal: right — Share + QR icon buttons in top nav (before bell) -->
    <ng-template #profileRightPortalContent>
      <button
        type="button"
        class="nav-action-btn"
        aria-label="Share profile"
        (click)="shareClick.emit()"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
      </button>
      <button
        type="button"
        class="nav-action-btn"
        aria-label="QR code"
        (click)="qrCodeClick.emit()"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3h7v7H3V3z" />
          <path d="M14 3h7v7h-7V3z" />
          <path d="M3 14h7v7H3v-7z" />
          <path d="M14 14h3v3h-3v-3z" />
          <path d="M20 14v3h-3" />
          <path d="M14 20h3v1" />
          <path d="M20 20h1v1" />
        </svg>
      </button>
    </ng-template>

    <main class="profile-main">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <!-- Loading State -->
      @if (profile.isLoading()) {
        <nxt1-profile-skeleton variant="web" />
      }

      <!-- Error State -->
      @else if (profile.error()) {
        <nxt1-state-view
          variant="error"
          title="Failed to load profile"
          [message]="profile.error() || 'We could not load this profile right now.'"
          actionLabel="Try Again"
          actionIcon="refresh"
          (action)="onRetry()"
        />
      }

      <!-- ═══ MADDEN FRANCHISE MODE — SPLIT LAYOUT ═══ -->
      @else if (profile.user()) {
        <div class="madden-stage">
          <!-- ═══ SPLIT: LEFT CONTENT | RIGHT PLAYER IMAGE ═══ -->
          <div class="madden-split">
            <!-- LEFT SIDE: Header + Tabs + Content -->
            <div class="madden-split-left">
              <!-- Mobile hero: profile summary -->
              <nxt1-profile-mobile-hero
                [isOwnProfile]="isOwnProfile()"
                (messageClick)="menuClick.emit()"
              />

              <!-- TOP TAB BAR -->
              <nav class="madden-top-tabs" aria-label="Profile sections">
                <nxt1-option-scroller
                  [options]="tabOptions()"
                  [selectedId]="profile.activeTab()"
                  [config]="{ scrollable: false, stretchToFill: true, showDivider: false }"
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
                  @if (profile.hasMultipleSports() && !profile.isOwnProfile()) {
                    <div class="sport-switcher" role="group" aria-label="Sport profiles">
                      <span class="sport-switcher__title">Sport Profiles</span>
                      <div class="sport-switcher__list">
                        @for (sport of profile.allSports(); track sport.name; let i = $index) {
                          <button
                            type="button"
                            class="sport-switcher__item"
                            [class.sport-switcher__item--active]="profile.activeSportIndex() === i"
                            [attr.aria-selected]="profile.activeSportIndex() === i"
                            [attr.aria-label]="
                              'Switch to ' + formatSportDisplayName(sport.name) + ' profile'
                            "
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
                            <span class="sport-switcher__sport-name">{{
                              formatSportDisplayName(sport.name)
                            }}</span>
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
                    [profileUser]="profile.user()"
                  />

                  <!-- Inline generation banner — shown while Agent X builds the profile -->
                  @if (generation.isGenerating()) {
                    <nxt1-profile-generation-banner
                      (dismissed)="generationDismissed.emit($event)"
                    />
                  }

                  @if (
                    profile.isOwnProfile() &&
                    profile.activeTab() === 'timeline' &&
                    !platform.isMobile()
                  ) {
                    <div class="desktop-intel-action-bar">
                      <button
                        type="button"
                        class="desktop-intel-action-bar__btn"
                        (click)="onAddUpdate()"
                      >
                        <nxt1-icon name="plus" [size]="16" />
                        Add Update
                      </button>
                    </div>
                  }

                  @switch (profile.activeTab()) {
                    @case ('intel') {
                      <nxt1-athlete-intel
                        [userId]="profile.user()!.uid"
                        [isOwnProfile]="profile.isOwnProfile()"
                        [activeSection]="activeSideTab()"
                        (generateClick)="onGenerateIntel()"
                        (resyncClick)="onResyncIntel()"
                        (missingDataAction)="editProfileClick.emit()"
                      />
                    }
                    @case ('timeline') {
                      @if (activeSideTab() === 'schedule') {
                        <!-- Schedule Board: rich game/practice grid view -->
                        <nxt1-profile-schedule [activeSideTab]="activeSideTab()" />
                      } @else {
                        <nxt1-profile-timeline
                          [posts]="profile.filteredPosts()"
                          [polymorphicFeed]="profile.polymorphicTimeline()"
                          [isLoading]="profile.timelineLoading()"
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
                          [emptyCta]="null"
                          (postClick)="onPostClick($event)"
                          (shareClick)="onSharePost($event)"
                          (menuClick)="onPostMenu($event)"
                          (pinClick)="onPostPin($event)"
                          (deleteClick)="onPostDelete($event)"
                          (loadMore)="onLoadMore()"
                        />
                      }
                    }

                    @case ('connect') {
                      <nxt1-profile-contact [activeSection]="activeSideTab()" />
                    }
                  }
                </section>
              </div>
            </div>

            <!-- RIGHT SIDE: Player image + Team info -->
            <div class="madden-split-right">
              <div class="madden-right-stack">
                @if (profile.profileImgs().length > 0) {
                  <div class="carousel-glow-wrap">
                    <div class="carousel-glow-border" aria-hidden="true"></div>
                    <div class="carousel-glow-ambient" aria-hidden="true"></div>
                    <nxt1-image-carousel
                      [images]="profile.profileImgs()"
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
                        (click)="onTeamClick(team)"
                        (keydown.enter)="onTeamClick(team)"
                        (keydown.space)="onTeamClick(team); $event.preventDefault()"
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

        <!-- Projected content (e.g. CTA banner for logged-out users) -->
        <ng-content />
      }

      @if (profile.isOwnProfile() && profile.activeTab() === 'timeline' && platform.isMobile()) {
        <div class="mobile-intel-footer">
          <button
            type="button"
            class="mobile-intel-footer__btn mobile-intel-footer__btn--primary mobile-intel-footer__btn--full"
            (click)="onAddUpdate()"
          >
            Add Update
          </button>
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
        --m-accent-secondary: var(--nxt1-color-secondary, #ffffff);
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

      /* ─── SPLIT LAYOUT: Left content | Right player ─── */
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
      /* ─── HEADER PORTAL — Perplexity-style profile identity in top nav ─── */
      .header-portal-profile {
        gap: 10px;
      }
      .header-portal-back-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary, #ffffff);
        cursor: pointer;
        transition: all 0.15s ease;
        flex-shrink: 0;
        padding: 0;
      }
      .header-portal-back-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: rgba(255, 255, 255, 0.14);
      }
      .header-portal-back-btn:active {
        transform: scale(0.95);
      }
      .header-portal-name-block {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 1px;
      }
      .header-portal-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-portal-subtitle {
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-nav-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex-shrink: 0;
        margin-left: auto;
        padding: 6px 16px;
        appearance: none;
        -webkit-appearance: none;
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }
      .header-nav-pill:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }
      .header-nav-pill:active {
        transform: scale(0.98);
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
        margin-top: 12px;
        margin-bottom: 12px;
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
        padding-top: var(--nxt1-spacing-6, 24px);
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
          margin-top: 4px;
          margin-bottom: 12px;
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
          gap: var(--nxt1-spacing-2, 8px);
          padding-top: 0;
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
          padding: 12px 12px 120px;
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

      /* ─── Desktop Intel Action Bar ─── */
      .desktop-intel-action-bar {
        display: flex;
        justify-content: flex-end;
        padding: 0 0 12px;
      }
      .desktop-intel-action-bar__btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 18px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 700;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
        background: var(--nxt1-color-primary, #d4ff00);
        color: var(--nxt1-color-text-onPrimary, #000);
        transition:
          filter 150ms ease,
          transform 150ms ease;
      }
      .desktop-intel-action-bar__btn:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
      }

      /* ─── Mobile VP Intel Footer ─── */
      .mobile-intel-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        display: flex;
        gap: 8px;
        padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        border-top: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }
      .mobile-intel-footer__btn {
        flex: 1;
        padding: 11px 12px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 700;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
        transition:
          filter 150ms ease,
          transform 150ms ease;
      }
      .mobile-intel-footer__btn:active {
        transform: scale(0.97);
      }
      .mobile-intel-footer__btn--full {
        flex: 1 1 100%;
      }
      .mobile-intel-footer__btn--secondary {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .mobile-intel-footer__btn--primary {
        background: var(--nxt1-color-primary, #d4ff00);
        color: var(--nxt1-color-text-onPrimary, #000);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileShellWebComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileShellWeb');
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly modal = inject(NxtModalService);
  private readonly router = inject(Router);
  protected readonly platform = inject(NxtPlatformService);
  private readonly agentX = inject(AgentXService);
  protected readonly generation = inject(ProfileGenerationStateService);

  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly intel = inject(IntelService);
  protected readonly formatSportDisplayName = formatSportDisplayName;

  // Template refs for portal content
  private readonly profilePortalContent = viewChild<TemplateRef<unknown>>('profilePortalContent');
  private readonly profileRightPortalContent = viewChild<TemplateRef<unknown>>(
    'profileRightPortalContent'
  );

  // ============================================
  // INPUTS
  // ============================================

  /** Current logged-in user info for header avatar */
  readonly currentUser = input<ProfileShellUser | null>(null);

  /** Profile unicode to load (unique identifier for profiles) */
  readonly profileUnicode = input<string>('');

  /** Whether viewing own profile */
  readonly isOwnProfile = input(false);

  /**
   * When true, the shell skips its internal profile.loadProfile() call in ngOnInit.
   * Use when parent component fetches real data and calls loadFromExternalData().
   */
  readonly skipInternalLoad = input(false);

  /** Hide mobile header (when sidebar provides navigation on desktop) */
  readonly hideHeader = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly avatarClick = output<void>();
  readonly backClick = output<void>();
  readonly tabChange = output<ProfileTabId>();
  readonly editProfileClick = output<void>();
  readonly teamClick = output<ProfileTeamAffiliation>();
  readonly shareClick = output<void>();
  readonly copyLinkClick = output<void>();
  readonly menuClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly aiSummaryClick = output<void>();
  readonly retryClick = output<void>();
  readonly generationDismissed = output<'completed' | 'skipped'>();

  // ============================================
  // COMPUTED
  // ============================================

  /**
   * Background variant toggle.
   * - 'modern'   — clean team-color gradient (current default)
   * - 'halftone' — legacy recruiting-card halftone dots
   */

  // Org colors are injected into the document-level CSS custom properties
  // (--team-primary, --team-secondary) by ProfileService.loadFromExternalData()
  // via NxtThemeService.applyOrgTheme().  No per-component computed/inline style needed.

  /** Profile page header title */
  protected readonly desktopTitle = computed(() => {
    const shellUser = this.currentUser();
    const profileUser = this.profile.user();

    const preferredDisplayName =
      profileUser?.displayName?.trim() ||
      `${profileUser?.firstName ?? ''} ${profileUser?.lastName ?? ''}`.trim() ||
      (this.isOwnProfile() ? shellUser?.displayName : null)?.trim() ||
      shellUser?.displayName?.trim() ||
      '';

    return preferredDisplayName || 'Profile';
  });

  /** Profile page header subtitle — position + school */
  protected readonly desktopSubtitle = computed(() => {
    const u = this.profile.user();
    // Use activeSport() instead of primarySport for sport-switching support
    const activeSport = this.profile.activeSport();
    const parts: string[] = [];
    if (activeSport?.position) parts.push(activeSport.position);
    if (u?.school?.name) parts.push(u.school.name);
    if (u?.classYear) parts.push(`Class of ${u.classYear}`);
    return parts.join(' · ') || '';
  });

  /** Mobile hero title — athlete display name. */

  /** Carousel hover overlay subtitle — position, sport, school, class */
  protected readonly carouselOverlaySubtitle = computed(() => {
    const u = this.profile.user();
    if (!u) return '';
    // Use activeSport() instead of primarySport for sport-switching support
    const activeSport = this.profile.activeSport();
    const parts: string[] = [];
    if (activeSport?.position) parts.push(activeSport.position);
    if (activeSport?.name) parts.push(activeSport.name);
    if (u.school?.name) parts.push(u.school.name);
    if (u.classYear) parts.push(`'${u.classYear.slice(-2)}`);
    return parts.join(' · ');
  });

  /** Carousel per-image titles (first image = profile photo, rest = gallery shots) */
  protected readonly carouselOverlayTitles = computed<readonly string[]>(() => {
    const images = this.profile.profileImgs();
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
    const images = this.profile.profileImgs();
    const baseSubtitle = this.carouselOverlaySubtitle();
    const total = images.length;

    return images.map((_, index) => {
      const position = `Photo ${index + 1} of ${total}`;
      return baseSubtitle ? `${baseSubtitle} · ${position}` : position;
    });
  });

  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const badges = this.profile.tabBadges();
    const user = this.profile.user();

    return getProfileTabsForUser(user).map((tab: ProfileTab) => ({
      id: tab.id,
      label: tab.label,
      badge: badges[tab.id as keyof typeof badges] || undefined,
    }));
  });

  protected readonly emptyState = computed(() => {
    const tab = this.profile.activeTab();
    return PROFILE_EMPTY_STATES[tab] || PROFILE_EMPTY_STATES['timeline'];
  });

  protected readonly showActionFooter = computed(
    () => this.profile.isOwnProfile() && this.profile.activeTab() === 'timeline'
  );

  /** Section nav items — contextual to active top tab */
  protected readonly sideTabItems = computed((): SectionNavItem[] => {
    const tab = this.profile.activeTab();
    const intelSections = this.intel.athleteSections();
    const sections: Record<string, SectionNavItem[]> = {
      intel:
        intelSections.length > 0
          ? intelSections.map((section) => ({ id: section.id, label: section.title }))
          : [...ATHLETE_INTEL_NAV_FALLBACK_ITEMS],
      timeline: [
        {
          id: 'all-posts',
          label: 'All Posts',
          badge: this.profile.polymorphicTimeline().length || undefined,
        },
        {
          id: 'pinned',
          label: 'Pinned',
          badge: this.profile.polymorphicTimeline().filter((i) => i.isPinned).length || undefined,
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
                  !!post.thumbnailUrl ||
                  !!post.mediaUrl
              ).length || undefined,
        },
        {
          id: 'metrics',
          label: 'Metrics',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'METRIC').length ||
            undefined,
        },
        {
          id: 'stats',
          label: 'Stats',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'STAT').length ||
            undefined,
        },
        {
          id: 'awards',
          label: 'Awards',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'AWARD').length ||
            undefined,
        },
        {
          id: 'recruiting',
          label: 'Recruiting',
          badge:
            this.profile
              .polymorphicTimeline()
              .filter((i) => i.feedType === 'OFFER' || i.feedType === 'COMMITMENT').length ||
            undefined,
        },
        {
          id: 'schedule',
          label: 'Schedule',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'SCHEDULE').length ||
            undefined,
        },
        {
          id: 'events',
          label: 'Events',
          badge:
            this.profile
              .polymorphicTimeline()
              .filter(
                (i) => i.feedType === 'EVENT' || i.feedType === 'VISIT' || i.feedType === 'CAMP'
              ).length || undefined,
        },
        {
          id: 'news',
          label: 'News',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'NEWS').length ||
            undefined,
        },
      ],
      connect: [
        { id: 'connected', label: 'Accounts' },
        { id: 'contact', label: 'Contact' },
      ],
    };
    return sections[tab] ?? sections['intel'];
  });

  /** Active side tab (first item by default) */
  private readonly _activeSideTab = signal<string>('');
  protected readonly activeSideTab = computed(() => {
    const current = this._activeSideTab();
    const items = this.sideTabItems();
    if (current && items.some((i) => i.id === current)) return current;
    return items[0]?.id ?? '';
  });

  constructor() {
    effect(() => {
      const activeTab = this.profile.activeTab();
      const userId = this.profile.user()?.uid;
      if (activeTab === 'intel' && userId) {
        void this.intel.loadAthleteIntel(userId);
      }
    });
  }

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSideTab.set(event.id);

    // Stats tab parsing moved to ProfileStatsComponent
  }

  /** Map sidebar tab ID → ProfileTimelineFilterId for the timeline component */
  protected readonly timelineFilter = computed<ProfileTimelineFilterId>(() => {
    const sideTab = this.activeSideTab();
    const map: Record<string, ProfileTimelineFilterId> = {
      'all-posts': 'all',
      pinned: 'pinned',
      media: 'media',
      metrics: 'metrics',
      stats: 'stats',
      awards: 'awards',
      news: 'news',
      recruiting: 'recruiting',
      // 'schedule' is handled by nxt1-profile-schedule board, timeline shows 'all' as fallback
      schedule: 'all',
      events: 'events',
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
    if (this.skipInternalLoad()) {
      return; // Parent component handles data loading via loadFromExternalData()
    }
    // Internal data loading is no longer supported.
    // Platform shells must provide data via loadFromExternalData() and set [skipInternalLoad]="true".
    this.logger.warn(
      'ProfileShellWeb: skipInternalLoad is false — use loadFromExternalData() from the platform component.'
    );
  }

  ngAfterViewInit(): void {
    const centerTpl = this.profilePortalContent();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
    const rightTpl = this.profileRightPortalContent();
    if (rightTpl) this.headerPortal.setRightContent(rightTpl);
  }

  ngOnDestroy(): void {
    this.profile.reset();
    this.headerPortal.clearAll();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as ProfileTabId;
    // Reset side-tab on every top-level tab switch so we never land on a
    // stale sub-tab from a different section (mirrors mobile shell behavior).
    this._activeSideTab.set('');
    this.profile.setActiveTab(tabId);
    this.tabChange.emit(tabId);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      // Don't use internal refresh when parent is handling data loading
      if (this.skipInternalLoad()) {
        this.logger.warn('Refresh skipped - parent handles data loading');
        return;
      }
      await this.profile.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.error('Refresh timed out. Please try again.');
  }

  protected onRetry(): void {
    // Emit retry event so parent component can re-fetch from API
    // Don't call loadProfile() here - it uses mock data
    this.retryClick.emit();
  }

  // Header actions
  protected onEditProfile(): void {
    this.editProfileClick.emit();
  }

  protected onTeamClick(team: ProfileTeamAffiliation): void {
    this.teamClick.emit(team);
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

  // News board actions
  protected onNewsBoardItemClick(item: NewsArticle): void {
    this.logger.debug('News board item click', { itemId: item.id, title: item.title });
  }

  protected onSharePost(post: ProfilePost): void {
    this.logger.debug('Share post', { postId: post.id });
  }

  protected onPostMenu(post: ProfilePost): void {
    this.logger.debug('Post menu', { postId: post.id });
  }

  protected async onPostPin(post: ProfilePost): Promise<void> {
    await this.profile.pinPost(post);
  }

  protected async onPostDelete(post: ProfilePost): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: 'Delete Post?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });

    if (!confirmed) return;
    await this.profile.deletePost(post);
  }

  protected onLoadMore(): void {
    this.profile.loadMorePosts();
  }

  protected async onCreatePostWithAgent(): Promise<void> {
    const hasReport = !!this.intel.athleteReport();
    const message = hasReport
      ? 'I want to create a post for my timeline. After creating the post, automatically review it and update any relevant sections of my Agent X Intel report with new stats, achievements, or information from the post.'
      : 'I want to create a post for my timeline.';
    if (this.platform.isMobile()) {
      await this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: 'profile-timeline-post',
          contextTitle: 'Create a Post',
          contextIcon: 'create-outline',
          contextType: 'command',
          initialMessage: message,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
    } else {
      this.agentX.queueStartupMessage(message);
      void this.router.navigate(['/agent-x']);
    }
  }

  protected onAddUpdate(): void {
    void this.onCreatePostWithAgent();
  }

  protected async onGenerateIntel(): Promise<void> {
    const hasReport = !!this.intel.athleteReport();
    const userId = this.profile.user()?.uid ?? '';
    const activeSection = this.activeSideTab();

    const isAthleteSection = [
      'agent_x_brief',
      'athletic_measurements',
      'season_stats',
      'recruiting_activity',
      'academic_profile',
      'awards_honors',
    ].includes(activeSection);

    const initialMessage =
      hasReport && isAthleteSection
        ? `Update the ${activeSection} section of my Agent X Intel report.`
        : hasReport
          ? `Update my Agent X Intel report.`
          : `Generate my Agent X Intel report.`;
    if (this.platform.isMobile()) {
      this.intel.startPendingGeneration();
      await this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: 'profile-intel-generate',
          contextTitle: hasReport ? 'Update Intel' : 'Generate Intel',
          contextIcon: 'flash-outline',
          contextType: 'command',
          initialMessage,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
      if (!this.intel.isAnythingGenerating()) {
        await this.intel.generateAthleteIntel(userId);
      }
    } else {
      this.agentX.queueStartupMessage(initialMessage);
      void this.router.navigate(['/agent-x']);
    }
  }

  protected async onResyncIntel(): Promise<void> {
    const userId = this.profile.user()?.uid ?? '';
    const message = `Do a full resync of my Agent X Intel report. Gather all current data and regenerate the entire report from scratch.`;
    if (this.platform.isMobile()) {
      this.intel.startPendingGeneration();
      await this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: 'profile-intel-resync',
          contextTitle: 'Resync Intel',
          contextIcon: 'refresh-outline',
          contextType: 'command',
          initialMessage: message,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
      if (!this.intel.isAnythingGenerating()) {
        await this.intel.generateAthleteIntel(userId);
      }
    } else {
      this.agentX.queueStartupMessage(message);
      void this.router.navigate(['/agent-x']);
    }
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

  // Rankings
  protected onAddRanking(): void {
    this.logger.debug('Add ranking');
  }

  // Scouting
  protected onScoutReportClick(report: ScoutReport): void {
    this.logger.debug('Scout report click', { reportId: report.id, athlete: report.athlete.name });
  }

  protected onAddScoutReport(): void {
    this.logger.debug('Add scout report');
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

  protected onAddNews(): void {
    this.logger.debug('Add news');
  }

  /**
   * Handle menu click — opens a bottom sheet with profile actions.
   */
  protected async onMenuClick(): Promise<void> {
    const isOwn = this.isOwnProfile();

    const actions: BottomSheetAction[] = isOwn
      ? [
          { label: 'Share Profile', role: 'primary', icon: 'share' },
          { label: 'QR Code', role: 'secondary', icon: 'qrCode' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
        ]
      : [
          { label: 'Share Profile', role: 'primary', icon: 'share' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
          { label: 'Report', role: 'destructive', icon: 'flag' },
        ];

    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Profile Actions',
      actions,
      backdropDismiss: true,
      ...SHEET_PRESETS.HALF,
    });

    const selected = result?.data as BottomSheetAction | undefined;
    if (!selected) return;

    switch (selected.label) {
      case 'Share Profile':
        this.shareClick.emit();
        break;
      case 'QR Code':
        this.qrCodeClick.emit();
        break;
      case 'Copy Link':
        this.copyLinkClick.emit();
        break;
      default:
        this.menuClick.emit();
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Unique season labels derived from schedule events (e.g. ["2025-2026", "2024-2025"]).
   * Most recent season first. Delegates to pure @nxt1/core helper.
   */
  protected readonly scheduleSeasons = computed<readonly string[]>(() =>
    getScheduleSeasons(this.profile.events())
  );

  /**
   * Maps ProfileEvent[] → ScheduleRow[] for the ScheduleBoardComponent.
   * Filters by active season tab and delegates mapping to @nxt1/core helpers.
   */
  protected readonly profileScheduleRows = computed<readonly ScheduleRow[]>(() => {
    const sideTab = this.activeSideTab();
    const seasonLabel = sideTab.startsWith('season-') ? sideTab.replace('season-', '') : undefined;
    const events = filterScheduleEvents(this.profile.events(), seasonLabel);

    const user = this.profile.user();
    return mapProfileEventsToScheduleRows(events, {
      teamName: user?.school?.name?.trim() || user?.displayName?.trim() || 'Team',
      teamLogo: user?.school?.logoUrl || user?.teamAffiliations?.[0]?.logoUrl,
    });
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

  // ── News board items ──

  /** News articles from the dedicated news sub-collection (real API data). */
  protected readonly newsBoardItems = computed(() => this.profile.newsArticles());

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

  protected readonly primaryRailTeam = computed((): ProfileTeamAffiliation | null => {
    const existing = this.teamAffiliations()[0];
    if (existing) return existing;

    const user = this.profile.user();
    if (!user) return null;

    const schoolName = user.school?.name?.trim() || user.collegeTeamName?.trim();
    if (schoolName) {
      return {
        name: schoolName,
        type: this.normalizeTeamType(user.school?.type) || 'other',
        logoUrl: user.school?.logoUrl,
        teamCode: user.school?.teamCode,
        location: user.school?.location,
      };
    }

    const sportName = this.profile.activeSport()?.name?.trim();
    if (sportName) {
      return {
        name: `${formatSportDisplayName(sportName)} Organization`,
        type: 'other',
        location: user.classYear ? `Class of ${user.classYear}` : undefined,
      };
    }

    return {
      name: 'Organization',
      type: 'other',
      location: user.classYear ? `Class of ${user.classYear}` : undefined,
    };
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
